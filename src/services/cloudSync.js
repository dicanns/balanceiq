// ── CLOUD SYNC SERVICE ─────────────────────────────────────────────────────
// Pro and Franchise tier only. Free tier is fully offline — no account needed.
// Architecture: every local SQLite save is mirrored to Supabase synced_data.
// Conflict resolution: last-write-wins using updated_at timestamp.
// Offline: changes are queued in memory and flushed when connection returns.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase.js';
import { setPlan } from '../config/features.js';

// ── STATE ──────────────────────────────────────────────────────────────────
let _session = null;       // Supabase auth session
let _orgId = null;         // organization UUID
let _locationId = null;    // location UUID
let _plan = 'free';        // plan from organizations table
let _lastSyncAt = null;    // ISO timestamp of last successful pull
let _offlineQueue = [];    // [{key, value}] queued while offline
let _syncDebounceTimer = null;
let _statusCallback = null; // (status) => void
let _planCallback = null;   // (plan) => void

// ── STATUS ─────────────────────────────────────────────────────────────────
export function onSyncStatus(cb) { _statusCallback = cb; }
export function onPlanChange(cb) { _planCallback = cb; }
function setStatus(s) { _statusCallback?.(s); }

// ── INIT ───────────────────────────────────────────────────────────────────
export async function initCloudSync() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    _session = session;
    await _loadOrgAndPlan();
    const pulled = await _pullNewData();
    setStatus('synced');
    return { session, plan: _plan, orgId: _orgId, locationId: _locationId, pulled };
  } catch (_e) {
    setStatus('error');
    return null;
  }
}

async function _loadOrgAndPlan() {
  const { data: userRow } = await supabase
    .from('users')
    .select('org_id, role')
    .eq('id', _session.user.id)
    .single();
  if (!userRow) return;
  _orgId = userRow.org_id;

  const { data: org } = await supabase
    .from('organizations')
    .select('plan')
    .eq('id', _orgId)
    .single();
  if (org) {
    _plan = org.plan || 'free';
    setPlan(_plan);
    _planCallback?.(_plan);
  }

  const { data: locs } = await supabase
    .from('locations')
    .select('id')
    .eq('org_id', _orgId)
    .limit(1);
  if (locs?.length) {
    _locationId = locs[0].id;
  } else {
    // No location yet (trigger didn't create one) — create it now
    const { data: newLoc } = await supabase
      .from('locations')
      .insert({ org_id: _orgId, name: 'Mon restaurant' })
      .select()
      .single();
    if (newLoc) _locationId = newLoc.id;
    console.log('[CloudSync] auto-created location:', _locationId);
  }
}

// ── SIGN UP ────────────────────────────────────────────────────────────────
// The DB trigger handle_new_user() creates the organization and user records
// automatically on auth.users insert. We just call signUp and return.
// The app should prompt email confirmation, then signIn to load org data.
export async function signUp({ email, password, fullName, orgName }) {
  setStatus('syncing');
  const { data: authData, error: authErr } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName || orgName || email } },
  });
  if (authErr) { setStatus('error'); throw authErr; }
  _session = authData.session;
  _plan = 'free';
  setStatus(null);
  // Return without org/location — trigger creates them server-side.
  // User must confirm email then sign in.
  return { session: _session, plan: _plan, orgId: null, locationId: null };
}

// ── SIGN IN ────────────────────────────────────────────────────────────────
export async function signIn({ email, password }) {
  setStatus('syncing');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) { setStatus('error'); throw error; }
  _session = data.session;
  await _loadOrgAndPlan();
  const pulled = await _pullNewData();
  setStatus('synced');
  return { session: _session, plan: _plan, orgId: _orgId, locationId: _locationId, pulled };
}

// ── SIGN OUT ───────────────────────────────────────────────────────────────
export async function signOut() {
  await supabase.auth.signOut();
  _session = null; _orgId = null; _locationId = null; _plan = 'free';
  _offlineQueue = [];
  setStatus(null);
}

// ── PUSH DATA ──────────────────────────────────────────────────────────────
export function schedulePush(key, value) {
  if (!_session || !_orgId || !_locationId) return;
  if (_plan === 'free') return; // network plan syncs — paid by franchisor

  _offlineQueue = _offlineQueue.filter(q => q.key !== key);
  _offlineQueue.push({ key, value });

  if (_syncDebounceTimer) clearTimeout(_syncDebounceTimer);
  _syncDebounceTimer = setTimeout(_flushQueue, 5000);
  setStatus('syncing');
}

async function _flushQueue() {
  if (!_offlineQueue.length) return;
  if (!_session || !_orgId || !_locationId) return;

  const batch = [..._offlineQueue];
  _offlineQueue = [];

  try {
    const rows = batch.map(({ key, value }) => ({
      org_id: _orgId,
      location_id: _locationId,
      key,
      value: typeof value === 'string' ? JSON.parse(value) : value,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from('synced_data')
      .upsert(rows, { onConflict: 'location_id,key' });

    if (error) {
      _offlineQueue = [...batch, ..._offlineQueue];
      setStatus('error');
    } else {
      setStatus('synced');
    }
  } catch (_e) {
    _offlineQueue = [...batch, ..._offlineQueue];
    setStatus('offline');
  }
}

// ── PULL DATA ──────────────────────────────────────────────────────────────
async function _pullNewData() {
  if (!_orgId || !_locationId) return [];
  try {
    let query = supabase
      .from('synced_data')
      .select('key, value, updated_at')
      .eq('location_id', _locationId);
    if (_lastSyncAt) query = query.gt('updated_at', _lastSyncAt);

    const { data, error } = await query;
    if (error) return [];
    if (data?.length) _lastSyncAt = new Date().toISOString();
    return data || [];
  } catch (_e) {
    return [];
  }
}

export async function pullData() {
  const rows = await _pullNewData();
  setStatus('synced');
  return rows;
}

// ── AUDIT LOG SYNC ─────────────────────────────────────────────────────────
export async function syncAuditEntry(entry) {
  if (!_session || !_orgId || _plan === 'free') return;
  try {
    await supabase.from('audit_log_cloud').insert({
      org_id: _orgId,
      location_id: _locationId,
      timestamp: entry.timestamp,
      device_id: entry.deviceId,
      module: entry.module,
      action: entry.action,
      record_type: entry.recordType,
      record_id: entry.recordId,
      field_name: entry.fieldName,
      old_value: entry.oldValue != null ? String(entry.oldValue) : null,
      new_value: entry.newValue != null ? String(entry.newValue) : null,
      reason: entry.reason,
    });
  } catch (_e) { /* non-fatal */ }
}

// ── SNAPSHOT SYNC ──────────────────────────────────────────────────────────
export async function syncSnapshot(snapshot) {
  if (!_session || !_orgId || _plan === 'free') return;
  schedulePush(`snapshot:${snapshot.date}`, snapshot);
}

// ── PLAN REFRESH ───────────────────────────────────────────────────────────
export async function refreshPlan() {
  if (!_session || !_orgId) return _plan;
  await _loadOrgAndPlan();
  return _plan;
}

// ── GETTERS ────────────────────────────────────────────────────────────────
export function getCloudSession() { return _session; }
export function getCloudPlan() { return _plan; }
export function getCloudOrgId() { return _orgId; }

// Legacy export (referenced by auditLogger.js)
export const CLOUD_SYNC_ENABLED = true;
