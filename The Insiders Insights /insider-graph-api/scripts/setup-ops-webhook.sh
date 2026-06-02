#!/usr/bin/env bash
# Engångs-helper för ops-webhook-token:
#   1. Genererar en 32-byte hex-slumpsträng.
#   2. Skapar/uppdaterar Secret Manager-secreten `insider-graph-ops-webhook-token`.
#   3. Exporterar OPS_WEBHOOK_TOKEN och kör bootstrap.sh så Pub/Sub-subscriptionen
#      får rätt push-URL och Cloud Run-tjänsten får token:n i sin env.
#
# Krav: gcloud authad mot rätt projekt, openssl installerat.
# Idempotent: kan köras om — befintlig secret får en ny version, bootstrap.sh
# uppdaterar subscription i stället för att duplicera.

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
if [[ -z "$PROJECT_ID" ]]; then
  echo "PROJECT_ID är inte satt och gcloud har inget default-projekt." >&2
  exit 1
fi

SECRET_NAME="insider-graph-ops-webhook-token"
HERE="$(cd "$(dirname "$0")" && pwd)"

# 1. Generera token (om OPS_WEBHOOK_TOKEN inte redan är satt utifrån — då
#    återanvänder vi det värdet, t.ex. vid re-run från CI).
TOKEN="${OPS_WEBHOOK_TOKEN:-$(openssl rand -hex 32)}"

# 2. Säkerställ att secreten finns; lägg värdet som ny version.
if ! gcloud secrets describe "$SECRET_NAME" --project="$PROJECT_ID" >/dev/null 2>&1; then
  echo "==> Skapar Secret Manager-secret: $SECRET_NAME"
  printf '%s' "$TOKEN" | gcloud secrets create "$SECRET_NAME" \
    --replication-policy=automatic \
    --data-file=- --project="$PROJECT_ID"
else
  echo "==> Lägger ny version på $SECRET_NAME"
  printf '%s' "$TOKEN" | gcloud secrets versions add "$SECRET_NAME" \
    --data-file=- --project="$PROJECT_ID"
fi

# 3. Kör bootstrap.sh så Pub/Sub + service-env synkar mot den nya token:n.
export OPS_WEBHOOK_TOKEN="$TOKEN"
echo "==> Kör bootstrap.sh med OPS_WEBHOOK_TOKEN satt"
bash "$HERE/bootstrap.sh"

cat <<EOF

==> Klart.

Nästa steg (Konsol):
  1. Billing → Budgets & alerts → välj din budget.
  2. Manage notifications → Connect a Pub/Sub topic → välj 'ops-budget-alerts'.
  3. Spara. Vid nästa tröskel-passering hamnar larmet i inboxen
     under "Drift-larm" på /insider-graph/ops-alerts.

För framtida körningar:
  Token:n ligger i Secret Manager. Vill du rotera den, kör om scriptet —
  ny version, samma flöde. För att verifiera token:n i utvecklarens hand:
    gcloud secrets versions access latest --secret=$SECRET_NAME

EOF
