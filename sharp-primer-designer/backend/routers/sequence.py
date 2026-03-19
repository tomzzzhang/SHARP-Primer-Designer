"""Template sequence input: NCBI accession fetch."""

from __future__ import annotations

import os

from fastapi import APIRouter, HTTPException

from core.models import FetchSequenceRequest, FetchSequenceResponse

router = APIRouter(prefix="/api/sequence", tags=["sequence"])


@router.post("/fetch", response_model=FetchSequenceResponse)
def fetch_sequence(req: FetchSequenceRequest):
    """Fetch a nucleotide sequence from NCBI by accession."""
    try:
        from Bio import Entrez, SeqIO
        from io import StringIO
    except ImportError as exc:
        raise HTTPException(500, "Biopython not installed") from exc

    email = os.environ.get("NCBI_EMAIL", "support@sharpdx.com")
    Entrez.email = email

    try:
        handle = Entrez.efetch(
            db="nucleotide",
            id=req.accession,
            rettype="fasta",
            retmode="text",
        )
        fasta_text = handle.read()
        handle.close()
    except Exception as exc:
        raise HTTPException(502, f"NCBI fetch failed: {exc}") from exc

    try:
        record = SeqIO.read(StringIO(fasta_text), "fasta")
    except Exception as exc:
        raise HTTPException(422, f"Could not parse NCBI response: {exc}") from exc

    return FetchSequenceResponse(
        accession=req.accession,
        name=record.description,
        length=len(record.seq),
        sequence=str(record.seq).upper(),
    )
