/**
 * GL-016 — Opening Balance Entry
 *
 * Opening balance is the one entry that cannot be allowed to double-post.
 * If a migration re-runs and opening balance applies twice, every downstream
 * balance is wrong.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildAccountingDb, gl, assertBalanced } from '../helpers/testSchema.js';

let db;

beforeEach(() => { db = buildAccountingDb(); });
afterEach(() => { db.close(); });

describe('GL-016 opening balance entry', () => {
  it('posts a balanced opening_balance entry successfully', () => {
    const cashId = gl.coaId(db, '1010');
    const equityId = gl.coaId(db, '3100');

    const { entryId } = gl.draftAndPost(db, {
      entry_date: '2026-01-01',
      description: 'Solde d\'ouverture 2026',
      source_type: 'opening_balance',
      lines: [
        { account_id: cashId,   debit_cents: 500000, credit_cents: 0 },
        { account_id: equityId, debit_cents: 0,      credit_cents: 500000 },
      ],
    });

    const entry = db.prepare(`SELECT * FROM journal_entries WHERE id=?`).get(entryId);
    expect(entry.status).toBe('posted');
    expect(entry.source_type).toBe('opening_balance');
    expect(assertBalanced(db, entryId)).toBe(true);
  });

  it('rejects a second opening_balance entry for the same location_id', () => {
    const cashId = gl.coaId(db, '1010');
    const equityId = gl.coaId(db, '3100');
    const LOCATION_ID = null; // restaurant mode = no location_id

    const postFirstOb = () => gl.draftAndPost(db, {
      entry_date: '2026-01-01',
      source_type: 'opening_balance',
      location_id: LOCATION_ID,
      lines: [
        { account_id: cashId,   debit_cents: 500000, credit_cents: 0 },
        { account_id: equityId, debit_cents: 0,      credit_cents: 500000 },
      ],
    });

    const postSecondOb = () => gl.draftAndPost(db, {
      entry_date: '2026-01-01',
      source_type: 'opening_balance',
      location_id: LOCATION_ID,
      lines: [
        { account_id: cashId,   debit_cents: 100000, credit_cents: 0 },
        { account_id: equityId, debit_cents: 0,      credit_cents: 100000 },
      ],
    });

    postFirstOb(); // must succeed

    // Second opening_balance for same location must be rejected
    expect(postSecondOb).toThrow();
  });

  it('trial balance sums to zero after a balanced opening entry', () => {
    const cashId = gl.coaId(db, '1010');
    const equityId = gl.coaId(db, '3100');

    gl.draftAndPost(db, {
      entry_date: '2026-01-01',
      source_type: 'opening_balance',
      lines: [
        { account_id: cashId,   debit_cents: 250000, credit_cents: 0 },
        { account_id: equityId, debit_cents: 0,      credit_cents: 250000 },
      ],
    });

    const tb = gl.trialBalance(db, '2026-12-31');
    const netBalance = tb.reduce((s, r) => s + r.balance_cents, 0);
    expect(netBalance).toBe(0);
  });
});
