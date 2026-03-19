"""Fetch Lambda phage genome from NCBI and build a BLAST database.

Run from the backend/ directory:
    python -m scripts.setup_genomes
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

# Add backend to path when run as a module
_BACKEND = Path(__file__).parent.parent
sys.path.insert(0, str(_BACKEND))

from core.blast_screen import BLAST_DB_DIR, index_genome


LAMBDA_ACCESSION = "J02459"
LAMBDA_ID = "lambda"


def setup_lambda():
    genome_dir = BLAST_DB_DIR / LAMBDA_ID
    fasta_path = genome_dir / f"{LAMBDA_ID}.fasta"

    if fasta_path.exists():
        print(f"Lambda FASTA already present at {fasta_path}")
    else:
        print(f"Fetching Lambda phage ({LAMBDA_ACCESSION}) from NCBI...")
        try:
            from Bio import Entrez, SeqIO

            email = os.environ.get("NCBI_EMAIL", "support@sharpdx.com")
            Entrez.email = email
            handle = Entrez.efetch(
                db="nucleotide",
                id=LAMBDA_ACCESSION,
                rettype="fasta",
                retmode="text",
            )
            fasta_text = handle.read()
            handle.close()
            genome_dir.mkdir(parents=True, exist_ok=True)
            fasta_path.write_text(fasta_text)
            print(f"Saved to {fasta_path}")
        except Exception as exc:
            print(f"ERROR: Could not fetch Lambda from NCBI: {exc}")
            sys.exit(1)

    # Check if already indexed
    nhr = genome_dir / f"{LAMBDA_ID}.nhr"
    if nhr.exists():
        print("Lambda BLAST DB already indexed.")
        return

    print("Building BLAST database...")
    try:
        index_genome(LAMBDA_ID, fasta_path)
        print("Lambda BLAST DB ready.")
    except (subprocess.CalledProcessError, FileNotFoundError) as exc:
        print(f"WARNING: Could not build BLAST database: {exc}")
        print("BLAST+ specificity screening will be unavailable.")
        print("Install BLAST+ and re-run setup to enable it.")


if __name__ == "__main__":
    setup_lambda()
