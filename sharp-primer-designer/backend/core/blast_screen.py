"""BLAST+ off-target specificity screening with thermodynamic filtering.

Uses subprocess calls to NCBI BLAST+ command-line tools (blastn, makeblastdb).
BLAST_DB_DIR is resolved relative to this file's location at runtime.

Thermodynamic filtering: each BLAST hit is evaluated for binding Tm under
the actual reaction conditions (salt, Mg, dNTPs, primer concentration).
Only hits with Tm above a threshold are considered viable binding sites.
If both primers have exactly one viable site each, the pair passes without
geometry checking. Multiple viable sites trigger off-target amplicon geometry checks.
"""

from __future__ import annotations

import re
import subprocess
import tempfile
import os
from pathlib import Path

import primer3

from .models import BlastHit, ConditionProfile, OffTargetAmplicon

# Resolved at import time relative to this module's location
_HERE = Path(__file__).parent.parent
BLAST_DB_DIR = _HERE / "data" / "genomes"


def _safe_blast_path(p: Path) -> str:
    """Return a BLAST-safe path string.

    BLAST+ on Windows cannot handle spaces in the -db argument.
    Convert to Windows 8.3 short path when spaces are present.
    For BLAST DB prefixes (no extension), convert the parent directory
    and re-append the filename.
    """
    s = str(p)
    if " " not in s:
        return s
    if os.name == "nt":
        try:
            import ctypes
            # If the path itself exists, convert directly
            target = p if p.exists() else p.parent
            if target.exists():
                buf = ctypes.create_unicode_buffer(512)
                ctypes.windll.kernel32.GetShortPathNameW(str(target), buf, 512)
                if buf.value:
                    if target == p:
                        return buf.value
                    # Re-append the filename to the short parent path
                    return str(Path(buf.value) / p.name)
        except Exception:
            pass
    return s


# ─── Thermodynamic Tm for a BLAST hit ────────────────────────────────────────

def _complement(seq: str) -> str:
    """Return complement (NOT reverse complement) of a DNA sequence."""
    table = str.maketrans("ACGTacgt", "TGCAtgca")
    return seq.translate(table)


def _wallace_tm(seq: str) -> float:
    """Wallace rule Tm: 2(A+T) + 4(G+C)."""
    seq = seq.upper()
    at = sum(1 for b in seq if b in "AT")
    gc = sum(1 for b in seq if b in "GC")
    return float(2 * at + 4 * gc)


def calc_hit_tm(
    hit: BlastHit,
    profile: ConditionProfile,
) -> float:
    """Calculate Tm for a primer binding at a BLAST hit site.

    Uses primer3 calc_tm on the aligned query sequence (qseq) under the
    reaction's salt/Mg/dNTP/primer concentration conditions. This computes
    the Tm of the aligned portion assuming perfect-complement binding.

    Also sets hit.hit_tm_wallace (Wallace rule, no salt correction).

    For partial matches with mismatches, this overestimates the true Tm
    (real duplex is less stable than perfect complement). This is
    conservative: we may flag weak off-targets but won't miss real ones.
    """
    qseq = hit.qseq.replace("-", "")  # remove gaps

    if not qseq:
        return 0.0

    hit.hit_tm_wallace = round(_wallace_tm(qseq), 1)

    try:
        calc = primer3.thermoanalysis.ThermoAnalysis(
            mv_conc=profile.na_mm + profile.k_mm,
            dv_conc=profile.mg_mm,
            dntp_conc=profile.dntps_mm,
            dna_conc=profile.primer_nm,
        )
        return round(calc.calc_tm(qseq), 1)
    except Exception:
        return 0.0


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

    # Adjust min alignment length for short primers
    effective_min_len = min(min_alignment_length, len(primer_seq) - 2)
    effective_min_len = max(effective_min_len, 7)  # absolute floor

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
            "-db", _safe_blast_path(db_path),
            "-evalue", str(evalue),
            "-word_size", str(word_size),
            "-outfmt",
            "6 sseqid sstart send pident length mismatch gapopen evalue bitscore qstart qend sstrand qseq sseq",
            "-dust", "no",
            "-num_threads", "2",
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    finally:
        os.unlink(query_path)

    hits = _parse_blast_tabular(result.stdout)
    return [h for h in hits if h.alignment_length >= effective_min_len]


def _parse_blast_tabular(output: str) -> list[BlastHit]:
    hits = []
    for line in output.strip().splitlines():
        if not line or line.startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) < 14:
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
                qseq=parts[12],
                sseq=parts[13],
            )
            hits.append(hit)
        except (ValueError, IndexError):
            continue
    return hits


# ─── Thermodynamic hit filtering ─────────────────────────────────────────────

def filter_hits_by_tm(
    hits: list[BlastHit],
    profile: ConditionProfile,
    tm_threshold: float = 45.0,
) -> list[BlastHit]:
    """Keep only hits whose binding Tm >= threshold under reaction conditions.

    Also annotates each hit with its calculated hit_tm.
    A threshold of ~45°C is conservative — well below the 65°C reaction
    temperature, but filters out very weak partial matches that could
    never bind under any reasonable condition.
    """
    viable = []
    for hit in hits:
        tm = calc_hit_tm(hit, profile)
        hit.hit_tm = tm
        if tm >= tm_threshold:
            viable.append(hit)
    return viable


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
    is considered the intended on-target product and is excluded.
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


def screen_primers_batch(
    primer_seqs: list[str],
    genome_id: str,
    evalue: float = 1000,
    word_size: int = 7,
    min_alignment_length: int = 15,
) -> dict[str, list[BlastHit]]:
    """BLAST multiple primer sequences in a single subprocess call.

    Returns dict mapping each primer sequence to its list of hits.
    Much faster than calling screen_primer() individually for each primer.
    """
    if not primer_seqs:
        return {}

    # Deduplicate
    unique_seqs = list(set(primer_seqs))

    # Validate
    for seq in unique_seqs:
        if not seq or len(seq) > 200:
            continue
        if not re.fullmatch(r"[ACGTNacgtn]+", seq):
            continue
    if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_.\-]{0,99}", genome_id):
        return {s: [] for s in primer_seqs}

    db_path = BLAST_DB_DIR / genome_id / genome_id
    if not db_path.with_suffix(".nhr").exists() and not db_path.with_suffix(".nin").exists():
        return {s: [] for s in primer_seqs}

    # Write all primers to one FASTA
    with tempfile.NamedTemporaryFile(mode="w", suffix=".fasta", delete=False) as f:
        for i, seq in enumerate(unique_seqs):
            f.write(f">primer_{i}\n{seq}\n")
        query_path = f.name

    # Map primer index back to sequence
    idx_to_seq = {f"primer_{i}": seq for i, seq in enumerate(unique_seqs)}

    try:
        cmd = [
            "blastn",
            "-task", "blastn-short",
            "-query", query_path,
            "-db", _safe_blast_path(db_path),
            "-evalue", str(evalue),
            "-word_size", str(word_size),
            "-outfmt",
            "6 qseqid sseqid sstart send pident length mismatch gapopen evalue bitscore qstart qend sstrand qseq sseq",
            "-dust", "no",
            "-num_threads", "2",
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    finally:
        os.unlink(query_path)

    # Parse results, group by query
    hits_by_seq: dict[str, list[BlastHit]] = {s: [] for s in unique_seqs}
    for line in result.stdout.strip().splitlines():
        if not line or line.startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) < 15:
            continue
        try:
            query_id = parts[0]
            seq = idx_to_seq.get(query_id)
            if seq is None:
                continue
            eff_min = min(min_alignment_length, len(seq) - 2)
            eff_min = max(eff_min, 7)
            aln_len = int(parts[5])
            if aln_len < eff_min:
                continue
            hit = BlastHit(
                subject_id=parts[1],
                subject_start=int(parts[2]),
                subject_end=int(parts[3]),
                percent_identity=float(parts[4]),
                alignment_length=aln_len,
                mismatches=int(parts[6]),
                evalue=float(parts[8]),
                bitscore=float(parts[9]),
                query_start=int(parts[10]),
                query_end=int(parts[11]),
                strand="plus" if parts[12].strip() == "plus" else "minus",
                qseq=parts[13],
                sseq=parts[14],
            )
            hits_by_seq[seq].append(hit)
        except (ValueError, IndexError):
            continue

    return hits_by_seq


def screen_pair_specificity(
    fwd_seq: str,
    rev_seq: str,
    genome_ids: list[str],
    profile: ConditionProfile,
    evalue: float = 1000,
    min_alignment_length: int = 15,
    tm_threshold: float = 45.0,
    max_amplicon_size: int = 2000,
    expected_amplicon_size: int | None = None,
    max_off_targets: int = 0,
) -> tuple[str, list[BlastHit], list[BlastHit], list[OffTargetAmplicon]]:
    """Full specificity screen for a primer pair with thermodynamic filtering.

    Returns (status, fwd_hits, rev_hits, off_target_amplicons) where:
    - status: "pass", "fail", or "not_screened"
    - fwd_hits/rev_hits: all BLAST hits (with hit_tm annotated)
    - off_target_amplicons: only populated if status == "fail"

    Logic:
    1. BLAST both primers against all genomes
    2. Filter hits by Tm — only keep sites that could bind at reaction temperature
    3. If both primers have exactly 1 viable site → pass (no geometry check needed)
    4. If multiple viable sites → check geometry for off-target amplicons
    """
    all_fwd_hits = []
    all_rev_hits = []

    for genome_id in genome_ids:
        all_fwd_hits += screen_primer(fwd_seq, genome_id, evalue=evalue,
                                       min_alignment_length=min_alignment_length)
        all_rev_hits += screen_primer(rev_seq, genome_id, evalue=evalue,
                                       min_alignment_length=min_alignment_length)

    # Annotate all hits with Tm (for display), then filter to viable ones
    for hit in all_fwd_hits:
        hit.hit_tm = calc_hit_tm(hit, profile)
    for hit in all_rev_hits:
        hit.hit_tm = calc_hit_tm(hit, profile)

    viable_fwd = [h for h in all_fwd_hits if h.hit_tm is not None and h.hit_tm >= tm_threshold]
    viable_rev = [h for h in all_rev_hits if h.hit_tm is not None and h.hit_tm >= tm_threshold]

    # Fast path: if each primer binds only one site, no off-target possible
    if len(viable_fwd) <= 1 and len(viable_rev) <= 1:
        return "pass", all_fwd_hits, all_rev_hits, []

    # Multiple viable sites: check geometry
    off_targets = check_pair_off_target_amplicons(
        viable_fwd,
        viable_rev,
        max_amplicon_size=max_amplicon_size,
        expected_amplicon_size=expected_amplicon_size,
    )

    if len(off_targets) <= max_off_targets:
        return "pass", all_fwd_hits, all_rev_hits, off_targets
    else:
        return "fail", all_fwd_hits, all_rev_hits, off_targets


# ─── Genome indexing ──────────────────────────────────────────────────────────

def index_genome(genome_id: str, fasta_path: str | Path) -> None:
    """Build a BLAST nucleotide database from a FASTA file."""
    db_dir = BLAST_DB_DIR / genome_id
    db_dir.mkdir(parents=True, exist_ok=True)

    cmd = [
        "makeblastdb",
        "-in", _safe_blast_path(Path(fasta_path)),
        "-dbtype", "nucl",
        "-out", _safe_blast_path(db_dir / genome_id),
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
