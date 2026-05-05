"""Export and import endpoints for primer design results.

POST /api/export — generate IDT order sheet (.xlsx) and Notion record (.json) as a zip.
POST /api/import — import a previously exported .json record back into the results view.
"""

from __future__ import annotations

import io
import json
import zipfile
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from core.models import (
    DesignMetadata,
    PairResult,
    TemplateInfo,
)

router = APIRouter(prefix="/api", tags=["export"])


class ExportRequest(BaseModel):
    pairs: list[PairResult]
    template_info: TemplateInfo
    design_metadata: DesignMetadata
    scale: str = "25nm"
    purification: str = "STD"
    target_name: Optional[str] = None  # Override for naming; defaults to template name
    # Per-primer name overrides keyed by str(rank): {"1": {"forward": "MyName_F", "reverse": "MyName_R"}}.
    # Missing entries fall back to the auto-generated `{target_name}_P{rank}_{F|R}` pattern.
    primer_names: Optional[dict[str, dict[str, str]]] = None
    # Pre-rendered SVG of the position map for the exported pairs. When present, written
    # into the zip as `{target_name}_primer_map_{date}.svg`.
    map_svg: Optional[str] = None


def _sanitize_name(name: str) -> str:
    """Make a name safe for IDT order sheet (alphanumeric + underscores + hyphens, max 50 chars)."""
    import re
    clean = re.sub(r"[^A-Za-z0-9_\-]", "_", name)
    # Collapse multiple underscores
    clean = re.sub(r"_+", "_", clean).strip("_")
    return clean[:50]


def _wallace_tm(seq: str) -> float:
    """Wallace rule Tm: 2(A+T) + 4(G+C)."""
    seq = seq.upper()
    at = sum(1 for b in seq if b in "AT")
    gc = sum(1 for b in seq if b in "GC")
    return float(2 * at + 4 * gc)


def _gc_percent(seq: str) -> float:
    seq = seq.upper()
    gc = sum(1 for b in seq if b in "GC")
    return round(100 * gc / len(seq), 1) if seq else 0.0


def _format_tm_notes(primer) -> str:
    """Build the Tm grid + thermo summary string for the Notes field."""
    parts = []

    # Tm grid summary
    tm_entries = []
    for method, label in [
        ("santalucia_primer3", "SantaLucia/p3"),
        ("santalucia_biopython", "SantaLucia/Bio"),
        ("owczarzy_2008", "Owczarzy"),
        ("wallace", "Wallace"),
    ]:
        grid = getattr(primer.tm_grid, method, {})
        if isinstance(grid, dict):
            for profile_id, tm_val in grid.items():
                profile_label = profile_id if profile_id != "_" else ""
                if profile_label:
                    tm_entries.append(f"{label} {profile_label}={tm_val:.1f}")
                else:
                    tm_entries.append(f"{label}={tm_val:.1f}")
    if tm_entries:
        parts.append("Tm grid: " + ", ".join(tm_entries))

    # Thermo summary
    thermo = []
    thermo.append(f"Hairpin dG={primer.hairpin_dg:.1f} kcal/mol, Tm={primer.hairpin_tm:.1f}")
    thermo.append(f"Homodimer dG={primer.homodimer_dg:.1f}, Tm={primer.homodimer_tm:.1f}")
    parts.append(". ".join(thermo))

    return ". ".join(parts)


def _resolve_primer_name(
    rank: int,
    direction: str,
    target_name: str,
    primer_names: Optional[dict[str, dict[str, str]]],
) -> str:
    """Return sanitized primer name, honoring per-primer overrides when present."""
    default = f"{target_name}_P{rank}_{direction}"
    if primer_names:
        entry = primer_names.get(str(rank))
        if entry:
            key = "forward" if direction == "F" else "reverse"
            override = entry.get(key)
            if override and override.strip():
                return _sanitize_name(override)
    return _sanitize_name(default)


def _build_idt_xlsx(
    pairs: list[PairResult],
    target_name: str,
    scale: str,
    purification: str,
    primer_names: Optional[dict[str, dict[str, str]]] = None,
) -> bytes:
    """Generate IDT Bulk Input .xlsx file."""
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.title = "Primer Order"

    # Header row
    ws.append(["Name", "Sequence", "Scale", "Purification"])

    for pair in pairs:
        fwd_name = _resolve_primer_name(pair.rank, "F", target_name, primer_names)
        rev_name = _resolve_primer_name(pair.rank, "R", target_name, primer_names)
        ws.append([fwd_name, pair.forward.sequence, scale, purification])
        ws.append([rev_name, pair.reverse.sequence, scale, purification])

    # Auto-size columns
    for col in ws.columns:
        max_len = max(len(str(cell.value or "")) for cell in col)
        ws.column_dimensions[col[0].column_letter].width = min(max_len + 2, 60)

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _build_notion_record(
    pairs: list[PairResult],
    template_info: TemplateInfo,
    design_metadata: DesignMetadata,
    target_name: str,
    primer_names: Optional[dict[str, dict[str, str]]] = None,
) -> dict:
    """Build the structured Notion record JSON per PRIMER_DESIGNER_CONTEXT.md schema."""
    design_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # Step 1: Target Template Sequence
    template_entry = {
        "database": "Target Template Sequences (5ba0bcdf)",
        "entry": {
            "Name": template_info.name,
            "Sequence Length (bp)": template_info.length,
        },
    }
    if template_info.accession:
        template_entry["entry"]["Accession"] = template_info.accession

    # Step 2 & 3: Oligos and Pairs
    oligo_entries = []
    pair_entries = []

    for pair in pairs:
        pair_id = f"P{pair.rank}"

        for direction, primer in [("F", pair.forward), ("R", pair.reverse)]:
            primer_name = _resolve_primer_name(pair.rank, direction, target_name, primer_names)
            oligo_entry = {
                "database": "Oligo Databank (7f2d0d38)",
                "entry": {
                    "Primer Name": primer_name,
                    "Sequence (5->3)": primer.sequence,
                    "Length (nt)": primer.length,
                    "GC (%)": primer.gc_percent,
                    "Tm (C)": _wallace_tm(primer.sequence),
                    "Status": "Testing",
                    "Used By": ["SHARP Internal"],
                    "Supplier": "IDT",
                    "Design Date": design_date,
                    "Design Tool": "SHARP Primer Designer v1",
                    "Notes": _format_tm_notes(primer),
                },
            }
            oligo_entries.append(oligo_entry)

        fwd_name = _resolve_primer_name(pair.rank, "F", target_name, primer_names)
        rev_name = _resolve_primer_name(pair.rank, "R", target_name, primer_names)

        target_region_str = ""
        if template_info.target_region:
            target_region_str = f"{template_info.name} {template_info.target_region[0]}-{template_info.target_region[1]}"

        pair_entry = {
            "database": "Primer Pairs (2007922b)",
            "entry": {
                "Pair Name": _sanitize_name(f"{target_name}_{pair_id}"),
                "Fwd": f"-> {fwd_name} (from oligo entries)",
                "Rev": f"-> {rev_name} (from oligo entries)",
                "Amplicon Size (bp)": pair.amplicon_size,
                "Target Region": target_region_str,
                "Reference Sequence": f"-> {template_info.name} (from template entry)",
                "Status": "Testing",
                "Used By": ["SHARP Internal"],
                "Specificity": "Pass" if pair.specificity_status == "pass" else (
                    "Fail" if pair.specificity_status == "fail" else "Not Screened"
                ),
                "Design Date": design_date,
                "Penalty Score": round(pair.penalty_score, 3),
                "Notes": (
                    f"Heterodimer dG={pair.heterodimer_dg:.1f} kcal/mol, Tm={pair.heterodimer_tm:.1f}. "
                    f"Designed with SHARP Primer Designer v1."
                ),
            },
        }
        pair_entries.append(pair_entry)

    record = {
        "export_version": "1.0",
        "export_date": design_date,
        "export_tool": "SHARP Primer Designer v1",
        "template": template_entry,
        "oligos": oligo_entries,
        "pairs": pair_entries,
        "design_metadata": design_metadata.model_dump(),
    }
    return record


def _build_markdown_summary(record: dict) -> str:
    """Build a human-readable markdown summary of the export."""
    lines = []
    lines.append(f"# SHARP Primer Export - {record['export_date']}")
    lines.append("")
    lines.append(f"**Template:** {record['template']['entry']['Name']} "
                 f"({record['template']['entry']['Sequence Length (bp)']} bp)")
    if record['template']['entry'].get('Accession'):
        lines.append(f"**Accession:** {record['template']['entry']['Accession']}")
    lines.append("")
    lines.append(f"## Primer Pairs ({len(record['pairs'])})")
    lines.append("")

    for i, pair_rec in enumerate(record['pairs']):
        p = pair_rec['entry']
        # Each pair has 2 oligos (fwd at 2*i, rev at 2*i+1)
        fwd_oligo = record['oligos'][2 * i]['entry']
        rev_oligo = record['oligos'][2 * i + 1]['entry']
        lines.append(f"### {p['Pair Name']}")
        lines.append(f"- **Forward:** `{fwd_oligo['Sequence (5->3)']}` ({fwd_oligo['Length (nt)']} nt, "
                     f"GC {fwd_oligo['GC (%)']}%, Wallace Tm {fwd_oligo['Tm (C)']:.0f} C)")
        lines.append(f"- **Reverse:** `{rev_oligo['Sequence (5->3)']}` ({rev_oligo['Length (nt)']} nt, "
                     f"GC {rev_oligo['GC (%)']}%, Wallace Tm {rev_oligo['Tm (C)']:.0f} C)")
        lines.append(f"- **Amplicon:** {p['Amplicon Size (bp)']} bp | Penalty: {p['Penalty Score']} | "
                     f"Specificity: {p['Specificity']}")
        lines.append("")

    lines.append("---")
    lines.append("*Generated by SHARP Primer Designer v1*")
    return "\n".join(lines)


@router.post("/export")
def export_primers(req: ExportRequest):
    """Generate IDT order sheet + Notion record as a zip download."""
    if not req.pairs:
        raise HTTPException(400, "No primer pairs to export")

    # Derive target name
    target_name = req.target_name or req.template_info.name or "Target"
    target_name = _sanitize_name(target_name)

    date_str = datetime.now(timezone.utc).strftime("%Y%m%d")

    # Build files
    xlsx_bytes = _build_idt_xlsx(
        req.pairs, target_name, req.scale, req.purification, req.primer_names
    )
    notion_record = _build_notion_record(
        req.pairs, req.template_info, req.design_metadata, target_name, req.primer_names
    )
    md_summary = _build_markdown_summary(notion_record)

    # Include markdown summary in the JSON
    notion_record["markdown_summary"] = md_summary

    json_bytes = json.dumps(notion_record, indent=2).encode("utf-8")

    # Package as zip — files inside a folder named after the target
    folder = f"{target_name}_{date_str}"
    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(f"{folder}/{target_name}_primer_order_{date_str}.xlsx", xlsx_bytes)
        zf.writestr(f"{folder}/{target_name}_primer_record_{date_str}.json", json_bytes)
        zf.writestr(f"{folder}/{target_name}_primer_summary_{date_str}.md", md_summary)
        if req.map_svg and req.map_svg.strip():
            zf.writestr(
                f"{folder}/{target_name}_primer_map_{date_str}.svg",
                req.map_svg.encode("utf-8"),
            )

    zip_buf.seek(0)
    return StreamingResponse(
        zip_buf,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{folder}.zip"'
        },
    )


# ─── Import ──────────────────────────────────────────────────────────────────


def _reconstruct_pair(pair_rec: dict, oligo_fwd: dict, oligo_rev: dict, rank: int) -> PairResult:
    """Reconstruct a PairResult from exported Notion record entries."""
    from core.models import PrimerResult, TmGrid

    def _make_primer(oligo: dict) -> PrimerResult:
        seq = oligo["Sequence (5->3)"]
        wallace = _wallace_tm(seq)
        return PrimerResult(
            sequence=seq,
            start=0,  # Position info not stored in export
            end=len(seq) - 1,
            length=oligo["Length (nt)"],
            gc_percent=oligo["GC (%)"],
            tm_grid=TmGrid(wallace={"_": wallace}),
            hairpin_dg=0.0,
            hairpin_tm=0.0,
            homodimer_dg=0.0,
            homodimer_tm=0.0,
            end_stability=0.0,
            blast_hits=[],
        )

    p = pair_rec["entry"]
    specificity_map = {"Pass": "pass", "Fail": "fail", "Not Screened": "not_screened"}

    return PairResult(
        rank=rank,
        penalty_score=p.get("Penalty Score", 0.0),
        forward=_make_primer(oligo_fwd),
        reverse=_make_primer(oligo_rev),
        amplicon_size=p.get("Amplicon Size (bp)", 0),
        heterodimer_dg=0.0,
        heterodimer_tm=0.0,
        tm_diff={},
        specificity_status=specificity_map.get(p.get("Specificity", ""), "not_screened"),
        off_target_amplicons=[],
    )


@router.post("/import")
async def import_record(request: dict):
    """Import a previously exported .json record and return it as a DesignResponse-shaped object."""
    from core.models import DesignMetadata, DesignResponse

    try:
        record = request

        # Validate structure
        if "pairs" not in record or "oligos" not in record or "template" not in record:
            raise ValueError("Missing required fields: template, oligos, pairs")

        template_entry = record["template"]["entry"]
        template_info = TemplateInfo(
            name=template_entry.get("Name", "Imported"),
            length=template_entry.get("Sequence Length (bp)", 0),
            accession=template_entry.get("Accession"),
        )

        # Reconstruct pairs
        pairs = []
        for i, pair_rec in enumerate(record["pairs"]):
            fwd_oligo = record["oligos"][2 * i]["entry"]
            rev_oligo = record["oligos"][2 * i + 1]["entry"]
            pairs.append(_reconstruct_pair(pair_rec, fwd_oligo, rev_oligo, rank=i + 1))

        # Build metadata
        meta = record.get("design_metadata", {})
        metadata = DesignMetadata(
            primer3_version=meta.get("primer3_version", "imported"),
            blast_version=meta.get("blast_version"),
            total_candidates_screened=meta.get("total_candidates_screened", len(pairs)),
            filtered_by_blast=meta.get("filtered_by_blast", 0),
            blast_coverage_warning=meta.get("blast_coverage_warning", False),
            timestamp=meta.get("timestamp", record.get("export_date", "")),
        )

        return {
            "template_info": template_info.model_dump(),
            "pairs": [p.model_dump() for p in pairs],
            "design_metadata": metadata.model_dump(),
            "source": "imported",
        }

    except (KeyError, IndexError, ValueError) as exc:
        raise HTTPException(422, f"Invalid record format: {exc}") from exc
