"""Per-kund LLM-token-budget med enforcement (Fas 1.6).

`token_meter` (services/token_meter.py) MÄTER redan vad varje jobb-körning
spenderar. Det här lagret SPÄRRAR — vid 100% av månadens budget kastar vi
`BudgetExceededError` i hard mode; soft mode loggar bara via ops_alerts.

Filosofi (varför vi behöver det här innan vi skalar):
  En enskild kund kan idag teoretiskt sätta igång obegränsade probe-, claim-
  extraktions- eller risk-detect-jobb. Vi har timeout per anrop men ingen
  månadstak. Det är okej när vi har 5 pilotkunder. När vi har 50 räcker en
  felkonfigurerad cron eller en LLM som hänger i loopen för att blåsa
  veckans Vertex-credits. Hard cap är hygien som måste in INNAN skalningen,
  inte efter första skenande räkningen.

Datamodell:
  clients/{id}/cost_budget/current
    {monthly_token_limit, warning_threshold_pct, mode, override_until,
     override_token_limit, updated_at}
  clients/{id}/cost_usage/{YYYY-MM}
    {month, input_tokens, output_tokens, calls, updated_at}
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Literal

from google.cloud import firestore

import firestore_client as fs
from services import ops_alerts

log = logging.getLogger(__name__)


# Global default per-kund-tak (kan överridas per kund via cost_budget_doc).
# 10M tokens/månad ≈ ~50 USD på Gemini 2.5 Pro-prissättning (input-tunga
# resonemangsanrop). Generös för pilot-kunder, tajt nog att fånga skenande
# konsumtion innan månadens slut.
DEFAULT_MONTHLY_TOKEN_LIMIT: int = 10_000_000
DEFAULT_WARNING_THRESHOLD_PCT: int = 80
DEFAULT_MODE: Literal["hard", "soft"] = "hard"


BudgetMode = Literal["hard", "soft"]
BudgetStatus = Literal["ok", "warning", "exceeded"]


@dataclass(frozen=True)
class BudgetConfig:
    monthly_token_limit: int
    warning_threshold_pct: int
    mode: BudgetMode
    # Tillfällig override fram till (och inklusive) detta datum. None = ingen override.
    override_until: str | None = None
    override_token_limit: int | None = None

    @property
    def effective_limit(self) -> int:
        """Effektivt tak just nu — override om aktivt, annars månadstaket."""
        if self.override_until and self.override_token_limit is not None:
            today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            if today <= self.override_until:
                return self.override_token_limit
        return self.monthly_token_limit


@dataclass(frozen=True)
class BudgetStatusReport:
    used: int                      # input + output tokens
    limit: int
    remaining_pct: float           # 100 - (used/limit * 100), clamped till [0, 100]
    status: BudgetStatus
    mode: BudgetMode


class BudgetExceededError(RuntimeError):
    """Kastas av enforce() när hard mode och usage ≥ limit. Anropare ovan
    behöver inte hantera detta explicit — det är en hård spärr."""

    def __init__(self, client_id: str, used: int, limit: int):
        self.client_id = client_id
        self.used = used
        self.limit = limit
        super().__init__(
            f"Token-budget överskriden för {client_id}: {used:,}/{limit:,} tokens"
        )


# --- Hämta + spara konfig -----------------------------------------------------


def get_budget(client_id: str) -> BudgetConfig:
    """Hämta budget-config för en kund. Default om dokumentet saknas — säker att
    anropa även för kunder som aldrig konfigurerat budget explicit."""
    try:
        snap = fs.cost_budget_doc(client_id).get()
    except Exception as exc:  # noqa: BLE001 — Firestore-strul får inte fälla LLM-anropet
        log.warning("cost_budget.get_budget Firestore-fel för %s: %s", client_id, exc)
        return _default_config()
    if not getattr(snap, "exists", False):
        return _default_config()
    data = snap.to_dict() or {}
    return BudgetConfig(
        monthly_token_limit=int(data.get("monthly_token_limit") or DEFAULT_MONTHLY_TOKEN_LIMIT),
        warning_threshold_pct=int(data.get("warning_threshold_pct") or DEFAULT_WARNING_THRESHOLD_PCT),
        mode=_coerce_mode(data.get("mode")),
        override_until=data.get("override_until") or None,
        override_token_limit=int(data["override_token_limit"]) if data.get("override_token_limit") is not None else None,
    )


def set_budget(client_id: str, config: BudgetConfig) -> None:
    """Operatör sätter override på en kunds budget. Skriver hela dokumentet."""
    payload: dict[str, Any] = {
        "monthly_token_limit": int(config.monthly_token_limit),
        "warning_threshold_pct": int(config.warning_threshold_pct),
        "mode": config.mode,
        "override_until": config.override_until,
        "override_token_limit": config.override_token_limit,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    fs.cost_budget_doc(client_id).set(payload)


# --- Användning + check + enforce ---------------------------------------------


def _current_month() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


def current_usage(client_id: str, *, month: str | None = None) -> int:
    """Total tokens (input + output) som använts denna månad. 0 om inget skrivits än."""
    try:
        snap = fs.cost_usage_doc(client_id, month or _current_month()).get()
    except Exception as exc:  # noqa: BLE001
        log.warning("cost_budget.current_usage Firestore-fel för %s: %s", client_id, exc)
        return 0
    if not getattr(snap, "exists", False):
        return 0
    data = snap.to_dict() or {}
    return int(data.get("input_tokens") or 0) + int(data.get("output_tokens") or 0)


def check(client_id: str) -> BudgetStatusReport:
    """Returnera nuvarande status — drives både frontend-vyer och enforce()."""
    cfg = get_budget(client_id)
    used = current_usage(client_id)
    limit = max(1, cfg.effective_limit)  # division by zero-skydd
    pct_used = used / limit * 100
    remaining_pct = max(0.0, min(100.0, 100.0 - pct_used))
    if used >= limit:
        status: BudgetStatus = "exceeded"
    elif pct_used >= cfg.warning_threshold_pct:
        status = "warning"
    else:
        status = "ok"
    return BudgetStatusReport(used=used, limit=limit, remaining_pct=round(remaining_pct, 1),
                              status=status, mode=cfg.mode)


def enforce(client_id: str) -> None:
    """Spärra LLM-anrop om budget överskriden i hard mode. No-op i soft mode
    (men reser alert via record_usage)."""
    report = check(client_id)
    if report.status == "exceeded" and report.mode == "hard":
        # Försök öppna en kritisk alert — best-effort, får aldrig fälla anropet.
        try:
            ops_alerts.raise_alert(
                kind="cost_budget_exceeded",
                source=f"client:{client_id}:{_current_month()}",
                title=f"Token-budget överskriden för {client_id}",
                detail=f"Använt {report.used:,}/{report.limit:,} tokens denna månad ({100 - report.remaining_pct:.1f}% av tak)",
                severity=ops_alerts.SEVERITY_CRITICAL,
                client_id=client_id,
            )
        except Exception:  # noqa: BLE001
            pass
        raise BudgetExceededError(client_id, report.used, report.limit)


# --- Atomic increment + warning-alert -----------------------------------------


def record_usage(client_id: str, input_tokens: int, output_tokens: int) -> None:
    """Atomiskt addera tokens på månadens räknare. Triggar warning-alert vid 80%
    och critical vid 100% (deduperat via ops_alerts).

    Använder firestore.Increment så samtidiga LLM-anrop inte race:ar på read-modify-write.
    Best-effort — Firestore-fel får inte fälla LLM-anropet (vi tappar mätning, inte
    funktion).
    """
    if not client_id:
        return
    if not (input_tokens or output_tokens):
        return
    month = _current_month()
    try:
        fs.cost_usage_doc(client_id, month).update({
            "month": month,
            "input_tokens": firestore.Increment(int(input_tokens or 0)),
            "output_tokens": firestore.Increment(int(output_tokens or 0)),
            "calls": firestore.Increment(1),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as exc:  # noqa: BLE001
        # update() kräver att doc:et existerar; första anropet i månaden kan
        # behöva set() med initialvärden istället.
        try:
            fs.cost_usage_doc(client_id, month).set({
                "month": month,
                "input_tokens": int(input_tokens or 0),
                "output_tokens": int(output_tokens or 0),
                "calls": 1,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })
        except Exception as exc2:  # noqa: BLE001
            log.warning("cost_budget.record_usage Firestore-fel för %s: %s / %s",
                        client_id, exc, exc2)
            return
    _check_and_alert(client_id)


def _check_and_alert(client_id: str) -> None:
    """Efter record_usage: kolla om vi gått över 80% eller 100% och rese ev. alert."""
    report = check(client_id)
    if report.status == "warning":
        try:
            ops_alerts.raise_alert(
                kind="cost_budget_warning",
                source=f"client:{client_id}:{_current_month()}",
                title=f"Token-budget närmar sig taket för {client_id}",
                detail=f"Använt {report.used:,}/{report.limit:,} tokens ({100 - report.remaining_pct:.1f}% av månadstak)",
                severity=ops_alerts.SEVERITY_WARNING,
                client_id=client_id,
            )
        except Exception:  # noqa: BLE001
            pass
    elif report.status == "exceeded":
        try:
            ops_alerts.raise_alert(
                kind="cost_budget_exceeded",
                source=f"client:{client_id}:{_current_month()}",
                title=f"Token-budget överskriden för {client_id}",
                detail=f"Använt {report.used:,}/{report.limit:,} tokens ({100 - report.remaining_pct:.1f}% av månadstak)",
                severity=ops_alerts.SEVERITY_CRITICAL,
                client_id=client_id,
            )
        except Exception:  # noqa: BLE001
            pass


# --- Privata helpers ---------------------------------------------------------


def _default_config() -> BudgetConfig:
    return BudgetConfig(
        monthly_token_limit=DEFAULT_MONTHLY_TOKEN_LIMIT,
        warning_threshold_pct=DEFAULT_WARNING_THRESHOLD_PCT,
        mode=DEFAULT_MODE,
    )


def _coerce_mode(v: Any) -> BudgetMode:
    return "soft" if v == "soft" else "hard"
