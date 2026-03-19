"""Tests for BLAST+ off-target screening.

Most tests require the Lambda BLAST DB to be built (scripts/setup_genomes.py).
Tests gracefully skip if BLAST+ is not installed or Lambda DB is absent.
"""

import pytest
from pathlib import Path
from core.blast_screen import (
    BLAST_DB_DIR,
    screen_primer,
    check_pair_off_target_amplicons,
    blast_version,
    _parse_blast_tabular,
)
from core.models import BlastHit

BLAST_AVAILABLE = blast_version() is not None
LAMBDA_DB_AVAILABLE = (BLAST_DB_DIR / "lambda" / "lambda.nhr").exists()

skip_no_blast = pytest.mark.skipif(
    not BLAST_AVAILABLE, reason="BLAST+ not installed"
)
skip_no_lambda = pytest.mark.skipif(
    not LAMBDA_DB_AVAILABLE, reason="Lambda BLAST DB not built (run setup_genomes.py)"
)


class TestParseBLASTTabular:
    def test_parses_valid_line(self):
        line = "J02459.1\t41966\t41988\t100.000\t23\t0\t0\t1e-10\t46.1\t1\t23\tplus"
        hits = _parse_blast_tabular(line)
        assert len(hits) == 1
        h = hits[0]
        assert h.subject_id == "J02459.1"
        assert h.subject_start == 41966
        assert h.strand == "plus"

    def test_skips_header_lines(self):
        output = "# BLAST output\n# Fields: ...\nJ02459.1\t1\t20\t100.0\t20\t0\t0\t1e-5\t40.0\t1\t20\tplus"
        hits = _parse_blast_tabular(output)
        assert len(hits) == 1

    def test_handles_empty_output(self):
        assert _parse_blast_tabular("") == []

    def test_handles_malformed_line(self):
        assert _parse_blast_tabular("only\ttwo\tfields") == []


class TestOffTargetAmpliconDetection:
    def test_detects_pair_facing_each_other(self):
        fwd_hits = [BlastHit(
            subject_id="seq1", subject_start=100, subject_end=120,
            percent_identity=100.0, alignment_length=21, mismatches=0,
            evalue=1e-10, bitscore=40.0, query_start=1, query_end=21, strand="plus"
        )]
        rev_hits = [BlastHit(
            subject_id="seq1", subject_start=300, subject_end=321,
            percent_identity=100.0, alignment_length=21, mismatches=0,
            evalue=1e-10, bitscore=40.0, query_start=1, query_end=21, strand="minus"
        )]
        amplicons = check_pair_off_target_amplicons(fwd_hits, rev_hits, max_amplicon_size=2000)
        assert len(amplicons) == 1
        assert amplicons[0].size > 0

    def test_no_amplicon_different_subjects(self):
        fwd_hits = [BlastHit(
            subject_id="seq1", subject_start=100, subject_end=120,
            percent_identity=100.0, alignment_length=21, mismatches=0,
            evalue=1e-10, bitscore=40.0, query_start=1, query_end=21, strand="plus"
        )]
        rev_hits = [BlastHit(
            subject_id="seq2", subject_start=300, subject_end=321,
            percent_identity=100.0, alignment_length=21, mismatches=0,
            evalue=1e-10, bitscore=40.0, query_start=1, query_end=21, strand="minus"
        )]
        amplicons = check_pair_off_target_amplicons(fwd_hits, rev_hits)
        assert len(amplicons) == 0

    def test_no_amplicon_same_strand(self):
        """Both on plus strand — can't form an amplicon."""
        fwd_hits = [BlastHit(
            subject_id="seq1", subject_start=100, subject_end=120,
            percent_identity=100.0, alignment_length=21, mismatches=0,
            evalue=1e-10, bitscore=40.0, query_start=1, query_end=21, strand="plus"
        )]
        rev_hits = [BlastHit(
            subject_id="seq1", subject_start=300, subject_end=321,
            percent_identity=100.0, alignment_length=21, mismatches=0,
            evalue=1e-10, bitscore=40.0, query_start=1, query_end=21, strand="plus"
        )]
        amplicons = check_pair_off_target_amplicons(fwd_hits, rev_hits)
        assert len(amplicons) == 0

    def test_no_amplicon_too_far_apart(self):
        fwd_hits = [BlastHit(
            subject_id="seq1", subject_start=100, subject_end=120,
            percent_identity=100.0, alignment_length=21, mismatches=0,
            evalue=1e-10, bitscore=40.0, query_start=1, query_end=21, strand="plus"
        )]
        rev_hits = [BlastHit(
            subject_id="seq1", subject_start=10000, subject_end=10021,
            percent_identity=100.0, alignment_length=21, mismatches=0,
            evalue=1e-10, bitscore=40.0, query_start=1, query_end=21, strand="minus"
        )]
        amplicons = check_pair_off_target_amplicons(fwd_hits, rev_hits, max_amplicon_size=2000)
        assert len(amplicons) == 0


@skip_no_blast
@skip_no_lambda
class TestBlastLambda:
    """Integration tests against real Lambda phage BLAST DB."""

    # Known Lambda primer that should hit the Lambda genome
    LAMBDA_PRIMER = "GGTGCGGTGAATGCAAAGAAGAT"  # L200a Fwd region
    # Random primer unlikely to hit Lambda
    RANDOM_PRIMER = "AAAAAAAAAAAAAAAAAAAAAA"

    def test_lambda_primer_hits_lambda(self):
        hits = screen_primer(self.LAMBDA_PRIMER, "lambda", evalue=1000, min_alignment_length=10)
        assert len(hits) >= 1, "Expected at least one hit for a Lambda-derived primer"

    def test_empty_genome_id_returns_empty(self):
        hits = screen_primer("ATCGATCGATCG", "nonexistent_genome")
        assert hits == []
