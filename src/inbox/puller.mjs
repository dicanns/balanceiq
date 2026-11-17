// Brings the waiting bill emails down from the cloud, one at a time. A message
// is erased online only after it is safely stored on this computer.
//
// No network or database code in here: the caller supplies `call` (a signed-in
// request to the inbox function) and `store` (puts the item in the local store),
// so the loop can be tested as is.

export const PULL_SIGNED_OUT = 'signed_out';
export const PULL_NOT_ON_PLAN = 'plan';
export const PULL_UNREACHABLE = 'unreachable';
export const PULL_STORE_FAILED = 'store_failed';

function errorOf(res) {
  if (!res || res.status === 0 || res.status >= 500) return PULL_UNREACHABLE;
  if (res.status === 401) return PULL_SIGNED_OUT;
  if (res.status === 403 && res.data && res.data.error === 'plan') return PULL_NOT_ON_PLAN;
  return PULL_UNREACHABLE;
}

/**
 * call(path, body)  -> { ok, status, data }   never throws for an HTTP error
 * store(item)       -> { ok }                  the local store
 * run()             -> { pulled, error }       error: null, signed_out, plan, unreachable, store_failed
 */
export function createInboxPuller({ call, store, maxPerRun = 20 }) {
  let current = null;

  async function loop() {
    let pulled = 0;
    while (pulled < maxPerRun) {
      let res;
      try { res = await call('pull', {}); } catch (_) { res = { ok: false, status: 0, data: null }; }
      if (!res || !res.ok) return { pulled, error: errorOf(res) };
      const item = res.data && res.data.item;
      if (!item || typeof item.id !== 'string') break;
      let stored = null;
      try { stored = await store(item); } catch (_) { stored = null; }
      // Leave the message online; the next run brings it again.
      if (!stored || stored.ok !== true) return { pulled, error: PULL_STORE_FAILED };
      pulled += 1;
      // A failed erase is not the owner's problem: the next pull brings the same
      // id again and the local store ignores a second copy.
      try { await call('done', { id: item.id }); } catch (_) { /* see above */ }
    }
    return { pulled, error: null };
  }

  return {
    run() {
      if (current) return current;
      current = loop().finally(() => { current = null; });
      return current;
    },
  };
}
