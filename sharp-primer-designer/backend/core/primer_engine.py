"""Primer design engine wrapping primer3-py.

primer3 uses 0-indexed positions internally.
All positions are converted to 1-indexed at this layer before returning PrimerResult.
"""

from __future__ import annotations

from datetime import datetime, timezone

import primer3

from .models import (
    AmpliconConstraints,
    ConditionProfile,
    DesignMetadata,
    OffTargetAmplicon,
    PairConstraints,
    PairResult,
    PrimerConstraints,
    PrimerResult,
    ReactionConditions,
    SpecificityConfig,
    TemplateInfo,
    TmGrid,
)
from .tm_analysis import (
    analyze_pair_thermo,
    analyze_primer_thermo,
    compute_tm_diff_grid,
    compute_tm_grid,
)
from .blast_screen import (
    blast_version,
    check_pair_off_target_amplicons,
    screen_primer,
)


def _primer3_version() -> str:
    try:
        return primer3.__version__
    except AttributeError:
        return "unknown"


def _gc_percent(seq: str) -> float:
    seq = seq.upper()
    gc = sum(1 for b in seq if b in "GC")
    return round(100 * gc / len(seq), 1) if seq else 0.0


def design_primers(
    template_seq: str,
    template_info: TemplateInfo,
    target_region: tuple[int, int] | None,  # (start_0indexed, length)
    excluded_regions: list[tuple[int, int]] | None,
    primer_constraints: PrimerConstraints,
    pair_constraints: PairConstraints,
    amplicon_constraints: AmpliconConstraints,
    reaction_conditions: ReactionConditions,
    all_profiles: list[ConditionProfile],
    specificity: SpecificityConfig,
    num_return: int = 10,
    overshoot_factor: int = 3,
    on_progress=None,  # Optional[Callable[[str, str, float], None]]
) -> tuple[list[PairResult], DesignMetadata]:
    """Run the full primer design pipeline.

    1. Find primary profile
    2. Call primer3.design_primers() with overshoot
    3. For each candidate: compute Tm grid + thermodynamics
    4. If BLAST enabled: screen and filter off-target pairs
    5. Re-rank by penalty score, return top num_return
    """
    def _progress(step: str, message: str, pct: float):
        if on_progress:
            on_progress(step, message, pct)

    primary = _get_primary_profile(all_profiles, reaction_conditions.primary_profile_id)
    active_profile_ids = {reaction_conditions.primary_profile_id} | set(
        reaction_conditions.additional_profile_ids
    )
    active_profiles = [p for p in all_profiles if p.id in active_profile_ids]

    # ── primer3 call ──────────────────────────────────────────────────────────
    seq_args: dict = {"SEQUENCE_TEMPLATE": template_seq}
    if target_region:
        seq_args["SEQUENCE_TARGET"] = [list(target_region)]
    if excluded_regions:
        seq_args["SEQUENCE_EXCLUDED_REGION"] = [list(r) for r in excluded_regions]

    global_args: dict = {
        "PRIMER_MIN_SIZE": primer_constraints.length_min,
        "PRIMER_OPT_SIZE": primer_constraints.length_opt,
        "PRIMER_MAX_SIZE": primer_constraints.length_max,
        "PRIMER_MIN_TM": primer_constraints.tm_min,
        "PRIMER_OPT_TM": primer_constraints.tm_opt,
        "PRIMER_MAX_TM": primer_constraints.tm_max,
        "PRIMER_MIN_GC": primer_constraints.gc_min,
        "PRIMER_OPT_GC_PERCENT": primer_constraints.gc_opt,
        "PRIMER_MAX_GC": primer_constraints.gc_max,
        "PRIMER_MAX_SELF_ANY_TH": primer_constraints.max_self_complementarity,
        "PRIMER_MAX_SELF_END_TH": primer_constraints.max_self_end_complementarity,
        "PRIMER_MAX_HAIRPIN_TH": primer_constraints.max_hairpin_th,
        "PRIMER_PAIR_MAX_DIFF_TM": pair_constraints.max_tm_diff,
        "PRIMER_PAIR_MAX_COMPL_ANY_TH": pair_constraints.max_pair_complementarity,
        "PRIMER_PAIR_MAX_COMPL_END_TH": pair_constraints.max_pair_end_complementarity,
        "PRIMER_PRODUCT_SIZE_RANGE": [[
            amplicon_constraints.size_min,
            amplicon_constraints.size_max,
        ]],
        "PRIMER_PRODUCT_OPT_SIZE": amplicon_constraints.size_opt,
        "PRIMER_MAX_POLY_X": primer_constraints.max_poly_x,
        "PRIMER_SALT_MONOVALENT": primary.na_mm + primary.k_mm,
        "PRIMER_SALT_DIVALENT": primary.mg_mm,
        "PRIMER_DNTP_CONC": primary.dntps_mm,
        "PRIMER_DNA_CONC": primary.primer_nm,
        "PRIMER_TM_FORMULA": 1,       # SantaLucia 1998
        "PRIMER_SALT_CORRECTIONS": 1,  # SantaLucia 1998
        "PRIMER_NUM_RETURN": num_return * overshoot_factor,
    }

    _progress("primer3", "Running primer3...", 10)
    p3_result = primer3.design_primers(seq_args, global_args)

    num_pairs_found = p3_result.get("PRIMER_PAIR_NUM_RETURNED", 0)
    _progress("primer3", f"primer3 returned {num_pairs_found} candidate pair(s)", 20)

    # ── post-process each candidate ───────────────────────────────────────────
    candidates: list[tuple[float, PairResult]] = []  # (penalty, pair)

    for i in range(num_pairs_found):
        if num_pairs_found > 0:
            pct = 20 + 30 * (i / num_pairs_found)
            _progress("tm_grid", f"Computing Tm grids ({i + 1}/{num_pairs_found})...", pct)
        fwd_seq = p3_result.get(f"PRIMER_LEFT_{i}_SEQUENCE", "")
        rev_seq = p3_result.get(f"PRIMER_RIGHT_{i}_SEQUENCE", "")
        if not fwd_seq or not rev_seq:
            continue

        penalty = float(p3_result.get(f"PRIMER_PAIR_{i}_PENALTY", 0.0))

        # primer3 gives (start_0indexed, length) for left, (end_0indexed, length) for right
        fwd_pos = p3_result.get(f"PRIMER_LEFT_{i}", [0, len(fwd_seq)])
        rev_pos = p3_result.get(f"PRIMER_RIGHT_{i}", [0, len(rev_seq)])

        # Convert to 1-indexed inclusive positions
        fwd_start_1 = fwd_pos[0] + 1
        fwd_end_1 = fwd_pos[0] + fwd_pos[1]
        rev_end_1 = rev_pos[0] + 1          # primer3 right: end position (0-indexed)
        rev_start_1 = rev_pos[0] - rev_pos[1] + 2  # start of right primer

        amplicon_size = p3_result.get(f"PRIMER_PAIR_{i}_PRODUCT_SIZE", 0)

        # Tm grid + thermodynamics
        fwd_tm_grid = compute_tm_grid(fwd_seq, active_profiles)
        rev_tm_grid = compute_tm_grid(rev_seq, active_profiles)
        fwd_thermo = analyze_primer_thermo(fwd_seq, primary)
        rev_thermo = analyze_primer_thermo(rev_seq, primary)
        pair_thermo = analyze_pair_thermo(fwd_seq, rev_seq, primary)
        tm_diff = compute_tm_diff_grid(fwd_tm_grid, rev_tm_grid)

        fwd_result = PrimerResult(
            sequence=fwd_seq,
            start=fwd_start_1,
            end=fwd_end_1,
            length=len(fwd_seq),
            gc_percent=_gc_percent(fwd_seq),
            tm_grid=fwd_tm_grid,
            blast_hits=[],
            **fwd_thermo,
        )
        rev_result = PrimerResult(
            sequence=rev_seq,
            start=rev_start_1,
            end=rev_end_1,
            length=len(rev_seq),
            gc_percent=_gc_percent(rev_seq),
            tm_grid=rev_tm_grid,
            blast_hits=[],
            **rev_thermo,
        )
        pair = PairResult(
            rank=i + 1,
            penalty_score=round(penalty, 4),
            forward=fwd_result,
            reverse=rev_result,
            amplicon_size=amplicon_size,
            tm_diff=tm_diff,
            specificity_status="not_screened",
            off_target_amplicons=[],
            **pair_thermo,
        )
        candidates.append((penalty, pair))

    total_candidates = len(candidates)
    filtered_by_blast = 0
    blast_warning = False

    # ── BLAST screening ───────────────────────────────────────────────────────
    if specificity.enabled and specificity.genome_ids:
        _progress("blast", f"BLAST screening {total_candidates} candidate(s)...", 55)
        passing: list[tuple[float, PairResult]] = []
        for blast_i, (penalty, pair) in enumerate(candidates):
            if total_candidates > 0:
                pct = 55 + 35 * (blast_i / total_candidates)
                _progress("blast", f"BLAST screening pair {blast_i + 1}/{total_candidates}...", pct)
            all_fwd_hits = []
            all_rev_hits = []
            for genome_id in specificity.genome_ids:
                all_fwd_hits += screen_primer(
                    pair.forward.sequence,
                    genome_id,
                    evalue=specificity.evalue_threshold,
                    min_alignment_length=specificity.min_alignment_length,
                )
                all_rev_hits += screen_primer(
                    pair.reverse.sequence,
                    genome_id,
                    evalue=specificity.evalue_threshold,
                    min_alignment_length=specificity.min_alignment_length,
                )

            off_targets = check_pair_off_target_amplicons(
                all_fwd_hits,
                all_rev_hits,
                max_amplicon_size=amplicon_constraints.size_max * 4,
                expected_amplicon_size=pair.amplicon_size,
            )

            pair.forward.blast_hits = all_fwd_hits
            pair.reverse.blast_hits = all_rev_hits
            pair.off_target_amplicons = off_targets

            if len(off_targets) <= specificity.max_off_targets:
                pair.specificity_status = "pass"
                passing.append((penalty, pair))
            else:
                pair.specificity_status = "fail"
                filtered_by_blast += 1

        if total_candidates > 0 and filtered_by_blast > (2 * total_candidates // 3):
            blast_warning = True

        candidates = passing

    _progress("ranking", "Ranking results...", 95)
    # ── Re-rank and trim ──────────────────────────────────────────────────────
    candidates.sort(key=lambda x: x[0])
    top = candidates[:num_return]
    pairs = []
    for rank, (_, pair) in enumerate(top, start=1):
        pair.rank = rank
        pairs.append(pair)

    metadata = DesignMetadata(
        primer3_version=_primer3_version(),
        blast_version=blast_version() if specificity.enabled else None,
        total_candidates_screened=total_candidates,
        filtered_by_blast=filtered_by_blast,
        blast_coverage_warning=blast_warning,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )

    return pairs, metadata


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _get_primary_profile(
    profiles: list[ConditionProfile],
    primary_id: str,
) -> ConditionProfile:
    for p in profiles:
        if p.id == primary_id:
            return p
    # Fall back to first profile, then hardcoded default
    return profiles[0] if profiles else ConditionProfile(
        id="default", name="Default", na_mm=50.0, mg_mm=2.0
    )
