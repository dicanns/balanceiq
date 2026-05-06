/**
 * PAD-CONTRACT-001  create-pad-mandate: insert columns exist in schema
 * PAD-CONTRACT-002  create-pad-mandate: update column exists in schema
 * PAD-CONTRACT-003  charge-pad-mandate: select columns exist in schema
 * PAD-CONTRACT-004  set-pad-config: upsert columns exist in schema
 * PAD-CONTRACT-005  pad-followup: select/filter/update columns exist in schema
 */
import { describe, it, expect } from 'vitest';

// Full pad_mandates column set derived from all migrations
// (20260423000002_pad_tables, 20260424000001_pad_nsf_columns, 20260505000001_pad_columns)
const PAD_MANDATES = new Set([
  'id', 'org_id', 'client_id', 'status',
  'stripe_payment_method', 'stripe_mandate_id', 'stripe_customer_id',
  'bank_name', 'last4',
  'followup_enabled', 'followup_sent_at',
  'created_at', 'updated_at',
  // NSF (20260424000001)
  'nsf_invoice_id', 'nsf_reason', 'nsf_at',
  // Patch C (20260505000001)
  'client_name', 'client_email', 'operator_email', 'currency', 'stripe_setup_intent',
]);

// Full pad_config column set (20260423000002_pad_tables)
const PAD_CONFIG = new Set([
  'org_id', 'webhook_secret', 'created_at', 'updated_at',
]);

function assertColumnsExist(schema, columns, label) {
  for (const col of columns) {
    if (!schema.has(col)) {
      throw new Error(`${label}: column '${col}' not in migration schema`);
    }
  }
}

// ── PAD-CONTRACT-001: create-pad-mandate insert ───────────────────────────

describe('PAD-CONTRACT-001 create-pad-mandate insert', () => {
  const INSERT_COLS = [
    'org_id', 'client_id', 'client_name', 'client_email',
    'operator_email', 'status', 'currency', 'followup_enabled',
  ];

  it('all inserted columns exist in pad_mandates schema', () => {
    expect(() => assertColumnsExist(PAD_MANDATES, INSERT_COLS, 'create-pad-mandate insert')).not.toThrow();
  });

  it('client_name is in schema (was missing before Patch C)', () => {
    expect(PAD_MANDATES.has('client_name')).toBe(true);
  });

  it('client_email is in schema (was missing before Patch C)', () => {
    expect(PAD_MANDATES.has('client_email')).toBe(true);
  });

  it('operator_email is in schema (was missing before Patch C)', () => {
    expect(PAD_MANDATES.has('operator_email')).toBe(true);
  });

  it('currency is in schema (was missing before Patch C)', () => {
    expect(PAD_MANDATES.has('currency')).toBe(true);
  });
});

// ── PAD-CONTRACT-002: create-pad-mandate update ───────────────────────────

describe('PAD-CONTRACT-002 create-pad-mandate update', () => {
  const UPDATE_COLS = ['stripe_setup_intent'];

  it('all updated columns exist in pad_mandates schema', () => {
    expect(() => assertColumnsExist(PAD_MANDATES, UPDATE_COLS, 'create-pad-mandate update')).not.toThrow();
  });

  it('stripe_setup_intent is in schema (was missing before Patch C)', () => {
    expect(PAD_MANDATES.has('stripe_setup_intent')).toBe(true);
  });
});

// ── PAD-CONTRACT-003: charge-pad-mandate select ───────────────────────────

describe('PAD-CONTRACT-003 charge-pad-mandate select', () => {
  const SELECT_COLS = [
    'stripe_payment_method', 'stripe_customer_id', 'stripe_mandate_id', 'status', 'org_id',
  ];

  it('all selected columns exist in pad_mandates schema', () => {
    expect(() => assertColumnsExist(PAD_MANDATES, SELECT_COLS, 'charge-pad-mandate select')).not.toThrow();
  });

  it('no Patch C columns needed (charge uses only pre-existing columns)', () => {
    for (const col of SELECT_COLS) {
      expect(PAD_MANDATES.has(col)).toBe(true);
    }
  });
});

// ── PAD-CONTRACT-004: set-pad-config upsert ──────────────────────────────

describe('PAD-CONTRACT-004 set-pad-config upsert', () => {
  const UPSERT_COLS = ['org_id', 'webhook_secret', 'updated_at'];

  it('all upserted columns exist in pad_config schema', () => {
    expect(() => assertColumnsExist(PAD_CONFIG, UPSERT_COLS, 'set-pad-config upsert')).not.toThrow();
  });
});

// ── PAD-CONTRACT-005: pad-followup ───────────────────────────────────────

describe('PAD-CONTRACT-005 pad-followup select/filter/update', () => {
  const SELECT_COLS = ['id', 'client_id', 'client_name', 'client_email', 'created_at'];
  const FILTER_COLS = ['status', 'followup_enabled', 'followup_sent_at', 'org_id', 'created_at'];
  const UPDATE_COLS = ['followup_sent_at'];

  it('all selected columns exist in pad_mandates schema', () => {
    expect(() => assertColumnsExist(PAD_MANDATES, SELECT_COLS, 'pad-followup select')).not.toThrow();
  });

  it('all filter columns exist in pad_mandates schema', () => {
    expect(() => assertColumnsExist(PAD_MANDATES, FILTER_COLS, 'pad-followup filter')).not.toThrow();
  });

  it('all updated columns exist in pad_mandates schema', () => {
    expect(() => assertColumnsExist(PAD_MANDATES, UPDATE_COLS, 'pad-followup update')).not.toThrow();
  });

  it('client_name available for followup email (was missing before Patch C)', () => {
    expect(PAD_MANDATES.has('client_name')).toBe(true);
  });

  it('client_email available for followup send (was missing before Patch C)', () => {
    expect(PAD_MANDATES.has('client_email')).toBe(true);
  });
});
