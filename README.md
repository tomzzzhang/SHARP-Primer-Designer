# SHARP Primer Designer

**Last Updated:** 2026-04-01 17:00 PST

A local web application for designing and analyzing primer pairs for SHARP Diagnostics' isothermal amplification platform.

## Features

### Primer Builder
- **Primer3-powered design** with configurable constraints (length, Tm, GC%, poly-X, self-complementarity, hairpin)
- **Constraint enable/disable** -- uncheck any parameter to ignore it entirely (sets permissive bounds + zero penalty weight)
- **Position diversity** -- Off, Sparse, Spread, or Coverage mode to spread primers across the template
- **Multi-method Tm analysis** -- SantaLucia (primer3), SantaLucia (Biopython), Owczarzy 2008, Wallace rule
- **Multiple condition profiles** -- compare Tm across different buffer conditions (SHARP CutSmart, IDT, NEB, or custom)
- **BLAST+ specificity screening** -- local off-target detection with thermodynamic Tm filtering per hit
- **Export package** -- zip with IDT bulk order sheet (.xlsx), Notion record (.json), and summary (.md)
- **Import** -- reload previously exported records
- **Saved configs** -- save/load named parameter presets
- **Settings persistence** -- all constraints and settings saved across browser sessions

### Primer Checker
- **Analyze existing primers** -- enter one or more sequences, get full property analysis without running a design
- **Multi-primer input** -- one sequence per line, any number of primers
- **Pair thermodynamics** -- heterodimer analysis when exactly 2 primers entered
- **BLAST screening** -- same off-target detection as the Builder
- **Saved primer sets** -- save/load named sets for quick recall
- **Design Similar** -- derive Builder constraints from checked primer properties
- **Export JSON** -- download full analysis for archival or Notion population

### Shared Infrastructure
- **Template input** -- paste sequence, upload FASTA, or fetch by NCBI accession
- **Saved sequences** -- store frequently used templates
- **Interactive results** -- sortable table, visual template map, detailed thermodynamic views
- **BLAST hit display** -- on-target hits (green), viable off-targets (red Tm), sub-threshold hits (faded)
- **Parameter reference** -- built-in help tooltips and full parameter documentation

## Architecture

```
Browser (React + Vite)          FastAPI Backend
http://localhost:5173    <-->    http://localhost:8000
                                  |-- primer3-py (design + thermo)
                                  |-- Biopython (Tm methods, Entrez)
                                  |-- BLAST+ (off-target screening)
                                  |-- JSON storage (profiles, sequences, configs)
```

## Prerequisites

- **Python 3.10+** (Anaconda or Miniconda recommended)
- **Node.js 18+**
- **NCBI BLAST+** — required for the Specificity (BLAST) screening feature. **The setup script will install it automatically** on macOS (via Homebrew) and Linux (via apt/dnf). If auto-install fails or you're on Windows, install manually:

  | Platform | Command |
  |---|---|
  | macOS (Homebrew) | `brew install blast` |
  | Ubuntu / Debian | `sudo apt install ncbi-blast+` |
  | Windows | Download installer from [NCBI BLAST+ releases](https://ftp.ncbi.nlm.nih.gov/blast/executables/blast+/LATEST/) |

  > **Note:** The app searches `/usr/local/bin`, `/opt/homebrew/bin`, and system PATH automatically — no manual PATH configuration needed on macOS or Linux.

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

Setup creates a conda environment `sharp`, installs all dependencies (including BLAST+), and indexes reference genomes (Lambda phage + E. coli K-12) for BLAST screening.

On first launch, the app is pre-loaded with:
- **Lambda phage** sequence (48.5 kbp) in Saved Sequences
- **Lambda + E. coli K-12** BLAST databases for off-target screening
- **MicroMole 33** and **L200a** design parameter presets

## Running

Double-click **`launcher.py`** (or **`SHARP Primer Designer.bat`** on Windows).

The launcher auto-starts the app, opens your browser, and shows a simple status window. Close the launcher window to stop everything.

To reopen the browser if the tab was closed, click **Open in Browser** in the launcher.

## Quick Start

1. **Enter a template** -- paste a DNA sequence, upload FASTA, or enter an NCBI accession
2. **Adjust constraints** -- modify parameters, enable/disable as needed (hover ? icons for explanations)
3. **Click "Design Primers"** -- results stream in with real-time progress
4. **Review results** -- click any pair to see Tm grid, thermodynamics, and BLAST hits
5. **Export** -- check pairs, enter a target name, download the export package

To check existing primers, switch to the **Checker** tab in the header.

## Key Principle

SHARP is not PCR. Tm does not predict SHARP isothermal amplification performance. The tool computes Tm under multiple methods and conditions for reference, not as a predictor. All estimates are displayed transparently.

## License

Internal use -- SHARP Diagnostics.
