"""Tests for multi-method Tm analysis.

Validation reference: IDT PrimerQuest designs from IDT_PrimerQuest_Designs_09122025.docx
  - L200a Fwd: IDT Tm = 62°C
    Our SantaLucia (Biopython) under IDT OligoAnalyzer: ~62.6°C
    Our SantaLucia (primer3)  under IDT OligoAnalyzer: ~61.6°C

The small discrepancies are documented and expected (IDT PrimerQuest uses proprietary adjustments).
"""

import pytest
from core.tm_analysis import (
    compute_tm_grid,
    analyze_primer_thermo,
    analyze_pair_thermo,
)
from core.models import ConditionProfile

# IDT OligoAnalyzer profile
IDT_PROFILE = ConditionProfile(
    id="idt_oligoanalyzer",
    name="IDT OligoAnalyzer",
    na_mm=50.0, k_mm=0.0, tris_mm=0.0,
    mg_mm=3.0, dntps_mm=0.8, primer_nm=200.0,
)

# SHARP CutSmart profile
SHARP_PROFILE = ConditionProfile(
    id="sharp_cutsmart",
    name="SHARP CutSmart",
    na_mm=50.0, k_mm=0.0, tris_mm=0.0,
    mg_mm=2.0, dntps_mm=0.8, primer_nm=200.0,
)

# L200a Forward primer (from SHARP primer databank)
L200A_FWD = "GGTGCGGTGAATGCAAAGAAGAT"


class TestTmGrid:
    def test_grid_has_all_methods(self):
        grid = compute_tm_grid(L200A_FWD, [IDT_PROFILE])
        assert grid.santalucia_primer3
        assert grid.santalucia_biopython
        assert grid.owczarzy_2008
        assert grid.wallace

    def test_wallace_condition_independent(self):
        """Wallace Tm should be identical regardless of profile."""
        grid1 = compute_tm_grid(L200A_FWD, [IDT_PROFILE])
        grid2 = compute_tm_grid(L200A_FWD, [SHARP_PROFILE])
        assert grid1.wallace["_"] == grid2.wallace["_"]

    def test_wallace_stored_under_underscore_key(self):
        grid = compute_tm_grid(L200A_FWD, [IDT_PROFILE])
        assert "_" in grid.wallace
        assert IDT_PROFILE.id not in grid.wallace

    def test_profile_keyed_correctly(self):
        grid = compute_tm_grid(L200A_FWD, [IDT_PROFILE, SHARP_PROFILE])
        assert IDT_PROFILE.id in grid.santalucia_primer3
        assert SHARP_PROFILE.id in grid.santalucia_primer3

    def test_santalucia_biopython_l200a_idt(self):
        """L200a Fwd under IDT OligoAnalyzer: expect ~62.6°C (±1.5°C tolerance)."""
        grid = compute_tm_grid(L200A_FWD, [IDT_PROFILE])
        tm = grid.santalucia_biopython[IDT_PROFILE.id]
        assert 61.0 <= tm <= 64.5, f"Expected ~62.6°C, got {tm}"

    def test_santalucia_primer3_l200a_idt(self):
        """L200a Fwd under IDT OligoAnalyzer: expect ~61.6°C (±1.5°C tolerance)."""
        grid = compute_tm_grid(L200A_FWD, [IDT_PROFILE])
        tm = grid.santalucia_primer3[IDT_PROFILE.id]
        assert 60.0 <= tm <= 63.5, f"Expected ~61.6°C, got {tm}"

    def test_owczarzy_in_reasonable_range(self):
        grid = compute_tm_grid(L200A_FWD, [IDT_PROFILE])
        tm = grid.owczarzy_2008[IDT_PROFILE.id]
        assert 55.0 <= tm <= 75.0

    def test_all_methods_return_floats(self):
        grid = compute_tm_grid(L200A_FWD, [IDT_PROFILE])
        assert isinstance(grid.santalucia_primer3[IDT_PROFILE.id], float)
        assert isinstance(grid.santalucia_biopython[IDT_PROFILE.id], float)
        assert isinstance(grid.owczarzy_2008[IDT_PROFILE.id], float)
        assert isinstance(grid.wallace["_"], float)


class TestThermoAnalysis:
    def test_primer_thermo_returns_expected_keys(self):
        result = analyze_primer_thermo(L200A_FWD, SHARP_PROFILE)
        assert "hairpin_dg" in result
        assert "hairpin_tm" in result
        assert "homodimer_dg" in result
        assert "homodimer_tm" in result
        assert "end_stability" in result

    def test_hairpin_dg_is_float(self):
        result = analyze_primer_thermo(L200A_FWD, SHARP_PROFILE)
        assert isinstance(result["hairpin_dg"], float)

    def test_pair_thermo_returns_heterodimer(self):
        fwd = "GGTGCGGTGAATGCAAAGAAGAT"
        rev = "TTTCTGGTGCATCGGTGCATCG"
        result = analyze_pair_thermo(fwd, rev, SHARP_PROFILE)
        assert "heterodimer_dg" in result
        assert "heterodimer_tm" in result
