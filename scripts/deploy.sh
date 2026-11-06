#!/usr/bin/env bash
# Deploy + secrets + smoke. Secrets read from .secrets/ via stdin; never echoed.
set -euo pipefail; cd "$(dirname "$0")/.."
export CLOUDFLARE_ACCOUNT_ID=dbf95fcb6f038ed2fc5818f64280b610 CI=1 WRANGLER_SEND_METRICS=false
npx wrangler deploy 2>&1 | grep -E "Uploaded|workers.dev|schedule|ERROR"
for n in SELFTEST_TOKEN IP_HASH_SALT; do npx wrangler secret put $n < .secrets/$n >/dev/null 2>&1 && echo "secret $n set"; done
npx wrangler secret put OPERATOR_IP_HASHES < .secrets/OPERATOR_IP_HASHES >/dev/null 2>&1 && echo "secret OPERATOR_IP_HASHES set"
npx wrangler secret put RECEIPT_SIGNING_KEY_JWK < .secrets/receipt_signing_key.jwk >/dev/null 2>&1 && echo "secret RECEIPT_SIGNING_KEY_JWK set"
