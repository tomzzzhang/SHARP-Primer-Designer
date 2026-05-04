"""SHARP Primer Designer — FastAPI backend entry point."""

from __future__ import annotations

import os
import shutil
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import check, configs, design, export, genomes, ordered_primers, profiles, sequence, sequences

# Load .env from repo root (one level above backend/)
_ROOT = Path(__file__).parent.parent
load_dotenv(_ROOT / ".env")

# ── Seed user data from defaults on first run ────────────────────────────────
_DATA = Path(__file__).parent / "data"
_SEED_FILES = ["sequences.json", "configs.json", "ordered_primers.json"]

for _fname in _SEED_FILES:
    _user_file = _DATA / _fname
    _defaults_file = _DATA / _fname.replace(".json", ".defaults.json")
    if not _user_file.exists() and _defaults_file.exists():
        shutil.copy2(_defaults_file, _user_file)
        print(f"[startup] Seeded {_fname} from defaults")

app = FastAPI(
    title="SHARP Primer Designer API",
    description=(
        "Primer design engine for SHARP Diagnostics isothermal amplification platform. "
        "Wraps primer3-py with multi-method Tm analysis and BLAST+ off-target screening."
    ),
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(check.router)
app.include_router(configs.router)
app.include_router(design.router)
app.include_router(export.router)
app.include_router(ordered_primers.router)
app.include_router(profiles.router)
app.include_router(genomes.router)
app.include_router(sequence.router)
app.include_router(sequences.router)


_VERSION_FILE = _ROOT / "version.txt"

def _read_version() -> str:
    try:
        return _VERSION_FILE.read_text().strip()
    except Exception:
        return "???"


@app.get("/health")
def health():
    from core.blast_screen import blast_version
    bv = blast_version()
    return {"status": "ok", "blast_available": bv is not None, "blast_version": bv}


@app.get("/api/version")
def version():
    return {"version": _read_version()}
