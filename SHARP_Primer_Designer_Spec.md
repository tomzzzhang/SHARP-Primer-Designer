# SHARP Primer Designer — Project Specification

**Last Updated:** 2026-05-04 PST — Claude

## Overview

A local web application for designing primer pairs against user-provided DNA templates. Built for SHARP Diagnostics' isothermal amplification platform. Wraps primer3-py as the core design engine with multi-method Tm analysis, off-target specificity screening via local BLAST+, and saveable reaction condition profiles.

**Architecture:** Python backend (FastAPI) + React frontend (Vite), running on localhost. Single repo. No cloud deployment for v1.

**Key principle:** SHARP is not PCR. Tm's relationship to SHARP isothermal amplification performance is not established. The tool computes Tm under multiple methods and conditions for reference, not as a predictor of performance. Display all estimates transparently; do not privilege any single method.

---

## System Architecture

```
┌─────────────────────────────────────────────────────┐
│  Browser (React + Vite)                             │
│  http://localhost:5173                              │
└──────────────────────┬──────────────────────────────┘
                       │ REST API (JSON)
┌──────────────────────▼──────────────────────────────┐
│  FastAPI Backend                                    │
│  http://localhost:8000                              │
│                                                     │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────────┐ │
│  │ Primer3-py  │ │ Biopython    │ │ BLAST+       │ │
│  │ (design +   │ │ (Tm methods, │ │ (off-target  │ │
│  │  thermo)    │ │  Entrez)     │ │  screening)  │ │
│  └─────────────┘ └──────────────┘ └──────────────┘ │
│                                                     │
│  ┌──────────────────────────────────────────┐       │
│  │ Local Storage (JSON/SQLite)              │       │
│  │ - Condition profiles                     │       │
│  │ - Reference genomes index                │       │
│  │ - Design history (optional)              │       │
│  └──────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────┘
```

---

## Technology Stack

| Layer | Technology | Version | Why |
|-------|-----------|---------|-----|
| Backend framework | FastAPI | latest | Async, auto-generated API docs at /docs |
| Primer design engine | primer3-py | >=2.0.0 | C bindings to libprimer3, industry standard |
| Tm / thermodynamics | primer3-py + Biopython (Bio.SeqUtils.MeltingTemp) | Biopython >=1.80 | Multiple Tm methods and salt corrections |
| Sequence fetch | Biopython (Bio.Entrez, Bio.SeqIO) | — | NCBI accession auto-fetch |
| Off-target screening | NCBI BLAST+ (local install) | >=2.14 | blastn-short for primer specificity, no rate limits |
| Frontend framework | React | 18+ | SPA, component-based |
| Frontend build | Vite | latest | Fast dev server, HMR |
| UI components | shadcn/ui + Tailwind CSS | — | Clean, accessible components |
| State management | React state + context | — | No Redux needed for this scope |
| Local storage | JSON files on disk | — | Condition profiles, genome registry |

### Required system dependencies (must be installed separately)

- Python 3.10+ (via conda env `sharp`)
- Node.js 18+
- NCBI BLAST+ command-line tools (`blastn`, `makeblastdb`)
  - macOS: `brew install blast`
  - Ubuntu: `sudo apt install ncbi-blast+`
  - Windows: download installer from NCBI FTP (bioconda doesn't have BLAST+ for win-64)

---

## Directory Structure

```
sharp-primer-designer/
├── backend/
│   ├── main.py                  # FastAPI app entry point
│   ├── routers/
│   │   ├── design.py            # POST /api/design — run primer3 + analysis
│   │   ├── blast.py             # BLAST screening endpoints
│   │   ├── profiles.py          # CRUD for condition profiles
│   │   ├── genomes.py           # Genome management (add/list/delete)
│   │   └── sequence.py          # Template input: paste, upload, NCBI fetch
│   ├── core/
│   │   ├── primer_engine.py     # Wrapper around primer3-py design
│   │   ├── tm_analysis.py       # Multi-method Tm computation
│   │   ├── blast_screen.py      # BLAST+ subprocess wrapper
│   │   └── models.py            # Pydantic models for all request/response types
│   ├── data/
│   │   ├── profiles.json        # Saved condition profiles
│   │   ├── genomes/             # BLAST databases (FASTA + index files)
│   │   │   └── lambda/          # Pre-shipped: Lambda phage (J02459)
│   │   └── defaults.py          # SHARP default parameters
│   ├── requirements.txt
│   └── tests/
│       ├── test_primer_engine.py
│       ├── test_tm_analysis.py
│       └── test_blast_screen.py
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/
│   │   │   ├── TemplateInput.jsx       # Sequence input (paste/upload/accession)
│   │   │   ├── ConstraintsPanel.jsx    # Primer + amplicon constraints
│   │   │   ├── ProfileManager.jsx      # Condition profiles CRUD
│   │   │   ├── GenomeManager.jsx       # Reference genome management
│   │   │   ├── ResultsTable.jsx        # Ranked primer pairs
│   │   │   ├── PairDetail.jsx          # Expanded view per pair
│   │   │   ├── TmGrid.jsx             # Multi-method x multi-profile Tm table
│   │   │   └── BlastHits.jsx          # Off-target hit display
│   │   ├── api/
│   │   │   └── client.js              # Fetch wrapper for backend API
│   │   └── lib/
│   │       └── defaults.js            # Mirror of backend defaults for form init
│   ├── package.json
│   └── vite.config.js                 # Proxy /api to localhost:8000
├── scripts/
│   ├── setup.sh                       # Install deps, build BLAST DBs
│   └── start.sh                       # Launch backend + frontend
├── README.md
└── .env                               # NCBI email for Entrez (required)
```

---

## Backend API Endpoints

### POST /api/design

The main endpoint. Accepts all inputs, runs the full pipeline, returns ranked primer pairs.

**Request body:**

```json
{
  "template": {
    "sequence": "ATCG...",          // Direct sequence (one of these three)
    "fasta_file": "base64...",      // Uploaded FASTA (one of these three)
    "accession": "J02459",          // NCBI accession (one of these three)
    "target_start": 41900,          // Optional: target region start (1-indexed)
    "target_length": 300,           // Optional: target region length
    "excluded_regions": [[100, 50]] // Optional: list of [start, length] to exclude
  },
  "primer_constraints": {
    "length_min": 17,
    "length_opt": 22,
    "length_max": 28,
    "tm_min": 54.0,
    "tm_opt": 62.0,
    "tm_max": 68.0,
    "gc_min": 30.0,
    "gc_opt": 50.0,
    "gc_max": 70.0,
    "max_poly_x": 4,
    "max_self_complementarity": 8.0,
    "max_self_end_complementarity": 3.0,
    "max_hairpin_th": 47.0
  },
  "pair_constraints": {
    "max_tm_diff": 3.0,
    "max_pair_complementarity": 8.0,
    "max_pair_end_complementarity": 3.0
  },
  "amplicon_constraints": {
    "size_min": 100,
    "size_opt": 200,
    "size_max": 500
  },
  "reaction_conditions": {
    "primary_profile_id": "sharp_cutsmart",
    "additional_profile_ids": ["idt_oligoanalyzer", "neb_standard"]
  },
  "specificity": {
    "genome_ids": ["lambda"],
    "enabled": true,
    "evalue_threshold": 1000,
    "min_alignment_length": 15,
    "max_off_targets": 0
  },
  "num_pairs": 10
}
```

**Response body:**

```json
{
  "template_info": {
    "name": "Lambda phage",
    "length": 48502,
    "accession": "J02459",
    "target_region": [41900, 42200]
  },
  "pairs": [
    {
      "rank": 1,
      "penalty_score": 0.234,
      "forward": {
        "sequence": "GGTGCGGTGAATGCAAAGAAGAT",
        "start": 41966,
        "end": 41988,
        "length": 23,
        "gc_percent": 47.8,
        "tm_grid": {
          "santalucia_primer3": {
            "sharp_cutsmart": 60.0,
            "idt_oligoanalyzer": 65.6,
            "neb_standard": 63.1
          },
          "santalucia_biopython": {
            "sharp_cutsmart": 59.1,
            "idt_oligoanalyzer": 65.7,
            "neb_standard": 62.4
          },
          "owczarzy_2008": {
            "sharp_cutsmart": 61.2,
            "idt_oligoanalyzer": 66.1,
            "neb_standard": 63.8
          },
          "wallace": {
            "_": 66.0
          }
        },
        "hairpin_dg": -1.2,
        "hairpin_tm": 32.1,
        "homodimer_dg": -5.8,
        "homodimer_tm": 18.4,
        "end_stability": -6.2,
        "blast_hits": []
      },
      "reverse": {
        "...same structure..."
      },
      "pair": {
        "amplicon_size": 201,
        "heterodimer_dg": -4.1,
        "heterodimer_tm": 12.3,
        "tm_diff": {
          "santalucia_primer3": {
            "sharp_cutsmart": 0.3,
            "idt_oligoanalyzer": 0.5
          }
        }
      },
      "specificity": {
        "status": "pass",
        "off_target_amplicons": [],
        "fwd_hits_total": 1,
        "rev_hits_total": 1
      }
    }
  ],
  "design_metadata": {
    "primer3_version": "2.6.1",
    "blast_version": "2.14.0",
    "total_candidates_screened": 47,
    "filtered_by_blast": 3,
    "timestamp": "2026-03-16T14:30:00Z"
  }
}
```

### GET /api/profiles

List all saved condition profiles.

### POST /api/profiles

Create a new condition profile.

### PUT /api/profiles/{id}

Update a condition profile.

### DELETE /api/profiles/{id}

Delete a condition profile.

### GET /api/genomes

List available reference genomes (name, id, size, indexed status).

### POST /api/genomes

Add a genome. Accepts: FASTA upload, NCBI accession (auto-fetch), or paste sequence. Auto-runs `makeblastdb` to index.

### DELETE /api/genomes/{id}

Remove a genome and its BLAST index.

### POST /api/sequence/fetch

Fetch a sequence from NCBI by accession. Returns parsed FASTA.

---

## Core Modules — Detailed Specs

### primer_engine.py

Wraps primer3-py's `design_primers()` function.

```python
import primer3

def design_primers(
    template_seq: str,
    target_region: tuple[int, int] | None,
    excluded_regions: list[tuple[int, int]] | None,
    primer_constraints: PrimerConstraints,
    pair_constraints: PairConstraints,
    amplicon_constraints: AmpliconConstraints,
    reaction_conditions: ReactionConditions,  # Primary profile for primer3 Tm calc
    num_return: int = 10,
    overshoot_factor: int = 3,  # Generate 3x candidates to allow BLAST filtering
) -> list[PrimerPair]:
    ...
```

**Key primer3 settings mapping:**

```python
seq_args = {
    'SEQUENCE_TEMPLATE': template_seq,
    'SEQUENCE_TARGET': [target_start, target_length],  # if specified
    'SEQUENCE_EXCLUDED_REGION': excluded_regions,       # if specified
}

global_args = {
    # Primer size
    'PRIMER_MIN_SIZE': primer_constraints.length_min,
    'PRIMER_OPT_SIZE': primer_constraints.length_opt,
    'PRIMER_MAX_SIZE': primer_constraints.length_max,

    # Primer Tm (uses primary profile conditions)
    'PRIMER_MIN_TM': primer_constraints.tm_min,
    'PRIMER_OPT_TM': primer_constraints.tm_opt,
    'PRIMER_MAX_TM': primer_constraints.tm_max,

    # GC
    'PRIMER_MIN_GC': primer_constraints.gc_min,
    'PRIMER_OPT_GC_PERCENT': primer_constraints.gc_opt,
    'PRIMER_MAX_GC': primer_constraints.gc_max,

    # Self-complementarity
    'PRIMER_MAX_SELF_ANY_TH': primer_constraints.max_self_complementarity,
    'PRIMER_MAX_SELF_END_TH': primer_constraints.max_self_end_complementarity,
    'PRIMER_MAX_HAIRPIN_TH': primer_constraints.max_hairpin_th,

    # Pair
    'PRIMER_PAIR_MAX_DIFF_TM': pair_constraints.max_tm_diff,
    'PRIMER_PAIR_MAX_COMPL_ANY_TH': pair_constraints.max_pair_complementarity,
    'PRIMER_PAIR_MAX_COMPL_END_TH': pair_constraints.max_pair_end_complementarity,

    # Amplicon
    'PRIMER_PRODUCT_SIZE_RANGE': [[
        amplicon_constraints.size_min,
        amplicon_constraints.size_max
    ]],
    'PRIMER_PRODUCT_OPT_SIZE': amplicon_constraints.size_opt,

    # Poly-X
    'PRIMER_MAX_POLY_X': primer_constraints.max_poly_x,

    # Salt conditions (from primary profile)
    'PRIMER_SALT_MONOVALENT': reaction_conditions.na_mm + reaction_conditions.k_mm,
    'PRIMER_SALT_DIVALENT': reaction_conditions.mg_mm,
    'PRIMER_DNTP_CONC': reaction_conditions.dntps_mm,
    'PRIMER_DNA_CONC': reaction_conditions.primer_nm,

    # Thermodynamic calculation method
    'PRIMER_TM_FORMULA': 1,  # SantaLucia 1998
    'PRIMER_SALT_CORRECTIONS': 1,  # SantaLucia 1998

    # Number to return (overshoot for BLAST filtering)
    'PRIMER_NUM_RETURN': num_return * overshoot_factor,
}

results = primer3.design_primers(seq_args, global_args)
```

### tm_analysis.py

Computes Tm for a given primer sequence under every combination of (method x profile).

```python
from Bio.SeqUtils import MeltingTemp as mt
import primer3

TM_METHODS = {
    "santalucia_primer3": _calc_santalucia_primer3,    # primer3-py C implementation
    "santalucia_biopython": _calc_santalucia_biopython, # Biopython Tm_NN, SantaLucia 1998 table
    "owczarzy_2008": _calc_owczarzy,                    # Biopython Tm_NN with saltcorr=7 (Owczarzy 2008)
    "wallace": _calc_wallace,                            # Biopython Tm_Wallace (rule of thumb, no salt)
}
```

**Method implementations:**

```python
def _calc_santalucia_primer3(seq: str, profile: ConditionProfile) -> float:
    """primer3-py's ThermoAnalysis. C bindings to libprimer3."""
    calc = primer3.thermoanalysis.ThermoAnalysis(
        mv_conc=profile.na_mm + profile.k_mm,
        dv_conc=profile.mg_mm,
        dntp_conc=profile.dntps_mm,
        dna_conc=profile.primer_nm,
    )
    return calc.calc_tm(seq)

def _calc_santalucia_biopython(seq: str, profile: ConditionProfile) -> float:
    """Biopython Tm_NN with SantaLucia 1998 table, saltcorr=5 (SantaLucia 1998)."""
    return mt.Tm_NN(
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

def _calc_owczarzy(seq: str, profile: ConditionProfile) -> float:
    """Biopython Tm_NN with Owczarzy 2008 salt correction (best for Mg++ conditions)."""
    return mt.Tm_NN(
        seq,
        Na=profile.na_mm,
        K=profile.k_mm,
        Tris=profile.tris_mm,
        Mg=profile.mg_mm,
        dNTPs=profile.dntps_mm,
        dnac1=profile.primer_nm,
        dnac2=profile.primer_nm,
        saltcorr=7,  # Owczarzy et al. 2008
    )

def _calc_wallace(seq: str, profile: ConditionProfile) -> float:
    """Wallace rule: 2(A+T) + 4(G+C). No salt correction. For short oligos only."""
    return mt.Tm_Wallace(seq)
```

**Additional thermodynamic analysis (per primer):**

```python
def analyze_primer_thermo(seq: str, profile: ConditionProfile) -> dict:
    """Full thermodynamic characterization of a single primer."""
    calc = primer3.thermoanalysis.ThermoAnalysis(
        mv_conc=profile.na_mm + profile.k_mm,
        dv_conc=profile.mg_mm,
        dntp_conc=profile.dntps_mm,
        dna_conc=profile.primer_nm,
    )
    hairpin = calc.calc_hairpin(seq)
    homodimer = calc.calc_homodimer(seq)

    return {
        "hairpin_dg": hairpin.dg / 1000,   # kcal/mol
        "hairpin_tm": hairpin.tm,
        "homodimer_dg": homodimer.dg / 1000,
        "homodimer_tm": homodimer.tm,
        "end_stability": calc.calc_end_stability(seq).dg / 1000,
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
        "heterodimer_dg": heterodimer.dg / 1000,
        "heterodimer_tm": heterodimer.tm,
    }
```

### blast_screen.py

Runs local BLAST+ for specificity screening.

```python
import subprocess
import tempfile
from pathlib import Path

BLAST_DB_DIR = Path("data/genomes")

def screen_primer(
    primer_seq: str,
    genome_id: str,
    evalue: float = 1000,
    word_size: int = 7,
) -> list[BlastHit]:
    """
    Run blastn-short against a local BLAST database.
    Returns list of hits with position, identity, alignment length.
    """
    db_path = BLAST_DB_DIR / genome_id / genome_id

    with tempfile.NamedTemporaryFile(mode='w', suffix='.fasta', delete=False) as f:
        f.write(f">query\n{primer_seq}\n")
        query_path = f.name

    cmd = [
        "blastn",
        "-task", "blastn-short",
        "-query", query_path,
        "-db", str(db_path),
        "-evalue", str(evalue),
        "-word_size", str(word_size),
        "-outfmt", "6 sseqid sstart send pident length mismatch gapopen evalue bitscore qstart qend sstrand",
        "-dust", "no",       # Don't mask low-complexity in short seqs
        "-num_threads", "2",
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    return parse_blast_output(result.stdout)


def check_pair_off_target_amplicons(
    fwd_hits: list[BlastHit],
    rev_hits: list[BlastHit],
    max_amplicon_size: int = 2000,
) -> list[OffTargetAmplicon]:
    """
    Check if any combination of fwd + rev off-target hits could produce
    a spurious amplicon (same reference, opposite strands, within distance).
    """
    amplicons = []
    for fh in fwd_hits:
        for rh in rev_hits:
            if fh.subject_id != rh.subject_id:
                continue
            # Check orientation and distance
            if fh.strand == "plus" and rh.strand == "minus":
                distance = rh.subject_start - fh.subject_end
                if 0 < distance < max_amplicon_size:
                    amplicons.append(OffTargetAmplicon(
                        subject=fh.subject_id,
                        fwd_pos=fh.subject_start,
                        rev_pos=rh.subject_start,
                        size=distance + len(fh) + len(rh),
                    ))
    return amplicons


def index_genome(genome_id: str, fasta_path: str):
    """Build BLAST database from a FASTA file."""
    db_dir = BLAST_DB_DIR / genome_id
    db_dir.mkdir(parents=True, exist_ok=True)

    cmd = [
        "makeblastdb",
        "-in", fasta_path,
        "-dbtype", "nucl",
        "-out", str(db_dir / genome_id),
        "-title", genome_id,
    ]
    subprocess.run(cmd, check=True)
```

---

## Condition Profiles

Stored as JSON at `backend/data/profiles.json`.

### Schema

```json
{
  "profiles": [
    {
      "id": "sharp_cutsmart",
      "name": "SHARP CutSmart",
      "na_mm": 50.0,
      "k_mm": 0.0,
      "tris_mm": 0.0,
      "mg_mm": 2.0,
      "dntps_mm": 0.8,
      "primer_nm": 200.0,
      "is_default": true,
      "editable": true
    },
    {
      "id": "idt_oligoanalyzer",
      "name": "IDT OligoAnalyzer",
      "na_mm": 50.0,
      "k_mm": 0.0,
      "tris_mm": 0.0,
      "mg_mm": 3.0,
      "dntps_mm": 0.8,
      "primer_nm": 200.0,
      "is_default": false,
      "editable": true
    },
    {
      "id": "idt_primerquest_sharp",
      "name": "IDT PrimerQuest (SHARP params)",
      "na_mm": 50.0,
      "k_mm": 0.0,
      "tris_mm": 0.0,
      "mg_mm": 2.0,
      "dntps_mm": 2.0,
      "primer_nm": 500.0,
      "is_default": false,
      "editable": true
    }
  ]
}
```

### Pre-shipped profiles

| Profile | Na+ | K+ | Tris | Mg++ | dNTPs | Primer conc | Notes |
|---------|-----|----|------|------|-------|-------------|-------|
| SHARP CutSmart | 50 | 0 | 0 | 2 | 0.8 | 200 nM | Current kit buffer, primary profile |
| IDT OligoAnalyzer | 50 | 0 | 0 | 3 | 0.8 | 200 nM | For cross-referencing IDT Tm values |
| IDT PrimerQuest (SHARP params) | 50 | 0 | 0 | 2 | 2 | 500 nM | Parameters from IDT PrimerQuest SHARP design session |
| NEB Standard PCR | 50 | 0 | 0 | 1.5 | 0.8 | 200 nM | Typical PCR buffer baseline |

---

## SHARP Default Primer Design Parameters

These are the pre-loaded defaults when the tool opens. All are user-editable.

### Primer constraints

| Parameter | Min | Optimal | Max | Notes |
|-----------|-----|---------|-----|-------|
| Length (nt) | 17 | 22 | 28 | SHARP primers trend longer than typical PCR (18-25) |
| Tm (°C) | 54 | 62 | 68 | Under primary profile conditions |
| GC (%) | 30 | 50 | 70 | |
| Max poly-X | — | — | 4 | |
| Max self-complementarity (Th) | — | — | 47.0 | Thermodynamic, °C |
| Max 3' self-complementarity (Th) | — | — | 47.0 | Thermodynamic, °C |
| Max hairpin Tm | — | — | 47.0 | |

### Pair constraints

| Parameter | Value |
|-----------|-------|
| Max Tm difference | 3.0 °C |
| Max pair complementarity (Th) | 47.0 |
| Max pair 3' complementarity (Th) | 47.0 |

### Amplicon constraints

| Parameter | Min | Optimal | Max |
|-----------|-----|---------|-----|
| Size (bp) | 100 | 200 | 500 |

---

## Frontend Layout

### Main page — three sections

```
┌─────────────────────────────────────────────────────────────────────┐
│ SHARP Primer Designer                                    [Settings] │
├──────────────────────┬──────────────────────────────────────────────┤
│                      │                                              │
│  TEMPLATE INPUT      │  RESULTS TABLE                               │
│  ┌────────────────┐  │  ┌──────────────────────────────────────┐    │
│  │ [Paste] [Upload]│  │  │ Rank │ Fwd         │ Rev         │ ... │ │
│  │ [Accession]    │  │  │  1   │ GGTGCGGT... │ TTTCTGGT... │     │ │
│  │                │  │  │  2   │ TCGGTGCG... │ TCTGGTGC... │     │ │
│  │ textarea /     │  │  │  3   │ ...         │ ...         │     │ │
│  │ file drop      │  │  └──────────────────────────────────────┘    │
│  └────────────────┘  │                                              │
│                      │  EXPANDED PAIR DETAIL (on click)             │
│  PRIMER CONSTRAINTS  │  ┌──────────────────────────────────────┐    │
│  ┌────────────────┐  │  │ Tm Grid (methods x profiles)         │    │
│  │ Length: 17-28  │  │  │ ΔG Breakdown (hairpin, dimer, etc)   │    │
│  │ Tm: 54-68     │  │  │ BLAST Hits                           │    │
│  │ GC: 30-70     │  │  │ Template Map (primer positions)      │    │
│  │ Poly-X: 4     │  │  └──────────────────────────────────────┘    │
│  │ ...           │  │                                              │
│  └────────────────┘  │                                              │
│                      │                                              │
│  AMPLICON            │                                              │
│  ┌────────────────┐  │                                              │
│  │ Size: 100-500 │  │                                              │
│  └────────────────┘  │                                              │
│                      │                                              │
│  SPECIFICITY         │                                              │
│  ┌────────────────┐  │                                              │
│  │ ☑ Lambda       │  │                                              │
│  │ ☐ E. coli     │  │                                              │
│  │ [Add genome]  │  │                                              │
│  └────────────────┘  │                                              │
│                      │                                              │
│  # Pairs: [10 ▼]    │                                              │
│                      │                                              │
│  [Design Primers]    │                                              │
│                      │                                              │
└──────────────────────┴──────────────────────────────────────────────┘
```

### Settings modal

- **Condition Profiles tab:** List of profiles, add/edit/delete, set primary
- **Reference Genomes tab:** List of indexed genomes, add (paste/upload/accession), delete
- **About tab:** Versions of primer3, BLAST, Biopython

### Results table columns

| Column | Description |
|--------|-------------|
| Rank | Overall rank by penalty score |
| Fwd Sequence | Forward primer sequence |
| Rev Sequence | Reverse primer sequence |
| Amplicon Size | bp |
| Fwd Tm / Rev Tm | Under primary profile, SantaLucia method |
| ΔTm | Absolute Tm difference between Fwd and Rev |
| Fwd GC / Rev GC | % |
| Penalty | primer3 penalty score (lower = better) |
| Specificity | Green check (pass) / Red flag (off-target hits) / Gray dash (not screened) |
| Actions | Expand detail, copy sequences, export |

### Expanded pair detail

Shows when user clicks a row. Contains:

1. **Tm Grid:** Table with rows = Tm methods, columns = condition profiles. Shows both Fwd and Rev.
2. **Thermodynamic Summary:** Hairpin ΔG/Tm, homodimer ΔG/Tm, heterodimer ΔG/Tm, 3' end stability. Per primer and per pair.
3. **BLAST Results:** Table of hits per primer. Columns: subject, position, identity%, alignment length, strand, e-value.
4. **Off-Target Amplicons:** If any fwd+rev hit pair could produce a spurious amplicon, list them with predicted size.
5. **Template Map:** Simple text or SVG showing primer binding positions on the template. Nice to have, not critical for v1.

---

## Pipeline Flow (backend)

```
1. Parse template input
   ├── Direct sequence → validate (ACGT only, length > 0)
   ├── FASTA upload → parse with Biopython SeqIO
   └── Accession → fetch via Biopython Entrez.efetch

2. Run primer3.design_primers()
   - Uses primary condition profile for Tm calculation
   - Returns N * overshoot_factor candidate pairs
   - Each pair includes primer3's penalty score

3. For each candidate pair:
   a. Compute Tm under ALL methods × ALL active profiles → tm_grid
   b. Compute hairpin ΔG, homodimer ΔG, end stability (per primer)
   c. Compute heterodimer ΔG (per pair)

4. If specificity screening enabled:
   a. BLAST each primer (fwd and rev) against each selected genome
   b. Filter hits by e-value threshold and min alignment length
   c. Check for off-target amplicons (fwd+rev hit pairs within amplifiable distance)
   d. Filter out pairs with off-target amplicons (if max_off_targets = 0)

5. Re-rank remaining pairs by primer3 penalty score
6. Return top N pairs with full annotation
```

---

## Data Models (Pydantic)

```python
from pydantic import BaseModel
from enum import Enum

class ConditionProfile(BaseModel):
    id: str
    name: str
    na_mm: float = 50.0
    k_mm: float = 0.0
    tris_mm: float = 0.0
    mg_mm: float = 2.0
    dntps_mm: float = 0.8
    primer_nm: float = 200.0
    is_default: bool = False
    editable: bool = True

class PrimerConstraints(BaseModel):
    length_min: int = 17
    length_opt: int = 22
    length_max: int = 28
    tm_min: float = 54.0
    tm_opt: float = 62.0
    tm_max: float = 68.0
    gc_min: float = 30.0
    gc_opt: float = 50.0
    gc_max: float = 70.0
    max_poly_x: int = 4
    max_self_complementarity: float = 47.0
    max_self_end_complementarity: float = 47.0
    max_hairpin_th: float = 47.0

class PairConstraints(BaseModel):
    max_tm_diff: float = 3.0
    max_pair_complementarity: float = 47.0
    max_pair_end_complementarity: float = 47.0

class AmpliconConstraints(BaseModel):
    size_min: int = 100
    size_opt: int = 200
    size_max: int = 500

class SpecificityConfig(BaseModel):
    genome_ids: list[str] = []
    enabled: bool = True
    evalue_threshold: float = 1000
    min_alignment_length: int = 15
    max_off_targets: int = 0

class BlastHit(BaseModel):
    subject_id: str
    subject_start: int
    subject_end: int
    percent_identity: float
    alignment_length: int
    mismatches: int
    evalue: float
    bitscore: float
    query_start: int
    query_end: int
    strand: str  # "plus" or "minus"

class OffTargetAmplicon(BaseModel):
    subject: str
    fwd_pos: int
    rev_pos: int
    size: int

class TmGrid(BaseModel):
    """Tm values indexed by [method][profile_id]."""
    santalucia_primer3: dict[str, float]
    santalucia_biopython: dict[str, float]
    owczarzy_2008: dict[str, float]
    wallace: dict[str, float]  # Single value, not profile-dependent

class PrimerResult(BaseModel):
    sequence: str
    start: int  # 0-indexed position on template
    end: int
    length: int
    gc_percent: float
    tm_grid: TmGrid
    hairpin_dg: float  # kcal/mol
    hairpin_tm: float
    homodimer_dg: float
    homodimer_tm: float
    end_stability: float
    blast_hits: list[BlastHit]

class PairResult(BaseModel):
    rank: int
    penalty_score: float
    forward: PrimerResult
    reverse: PrimerResult
    amplicon_size: int
    heterodimer_dg: float
    heterodimer_tm: float
    tm_diff: dict[str, dict[str, float]]  # [method][profile] -> abs diff
    specificity_status: str  # "pass", "fail", "not_screened"
    off_target_amplicons: list[OffTargetAmplicon]
```

---

## Pre-shipped Reference Genomes

Ship Lambda phage pre-indexed. Others available for user to add.

On first run (`setup.sh`):
1. Fetch Lambda (J02459) from NCBI
2. Run `makeblastdb` to create index
3. Store in `backend/data/genomes/lambda/`

Commonly needed genomes (user adds via UI):
- E. coli K-12 (U00096)
- Human genome (too large for casual use, GRCh38 is 3GB; warn user)
- SARS-CoV-2 (NC_045512)

---

## Testing Strategy

### Unit tests

- `test_primer_engine.py`: Known Lambda template → expected primer pairs. Verify constraints are respected.
- `test_tm_analysis.py`: Known sequences → expected Tm values under each method/profile. Cross-check against our earlier results (L200a = 62°C under OligoAnalyzer conditions via SantaLucia).
- `test_blast_screen.py`: Known Lambda primer → single hit. Known non-Lambda primer → no hits. Pair of primers → correct amplicon detection.

### Integration test

Full pipeline: Lambda template, L200b region, SHARP defaults → should return L200b-like primers in top results. Verify all output fields populated.

### Validation reference data

Use the IDT PrimerQuest designs from `IDT_PrimerQuest_Designs_09122025.docx` as ground truth:

| Primer | IDT Tm | Our SantaLucia (OligoAnalyzer profile) | Expected match |
|--------|--------|----------------------------------------|----------------|
| L200a Fwd | 62 | ~62.6 (Biopython) / ~61.6 (primer3) | Within 1°C |
| L200b Fwd | 62 | ~66.5 (Biopython) / ~65.6 (primer3) | Known discrepancy — IDT PrimerQuest uses proprietary adjustments |

This discrepancy is documented and expected. Our tool is transparent about which method produced which number.

---

## Future Enhancements (not in v1)

- **Notion Primer Databank export:** One-click push of selected pair to the Primer Databank (database ID: `7f2d0d38-568b-4f61-9b05-843c4fe5a2f2`, Reference Sequences: `b0714e78-6275-456b-beef-76346b7c0441`).
- **SHARP performance scoring:** When enough empirical data exists, add a "predicted SHARP score" column using the GNN transfer learning model (separate project). The Tm grid and ΔG values computed here become input features.
- **Batch design:** Upload a CSV of multiple target regions, design primers for all.
- **Customer-facing deployment:** Host on a server, add auth, pre-load common genomes.
- **Multiplexing check:** Given multiple primer pairs, check all pairwise heterodimers.
- **SHARP Viewer integration:** Embed amplification curve viewer for results validation.

---

## Setup & Run

All SHARP projects share a single conda environment named `sharp`.

### First-time setup

**macOS:**
```bash
cd sharp-primer-designer
./scripts/setup.sh
```

**Windows:**
```cmd
cd sharp-primer-designer
scripts\setup.bat
```

The setup script:
1. Detects conda → uses existing `sharp` env (or creates it)
2. Installs Python deps (primer3-py, biopython, fastapi, uvicorn, etc.)
3. Creates `.env` with NCBI email
4. Fetches Lambda phage and builds BLAST database
5. Runs `npm install` for the frontend

### Run

**macOS:**
```bash
./scripts/start.sh
```

**Windows:**
```cmd
scripts\start.bat
```

Opens both servers and launches the browser at http://localhost:5173. Close the terminal or press Ctrl+C to stop.

### Manual run (if needed)

```bash
# Terminal 1: Backend
cd backend
conda run -n sharp uvicorn main:app --reload --port 8000

# Terminal 2: Frontend
cd frontend
npm run dev
```

---

## Notes for Implementation

1. **primer3-py's Tm vs. our multi-method Tm:** primer3 uses its own internal Tm calculation for the design/filtering step (controlled by `PRIMER_TM_FORMULA` and `PRIMER_SALT_CORRECTIONS`). Our multi-method Tm grid is a post-hoc analysis layer — it doesn't affect which candidates primer3 returns, only how we display them. This is intentional. The design constraints use one consistent method; the display shows all methods for comparison.

2. **BLAST subprocess vs. library:** We use subprocess calls to the BLAST+ command-line tools rather than a Python BLAST library. This is simpler, more reliable, and easier to debug. The overhead of spawning a process is negligible compared to the BLAST search itself.

3. **Overshoot factor:** We ask primer3 for 3x the requested number of pairs, then filter by BLAST, then return the top N. This ensures we have enough candidates after specificity filtering. If BLAST filters out more than 2/3 of candidates, we warn the user that their constraints may be too relaxed or the template has many off-target-prone regions.

4. **Wallace Tm is condition-independent.** It's purely sequence-based (2°C per A/T + 4°C per G/C). It doesn't use salt/Mg/dNTP concentrations at all. In the Tm grid, it shows a single value regardless of profile. This is correct behavior, not a bug.

5. **Primer3's penalty score** is a weighted sum of deviations from optimal values. Lower is better. We display it as-is but should document what it means in the UI (tooltip or help text).

6. **Template coordinates:** primer3 uses 0-indexed positions internally. The UI should display 1-indexed positions (biological convention). Convert at the API boundary.

7. **CORS:** FastAPI backend needs CORS middleware to accept requests from the Vite dev server (localhost:5173 → localhost:8000). Add `CORSMiddleware` with `allow_origins=["http://localhost:5173"]`.
