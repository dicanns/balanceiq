#!/usr/bin/env bash
# check-edge-function-auth.sh
# Fails if any Supabase edge function uses SERVICE_ROLE_KEY without an auth gate.
# Also fails if any edge function references a DB table not found in migrations.
# Auth gates: requireOrgMember, requireCronSecret, stripe-signature, verifyHeader
set -e

FAIL=0

# ── Check 1: SERVICE_ROLE_KEY must have an auth gate ─────────────────────────

for f in supabase/functions/*/index.ts; do
  name=$(basename "$(dirname "$f")")

  # Skip shared helpers
  if [ "$name" = "_shared" ]; then continue; fi

  has_service=$(grep -c "SERVICE_ROLE_KEY" "$f" 2>/dev/null || true)
  has_auth=$(grep -cE "requireOrgMember|requireCronSecret|stripe-signature|verifyHeader|x-cron-secret|Authorization.*Bearer|authHeader" "$f" 2>/dev/null || true)

  if [ "$has_service" -gt 0 ] && [ "$has_auth" -eq 0 ]; then
    echo "FAIL: $f uses SERVICE_ROLE_KEY without auth gate"
    FAIL=1
  fi
done

if [ "$FAIL" -eq 0 ]; then
  echo "OK: all edge functions with SERVICE_ROLE_KEY have an auth gate"
fi

# ── Check 2: .from('table') references must exist in migrations ───────────────
# Allowlist: Supabase-managed tables not created by our migration files.
ALLOWLIST="users|organizations|locations|installs"

# Build set of known tables from migration SQL files
KNOWN_TABLES=""
for sql in supabase/migrations/*.sql; do
  [ -f "$sql" ] || continue
  tables=$(grep -ioP "CREATE TABLE (?:IF NOT EXISTS )?(?:public\.)?\K\w+" "$sql" 2>/dev/null || true)
  KNOWN_TABLES="$KNOWN_TABLES $tables"
done

TABLE_FAIL=0
for f in supabase/functions/*/index.ts; do
  name=$(basename "$(dirname "$f")")
  if [ "$name" = "_shared" ]; then continue; fi

  # Extract DB table names: .from('name')
  # Storage bucket references are excluded by name: real table names never contain
  # hyphens, but Supabase storage bucket names often do (e.g. 'franchise-docs').
  while IFS= read -r tbl; do
    [ -z "$tbl" ] && continue

    # Skip storage bucket names (contain a hyphen — not valid unquoted table names)
    if echo "$tbl" | grep -q '-'; then continue; fi

    # Skip allowlisted Supabase-managed tables
    if echo "$tbl" | grep -qE "^($ALLOWLIST)$"; then continue; fi

    # Check if table exists in known migrations
    if ! echo "$KNOWN_TABLES" | grep -qiw "$tbl"; then
      echo "FAIL: $f references table '$tbl' not found in any supabase/migrations/*.sql"
      TABLE_FAIL=1
      FAIL=1
    fi
  done < <(grep -oP "\.from\('\K[^']+" "$f" 2>/dev/null || true)
done

if [ "$TABLE_FAIL" -eq 0 ]; then
  echo "OK: all edge function table references exist in migrations"
fi

exit $FAIL
