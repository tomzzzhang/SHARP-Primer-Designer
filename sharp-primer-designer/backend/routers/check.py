"""POST /api/check — single-primer or primer-pair property analysis.

Accepts one or two primer sequences and returns full thermodynamic analysis,
Tm grid (all methods × all profiles), and optional BLAST screening.
No primer3 design pipeline involved — just property computation on provided sequences.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from fastapi import APIRouter, HTTPException

from core.models import (
    CheckRequest,
    CheckResult,
    ConditionProfile,
    PrimerResult,
)
from core.tm_analysis import (
    analyze_pair_thermo,
    analyze_primer_thermo,
    compute_tm_diff_grid,
    compute_tm_grid,
)
from core.blast_screen import (
    calc_hit_tm,
    screen_pair_specificity,
    screen_primer,
)

router = APIRouter(prefix="/api/check", tags=["check"])

_PROFILES_PATH = Path(__file__).parent.parent / "data" / "profiles.json"


def _load_all_profiles() -> list[ConditionProfile]:
    with open(_PROFILES_PATH) as f:
        data = json.load(f)
    return [ConditionProfile(**p) for p in data["profiles"]]


def _clean_sequence(seq: str) -> str:
    """Strip whitespace, numbers, and FASTA headers from a pasted sequence."""
    lines = seq.splitlines()
    cleaned = []
    for line in lines:
        line = line.strip()
        if line.startswith(">"):
            continue
        line = re.sub(r"[^A-Za-z]", "", line)
        cleaned.append(line)
    return "".join(cleaned).upper()


def _gc_percent(seq: str) -> float:
    gc = sum(1 for b in seq if b in "GC")
    return round(100 * gc / len(seq), 1) if seq else 0.0


def _build_primer_result(
    seq: str,
    active_profiles: list[ConditionProfile],
    primary: ConditionProfile,
) -> PrimerResult:
    """Compute full PrimerResult for a single sequence."""
    tm_grid = compute_tm_grid(seq, active_profiles)
    thermo = analyze_primer_thermo(seq, primary)
    return PrimerResult(
        sequence=seq,
        start=1,
        end=len(seq),
        length=len(seq),
        gc_percent=_gc_percent(seq),
        tm_grid=tm_grid,
        blast_hits=[],
        **thermo,
    )


@router.post("", response_model=CheckResult)
def check_primer(req: CheckRequest):
    """Analyze one or more primer sequences — Tm grid, thermo, optional BLAST."""

    # 1. Clean and validate sequences
    clean_seqs = []
    for i, raw in enumerate(req.sequences):
        seq = _clean_sequence(raw)
        if not seq:
            continue  # skip empty lines
        if not re.fullmatch(r"[ACGTN]+", seq):
            raise HTTPException(422, f"Sequence {i+1} contains invalid characters (only ACGTN allowed)")
        if len(seq) > 200:
            raise HTTPException(422, f"Sequence {i+1} too long ({len(seq)} bp, max 200)")
        clean_seqs.append(seq)

    if not clean_seqs:
        raise HTTPException(422, "No valid sequences provided")

    # 2. Resolve profiles
    all_profiles = _load_all_profiles()
    primary_id = req.reaction_conditions.primary_profile_id
    primary = next((p for p in all_profiles if p.id == primary_id), all_profiles[0])
    active_ids = {primary_id} | set(req.reaction_conditions.additional_profile_ids)
    active_profiles = [p for p in all_profiles if p.id in active_ids]

    # 3. Compute properties for each primer
    primer_results = [_build_primer_result(seq, active_profiles, primary) for seq in clean_seqs]

    # 4. Pair thermo (only when exactly 2 sequences)
    heterodimer_dg = None
    heterodimer_tm = None
    tm_diff = None
    if len(clean_seqs) == 2:
        pair_thermo = analyze_pair_thermo(clean_seqs[0], clean_seqs[1], primary)
        heterodimer_dg = pair_thermo["heterodimer_dg"]
        heterodimer_tm = pair_thermo["heterodimer_tm"]
        tm_diff = compute_tm_diff_grid(primer_results[0].tm_grid, primer_results[1].tm_grid)

    # 5. BLAST screening (if enabled)
    specificity_status = "not_screened"
    off_target_amplicons = []

    if req.specificity.enabled and req.specificity.genome_ids:
        for pr, seq in zip(primer_results, clean_seqs):
            all_hits = []
            for genome_id in req.specificity.genome_ids:
                hits = screen_primer(
                    seq, genome_id,
                    evalue=req.specificity.evalue_threshold,
                    min_alignment_length=req.specificity.min_alignment_length,
                )
                for hit in hits:
                    hit.hit_tm = calc_hit_tm(hit, primary)
                all_hits.extend(hits)
            pr.blast_hits = all_hits

        # Pair specificity (off-target amplicons) when exactly 2
        if len(clean_seqs) == 2:
            status, _, _, amplicons = screen_pair_specificity(
                clean_seqs[0], clean_seqs[1], req.specificity.genome_ids, primary,
                evalue=req.specificity.evalue_threshold,
                min_alignment_length=req.specificity.min_alignment_length,
                tm_threshold=req.specificity.off_target_tm_threshold,
            )
            specificity_status = status
            off_target_amplicons = amplicons
        else:
            specificity_status = "pass"

    return CheckResult(
        primers=primer_results,
        heterodimer_dg=heterodimer_dg,
        heterodimer_tm=heterodimer_tm,
        tm_diff=tm_diff,
        specificity_status=specificity_status,
        off_target_amplicons=off_target_amplicons,
    )
