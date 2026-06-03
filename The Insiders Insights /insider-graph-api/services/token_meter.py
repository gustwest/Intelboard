"""Per-körnings token-räkning (per-kund kostnadsspårning).

LLM-anrop sker på många ställen (risk_detector, polling, warmth_probes,
claim_extraction, ESG-loopen, output-quality-rubric). I stället för att
instrumentera varje call-site använder vi en ContextVar-baserad meter som
binds en gång inom `record_run` (jobs/_run_tracker.py) och en proxy
runt själva LLM-objekten som läser av usage-metadata vid varje `.invoke()`.

Result: `job_runs.summary.tokens` får en per-modell-uppdelning av in/ut-tokens
+ samtalsantal — utan att någon befintlig kall-kod behöver känna till mätaren.
Driver per-kund-kostnadsrapporten (#9 i drift-listan).

Designprinciper:
- **Får aldrig fälla LLM-anropet.** All token-extraktion sker i try/except.
- **No-op när ingen meter är aktiv.** Anrop utanför `record_run` (t.ex. interaktiva
  API-anrop) påverkas inte — `record()` är en tyst no-op då.
- **Leverantörs-agnostisk.** Plockar usage från `usage_metadata` (LangChain ≥0.2),
  `response_metadata.token_usage`/`usage` (äldre + leverantörspecifikt), eller
  faller tillbaka till nollor om inget hittas.
"""
from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field
from typing import Any, Iterator


@dataclass
class _Usage:
    input_tokens: int = 0
    output_tokens: int = 0
    calls: int = 0


@dataclass
class TokenMeter:
    by_model: dict[str, _Usage] = field(default_factory=dict)

    def record(self, model: str, input_tokens: int, output_tokens: int) -> None:
        bucket = self.by_model.setdefault(model or "unknown", _Usage())
        bucket.input_tokens += int(input_tokens or 0)
        bucket.output_tokens += int(output_tokens or 0)
        bucket.calls += 1

    def to_dict(self) -> dict[str, Any]:
        return {
            "by_model": {
                m: {"input": u.input_tokens, "output": u.output_tokens, "calls": u.calls}
                for m, u in self.by_model.items()
            },
            "total_input": sum(u.input_tokens for u in self.by_model.values()),
            "total_output": sum(u.output_tokens for u in self.by_model.values()),
            "total_calls": sum(u.calls for u in self.by_model.values()),
        }


_current: ContextVar[TokenMeter | None] = ContextVar("_current_token_meter", default=None)
# Klient-id för budget-enforcement (Fas 1.6). Bunden av measure(client_id=...).
# None → enforce/record_usage är no-op (anonyma anrop, t.ex. admin-interaktivt).
_current_client_id: ContextVar[str | None] = ContextVar("_current_client_id", default=None)


@contextmanager
def measure(client_id: str | None = None) -> Iterator[TokenMeter]:
    """Bind en ny TokenMeter till denna context. Anropas av jobs/_run_tracker så
    varje per-kund-körning får sin egen mätare.

    client_id (Fas 1.6) binds till en separat ContextVar och gör att
    `_TrackedLLM.invoke()` enforce:ar budgeten innan anropet + record:ar
    månadsräknaren efter. None → ingen budget-koppling (admin/standalone)."""
    meter = TokenMeter()
    tk_meter = _current.set(meter)
    tk_client = _current_client_id.set(client_id)
    try:
        yield meter
    finally:
        _current.reset(tk_meter)
        _current_client_id.reset(tk_client)


def record(model: str, input_tokens: int, output_tokens: int) -> None:
    """Registrera ett LLM-anrops tokenförbrukning i den aktiva mätaren + i kundens
    månadsräknare för budget-uppföljning. No-op utanför en `measure()`-context."""
    m = _current.get()
    if m is None:
        return
    if not (input_tokens or output_tokens):
        return
    m.record(model, input_tokens, output_tokens)
    # Budget-räkning (Fas 1.6) — sen-import för att undvika cirkulär; cost_budget
    # importerar inget från token_meter men token_meter används av många moduler.
    client_id = _current_client_id.get()
    if client_id:
        try:
            from services import cost_budget
            cost_budget.record_usage(client_id, input_tokens, output_tokens)
        except Exception:  # noqa: BLE001 — mätning får aldrig fälla anropet
            pass


def _extract_usage(response: Any) -> tuple[int, int]:
    """Hitta (input, output) tokens i ett LangChain-svar. Letar i tur och ordning
    efter usage_metadata → response_metadata.token_usage → response_metadata.usage.
    Returnerar (0, 0) om inget hittas — då räknas anropet ej (calls bumpas inte)."""
    if response is None:
        return 0, 0
    meta = getattr(response, "usage_metadata", None)
    if isinstance(meta, dict):
        return int(meta.get("input_tokens") or 0), int(meta.get("output_tokens") or 0)
    rm = getattr(response, "response_metadata", None) or {}
    if isinstance(rm, dict):
        usage = rm.get("token_usage") or rm.get("usage") or {}
        if isinstance(usage, dict):
            return (
                int(usage.get("prompt_tokens") or usage.get("input_tokens") or 0),
                int(usage.get("completion_tokens") or usage.get("output_tokens") or 0),
            )
    return 0, 0


class _TrackedLLM:
    """Proxy runt ett LangChain-LLM. .invoke/.ainvoke/.batch/.abatch/.stream/.astream
    registrerar usage i den aktiva mätaren; alla andra attribut delegeras transparent
    till underliggande objekt (så .with_structured_output, .bind, etc. fortsätter fungera).

    OBS: .with_structured_output() och liknande returnerar nya kedje-objekt vars
    .invoke() går direkt på inner — de proxas INTE av denna klass. Använd inte den
    typen av kedjor utan att också wrapa kedjeobjektet, eller mäter du tyst noll."""

    __slots__ = ("_inner", "_model")

    def __init__(self, inner: Any, model: str):
        self._inner = inner
        self._model = model

    def _enforce_budget(self) -> None:
        # Fas 1.6: spärra anropet om kundens månadsbudget är överskriden i hard
        # mode. cost_budget.enforce kastar BudgetExceededError — den propagerar
        # uppåt så anroparen ser att det INTE handlade om en LLM-tajmout utan
        # en avsiktlig spärr. Soft mode + saknad client_id = no-op.
        client_id = _current_client_id.get()
        if not client_id:
            return
        try:
            from services import cost_budget
            cost_budget.enforce(client_id)
        except ImportError:
            pass  # cost_budget kanske inte är installerad i alla deploys än
        # BudgetExceededError propagerar avsiktligt — fångas EJ av detta try.

    def _record(self, resp: Any) -> None:
        try:
            i, o = _extract_usage(resp)
            record(self._model, i, o)
        except Exception:  # noqa: BLE001 — mätning får aldrig fälla anropet
            pass

    def invoke(self, *args: Any, **kwargs: Any) -> Any:
        self._enforce_budget()
        resp = self._inner.invoke(*args, **kwargs)
        self._record(resp)
        return resp

    async def ainvoke(self, *args: Any, **kwargs: Any) -> Any:
        self._enforce_budget()
        resp = await self._inner.ainvoke(*args, **kwargs)
        self._record(resp)
        return resp

    def batch(self, *args: Any, **kwargs: Any) -> Any:
        self._enforce_budget()
        responses = self._inner.batch(*args, **kwargs)
        for r in responses or ():
            self._record(r)
        return responses

    async def abatch(self, *args: Any, **kwargs: Any) -> Any:
        self._enforce_budget()
        responses = await self._inner.abatch(*args, **kwargs)
        for r in responses or ():
            self._record(r)
        return responses

    def stream(self, *args: Any, **kwargs: Any):
        # Streaming: chunkar saknar token-usage; aggregera och leta usage_metadata
        # i sista chunken (LangChain-konvention). Enforce före, mätning efter.
        self._enforce_budget()
        last = None
        for chunk in self._inner.stream(*args, **kwargs):
            last = chunk
            yield chunk
        self._record(last)

    async def astream(self, *args: Any, **kwargs: Any):
        self._enforce_budget()
        last = None
        async for chunk in self._inner.astream(*args, **kwargs):
            last = chunk
            yield chunk
        self._record(last)

    def __getattr__(self, name: str) -> Any:
        return getattr(self._inner, name)


def track(llm: Any, model: str) -> Any:
    """Returnera en proxy som registrerar tokens vid varje .invoke().
    None in → None ut (stub-vänlig: factories som returnerar None när nyckel saknas
    fungerar oförändrat)."""
    if llm is None:
        return None
    return _TrackedLLM(llm, model)
