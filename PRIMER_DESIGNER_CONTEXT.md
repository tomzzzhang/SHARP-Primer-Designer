# SHARP Primer Designer -- Project Context

**For:** Claude Code project context (pair with `SHARP_Primer_Designer_Spec.md`)
**Date:** 2026-03-24
**Last Updated:** 2026-03-31 18:00 PST

---

## What This Tool Is

The Primer Designer is not a primer3 wrapper. It is an internal R&D workflow tool that will eventually help SHARP build an empirical understanding of what makes a good SHARP primer.

SHARP is not PCR. Tm does not predict SHARP isothermal amplification performance. Something does predict performance, but we don't know what yet. Every primer pair we design and test generates data toward answering that question. The tool should be built with this in mind: v1 collects data, future versions learn from it.

The tool is **internal only**. Do not build for customers. Build for Tom (Founding Scientist) and the SHARP R&D team.

---

## Company Context

SHARP Diagnostics sells isothermal DNA amplification kits ($500/kit, 200 reactions). The core technology is a helicase-based system (PcrA-M6) that replaces thermocycling. Current buffer is NEB CutSmart. Primers trend longer than typical PCR (17-28 nt vs 18-25 nt). Chemistry is empirically determined -- do not fabricate mechanistic explanations for why things work or don't.

**Validated reference system:** L200b primers on lambda phage DNA. This is the positive control and calibration point. Any new primer pair's computed properties can be compared against L200b's known properties and known amplification performance.

---

## Notion Database Structure

The Sequences page groups all sequence-related databases. The Primer Designer's record export must map to these schemas.

### Primer Pairs (`collection://2007922b-b984-4d6d-aabc-e619e2c345c4`)
The pairing layer. Each row is one primer pair.

| Property | Type | Notes |
|----------|------|-------|
| Pair Name | title | e.g., "L200b" |
| Fwd | relation (limit 1) | Links to one Oligo Databank entry |
| Rev | relation (limit 1) | Links to one Oligo Databank entry |
| Amplicon Size (bp) | number | |
| Amplicon Sequence (5->3) | text | Populate when available |
| Target Region | text | e.g., "Lambda 200bp region" |
| Reference Sequence | relation | -> Target Template Sequences (`5ba0bcdf`) |
| Status | select | Active, Deprecated, Testing |
| Used By | multi_select | SHARP Internal, Customer Kit, Positive Control |
| Specificity | select | Pass, Fail, Not Screened |
| Design Date | date | When the pair was designed |
| Penalty Score | number | primer3 penalty score (lower is better) |
| Notes | text | |

### Oligo Databank (`collection://7f2d0d38-568b-4f61-9b05-843c4fe5a2f2`)
Individual oligos. Each primer is its own row.

| Property | Type | Notes |
|----------|------|-------|
| Primer Name | title | e.g., "Lambda_L200b_F" |
| Sequence (5->3) | text | Full oligo sequence |
| Length (nt) | number | |
| GC (%) | number | |
| Tm (C) | number | **Wallace rule only: 2(A+T) + 4(G+C).** No salt/buffer assumptions. See Tm convention below. |
| Status | select | Active, Deprecated, Contaminated, Testing |
| Used By | multi_select | SHARP Internal, Customer Kit, Positive Control |
| Supplier | text | e.g., IDT |
| Cat / Order # | text | |
| Label / Modification | text | e.g., FAM, Cy5, biotin, none |
| Design Date | date | When the primer was designed |
| Design Tool | text | e.g., "SHARP Primer Designer v1", "IDT PrimerQuest" |
| Reference Sequence | relation | -> Target Template Sequences (`5ba0bcdf`) |
| Notes | text | |

### Target Template Sequences (`collection://5ba0bcdf-8bb0-4496-86a7-309c9ba0339e`)
Reference sequences. Linked from Primer Pairs and Oligo Databank.

| Property | Type | Notes |
|----------|------|-------|
| Name | title | |
| Accession | text | NCBI accession |
| Organism / Source | text | |
| Type | select | Genomic, Plasmid, Viral, Synthetic, Other |
| Sequence | text | Full nucleotide sequence |
| Sequence Length (bp) | number | |
| Sequence File | file | FASTA or GenBank upload |
| Primers | relation | Back-relation to Oligo Databank |
| Notes | text | |

### Plasmid Construct Sequences (`collection://fd512880-9bf8-4d9b-ad56-7e0844c52cbe`)
Plasmid-specific records.

| Property | Type | Notes |
|----------|------|-------|
| Plasmid Name | title | |
| Plasmid ID | auto_increment | |
| Insert / Gene | text | |
| Vector Backbone | text | e.g., pUC19, pET28a |
| Insert Source | text | |
| Antibiotic Resistance | select | Ampicillin, Kanamycin, Chloramphenicol, Spectinomycin, Other |
| Cloning Strategy | text | |
| Purpose / Role | select | Positive Control, Expression Vector, Cloning Vector, Sequencing Standard, Other |
| Status | select | Active, Retired, In Construction |
| Used As SHARP Template | checkbox | |
| Full Sequence (5->3) | text | |
| Insert Sequence (5->3) | text | |
| Sequence Length (bp) | number | |
| Sequence File | file | |
| Accession / Addgene # | text | |
| Notes | text | |

---

## Tm Convention

**Notion stores Wallace Tm only.** Wallace rule: 2(A+T) + 4(G+C). Purely sequence-based, no salt correction, no buffer assumptions, no concentration dependence.

Tm is not a useful predictor for SHARP isothermal amplification. It is a projection from PCR thermodynamics that does not apply to helicase-based unwinding. We store one number for basic reference and comparability. Wallace is chosen because it makes zero assumptions about reaction conditions and every method agrees on its value.

The full multi-method Tm grid (SantaLucia/primer3, SantaLucia/Biopython, Owczarzy 2008, Wallace) under multiple condition profiles is computed and displayed in the Primer Designer tool. That detail goes into the Notes field or archival JSON, not the Tm column.

When populating Notion Tm field: use Wallace. When displaying Tm in the tool UI: show all methods. Do not privilege any single method in the tool display.

---

## New Features (v1 scope)

### 1. IDT Primer Order Sheet Export

Generate a ready-to-upload order file for IDT's Bulk Input feature.

**IDT Bulk Input format (verified):**
- File format: **Excel (.xlsx)**, not CSV. Upload at https://www.idtdna.com/site/order/oligoentry
- Required columns: `Name`, `Sequence`, `Scale`, `Purification`
- After upload, user clicks "Update" on the IDT page to populate the order
- Sequence column uses IDT notation for modifications (e.g., `/5Phos/ACGT...`). Plain DNA for standard primers.
- Name: alphanumeric + underscores + hyphens, max 50 characters
- Sequence length: 15-300 nt standard synthesis, up to 500 nt for Ultramer

**Scale options:** `25 nm`, `100 nm`, `250 nm`, `1 um`, `5 um`, `10 um`
**Purification options:** `STD` (Standard Desalting), `HPLC`, `PAGE`

**Implementation:**
- Export selected primer pairs as .xlsx (use openpyxl)
- Default scale: `25 nm` (configurable per export)
- Default purification: `STD` (configurable per export)
- Naming convention: `[TargetName]_[AmpliconID]_F` / `[TargetName]_[AmpliconID]_R`
  - Example: `Lambda_L200b_F`, `Lambda_L200b_R`
  - Target name derived from template input (accession name, FASTA header, or user-provided label)
  - Amplicon ID auto-incremented or user-editable
- User selects which pairs to include (checkboxes in results table)
- Single "Export Order Sheet" button downloads the file
- File naming: `SHARP_primer_order_YYYYMMDD.xlsx`

**Example output:**

| Name | Sequence | Scale | Purification |
|------|----------|-------|--------------|
| Lambda_L200b_F | GGTGCGGTGAATGCAAAGAAGAT | 25 nm | STD |
| Lambda_L200b_R | TTTCTGGTGCGACGCTGTTTACC | 25 nm | STD |

### 2. Primer Record Sheet Export (for Notion population)

Generate a structured record that can be handed to Claude (chat or Cowork) to populate the Notion Sequences databases. Not direct Notion API integration -- file-based handoff.

The export creates records for three databases per design run:

**Step 1: Create/find Target Template Sequence entry** (if not already in DB)
```json
{
  "database": "Target Template Sequences (5ba0bcdf)",
  "entry": {
    "Name": "Lambda phage",
    "Accession": "J02459",
    "Organism / Source": "Enterobacteria phage lambda",
    "Type": "Viral",
    "Sequence Length (bp)": 48502
  }
}
```

**Step 2: Create Oligo Databank entries** (one per primer)
```json
[
  {
    "database": "Oligo Databank (7f2d0d38)",
    "entry": {
      "Primer Name": "Lambda_L200b_F",
      "Sequence (5->3)": "GGTGCGGTGAATGCAAAGAAGAT",
      "Length (nt)": 23,
      "GC (%)": 47.8,
      "Tm (C)": 66.0,
      "Status": "Testing",
      "Used By": ["SHARP Internal"],
      "Supplier": "IDT",
      "Design Date": "2026-03-24",
      "Design Tool": "SHARP Primer Designer v1",
      "Notes": "Tm grid: SantaLucia/p3 CutSmart=60.0, IDT=65.6; Owczarzy CutSmart=61.2; Wallace=66.0. Hairpin dG=-1.2 kcal/mol, Tm=32.1. Homodimer dG=-5.8, Tm=18.4."
    }
  },
  {
    "database": "Oligo Databank (7f2d0d38)",
    "entry": { "...same structure for reverse..." }
  }
]
```

**Step 3: Create Primer Pairs entry** (links the two oligos)
```json
{
  "database": "Primer Pairs (2007922b)",
  "entry": {
    "Pair Name": "Lambda_L200b",
    "Fwd": "-> Lambda_L200b_F (from step 2)",
    "Rev": "-> Lambda_L200b_R (from step 2)",
    "Amplicon Size (bp)": 201,
    "Target Region": "Lambda 200bp region (41900-42100)",
    "Reference Sequence": "-> Lambda phage (from step 1)",
    "Status": "Testing",
    "Used By": ["SHARP Internal"],
    "Specificity": "Pass",
    "Design Date": "2026-03-24",
    "Penalty Score": 0.234,
    "Notes": "Heterodimer dG=-4.1 kcal/mol, Tm=12.3. Designed with SHARP Primer Designer v1, primary profile: SHARP CutSmart."
  }
}
```

**Export format:** Single file containing both JSON (for programmatic use) and a human-readable markdown summary. File naming: `SHARP_primer_record_YYYYMMDD.json`

The full JSON export (with complete Tm grids, all dG values, BLAST hits) is also saved as an archival file. The Notion population uses the subset above.

### 3. Saved Sequences Library

- Store frequently used templates (name, sequence or accession, notes)
- Persisted as JSON on disk (`backend/data/saved_sequences.json`)
- CRUD via UI (Settings modal or inline in template input)
- Pre-ship with:
  - Lambda phage (J02459) -- full genome
  - Lambda L200b region -- the specific target region for positive control primers
- When user selects a saved sequence, auto-populate the template input and any associated target region

---

## Data Collection Philosophy

Every design run is a data point. The tool should make it trivially easy to:
1. Design primers (already in spec)
2. Order them (IDT export)
3. Record what was designed and when (Notion record export)
4. Eventually: record what happened when they were tested (future: outcome tracking)

Steps 1-3 are v1. Step 4 is future, but the record format should be extensible so outcome data can be appended later.

---

## Relationship to L200b (Calibration Thinking)

L200b is the known-good reference. Its primer properties and amplification performance are established. When the tool designs new primers, it would be useful (future, not v1) to show how the new pair's properties compare to L200b's. This is more informative than any absolute Tm threshold because it's grounded in empirical SHARP performance, not PCR assumptions.

For now: make sure L200b's sequences and properties are stored in the saved sequences library so they're always available for manual comparison.

---

## Working Style

- Tom reviews structure/approach before final implementation. Don't build the whole thing without checking in.
- 11pt font for any generated documents (not 12pt).
- Avoid em dashes in any text output.
- SHARP chemistry is empirically determined. Do not invent mechanistic explanations.
- Tm is reference information, not a predictor of SHARP performance. Never frame it as predictive.
- The tool should be honest about what it does and doesn't know. Display all estimates transparently.

---

## Files & Storage

- **OneDrive path:** `/Users/yipeng/Library/CloudStorage/OneDrive-SHARPDiagnostics/PrimerTool/`
- **GitHub repo:** `tomzzzhang/SHARP-Primer-Designer` (private)
- Exported order sheets and record files default to saving in the project directory, with the option to specify a path.
- Notion integration is file-based for v1. The record sheet is a file that gets handed to Claude for Notion population.

---

## Not in Scope

- Customer-facing features
- Cloud deployment
- Direct Notion API integration (future; v1 uses file export)
- Performance prediction or scoring (future, depends on GNN project and accumulated data)
- Multiplexing checks (future)
- Batch design from CSV (future)
