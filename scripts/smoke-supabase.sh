#!/usr/bin/env bash
set -euo pipefail

PROD_URL=${1:-""}
BEARER_TOKEN=${AXE_TEST_BEARER:-""}

if [ -z "$PROD_URL" ]; then
  echo "Usage: $0 https://your-runtime-url"
  echo "Optional: export AXE_TEST_BEARER=<supabase access token> for authenticated routes"
  exit 2
fi

api() {
  local method=$1
  local path=$2
  local body=${3:-}
  if [ -n "$BEARER_TOKEN" ]; then
    if [ -n "$body" ]; then
      curl -sS -X "$method" "$PROD_URL$path" \
        -H "Authorization: Bearer $BEARER_TOKEN" \
        -H 'Content-Type: application/json' \
        -d "$body"
    else
      curl -sS -X "$method" "$PROD_URL$path" \
        -H "Authorization: Bearer $BEARER_TOKEN"
    fi
  else
    if [ -n "$body" ]; then
      curl -sS -X "$method" "$PROD_URL$path" \
        -H 'Content-Type: application/json' \
        -d "$body"
    else
      curl -sS -X "$method" "$PROD_URL$path"
    fi
  fi
}

echo "== Adaptive suggestions =="
api GET "/api/adaptive/suggestions" | jq .

echo "== Adaptive decisions =="
api GET "/api/adaptive/decisions" | jq .

echo "== Broker hub =="
api GET "/api/broker/hub" | jq .

echo "== Optional suggestion resolve =="
SUGGESTION_ID=$(
  api GET "/api/adaptive/suggestions" |
    jq -r '.suggestions[0].id // .data[0].id // empty'
)
if [ -n "$SUGGESTION_ID" ]; then
  api POST "/api/adaptive/suggestions/$SUGGESTION_ID" '{"action":"dismiss"}' | jq .
else
  echo "No pending suggestion found; skipping resolve check"
fi

echo "Smoke checks complete"
