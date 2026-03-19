"""CRUD endpoints for condition profiles."""

from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, HTTPException

from core.models import ConditionProfile, ProfilesResponse

router = APIRouter(prefix="/api/profiles", tags=["profiles"])

_PROFILES_PATH = Path(__file__).parent.parent / "data" / "profiles.json"


def _load() -> list[ConditionProfile]:
    with open(_PROFILES_PATH) as f:
        data = json.load(f)
    return [ConditionProfile(**p) for p in data["profiles"]]


def _save(profiles: list[ConditionProfile]) -> None:
    with open(_PROFILES_PATH, "w") as f:
        json.dump({"profiles": [p.model_dump() for p in profiles]}, f, indent=2)


@router.get("", response_model=ProfilesResponse)
def list_profiles():
    return ProfilesResponse(profiles=_load())


@router.post("", response_model=ConditionProfile, status_code=201)
def create_profile(profile: ConditionProfile):
    profiles = _load()
    if any(p.id == profile.id for p in profiles):
        raise HTTPException(400, f"Profile id '{profile.id}' already exists")
    profiles.append(profile)
    _save(profiles)
    return profile


@router.put("/{profile_id}", response_model=ConditionProfile)
def update_profile(profile_id: str, updated: ConditionProfile):
    profiles = _load()
    for i, p in enumerate(profiles):
        if p.id == profile_id:
            if not p.editable:
                raise HTTPException(400, "This profile is read-only")
            profiles[i] = updated
            _save(profiles)
            return updated
    raise HTTPException(404, f"Profile '{profile_id}' not found")


@router.delete("/{profile_id}", status_code=204)
def delete_profile(profile_id: str):
    profiles = _load()
    remaining = [p for p in profiles if p.id != profile_id]
    if len(remaining) == len(profiles):
        raise HTTPException(404, f"Profile '{profile_id}' not found")
    _save(remaining)
