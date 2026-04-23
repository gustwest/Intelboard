import os
import json
import uuid
from datetime import datetime
from typing import Dict, Any, Optional, List
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from engine.monte_carlo import run_multi_domain_simulation
from engine.data_analyzer import analyze_all
from engine.kpi_calculator import calculate_all_kpis

app = FastAPI(title="The Predictive Network Engine - API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Data Paths ---
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
ISSUES_FILE = os.path.join(DATA_DIR, "issues.json")
UPLOADS_DIR = os.path.join(DATA_DIR, "uploads")
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(UPLOADS_DIR, exist_ok=True)

def load_issues() -> list:
    if not os.path.exists(ISSUES_FILE):
        return []
    with open(ISSUES_FILE, "r") as f:
        return json.load(f)

def save_issues(issues: list):
    with open(ISSUES_FILE, "w") as f:
        json.dump(issues, f, indent=2, default=str)

def load_files_metadata() -> list:
    path = os.path.join(DATA_DIR, "files.json")
    if not os.path.exists(path):
        return []
    with open(path, "r") as f:
        return json.load(f)

def save_files_metadata(files: list):
    path = os.path.join(DATA_DIR, "files.json")
    with open(path, "w") as f:
        json.dump(files, f, indent=2, default=str)


# ============================================================
# SIMULATION
# ============================================================

class SimulationRequest(BaseModel):
    followers: int = 5000
    impressions_90d: int = 50000
    linkedin_engagement_rate: float = 0.05
    network_density: float = 0.3
    lurker_ratio: float = 0.8
    trust_multiplier: float = 1.0

@app.get("/health")
def health():
    return {"status": "ok", "service": "insiders-api"}

@app.post("/api/simulate")
def simulate(req: SimulationRequest):
    result = run_multi_domain_simulation(
        followers=req.followers,
        impressions_90d=req.impressions_90d,
        linkedin_engagement_rate=req.linkedin_engagement_rate,
        network_density=req.network_density,
        lurker_ratio=req.lurker_ratio,
        trust_multiplier=req.trust_multiplier,
        iterations=10000
    )
    return {"status": "success", "data": result}


# ============================================================
# ANALYTICS
# ============================================================

ANALYSIS_FILE = os.path.join(DATA_DIR, "analysis_cache.json")
# Check both parent dir (local dev) and same dir (Docker)
_parent_insiders = os.path.join(os.path.dirname(__file__), "..", "Insiderskunder")
_local_insiders = os.path.join(os.path.dirname(__file__), "Insiderskunder")
INSIDERSKUNDER_DIR = _parent_insiders if os.path.exists(_parent_insiders) else _local_insiders

import math
import numpy as np

class SafeJSONEncoder(json.JSONEncoder):
    """Custom encoder that handles numpy types and NaN/Inf."""
    def default(self, obj):
        if isinstance(obj, (np.integer,)):
            return int(obj)
        if isinstance(obj, (np.floating,)):
            val = float(obj)
            if math.isnan(val) or math.isinf(val):
                return 0
            return val
        if isinstance(obj, (np.ndarray,)):
            return obj.tolist()
        if isinstance(obj, (np.bool_,)):
            return bool(obj)
        if hasattr(obj, 'isoformat'):
            return obj.isoformat()
        return super().default(obj)

def safe_json_dumps(obj):
    return json.dumps(obj, cls=SafeJSONEncoder, ensure_ascii=False)

@app.get("/api/analytics")
def get_analytics():
    """Return cached analysis results (or run fresh if none exist)."""
    if os.path.exists(ANALYSIS_FILE):
        with open(ANALYSIS_FILE, "r", encoding="utf-8") as f:
            content = f.read()
        return Response(content=content, media_type="application/json")
    
    # Try auto-analyze if data directory exists
    if os.path.exists(INSIDERSKUNDER_DIR):
        return run_analysis_now()
    
    return {"error": "No analysis data found. Upload files or run analysis first."}


@app.post("/api/analytics/run")
def run_analysis_now():
    """Run fresh analysis on Insiderskunder directory."""
    if not os.path.exists(INSIDERSKUNDER_DIR):
        return {"error": f"Data directory not found: {INSIDERSKUNDER_DIR}"}
    
    result = analyze_all(INSIDERSKUNDER_DIR)
    
    # Serialize with safe encoder
    content = safe_json_dumps(result)
    
    # Cache it
    with open(ANALYSIS_FILE, "w", encoding="utf-8") as f:
        f.write(content)
    
    return Response(content=content, media_type="application/json")


# ============================================================
# SCORECARD (22 Strategic KPIs)
# ============================================================

@app.get("/api/scorecard")
def get_scorecard(customer: str = "Malmö stad"):
    """Calculate all 22 strategic KPIs from existing analytics data."""
    # Load analytics data (cached or fresh)
    analytics_data = None
    if os.path.exists(ANALYSIS_FILE):
        with open(ANALYSIS_FILE, "r", encoding="utf-8") as f:
            analytics_data = json.loads(f.read())
    elif os.path.exists(INSIDERSKUNDER_DIR):
        analytics_data = analyze_all(INSIDERSKUNDER_DIR)
        content = safe_json_dumps(analytics_data)
        with open(ANALYSIS_FILE, "w", encoding="utf-8") as f:
            f.write(content)
    
    if not analytics_data:
        return {"error": "No analytics data available. Run analysis first."}
    
    scorecard = calculate_all_kpis(analytics_data, customer)
    return Response(
        content=safe_json_dumps(scorecard),
        media_type="application/json"
    )


# ============================================================
# CUSTOMERS
# ============================================================

CUSTOMERS_FILE = os.path.join(DATA_DIR, "customers.json")
MODULES_FILE = os.path.join(DATA_DIR, "modules.json")
KUNDER_DIR = os.path.join(DATA_DIR, "kunder")
os.makedirs(KUNDER_DIR, exist_ok=True)

def load_customers() -> list:
    if not os.path.exists(CUSTOMERS_FILE):
        return []
    with open(CUSTOMERS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def save_customers(customers: list):
    with open(CUSTOMERS_FILE, "w", encoding="utf-8") as f:
        json.dump(customers, f, indent=2, ensure_ascii=False, default=str)

def load_modules() -> list:
    if not os.path.exists(MODULES_FILE):
        return []
    with open(MODULES_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def save_modules(modules: list):
    with open(MODULES_FILE, "w", encoding="utf-8") as f:
        json.dump(modules, f, indent=2, ensure_ascii=False, default=str)


class CustomerCreate(BaseModel):
    name: str
    logo_emoji: str = "🏢"
    tags: Optional[List[str]] = []
    icp: Optional[Dict[str, Any]] = {}

class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    logo_emoji: Optional[str] = None
    tags: Optional[List[str]] = None
    icp: Optional[Dict[str, Any]] = None
    active_modules: Optional[List[str]] = None


@app.get("/api/customers")
def list_customers():
    customers = load_customers()
    # Enrich with file counts
    for c in customers:
        cdir = os.path.join(KUNDER_DIR, c["id"], "data")
        if os.path.exists(cdir):
            c["file_count"] = len([f for f in os.listdir(cdir) if os.path.isfile(os.path.join(cdir, f))])
        else:
            c["file_count"] = 0
    return customers

@app.post("/api/customers")
def create_customer(req: CustomerCreate):
    customers = load_customers()
    cid = req.name.lower().replace(" ", "-").replace("å", "a").replace("ä", "a").replace("ö", "o")
    if any(c["id"] == cid for c in customers):
        return {"error": f"Customer '{cid}' already exists"}
    customer = {
        "id": cid,
        "name": req.name,
        "logo_emoji": req.logo_emoji,
        "created_at": datetime.now().isoformat(),
        "icp": req.icp or {},
        "tags": req.tags or [],
        "active_modules": [m["id"] for m in load_modules() if m.get("is_default")],
    }
    customers.append(customer)
    save_customers(customers)
    os.makedirs(os.path.join(KUNDER_DIR, cid, "data"), exist_ok=True)
    return customer

@app.get("/api/customers/{customer_id}")
def get_customer(customer_id: str):
    customers = load_customers()
    customer = next((c for c in customers if c["id"] == customer_id), None)
    if not customer:
        return {"error": "Customer not found"}
    # Add file list
    cdir = os.path.join(KUNDER_DIR, customer_id, "data")
    customer["files"] = []
    if os.path.exists(cdir):
        for f in sorted(os.listdir(cdir)):
            fp = os.path.join(cdir, f)
            if os.path.isfile(fp):
                from engine.data_analyzer import detect_file_type
                customer["files"].append({
                    "name": f,
                    "size": os.path.getsize(fp),
                    "type": detect_file_type(f),
                })
    return customer

@app.put("/api/customers/{customer_id}")
def update_customer(customer_id: str, req: CustomerUpdate):
    customers = load_customers()
    idx = next((i for i, c in enumerate(customers) if c["id"] == customer_id), None)
    if idx is None:
        return {"error": "Customer not found"}
    if req.name is not None: customers[idx]["name"] = req.name
    if req.logo_emoji is not None: customers[idx]["logo_emoji"] = req.logo_emoji
    if req.tags is not None: customers[idx]["tags"] = req.tags
    if req.icp is not None: customers[idx]["icp"] = req.icp
    if req.active_modules is not None: customers[idx]["active_modules"] = req.active_modules
    save_customers(customers)
    return customers[idx]

@app.post("/api/customers/{customer_id}/upload")
async def upload_customer_file(customer_id: str, file: UploadFile = File(...)):
    cdir = os.path.join(KUNDER_DIR, customer_id, "data")
    os.makedirs(cdir, exist_ok=True)
    filepath = os.path.join(cdir, file.filename)
    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)
    from engine.data_analyzer import detect_file_type
    return {"filename": file.filename, "size": len(content), "type": detect_file_type(file.filename)}

@app.get("/api/customers/{customer_id}/files")
def list_customer_files(customer_id: str):
    cdir = os.path.join(KUNDER_DIR, customer_id, "data")
    if not os.path.exists(cdir):
        return []
    from engine.data_analyzer import detect_file_type
    files = []
    for f in sorted(os.listdir(cdir)):
        fp = os.path.join(cdir, f)
        if os.path.isfile(fp):
            files.append({"name": f, "size": os.path.getsize(fp), "type": detect_file_type(f)})
    return files

@app.get("/api/customers/{customer_id}/reports/{filename}")
def read_report(customer_id: str, filename: str, page: int = 1, page_size: int = 100):
    """Read a CSV/XLS file and return structured table data with pagination."""
    from engine.data_analyzer import detect_file_type, read_utf16_csv, read_xls_file, read_xlsx_file
    cdir = os.path.join(KUNDER_DIR, customer_id, "data")
    filepath = os.path.join(cdir, filename)
    
    # Also check global Insiderskunder
    if not os.path.exists(filepath):
        alt = os.path.join(os.path.dirname(__file__), "..", "Insiderskunder", filename)
        if os.path.exists(alt):
            filepath = alt
        else:
            return {"error": f"File not found: {filename}"}
    
    ftype = detect_file_type(filename)
    rows = []
    columns = []
    
    try:
        lower = filename.lower()
        if lower.endswith('.csv'):
            # Try UTF-16 first (LinkedIn Campaign Manager), then UTF-8
            parsed = read_utf16_csv(filepath, skip_header_rows=7)
            if not parsed:
                # Try standard CSV
                try:
                    import codecs
                    with open(filepath, 'r', encoding='utf-8-sig') as f:
                        reader = csv.DictReader(f)
                        parsed = [{k.strip(): (v.strip() if v else '') for k, v in row.items() if k} for row in reader]
                except:
                    with open(filepath, 'r', encoding='latin-1') as f:
                        reader = csv.DictReader(f)
                        parsed = [{k.strip(): (v.strip() if v else '') for k, v in row.items() if k} for row in reader]
            rows = parsed
        elif lower.endswith('.xls'):
            df = read_xls_file(filepath)
            if df is not None:
                df = df.fillna('')
                rows = df.to_dict('records')
        elif lower.endswith('.xlsx'):
            df = read_xlsx_file(filepath)
            if df is not None:
                df = df.fillna('')
                rows = df.to_dict('records')
    except Exception as e:
        return {"error": f"Failed to parse file: {str(e)}"}
    
    # Apply edits overlay if exists
    edits_file = os.path.join(KUNDER_DIR, customer_id, f"edits_{filename}.json")
    edits = {}
    if os.path.exists(edits_file):
        with open(edits_file, "r", encoding="utf-8") as f:
            edits = json.load(f)
        for key, val in edits.items():
            row_idx, col = key.split("::", 1)
            row_idx = int(row_idx)
            if 0 <= row_idx < len(rows):
                rows[row_idx][col] = val
    
    if rows:
        columns = list(rows[0].keys()) if rows else []
    
    total = len(rows)
    start = (page - 1) * page_size
    end = start + page_size
    paged_rows = rows[start:end]
    
    # Convert all values to strings for consistent frontend handling
    for row in paged_rows:
        for k in row:
            row[k] = str(row[k]) if row[k] is not None else ''
    
    return Response(content=safe_json_dumps({
        "filename": filename,
        "file_type": ftype,
        "columns": columns,
        "total_rows": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size,
        "rows": paged_rows,
        "edits_count": len(edits),
    }), media_type="application/json")


@app.put("/api/customers/{customer_id}/reports/{filename}/edit")
def edit_report_cell(customer_id: str, filename: str, row_index: int = 0, column: str = "", value: str = ""):
    """Save an edit to a specific cell. Stored as overlay, original file untouched."""
    edits_file = os.path.join(KUNDER_DIR, customer_id, f"edits_{filename}.json")
    edits = {}
    if os.path.exists(edits_file):
        with open(edits_file, "r", encoding="utf-8") as f:
            edits = json.load(f)
    edits[f"{row_index}::{column}"] = value
    with open(edits_file, "w", encoding="utf-8") as f:
        json.dump(edits, f, indent=2, ensure_ascii=False)
    return {"status": "saved", "edits_count": len(edits)}


@app.delete("/api/customers/{customer_id}/reports/{filename}/edits")
def reset_report_edits(customer_id: str, filename: str):
    """Remove all edits and revert to original file data."""
    edits_file = os.path.join(KUNDER_DIR, customer_id, f"edits_{filename}.json")
    if os.path.exists(edits_file):
        os.remove(edits_file)
    return {"status": "reset"}


@app.get("/api/customers/{customer_id}/analytics")
def get_customer_analytics(customer_id: str):
    """Run analysis on a specific customer's data."""
    cdir = os.path.join(KUNDER_DIR, customer_id, "data")
    cache = os.path.join(KUNDER_DIR, customer_id, "analysis_cache.json")
    if os.path.exists(cache):
        with open(cache, "r", encoding="utf-8") as f:
            return Response(content=f.read(), media_type="application/json")
    if not os.path.exists(cdir) or not os.listdir(cdir):
        # Fallback to global Insiderskunder
        if os.path.exists(ANALYSIS_FILE):
            with open(ANALYSIS_FILE, "r", encoding="utf-8") as f:
                return Response(content=f.read(), media_type="application/json")
        return {"error": "No data files found"}
    result = analyze_all(cdir)
    content = safe_json_dumps(result)
    with open(cache, "w", encoding="utf-8") as f:
        f.write(content)
    return Response(content=content, media_type="application/json")

@app.get("/api/customers/{customer_id}/scorecard")
def get_customer_scorecard(customer_id: str):
    """Calculate all active modules for a specific customer."""
    customers = load_customers()
    customer = next((c for c in customers if c["id"] == customer_id), None)
    if not customer:
        return {"error": "Customer not found"}
    # Load analytics (customer-specific or global)
    analytics_data = None
    cache = os.path.join(KUNDER_DIR, customer_id, "analysis_cache.json")
    if os.path.exists(cache):
        with open(cache, "r", encoding="utf-8") as f:
            analytics_data = json.loads(f.read())
    elif os.path.exists(ANALYSIS_FILE):
        with open(ANALYSIS_FILE, "r", encoding="utf-8") as f:
            analytics_data = json.loads(f.read())
    if not analytics_data:
        return {"error": "No analytics data. Upload files and run analysis first."}
    scorecard = calculate_all_kpis(analytics_data, customer["name"])
    return Response(content=safe_json_dumps(scorecard), media_type="application/json")


# ============================================================
# MODULES
# ============================================================

class ModuleCreate(BaseModel):
    name: str
    abbr: str
    category: str = "custom"
    description: str = ""
    data_sources: List[str] = []
    requires_icp: bool = False
    formula: Dict[str, Any] = {}
    thresholds: Dict[str, float] = {}
    inverted: bool = False
    visualization: Dict[str, str] = {"primary": "gauge", "secondary": "bar"}
    insight_template: str = ""

class ModuleUpdate(BaseModel):
    name: Optional[str] = None
    abbr: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    thresholds: Optional[Dict[str, float]] = None
    visualization: Optional[Dict[str, str]] = None
    insight_template: Optional[str] = None

@app.get("/api/modules")
def list_modules():
    return load_modules()

@app.post("/api/modules")
def create_module(req: ModuleCreate):
    modules = load_modules()
    mid = req.abbr.lower().replace(" ", "_")
    if any(m["id"] == mid for m in modules):
        return {"error": f"Module '{mid}' already exists"}
    module = {
        "id": mid,
        "name": req.name,
        "abbr": req.abbr,
        "category": req.category,
        "description": req.description,
        "data_sources": req.data_sources,
        "requires_icp": req.requires_icp,
        "formula": req.formula,
        "thresholds": req.thresholds,
        "inverted": req.inverted,
        "visualization": req.visualization,
        "insight_template": req.insight_template,
        "is_default": False,
        "created_at": datetime.now().isoformat(),
    }
    modules.append(module)
    save_modules(modules)
    return module

@app.get("/api/modules/{module_id}")
def get_module(module_id: str):
    modules = load_modules()
    m = next((m for m in modules if m["id"] == module_id), None)
    return m if m else {"error": "Module not found"}

@app.put("/api/modules/{module_id}")
def update_module(module_id: str, req: ModuleUpdate):
    modules = load_modules()
    idx = next((i for i, m in enumerate(modules) if m["id"] == module_id), None)
    if idx is None:
        return {"error": "Module not found"}
    for field in ["name", "abbr", "category", "description", "thresholds", "visualization", "insight_template"]:
        val = getattr(req, field, None)
        if val is not None:
            modules[idx][field] = val
    save_modules(modules)
    return modules[idx]

@app.delete("/api/modules/{module_id}")
def delete_module(module_id: str):
    modules = load_modules()
    modules = [m for m in modules if m["id"] != module_id]
    save_modules(modules)
    return {"status": "deleted"}


# ============================================================
# COMPARE (Cross-customer)
# ============================================================

@app.get("/api/compare")
def compare_customers(customer_ids: str = "", module_ids: str = ""):
    """Compare KPIs across multiple customers."""
    cids = [c.strip() for c in customer_ids.split(",") if c.strip()]
    mids = [m.strip() for m in module_ids.split(",") if m.strip()]
    if len(cids) < 2:
        return {"error": "Provide at least 2 customer IDs (comma-separated)"}
    customers = load_customers()
    results = {}
    for cid in cids:
        customer = next((c for c in customers if c["id"] == cid), None)
        if not customer:
            continue
        # Load analytics
        analytics_data = None
        cache = os.path.join(KUNDER_DIR, cid, "analysis_cache.json")
        if os.path.exists(cache):
            with open(cache, "r", encoding="utf-8") as f:
                analytics_data = json.loads(f.read())
        elif os.path.exists(ANALYSIS_FILE):
            with open(ANALYSIS_FILE, "r", encoding="utf-8") as f:
                analytics_data = json.loads(f.read())
        if analytics_data:
            sc = calculate_all_kpis(analytics_data, customer["name"])
            if mids:
                sc["all_kpis"] = [k for k in sc.get("all_kpis", []) if k["abbr"].lower() in mids]
            results[cid] = {
                "name": customer["name"],
                "emoji": customer.get("logo_emoji", "🏢"),
                "overall_score": sc.get("overall_score", 0),
                "kpis": {k["abbr"]: k for k in sc.get("all_kpis", [])},
            }
    return {"customers": results, "compared_at": datetime.now().isoformat()}


# ============================================================
# KANBAN / ISSUES
# ============================================================

class IssueCreate(BaseModel):
    title: str
    description: str
    images: Optional[List[Dict[str, str]]] = None

class IssueUpdate(BaseModel):
    status: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None

class CommentCreate(BaseModel):
    body: str
    author: str = "Team Member"
    images: Optional[List[Dict[str, str]]] = None

@app.get("/api/issues")
def list_issues():
    return load_issues()

@app.post("/api/issues")
def create_issue(req: IssueCreate):
    issues = load_issues()
    issue = {
        "id": str(uuid.uuid4()),
        "title": req.title.strip(),
        "description": req.description.strip(),
        "status": "NY",
        "order": len([i for i in issues if i["status"] == "NY"]),
        "images": req.images or [],
        "comments": [],
        "createdAt": datetime.utcnow().isoformat(),
        "updatedAt": datetime.utcnow().isoformat(),
    }
    issues.insert(0, issue)
    save_issues(issues)
    return issue

@app.patch("/api/issues/{issue_id}")
def update_issue(issue_id: str, req: IssueUpdate):
    issues = load_issues()
    for issue in issues:
        if issue["id"] == issue_id:
            if req.status is not None:
                issue["status"] = req.status
            if req.title is not None:
                issue["title"] = req.title.strip()
            if req.description is not None:
                issue["description"] = req.description.strip()
            issue["updatedAt"] = datetime.utcnow().isoformat()
            save_issues(issues)
            return issue
    return {"error": "Not found"}, 404

@app.delete("/api/issues/{issue_id}")
def delete_issue(issue_id: str):
    issues = load_issues()
    issues = [i for i in issues if i["id"] != issue_id]
    save_issues(issues)
    return {"deleted": True}

@app.post("/api/issues/{issue_id}/comments")
def add_comment(issue_id: str, req: CommentCreate):
    issues = load_issues()
    for issue in issues:
        if issue["id"] == issue_id:
            comment = {
                "id": str(uuid.uuid4()),
                "body": req.body.strip(),
                "author": req.author,
                "images": req.images or [],
                "createdAt": datetime.utcnow().isoformat(),
            }
            issue["comments"].append(comment)
            issue["updatedAt"] = datetime.utcnow().isoformat()
            save_issues(issues)
            return comment
    return {"error": "Not found"}, 404


# ============================================================
# FILE UPLOADS
# ============================================================

@app.get("/api/files")
def list_files():
    return load_files_metadata()

@app.post("/api/files")
async def upload_file(
    file: UploadFile = File(...),
    name: str = Form(""),
    category: str = Form("Övrigt"),
):
    file_id = str(uuid.uuid4())
    ext = os.path.splitext(file.filename or "file")[1]
    stored_name = f"{file_id}{ext}"
    filepath = os.path.join(UPLOADS_DIR, stored_name)

    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)

    meta = {
        "id": file_id,
        "originalName": file.filename,
        "displayName": name.strip() or file.filename,
        "category": category.strip(),
        "storedName": stored_name,
        "size": len(content),
        "contentType": file.content_type,
        "uploadedAt": datetime.utcnow().isoformat(),
    }

    files = load_files_metadata()
    files.insert(0, meta)
    save_files_metadata(files)
    return meta

@app.get("/api/files/{file_id}/download")
def download_file(file_id: str):
    files = load_files_metadata()
    meta = next((f for f in files if f["id"] == file_id), None)
    if not meta:
        return Response(status_code=404, content="Not found")

    filepath = os.path.join(UPLOADS_DIR, meta["storedName"])
    if not os.path.exists(filepath):
        return Response(status_code=404, content="File not found on disk")

    with open(filepath, "rb") as f:
        content = f.read()

    return Response(
        content=content,
        media_type=meta.get("contentType", "application/octet-stream"),
        headers={"Content-Disposition": f'attachment; filename="{meta["originalName"]}"'}
    )

@app.delete("/api/files/{file_id}")
def delete_file(file_id: str):
    files = load_files_metadata()
    meta = next((f for f in files if f["id"] == file_id), None)
    if meta:
        filepath = os.path.join(UPLOADS_DIR, meta["storedName"])
        if os.path.exists(filepath):
            os.remove(filepath)
    files = [f for f in files if f["id"] != file_id]
    save_files_metadata(files)
    return {"deleted": True}


# ============================================================
# CHAT — Conversations, Messages, Reactions, WebSocket
# ============================================================
from fastapi import WebSocket, WebSocketDisconnect

CONVOS_FILE = os.path.join(DATA_DIR, "conversations.json")

# --- WebSocket manager ---
class ConnectionManager:
    def __init__(self):
        self.active: Dict[str, list] = {}  # convo_id -> [ws, ...]

    async def connect(self, ws: WebSocket, convo_id: str):
        await ws.accept()
        if convo_id not in self.active:
            self.active[convo_id] = []
        self.active[convo_id].append(ws)

    def disconnect(self, ws: WebSocket, convo_id: str):
        if convo_id in self.active:
            self.active[convo_id] = [w for w in self.active[convo_id] if w != ws]

    async def broadcast(self, convo_id: str, data: dict):
        for ws in self.active.get(convo_id, []):
            try:
                await ws.send_json(data)
            except:
                pass

manager = ConnectionManager()

def load_convos() -> list:
    if not os.path.exists(CONVOS_FILE):
        return []
    with open(CONVOS_FILE, "r") as f:
        return json.load(f)

def save_convos(convos: list):
    with open(CONVOS_FILE, "w") as f:
        json.dump(convos, f, indent=2, default=str)


class ConvoCreate(BaseModel):
    name: str
    members: List[str]
    emoji: Optional[str] = "💬"

class MsgSend(BaseModel):
    body: str
    author: str
    images: Optional[List[str]] = None

class ReactionToggle(BaseModel):
    emoji: str
    user: str


# --- Conversations ---
@app.get("/api/conversations")
def list_conversations():
    return load_convos()


@app.post("/api/conversations")
def create_conversation(req: ConvoCreate):
    convos = load_convos()
    convo = {
        "id": str(uuid.uuid4()),
        "name": req.name.strip(),
        "members": req.members,
        "emoji": req.emoji or "💬",
        "messages": [],
        "createdAt": datetime.utcnow().isoformat(),
        "updatedAt": datetime.utcnow().isoformat(),
    }
    convos.insert(0, convo)
    save_convos(convos)
    return convo


@app.delete("/api/conversations/{convo_id}")
def delete_conversation(convo_id: str):
    convos = load_convos()
    convos = [c for c in convos if c["id"] != convo_id]
    save_convos(convos)
    return {"deleted": True}


# --- Messages ---
@app.get("/api/conversations/{convo_id}/messages")
def get_messages(convo_id: str):
    convos = load_convos()
    convo = next((c for c in convos if c["id"] == convo_id), None)
    if not convo:
        return []
    return convo.get("messages", [])


@app.post("/api/conversations/{convo_id}/messages")
async def send_msg(convo_id: str, req: MsgSend):
    convos = load_convos()
    convo = next((c for c in convos if c["id"] == convo_id), None)
    if not convo:
        return Response(status_code=404, content="Conversation not found")

    message = {
        "id": str(uuid.uuid4()),
        "body": req.body.strip(),
        "author": req.author.strip(),
        "images": req.images or [],
        "attachments": [],
        "reactions": [],
        "createdAt": datetime.utcnow().isoformat(),
    }
    convo["messages"].append(message)
    convo["updatedAt"] = datetime.utcnow().isoformat()
    save_convos(convos)

    # Broadcast to WebSocket listeners
    await manager.broadcast(convo_id, {"type": "new_message", "message": message})
    return message


@app.post("/api/conversations/{convo_id}/upload")
async def convo_upload(
    convo_id: str,
    file: UploadFile = File(...),
    author: str = Form(""),
    body: str = Form(""),
):
    convos = load_convos()
    convo = next((c for c in convos if c["id"] == convo_id), None)
    if not convo:
        return Response(status_code=404, content="Conversation not found")

    file_id = str(uuid.uuid4())
    ext = os.path.splitext(file.filename or "file")[1]
    stored_name = f"chat_{file_id}{ext}"
    filepath = os.path.join(UPLOADS_DIR, stored_name)

    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)

    attachment = {
        "id": file_id,
        "name": file.filename,
        "storedName": stored_name,
        "size": len(content),
        "contentType": file.content_type,
    }

    message = {
        "id": str(uuid.uuid4()),
        "body": body.strip(),
        "author": author.strip() or "Okänd",
        "images": [],
        "attachments": [attachment],
        "reactions": [],
        "createdAt": datetime.utcnow().isoformat(),
    }
    convo["messages"].append(message)
    convo["updatedAt"] = datetime.utcnow().isoformat()
    save_convos(convos)

    await manager.broadcast(convo_id, {"type": "new_message", "message": message})
    return message


@app.get("/api/conversations/attachment/{file_id}")
def download_chat_attachment(file_id: str):
    convos = load_convos()
    for convo in convos:
        for msg in convo.get("messages", []):
            for att in msg.get("attachments", []):
                if att["id"] == file_id:
                    filepath = os.path.join(UPLOADS_DIR, att["storedName"])
                    if not os.path.exists(filepath):
                        return Response(status_code=404, content="File not found")
                    with open(filepath, "rb") as f:
                        data = f.read()
                    return Response(
                        content=data,
                        media_type=att.get("contentType", "application/octet-stream"),
                        headers={"Content-Disposition": f'attachment; filename="{att["name"]}"'},
                    )
    return Response(status_code=404, content="Attachment not found")


# --- Reactions ---
@app.post("/api/conversations/{convo_id}/messages/{msg_id}/react")
async def toggle_reaction(convo_id: str, msg_id: str, req: ReactionToggle):
    convos = load_convos()
    convo = next((c for c in convos if c["id"] == convo_id), None)
    if not convo:
        return Response(status_code=404, content="Not found")

    msg = next((m for m in convo.get("messages", []) if m["id"] == msg_id), None)
    if not msg:
        return Response(status_code=404, content="Message not found")

    reactions = msg.get("reactions", [])
    existing = next((r for r in reactions if r["emoji"] == req.emoji and r["user"] == req.user), None)
    if existing:
        reactions.remove(existing)
    else:
        reactions.append({"emoji": req.emoji, "user": req.user})
    msg["reactions"] = reactions
    save_convos(convos)

    await manager.broadcast(convo_id, {"type": "reaction", "messageId": msg_id, "reactions": reactions})
    return {"reactions": reactions}


# --- WebSocket ---
@app.websocket("/ws/chat/{convo_id}")
async def ws_chat(ws: WebSocket, convo_id: str):
    await manager.connect(ws, convo_id)
    try:
        while True:
            await ws.receive_text()  # keep alive
    except WebSocketDisconnect:
        manager.disconnect(ws, convo_id)

