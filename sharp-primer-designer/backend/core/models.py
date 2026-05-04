"""Pydantic models for all request/response types."""

from __future__ import annotations
from typing import Optional
from pydantic import BaseModel, field_validator, model_validator


# ─── Condition profiles ────────────────────────────────────────────────────────

class ConditionProfile(BaseModel):
    id: str
    name: str
    na_mm: float = 50.0
    k_mm: float = 0.0
    tris_mm: float = 0.0
    mg_mm: float = 2.0
    dntps_mm: float = 0.8
    primer_nm: float = 200.0
    is_default: bool = False
    editable: bool = True


# ─── Design constraints ────────────────────────────────────────────────────────

class PrimerConstraints(BaseModel):
    length_min: int = 17
    length_opt: int = 22
    length_max: int = 28
    tm_min: float = 54.0
    tm_opt: float = 62.0
    tm_max: float = 68.0
    gc_min: float = 30.0
    gc_opt: float = 50.0
    gc_max: float = 70.0
    max_poly_x: int = 4
    max_self_complementarity: float = 47.0
    max_self_end_complementarity: float = 47.0
    max_hairpin_th: float = 47.0

    @model_validator(mode="after")
    def check_min_opt_max(self):
        for prefix in ("length", "tm", "gc"):
            lo = getattr(self, f"{prefix}_min")
            opt = getattr(self, f"{prefix}_opt")
            hi = getattr(self, f"{prefix}_max")
            if not (lo <= opt <= hi):
                raise ValueError(f"{prefix}: must satisfy min ({lo}) <= opt ({opt}) <= max ({hi})")
        return self


class PairConstraints(BaseModel):
    max_tm_diff: float = 3.0
    max_pair_complementarity: float = 47.0
    max_pair_end_complementarity: float = 47.0


class AmpliconConstraints(BaseModel):
    size_min: int = 100
    size_opt: int = 200
    size_max: int = 500

    @model_validator(mode="after")
    def check_min_opt_max(self):
        if not (self.size_min <= self.size_opt <= self.size_max):
            raise ValueError(
                f"Amplicon size: must satisfy min ({self.size_min}) <= opt ({self.size_opt}) <= max ({self.size_max})"
            )
        return self


class SpecificityConfig(BaseModel):
    genome_ids: list[str] = []
    enabled: bool = True
    evalue_threshold: float = 1000
    min_alignment_length: int = 15
    max_off_targets: int = 0
    off_target_tm_threshold: float = 45.0  # Minimum Tm (°C) for a BLAST hit to count as viable binding


# ─── Template input ────────────────────────────────────────────────────────────

class TemplateInput(BaseModel):
    sequence: Optional[str] = None          # Direct sequence (ACGT)
    fasta_file: Optional[str] = None        # Base64-encoded FASTA
    accession: Optional[str] = None         # NCBI accession
    target_start: Optional[int] = None      # 1-indexed
    target_length: Optional[int] = None
    excluded_regions: Optional[list[list[int]]] = None  # [[start, length], ...]


class ReactionConditions(BaseModel):
    primary_profile_id: str = "sharp_cutsmart"
    additional_profile_ids: list[str] = []


# ─── BLAST results ─────────────────────────────────────────────────────────────

class BlastHit(BaseModel):
    subject_id: str
    subject_start: int
    subject_end: int
    percent_identity: float
    alignment_length: int
    mismatches: int
    evalue: float
    bitscore: float
    query_start: int
    query_end: int
    strand: str  # "plus" or "minus"
    qseq: str = ""         # aligned query (primer) subsequence
    sseq: str = ""         # aligned subject (genome) subsequence
    hit_tm: Optional[float] = None       # Tm under reaction conditions (SantaLucia/primer3)
    hit_tm_wallace: Optional[float] = None  # Wallace Tm (no salt correction)


class OffTargetAmplicon(BaseModel):
    subject: str
    fwd_pos: int
    rev_pos: int
    size: int


# ─── Tm results ───────────────────────────────────────────────────────────────

class TmGrid(BaseModel):
    """Tm values indexed by [method][profile_id].
    Wallace is condition-independent — single value stored under key '_'.
    """
    santalucia_primer3: dict[str, float] = {}
    santalucia_biopython: dict[str, float] = {}
    owczarzy_2008: dict[str, float] = {}
    wallace: dict[str, float] = {}  # Always {"_": value}


# ─── Primer / pair results ─────────────────────────────────────────────────────

class PrimerResult(BaseModel):
    sequence: str
    start: int        # 1-indexed (converted from primer3's 0-indexed)
    end: int          # 1-indexed, inclusive
    length: int
    gc_percent: float
    tm_grid: TmGrid
    hairpin_dg: float   # kcal/mol
    hairpin_tm: float
    homodimer_dg: float
    homodimer_tm: float
    end_stability: float
    blast_hits: list[BlastHit] = []


class PairResult(BaseModel):
    rank: int
    penalty_score: float
    forward: PrimerResult
    reverse: PrimerResult
    amplicon_size: int
    heterodimer_dg: float
    heterodimer_tm: float
    tm_diff: dict[str, dict[str, float]]  # [method][profile] -> abs diff
    specificity_status: str = "not_screened"  # "pass", "fail", "not_screened"
    off_target_amplicons: list[OffTargetAmplicon] = []


# ─── API request / response ────────────────────────────────────────────────────

class DesignRequest(BaseModel):
    template: TemplateInput
    primer_constraints: PrimerConstraints = PrimerConstraints()
    pair_constraints: PairConstraints = PairConstraints()
    amplicon_constraints: AmpliconConstraints = AmpliconConstraints()
    disabled_constraints: list[str] = []  # constraint keys to skip (e.g. ["tm", "gc", "max_poly_x"])
    reaction_conditions: ReactionConditions = ReactionConditions()
    specificity: SpecificityConfig = SpecificityConfig()
    num_pairs: int = 10
    diversity_mode: str = "off"  # "off", "sparse", "spread", "coverage"
    excluded_sequences: list[str] = []  # Already-ordered primer sequences to filter out post-primer3


class TemplateInfo(BaseModel):
    name: str
    length: int
    accession: Optional[str] = None
    target_region: Optional[list[int]] = None  # [start, end] 1-indexed


class DesignMetadata(BaseModel):
    primer3_version: str
    blast_version: Optional[str] = None
    total_candidates_screened: int
    filtered_by_blast: int
    excluded_pair_count: int = 0  # pairs dropped because they matched the ordered-primers library
    blast_coverage_warning: bool = False
    timestamp: str


class DesignResponse(BaseModel):
    template_info: TemplateInfo
    pairs: list[PairResult]
    design_metadata: DesignMetadata


# ─── Profile API ──────────────────────────────────────────────────────────────

class ProfilesResponse(BaseModel):
    profiles: list[ConditionProfile]


# ─── Genome API ───────────────────────────────────────────────────────────────

class GenomeInfo(BaseModel):
    id: str
    name: str
    fasta_size_bp: Optional[int] = None
    indexed: bool


class GenomesResponse(BaseModel):
    genomes: list[GenomeInfo]


class AddGenomeRequest(BaseModel):
    id: str
    name: str
    accession: Optional[str] = None
    sequence: Optional[str] = None   # Pasted FASTA or raw sequence
    fasta_file: Optional[str] = None  # Base64-encoded FASTA

    @field_validator("id")
    @classmethod
    def validate_genome_id(cls, v: str) -> str:
        import re
        if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_.\-]{0,99}", v):
            raise ValueError("Genome ID must be 1-100 alphanumeric/underscore/dash/dot characters")
        return v


# ─── Design configs (saved parameter presets) ────────────────────────────────

class DesignConfig(BaseModel):
    id: str = ""
    name: str
    primer_constraints: PrimerConstraints = PrimerConstraints()
    pair_constraints: PairConstraints = PairConstraints()
    amplicon_constraints: AmpliconConstraints = AmpliconConstraints()
    enabled_constraints: dict[str, bool] = {}
    num_pairs: int = 10
    diversity_mode: str = "off"
    reaction_conditions: ReactionConditions = ReactionConditions()
    blast_enabled: bool = True
    selected_genome_ids: list[str] = ["lambda"]
    off_target_tm_threshold: float = 45.0


class DesignConfigsResponse(BaseModel):
    configs: list[DesignConfig]


# ─── Saved sequences ─────────────────────────────────────────────────────────

class SavedSequence(BaseModel):
    id: str
    name: str
    sequence: str
    target_start: Optional[int] = None
    target_length: Optional[int] = None


class SavedSequencesResponse(BaseModel):
    sequences: list[SavedSequence]


# ─── Ordered primers library (exclusion list) ────────────────────────────────

class OrderedPrimer(BaseModel):
    id: str = ""
    sequence: str                       # Stored uppercase, whitespace-stripped
    name: Optional[str] = None
    notes: Optional[str] = None
    added_date: Optional[str] = None    # ISO 8601 timestamp
    source: Optional[str] = None        # "manual" | "imported_json" | "imported_xlsx"


class OrderedPrimersResponse(BaseModel):
    primers: list[OrderedPrimer]


class BulkOrderedPrimersRequest(BaseModel):
    sequences: list[str]                # Raw input — server cleans and dedupes
    source: str = "manual"


class BulkOrderedPrimersResponse(BaseModel):
    added: int
    skipped: int
    primers: list[OrderedPrimer]


# ─── Sequence fetch API ───────────────────────────────────────────────────────

# ─── Primer Checker ──────────────────────────────────────────────────────────

class CheckRequest(BaseModel):
    sequences: list[str]  # One or more primer sequences
    reaction_conditions: ReactionConditions = ReactionConditions()
    specificity: SpecificityConfig = SpecificityConfig()


class CheckResult(BaseModel):
    primers: list[PrimerResult]
    # Pair thermo — only populated when exactly 2 sequences provided
    heterodimer_dg: Optional[float] = None
    heterodimer_tm: Optional[float] = None
    tm_diff: Optional[dict[str, dict[str, float]]] = None
    specificity_status: str = "not_screened"
    off_target_amplicons: list[OffTargetAmplicon] = []


# ─── Sequence fetch API ───────────────────────────────────────────────────────

class FetchSequenceRequest(BaseModel):
    accession: str


class FetchSequenceResponse(BaseModel):
    accession: str
    name: str
    length: int
    sequence: str
