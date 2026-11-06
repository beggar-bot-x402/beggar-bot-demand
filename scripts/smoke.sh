#!/usr/bin/env bash
# usage: scripts/smoke.sh https://beggar-bot-demand.<sub>.workers.dev   (self-test header; token read from file, not printed)
set -uo pipefail; cd "$(dirname "$0")/.."; B="$1"; H="x-beggar-selftest: $(cat .secrets/SELFTEST_TOKEN)"
for p in / /llms.txt /robots.txt /sitemap.xml /openapi.json /.well-known/x402 /.well-known/agent.json /.well-known/agent-card.json /.well-known/beggar-bot-keys.json \
  "/v1/risk?address=0x036CbD53842c5426634e7929541eC2318f3dCF7e" "/v1/risk?endpoint=https://example.com" \
  "/v1/verify?payer=0x000000000000000000000000000000000000dEaD&payee=0x000000000000000000000000000000000000bEEF&amount=0.1&invoice=smoke&lookback_blocks=400"; do
  echo "$(curl -s -o /dev/null -w '%{http_code}' -H "$H" "$B$p") GET $p"; done
echo "$(curl -s -o /dev/null -w '%{http_code}' -H "$H" -X POST -d '{"tx_hash":"0x'$(printf '0%.0s' {1..64})'","payer":"0x000000000000000000000000000000000000dEaD","payee":"0x000000000000000000000000000000000000bEEF","amount":"0.1"}' "$B/v1/receipt") POST /v1/receipt (expect 404: fake tx)"
