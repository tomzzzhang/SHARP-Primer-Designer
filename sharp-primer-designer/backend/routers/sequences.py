"""CRUD endpoints for saved target sequences."""

from __future__ import annotations

import json
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException

from core.models import SavedSequence, SavedSequencesResponse

router = APIRouter(prefix="/api/sequences", tags=["sequences"])

_SEQUENCES_PATH = Path(__file__).parent.parent / "data" / "sequences.json"


def _load() -> list[SavedSequence]:
    if not _SEQUENCES_PATH.exists():
        return []
    with open(_SEQUENCES_PATH) as f:
        data = json.load(f)
    return [SavedSequence(**s) for s in data.get("sequences", [])]


def _save(sequences: list[SavedSequence]) -> None:
    with open(_SEQUENCES_PATH, "w") as f:
        json.dump({"sequences": [s.model_dump() for s in sequences]}, f, indent=2)


@router.get("", response_model=SavedSequencesResponse)
def list_sequences():
    return SavedSequencesResponse(sequences=_load())


@router.post("", response_model=SavedSequence, status_code=201)
def create_sequence(seq: SavedSequence):
    sequences = _load()
    # Auto-generate id if empty
    if not seq.id:
        seq.id = uuid.uuid4().hex[:12]
    if any(s.id == seq.id for s in sequences):
        raise HTTPException(400, f"Sequence id '{seq.id}' already exists")
    sequences.append(seq)
    _save(sequences)
    return seq


@router.delete("/{sequence_id}", status_code=204)
def delete_sequence(sequence_id: str):
    sequences = _load()
    remaining = [s for s in sequences if s.id != sequence_id]
    if len(remaining) == len(sequences):
        raise HTTPException(404, f"Sequence '{sequence_id}' not found")
    _save(remaining)
