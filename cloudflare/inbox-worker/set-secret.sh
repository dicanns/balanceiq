#!/usr/bin/env bash
# Makes one new shared secret and gives it to both ends of the bill inbox: the
# Supabase function (INBOX_INGEST_SECRET) and this worker (INGEST_SECRET).
# The secret is never shown or kept in a file that outlives this script.
# Run from anywhere:  bash cloudflare/inbox-worker/set-secret.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
PROJECT_REF="etiwnesxjypdwhxqnqqq"

SECRET="$(openssl rand -hex 32)"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
chmod 600 "$TMP"
printf 'INBOX_INGEST_SECRET=%s\n' "$SECRET" > "$TMP"

echo "1/2 Supabase function secret..."
(cd "$REPO" && npx supabase secrets set --env-file "$TMP" --project-ref "$PROJECT_REF" >/dev/null)
echo "2/2 Cloudflare worker secret..."
(cd "$HERE" && printf '%s' "$SECRET" | npx wrangler secret put INGEST_SECRET >/dev/null)
echo "Done. Both ends now share the same new secret."
