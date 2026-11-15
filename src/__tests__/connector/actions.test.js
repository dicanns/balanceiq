/**
 * CONN-100  the pile of prepared entries (proposals.mjs)
 * CONN-101  propose_invoice, propose_bill, proposal_status
 * CONN-102  the access level: who is offered the propose_ tools
 * CONN-103  the screens: a prepared entry opens the normal form and is saved by the owner
 *
 * An assistant never records anything: these tests hold that line.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createProposalStore, MAX_WAITING, PROPOSAL_TTL_MS } from '../../connector/proposals.mjs';
import { actionTools } from '../../connector/tools/actions.mjs';
import { ALL_TOOLS } from '../../connector/tools/index.mjs';
import { checkArguments } from '../../connector/protocol.mjs';
import { createConnectorService } from '../../connector/service.mjs';
import { lineFromProduct } from '../../utils/invoiceLines.mjs';
import { expectPlainAnswer } from './_conformance.js';

const ROOT = path.resolve(__dirname, '../../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('CONN-100 prepared entries', () => {
  it('waits, is opened, then saved with its number; the assistant sees only the status', () => {
    let changes = 0;
    const store = createProposalStore({ onChange: () => { changes += 1; } });
    const made = store.add({ kind: 'invoice', tool: 'propose_invoice', summary: { en: 'Invoice', fr: 'Facture' }, payload: { secret: 'payload' } });
    expect(made.status).toBe('waiting');
    expect(store.open()).toHaveLength(1);
    expect(store.open()[0]).toMatchObject({ id: made.id, kind: 'invoice', status: 'waiting', payload: { secret: 'payload' } });
    expect(JSON.stringify(store.get(made.id))).not.toContain('payload');
    expect(store.mark(made.id, 'opened')).toMatchObject({ status: 'opened' });
    expect(store.open()[0].status).toBe('opened');
    expect(store.mark(made.id, 'saved', 'F-0143')).toMatchObject({ status: 'saved', reference: 'F-0143', kind: 'invoice', tool: 'propose_invoice' });
    expect(store.get(made.id)).toMatchObject({ status: 'saved', reference: 'F-0143' });
    expect(store.open()).toEqual([]);
    // Settled is settled: it cannot be saved or dismissed again.
    expect(store.mark(made.id, 'dismissed')).toBeNull();
    expect(changes).toBe(3);
  });

  it('refuses an unknown kind or state, holds a bounded pile, and forgets after a day', () => {
    let t = new Date('2026-06-01T10:00:00Z');
    const store = createProposalStore({ now: () => t });
    expect(() => store.add({ kind: 'payment', summary: {}, payload: {} })).toThrow();
    const first = store.add({ kind: 'bill', summary: {}, payload: {} });
    expect(store.mark(first.id, 'recorded')).toBeNull();
    expect(store.mark('nope', 'saved')).toBeNull();
    for (let i = 1; i < MAX_WAITING; i++) store.add({ kind: 'bill', summary: {}, payload: {} });
    expect(() => store.add({ kind: 'bill', summary: {}, payload: {} })).toThrow(/too many/);
    t = new Date(t.getTime() + PROPOSAL_TTL_MS + 1000);
    expect(store.open()).toEqual([]);
    expect(store.get(first.id).status).toBe('expired');
    expect(store.mark(first.id, 'saved', 'x')).toBeNull();
  });
});

const clients = [{ id: 'c1', code: 'LUMEN', entreprise: 'Café Lumen' }, { id: 'c2', code: 'BETA', entreprise: 'Beta Market', taxExempt: true }];
const products = [
  { id: 'p1', code: 'MAYO-1', description: 'Mayo case', prixUnitaire: 57.5, tps: true, tvq: true, secret_internal: 'x' },
  { id: 'p2', code: 'MAYO-2', description: 'Mayo pail', prixUnitaire: '80', tps: false, tvq: false },
];
const bills = [
  { supplier_name: 'Nordet', invoice_number: 'N-1', bill_date: '2026-05-01', coa_account_id: 7, amount: 100 },
  { supplier_name: 'Nordet', invoice_number: 'N-2', bill_date: '2026-06-01', coa_account_id: 8, amount: 120 },
];
const accounts = [{ id: 7, account_number: '5000', is_archived: 0 }, { id: 8, account_number: '5100', is_archived: 0 }, { id: 9, account_number: '5999', is_archived: 1 }];
function makeCtx(over = {}) {
  const store = createProposalStore();
  const kvData = { 'dicann-fac-clients': clients, 'dicann-fac-produits': products };
  return {
    store,
    ctx: {
      company: { id: 'co1', name: 'Demo Inc.' }, today: '2026-06-15', lang: 'en', level: 'ask', db: {},
      data: { documentsList: () => [], supplierBillList: () => bills, coaList: () => accounts },
      kv: (k) => kvData[k] ?? null, propose: (p) => store.add(p), proposal: (id) => store.get(id), ...over,
    },
  };
}
const tool = (name) => actionTools.find((t) => t.name === name);
const run = (name, args, ctx) => { expect(checkArguments(tool(name).inputSchema, args)).toBeNull(); const r = tool(name).run(args, ctx); expectPlainAnswer(r); return r; };

describe('CONN-101 preparing an entry', () => {
  it('propose_invoice fills in the invoice form and records nothing', () => {
    const { ctx, store } = makeCtx();
    const r = run('propose_invoice', { customer: 'lumen', lines: [{ product: 'MAYO-1', quantity: 12 }, { description: 'Delivery', quantity: 1, unit_price: 20 }], customer_reference: 'PO 77' }, ctx);
    // 12 x 57.50 + 20 = 710.00; GST 35.50; QST 70.82
    expect(r).toMatchObject({ status: 'waiting_for_owner', customer: 'Café Lumen', date: '2026-06-15', subtotal: 710, gst: 35.5, qst: 70.82, total: 816.32 });
    expect(r.lines).toEqual([{ description: 'Mayo case', quantity: 12, unit_price: 57.5, amount: 690 }, { description: 'Delivery', quantity: 1, unit_price: 20, amount: 20 }]);
    const waiting = store.open();
    expect(waiting).toHaveLength(1);
    expect(waiting[0]).toMatchObject({ id: r.proposal_id, kind: 'invoice', summary: { en: 'Invoice for Café Lumen: 2 lines, 816.32 $ with tax', fr: 'Facture pour Café Lumen : 2 lignes, 816,32 $ taxes incluses' } });
    const doc = waiting[0].payload;
    // An unsaved draft: no id, no number, the editor works out the due date itself.
    expect(doc).toMatchObject({ clientId: 'c1', statut: 'Brouillon', documentType: 'facture', date: '2026-06-15', dateEcheance: '', referenceClient: 'PO 77', notes: null, paiements: [] });
    expect(doc.id).toBeUndefined();
    expect(doc.numero).toBeUndefined();
    expect(doc.lignes[0]).toMatchObject({ ...lineFromProduct(products[0]), quantite: 12, remise: 0 });
    expect(doc.lignes[1]).toMatchObject({ produitId: '', description: 'Delivery', quantite: 1, prixUnitaire: 20, tps: true, tvq: true });
    expect(new Set(doc.lignes.map((l) => l.id)).size).toBe(2);
    expect(JSON.stringify(waiting)).not.toContain('secret_internal');
  });

  it('propose_invoice honours the product taxes, a price override and a tax-exempt customer', () => {
    const { ctx } = makeCtx();
    expect(run('propose_invoice', { customer: 'LUMEN', lines: [{ product: 'pail', quantity: 2, unit_price: 75 }] }, ctx)).toMatchObject({ subtotal: 150, gst: 0, qst: 0, total: 150 });
    expect(run('propose_invoice', { customer: 'beta', lines: [{ product: 'MAYO-1', quantity: 1 }] }, ctx)).toMatchObject({ subtotal: 57.5, gst: 0, qst: 0, total: 57.5 });
  });

  it('propose_invoice says plainly what is wrong and leaves nothing behind', () => {
    const { ctx, store } = makeCtx();
    const bad = (args, re) => expect(() => run('propose_invoice', args, ctx)).toThrow(re);
    bad({ customer: 'nobody', lines: [{ product: 'MAYO-1', quantity: 1 }] }, /No customer matches/);
    bad({ customer: 'lumen', lines: [] }, /between 1 and 50 lines/);
    bad({ customer: 'lumen', lines: [{ product: 'mayo', quantity: 1 }] }, /Several products match/);
    bad({ customer: 'lumen', lines: [{ product: 'ketchup', quantity: 1 }] }, /No product matches/);
    bad({ customer: 'lumen', lines: [{ product: 'MAYO-1', quantity: 0 }] }, /quantity must be a number above zero/);
    bad({ customer: 'lumen', lines: [{ description: 'Thing', quantity: 1 }] }, /a description with a unit_price/);
    bad({ customer: 'lumen', lines: ['x'] }, /must be an object/);
    expect(checkArguments(tool('propose_invoice').inputSchema, { customer: 'lumen' })).toBe('Missing argument: lines.');
    expect(checkArguments(tool('propose_invoice').inputSchema, { customer: 'lumen', lines: 'two' })).toContain('a list');
    expect(store.open()).toEqual([]);
  });

  it('propose_bill fills in the bill form with the account this supplier usually goes to', () => {
    const { ctx, store } = makeCtx();
    const r = run('propose_bill', { supplier: 'Nordet', amount: 229.95, bill_number: 'N-3', bill_date: '2026-06-10', due_date: '2026-07-10', gst_paid: 10, qst_paid: 19.95, note: 'June delivery' }, ctx);
    expect(r).toMatchObject({ status: 'waiting_for_owner', supplier: 'Nordet', bill_number: 'N-3', amount: 229.95, expense_account: '5100', expense_account_to_choose: false });
    expect(store.open()[0]).toMatchObject({
      kind: 'bill', summary: { en: 'Bill from Nordet: 229.95 $', fr: 'Facture de Nordet : 229,95 $' },
      payload: { supplier_name: 'Nordet', invoice_number: 'N-3', bill_date: '2026-06-10', due_date: '2026-07-10', coa_account_id: '8', amount: '229.95', tps_paid: '10.00', tvq_paid: '19.95', note: 'June delivery' },
    });
    // A new supplier has no usual account: the owner chooses it in the form.
    expect(run('propose_bill', { supplier: 'New Co', amount: 50 }, ctx)).toMatchObject({ expense_account: null, expense_account_to_choose: true, bill_date: '2026-06-15' });
    expect(run('propose_bill', { supplier: 'New Co', amount: 50, expense_account: '5000' }, ctx).expense_account).toBe('5000');
  });

  it('propose_bill refuses a bill already entered, a bad amount and an unknown or archived account', () => {
    const { ctx, store } = makeCtx();
    const bad = (args, re) => expect(() => run('propose_bill', args, ctx)).toThrow(re);
    bad({ supplier: 'nordet', amount: 120, bill_number: 'n-2' }, /already entered/);
    bad({ supplier: 'Nordet', amount: 0 }, /above zero/);
    bad({ supplier: 'Nordet', amount: 100, gst_paid: 100 }, /gst_paid/);
    bad({ supplier: 'Nordet', amount: 100, expense_account: '1234' }, /No ledger account/);
    bad({ supplier: 'Nordet', amount: 100, expense_account: '5999' }, /No ledger account/);
    expect(store.open()).toEqual([]);
  });

  it('proposal_status tells the assistant what the owner decided, never before', () => {
    const { ctx, store } = makeCtx();
    const r = run('propose_bill', { supplier: 'New Co', amount: 50 }, ctx);
    expect(run('proposal_status', { proposal_id: r.proposal_id }, ctx)).toEqual({ proposal_id: r.proposal_id, kind: 'bill', status: 'waiting_for_owner', reference: null, recorded: false });
    store.mark(r.proposal_id, 'opened');
    expect(run('proposal_status', { proposal_id: r.proposal_id }, ctx)).toMatchObject({ status: 'owner_is_reviewing', recorded: false });
    store.mark(r.proposal_id, 'saved', 'B-9');
    expect(run('proposal_status', { proposal_id: r.proposal_id }, ctx)).toMatchObject({ status: 'saved', reference: 'B-9', recorded: true });
    const other = run('propose_bill', { supplier: 'New Co', amount: 60 }, ctx);
    store.mark(other.proposal_id, 'dismissed');
    expect(run('proposal_status', { proposal_id: other.proposal_id }, ctx)).toMatchObject({ status: 'refused', recorded: false });
    expect(() => run('proposal_status', { proposal_id: 'unknown' }, ctx)).toThrow(/nothing was recorded/);
  });

  it('cannot prepare anything on a connection that offers no pile, and says when the pile is full', () => {
    const { ctx } = makeCtx({ propose: undefined });
    expect(() => run('propose_bill', { supplier: 'New Co', amount: 50 }, ctx)).toThrow(/cannot prepare entries/);
    const full = makeCtx();
    for (let i = 0; i < MAX_WAITING; i++) run('propose_bill', { supplier: `Co ${i}`, amount: 10 }, full.ctx);
    expect(() => run('propose_bill', { supplier: 'One more', amount: 10 }, full.ctx)).toThrow(/Too many entries are already waiting/);
  });
});

describe('CONN-102 the access level', () => {
  const dirs = [];
  const services = [];
  afterEach(async () => { for (const s of services.splice(0)) await s.stop(); for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });
  const make = () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'biq-act-'));
    dirs.push(d);
    const { ctx, store } = makeCtx();
    const s = createConnectorService({ dir: d, company: { id: 'co1', name: 'Demo Inc.' }, version: '1', tools: ALL_TOOLS, makeCtx: () => ({ data: ctx.data, kv: ctx.kv, propose: ctx.propose, proposal: ctx.proposal }), port: 0, getLang: () => 'en' });
    services.push(s);
    return { s, store };
  };
  const post = (url, key, method, params = {}) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: { ...params, _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' } } }) }).then((r) => r.json());
  const bill = { name: 'propose_bill', arguments: { supplier: 'New Co', amount: 50 } };

  it('reading is the default: the propose_ tools are neither listed nor usable', async () => {
    const { s, store } = make();
    const on = await s.enable();
    expect(on.status.level).toBe('read');
    const listed = (await post(on.status.url, on.key, 'tools/list')).result.tools.map((t) => t.name);
    expect(listed).toHaveLength(on.status.toolCount);
    expect(listed.filter((n) => n.startsWith('propos'))).toEqual([]);
    const refused = (await post(on.status.url, on.key, 'tools/call', bill)).result;
    expect(refused.isError).toBe(true);
    expect(refused.content[0].text).toContain('reading only');
    expect(store.open()).toEqual([]);
  });

  it('the owner can let the assistant prepare entries, and take that back', async () => {
    const { s, store } = make();
    const on = await s.enable();
    expect(await s.setLevel('act')).toMatchObject({ ok: false, error: 'level' });
    expect(await s.setLevel('ask')).toMatchObject({ ok: true, status: { level: 'ask', toolCount: ALL_TOOLS.length } });
    const listed = (await post(on.status.url, on.key, 'tools/list')).result.tools.map((t) => t.name);
    expect(listed).toEqual(expect.arrayContaining(['propose_invoice', 'propose_bill', 'proposal_status']));
    const made = (await post(on.status.url, on.key, 'tools/call', bill)).result;
    expect(made.isError).toBeFalsy();
    expect(made.structuredContent.status).toBe('waiting_for_owner');
    expect(store.open()).toHaveLength(1);
    // Online assistants come through the relay, which stays read-only whatever the level.
    await s.setRelay(true);
    const relayed = await s.handleRelayed({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { ...bill, _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' } } }, {});
    expect(relayed.body.result.isError).toBe(true);
    expect(store.open()).toHaveLength(1);
    expect(await s.setLevel('read')).toMatchObject({ ok: true, status: { level: 'read' } });
    expect((await post(on.status.url, on.key, 'tools/call', bill)).result.isError).toBe(true);
  });

  it('is refused off the plan', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'biq-act-'));
    dirs.push(d);
    const s = createConnectorService({ dir: d, company: { id: 'co1', name: 'Demo Inc.' }, version: '1', tools: ALL_TOOLS, makeCtx: () => ({}), port: 0, allowed: false });
    expect(await s.setLevel('ask')).toMatchObject({ ok: false, error: 'plan' });
    expect(await s.setLevel('read')).toMatchObject({ ok: true });
  });
});

describe('CONN-103 the screens', () => {
  const app = read('src/App.jsx');
  const billsTab = read('src/components/BillsTab.jsx');
  const main = read('main.js');
  it('the tools file calls nothing that saves', () => {
    const src = read('src/connector/tools/actions.mjs');
    expect(src).not.toMatch(/supplierBillCreate|supplierBills\.create|documentsSave|storageSet|invoicePost|glPostEntry|\.prepare\(/);
    expect(src.match(/ctx\.propose\(/g)).toHaveLength(1);
  });
  it('a prepared invoice opens as a new unsaved invoice and reports its first save', () => {
    expect(app).toContain("deepLink.action==='prefill-invoice'&&deepLink.proposal");
    expect(app).toContain("openDoc('facture',pr.payload.clientId,{...pr.payload,notes:pr.payload.notes??(invoiceTemplate?.defaultNotes||\"\"),aiProposalId:pr.id})");
    expect(app).toContain("if(savedId&&!facture?.id&&form.aiProposalId)window.api?.connector?.markProposal?.(form.aiProposalId,'saved',savedNumero||'');");
    // The editor and the assistant build a product line with the same function.
    expect(app).toContain('const applyProd=(lid,p)=>updL(lid,lineFromProduct(p,{forecastLink:invBridgeConfig.enabled}));');
  });
  it('a prepared bill opens the bill form and reports its save', () => {
    expect(billsTab).toContain("...(p.aiProposalId ? { aiProposalId: p.aiProposalId } : {})");
    expect(billsTab).toContain("if (!f.id && f.aiProposalId) window.api?.connector?.markProposal?.(f.aiProposalId, 'saved', payload.invoice_number || payload.supplier_name);");
    // The mark never travels to the saved bill itself.
    const payload = billsTab.slice(billsTab.indexOf('const payload = {'), billsTab.indexOf('month_key:'));
    expect(payload).not.toContain('aiProposalId');
  });
  it('the main process marks a saved entry and every connector switch in the audit log', () => {
    expect(main).toContain("auditInsert({ userName: 'AI assistant', module: 'ai_connector', action: 'entry_saved'");
    for (const action of ['turned_on', 'new_key', 'turned_off', 'relay_on', 'level']) expect(main, action).toContain(`'${action}'`);
  });
});
