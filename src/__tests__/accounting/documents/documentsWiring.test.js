/**
 * DOC-040  the two savers write through the document store, not storage.set
 * DOC-041  storage:set routes document keys to the store
 * DOC-042  invoices:commit runs the ledger step before the upsert, inside withTransaction
 * DOC-043  FactureEditor's save, email send and void use invoices.commit
 * DOC-044  the migration exists in both chains and the new IPC is exposed
 * DOC-045  every user-facing string is in both languages
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../../../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const app = read('src/App.jsx');
const main = read('main.js');
const preload = read('preload.js');
const db = read('src/db/database.js');
const tr = read('src/i18n/translations.js');

// The text of a brace-delimited block starting at the first match of `startRe`.
function block(src, startRe) {
  const m = startRe.exec(src);
  if (!m) throw new Error('not found: ' + startRe);
  let i = src.indexOf('{', m.index + m[0].length - 1);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(m.index, j + 1); }
  }
  throw new Error('unbalanced: ' + startRe);
}

describe('DOC-040 savers', () => {
  const factures = block(app, /const saveFacFactures=useCallback\(\(listOrFn,opts\)=>\{/);
  const notes = block(app, /const saveFacCreditNotes=useCallback\(listOrFn=>\{/);

  it('do not call storage.set', () => {
    expect(factures).not.toMatch(/storage\.set/);
    expect(notes).not.toMatch(/storage\.set/);
  });

  it('send what changed through persistDocumentList, which uses documents.saveChanges and keeps the cloud push', () => {
    expect(factures).toMatch(/persistDocumentList\("dicann-fac-factures",DOC_KIND_FACTURE,prevList,list\)/);
    expect(notes).toMatch(/persistDocumentList\("dicann-fac-creditnotes",DOC_KIND_CREDITNOTE,prevList,list\)/);
    const persist = block(app, /function persistDocumentList\(key,kind,prevList,list\)\{/);
    expect(persist).toMatch(/window\.api\.documents\.saveChanges\(kind,/);
    expect(persist).toMatch(/diffDocuments\(prevList,list\)/);
    expect(persist).toMatch(/saveFailed\(key\)/);
    expect(persist).toMatch(/schedulePush\(key,v\)/);
  });

  it('alreadySaved skips the write but still schedules the cloud push', () => {
    expect(factures).toMatch(/opts\?\.alreadySaved\)schedulePush\("dicann-fac-factures"/);
  });

  it('startup loads the lists from the document store with a kv fallback', () => {
    const load = block(app, /async function loadDocumentList\(kind,key\)\{/);
    expect(load).toMatch(/window\.api\.documents\.list\(kind\)/);
    expect(load).toMatch(/window\.api\.storage\.get\(key\)/);
    expect(app).not.toMatch(/storage\.get\("dicann-fac-factures"\)/);
    expect(app).not.toMatch(/storage\.get\("dicann-fac-creditnotes"\)/);
  });
});

describe('DOC-041 storage:set', () => {
  const handler = block(main, /ipcMain\.handle\('storage:set',/);
  it('routes the document keys to documentsReplaceAll', () => {
    expect(handler).toMatch(/DOCUMENT_KINDS/);
    expect(handler).toMatch(/documentsReplaceAll\(kind,/);
    expect(handler.indexOf('documentsReplaceAll')).toBeLessThan(handler.indexOf('secretSet'));
  });
  it('no other main-process code writes the two keys', () => {
    expect(main).not.toMatch(/storageSet\(\s*['"]dicann-fac-(factures|creditnotes)/);
    expect(main).not.toMatch(/secretSet\(\s*['"]dicann-fac-(factures|creditnotes)/);
  });
});

describe('DOC-042 invoices:commit', () => {
  const at = main.indexOf("ledgerHandle('invoices:commit'");
  const handler = main.slice(at, main.indexOf("ledgerHandle('ledger:creditnote:post'", at));
  it('exists', () => expect(at).toBeGreaterThan(-1));
  it('is a single transaction with the ledger step before the upsert', () => {
    expect(handler).toMatch(/withTransaction\(/);
    const tx = handler.indexOf('withTransaction(');
    const unpost = handler.indexOf('unpostInvoiceFromLedger(');
    const post = handler.indexOf('postInvoiceToLedger(');
    const upsert = handler.indexOf("documentsSaveChanges('facture'");
    expect(tx).toBeGreaterThan(-1);
    expect(unpost).toBeGreaterThan(tx);
    expect(post).toBeGreaterThan(tx);
    expect(upsert).toBeGreaterThan(unpost);
    expect(upsert).toBeGreaterThan(post);
  });
  it('sets glEntryId from the posted entry and clears it after an unpost', () => {
    expect(handler).toMatch(/glEntryId: r\.entryId/);
    expect(handler).toMatch(/glEntryId: null/);
  });
  it('answers a refusal as ok:false and returns the document on success', () => {
    expect(handler).toMatch(/ok: false/);
    expect(handler).toMatch(/return \{ ok: true, doc: saved, entryId, alreadyPosted \}/);
  });
  it('the post and unpost handlers share the same plain functions', () => {
    expect(main).toMatch(/ledgerHandle\('ledger:invoice:post', async \(_e, args\) => postInvoiceToLedger\(args\)\)/);
    expect(main).toMatch(/unpostInvoiceFromLedger\(args \|\| \{\}\)/);
  });
});

describe('DOC-043 FactureEditor', () => {
  const editor = app.slice(app.indexOf('const commitInvoice=async'), app.indexOf('const doReissue='));
  it('has a commit helper that alerts with the right message and saves without writing again', () => {
    const helper = block(app, /const commitInvoice=async\(doc,ledger,nextList,extra=\{\}\)=>\{/);
    expect(helper).toMatch(/window\.api\.invoices\.commit\(/);
    expect(helper).toMatch(/T\.facUnpostFailed:T\.facCommitFailed/);
    expect(helper).toMatch(/alreadySaved:true/);
  });
  it('doSave and doDelete commit instead of saving the list and then calling the ledger', () => {
    const helperAt = app.indexOf('const commitInvoice=async');
    const saveAt = app.indexOf("const doSave=async()=>{\n if(canUse('creditLimits')", helperAt);
    const deleteAt = app.indexOf('const doDelete=async()=>{\n if(!savedId)return;', saveAt);
    expect(saveAt).toBeGreaterThan(-1);
    expect(deleteAt).toBeGreaterThan(saveAt);
    const doSave = app.slice(saveAt, deleteAt);
    const doDelete = app.slice(deleteAt, app.indexOf('const doReissue=', deleteAt));
    expect(doSave).toMatch(/commitInvoice\(doc,isFinalize\?'post':glCleared\?'unpost':'none'/);
    expect(doSave).not.toMatch(/ledger\.invoicePost|ledger\?\.invoiceUnpost|saveFactures\(factures/);
    expect(doDelete).toMatch(/commitInvoice\(voidedDoc,releasedWasLive\?'unpost':'none'/);
    expect(doDelete).not.toMatch(/invoiceUnpost|saveFactures\(/);
  });
  it('the email send commits the draft as sent and posted in one step', () => {
    const at = app.indexOf('apiConfig={apiConfig} onSuccess={async(to,meta)=>{');
    expect(at).toBeGreaterThan(-1);
    const email = app.slice(at, app.indexOf('onClose={()=>setEmailModal(null)}', at));
    expect(email).toMatch(/commitInvoice\(doc,isProforma\?'none':'post'/);
    expect(email).not.toMatch(/ledger\.invoicePost/);
  });
  it('no path in the editor still posts after saving', () => {
    expect(editor).not.toMatch(/ledger\.invoicePost\(/);
  });
});

describe('DOC-044 plumbing', () => {
  it('the migration is in the app chain and in the test chain', () => {
    expect(db).toMatch(/version: 51,[^{}]*?restoreSafe: true,\s*description: 'Documents table/);
    expect(read('src/db/migrations.js')).toMatch(/version: 51,[^{}]*?restoreSafe: true,\s*description: 'Documents table/);
  });
  it('preload exposes documents, invoices and books', () => {
    expect(preload).toMatch(/documents: \{[^}]*documents:list[^}]*documents:saveChanges/s);
    expect(preload).toMatch(/invoices:commit/);
    expect(preload).toMatch(/books:check/);
  });
  it('main registers the document and books handlers', () => {
    for (const ch of ['documents:list', 'documents:saveChanges', 'books:check']) expect(main).toContain(`'${ch}'`);
  });
  it('the books check runs once after startup, after the frozen totals backfill', () => {
    expect(app).toMatch(/await freezeSentInvoices\(\)[^\n]*\n\s*try\{runBooksCheck\(\)/);
    expect(app).toMatch(/booksCheckResult&&<BooksCheckBanner/);
  });
});

describe('DOC-045 strings in both languages', () => {
  const keys = ['facCommitFailed', 'booksCheckBanner', 'booksCheckDetails', 'booksCheckHide', 'booksCheckDismiss',
    'booksFind_invoice_not_posted', 'booksFind_invoice_total_differs', 'booksFind_draft_or_void_posted',
    'booksFind_payment_not_posted', 'booksFind_payment_amount_differs', 'booksFind_credit_note_not_posted'];
  it.each(keys)('%s is defined twice', (k) => {
    const n = tr.split('\n').filter(l => l.startsWith(`  ${k}:`)).length;
    expect(n).toBe(2);
  });
});
