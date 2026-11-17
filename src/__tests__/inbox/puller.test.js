import { describe, it, expect } from 'vitest';
import { createInboxPuller } from '../../inbox/puller.mjs';

const ok = (data) => ({ ok: true, status: 200, data });
const item = (n) => ({ id: `id-${n}`, subject: `s${n}` });

function fakeCloud(items) {
  const queue = [...items];
  const log = [];
  const call = async (path, body) => {
    log.push([path, body && body.id]);
    if (path === 'pull') return ok(queue.length ? { item: queue[0], remaining: queue.length - 1 } : { item: null, remaining: 0 });
    if (path === 'done') { queue.shift(); return ok({ ok: true }); }
    throw new Error('unexpected ' + path);
  };
  return { call, log, queue };
}

describe('createInboxPuller', () => {
  it('empty queue: nothing pulled', async () => {
    const c = fakeCloud([]);
    const stored = [];
    const r = await createInboxPuller({ call: c.call, store: async (i) => { stored.push(i); return { ok: true }; } }).run();
    expect(r).toEqual({ pulled: 0, error: null });
    expect(stored).toEqual([]);
  });

  it('three items then empty', async () => {
    const c = fakeCloud([item(1), item(2), item(3)]);
    const stored = [];
    const r = await createInboxPuller({ call: c.call, store: async (i) => { stored.push(i.id); return { ok: true }; } }).run();
    expect(r).toEqual({ pulled: 3, error: null });
    expect(stored).toEqual(['id-1', 'id-2', 'id-3']);
    expect(c.queue).toEqual([]);
  });

  it('store fails on the second: stops, first acknowledged, second not', async () => {
    const c = fakeCloud([item(1), item(2), item(3)]);
    let n = 0;
    const r = await createInboxPuller({ call: c.call, store: async () => { n += 1; return { ok: n !== 2 }; } }).run();
    expect(r).toEqual({ pulled: 1, error: 'store_failed' });
    const done = c.log.filter(([p]) => p === 'done').map(([, id]) => id);
    expect(done).toEqual(['id-1']);
  });

  it('401 is signed_out', async () => {
    const r = await createInboxPuller({ call: async () => ({ ok: false, status: 401, data: null }), store: async () => ({ ok: true }) }).run();
    expect(r).toEqual({ pulled: 0, error: 'signed_out' });
  });

  it('403 plan is plan, other 403 is unreachable', async () => {
    const mk = (data) => createInboxPuller({ call: async () => ({ ok: false, status: 403, data }), store: async () => ({ ok: true }) }).run();
    expect((await mk({ error: 'plan' })).error).toBe('plan');
    expect((await mk({ error: 'other' })).error).toBe('unreachable');
  });

  it('status 0, 5xx and a thrown call are unreachable', async () => {
    const store = async () => ({ ok: true });
    expect((await createInboxPuller({ call: async () => ({ ok: false, status: 0, data: null }), store }).run()).error).toBe('unreachable');
    expect((await createInboxPuller({ call: async () => ({ ok: false, status: 503, data: null }), store }).run()).error).toBe('unreachable');
    expect((await createInboxPuller({ call: async () => { throw new Error('net'); }, store }).run()).error).toBe('unreachable');
  });

  it('a failing done is not an error', async () => {
    const call = async (path) => {
      if (path === 'done') throw new Error('net');
      return ok(call.sent ? { item: null, remaining: 0 } : (call.sent = true, { item: item(1), remaining: 0 }));
    };
    const r = await createInboxPuller({ call, store: async () => ({ ok: true }) }).run();
    expect(r).toEqual({ pulled: 1, error: null });
  });

  it('maxPerRun is honoured', async () => {
    const c = fakeCloud([item(1), item(2), item(3), item(4)]);
    const r = await createInboxPuller({ call: c.call, store: async () => ({ ok: true }), maxPerRun: 2 }).run();
    expect(r).toEqual({ pulled: 2, error: null });
    expect(c.queue.length).toBe(2);
  });

  it('two overlapping runs share one run', async () => {
    const c = fakeCloud([item(1)]);
    const p = createInboxPuller({ call: c.call, store: async () => ({ ok: true }) });
    const a = p.run();
    const b = p.run();
    expect(a).toBe(b);
    expect(await a).toEqual({ pulled: 1, error: null });
    expect(c.log.filter(([x]) => x === 'pull').length).toBe(2);
    // after it ends a new run starts fresh
    expect(await p.run()).toEqual({ pulled: 0, error: null });
  });
});
