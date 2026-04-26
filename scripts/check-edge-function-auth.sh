#!/usr/bin/env bash
# check-edge-function-auth.sh
# Fails if any Supabase edge function uses SERVICE_ROLE_KEY without an auth gate.
# Auth gates: requireOrgMember, requireCronSecret, stripe-signature, verifyHeader
set -e

FAIL=0

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

exit $FAIL
