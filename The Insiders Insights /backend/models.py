"""ORM models for the Insiders Insights platform.

Architectural note: modules bind to SourceField (not to a column name or a
specific SourceVersion). When a report's columns change, we add a new
SourceVersion with updated SourceFieldMapping rows — modules keep working
because they reference the stable SourceField.id.
"""
import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Integer, Float, Boolean, Date, DateTime, ForeignKey, JSON, Text, UniqueConstraint
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
    notes = relationship("CustomerNote", back_populates="customer", cascade="all, delete-orphan",
                         order_by="CustomerNote.created_at.desc()")
    goals = relationship("CustomerGoal", back_populates="customer", cascade="all, delete-orphan",
                         order_by="CustomerGoal.created_at.desc()")


class Source(Base):
    """A report type, e.g. 'LinkedIn Campaign Manager'."""
    __tablename__ = "sources"

    id = Column(String, primary_key=True, default=_uuid)
    key = Column(String, unique=True, nullable=False, index=True)  # stable slug
    name = Column(String, nullable=False)
    description = Column(Text, default="")
    platform = Column(String, default="")     # e.g. "LinkedIn Campaign Manager", "LinkedIn Page Analytics"
    category = Column(String, default="")     # e.g. "Campaign", "Content", "Recruiter"
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
    ai_summary = Column(Text, default="")  # Gemini 3 Flash generated summary
    # Granularity & period — prevent double-counting overlapping reports
    granularity = Column(String, default="unknown")    # daily | monthly | aggregated | unknown
    period_start = Column(Date, nullable=True)          # earliest date in the dataset
    period_end = Column(Date, nullable=True)            # latest date in the dataset
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


# ======================================================================
# KANBAN / ISSUES
# ======================================================================
class Issue(Base):
    __tablename__ = "issues"

    id = Column(String, primary_key=True, default=_uuid)
    title = Column(String, nullable=False)
    description = Column(Text, default="")
    status = Column(String, nullable=False, default="NY", index=True)
    order = Column(Integer, default=0)
    images_json = Column(JSON, default=list)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    comments = relationship("IssueComment", back_populates="issue", cascade="all, delete-orphan",
                            order_by="IssueComment.created_at")


class IssueComment(Base):
    __tablename__ = "issue_comments"

    id = Column(String, primary_key=True, default=_uuid)
    issue_id = Column(String, ForeignKey("issues.id", ondelete="CASCADE"), nullable=False, index=True)
    body = Column(Text, nullable=False)
    author = Column(String, default="Team Member")
    images_json = Column(JSON, default=list)
    created_at = Column(DateTime, default=datetime.utcnow)

    issue = relationship("Issue", back_populates="comments")


# ======================================================================
# CHAT / CONVERSATIONS
# ======================================================================
class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(String, primary_key=True, default=_uuid)
    name = Column(String, nullable=False)
    emoji = Column(String, default="💬")
    members_json = Column(JSON, default=list)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    messages = relationship("ChatMessage", back_populates="conversation", cascade="all, delete-orphan",
                            order_by="ChatMessage.created_at")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(String, primary_key=True, default=_uuid)
    conversation_id = Column(String, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    body = Column(Text, default="")
    author = Column(String, nullable=False)
    images_json = Column(JSON, default=list)
    attachments_json = Column(JSON, default=list)
    reactions_json = Column(JSON, default=list)
    created_at = Column(DateTime, default=datetime.utcnow)

    conversation = relationship("Conversation", back_populates="messages")


# ======================================================================
# AI AGENT
# ======================================================================
class AgentSession(Base):
    __tablename__ = "agent_sessions"

    id = Column(String, primary_key=True, default=_uuid)
    title = Column(String, nullable=False)
    pinned = Column(Boolean, default=False)
    claude_session_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    tasks = relationship("AgentTask", back_populates="session", cascade="all, delete-orphan",
                         order_by="AgentTask.created_at")


class AgentTask(Base):
    __tablename__ = "agent_tasks"

    id = Column(String, primary_key=True, default=_uuid)
    session_id = Column(String, ForeignKey("agent_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    prompt = Column(Text, nullable=False)
    status = Column(String, nullable=False, default="PENDING", index=True)
    model = Column(String, default="claude-sonnet-4-6")
    response = Column(Text, nullable=True)
    error = Column(Text, nullable=True)
    claude_session_id = Column(String, nullable=True)
    logs_json = Column(JSON, default=list)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    session = relationship("AgentSession", back_populates="tasks")


class AgentMeta(Base):
    """Singleton row tracking agent polling metadata."""
    __tablename__ = "agent_meta"

    id = Column(Integer, primary_key=True, default=1)
    last_poll = Column(DateTime, nullable=True)
    agent_model = Column(String, nullable=True)
    agent_version = Column(String, nullable=True)
    agent_project = Column(String, nullable=True)


# ======================================================================
# CUSTOMER NOTES & GOALS
# ======================================================================
class CustomerNote(Base):
    """Free-form notes per customer (meeting notes, insights, observations)."""
    __tablename__ = "customer_notes"

    id = Column(String, primary_key=True, default=_uuid)
    customer_id = Column(String, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String, nullable=False)
    body = Column(Text, default="")
    note_type = Column(String, default="note")  # "note", "goal", "insight", "meeting"
    author = Column(String, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    customer = relationship("Customer", back_populates="notes")


class CustomerGoal(Base):
    """Measurable goals/targets per customer. Can optionally link to a Module KPI."""
    __tablename__ = "customer_goals"

    id = Column(String, primary_key=True, default=_uuid)
    customer_id = Column(String, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, default="")
    metric_type = Column(String, default="manual")  # "manual" | "module"
    module_id = Column(String, ForeignKey("modules.id", ondelete="SET NULL"), nullable=True)
    target_value = Column(Float, nullable=True)
    target_date = Column(DateTime, nullable=True)
    current_value = Column(Float, nullable=True)
    status = Column(String, default="active")  # "active", "completed", "paused"
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    customer = relationship("Customer", back_populates="goals")
    module = relationship("Module", foreign_keys=[module_id])


# ======================================================================
# ADMIN FILE STORE
# ======================================================================
class AdminFile(Base):
    """Generic file uploaded via the Admin panel."""
    __tablename__ = "admin_files"

    id = Column(String, primary_key=True, default=_uuid)
    original_name = Column(String, nullable=False)
    display_name = Column(String, nullable=False)
    category = Column(String, default="Övrigt")
    stored_name = Column(String, nullable=False)
    size = Column(Integer, default=0)
    content_type = Column(String, default="application/octet-stream")
    uploaded_at = Column(DateTime, default=datetime.utcnow)


# ======================================================================
# AI ASSISTANT CHAT
# ======================================================================
class AIChatMessage(Base):
    """Persisted AI assistant conversation messages."""
    __tablename__ = "ai_chat_messages"

    id = Column(String, primary_key=True, default=_uuid)
    session_id = Column(String, nullable=False, index=True)
    role = Column(String, nullable=False)  # "user" | "assistant"
    content = Column(Text, nullable=False, default="")
    customer_id = Column(String, nullable=True)  # optional context
    page_context = Column(String, nullable=True)  # which page the user was on
    created_at = Column(DateTime, default=datetime.utcnow)
