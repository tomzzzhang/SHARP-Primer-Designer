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
    calc_hit_tm,
    check_pair_off_target_amplicons,
    filter_hits_by_tm,
    screen_primers_batch,
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


def _apply_diversity_filter(
    candidates: list[tuple[float, PairResult]],
    mode: str,
    num_return: int,
    template_length: int = 0,
) -> list[tuple[float, PairResult]]:
    """Filter candidates for positional diversity.

    Always deduplicates by primer sequence first — never returns the same
    forward or reverse sequence twice regardless of mode.

    Modes:
    - "off": dedup only, pure penalty ranking
    - "sparse": penalty-first, 10 bp min spacing between both fwd and rev starts
    - "spread": penalty-first, 25 bp min spacing
    - "coverage": round-robin across amplicon-midpoint bins, then penalty within bin
    """
    if not candidates:
        return candidates

    # ── Always deduplicate by sequence ────────────────────────────────────────
    # primer3 often converges on one optimal fwd or rev primer and pairs it with
    # many partners. Never return the same forward or reverse sequence twice.
    seen_fwd: set[str] = set()
    seen_rev: set[str] = set()
    deduped: list[tuple[float, PairResult]] = []
    for penalty, pair in candidates:
        if pair.forward.sequence not in seen_fwd and pair.reverse.sequence not in seen_rev:
            seen_fwd.add(pair.forward.sequence)
            seen_rev.add(pair.reverse.sequence)
            deduped.append((penalty, pair))
    candidates = deduped

    if mode == "off":
        return candidates

    if mode == "coverage":
        # Divide the template into num_return equal sections.
        # For each section, find the candidate whose amplicon center is nearest
        # to the section center, using quality (primer3 penalty) to break ties
        # when multiple candidates are equally well-centered.
        #
        # Flat zone: an amplicon can shift from the section center by up to
        #   flat_radius = max(0, (section_size - avg_amplicon_size) / 2)
        # without any positional penalty. This handles the case where amplicons
        # are much smaller than sections (lots of freedom → quality wins) or
        # where amplicons are larger than sections (overlaps are unavoidable →
        # we just pick closest center, quality as tiebreaker).
        tlen = template_length if template_length > 0 else (
            max(pair.forward.start + pair.amplicon_size for _, pair in candidates)
        )
        n_sections = max(num_return, 1)
        section_size = tlen / n_sections

        avg_amp = sum(pair.amplicon_size for _, pair in candidates) / len(candidates)
        flat_radius = max(0.0, (section_size - avg_amp) / 2.0)

        section_centers = [(i + 0.5) * section_size for i in range(n_sections)]

        # Assign each candidate to its nearest section center
        section_bins: dict[int, list[tuple[float, float, PairResult]]] = {
            i: [] for i in range(n_sections)
        }
        for penalty, pair in candidates:
            amp_center = pair.forward.start + pair.amplicon_size / 2.0
            nearest = min(range(n_sections),
                          key=lambda i: abs(amp_center - section_centers[i]))
            dist = abs(amp_center - section_centers[nearest])
            pos_penalty = max(0.0, dist - flat_radius)
            section_bins[nearest].append((pos_penalty, penalty, pair))

        # From each section pick best: primary = positional fit, secondary = quality
        result: list[tuple[float, PairResult]] = []
        for i in range(n_sections):
            if not section_bins[i]:
                continue
            section_bins[i].sort(key=lambda x: (x[0], x[1]))
            _, pen, pair = section_bins[i][0]
            result.append((pen, pair))
        return result

    # "sparse" or "spread" — penalty-first with min spacing on BOTH primers
    min_spacing = {"sparse": 10, "spread": 25}.get(mode, 10)
    result = []
    selected_fwd_starts: list[int] = []
    selected_rev_starts: list[int] = []

    for penalty, pair in candidates:
        fwd_s = pair.forward.start
        rev_s = pair.reverse.start
        too_close = any(abs(fwd_s - sf) < min_spacing for sf in selected_fwd_starts) or \
                    any(abs(rev_s - sr) < min_spacing for sr in selected_rev_starts)
        if not too_close:
            result.append((penalty, pair))
            selected_fwd_starts.append(fwd_s)
            selected_rev_starts.append(rev_s)

    return result


def design_primers(
    template_seq: str,
    template_info: TemplateInfo,
    target_region: tuple[int, int] | None,  # (start_0indexed, length)
    excluded_regions: list[tuple[int, int]] | None,
    primer_constraints: PrimerConstraints,
    pair_constraints: PairConstraints,
    amplicon_constraints: AmpliconConstraints,
    disabled_constraints: list[str] | None = None,
    reaction_conditions: ReactionConditions = ReactionConditions(),
    all_profiles: list[ConditionProfile] | None = None,
    specificity: SpecificityConfig = SpecificityConfig(),
    num_return: int = 10,
    diversity_mode: str = "off",
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
        # SEQUENCE_INCLUDED_REGION = design primers within this region
        # (NOT SEQUENCE_TARGET, which requires primers to flank the region)
        seq_args["SEQUENCE_INCLUDED_REGION"] = [list(target_region)]
    if excluded_regions:
        seq_args["SEQUENCE_EXCLUDED_REGION"] = [list(r) for r in excluded_regions]

    disabled = set(disabled_constraints or [])

    global_args: dict = {}

    # Primer size constraints — always include (primer3 needs a size range).
    # When disabled: use very permissive bounds and zero out penalty weights so
    # primer3 doesn't silently apply its own restrictive defaults (18–27 nt).
    if "length" not in disabled:
        global_args["PRIMER_MIN_SIZE"] = primer_constraints.length_min
        global_args["PRIMER_OPT_SIZE"] = primer_constraints.length_opt
        global_args["PRIMER_MAX_SIZE"] = primer_constraints.length_max
    else:
        global_args["PRIMER_MIN_SIZE"] = 10
        global_args["PRIMER_OPT_SIZE"] = 20
        global_args["PRIMER_MAX_SIZE"] = 60
        global_args["PRIMER_WT_SIZE_LT"] = 0.0
        global_args["PRIMER_WT_SIZE_GT"] = 0.0

    # Tm constraints — when disabled: open bounds + zero weights so primer3
    # doesn't apply its own hardcoded defaults (57–63 °C) as hard limits.
    if "tm" not in disabled:
        global_args["PRIMER_MIN_TM"] = primer_constraints.tm_min
        global_args["PRIMER_OPT_TM"] = primer_constraints.tm_opt
        global_args["PRIMER_MAX_TM"] = primer_constraints.tm_max
    else:
        global_args["PRIMER_MIN_TM"] = 0.0
        global_args["PRIMER_OPT_TM"] = 60.0   # irrelevant with zero weights
        global_args["PRIMER_MAX_TM"] = 100.0
        global_args["PRIMER_WT_TM_LT"] = 0.0
        global_args["PRIMER_WT_TM_GT"] = 0.0

    # GC constraints
    if "gc" not in disabled:
        global_args["PRIMER_MIN_GC"] = primer_constraints.gc_min
        global_args["PRIMER_OPT_GC_PERCENT"] = primer_constraints.gc_opt
        global_args["PRIMER_MAX_GC"] = primer_constraints.gc_max
    else:
        global_args["PRIMER_MIN_GC"] = 0.0
        global_args["PRIMER_OPT_GC_PERCENT"] = 50.0
        global_args["PRIMER_MAX_GC"] = 100.0
        global_args["PRIMER_WT_GC_PERCENT_LT"] = 0.0
        global_args["PRIMER_WT_GC_PERCENT_GT"] = 0.0

    # Self-complementarity
    if "max_self_complementarity" not in disabled:
        global_args["PRIMER_MAX_SELF_ANY_TH"] = primer_constraints.max_self_complementarity
    else:
        global_args["PRIMER_MAX_SELF_ANY_TH"] = 9999.0
        global_args["PRIMER_WT_SELF_ANY_TH"] = 0.0

    if "max_self_end_complementarity" not in disabled:
        global_args["PRIMER_MAX_SELF_END_TH"] = primer_constraints.max_self_end_complementarity
    else:
        global_args["PRIMER_MAX_SELF_END_TH"] = 9999.0
        global_args["PRIMER_WT_SELF_END_TH"] = 0.0

    # Hairpin
    if "max_hairpin_th" not in disabled:
        global_args["PRIMER_MAX_HAIRPIN_TH"] = primer_constraints.max_hairpin_th
    else:
        global_args["PRIMER_MAX_HAIRPIN_TH"] = 9999.0
        global_args["PRIMER_WT_HAIRPIN_TH"] = 0.0

    # Poly-X
    if "max_poly_x" not in disabled:
        global_args["PRIMER_MAX_POLY_X"] = primer_constraints.max_poly_x
    else:
        global_args["PRIMER_MAX_POLY_X"] = 100

    # Pair constraints
    if "max_tm_diff" not in disabled:
        global_args["PRIMER_PAIR_MAX_DIFF_TM"] = pair_constraints.max_tm_diff
    else:
        global_args["PRIMER_PAIR_MAX_DIFF_TM"] = 100.0
        global_args["PRIMER_WT_DIFF_TM"] = 0.0

    if "max_pair_complementarity" not in disabled:
        global_args["PRIMER_PAIR_MAX_COMPL_ANY_TH"] = pair_constraints.max_pair_complementarity
    else:
        global_args["PRIMER_PAIR_MAX_COMPL_ANY_TH"] = 9999.0
        global_args["PRIMER_WT_COMPL_ANY_TH"] = 0.0

    if "max_pair_end_complementarity" not in disabled:
        global_args["PRIMER_PAIR_MAX_COMPL_END_TH"] = pair_constraints.max_pair_end_complementarity
    else:
        global_args["PRIMER_PAIR_MAX_COMPL_END_TH"] = 9999.0
        global_args["PRIMER_WT_COMPL_END_TH"] = 0.0

    # Amplicon size — always include (primer3 needs a product size range)
    if "amplicon_size" not in disabled:
        global_args["PRIMER_PRODUCT_SIZE_RANGE"] = [[
            amplicon_constraints.size_min,
            amplicon_constraints.size_max,
        ]]
        global_args["PRIMER_PRODUCT_OPT_SIZE"] = amplicon_constraints.size_opt
    else:
        # Even when disabled, primer3 needs some size range to work
        global_args["PRIMER_PRODUCT_SIZE_RANGE"] = [[20, 10000]]

    # Salt/concentration/formula — always set (not user-controllable)
    global_args["PRIMER_SALT_MONOVALENT"] = primary.na_mm + primary.k_mm
    global_args["PRIMER_SALT_DIVALENT"] = primary.mg_mm
    global_args["PRIMER_DNTP_CONC"] = primary.dntps_mm
    global_args["PRIMER_DNA_CONC"] = primary.primer_nm
    global_args["PRIMER_TM_FORMULA"] = 1       # SantaLucia 1998
    global_args["PRIMER_SALT_CORRECTIONS"] = 1  # SantaLucia 1998
    # When diversity mode is active, force primer3 itself to return spread candidates
    # by setting minimum 3' end distance between returned primers. This is the primary
    # mechanism — without it, primer3 returns hundreds of near-identical pairs from
    # the same local optimum, and post-hoc filtering has nothing diverse to work with.
    if diversity_mode == "off":
        num_candidates = num_return * overshoot_factor
    elif diversity_mode == "coverage":
        # Goal: num_return pairs evenly spread across the template,
        # best quality within each section.
        #
        # Divide template into num_return sections. Ask primer3 for
        # overshoot candidates per section so we have quality choices,
        # with spacing = section_size / overshoot so candidates fill
        # each section rather than all piling into the best-scoring region.
        candidates_per_section = max(overshoot_factor * 2, 6)
        num_candidates = num_return * candidates_per_section
        section_size = len(template_seq) / num_return
        spacing = max(10, int(section_size / candidates_per_section))
        global_args["PRIMER_MIN_LEFT_THREE_PRIME_DISTANCE"] = spacing
        global_args["PRIMER_MIN_RIGHT_THREE_PRIME_DISTANCE"] = spacing
    else:
        # sparse / spread — fixed spacing, generous overshoot
        spacing = {"sparse": 10, "spread": 25}.get(diversity_mode, 10)
        global_args["PRIMER_MIN_LEFT_THREE_PRIME_DISTANCE"] = spacing
        global_args["PRIMER_MIN_RIGHT_THREE_PRIME_DISTANCE"] = spacing
        num_candidates = max(num_return * overshoot_factor * 3, 60)
    global_args["PRIMER_NUM_RETURN"] = num_candidates

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

    # ── BLAST screening (batched + thermodynamic filtering) ────────────────────
    if specificity.enabled and specificity.genome_ids:
        # Collect all unique primer sequences across all candidates
        all_primer_seqs = set()
        for _, pair in candidates:
            all_primer_seqs.add(pair.forward.sequence)
            all_primer_seqs.add(pair.reverse.sequence)

        _progress("blast", f"BLAST screening {len(all_primer_seqs)} unique primers (batched)...", 55)

        # One BLAST call per genome for ALL primers at once
        hits_by_seq: dict[str, list] = {s: [] for s in all_primer_seqs}
        for gi, genome_id in enumerate(specificity.genome_ids):
            pct = 55 + 20 * (gi / max(len(specificity.genome_ids), 1))
            _progress("blast", f"BLAST vs {genome_id}...", pct)
            batch_hits = screen_primers_batch(
                list(all_primer_seqs),
                genome_id,
                evalue=specificity.evalue_threshold,
                min_alignment_length=specificity.min_alignment_length,
            )
            for seq, hits in batch_hits.items():
                hits_by_seq[seq].extend(hits)

        # Annotate all hits with Tm
        _progress("blast", "Computing off-target Tm...", 78)
        for seq, hits in hits_by_seq.items():
            for hit in hits:
                hit.hit_tm = calc_hit_tm(hit, primary)

        # Evaluate each pair using pre-computed hits
        _progress("blast", "Evaluating pair specificity...", 85)
        tm_threshold = specificity.off_target_tm_threshold
        max_amp = amplicon_constraints.size_max * 4
        passing: list[tuple[float, PairResult]] = []

        for penalty, pair in candidates:
            fwd_hits = hits_by_seq.get(pair.forward.sequence, [])
            rev_hits = hits_by_seq.get(pair.reverse.sequence, [])

            pair.forward.blast_hits = fwd_hits
            pair.reverse.blast_hits = rev_hits

            viable_fwd = [h for h in fwd_hits if h.hit_tm is not None and h.hit_tm >= tm_threshold]
            viable_rev = [h for h in rev_hits if h.hit_tm is not None and h.hit_tm >= tm_threshold]

            if len(viable_fwd) <= 1 and len(viable_rev) <= 1:
                pair.specificity_status = "pass"
                pair.off_target_amplicons = []
                passing.append((penalty, pair))
            else:
                off_targets = check_pair_off_target_amplicons(
                    viable_fwd, viable_rev,
                    max_amplicon_size=max_amp,
                    expected_amplicon_size=pair.amplicon_size,
                )
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
    # ── Apply diversity filter, then re-rank and trim ────────────────────────
    candidates.sort(key=lambda x: x[0])
    candidates = _apply_diversity_filter(
        candidates, diversity_mode, num_return, template_length=len(template_seq)
    )
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
