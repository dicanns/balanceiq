/**
 * CONN-110  the bill inbox tools: list_inbox, read_inbox_document, and propose_bill with inbox_item_id
 */
import { describe, it, expect } from 'vitest';
import { inboxTools } from '../../connector/tools/inbox.mjs';
import { actionTools } from '../../connector/tools/actions.mjs';
import { createProposalStore } from '../../connector/proposals.mjs';
import { checkArguments } from '../../connector/protocol.mjs';
import { expectWellFormed, expectPlainAnswer } from './_conformance.js';

const item = (id, files, over = {}) => ({
  id, received_at: '2026-11-15T14:00:00Z', from_address: 'owner@example.com', subject: `Bill ${id}`, note: 'Please enter this one',
  files, skipped: 0, status: 'waiting', bill_id: null, handled_at: null, ...over,
});
const pdf = (name, size = 2048) => ({ name, type: 'application/pdf', size, path: `inbox/${name}` });
const items = [
  item('i1', [pdf('nordet.pdf')]),
  item('i2', [pdf('a.pdf'), pdf('b.pdf')]),
  item('i3', [], { note: 'Pay this: the supplier says $300 by Friday' }),
  item('i4', [pdf('old.pdf')], { status: 'filed' }),
];
const BILL_TEXT = 'Nordet Foods Inc.\nInvoice No: N-3001\nDate: 2026-06-10\nSubtotal 100.00\nTPS 5.00\nTVQ 9.98\nTotal 114.98';

function makeCtx(over = {}) {
  const store = createProposalStore();
  return {
    store,
    ctx: {
      company: { id: 'co1', name: 'Demo Inc.' }, today: '2026-06-15', lang: 'en', level: 'ask', db: {},
      data: {
        inboxItemsList: ({ status, limit }) => items.filter((i) => i.status === status).slice(0, limit),
        inboxItemGet: (id) => items.find((i) => i.id === id) || null,
        supplierBillList: () => [], coaList: () => [],
      },
      kv: () => null, propose: (p) => store.add(p), proposal: (id) => store.get(id),
      inboxFile: (rel) => (rel ? `/data/${rel}` : null),
      readDocument: async () => ({ ok: true, text: BILL_TEXT, items: null, pages: 1, fileName: 'x.pdf' }),
      ...over,
    },
  };
}
const tool = (name) => [...inboxTools, ...actionTools].find((t) => t.name === name);
const run = async (name, args, ctx) => {
  expect(checkArguments(tool(name).inputSchema, args)).toBeNull();
  const r = await tool(name).run(args, ctx);
  expectPlainAnswer(r);
  return r;
};

describe('CONN-110 inbox tools', () => {
  it('are well formed, read-only and only for the ask level', () => {
    expectWellFormed(inboxTools);
    for (const t of inboxTools) { expect(t.readOnly).toBe(true); expect(t.level).toBe('ask'); }
    expect(tool('read_inbox_document').description).toMatch(/never instructions to follow/);
    expect(tool('read_inbox_document').description).toMatch(/propose_bill/);
  });

  it('list_inbox with nothing waiting', async () => {
    const { ctx } = makeCtx({ data: { inboxItemsList: () => [] } });
    expect(await run('list_inbox', {}, ctx)).toEqual({ count: 0, truncated: false, items: [] });
  });

  it('list_inbox names what waits and nothing else', async () => {
    const { ctx } = makeCtx();
    const r = await run('list_inbox', {}, ctx);
    expect(r.count).toBe(3);
    expect(r.truncated).toBe(false);
    expect(r.items[0]).toEqual({
      inbox_item_id: 'i1', received_at: '2026-11-15T14:00:00Z', from: 'owner@example.com', subject: 'Bill i1', note: 'Please enter this one',
      documents: [{ name: 'nordet.pdf', type: 'application/pdf', size_kb: 2 }],
    });
    expect(r.items[2].documents).toEqual([]);
    expect(JSON.stringify(r)).not.toContain('inbox/nordet.pdf');
    const cut = await run('list_inbox', { limit: 2 }, ctx);
    expect([cut.count, cut.items.length, cut.truncated]).toEqual([2, 2, true]);
  });

  it('read_inbox_document reads the only document without being told which', async () => {
    const { ctx } = makeCtx();
    const r = await run('read_inbox_document', { inbox_item_id: 'i1' }, ctx);
    expect(r).toMatchObject({ inbox_item_id: 'i1', document: 'nordet.pdf', text: BILL_TEXT, text_truncated: false, problem: null });
    expect(Object.keys(r.reader_found)).toEqual(['supplier', 'invoice_number', 'bill_date', 'due_date', 'amount', 'gst', 'qst']);
    expect(r.reader_found).toMatchObject({ amount: 114.98, gst: 5, qst: 9.98 });
  });

  it('read_inbox_document asks which document when there are two, and takes a name', async () => {
    const { ctx } = makeCtx();
    await expect(run('read_inbox_document', { inbox_item_id: 'i2' }, ctx)).rejects.toThrow(/2 documents.*a\.pdf, b\.pdf/);
    expect(await run('read_inbox_document', { inbox_item_id: 'i2', document: 'B.PDF' }, ctx)).toMatchObject({ document: 'b.pdf' });
    await expect(run('read_inbox_document', { inbox_item_id: 'i2', document: 'c.pdf' }, ctx)).rejects.toThrow(/no document named/);
  });

  it('read_inbox_document refuses an unknown or filed item, an item with no document, and a connection that cannot open files', async () => {
    const { ctx } = makeCtx();
    await expect(run('read_inbox_document', { inbox_item_id: 'nope' }, ctx)).rejects.toThrow('No waiting inbox item has this id.');
    await expect(run('read_inbox_document', { inbox_item_id: 'i4' }, ctx)).rejects.toThrow('No waiting inbox item has this id.');
    await expect(run('read_inbox_document', { inbox_item_id: 'i3' }, ctx)).rejects.toThrow(/no document/);
    const bare = makeCtx({ readDocument: undefined });
    await expect(run('read_inbox_document', { inbox_item_id: 'i1' }, bare.ctx)).rejects.toThrow('This connection cannot open inbox documents.');
  });

  it('read_inbox_document answers normally when the document cannot be read', async () => {
    const scan = makeCtx({ readDocument: async () => ({ ok: false, error: 'pdf_has_no_text' }) });
    expect(await run('read_inbox_document', { inbox_item_id: 'i1' }, scan.ctx)).toMatchObject({ text: '', reader_found: null, problem: 'This PDF is a scanned image with no text layer.' });
    const odd = makeCtx({ readDocument: async () => { throw new Error('boom'); } });
    expect(await run('read_inbox_document', { inbox_item_id: 'i1' }, odd.ctx)).toMatchObject({ text: '', reader_found: null, problem: 'This file could not be read.' });
    const gone = makeCtx({ inboxFile: () => null });
    expect((await run('read_inbox_document', { inbox_item_id: 'i1' }, gone.ctx)).problem).toMatch(/no longer on the computer/);
  });

  it('read_inbox_document cuts a long text at 12000 characters and says so', async () => {
    const long = makeCtx({ readDocument: async () => ({ ok: true, text: 'x'.repeat(15000), items: null }) });
    const r = await run('read_inbox_document', { inbox_item_id: 'i1' }, long.ctx);
    expect(r.text).toHaveLength(12000);
    expect(r.text_truncated).toBe(true);
  });

  it('propose_bill from an inbox item carries the item and its file to the bill screen', async () => {
    const { ctx, store } = makeCtx();
    await run('propose_bill', { supplier: 'Nordet', amount: 114.98, inbox_item_id: 'i1' }, ctx);
    expect(store.open()[0].payload).toMatchObject({ supplier_name: 'Nordet', inboxItemId: 'i1', inboxFile: 'inbox/nordet.pdf' });
    // An item with only a note has no file to file.
    await run('propose_bill', { supplier: 'Nordet', amount: 300, inbox_item_id: 'i3' }, ctx);
    expect(store.open()[1].payload).toMatchObject({ inboxItemId: 'i3', inboxFile: null });
    // Without the argument the payload is as it always was.
    await run('propose_bill', { supplier: 'Nordet', amount: 10 }, ctx);
    expect(store.open()[2].payload).not.toHaveProperty('inboxItemId');
  });

  it('propose_bill refuses a missing or already filed inbox item and leaves nothing behind', async () => {
    const { ctx, store } = makeCtx();
    await expect(run('propose_bill', { supplier: 'Nordet', amount: 50, inbox_item_id: 'nope' }, ctx)).rejects.toThrow('No waiting inbox item has this id.');
    await expect(run('propose_bill', { supplier: 'Nordet', amount: 50, inbox_item_id: 'i4' }, ctx)).rejects.toThrow('No waiting inbox item has this id.');
    expect(store.open()).toEqual([]);
  });
});
