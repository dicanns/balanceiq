/**
 * Custom Payment Instructions (spec 3.5.6 v2) — pure utility functions.
 * No React, no Electron dependency. Imported by App.jsx and tests.
 */

// ── Internal helpers ──────────────────────────────────────────────────────────

function escapeHtmlCPI(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}

// Simple deterministic hash for audit "before/after" fingerprints.
// Not cryptographic — just stable change detection in an append-only audit log.
export function cpiHash(text) {
  if (!text) return 'empty';
  let h = 5381;
  for (let i = 0; i < text.length; i++) { h = ((h << 5) + h) ^ text.charCodeAt(i); h |= 0; }
  return Math.abs(h).toString(16).padStart(8, '0');
}

// ── Sanitization (write-time) ─────────────────────────────────────────────────

/**
 * Sanitize raw input for storage per spec 3.5.6.7.
 * Returns { text, sanitized, error }.
 *   sanitized: true only when meaningful content was removed (HTML tags, null bytes, blocked schemes).
 *   error: 'too_long' when post-sanitization length > 500 — caller must reject the write.
 */
export function sanitizeCPI(raw) {
  if (!raw) return { text: '', sanitized: false, error: null };

  let s = String(raw);

  // Meaningful-removal detection flags
  const hadNullBytes = s.includes('\0');
  s = s.replace(/\0/g, '');

  // Normalize line endings
  s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Strip HTML tags — all of them
  const beforeHtml = s;
  s = s.replace(/<[^>]*>/g, '');
  const hadHtml = s !== beforeHtml;

  // Check for blocked URL schemes before per-line trim (they survive trimming)
  const hadBlockedSchemes = /\b(javascript:|data:|file:|vbscript:)/i.test(s);

  // Per-line: trim leading/trailing whitespace only, preserve internal spaces
  s = s.split('\n').map(line => line.trimStart().trimEnd()).join('\n');

  // Collapse runs of 3+ consecutive blank lines to 1 blank line
  s = s.replace(/\n{3,}/g, '\n\n');

  // Trim overall
  s = s.trim();

  // Reject over 500 — do NOT silently truncate
  if (s.length > 500) {
    return { text: '', sanitized: false, error: 'too_long' };
  }

  const sanitized = hadNullBytes || hadHtml || hadBlockedSchemes;

  return { text: s, sanitized, error: null };
}

// ── Insecure URL detection (editor warning) ───────────────────────────────────

/**
 * Returns true if the text contains http:// (insecure) URLs.
 * Used by the editor to display an inline warning.
 */
export function hasInsecureUrls(text) {
  if (!text) return false;
  return /\bhttp:\/\/[^\s<>"']+/.test(text);
}

// ── Rendering (PDF / email) ───────────────────────────────────────────────────

// Only https:// URLs become clickable links. http:// and all other schemes render as plain text.
const HTTPS_REGEX = /\bhttps:\/\/[^\s<>"']+/g;

/**
 * Render sanitized CPI text as safe HTML.
 *   - Escapes all entities
 *   - https:// URLs → anchor tags with hostname hint
 *   - http:// and other schemes → plain text only
 *   - Phishing disclosure appended when any https link is present
 *   - Line breaks preserved as <br/>
 */
export function renderCPIHtml(text) {
  if (!text) return '';

  let hasLinks = false;
  let result = '';
  let lastIndex = 0;

  HTTPS_REGEX.lastIndex = 0;
  let match;
  while ((match = HTTPS_REGEX.exec(text)) !== null) {
    result += escapeHtmlCPI(text.slice(lastIndex, match.index));
    const url = match[0];
    hasLinks = true;
    let hostname = '';
    try { hostname = new URL(url).hostname; } catch (_) {}
    result += `<a href="${escapeHtmlCPI(url)}" target="_blank" rel="noopener noreferrer" style="color:#2563eb;word-break:break-all">${escapeHtmlCPI(url)}</a>`;
    if (hostname) result += ` <span style="font-size:10px;color:#6b7280">(${escapeHtmlCPI(hostname)})</span>`;
    lastIndex = match.index + url.length;
  }
  result += escapeHtmlCPI(text.slice(lastIndex));

  // Preserve line breaks
  result = result.replace(/\n/g, '<br/>');

  if (!hasLinks) return result;

  const disclosure = `<div style="margin-top:8px;padding-top:6px;border-top:1px solid #e5e7eb;font-size:10px;color:#9ca3af;font-style:italic">Lien de paiement externe fourni par le commerçant. BalanceIQ ne vérifie pas ces liens. / External payment link provided by the merchant. BalanceIQ does not verify these links.</div>`;
  return result + disclosure;
}

// ── Snapshot lifecycle (pure helpers, side-effect-free) ───────────────────────

/**
 * The value to render on a given surface.
 * PDF uses snapshot if present, else current draft.
 * Email/public page callers should pass renderMode='sent' to get snapshot-only.
 */
export function resolveRenderValue(invoice, renderMode = 'preview') {
  if (renderMode === 'sent') {
    return invoice.customPaymentInstructionsSnapshot ?? null;
  }
  // 'preview': snapshot if present, else draft
  return invoice.customPaymentInstructionsSnapshot ?? invoice.customPaymentInstructions ?? null;
}

/** True if this invoice has never been sent (no snapshot yet). */
export function needsSnapshot(invoice) {
  return invoice.customPaymentInstructionsSnapshot == null;
}

/** True if a post-send edit means the draft now differs from the snapshot. */
export function isSentAndDiffers(invoice, draftText) {
  if (invoice.customPaymentInstructionsSnapshot == null) return false;
  return (draftText || '') !== (invoice.customPaymentInstructionsSnapshot || '');
}

/**
 * Return a new invoice object with the initial snapshot set.
 * Does not write anything — caller persists and audits.
 */
export function applyInitialSnapshot(invoice) {
  return {
    ...invoice,
    customPaymentInstructionsSnapshot: invoice.customPaymentInstructions ?? null,
  };
}

/**
 * Return the new invoice object after a reissue, or an error.
 * Does not write anything — caller persists and audits.
 */
export function applyReissueSnapshot(invoice, draftText, reason) {
  if (!reason || !reason.trim()) return { invoice: null, error: 'reason_required' };
  return {
    invoice: {
      ...invoice,
      customPaymentInstructions: draftText ?? null,
      customPaymentInstructionsSnapshot: draftText ?? null,
    },
    error: null,
  };
}

/**
 * True when a reissue actually changed the snapshot — only then should an audit event be written.
 */
export function shouldWriteReissueAudit(oldSnapshot, newText) {
  return (oldSnapshot ?? null) !== (newText ?? null);
}

/**
 * Build the audit event object for payment_instructions_snapshotted.
 * Caller passes this to window.api.audit.log().
 */
export function buildSnapshotAuditEvent({ invoiceId, trigger, newText, oldSnapshot = null, reason = null }) {
  return {
    module: 'invoice',
    action: 'payment_instructions_snapshotted',
    recordType: 'facture',
    recordId: String(invoiceId),
    fieldName: 'custom_payment_instructions_snapshot',
    oldValue: oldSnapshot != null ? cpiHash(oldSnapshot) : null,
    newValue: cpiHash(newText || ''),
    reason: reason ?? null,
    metadata: JSON.stringify({ trigger }),
  };
}

/**
 * Build the audit event object for instruction_sanitized.
 */
export function buildSanitizeAuditEvent({ invoiceId, originalLength, sanitizedLength }) {
  return {
    module: 'invoice',
    action: 'instruction_sanitized',
    recordType: 'facture',
    recordId: String(invoiceId),
    fieldName: 'custom_payment_instructions',
    oldValue: String(originalLength),
    newValue: String(sanitizedLength),
    reason: null,
  };
}
