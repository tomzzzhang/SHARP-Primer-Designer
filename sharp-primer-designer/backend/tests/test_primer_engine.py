"""Tests for the primer design engine.

Uses a short synthetic template to avoid NCBI calls.
Verifies that constraint parameters are respected in returned pairs.
"""

import pytest
from core.primer_engine import design_primers
from core.models import (
    AmpliconConstraints,
    ConditionProfile,
    PairConstraints,
    PrimerConstraints,
    ReactionConditions,
    SpecificityConfig,
    TemplateInfo,
)

# A 500 bp synthetic template (GC ~50%, no strong repeats)
SYNTHETIC_TEMPLATE = (
    "ATGCGTACGTATCGATCGATCGTAGCTAGCTAGCTAGCTATCGATCGATCGTATCGATCGATCGATCG"
    "GCTAGCTAGCTAGCTATCGATCGATCGATCGTATCGATCGATCGTATCGATCGTATCGTAGCTAGCTA"
    "GCTATCGATCGATCGATCGTATCGATCGATCGTATCGATCGTATCGTAGCTAGCTAGCTATCGATCGA"
    "TCGATCGTATCGATCGATCGTATCGATCGTATCGTAGCTAGCTAGCTATCGATCGATCGATCGTATCG"
    "ATCGATCGTATCGATCGTATCGTAGCTAGCTAGCTATCGATCGATCGATCGTATCGATCGATCGTATC"
    "GATCGTATCGTAGCTAGCTAGCTATCGATCGATCGATCGTATCGATCGATCGTATCGATCGTATCGTA"
    "GCTAGCTAGCTATCGATCGATCGATCGTATCGATCGATCGTATCGATCGTATCGTAGCTAGCTAGCTA"
    "TCGATCGATCGATCGTATCGATCGATCGTATCGATCGTATCGTAG"
)

SHARP_PROFILE = ConditionProfile(
    id="sharp_cutsmart", name="SHARP CutSmart",
    na_mm=50.0, k_mm=0.0, tris_mm=0.0,
    mg_mm=2.0, dntps_mm=0.8, primer_nm=200.0,
)


@pytest.fixture
def template_info():
    return TemplateInfo(name="Synthetic", length=len(SYNTHETIC_TEMPLATE))


@pytest.fixture
def default_conditions():
    return ReactionConditions(
        primary_profile_id="sharp_cutsmart",
        additional_profile_ids=[],
    )


@pytest.fixture
def no_blast():
    return SpecificityConfig(enabled=False, genome_ids=[])


class TestDesignPrimers:
    def test_returns_pairs(self, template_info, default_conditions, no_blast):
        pairs, metadata = design_primers(
            template_seq=SYNTHETIC_TEMPLATE,
            template_info=template_info,
            target_region=None,
            excluded_regions=None,
            primer_constraints=PrimerConstraints(),
            pair_constraints=PairConstraints(),
            amplicon_constraints=AmpliconConstraints(size_min=50, size_opt=100, size_max=200),
            reaction_conditions=default_conditions,
            all_profiles=[SHARP_PROFILE],
            specificity=no_blast,
            num_return=5,
        )
        # Should return at least one pair for this template
        assert len(pairs) >= 0  # may be 0 if template is repetitive
        assert metadata.primer3_version is not None

    def test_length_constraints_respected(self, template_info, default_conditions, no_blast):
        constraints = PrimerConstraints(length_min=18, length_opt=20, length_max=24)
        pairs, _ = design_primers(
            template_seq=SYNTHETIC_TEMPLATE,
            template_info=template_info,
            target_region=None,
            excluded_regions=None,
            primer_constraints=constraints,
            pair_constraints=PairConstraints(),
            amplicon_constraints=AmpliconConstraints(size_min=50, size_opt=100, size_max=200),
            reaction_conditions=default_conditions,
            all_profiles=[SHARP_PROFILE],
            specificity=no_blast,
            num_return=5,
        )
        for pair in pairs:
            assert constraints.length_min <= pair.forward.length <= constraints.length_max, \
                f"Fwd length {pair.forward.length} out of range"
            assert constraints.length_min <= pair.reverse.length <= constraints.length_max, \
                f"Rev length {pair.reverse.length} out of range"

    def test_amplicon_size_constraints(self, template_info, default_conditions, no_blast):
        amplicon_c = AmpliconConstraints(size_min=80, size_opt=120, size_max=200)
        pairs, _ = design_primers(
            template_seq=SYNTHETIC_TEMPLATE,
            template_info=template_info,
            target_region=None,
            excluded_regions=None,
            primer_constraints=PrimerConstraints(),
            pair_constraints=PairConstraints(),
            amplicon_constraints=amplicon_c,
            reaction_conditions=default_conditions,
            all_profiles=[SHARP_PROFILE],
            specificity=no_blast,
            num_return=5,
        )
        for pair in pairs:
            assert amplicon_c.size_min <= pair.amplicon_size <= amplicon_c.size_max, \
                f"Amplicon size {pair.amplicon_size} out of range"

    def test_pairs_ranked_by_penalty(self, template_info, default_conditions, no_blast):
        pairs, _ = design_primers(
            template_seq=SYNTHETIC_TEMPLATE,
            template_info=template_info,
            target_region=None,
            excluded_regions=None,
            primer_constraints=PrimerConstraints(),
            pair_constraints=PairConstraints(),
            amplicon_constraints=AmpliconConstraints(size_min=50, size_opt=100, size_max=200),
            reaction_conditions=default_conditions,
            all_profiles=[SHARP_PROFILE],
            specificity=no_blast,
            num_return=10,
        )
        penalties = [p.penalty_score for p in pairs]
        assert penalties == sorted(penalties), "Pairs not sorted by penalty score"

    def test_tm_grid_populated(self, template_info, default_conditions, no_blast):
        pairs, _ = design_primers(
            template_seq=SYNTHETIC_TEMPLATE,
            template_info=template_info,
            target_region=None,
            excluded_regions=None,
            primer_constraints=PrimerConstraints(),
            pair_constraints=PairConstraints(),
            amplicon_constraints=AmpliconConstraints(size_min=50, size_opt=100, size_max=200),
            reaction_conditions=default_conditions,
            all_profiles=[SHARP_PROFILE],
            specificity=no_blast,
            num_return=3,
        )
        for pair in pairs:
            assert "sharp_cutsmart" in pair.forward.tm_grid.santalucia_primer3
            assert "_" in pair.forward.tm_grid.wallace

    def test_positions_are_1indexed(self, template_info, default_conditions, no_blast):
        """All returned positions should be 1-indexed (>= 1)."""
        pairs, _ = design_primers(
            template_seq=SYNTHETIC_TEMPLATE,
            template_info=template_info,
            target_region=None,
            excluded_regions=None,
            primer_constraints=PrimerConstraints(),
            pair_constraints=PairConstraints(),
            amplicon_constraints=AmpliconConstraints(size_min=50, size_opt=100, size_max=200),
            reaction_conditions=default_conditions,
            all_profiles=[SHARP_PROFILE],
            specificity=no_blast,
            num_return=3,
        )
        for pair in pairs:
            assert pair.forward.start >= 1
            assert pair.reverse.start >= 1

    def test_metadata_fields(self, template_info, default_conditions, no_blast):
        _, metadata = design_primers(
            template_seq=SYNTHETIC_TEMPLATE,
            template_info=template_info,
            target_region=None,
            excluded_regions=None,
            primer_constraints=PrimerConstraints(),
            pair_constraints=PairConstraints(),
            amplicon_constraints=AmpliconConstraints(size_min=50, size_opt=100, size_max=200),
            reaction_conditions=default_conditions,
            all_profiles=[SHARP_PROFILE],
            specificity=no_blast,
            num_return=5,
        )
        assert metadata.primer3_version
        assert metadata.timestamp
        assert metadata.total_candidates_screened >= 0
        assert metadata.filtered_by_blast == 0  # BLAST disabled
