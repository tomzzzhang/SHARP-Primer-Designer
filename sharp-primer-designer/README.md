# SHARP Primer Designer

A local web application for designing primer pairs against user-provided DNA templates. Built for SHARP Diagnostics' isothermal amplification platform.

Wraps **primer3-py** as the core design engine with multi-method Tm analysis, off-target specificity screening via local **BLAST+**, and saveable reaction condition profiles.

## Features

- **Primer3-powered design** with configurable constraints (length, Tm, GC%, poly-X, self-complementarity, hairpin)
- **Multi-method Tm analysis** — SantaLucia (primer3), SantaLucia (Biopython), Owczarzy 2008, Wallace rule
- **Multiple condition profiles** — compare Tm across different buffer conditions (SHARP CutSmart, IDT, NEB, or custom)
- **BLAST+ specificity screening** — local off-target detection against reference genomes (optional, works without BLAST installed)
- **Template input** — paste sequence, upload FASTA, or fetch by NCBI accession
- **Save target sequences** — store frequently used sequences for quick recall
- **Interactive results** — sortable table, visual template map, detailed thermodynamic views, copy-to-clipboard
- **Parameter reference** — built-in help tooltips and full parameter documentation

## Architecture

```
Browser (React + Vite)          FastAPI Backend
http://localhost:5173    <-->    http://localhost:8000
                                  |-- primer3-py (design + thermo)
                                  |-- Biopython (Tm methods, Entrez)
                                  |-- BLAST+ (off-target screening)
                                  |-- JSON storage (profiles, sequences)
```

## Prerequisites

- **Python 3.10+** (Anaconda or Miniconda recommended)
- **Node.js 18+**
- **BLAST+** (optional — for specificity screening)
  - macOS: `brew install blast`
  - Ubuntu: `sudo apt install ncbi-blast+`
  - Windows: [download from NCBI](https://ftp.ncbi.nlm.nih.gov/blast/executables/blast+/LATEST/)

## Setup

### Windows

```
scripts\setup.bat
```

### macOS / Linux

```
chmod +x scripts/setup.sh
./scripts/setup.sh
```

Setup will:
1. Create a conda environment `sharp` (or a Python venv as fallback)
2. Install all Python and Node.js dependencies
3. Index the Lambda phage reference genome for BLAST (if BLAST+ is installed)

## Running

### Windows

Double-click **`SHARP Primer Designer.bat`**, or:

```
scripts\start.bat
```

### macOS

Double-click **`SHARP Primer Designer.command`**, or:

```
./scripts/start.sh
```

Both methods launch a GUI window with Start/Stop controls, health monitoring, and log output. The app opens automatically in your browser at `http://localhost:5173`.

## Quick Start

1. **Enter a template** — paste a DNA sequence, upload a FASTA file, or enter an NCBI accession
2. **Adjust constraints** — modify primer length, Tm, GC%, amplicon size, etc. (hover over `?` icons for explanations)
3. **Select condition profiles** — choose which buffer conditions to compute Tm under
4. **Click "Design Primers"** — results stream in with real-time progress
5. **Review results** — click any pair to see detailed thermodynamics, BLAST hits, and Tm grids

## Project Structure

```
sharp-primer-designer/
├── backend/
│   ├── main.py                 # FastAPI entry point
│   ├── core/
│   │   ├── primer_engine.py    # Primer3 wrapper + analysis pipeline
│   │   ├── tm_analysis.py      # Multi-method Tm computation
│   │   └── blast_screen.py     # BLAST+ integration
│   ├── routers/                # API endpoints
│   ├── data/                   # Profiles, sequences, genome DBs
│   └── tests/
├── frontend/
│   ├── src/
│   │   ├── App.jsx             # Main application
│   │   ├── components/         # UI components
│   │   ├── api/client.js       # API client
│   │   └── lib/                # Defaults and utilities
│   └── package.json
├── scripts/                    # Setup and start scripts
├── launcher.py                 # Cross-platform GUI launcher
├── SHARP Primer Designer.bat   # Windows launcher shortcut
└── SHARP Primer Designer.command  # macOS launcher shortcut
```

## Key Principle

SHARP is not PCR. Tm's relationship to SHARP isothermal amplification performance is not established. The tool computes Tm under multiple methods and conditions for reference, not as a predictor of performance. All estimates are displayed transparently — no single method is privileged.

## License

Internal use — SHARP Diagnostics.
