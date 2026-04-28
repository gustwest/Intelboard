"""Pydantic DTOs for the API layer."""
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


# ---------- Customers ----------
class CustomerCreate(BaseModel):
    name: str
    logo_emoji: str = "🏢"
    tags: List[str] = Field(default_factory=list)
    icp: Dict[str, Any] = Field(default_factory=dict)


class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    logo_emoji: Optional[str] = None
    tags: Optional[List[str]] = None
    icp: Optional[Dict[str, Any]] = None


class CustomerOut(BaseModel):
    id: str
    slug: str
    name: str
    logo_emoji: str
    tags: List[str]
    icp: Dict[str, Any]
    dataset_count: int = 0
    module_count: int = 0
    created_at: datetime

    class Config:
        from_attributes = True


# ---------- Sources ----------
class SourceFieldIn(BaseModel):
    key: str
    display_name: str
    data_type: str = "str"
    unit: str = ""
    description: str = ""


class SourceFieldOut(BaseModel):
    id: str
    key: str
    display_name: str
    data_type: str
    unit: str
    description: str
    is_active: bool

    class Config:
        from_attributes = True


class SourceVersionMappingIn(BaseModel):
    source_field_id: str
    column_name: str


class SourceVersionIn(BaseModel):
    notes: str = ""
    mappings: List[SourceVersionMappingIn]


class SourceVersionOut(BaseModel):
    id: str
    version: int
    is_current: bool
    notes: str
    created_at: datetime
    mappings: List[Dict[str, str]]  # [{source_field_id, column_name}]

    class Config:
        from_attributes = True


class SourceCreate(BaseModel):
    key: str
    name: str
    description: str = ""
    platform: str = ""
    category: str = ""
    detect_rules: Dict[str, Any] = Field(default_factory=dict)
    fields: List[SourceFieldIn] = Field(default_factory=list)
    # Initial version column-mapping: { field_key: column_name }
    initial_column_mapping: Dict[str, str] = Field(default_factory=dict)


class SourceUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    platform: Optional[str] = None
    category: Optional[str] = None
    detect_rules: Optional[Dict[str, Any]] = None


class SourceOut(BaseModel):
    id: str
    key: str
    name: str
    description: str
    platform: str
    category: str
    detect_rules: Dict[str, Any]
    fields: List[SourceFieldOut]
    versions: List[SourceVersionOut]
    current_version_id: Optional[str]
    dataset_count: int = 0
    created_at: datetime

    class Config:
        from_attributes = True


# ---------- Datasets ----------
class DatasetOut(BaseModel):
    id: str
    customer_id: str
    source_id: str
    source_key: str
    source_name: str
    source_version: int
    original_filename: str
    row_count: int
    uploaded_at: datetime


class DatasetRowsOut(BaseModel):
    dataset_id: str
    columns: List[Dict[str, str]]  # [{ field_id, key, display_name, unit }]
    rows: List[Dict[str, Any]]     # each row: { field_key: value }
    page: int
    page_size: int
    total: int


# ---------- Upload ----------
class UploadDetectResult(BaseModel):
    status: str  # "matched" | "no_match" | "drift"
    source_id: Optional[str] = None
    source_key: Optional[str] = None
    source_version_id: Optional[str] = None
    source_version: Optional[int] = None
    matched_columns: List[str] = Field(default_factory=list)
    missing_columns: List[str] = Field(default_factory=list)
    extra_columns: List[str] = Field(default_factory=list)
    row_count: int = 0
    dataset_id: Optional[str] = None
    message: str = ""


# ---------- Modules ----------
class ModuleFieldRefIn(BaseModel):
    source_field_id: str
    alias: str


class ModuleCreate(BaseModel):
    customer_id: Optional[str] = None  # null = global template
    name: str
    abbr: str
    category: str = "custom"
    description: str = ""
    formula: Dict[str, Any] = Field(default_factory=dict)
    thresholds: Dict[str, float] = Field(default_factory=dict)
    visualization: str = "gauge"
    insight_template: str = ""
    inverted: bool = False
    field_refs: List[ModuleFieldRefIn] = Field(default_factory=list)


class ModuleUpdate(BaseModel):
    name: Optional[str] = None
    abbr: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    formula: Optional[Dict[str, Any]] = None
    thresholds: Optional[Dict[str, float]] = None
    visualization: Optional[str] = None
    insight_template: Optional[str] = None
    inverted: Optional[bool] = None
    field_refs: Optional[List[ModuleFieldRefIn]] = None


class ModuleFieldRefOut(BaseModel):
    id: str
    source_field_id: str
    alias: str
    field_key: str
    field_display_name: str
    source_id: str
    source_key: str


class ModuleOut(BaseModel):
    id: str
    customer_id: Optional[str]
    name: str
    abbr: str
    category: str
    description: str
    formula: Dict[str, Any]
    thresholds: Dict[str, float]
    visualization: str
    insight_template: str
    inverted: bool
    field_refs: List[ModuleFieldRefOut]
    created_at: datetime

    class Config:
        from_attributes = True


# ---------- Reports ----------
class ReportCreate(BaseModel):
    customer_id: Optional[str] = None
    name: str
    description: str = ""
    config: Dict[str, Any] = Field(default_factory=dict)


class ReportUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    config: Optional[Dict[str, Any]] = None


class ReportOut(BaseModel):
    id: str
    customer_id: Optional[str]
    name: str
    description: str
    config: Dict[str, Any]
    created_at: datetime

    class Config:
        from_attributes = True


# ---------- Customer Notes ----------
class NoteCreate(BaseModel):
    title: str
    body: str = ""
    note_type: str = "note"  # "note", "insight", "meeting"
    author: str = ""


class NoteUpdate(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    note_type: Optional[str] = None


class NoteOut(BaseModel):
    id: str
    customer_id: str
    title: str
    body: str
    note_type: str
    author: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ---------- Customer Goals ----------
class GoalCreate(BaseModel):
    title: str
    description: str = ""
    metric_type: str = "manual"  # "manual" | "module"
    module_id: Optional[str] = None
    target_value: Optional[float] = None
    target_date: Optional[datetime] = None
    current_value: Optional[float] = None


class GoalUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    target_value: Optional[float] = None
    target_date: Optional[datetime] = None
    current_value: Optional[float] = None
    status: Optional[str] = None  # "active", "completed", "paused"


class GoalOut(BaseModel):
    id: str
    customer_id: str
    title: str
    description: str
    metric_type: str
    module_id: Optional[str]
    target_value: Optional[float]
    target_date: Optional[datetime]
    current_value: Optional[float]
    status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
