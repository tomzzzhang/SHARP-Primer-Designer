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


GENOMES = [
    {
        "id": "lambda",
        "accession": "J02459",
        "name": "Lambda phage",
        "size_label": "~49 kbp",
    },
    {
        "id": "ecoli_k12",
        "accession": "U00096.3",
        "name": "E. coli K-12 MG1655",
        "size_label": "~4.6 Mbp",
    },
]


def fetch_and_index(genome_id: str, accession: str, name: str, size_label: str):
    """Fetch a genome from NCBI and build its BLAST database."""
    genome_dir = BLAST_DB_DIR / genome_id
    fasta_path = genome_dir / f"{genome_id}.fasta"

    if fasta_path.exists():
        print(f"  {name} FASTA already present")
    else:
        print(f"  Fetching {name} ({accession}, {size_label}) from NCBI...")
        try:
            from Bio import Entrez

            email = os.environ.get("NCBI_EMAIL", "support@sharpdx.com")
            Entrez.email = email
            handle = Entrez.efetch(
                db="nucleotide",
                id=accession,
                rettype="fasta",
                retmode="text",
            )
            fasta_text = handle.read()
            handle.close()
            genome_dir.mkdir(parents=True, exist_ok=True)
            fasta_path.write_text(fasta_text)
            print(f"  Saved to {fasta_path}")
        except Exception as exc:
            print(f"  WARNING: Could not fetch {name} from NCBI: {exc}")
            return

    # Check if already indexed
    nhr = genome_dir / f"{genome_id}.nhr"
    if nhr.exists():
        print(f"  {name} BLAST DB already indexed.")
        return

    print(f"  Building BLAST database for {name}...")
    try:
        index_genome(genome_id, fasta_path)
        print(f"  {name} BLAST DB ready.")
    except (subprocess.CalledProcessError, FileNotFoundError) as exc:
        print(f"  WARNING: Could not build BLAST database: {exc}")
        print("  Install BLAST+ and re-run setup to enable it.")


def setup_all():
    print("Setting up reference genomes for BLAST screening:")
    for genome in GENOMES:
        fetch_and_index(**genome)
    print()


if __name__ == "__main__":
    setup_all()
