/**
 * WIRE-001  the editor's lock follows the saved status, not the dropdown (K1)
 * WIRE-002  posting on send does not depend on an entry id the screen remembers (K2)
 * WIRE-003  void and return-to-draft take the invoice out of the ledger first (K3)
 * WIRE-004  taking an invoice out of the ledger is looked up by the invoice
 *
 * The logic tests for these paths passed while the screen itself did something
 * else. These read the screen and the main process as they are written.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { buildAccountingDb } from '../helpers/testSchema.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { glDraftEntry, glPostEntry, glReverseEntry, glFindEntryBySource } = require('../../../db/database.js');
const root = path.resolve(__dirname, '../../../..');
const APP = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
const MAIN = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const editor = APP.slice(APP.indexOf('function FactureEditor('), APP.indexOf('function EncaissementEditor('));

describe('WIRE-001 lock', () => {
  it('is computed from the saved invoice', () => {
    expect(editor).toMatch(/const locked=savedStatut!=="Brouillon";/);
    expect(editor).not.toMatch(/const locked=form\.statut/);
    expect(editor).toMatch(/const savedStatut=\(savedId&&\(factures\.find\(f=>f\.id===savedId\)\?\.statut/);
  });
  it('paid and credited statuses cannot be picked by hand', () => {
    expect(APP).toMatch(/const DERIVED_INVOICE_STATUSES=\["Payée partiellement","Payée","En retard","Créditée"\];/);
    expect(editor).toMatch(/disabled=\{DERIVED_INVOICE_STATUSES\.includes\(s\)&&s!==savedStatut\}/);
  });
});

describe('WIRE-002 posting on send', () => {
  it('never consults form.glEntryId', () => {
    expect(editor).toMatch(/const isFinalize=!isProforma&&nowLive&&!wasLive;/);
    expect(editor).not.toMatch(/!form\.glEntryId/);
  });
});

describe('WIRE-003 leaving the ledger', () => {
  it('save reverses before it writes, and stops when the reversal is refused', () => {
    const save = editor.slice(editor.indexOf('const doSave=async()=>{'), editor.indexOf('const doDelete=async()=>{'));
    // The reversal is the ledger step of the one commit that saves the invoice: no separate save, and a refusal stops here.
    expect(save).toMatch(/commitInvoice\(doc,isFinalize\?'post':glCleared\?'unpost':'none'/);
    expect(save).toMatch(/if\(!committed\)return;/);
    expect(save).not.toMatch(/saveFactures\(/);
    const helper = editor.slice(editor.indexOf('const commitInvoice=async'), editor.indexOf('const doSave=async()=>{'));
    expect(helper).toMatch(/ledger==="unpost"\?T\.facUnpostFailed:T\.facCommitFailed/);
    expect(helper).toMatch(/if\(!r\?\.ok\)\{alert\([^;]*;return null;\}/);
  });
  it('void does the same and refuses an invoice with payments', () => {
    const del = editor.slice(editor.indexOf('const doDelete=async()=>{'), editor.indexOf('const doReissue='));
    expect(del.indexOf("'unpost'")).toBeGreaterThan(-1);
    expect(del).toMatch(/commitInvoice\(voidedDoc,releasedWasLive\?'unpost':'none'/);
    expect(del.indexOf('facVoidHasPayments')).toBeLessThan(del.indexOf('commitInvoice('));
    expect(del.indexOf('commitInvoice(')).toBeLessThan(del.lastIndexOf('onBack()'));
  });
});

describe('WIRE-004 unpost by invoice', () => {
  it('the handler finds the entry by source and reverses it', () => {
    const h = MAIN.slice(MAIN.indexOf('function unpostInvoiceFromLedger'), MAIN.indexOf("ipcMain.handle('ledger:creditnote:post'"));
    expect(h).toMatch(/glFindEntryBySource\('invoice', String\(invoiceId\)\)/);
    expect(h).toMatch(/glReverseEntry\(entry\.id/);
  });
  it('after a reversal the invoice has no live entry, so a re-send posts again', () => {
    const db = buildAccountingDb();
    for (const [n, t] of [['1100', 'asset'], ['4000', 'revenue']]) db.prepare(`INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type) VALUES (?,?,?,?)`).run(n, n, n, t);
    const id = (n) => db.prepare(`SELECT id FROM chart_of_accounts WHERE account_number=?`).get(n).id;
    const post = (cents) => {
      const { entryId } = glDraftEntry({ entry_date: '2026-11-03', description: 'inv', source_type: 'invoice', source_id: 'inv-1', lines: [
        { account_id: id('1100'), debit_cents: cents, credit_cents: 0 }, { account_id: id('4000'), debit_cents: 0, credit_cents: cents }] }, db);
      glPostEntry(entryId, db); return entryId;
    };
    const first = post(10000);
    expect(glFindEntryBySource('invoice', 'inv-1', db).id).toBe(first);
    glReverseEntry(first, 'back to draft', db);
    expect(glFindEntryBySource('invoice', 'inv-1', db)).toBeFalsy();
    post(12000);
    const ar = db.prepare(`SELECT SUM(jl.debit_cents - jl.credit_cents) AS b FROM journal_lines jl JOIN journal_entries je ON je.id=jl.entry_id WHERE jl.account_id=? AND je.status IN ('posted','reversed')`).get(id('1100')).b;
    expect(ar).toBe(12000);
    db.close();
  });
});
