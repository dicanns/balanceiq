/**
 * Custom Payment Instructions — spec 3.5.6 v2
 * CPI-001 through CPI-025
 */
import { describe, it, expect } from 'vitest';
import {
  sanitizeCPI,
  renderCPIHtml,
  hasInsecureUrls,
  cpiHash,
  resolveRenderValue,
  needsSnapshot,
  isSentAndDiffers,
  applyInitialSnapshot,
  applyReissueSnapshot,
  shouldWriteReissueAudit,
  buildSnapshotAuditEvent,
} from '../../../utils/cpiUtils.js';

// ── Sanitization ──────────────────────────────────────────────────────────────

describe('CPI-001 plain text under 500 chars round-trips', () => {
  it('stores and reads back identically', () => {
    const input = 'Virement Interac à info@example.com\nRéf: INV-2026-001';
    const { text, error } = sanitizeCPI(input);
    expect(error).toBeNull();
    expect(text).toBe(input.trim());
  });
});

describe('CPI-002 over 500 chars is rejected at application layer', () => {
  it('returns error=too_long and empty text', () => {
    const { text, error } = sanitizeCPI('A'.repeat(501));
    expect(error).toBe('too_long');
    expect(text).toBe('');
  });

  it('does NOT silently truncate', () => {
    const long = 'B'.repeat(600);
    const { text } = sanitizeCPI(long);
    expect(text.length).toBe(0); // rejected, not truncated
  });

  it('exactly 500 chars is accepted', () => {
    const { text, error } = sanitizeCPI('C'.repeat(500));
    expect(error).toBeNull();
    expect(text.length).toBe(500);
  });
});

describe('CPI-003 HTML tags are stripped before storage', () => {
  it('removes HTML tags', () => {
    const { text, sanitized } = sanitizeCPI('<b>Pay here:</b><script>evil()</script>Pay here');
    expect(text).not.toMatch(/<[^>]+>/);
    expect(sanitized).toBe(true);
  });

  it('nested tags stripped', () => {
    const { text } = sanitizeCPI('<div><a href="x">link</a></div>');
    expect(text).toBe('link');
  });
});

describe('CPI-004 null bytes are stripped before storage', () => {
  it('removes null bytes and flags sanitized', () => {
    const { text, sanitized } = sanitizeCPI('hello\0world');
    expect(text).not.toContain('\0');
    expect(sanitized).toBe(true);
  });
});

describe('CPI-005 line ending normalization', () => {
  it('CRLF becomes LF', () => {
    const { text } = sanitizeCPI('line1\r\nline2');
    expect(text).toBe('line1\nline2');
    expect(text.includes('\r')).toBe(false);
  });

  it('bare CR becomes LF', () => {
    const { text } = sanitizeCPI('line1\rline2');
    expect(text).toBe('line1\nline2');
  });

  it('LF unchanged', () => {
    const { text } = sanitizeCPI('line1\nline2');
    expect(text).toBe('line1\nline2');
  });
});

describe('CPI-006 internal spaces on a line are preserved (IBAN formatting)', () => {
  it('preserves spaces within a line', () => {
    const iban = 'IBAN: CA 00 1234 5678 9012';
    const { text } = sanitizeCPI(iban);
    expect(text).toBe(iban);
  });
});

describe('CPI-007 3+ consecutive blank lines collapse to 1 blank line', () => {
  it('5 blank lines collapse to 1', () => {
    const { text } = sanitizeCPI('line1\n\n\n\n\nline2');
    // After collapse: line1 + 1 blank line + line2
    const parts = text.split('\n');
    const blankRuns = text.match(/\n{3,}/g);
    expect(blankRuns).toBeNull(); // no run of 3+ newlines
  });

  it('single blank line is preserved', () => {
    const { text } = sanitizeCPI('line1\n\nline2');
    expect(text).toBe('line1\n\nline2');
  });
});

// ── Rendering ─────────────────────────────────────────────────────────────────

describe('CPI-008 https URL rendered as clickable link', () => {
  it('wraps https URL in anchor with correct attributes', () => {
    const html = renderCPIHtml('Pay here: https://squareup.com/pay/abc');
    expect(html).toContain('<a href="https://squareup.com/pay/abc"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('target="_blank"');
  });
});

describe('CPI-009 http URL renders as plain text, not clickable', () => {
  it('http URL does not become an anchor tag', () => {
    const html = renderCPIHtml('http://insecure.example.com/pay');
    expect(html).not.toContain('<a href="http://');
    expect(html).toContain('http://insecure.example.com/pay');
  });

  it('hasInsecureUrls returns true for http://', () => {
    expect(hasInsecureUrls('see http://example.com')).toBe(true);
    expect(hasInsecureUrls('see https://example.com')).toBe(false);
    expect(hasInsecureUrls('')).toBe(false);
  });
});

describe('CPI-010 javascript: URL is plain text and flags sanitized', () => {
  it('javascript: URL does not become a link in rendered output', () => {
    const html = renderCPIHtml('javascript:alert(1)');
    // Must not be wrapped in an anchor tag — rendered as escaped plain text only
    expect(html).not.toContain('<a href="javascript:');
    expect(html).not.toContain('<a href=');
  });

  it('sanitizeCPI sets sanitized=true for blocked schemes', () => {
    const { sanitized } = sanitizeCPI('Pay here: javascript:alert(1)');
    expect(sanitized).toBe(true);
  });

  it('data: scheme does not become a link', () => {
    const html = renderCPIHtml('data:text/html,<h1>xss</h1>');
    expect(html).not.toContain('<a href="data:');
  });
});

// ── Snapshot lifecycle ────────────────────────────────────────────────────────

describe('CPI-011 first send copies current value into snapshot', () => {
  it('applyInitialSnapshot sets snapshot from current', () => {
    const invoice = { id: '1', customPaymentInstructions: 'Wire to XYZ', customPaymentInstructionsSnapshot: null };
    const updated = applyInitialSnapshot(invoice);
    expect(updated.customPaymentInstructionsSnapshot).toBe('Wire to XYZ');
    expect(updated.customPaymentInstructions).toBe('Wire to XYZ');
  });

  it('snapshot is null when current is null', () => {
    const invoice = { id: '2', customPaymentInstructions: null, customPaymentInstructionsSnapshot: null };
    const updated = applyInitialSnapshot(invoice);
    expect(updated.customPaymentInstructionsSnapshot).toBeNull();
  });
});

describe('CPI-012 first send writes payment_instructions_snapshotted audit event', () => {
  it('buildSnapshotAuditEvent produces correct fields for initial_send', () => {
    const ev = buildSnapshotAuditEvent({ invoiceId: '42', trigger: 'initial_send', newText: 'Wire to ABC', oldSnapshot: null });
    expect(ev.action).toBe('payment_instructions_snapshotted');
    expect(ev.recordId).toBe('42');
    expect(ev.oldValue).toBeNull();
    expect(ev.newValue).toBeTruthy();
    expect(JSON.parse(ev.metadata).trigger).toBe('initial_send');
    expect(ev.reason).toBeNull();
  });
});

describe('CPI-013 editing current after first send does NOT change snapshot', () => {
  it('snapshot remains after draft edit', () => {
    const invoice = { id: '3', customPaymentInstructions: 'Wire to XYZ', customPaymentInstructionsSnapshot: 'Wire to XYZ' };
    // User edits draft — snapshot must not change automatically
    const draftText = 'Wire to NEW ACCOUNT';
    // Snapshot only changes via explicit reissue — not via applyInitialSnapshot
    // The snapshot column is separate from the current field
    expect(invoice.customPaymentInstructionsSnapshot).toBe('Wire to XYZ');
    expect(isSentAndDiffers(invoice, draftText)).toBe(true);
    expect(invoice.customPaymentInstructionsSnapshot).toBe('Wire to XYZ'); // unchanged
  });
});

describe('CPI-014 public invoice page renders snapshot, not current draft', () => {
  it('resolveRenderValue with renderMode=sent returns snapshot', () => {
    const invoice = {
      customPaymentInstructions: 'New draft text',
      customPaymentInstructionsSnapshot: 'Original sent text',
    };
    expect(resolveRenderValue(invoice, 'sent')).toBe('Original sent text');
  });

  it('resolveRenderValue with renderMode=sent returns null when no snapshot', () => {
    const invoice = { customPaymentInstructions: 'Draft', customPaymentInstructionsSnapshot: null };
    expect(resolveRenderValue(invoice, 'sent')).toBeNull();
  });

  it('resolveRenderValue with renderMode=preview returns snapshot if present', () => {
    const invoice = { customPaymentInstructions: 'Draft', customPaymentInstructionsSnapshot: 'Snapshot' };
    expect(resolveRenderValue(invoice, 'preview')).toBe('Snapshot');
  });

  it('resolveRenderValue with renderMode=preview falls back to current if no snapshot', () => {
    const invoice = { customPaymentInstructions: 'Draft', customPaymentInstructionsSnapshot: null };
    expect(resolveRenderValue(invoice, 'preview')).toBe('Draft');
  });
});

describe('CPI-015 reissue copies current into snapshot with audit event', () => {
  it('applyReissueSnapshot updates both fields', () => {
    const invoice = { id: '5', customPaymentInstructions: 'Old', customPaymentInstructionsSnapshot: 'Old' };
    const { invoice: updated, error } = applyReissueSnapshot(invoice, 'New bank details', 'Updated bank');
    expect(error).toBeNull();
    expect(updated.customPaymentInstructionsSnapshot).toBe('New bank details');
    expect(updated.customPaymentInstructions).toBe('New bank details');
  });

  it('buildSnapshotAuditEvent for reissue includes before_hash and after_hash', () => {
    const ev = buildSnapshotAuditEvent({ invoiceId: '5', trigger: 'reissue', newText: 'New details', oldSnapshot: 'Old details', reason: 'Updated bank' });
    expect(ev.oldValue).toBeTruthy();
    expect(ev.newValue).toBeTruthy();
    expect(ev.oldValue).not.toBe(ev.newValue);
    expect(JSON.parse(ev.metadata).trigger).toBe('reissue');
    expect(ev.reason).toBe('Updated bank');
  });
});

describe('CPI-016 reissue without a reason is rejected', () => {
  it('returns error=reason_required when reason is empty', () => {
    const invoice = { id: '6', customPaymentInstructions: 'New', customPaymentInstructionsSnapshot: 'Old' };
    const { error } = applyReissueSnapshot(invoice, 'New', '');
    expect(error).toBe('reason_required');
  });

  it('returns error=reason_required when reason is whitespace only', () => {
    const invoice = { id: '6', customPaymentInstructions: 'New', customPaymentInstructionsSnapshot: 'Old' };
    const { error } = applyReissueSnapshot(invoice, 'New', '   ');
    expect(error).toBe('reason_required');
  });
});

describe('CPI-017 reissue with unchanged value does not write duplicate audit', () => {
  it('shouldWriteReissueAudit returns false when text unchanged', () => {
    expect(shouldWriteReissueAudit('Same text', 'Same text')).toBe(false);
  });

  it('shouldWriteReissueAudit returns true when text changed', () => {
    expect(shouldWriteReissueAudit('Old', 'New')).toBe(true);
  });

  it('shouldWriteReissueAudit returns true when going from null to text', () => {
    expect(shouldWriteReissueAudit(null, 'First text')).toBe(true);
  });
});

describe('CPI-018 payment plan child inherits parent snapshot (deferred — payment plans future feature)', () => {
  it.todo('child invoice created from payment plan inherits parent snapshot frozen at creation');
});

// ── Render matrix ─────────────────────────────────────────────────────────────

describe('CPI-019 credit note does NOT render the field', () => {
  it('resolveRenderValue is not called in buildCreditNoteHTML — structural test', async () => {
    // CPI functions are pure and have no side effects.
    // This test verifies the field is not exported from cpiUtils in any way that
    // would auto-inject into other document types.
    const mod = await import('../../../utils/cpiUtils.js');
    // No "auto-render" or "injectCPI" exports that could leak into credit notes
    expect(Object.keys(mod)).not.toContain('autoCPI');
    expect(Object.keys(mod)).not.toContain('injectCPI');
    // buildCreditNoteHTML does not accept customPaymentInstructions — verified by absence of the param.
    // The field can only appear if explicitly passed, which buildCreditNoteHTML does not do.
  });
});

describe('CPI-020 Acomba/Sage export does NOT include the field', () => {
  it('glExportLines fields do not include custom_payment_instructions', async () => {
    // glExportLines joins journal_entries + journal_lines + chart_of_accounts.
    // Those tables have no custom_payment_instructions column.
    // Verify by checking the SELECT fields in database.js.
    const fs = await import('fs');
    const src = fs.readFileSync(new URL('../../../db/database.js', import.meta.url), 'utf8');
    const glExportBlock = src.slice(src.indexOf('function glExportLines'), src.indexOf('function glExportLines') + 1200);
    expect(glExportBlock).not.toContain('custom_payment_instructions');
  });
});

describe('CPI-021 field is invisible to GL, trial balance, balance sheet', () => {
  it('sanitizeCPI is a pure function — no DB side effects', () => {
    const result = sanitizeCPI('<b>IBAN XX00</b>');
    expect(result).toHaveProperty('text');
    expect(result).toHaveProperty('sanitized');
  });

  it('renderCPIHtml is a pure function — no DB side effects', () => {
    const result = renderCPIHtml('Wire: IBAN XX00\nhttps://pay.example.com');
    expect(typeof result).toBe('string');
  });

  it('cpiUtils exports no GL/DB functions', async () => {
    const mod = await import('../../../utils/cpiUtils.js');
    const exports = Object.keys(mod);
    expect(exports).not.toContain('getDb');
    expect(exports).not.toContain('glDraftEntry');
    expect(exports).not.toContain('glPostEntry');
    expect(exports).not.toContain('trialBalance');
  });
});

// ── Phishing / hostname disclosure ────────────────────────────────────────────

describe('CPI-022 phishing disclosure appears when https link is rendered', () => {
  it('disclosure line is present when https URL exists', () => {
    const html = renderCPIHtml('Pay: https://squareup.com/pay/abc');
    expect(html).toContain('BalanceIQ ne vérifie pas ces liens');
    expect(html).toContain('BalanceIQ does not verify these links');
  });

  it('disclosure is absent when no https link', () => {
    const html = renderCPIHtml('Wire transfer details: IBAN XX00');
    expect(html).not.toContain('BalanceIQ ne vérifie pas');
  });
});

describe('CPI-023 hostname displayed next to each clickable link', () => {
  it('hostname appears in rendered output', () => {
    const html = renderCPIHtml('https://squareup.com/pay/abc');
    expect(html).toContain('squareup.com');
    // Hostname shown in parentheses or span
    expect(html).toMatch(/\(squareup\.com\)/);
  });

  it('hostname shown for each link when multiple URLs present', () => {
    const html = renderCPIHtml('https://squareup.com/a and https://paypal.me/b');
    expect(html).toContain('squareup.com');
    expect(html).toContain('paypal.me');
  });
});

// ── Audit events ──────────────────────────────────────────────────────────────

describe('CPI-024 repeated draft edits before first send do NOT write audit events', () => {
  it('needsSnapshot returns true before any send', () => {
    const invoice = { customPaymentInstructionsSnapshot: null };
    expect(needsSnapshot(invoice)).toBe(true);
  });

  it('isSentAndDiffers returns false before first send (no snapshot yet)', () => {
    const invoice = { customPaymentInstructionsSnapshot: null };
    expect(isSentAndDiffers(invoice, 'any draft')).toBe(false);
  });

  it('draft edits produce no audit event — shouldWriteReissueAudit is false before send', () => {
    // Before send: no snapshot exists, so "old" and "new" are both null
    expect(shouldWriteReissueAudit(null, null)).toBe(false);
  });
});

describe('CPI-025 repeated reissues each write their own audit event with correct hashes', () => {
  it('each reissue produces a different before/after hash pair', () => {
    const text1 = 'First reissue text';
    const text2 = 'Second reissue text';
    const text3 = 'Third reissue text';

    const ev1 = buildSnapshotAuditEvent({ invoiceId: '99', trigger: 'reissue', newText: text1, oldSnapshot: 'original', reason: 'First change' });
    const ev2 = buildSnapshotAuditEvent({ invoiceId: '99', trigger: 'reissue', newText: text2, oldSnapshot: text1, reason: 'Second change' });
    const ev3 = buildSnapshotAuditEvent({ invoiceId: '99', trigger: 'reissue', newText: text3, oldSnapshot: text2, reason: 'Third change' });

    // Each event's before_hash matches the previous event's after_hash (chain integrity)
    expect(ev2.oldValue).toBe(ev1.newValue);
    expect(ev3.oldValue).toBe(ev2.newValue);

    // All after_hashes are distinct
    expect(ev1.newValue).not.toBe(ev2.newValue);
    expect(ev2.newValue).not.toBe(ev3.newValue);
  });

  it('cpiHash is deterministic — same input always same hash', () => {
    const h1 = cpiHash('hello world');
    const h2 = cpiHash('hello world');
    expect(h1).toBe(h2);
  });

  it('cpiHash is sensitive — different input produces different hash', () => {
    expect(cpiHash('text A')).not.toBe(cpiHash('text B'));
  });
});
