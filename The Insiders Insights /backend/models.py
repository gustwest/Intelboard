"""ORM models for the Insiders Insights platform.

Architectural note: modules bind to SourceField (not to a column name or a
specific SourceVersion). When a report's columns change, we add a new
SourceVersion with updated SourceFieldMapping rows — modules keep working
because they reference the stable SourceField.id.
"""
import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Integer, Float, Boolean, DateTime, ForeignKey, JSON, Text, UniqueConstraint
)
from sqlalchemy.orm import relationship
from db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class Customer(Base):
    __tablename__ = "customers"

    id = Column(String, primary_key=True, default=_uuid)
    slug = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)
    logo_emoji = Column(String, default="🏢")
    icp_json = Column(JSON, default=dict)
    tags_json = Column(JSON, default=list)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    datasets = relationship("Dataset", back_populates="customer", cascade="all, delete-orphan")
    modules = relationship("Module", back_populates="customer", cascade="all, delete-orphan")


class Source(Base):
    """A report type, e.g. 'LinkedIn Campaign Manager'."""
    __tablename__ = "sources"

    id = Column(String, primary_key=True, default=_uuid)
    key = Column(String, unique=True, nullable=False, index=True)  # stable slug
    name = Column(String, nullable=False)
    description = Column(Text, default="")
    # Detection rules: { "filename_patterns": ["*campaign_performance*"], "required_columns": [...], "encoding_hint": "utf-16" }
    detect_rules_json = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    versions = relationship("SourceVersion", back_populates="source", cascade="all, delete-orphan", order_by="SourceVersion.version")
    fields = relationship("SourceField", back_populates="source", cascade="all, delete-orphan")


class SourceVersion(Base):
    __tablename__ = "source_versions"

    id = Column(String, primary_key=True, default=_uuid)
    source_id = Column(String, ForeignKey("sources.id", ondelete="CASCADE"), nullable=False, index=True)
    version = Column(Integer, nullable=False)
    is_current = Column(Boolean, default=True)
    notes = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    source = relationship("Source", back_populates="versions")
    mappings = relationship("SourceFieldMapping", back_populates="source_version", cascade="all, delete-orphan")
    datasets = relationship("Dataset", back_populates="source_version")

    __table_args__ = (UniqueConstraint("source_id", "version", name="uq_source_version"),)


class SourceField(Base):
    """A stable data point that modules bind to. Lives across versions."""
    __tablename__ = "source_fields"

    id = Column(String, primary_key=True, default=_uuid)
    source_id = Column(String, ForeignKey("sources.id", ondelete="CASCADE"), nullable=False, index=True)
    key = Column(String, nullable=False)  # e.g. "impressions"
    display_name = Column(String, nullable=False)
    data_type = Column(String, nullable=False, default="str")  # int | float | str | date | bool
    unit = Column(String, default="")  # e.g. "count", "SEK", "%"
    description = Column(Text, default="")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    source = relationship("Source", back_populates="fields")
    mappings = relationship("SourceFieldMapping", back_populates="source_field", cascade="all, delete-orphan")

    __table_args__ = (UniqueConstraint("source_id", "key", name="uq_source_field_key"),)


class SourceFieldMapping(Base):
    """Maps a SourceField to the column name used in a specific SourceVersion."""
    __tablename__ = "source_field_mappings"

    id = Column(String, primary_key=True, default=_uuid)
    source_version_id = Column(String, ForeignKey("source_versions.id", ondelete="CASCADE"), nullable=False, index=True)
    source_field_id = Column(String, ForeignKey("source_fields.id", ondelete="CASCADE"), nullable=False, index=True)
    column_name = Column(String, nullable=False)

    source_version = relationship("SourceVersion", back_populates="mappings")
    source_field = relationship("SourceField", back_populates="mappings")

    __table_args__ = (UniqueConstraint("source_version_id", "source_field_id", name="uq_version_field"),)


class Dataset(Base):
    """An uploaded file, normalized."""
    __tablename__ = "datasets"

    id = Column(String, primary_key=True, default=_uuid)
    customer_id = Column(String, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    source_id = Column(String, ForeignKey("sources.id"), nullable=False, index=True)
    source_version_id = Column(String, ForeignKey("source_versions.id"), nullable=False)
    original_filename = Column(String, nullable=False)
    sha256 = Column(String, nullable=False, index=True)
    row_count = Column(Integer, default=0)
    uploaded_at = Column(DateTime, default=datetime.utcnow)

    customer = relationship("Customer", back_populates="datasets")
    source = relationship("Source")
    source_version = relationship("SourceVersion", back_populates="datasets")
    rows = relationship("DatasetRow", back_populates="dataset", cascade="all, delete-orphan")


class DatasetRow(Base):
    __tablename__ = "dataset_rows"

    id = Column(String, primary_key=True, default=_uuid)
    dataset_id = Column(String, ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False, index=True)
    row_index = Column(Integer, nullable=False)
    values_json = Column(JSON, nullable=False)  # { source_field_id: value }

    dataset = relationship("Dataset", back_populates="rows")


class Module(Base):
    """A KPI/module. customer_id nullable = global template."""
    __tablename__ = "modules"

    id = Column(String, primary_key=True, default=_uuid)
    customer_id = Column(String, ForeignKey("customers.id", ondelete="CASCADE"), nullable=True, index=True)
    name = Column(String, nullable=False)
    abbr = Column(String, nullable=False)
    category = Column(String, default="custom")
    description = Column(Text, default="")
    # formula_json: { "expression": "impressions / reach * 100", "aggregation": "sum",
    #                 "filters": [...], "group_by": [...] }
    formula_json = Column(JSON, default=dict)
    thresholds_json = Column(JSON, default=dict)
    visualization = Column(String, default="gauge")
    insight_template = Column(Text, default="")
    inverted = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    customer = relationship("Customer", back_populates="modules")
    field_refs = relationship("ModuleFieldRef", back_populates="module", cascade="all, delete-orphan")


class ModuleFieldRef(Base):
    """Which SourceFields a module reads, with a local alias for the formula."""
    __tablename__ = "module_field_refs"

    id = Column(String, primary_key=True, default=_uuid)
    module_id = Column(String, ForeignKey("modules.id", ondelete="CASCADE"), nullable=False, index=True)
    source_field_id = Column(String, ForeignKey("source_fields.id", ondelete="CASCADE"), nullable=False, index=True)
    alias = Column(String, nullable=False)  # variable name used in formula expression

    module = relationship("Module", back_populates="field_refs")
    source_field = relationship("SourceField")

    __table_args__ = (UniqueConstraint("module_id", "alias", name="uq_module_alias"),)


class Report(Base):
    """A saved view. customer_id nullable = global (cross-customer)."""
    __tablename__ = "reports"

    id = Column(String, primary_key=True, default=_uuid)
    customer_id = Column(String, ForeignKey("customers.id", ondelete="CASCADE"), nullable=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, default="")
    # config_json: { "module_ids": [...], "customer_ids": [...], "filters": {...}, "layout": [...] }
    config_json = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
