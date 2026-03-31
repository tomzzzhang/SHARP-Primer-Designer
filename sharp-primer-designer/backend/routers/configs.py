"""CRUD endpoints for saved design configs (parameter presets)."""

from __future__ import annotations

import json
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException

from core.models import DesignConfig, DesignConfigsResponse

router = APIRouter(prefix="/api/configs", tags=["configs"])

_CONFIGS_PATH = Path(__file__).parent.parent / "data" / "configs.json"


def _load() -> list[DesignConfig]:
    if not _CONFIGS_PATH.exists():
        return []
    with open(_CONFIGS_PATH) as f:
        data = json.load(f)
    return [DesignConfig(**c) for c in data.get("configs", [])]


def _save(configs: list[DesignConfig]) -> None:
    with open(_CONFIGS_PATH, "w") as f:
        json.dump({"configs": [c.model_dump() for c in configs]}, f, indent=2)


@router.get("", response_model=DesignConfigsResponse)
def list_configs():
    return DesignConfigsResponse(configs=_load())


@router.post("", response_model=DesignConfig, status_code=201)
def create_config(config: DesignConfig):
    configs = _load()
    if not config.id:
        config.id = uuid.uuid4().hex[:12]
    if any(c.id == config.id for c in configs):
        raise HTTPException(400, f"Config id '{config.id}' already exists")
    configs.append(config)
    _save(configs)
    return config


@router.put("/{config_id}", response_model=DesignConfig)
def update_config(config_id: str, updated: DesignConfig):
    configs = _load()
    for i, c in enumerate(configs):
        if c.id == config_id:
            updated.id = config_id
            configs[i] = updated
            _save(configs)
            return updated
    raise HTTPException(404, f"Config '{config_id}' not found")


@router.delete("/{config_id}", status_code=204)
def delete_config(config_id: str):
    configs = _load()
    remaining = [c for c in configs if c.id != config_id]
    if len(remaining) == len(configs):
        raise HTTPException(404, f"Config '{config_id}' not found")
    _save(remaining)
