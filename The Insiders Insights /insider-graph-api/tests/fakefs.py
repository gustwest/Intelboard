"""Fake Firestore för enhetstester — installeras som `firestore_client`.

Importeras FÖRST i varje testmodul (före schema_org/services) så att modulernas
`import firestore_client as fs` binder till den här fejken i stället för den
riktiga google.cloud-klienten. Data sätts per test med `reset(...)`.
"""
from __future__ import annotations

import sys
import types
from typing import Any


class _Snap:
    def __init__(self, _id: str, data: dict | None):
        self.id = _id
        self._data = data
        self.exists = data is not None

    def to_dict(self) -> dict | None:
        return self._data


class _DocRef:
    def __init__(self, _id: str, data: dict | None, on_set=None, on_update=None):
        self._id = _id
        self._data = data
        self._on_set = on_set
        self._on_update = on_update

    def get(self) -> _Snap:
        return _Snap(self._id, self._data)

    def set(self, payload: dict) -> None:
        if self._on_set:
            self._on_set(self._id, payload)

    def update(self, payload: dict) -> None:
        if self._on_update:
            self._on_update(self._id, payload)


class _Col:
    def __init__(self, docs: dict[str, dict] | None):
        self._docs = docs or {}

    def stream(self) -> list[_Snap]:
        return [_Snap(i, d) for i, d in self._docs.items()]

    def document(self, _id: str) -> _DocRef:
        return _DocRef(_id, self._docs.get(_id))


STATE: dict[str, Any] = {}


def reset(
    *,
    client: dict | None = None,
    employees: dict[str, dict] | None = None,
    company_items: dict[str, dict] | None = None,
    employee_items: dict[str, dict[str, dict]] | None = None,
    claims: dict[str, dict] | None = None,
) -> None:
    STATE.clear()
    STATE.update(
        client=client,  # None → klientdokumentet "finns inte" (exists=False)
        employees=employees or {},
        company_items=company_items or {},
        employee_items=employee_items or {},
        claims=claims or {},
        writes={},
    )


# --- firestore_client-API (samma signaturer som riktiga firestore_client) ---


def client_doc(client_id: str) -> _DocRef:
    return _DocRef(client_id, STATE.get("client"))


def iter_employees(client_id: str):
    return list(STATE.get("employees", {}).items())


def iter_claims(client_id: str):
    return list(STATE.get("claims", {}).items())


def raw_items_company_col(client_id: str) -> _Col:
    return _Col(STATE.get("company_items"))


def raw_items_col(client_id: str, employee_id: str) -> _Col:
    return _Col(STATE.get("employee_items", {}).get(employee_id, {}))


def raw_item_doc(client_id: str, employee_id: str | None, item_id: str) -> _DocRef:
    docs = (
        STATE.get("company_items")
        if employee_id is None
        else STATE.get("employee_items", {}).get(employee_id, {})
    )
    return _DocRef(item_id, (docs or {}).get(item_id))


def claim_doc(client_id: str, claim_id: str) -> _DocRef:
    return _DocRef(
        claim_id,
        STATE.get("claims", {}).get(claim_id),
        on_set=lambda i, p: STATE["writes"].__setitem__(i, p),  # extraktion skapar nya
        on_update=lambda i, p: STATE["claims"].setdefault(i, {}).update(p),  # review uppdaterar
    )


def writes() -> dict[str, dict]:
    return STATE.get("writes", {})


# Installera som firestore_client (vinner eftersom fakefs importeras först).
reset()
sys.modules["firestore_client"] = sys.modules[__name__]
