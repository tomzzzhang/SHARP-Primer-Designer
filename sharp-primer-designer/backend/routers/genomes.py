"""Reference genome management endpoints."""

from __future__ import annotations

import base64
import os
import re
import shutil
import tempfile
from pathlib import Path

from fastapi import APIRouter, HTTPException

from core.blast_screen import BLAST_DB_DIR, index_genome
from core.models import AddGenomeRequest, GenomeInfo, GenomesResponse

router = APIRouter(prefix="/api/genomes", tags=["genomes"])

_SAFE_ID_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.\-]{0,99}$")


def _validate_genome_id(genome_id: str) -> None:
    """Raise 400 if genome_id contains path-traversal or invalid characters."""
    if not _SAFE_ID_RE.fullmatch(genome_id):
        raise HTTPException(400, "Invalid genome ID: must be 1-100 alphanumeric/underscore/dash/dot characters")


def _count_fasta_bases(fasta_path: Path) -> int:
    total = 0
    with open(fasta_path) as f:
        for line in f:
            if not line.startswith(">"):
                total += len(line.strip())
    return total


def _is_indexed(genome_id: str) -> bool:
    db_dir = BLAST_DB_DIR / genome_id
    # BLAST creates .nhr or .00.nhr for large DBs
    return (db_dir / f"{genome_id}.nhr").exists() or (
        db_dir / f"{genome_id}.00.nhr"
    ).exists()


@router.get("", response_model=GenomesResponse)
def list_genomes():
    genomes = []
    if BLAST_DB_DIR.exists():
        for genome_dir in sorted(BLAST_DB_DIR.iterdir()):
            if not genome_dir.is_dir():
                continue
            genome_id = genome_dir.name
            fasta_path = genome_dir / f"{genome_id}.fasta"
            size = _count_fasta_bases(fasta_path) if fasta_path.exists() else None
            genomes.append(GenomeInfo(
                id=genome_id,
                name=genome_id.replace("_", " ").title(),
                fasta_size_bp=size,
                indexed=_is_indexed(genome_id),
            ))
    return GenomesResponse(genomes=genomes)


@router.post("", response_model=GenomeInfo, status_code=201)
def add_genome(req: AddGenomeRequest):
    _validate_genome_id(req.id)
    genome_dir = BLAST_DB_DIR / req.id
    if genome_dir.exists():
        raise HTTPException(400, f"Genome '{req.id}' already exists")
    genome_dir.mkdir(parents=True)

    fasta_path = genome_dir / f"{req.id}.fasta"

    try:
        if req.fasta_file:
            # Base64-encoded FASTA
            content = base64.b64decode(req.fasta_file).decode("utf-8")
            fasta_path.write_text(content)
        elif req.sequence:
            # Raw FASTA text or plain sequence
            content = req.sequence.strip()
            if not content.startswith(">"):
                content = f">{req.id}\n{content}\n"
            fasta_path.write_text(content)
        elif req.accession:
            # Fetch from NCBI
            _fetch_ncbi_to_file(req.accession, fasta_path)
        else:
            raise HTTPException(400, "Must provide fasta_file, sequence, or accession")

        index_genome(req.id, fasta_path)
    except Exception as exc:
        shutil.rmtree(genome_dir, ignore_errors=True)
        raise HTTPException(500, f"Failed to add genome: {exc}") from exc

    size = _count_fasta_bases(fasta_path)
    return GenomeInfo(
        id=req.id,
        name=req.name,
        fasta_size_bp=size,
        indexed=True,
    )


@router.delete("/{genome_id}", status_code=204)
def delete_genome(genome_id: str):
    _validate_genome_id(genome_id)
    genome_dir = BLAST_DB_DIR / genome_id
    if not genome_dir.exists():
        raise HTTPException(404, f"Genome '{genome_id}' not found")
    shutil.rmtree(genome_dir)


def _fetch_ncbi_to_file(accession: str, dest: Path) -> None:
    """Fetch a sequence from NCBI and write FASTA to dest."""
    import os
    from Bio import Entrez, SeqIO

    email = os.environ.get("NCBI_EMAIL", "support@sharpdx.com")
    Entrez.email = email

    handle = Entrez.efetch(
        db="nucleotide",
        id=accession,
        rettype="fasta",
        retmode="text",
    )
    content = handle.read()
    handle.close()
    dest.write_text(content)
