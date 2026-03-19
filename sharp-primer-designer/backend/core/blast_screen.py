"""BLAST+ off-target specificity screening.

Uses subprocess calls to NCBI BLAST+ command-line tools (blastn, makeblastdb).
BLAST_DB_DIR is resolved relative to this file's location at runtime.
"""

from __future__ import annotations

import re
import subprocess
import tempfile
import os
from pathlib import Path

from .models import BlastHit, OffTargetAmplicon

# Resolved at import time relative to this module's location
_HERE = Path(__file__).parent.parent
BLAST_DB_DIR = _HERE / "data" / "genomes"


# ─── BLAST search ─────────────────────────────────────────────────────────────

def screen_primer(
    primer_seq: str,
    genome_id: str,
    evalue: float = 1000,
    word_size: int = 7,
    min_alignment_length: int = 15,
) -> list[BlastHit]:
    """Run blastn-short against a local BLAST database.

    Returns list of hits filtered by min_alignment_length.
    Returns empty list if BLAST DB does not exist.
    """
    if not primer_seq or len(primer_seq) > 200:
        raise ValueError("primer_seq must be 1-200 characters")
    if not re.fullmatch(r"[ACGTNacgtn]+", primer_seq):
        raise ValueError("primer_seq must contain only ACGTN characters")
    if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_.\-]{0,99}", genome_id):
        raise ValueError(f"Invalid genome_id: {genome_id}")

    db_path = BLAST_DB_DIR / genome_id / genome_id
    if not db_path.with_suffix(".nhr").exists() and not db_path.with_suffix(".nin").exists():
        return []

    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".fasta", delete=False
    ) as f:
        f.write(f">query\n{primer_seq}\n")
        query_path = f.name

    try:
        cmd = [
            "blastn",
            "-task", "blastn-short",
            "-query", query_path,
            "-db", str(db_path),
            "-evalue", str(evalue),
            "-word_size", str(word_size),
            "-outfmt",
            "6 sseqid sstart send pident length mismatch gapopen evalue bitscore qstart qend sstrand",
            "-dust", "no",
            "-num_threads", "2",
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    finally:
        os.unlink(query_path)

    hits = _parse_blast_tabular(result.stdout)
    return [h for h in hits if h.alignment_length >= min_alignment_length]


def _parse_blast_tabular(output: str) -> list[BlastHit]:
    hits = []
    for line in output.strip().splitlines():
        if not line or line.startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) < 12:
            continue
        try:
            hit = BlastHit(
                subject_id=parts[0],
                subject_start=int(parts[1]),
                subject_end=int(parts[2]),
                percent_identity=float(parts[3]),
                alignment_length=int(parts[4]),
                mismatches=int(parts[5]),
                evalue=float(parts[7]),
                bitscore=float(parts[8]),
                query_start=int(parts[9]),
                query_end=int(parts[10]),
                strand="plus" if parts[11].strip() == "plus" else "minus",
            )
            hits.append(hit)
        except (ValueError, IndexError):
            continue
    return hits


# ─── Off-target amplicon detection ────────────────────────────────────────────

def check_pair_off_target_amplicons(
    fwd_hits: list[BlastHit],
    rev_hits: list[BlastHit],
    max_amplicon_size: int = 2000,
    expected_amplicon_size: int | None = None,
    size_tolerance_pct: float = 0.15,
) -> list[OffTargetAmplicon]:
    """Check if any fwd+rev hit pair could produce a spurious amplicon.

    Condition: same reference sequence, fwd on plus strand, rev on minus strand,
    rev.subject_start > fwd.subject_end, within max_amplicon_size distance.

    On-target exclusion: if expected_amplicon_size is provided, any detected
    amplicon whose size falls within size_tolerance_pct of expected_amplicon_size
    is considered the intended on-target product and is excluded. This prevents
    the designed amplicon from being flagged as "off-target" when the BLAST DB
    contains the same sequence as the template (the most common use case).
    """
    amplicons = []
    tol = int((expected_amplicon_size or 0) * size_tolerance_pct)

    for fh in fwd_hits:
        for rh in rev_hits:
            if fh.subject_id != rh.subject_id:
                continue
            if fh.strand == "plus" and rh.strand == "minus":
                distance = rh.subject_start - fh.subject_end
                if 0 < distance < max_amplicon_size:
                    amplicon_size = distance + fh.alignment_length + rh.alignment_length
                    # Skip if this matches the intended on-target amplicon size
                    if expected_amplicon_size is not None:
                        if abs(amplicon_size - expected_amplicon_size) <= max(tol, 50):
                            continue
                    amplicons.append(OffTargetAmplicon(
                        subject=fh.subject_id,
                        fwd_pos=fh.subject_start,
                        rev_pos=rh.subject_start,
                        size=amplicon_size,
                    ))
    return amplicons


# ─── Genome indexing ──────────────────────────────────────────────────────────

def index_genome(genome_id: str, fasta_path: str | Path) -> None:
    """Build a BLAST nucleotide database from a FASTA file."""
    db_dir = BLAST_DB_DIR / genome_id
    db_dir.mkdir(parents=True, exist_ok=True)

    cmd = [
        "makeblastdb",
        "-in", str(fasta_path),
        "-dbtype", "nucl",
        "-out", str(db_dir / genome_id),
        "-title", genome_id,
    ]
    subprocess.run(cmd, check=True, capture_output=True, text=True)


def blast_version() -> str | None:
    """Return BLAST+ version string, or None if not installed."""
    try:
        result = subprocess.run(
            ["blastn", "-version"], capture_output=True, text=True, timeout=5
        )
        first_line = result.stdout.strip().splitlines()[0] if result.stdout else ""
        return first_line or None
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return None
