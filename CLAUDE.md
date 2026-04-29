# CLAUDE.md — SHARP Primer Designer

**Last Updated:** 2026-04-29 PST — Claude

## Session Start Protocol

Read in this order:
1. `STATUS.md` in the OneDrive shared folder (see `CLAUDE.local.md` for path) — current state
2. This file — architecture and decisions
3. `DEV_NOTES.md` in OneDrive — recent design decisions if working in an adjacent area
4. `CLAUDE.local.md` in this directory (not committed) — machine-specific paths and env

## Project Overview

SHARP Primer Designer is an internal R&D tool for designing primer pairs for SHARP Diagnostics' helicase-based (PcrA-M6) isothermal amplification platform. It is not a PCR tool. Tm does not predict SHARP amplification performance. Every primer pair designed and tested is a data point toward discovering a SHARP-specific performance index.

**Users:** Tom (Founding Scientist) and the SHARP R&D team. Not customer-facing.

**Calibration reference:** L200b primers on lambda phage DNA — the known-good positive control.

## Tech Stack

- **Frontend:** React 18 + Vite + Tailwind CSS + custom SHARP brand theme
- **Backend:** FastAPI + uvicorn (Python)
- **Core libs:** primer3-py, Biopython, BLAST+ (subprocess), openpyxl
- **Conda env:** `sharp`
- **Ports:** Frontend `localhost:5173`, Backend `localhost:8000`

## Build and Run

### macOS / Linux
```bash
cd sharp-primer-designer
chmod +x scripts/setup.sh
./scripts/setup.sh          # first time: creates conda env, installs deps, indexes genomes
python launcher.py          # GUI launcher — opens browser automatically
# or directly:
./scripts/start.sh
```

### Windows
```
scripts\setup.bat           # first time setup
SHARP Primer Designer.bat   # double-click launcher
```

## Project Structure

```
sharp-primer-designer/
├── backend/                     FastAPI, localhost:8000
│   ├── main.py                  Entry point, router registration, /health, /api/version
│   │                            Seeds sequences.json + configs.json from *.defaults.json on first run
│   ├── core/
│   │   ├── primer_engine.py     Main pipeline: primer3 → Tm → BLAST → diversity filter
│   │   ├── blast_screen.py      Batched BLAST subprocess wrapper + per-hit Tm filtering
│   │   ├── tm_analysis.py       4-method Tm: SantaLucia/p3, SantaLucia/Biopython, Owczarzy, Wallace
│   │   └── models.py            All Pydantic models
│   ├── routers/
│   │   ├── check.py             POST /api/check — primer property analysis (Checker tab)
│   │   ├── configs.py           GET/POST/PUT/DELETE /api/configs — saved parameter presets
│   │   ├── design.py            POST /api/design/stream — SSE streaming design pipeline
│   │   ├── export.py            POST /api/export (zip download), POST /api/import
│   │   ├── genomes.py           Genome CRUD for BLAST databases
│   │   ├── profiles.py          Condition profile CRUD
│   │   ├── sequence.py          Single sequence fetch (NCBI accession)
│   │   └── sequences.py         GET/POST/DELETE /api/sequences — saved sequences library
│   └── data/
│       ├── sequences.defaults.json   Shipped defaults (Lambda phage pre-loaded)
│       ├── configs.defaults.json     Shipped defaults (MicroMole 33 + L200a presets)
│       ├── profiles.json             Condition profiles (SHARP CutSmart, IDT, NEB, custom)
│       ├── genomes/                  BLAST databases (gitignored, rebuilt by setup)
│       ├── sequences.json            User data — gitignored, seeded from defaults on first run
│       └── configs.json              User data — gitignored, seeded from defaults on first run
├── frontend/                    React 18 + Vite, localhost:5173
│   └── src/
│       ├── App.jsx              Main layout, all state, all event handlers
│       ├── api/client.js        All fetch calls to backend
│       ├── lib/defaults.js      Default parameter values (single source of truth)
│       └── components/
│           ├── ConstraintsPanel.jsx   Left panel: primer3 parameters + enable/disable checkboxes
│           ├── PrimerChecker.jsx      Checker tab: analyze existing primers
│           ├── ResultsTable.jsx       Results grid + export bar
│           ├── TemplateMap.jsx        SVG amplicon position visualization
│           ├── TemplateInput.jsx      Sequence entry (paste / FASTA / NCBI accession)
│           ├── PairDetail.jsx         Expanded pair view with Tm grid + BLAST hits
│           ├── BlastHits.jsx          BLAST hit display component
│           ├── TmGrid.jsx             Tm grid table component
│           ├── GenomeManager.jsx      BLAST genome selection + CRUD
│           ├── ProfileManager.jsx     Condition profile CRUD
│           ├── ParameterReference.jsx Help / parameter reference modal
│           ├── ProgressBar.jsx        Design progress indicator
│           └── SequenceBar.jsx        Sequence ruler (scaffolded, not fully wired)
├── scripts/
│   ├── setup.sh / setup.bat     Environment setup (conda, pip, BLAST+, genome indexing)
│   └── start.sh / start.bat     Start backend + frontend
├── launcher.py                  Tkinter GUI launcher (reads version.txt, opens browser)
├── version.txt                  Single source of truth for version string
└── .env                         Local env vars (gitignored)
```

## Key Design Decisions

### Tm is not a SHARP performance predictor
SHARP uses helicase-based (PcrA-M6) unwinding — thermocycling kinetics don't apply. Tm is stored and displayed for reference only. Never frame it as predictive. The structural Tm thresholds (hairpin, self-comp) are still meaningful as "will this structure form at 65°C?" filters. Off-target BLAST Tm is meaningful as "will this primer bind here at 65°C?".

**Notion Tm convention:** Wallace rule only — `2(A+T) + 4(G+C)`. No salt correction, no concentration assumptions. Full multi-method grid goes in Notes/archival JSON.

### Constraint disable pattern (primer_engine.py)
When a constraint is disabled, you cannot simply omit the primer3 args — primer3 falls back to its own hardcoded defaults and silently restricts results. The correct approach: set very permissive hard bounds AND zero the penalty weights:
```python
# Example: "length" disabled
global_args["PRIMER_MIN_SIZE"] = 10
global_args["PRIMER_MAX_SIZE"] = 60
global_args["PRIMER_WT_SIZE_LT"] = 0.0
global_args["PRIMER_WT_SIZE_GT"] = 0.0
```
This pattern is applied to all 11 constraint keys in `design_primers()`.

### SEQUENCE_INCLUDED_REGION vs SEQUENCE_TARGET
`SEQUENCE_TARGET` makes primer3 design primers that *flank* the region. `SEQUENCE_INCLUDED_REGION` designs primers *within* the region. The code uses `SEQUENCE_INCLUDED_REGION` — changing this back to TARGET will cause zero results when a target region spans most of the template.

### Diversity filter (primer_engine.py: `_apply_diversity_filter`)
primer3 converges on its penalty optimum and returns near-identical pairs from one region. Two-level fix:
1. **primer3 level:** `PRIMER_MIN_LEFT/RIGHT_THREE_PRIME_DISTANCE` forces primer3 to space candidates apart
2. **Post-processing:** Always deduplicates by sequence. Coverage mode uses flat-zone section assignment: template divided into `num_return` equal sections, each candidate assigned to its nearest section center by amplicon midpoint; flat zone = `max(0, (section_size - avg_amplicon_size) / 2)` so quality wins when the amplicon comfortably fits.

### BLAST batch optimization
All unique primer sequences are batched into one multi-sequence FASTA per genome call (not one BLAST per primer). Outfmt includes `qseq sseq` for per-hit Tm calculation. Fast-path: if a primer has ≤1 viable binding site (Tm ≥ threshold), skip amplicon check.

### User data seeding
`sequences.json` and `configs.json` are gitignored (user-editable data). `main.py` seeds them from `*.defaults.json` on first run if they don't exist. Never commit the user data files — commit only the defaults.

## Features (v0.1.0)

### Builder tab
- Primer3-powered design with configurable constraints (length, Tm, GC%, poly-X, self-comp, hairpin, pair-comp, amplicon size)
- Each constraint individually enable/disable — unchecked = permissive bounds + zero penalty weight
- Position diversity modes: Off, Sparse, Spread, Coverage
- Multi-method Tm analysis (4 methods × multiple condition profiles)
- BLAST+ off-target screening with per-hit thermodynamic Tm filtering
- Export: zip with IDT bulk order sheet (.xlsx) + Notion record (.json) + summary (.md)
- Import: reload previously exported records
- Saved configs (named parameter presets)
- Saved sequences library

### Checker tab
- Analyze existing primer sequences without running design
- Multi-primer input (one per line)
- Pair thermodynamics (heterodimer) when exactly 2 primers entered
- BLAST screening
- Saved primer sets
- "Design Similar" — derive Builder constraints from checked primer properties

### Shared
- Template input: paste / FASTA upload / NCBI accession fetch
- Interactive results: sortable table, SVG template map, detailed Tm grid
- Session persistence (localStorage)

## Implementation Roadmap

| Feature | Status |
|---------|--------|
| Primer Builder (primer3 + Tm + BLAST + diversity) | Done |
| Primer Checker | Done |
| Export (IDT xlsx + Notion JSON + summary zip) | Done |
| Import (reload exported JSON) | Done |
| Saved sequences library | Done |
| Saved configs (parameter presets) | Done |
| Condition profiles | Done |
| BLAST+ auto-install in setup | Done |
| SHARP brand theme | Done |
| Session persistence | Done |
| Direct Notion API push | Future |
| Outcome tracking (amplification yes/no annotation) | Future |
| GNN SHARP performance index | Future (depends on data accumulation) |
| L200b comparison panel | Future |
| Batch design from CSV | Future |
| Target region visual slider (SequenceBar.jsx scaffolded) | Future |

## Verification

Before committing or handing off, verify:
```bash
cd sharp-primer-designer/frontend
npm run build          # should complete without errors
```
For backend: start the server and hit `/health` — confirms BLAST is detected.

No automated test runner is wired as an npm/pytest script yet. The test files in `backend/tests/` cover primer engine, BLAST screen, and Tm analysis.

## Cross-Platform Notes

- **OneDrive sync:** Project was previously in OneDrive; now on GitHub. Don't put the repo back in OneDrive (sync conflicts with node_modules and build artifacts).
- **Windows BLAST+:** Must be installed manually (no auto-install on Windows). Download from NCBI. See SETUP_WIN.md in OneDrive.
- **Conda env name:** `sharp` on both platforms.
- **File permissions:** `.command` and shell scripts must be 755 (macOS executable). Batch files, JSON, Python, and JSX source should be 644.
- **`__pycache__`:** Gitignored. Never commit compiled Python bytecode.
