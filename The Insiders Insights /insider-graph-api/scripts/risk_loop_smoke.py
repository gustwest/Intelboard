"""End-to-end-drivare för GEO-riskloopen (skiva 1–4) mot en deployad instans.

Gör testkörningen tryckknappsenkel: genererar frågebatteri → (auto)godkänner →
detekterar + klassar → listar findings → (valfritt) åtgärdar en → bygger månadsrapport
→ hämtar HTML-vyn. Jobben körs som fire-and-forget BackgroundTasks på API:t, så
skriptet pollar läs-endpointerna tills resultat dyker upp.

Kräver en RIKTIG deployad miljö med Vertex EU konfigurerad (annars no-op) + en onboardad
kund. Läser inget hemligt; admin-nyckeln tas från --admin-key eller $ADMIN_API_KEY.

Exempel:
  python scripts/risk_loop_smoke.py --base-url https://insider-graph-api-xxx.run.app \\
      --client-id acme --auto-approve --action-statement "Acme har aldrig haft en dataläcka."
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from datetime import datetime, timezone

import httpx


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", required=True, help="t.ex. https://insider-graph-api-xxx.run.app")
    ap.add_argument("--client-id", required=True)
    ap.add_argument("--admin-key", default=os.environ.get("ADMIN_API_KEY", ""))
    ap.add_argument("--auto-approve", action="store_true", help="godkänn alla genererade frågor (endast test)")
    ap.add_argument("--action-statement", default="", help="om satt: åtgärda första findingen med detta källförsedda claim")
    ap.add_argument("--month", default=datetime.now(timezone.utc).strftime("%Y-%m"))
    ap.add_argument("--timeout", type=int, default=180, help="max sekunder att vänta per pollsteg")
    ap.add_argument("--save-html", default="", help="filväg att spara rapportens HTML till")
    args = ap.parse_args()

    c = httpx.Client(
        base_url=args.base_url.rstrip("/"),
        headers={"X-API-Key": args.admin_key} if args.admin_key else {},
        timeout=30,
    )
    cid = args.client_id

    def step(msg: str) -> None:
        print(f"\n=== {msg} ===", flush=True)

    # 1. Generera frågebatteri
    step("1. risk-generate")
    _post(c, f"/api/jobs/risk-generate/{cid}")
    questions = _poll(c, f"/api/review/{cid}/risk-questions", "questions", args.timeout)
    if not questions:
        print("Inga frågor genererades — Vertex/validator troligen ej konfigurerad (no-op). Avbryter.")
        return 1
    print(f"Genererade {len(questions)} frågor (väntar på review).")

    # 2. Godkänn frågor (test: auto)
    step("2. godkänn frågor")
    if not args.auto_approve:
        print("Hoppar över godkännande (kör med --auto-approve för att godkänna alla). Avbryter.")
        return 0
    for q in questions:
        _post(c, f"/api/review/{cid}/risk-questions/{q['id']}", {"decision": "approve"})
    print(f"Godkände {len(questions)} frågor.")

    # 3. Detektera + klassa
    step("3. risk-detect")
    _post(c, f"/api/jobs/risk-detect/{cid}")
    print(f"Väntar {args.timeout}s på klassning (findings kan legitimt bli 0)...")
    findings = _poll(c, f"/api/review/{cid}/risks", "findings", args.timeout, allow_empty=True)
    print(f"{len(findings)} öppna findings.")
    for f in findings[:10]:
        print(f"  [{f.get('severity')}] {f.get('harm')} {f.get('persona')} — {f.get('question')}")

    # 4. Åtgärda första findingen (valfritt)
    if args.action_statement and findings:
        step("4. åtgärda första findingen")
        fid = findings[0]["id"]
        r = _post(c, f"/api/review/{cid}/risks/{fid}",
                  {"decision": "action", "statement": args.action_statement})
        print(f"Åtgärdade {fid} → claim {r.get('claim_id')} (recompile schemalagd).")

    # 5. Månadsrapport
    step("5. monthly-report")
    _post(c, f"/api/jobs/monthly-report/{cid}", params={"month": args.month})
    _poll_month(c, cid, args.month, args.timeout)
    report = _get(c, f"/api/reports/{cid}/{args.month}")
    conf = (report.get("decision_confidence") or {})
    print(f"Beslutssäkerhet: {conf.get('score')}/100 ({conf.get('stage')}) — {report.get('verdict')}")
    print(f"Nästa steg: {conf.get('next_step')}")
    print(f"Narrativ-utkast: {'ja' if report.get('draft_narrative') else 'nej (LLM ej konfig?)'}")

    if args.save_html:
        html = c.get(f"/api/reports/{cid}/{args.month}/html").text
        with open(args.save_html, "w", encoding="utf-8") as fh:
            fh.write(html)
        print(f"Sparade HTML → {args.save_html}")

    step("KLART — loopen kördes end-to-end")
    return 0


def _post(c: httpx.Client, path: str, json: dict | None = None, params: dict | None = None) -> dict:
    r = c.post(path, json=json, params=params)
    r.raise_for_status()
    return r.json() if r.content else {}


def _get(c: httpx.Client, path: str) -> dict:
    r = c.get(path)
    r.raise_for_status()
    return r.json()


def _poll(c: httpx.Client, path: str, key: str, timeout: int, allow_empty: bool = False) -> list:
    """Polla en läs-endpoint tills key-listan är icke-tom (eller timeout). allow_empty:
    vänta hela timeouten och returnera vad som finns (för findings som kan vara 0)."""
    deadline = time.time() + timeout
    last: list = []
    while time.time() < deadline:
        last = _get(c, path).get(key, []) or []
        if last and not allow_empty:
            return last
        time.sleep(5)
    return last


def _poll_month(c: httpx.Client, cid: str, month: str, timeout: int) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if month in (_get(c, f"/api/reports/{cid}").get("months") or []):
            return
        time.sleep(5)
    print(f"Varning: rapport {month} dök inte upp inom {timeout}s.")


if __name__ == "__main__":
    sys.exit(main())
