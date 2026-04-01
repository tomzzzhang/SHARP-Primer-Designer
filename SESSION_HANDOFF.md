# SHARP Primer Designer — Session Handoff
**Branch:** `feature/v1-workflow`
**Repo:** `tomzzzhang/SHARP-Primer-Designer`
**Version key:** K43
**Last updated:** 2026-03-31 21:00 PST

Read `PRIMER_DESIGNER_CONTEXT.md` for product/company context. This document is the coding session handoff — what was built, how it works, every design decision, and current state.

## Current State (as of 2026-03-31)

**K43 is complete and validated.** The tool is fully functional for v1 primer design workflow:
- Designed 20 primer pairs from lambda phage with MicroMole 33 settings (33nt, GC 47-57%, structural filters, Tm disabled, coverage diversity mode)
- All penalty scores 0 -- expected behavior given Tm disabled and all primers hitting 33nt opt exactly (see design notes below)
- Export (zip: IDT .xlsx + Notion JSON + markdown summary) confirmed working
- openpyxl is installed in the `sharp` conda env (was missing; fixed this session)
- MicroMole 33 config preset saved to `data/configs.json` and committed

**PR open:** `feature/v1-workflow` -> `main`. Merge when ready to ship v1.

**Next session focus:** Experimental testing of designed primers. When results come back, the next development priority is outcome tracking (annotate pairs with amplification yes/no, strength) so the tool can start building empirical data toward a SHARP-specific performance index.

---

**Key conceptual note for next session:** SHARP has no equivalent to PCR's Tm as a dimensionally-reduced performance index. Tm predicts PCR because thermocycling is governed by melting kinetics. SHARP uses helicase-based (PcrA-M6) unwinding -- Tm does not predict performance. The structural thresholds (hairpin Tm, self-comp Tm) are still meaningful as "will this structure form at 65C?" filters. The off-target BLAST Tm is still meaningful as "will this primer bind here at 65C?". But there is no known scalar that predicts SHARP amplification efficiency. The tool is in data-collection mode. Every pair designed and tested is a data point toward discovering that index.

---

## Architecture Overview

```
sharp-primer-designer/
├── backend/                  FastAPI (Python), runs on localhost:8000
│   ├── main.py               App entry point, routers, /health, /api/version
│   ├── core/
│   │   ├── models.py         All Pydantic models (DesignRequest, PairResult, etc.)
│   │   ├── primer_engine.py  Main design pipeline (primer3 → Tm → BLAST → diversity)
│   │   ├── blast_screen.py   BLAST subprocess wrapper, batch screening, Tm filtering
│   │   └── tm_analysis.py    4-method Tm calculation (unchanged this session)
│   ├── routers/
│   │   ├── configs.py        Design config presets CRUD (K43)
│   │   ├── design.py         POST /api/design (SSE streaming + sync fallback)
│   │   ├── export.py         POST /api/export (zip download), POST /api/import
│   │   ├── genomes.py        Genome CRUD
│   │   ├── profiles.py       Condition profile CRUD
│   │   └── sequences.py      Saved sequences CRUD
│   └── data/
│       ├── configs.json      Saved design configs / parameter presets (K43)
│       ├── profiles.json     Condition profiles (loaded fresh per request)
│       ├── genomes/          BLAST databases
│       └── sequences.json    Saved sequences library
├── frontend/                 React 18 + Vite + Tailwind, runs on localhost:5173
│   └── src/
│       ├── App.jsx           Main layout, all state, all handlers
│       ├── components/
│       │   ├── ConstraintsPanel.jsx   Left panel: all primer3 parameters + checkboxes
│       │   ├── ResultsTable.jsx       Results grid, export bar, checkboxes
│       │   ├── TemplateMap.jsx        SVG amplicon position visualization
│       │   ├── TemplateInput.jsx      Sequence entry (paste/FASTA/accession)
│       │   ├── SequenceBar.jsx        Sequence ruler/visualization (new)
│       │   └── PairDetail.jsx         Expanded pair view with Tm grids
│       └── lib/
│           └── defaults.js            All default parameter values
├── launcher.py               Tkinter GUI launcher (Mac + Windows)
└── version.txt               Single source of truth for version key (currently "K42")
```

---

## What Was Built This Session

### 0. Bug Fix: `[object Object]` Error Display (K43)

When FastAPI/Pydantic validation errors occurred, the frontend displayed `[object Object]` instead of a readable message. Root cause: `err.detail` from Pydantic is an array of objects, not a string. Added `extractApiError()` helper in `App.jsx` that detects array `detail` and extracts `.msg` from each item. Applied to all three API error sites (design, export, import).

**File:** `frontend/src/App.jsx` — lines 12–16 (helper), lines 253, 339, 376 (usage)

---

### 0b. Save/Load Design Configs (K43)

Server-side persistence for named parameter configurations (presets). Saves all constraint values, enabled flags, diversity mode, num pairs, reaction conditions, BLAST settings, and off-target Tm threshold. Follows the exact same CRUD pattern as saved sequences.

**Backend:**
- `DesignConfig` and `DesignConfigsResponse` models in `core/models.py`
- `routers/configs.py` — GET/POST/PUT/DELETE at `/api/configs`
- `data/configs.json` — JSON file storage

**Frontend:**
- API client methods in `api/client.js`: `getConfigs`, `saveConfigApi`, `updateConfigApi`, `deleteConfigApi`
- State + handlers in `App.jsx`: `savedConfigs`, `handleSaveConfig`, `handleUpdateConfig`, `handleLoadConfig`, `handleDeleteConfig`
- UI in `ConstraintsPanel.jsx`: name input + Save button at top of panel, scrollable list with click-to-load, hover-reveal Update and Delete buttons

**Loading a config sets:** `primerConstraints`, `pairConstraints`, `ampliconConstraints`, `enabledConstraints`, `numPairs`, `diversityMode`, `reactionConditions`, `blastEnabled`, `selectedGenomeIds`, `offTargetTmThreshold`

---

### 1. Constraint Enable/Disable Checkboxes

Each parameter in the constraints panel has a checkbox. Unchecked = primer3 completely ignores that dimension.

**The critical fix (not obvious):** When a constraint is unchecked, you cannot simply omit those primer3 args. primer3 falls back to its own hardcoded defaults (e.g., size 18–27nt, Tm 57–63°C), which silently restricts results. This was causing ~33nt primers to return nothing even with "length" unchecked.

**The correct approach** (in `primer_engine.py`): when disabled, set **both** very permissive hard bounds AND zero the penalty weights:

```python
# Example for "length" disabled:
global_args["PRIMER_MIN_SIZE"] = 10
global_args["PRIMER_MAX_SIZE"] = 60
global_args["PRIMER_OPT_SIZE"] = 20      # irrelevant with zero weights
global_args["PRIMER_WT_SIZE_LT"] = 0.0   # removes from penalty score
global_args["PRIMER_WT_SIZE_GT"] = 0.0
```

This pattern is applied to every constraint. See `primer_engine.py` lines ~180–275 for the full treatment of all 11 constraint keys.

**Frontend keys** (must match backend exactly):
`length`, `tm`, `gc`, `max_poly_x`, `max_self_complementarity`, `max_self_end_complementarity`, `max_hairpin_th`, `max_tm_diff`, `max_pair_complementarity`, `max_pair_end_complementarity`, `amplicon_size`

**Note on GC:** primer3's default penalty weights for GC (`PRIMER_WT_GC_PERCENT_LT/GT`) are already 0.0 — GC is only a hard filter by default, never a penalty contributor. The code still explicitly zeros them for clarity.

---

### 2. Position Diversity Filter (Coverage Mode)

**The problem:** primer3 converges on its penalty optimum and returns N near-identical candidates from one region. Post-hoc filtering has nothing diverse to work with.

**The solution — two-level:**

**Level 1 (primer3 level):** `PRIMER_MIN_LEFT_THREE_PRIME_DISTANCE` and `PRIMER_MIN_RIGHT_THREE_PRIME_DISTANCE` force primer3 itself to space returned primers apart. For coverage mode, spacing = `template_length / (num_return × candidates_per_section)` so candidates span the whole genome.

**Level 2 (post-processing, `_apply_diversity_filter`):**
1. **Sequence deduplication** (all modes including "off"): never return the same fwd or rev primer sequence twice. primer3 often returns many pairs sharing one optimal primer.
2. **Section assignment with flat zone** (coverage mode):
   - Divide template into exactly `num_return` equal sections
   - Compute section centers
   - Assign each candidate to its nearest section center by amplicon midpoint (`fwd.start + amplicon_size/2`)
   - Flat zone radius = `max(0, (section_size - avg_amplicon_size) / 2)` — amplicon can drift this far from section center with zero positional cost
   - Sort by `(positional_penalty, primer3_penalty)` — position fit first, quality second
   - Take one winner per section

**Why flat zone?** If amplicons are 300bp and sections are 4850bp, the amplicon center can be 2275bp either side of section center without costing anything — quality wins in that whole range. If amplicons are larger than sections, every candidate has some positional cost; closest to center wins.

**Bins span full template length**, not just candidate range. Early bug: `lo/hi` was computed from candidate positions, so if all 300 candidates were in a 200bp window, bins were 10bp wide subdivisions of that window. Fixed by using `tlen = template_length` (passed from `design_primers`).

**Modes:**
- `off`: dedup only, pure penalty ranking
- `sparse`: dedup + 10bp min spacing on both fwd and rev starts
- `spread`: dedup + 25bp min spacing
- `coverage`: dedup + flat-zone section assignment (described above)

---

### 3. Export / Import

**Export** (`POST /api/export`): accepts selected pairs + template info + target name → returns `.zip` containing:
- `SHARP_primer_order_YYYYMMDD.xlsx` — IDT bulk order sheet (Name/Sequence/Scale/Purification)
- `SHARP_primer_record_YYYYMMDD.json` — structured Notion record (oligos + pairs + template)
- `SHARP_primer_summary_YYYYMMDD.md` — human-readable summary

Oligo naming: `{target_name}_{rank}_F` / `{target_name}_{rank}_R`. The `target_name` is typed by the user in the export bar (export button is disabled until non-empty). This replaced an earlier approach that used the template name, which defaulted to "Pasted sequence".

**Import** (`POST /api/import`): accepts the `.json` record file, reconstructs `PairResult` objects, returns a `DesignResponse`-shaped dict. The UI marks imported results with an amber "Imported" badge and stores them in session.

**openpyxl** must be installed in the conda env. Added to `requirements.txt` and `setup.sh`.

---

### 4. Session Persistence (localStorage)

After each design or import, the session is saved to `localStorage` under key `sharp_primer_session`. On mount, the session is restored. Saves: `results`, `template`, `resultsSource`.

This prevents losing work on page refresh. The session is intentionally not cleared between designs — new results replace old ones.

---

### 5. Off-Target Tm Threshold

Slider in the specificity section. Controls the minimum Tm a BLAST hit must reach to be considered a viable off-target binding site. Default 45°C.

**Why this matters for SHARP:** The reaction runs at 65°C. Any off-target hit with Tm < 65°C won't actually bind at reaction temperature. The threshold could reasonably be set to 55–60°C for SHARP, which would reduce false-positive off-target calls. The slider lets the user tune this.

**Implementation in `blast_screen.py`:** `calc_hit_tm(hit, profile)` uses `primer3.calc_heterodimer()` with the actual Na/Mg/dNTP/primer concentrations from the condition profile. The hit's `qseq` and `sseq` (query and subject sequences from BLAST output) are used for the Tm calculation.

---

### 6. BLAST Batch Optimization

Instead of one BLAST subprocess per primer per genome (up to 60 calls), all unique primer sequences are batched into a single multi-sequence FASTA and BLAST is called once per genome. Results are mapped back to individual primers by `qseqid`.

BLAST outfmt now includes `qseqid qseq sseq` (15 fields total) to support Tm calculation on the hit sequences.

**Fast-path:** if a primer has ≤1 viable binding site (Tm ≥ threshold), it trivially cannot form an off-target amplicon — skip the amplicon check entirely.

---

### 7. SEQUENCE_INCLUDED_REGION vs SEQUENCE_TARGET (Critical Bug Fix)

`SEQUENCE_TARGET` in primer3 means: design primers that **flank** the region. If the region spans most of the template, primer3 must place primers outside it, which is often impossible.

`SEQUENCE_INCLUDED_REGION` means: design primers **within** the region.

The code was using `SEQUENCE_TARGET`. Changed to `SEQUENCE_INCLUDED_REGION`. This was causing zero results when a target region was set.

---

### 8. Version Key System

**Single source of truth:** `version.txt` at project root (one line, the key).

- **Launcher:** reads `version.txt` at startup, displays `Version  K42` in large blue text in the Tkinter window
- **Backend:** reads `version.txt`, serves at `GET /api/version` → `{"version": "K42"}`
- **Frontend:** fetches `/api/version` on mount, stores in `buildVersion` state, displays next to app title in header

**To update:** edit `version.txt`. Everything else picks it up automatically on next restart/reload.

Current key: **K43**

---

## Key Files — What Changed

### `backend/core/primer_engine.py`

The most heavily modified file. Key sections:

**`_apply_diversity_filter(candidates, mode, num_return, template_length=0)`**
- Always deduplicates by sequence first
- Coverage mode: flat-zone section assignment (not bin-by-fwd-position)
- Sparse/spread: min spacing on both fwd AND rev starts

**`design_primers()` — global_args construction (~lines 180–320)**
- Every constraint has an `if key not in disabled / else permissive + zero weights` pattern
- Coverage mode: `PRIMER_MIN_LEFT/RIGHT_THREE_PRIME_DISTANCE = section_size / candidates_per_section`
- Candidates requested = `num_return × candidates_per_section` (not a fixed large number)

**`design_primers()` — diversity call**
```python
candidates = _apply_diversity_filter(
    candidates, diversity_mode, num_return, template_length=len(template_seq)
)
```
Note: diversity filter now runs for ALL modes (including "off") because deduplication is universal.

### `backend/core/blast_screen.py`

- `screen_primers_batch()`: batched BLAST for all unique primer sequences
- `calc_hit_tm(hit, profile)`: per-hit Tm using `primer3.calc_heterodimer()`
- `filter_hits_by_tm(hits, threshold)`: filter hits below Tm threshold
- BLAST outfmt: 15 fields including `qseqid`, `qseq`, `sseq`
- Effective min alignment length: `min(min_alignment_length, len(primer)-2)`, floor 7

### `backend/routers/export.py` (new file)

- `POST /api/export`: zip download
- `POST /api/import`: reconstruct results from JSON record
- `_build_idt_xlsx()`, `_build_notion_record()`, `_build_markdown_summary()`

### `backend/main.py`

- Added `export` router
- Added `/api/version` endpoint reading `version.txt`

### `frontend/src/App.jsx`

Major state additions:
```js
const [enabledConstraints, setEnabledConstraints] = useState(DEFAULT_ENABLED_CONSTRAINTS)
const [diversityMode, setDiversityMode] = useState('off')
const [checkedRanks, setCheckedRanks] = useState(new Set())
const [exportName, setExportName] = useState('')
const [exporting, setExporting] = useState(false)
const [resultsSource, setResultsSource] = useState(null)
const [offTargetTmThreshold, setOffTargetTmThreshold] = useState(45.0)
const [buildVersion, setBuildVersion] = useState('...')
```

Key handlers:
- `handleExport()`: POST `/api/export`, download zip
- `handleImport()`: file picker → POST `/api/import` → populate results
- `saveSession()` / `loadSession()`: localStorage persistence
- Version fetch in mount `useEffect`

### `frontend/src/lib/defaults.js`

```js
export const DEFAULT_ENABLED_CONSTRAINTS = {
  length: true, tm: true, gc: true, max_poly_x: true,
  max_self_complementarity: true, max_self_end_complementarity: true,
  max_hairpin_th: true, max_tm_diff: true,
  max_pair_complementarity: true, max_pair_end_complementarity: true,
  amplicon_size: true,
}
```

### `frontend/src/components/ConstraintsPanel.jsx`

- `EnableCheckbox` component per parameter
- Disabled params: opacity-40, strikethrough label, greyed inputs
- `diversityMode` dropdown: Off / Sparse / Spread / Coverage

### `launcher.py`

- Reads `version.txt`, stores as `BUILD_VERSION`
- Displays `Version  K42` in large blue Menlo/Consolas font in the window

---

## Current Design Workflow (SHARP Context)

The user (Tom, Founding Scientist) is testing SHARP with primers that match a customer's: ~33nt, GC ~50–55%. This is to validate that SHARP works with longer primers in a customer-like format. Lambda phage DNA is the test template.

**Recommended settings for this use case:**
- Length: 32/33/35 (min/opt/max)
- Tm: **disabled** (SHARP is isothermal at 65°C; Tm doesn't govern primer binding)
- GC: enabled, set to match customer primers (e.g., 50–55%)
- Structural constraints (self-comp, hairpin, pair-comp): **enabled**, thresholds ~55–58°C (structures with Tm < 65°C won't form at reaction temperature — the 47°C defaults are too conservative)
- 3' end complementarity: keep enabled, relax to ~55°C
- Delta-Tm: **disabled** (follows from floating Tm)
- Poly-X: enabled
- Amplicon size: enabled, whatever the target region implies
- BLAST off-target threshold: 55–58°C (structures below this won't bind at 65°C)
- Diversity mode: **Coverage** for exploring the full genome

**Note:** primer3's penalty score is not meaningful for SHARP design. primer3 was designed for PCR. Use it as a candidate generator + structural filter, not an optimizer. The penalty score ranks PCR-optimized properties that don't predict SHARP performance. Coverage mode is the most useful diversity mode because it spreads candidates across the full template, giving empirically diverse pairs to test.

---

## Known Issues / Gotchas

### primer3 clustering with few constraints active
When few penalty dimensions are active, primer3 converges on one optimal region and returns near-identical pairs. The `PRIMER_MIN_THREE_PRIME_DISTANCE` fix addresses this, but it requires diversity mode to be active. In "off" mode, clustering can still occur — this is expected behavior (best-scoring pairs by the active constraints).

### Lambda GC content
Lambda phage (~49.9% GC overall) has uneven GC distribution. A tight GC constraint (e.g., 50–55%) combined with structural constraints will find valid primers only in the high-GC regions of Lambda (which cluster near the end of the genome around 45–48k). This is biology, not a bug. Relax GC or disable it to get full-genome coverage.

### BLAST slow on first run
The first BLAST call per genome cold-starts the database. Subsequent calls are faster. For Lambda (~48kb), batched BLAST is fast (1–3s). Larger genomes will take longer.

### Session persistence and imported results
`resultsSource` tracks whether results came from design ("designed") or import ("imported"). Imported results show an amber "Imported" badge in the header area. The session save/load respects this.

### Frontend fetches version via proxy
`/api/version` goes through Vite's proxy to `localhost:8000`. If the backend is not running when the page loads, the version will show "???". This is cosmetic only.

---

## How to Run

```bash
cd sharp-primer-designer
python launcher.py       # opens GUI launcher — click Start
# or directly:
./scripts/start.sh       # starts backend + frontend + opens browser
```

Backend: `http://localhost:8000` (FastAPI, uvicorn --reload)
Frontend: `http://localhost:5173` (Vite dev server)

Conda env: `sharp` (created by `./scripts/setup.sh`)

---

## What's Not Done Yet (Future Work)

- **Direct Notion API export**: currently file-based (export JSON, hand to Claude to push to Notion)
- **GNN SHARP performance scoring**: requires accumulated experimental data
- **Batch design from CSV**: multiple target regions in one run
- **Target region visual slider**: sequence ruler with draggable start/end (partially scaffolded in `SequenceBar.jsx`)
- **Outcome tracking**: annotate pairs with experimental results (amplification yes/no, strength)
- **L200b comparison panel**: show new pair's properties relative to the known-good reference
- **Windows `.bat` launcher**: exists (`SHARP Primer Designer.bat`) but may need testing on Windows

---

## File Locations

- **OneDrive:** `/Users/yipeng/Library/CloudStorage/OneDrive-SHARPDiagnostics/PrimerTool/`
- **GitHub:** `https://github.com/tomzzzhang/SHARP-Primer-Designer` (private)
- **Active branch:** `feature/v1-workflow`
- **Main branch:** `main` (behind feature branch, PR not yet merged)
