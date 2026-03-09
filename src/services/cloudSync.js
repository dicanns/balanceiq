// ── CLOUD SYNC SERVICE (Franchise Tier — Future) ─────────────────────────────
//
// This service will sync audit_log and daily_snapshots to Supabase
// when the Franchise cloud tier is implemented.
//
// TODO: Sync audit_log and daily_snapshots to Supabase
//       when Franchise cloud tier is implemented.
//
// Architecture plan:
//   - audit_log rows sync upward to Supabase after each INSERT
//   - daily_snapshots sync upward on creation
//   - Both are READ-ONLY on the cloud — even the franchisor cannot modify them
//   - The cloud acts as a backup: audit trail survives reinstall / hardware change
//   - Franchisor dashboard queries Supabase directly for cross-location audit view
//   - Sync is one-way (device → cloud) for audit/snapshot data
//   - Conflicts are impossible because audit_log is append-only
//
// Supabase tables to create (mirror of SQLite schema):
//   audit_log      (same columns + location_id)
//   daily_snapshots (same columns + location_id)
//
// ─────────────────────────────────────────────────────────────────────────────

export const CLOUD_SYNC_ENABLED = false; // flip to true when Supabase is wired

/**
 * syncAuditEntry — pushes a single audit_log row to Supabase.
 * No-op until CLOUD_SYNC_ENABLED is true.
 */
export async function syncAuditEntry(/* entry */) {
  if (!CLOUD_SYNC_ENABLED) return;
  // TODO: implement Supabase upsert
}

/**
 * syncSnapshot — pushes a daily_snapshot row to Supabase.
 * No-op until CLOUD_SYNC_ENABLED is true.
 */
export async function syncSnapshot(/* snapshot */) {
  if (!CLOUD_SYNC_ENABLED) return;
  // TODO: implement Supabase insert
}
