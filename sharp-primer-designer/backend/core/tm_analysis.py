"""Multi-method Tm computation.

Key principle: SHARP is not PCR. Tm's relationship to SHARP isothermal
amplification performance is not established. All methods are displayed
transparently; no single method is privileged.

Methods:
  santalucia_primer3   — primer3-py C implementation (ThermoAnalysis.calc_tm)
  santalucia_biopython — Biopython Tm_NN, SantaLucia 1998 table, saltcorr=5
  owczarzy_2008        — Biopython Tm_NN, saltcorr=7 (Owczarzy 2008, optimized for Mg++)
  wallace              — 2(A+T) + 4(G+C), condition-independent, no salt correction
"""

from __future__ import annotations

import primer3
from Bio.SeqUtils import MeltingTemp as mt

from .models import ConditionProfile, TmGrid


# ─── Per-method calculation functions ─────────────────────────────────────────

def _calc_santalucia_primer3(seq: str, profile: ConditionProfile) -> float:
    calc = primer3.thermoanalysis.ThermoAnalysis(
        mv_conc=profile.na_mm + profile.k_mm,
        dv_conc=profile.mg_mm,
        dntp_conc=profile.dntps_mm,
        dna_conc=profile.primer_nm,
    )
    return round(calc.calc_tm(seq), 2)


def _calc_santalucia_biopython(seq: str, profile: ConditionProfile) -> float:
    tm = mt.Tm_NN(
        seq,
        Na=profile.na_mm,
        K=profile.k_mm,
        Tris=profile.tris_mm,
        Mg=profile.mg_mm,
        dNTPs=profile.dntps_mm,
        dnac1=profile.primer_nm,
        dnac2=profile.primer_nm,
        saltcorr=5,
    )
    return round(float(tm), 2)


def _calc_owczarzy(seq: str, profile: ConditionProfile) -> float:
    tm = mt.Tm_NN(
        seq,
        Na=profile.na_mm,
        K=profile.k_mm,
        Tris=profile.tris_mm,
        Mg=profile.mg_mm,
        dNTPs=profile.dntps_mm,
        dnac1=profile.primer_nm,
        dnac2=profile.primer_nm,
        saltcorr=7,
    )
    return round(float(tm), 2)


def _calc_wallace(seq: str, _profile: ConditionProfile) -> float:
    tm = mt.Tm_Wallace(seq)
    return round(float(tm), 2)


TM_METHODS = {
    "santalucia_primer3": _calc_santalucia_primer3,
    "santalucia_biopython": _calc_santalucia_biopython,
    "owczarzy_2008": _calc_owczarzy,
    "wallace": _calc_wallace,
}


# ─── Public API ───────────────────────────────────────────────────────────────

def compute_tm_grid(seq: str, profiles: list[ConditionProfile]) -> TmGrid:
    """Compute Tm under all methods x all profiles.

    Wallace is condition-independent — stored as {"_": value}.
    """
    grid: dict[str, dict[str, float]] = {method: {} for method in TM_METHODS}

    for profile in profiles:
        for method_name, method_fn in TM_METHODS.items():
            if method_name == "wallace":
                if "_" not in grid["wallace"]:
                    grid["wallace"]["_"] = method_fn(seq, profile)
            else:
                grid[method_name][profile.id] = method_fn(seq, profile)

    return TmGrid(**grid)


def compute_tm_diff_grid(
    fwd_grid: TmGrid,
    rev_grid: TmGrid,
) -> dict[str, dict[str, float]]:
    """Absolute Tm difference per method per profile."""
    diff: dict[str, dict[str, float]] = {}
    for method in ("santalucia_primer3", "santalucia_biopython", "owczarzy_2008"):
        fwd_vals = getattr(fwd_grid, method)
        rev_vals = getattr(rev_grid, method)
        diff[method] = {
            pid: round(abs(fwd_vals.get(pid, 0) - rev_vals.get(pid, 0)), 2)
            for pid in fwd_vals
            if pid in rev_vals
        }
    # Wallace diff
    fwd_w = fwd_grid.wallace.get("_")
    rev_w = rev_grid.wallace.get("_")
    if fwd_w is not None and rev_w is not None:
        diff["wallace"] = {"_": round(abs(fwd_w - rev_w), 2)}
    return diff


def analyze_primer_thermo(seq: str, profile: ConditionProfile) -> dict:
    """Full thermodynamic characterization of a single primer.

    Returns hairpin dG/Tm, homodimer dG/Tm, 3' end stability.
    Uses primer3.thermoanalysis.ThermoAnalysis (C bindings).
    """
    calc = primer3.thermoanalysis.ThermoAnalysis(
        mv_conc=profile.na_mm + profile.k_mm,
        dv_conc=profile.mg_mm,
        dntp_conc=profile.dntps_mm,
        dna_conc=profile.primer_nm,
    )
    hairpin = calc.calc_hairpin(seq)
    homodimer = calc.calc_homodimer(seq)
    end_stab = calc.calc_end_stability(seq, seq)

    return {
        "hairpin_dg": round(hairpin.dg / 1000, 3),    # J/mol → kcal/mol
        "hairpin_tm": round(hairpin.tm, 2),
        "homodimer_dg": round(homodimer.dg / 1000, 3),
        "homodimer_tm": round(homodimer.tm, 2),
        "end_stability": round(end_stab.dg / 1000, 3),
    }


def analyze_pair_thermo(fwd: str, rev: str, profile: ConditionProfile) -> dict:
    """Heterodimer analysis for a primer pair."""
    calc = primer3.thermoanalysis.ThermoAnalysis(
        mv_conc=profile.na_mm + profile.k_mm,
        dv_conc=profile.mg_mm,
        dntp_conc=profile.dntps_mm,
        dna_conc=profile.primer_nm,
    )
    heterodimer = calc.calc_heterodimer(fwd, rev)
    return {
        "heterodimer_dg": round(heterodimer.dg / 1000, 3),
        "heterodimer_tm": round(heterodimer.tm, 2),
    }
