"""POST /api/design — full primer design pipeline."""

from __future__ import annotations

import asyncio
import base64
import json
import os
import re
from concurrent.futures import ThreadPoolExecutor
from io import StringIO
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from core.models import (
    ConditionProfile,
    DesignRequest,
    DesignResponse,
    TemplateInfo,
)
from core.primer_engine import design_primers

router = APIRouter(prefix="/api/design", tags=["design"])

_PROFILES_PATH = Path(__file__).parent.parent / "data" / "profiles.json"


def _load_all_profiles() -> list[ConditionProfile]:
    with open(_PROFILES_PATH) as f:
        data = json.load(f)
    return [ConditionProfile(**p) for p in data["profiles"]]


def _resolve_template(req: DesignRequest) -> tuple[str, TemplateInfo]:
    """Resolve the template input to a plain uppercase sequence + TemplateInfo."""
    t = req.template

    if t.sequence:
        seq = _clean_sequence(t.sequence)
        info = TemplateInfo(name="Pasted sequence", length=len(seq))

    elif t.fasta_file:
        try:
            fasta_text = base64.b64decode(t.fasta_file).decode("utf-8")
        except Exception as exc:
            raise HTTPException(422, f"Invalid base64 FASTA: {exc}") from exc
        seq, name = _parse_fasta(fasta_text)
        info = TemplateInfo(name=name, length=len(seq))

    elif t.accession:
        seq, name = _fetch_ncbi(t.accession)
        info = TemplateInfo(
            name=name, length=len(seq), accession=t.accession
        )

    else:
        raise HTTPException(422, "Template must supply sequence, fasta_file, or accession")

    if not seq:
        raise HTTPException(422, "Template sequence is empty")
    if not re.fullmatch(r"[ACGTN]+", seq, re.IGNORECASE):
        raise HTTPException(422, "Template contains non-ACGTN characters")

    # Resolve target region to (start_0indexed, length) for primer3
    target_region = None
    if t.target_start is not None and t.target_length is not None:
        target_start_0 = t.target_start - 1  # convert 1-indexed to 0-indexed
        target_region = (target_start_0, t.target_length)
        info.target_region = [t.target_start, t.target_start + t.target_length - 1]

    return seq.upper(), info, target_region


def _clean_sequence(seq: str) -> str:
    """Strip whitespace, numbers, and FASTA headers from a pasted sequence."""
    lines = seq.splitlines()
    cleaned = []
    for line in lines:
        line = line.strip()
        if line.startswith(">"):
            continue
        line = re.sub(r"[^A-Za-z]", "", line)
        cleaned.append(line)
    return "".join(cleaned).upper()


def _parse_fasta(text: str) -> tuple[str, str]:
    try:
        from Bio import SeqIO
        record = SeqIO.read(StringIO(text), "fasta")
        return str(record.seq).upper(), record.description
    except Exception as exc:
        raise HTTPException(422, f"Could not parse FASTA: {exc}") from exc


def _fetch_ncbi(accession: str) -> tuple[str, str]:
    try:
        from Bio import Entrez, SeqIO
        email = os.environ.get("NCBI_EMAIL", "support@sharpdx.com")
        Entrez.email = email
        handle = Entrez.efetch(
            db="nucleotide", id=accession, rettype="fasta", retmode="text"
        )
        fasta_text = handle.read()
        handle.close()
        record = SeqIO.read(StringIO(fasta_text), "fasta")
        return str(record.seq).upper(), record.description
    except Exception as exc:
        raise HTTPException(502, f"NCBI fetch failed for '{accession}': {exc}") from exc


def _sse(event: str, data: dict) -> str:
    """Format a single SSE message."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@router.post("/stream")
async def run_design_stream(req: DesignRequest):
    """Streaming design endpoint — emits SSE progress events, then the full result."""
    loop = asyncio.get_event_loop()
    queue: asyncio.Queue = asyncio.Queue()

    def on_progress(step: str, message: str, pct: float):
        loop.call_soon_threadsafe(
            queue.put_nowait,
            {"step": step, "message": message, "pct": round(pct, 1)},
        )

    def run_sync():
        try:
            template_seq, template_info, target_region = _resolve_template(req)
            excluded_regions = None
            if req.template.excluded_regions:
                excluded_regions = [
                    (r[0] - 1, r[1]) for r in req.template.excluded_regions
                ]
            all_profiles = _load_all_profiles()

            # Emit template-resolved event via the queue
            loop.call_soon_threadsafe(
                queue.put_nowait,
                {"step": "template", "message": f"Template: {template_info.name} ({template_info.length:,} bp)", "pct": 5},
            )

            pairs, metadata = design_primers(
                template_seq=template_seq,
                template_info=template_info,
                target_region=target_region,
                excluded_regions=excluded_regions,
                primer_constraints=req.primer_constraints,
                pair_constraints=req.pair_constraints,
                amplicon_constraints=req.amplicon_constraints,
                reaction_conditions=req.reaction_conditions,
                all_profiles=all_profiles,
                specificity=req.specificity,
                num_return=req.num_pairs,
                on_progress=on_progress,
            )
            result = DesignResponse(
                template_info=template_info,
                pairs=pairs,
                design_metadata=metadata,
            )
            loop.call_soon_threadsafe(queue.put_nowait, {"_done": True, "result": result.model_dump()})
        except Exception as exc:
            loop.call_soon_threadsafe(queue.put_nowait, {"_error": str(exc)})

    async def generate():
        executor = ThreadPoolExecutor(max_workers=1)
        future = loop.run_in_executor(executor, run_sync)
        try:
            while True:
                try:
                    item = await asyncio.wait_for(queue.get(), timeout=30.0)
                except asyncio.TimeoutError:
                    yield _sse("keepalive", {})
                    continue

                if "_error" in item:
                    yield _sse("error", {"message": item["_error"]})
                    break
                elif "_done" in item:
                    yield _sse("done", item["result"])
                    break
                else:
                    yield _sse("progress", item)
        finally:
            executor.shutdown(wait=False)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("", response_model=DesignResponse)
def run_design(req: DesignRequest):
    template_seq, template_info, target_region = _resolve_template(req)

    excluded_regions = None
    if req.template.excluded_regions:
        # Convert 1-indexed [start, length] to 0-indexed (start-1, length)
        excluded_regions = [
            (r[0] - 1, r[1]) for r in req.template.excluded_regions
        ]

    all_profiles = _load_all_profiles()

    pairs, metadata = design_primers(
        template_seq=template_seq,
        template_info=template_info,
        target_region=target_region,
        excluded_regions=excluded_regions,
        primer_constraints=req.primer_constraints,
        pair_constraints=req.pair_constraints,
        amplicon_constraints=req.amplicon_constraints,
        reaction_conditions=req.reaction_conditions,
        all_profiles=all_profiles,
        specificity=req.specificity,
        num_return=req.num_pairs,
    )

    return DesignResponse(
        template_info=template_info,
        pairs=pairs,
        design_metadata=metadata,
    )
