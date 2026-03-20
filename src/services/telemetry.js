// ── TELEMETRY SERVICE ───────────────────────────────────────────────────────
// Lightweight anonymous usage analytics.
// Respects user choice. Never sends financial data, names, or business info.
// Cloud users (Pro/Franchise): auto-tracked (they've agreed to cloud terms).
// Free local-only users: opt-in only, asked once on first launch.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase.js';
import { getActivePlan } from '../config/features.js';
import { getCloudOrgId } from './cloudSync.js';
import { version as appVersion } from '../../package.json';

const DEBOUNCE_MS = 5 * 60 * 1000; // 5 min per event key
const FLUSH_INTERVAL_MS = 60 * 1000; // batch flush every 60s
const QUEUE_MAX = 200; // cap offline queue size

// ── MODULE STATE ─────────────────────────────────────────────────────────────
let _consent = null; // 'opted_in' | 'opted_out' | null
let _queue = [];
let _lastFired = {}; // eventName → timestamp
let _flushTimer = null;
let _deviceId = null;
let _platform = null;

// ── INIT ─────────────────────────────────────────────────────────────────────
export async function initTelemetry(deviceId) {
  _deviceId = deviceId;
  _platform = typeof navigator !== 'undefined' ? (navigator.platform || 'unknown') : 'unknown';

  try {
    const r = await window.api.storage.get('balanceiq-telemetry-consent');
    _consent = r?.value || null;
  } catch (_) {}

  try {
    const r = await window.api.storage.get('balanceiq-telemetry-queue');
    if (r?.value) _queue = JSON.parse(r.value);
  } catch (_) {}

  if (_flushTimer) clearInterval(_flushTimer);
  _flushTimer = setInterval(_flush, FLUSH_INTERVAL_MS);

  if (_consent === 'opted_in') setTimeout(_flush, 5000);
}

// ── CONSENT ──────────────────────────────────────────────────────────────────
export function getTelemetryConsent() {
  return _consent;
}

export async function setTelemetryConsent(value) {
  _consent = value;
  try {
    await window.api.storage.set('balanceiq-telemetry-consent', value);
  } catch (_) {}
  if (value === 'opted_in') setTimeout(_flush, 1000);
}

// ── TRACK ─────────────────────────────────────────────────────────────────────
export function trackEvent(eventName, metadata = {}) {
  // Always respect explicit opt-out
  if (_consent === 'opted_out') return;

  const isCloudConnected = !!getCloudOrgId();
  // Cloud users auto-tracked; free local users require explicit opt-in
  if (!isCloudConnected && _consent !== 'opted_in') return;

  const now = Date.now();
  if ((now - (_lastFired[eventName] || 0)) < DEBOUNCE_MS) return;
  _lastFired[eventName] = now;

  _queue.push({
    org_id: getCloudOrgId() || _deviceId || 'anonymous',
    event: eventName,
    metadata,
    plan: getActivePlan(),
    app_version: appVersion,
    platform: _platform,
    created_at: new Date().toISOString(),
  });

  _persistQueue();
}

// ── FLUSH ─────────────────────────────────────────────────────────────────────
async function _flush() {
  if (_consent === 'opted_out') return;
  const isCloudConnected = !!getCloudOrgId();
  if (!isCloudConnected && _consent !== 'opted_in') return;
  if (_queue.length === 0) return;

  const batch = [..._queue];
  _queue = [];
  _persistQueue();

  try {
    const { error } = await supabase.from('usage_events').insert(batch);
    if (error) throw error;
  } catch (_) {
    // Offline — re-queue for next attempt
    _queue = [...batch, ..._queue];
    _persistQueue();
  }
}

async function _persistQueue() {
  try {
    await window.api.storage.set(
      'balanceiq-telemetry-queue',
      JSON.stringify(_queue.slice(-QUEUE_MAX))
    );
  } catch (_) {}
}
