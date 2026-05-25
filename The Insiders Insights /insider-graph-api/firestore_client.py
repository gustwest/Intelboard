"""Firestore-helpers.

Collection-layout speglar spec.md sektion 02:

    clients/{client_id}
        employees/{employee_id}
            raw_items/{item_id}
        polling_results/{week_id}
    connector_logs/{log_id}
"""
from functools import lru_cache
from typing import Any, Iterator

from google.cloud import firestore

from config import settings


@lru_cache(maxsize=1)
def db() -> firestore.Client:
    return firestore.Client(project=settings.firestore_project_id or None)


def clients_col():
    return db().collection("clients")


def client_doc(client_id: str):
    return clients_col().document(client_id)


def employees_col(client_id: str):
    return client_doc(client_id).collection("employees")


def employee_doc(client_id: str, employee_id: str):
    return employees_col(client_id).document(employee_id)


def raw_items_col(client_id: str, employee_id: str):
    return employee_doc(client_id, employee_id).collection("raw_items")


def raw_items_company_col(client_id: str):
    return client_doc(client_id).collection("raw_items_company")


def raw_item_doc(client_id: str, employee_id: str | None, item_id: str):
    """Slå upp ett enskilt källitem. employee_id=None → företagsnivå."""
    if employee_id is None:
        return raw_items_company_col(client_id).document(item_id)
    return raw_items_col(client_id, employee_id).document(item_id)


def claims_col(client_id: str):
    return client_doc(client_id).collection("claims")


def claim_doc(client_id: str, claim_id: str):
    return claims_col(client_id).document(claim_id)


def iter_claims(client_id: str) -> Iterator[tuple[str, dict[str, Any]]]:
    for doc in claims_col(client_id).stream():
        yield doc.id, doc.to_dict() or {}


def polling_results_col(client_id: str):
    return client_doc(client_id).collection("polling_results")


def connector_logs_col():
    return db().collection("connector_logs")


def iter_clients() -> Iterator[tuple[str, dict[str, Any]]]:
    for doc in clients_col().stream():
        yield doc.id, doc.to_dict() or {}


def iter_employees(client_id: str) -> Iterator[tuple[str, dict[str, Any]]]:
    for doc in employees_col(client_id).stream():
        yield doc.id, doc.to_dict() or {}
