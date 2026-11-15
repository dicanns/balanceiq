// The app's end of the AI relay: it asks the relay for the next question put to
// this company by an online assistant (ChatGPT and others), has the connector
// answer it here, and sends the answer back. Nothing is asked while it is off.
//
// No network code in here: the caller supplies `call` (a signed-in request to
// the relay) and `handle` (the connector), so the loop can be tested as is.

export const RELAY_ADDRESS = 'https://balanceiq.ca/ai/mcp';

export const RELAY_OFF = 'off';
export const RELAY_LISTENING = 'listening';
export const RELAY_SIGNED_OUT = 'signed_out';
export const RELAY_NOT_ON_PLAN = 'plan';
export const RELAY_UNREACHABLE = 'unreachable';

const FAILED = { status: 200, body: null };

/**
 * call(path, body)       -> { ok, status, data }   never throws for an HTTP error
 * handle(message, heads) -> { status, body }        the connector's answer
 * onState(state)         called when the state changes
 */
export function createRelayClient({ call, handle, version = '', onState = () => {}, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  let running = false;
  let generation = 0;
  let state = RELAY_OFF;
  const set = (s) => { if (s !== state) { state = s; try { onState(s); } catch (_) { /* a listener must not stop the loop */ } } };

  async function loop(mine) {
    let failures = 0;
    const live = () => running && generation === mine;
    while (live()) {
      let res;
      try { res = await call('next', { version }); } catch (_) { res = { ok: false, status: 0 }; }
      if (!live()) break;
      if (res && res.ok) {
        failures = 0;
        set(RELAY_LISTENING);
        const c = res.data && res.data.call;
        if (c && typeof c.id === 'string') {
          let out = null;
          try { out = await handle(c.message, c.headers || {}); } catch (_) { out = null; }
          const reply = out && typeof out === 'object' ? out : FAILED;
          try { await call('answer', { id: c.id, status: reply.status, body: reply.body == null ? null : reply.body }); } catch (_) { /* the assistant is told it got no answer */ }
        }
        continue;
      }
      failures += 1;
      set(res && res.status === 401 ? RELAY_SIGNED_OUT : res && res.status === 403 ? RELAY_NOT_ON_PLAN : RELAY_UNREACHABLE);
      // Back off: 5 s, 10 s, 20 s, 40 s, then once a minute.
      await sleep(Math.min(60000, 5000 * 2 ** Math.min(failures - 1, 4)));
    }
    if (generation === mine) set(RELAY_OFF);
  }

  return {
    start() { if (running) return; running = true; generation += 1; loop(generation); },
    stop() { running = false; generation += 1; set(RELAY_OFF); },
    state: () => state,
  };
}
