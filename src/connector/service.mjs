// The connector as the app runs it: settings on disk, the local server, and
// what the Settings page shows. One BalanceIQ process holds one company's
// books, so the service answers for that company only.
//
// Everything here is reached from the Settings page alone. No tool can turn
// the connector on, change its level or issue a key.

import fs from 'node:fs';
import path from 'node:path';
import { normalizeConfig, companyAccess, withCompany, issueKey, companyForKey, levelAllows, LEVEL_READ, LEVEL_ASK } from './access.mjs';
import { handleMessage } from './protocol.mjs';
import { createConnectorServer, listenLocal, CONNECTOR_PATH } from './httpServer.mjs';

export const CONFIG_FILE = 'ai-connector.json';
export const SERVER_NAME = 'balanceiq';

const instructionsFor = (companyName) => [
  `BalanceIQ: the accounting books of ${companyName || 'one company'} (Quebec, Canada).`,
  'Amounts are Canadian dollars. Dates are YYYY-MM-DD. GST is 5 % and QST is 9.975 %.',
  'Call company_overview first. For any figure, call a tool: never estimate or reuse a number from memory.',
  'This connection is read-only: nothing you call changes the books.',
].join(' ');

const localDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * dir       folder that holds the settings file (the app's data folder)
 * company   { id, name } of the books this process has open
 * version   the app version
 * tools     the tool list (tools/index.mjs)
 * makeCtx   () => { db, data, kv }  : access to the open books, built per call
 * getLang   () => 'en' | 'fr'
 * port      for tests: listen here instead of the configured port (0 = any free port)
 * allowed   whether the plan includes the connector when the app starts; the
 *           screen reports the plan later through setAllowed
 */
export function createConnectorService({ dir, company, version, tools, makeCtx, getLang = () => 'fr', port, now = () => new Date(), allowed: allowedAtStart = true }) {
  const file = path.join(dir, CONFIG_FILE);
  let server = null;
  let error = null;
  let listeningPort = null;
  let allowed = !!allowedAtStart;
  const activity = { callCount: 0, lastCallAt: null, lastTool: null };

  const read = () => {
    try { return normalizeConfig(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch (_) { return normalizeConfig(null); }
  };
  // Other companies share the file: read it again before every change and
  // touch only this company's entry.
  const write = (change) => {
    const next = change(read());
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, file);
    return next;
  };
  const mine = () => companyAccess(read(), company.id);
  const wantedPort = () => (port !== undefined ? port : read().port);

  const authorize = (key) => {
    const id = companyForKey(read(), key);
    if (!id) return { ok: false };
    if (id !== company.id) return { ok: false, status: 409, message: 'This access key is for another company. Open that company in BalanceIQ, then try again.' };
    return { ok: true, level: mine().level };
  };

  const handle = (message, who, headers) => {
    const lang = getLang() === 'en' ? 'en' : 'fr';
    const call = message && message.method === 'tools/call' ? tools.find((t) => t.name === message.params?.name) : null;
    if (call) {
      activity.callCount += 1;
      activity.lastCallAt = now().toISOString();
      activity.lastTool = (call.title && (call.title[lang] || call.title.en)) || call.name;
    }
    return handleMessage(message, {
      server: { name: SERVER_NAME, version, instructions: instructionsFor(company.name), lang },
      tools,
      allow: (tool) => (tool.readOnly === false && !levelAllows(who.level, LEVEL_ASK) ? 'This company allows reading only. The owner can change that in BalanceIQ, under Settings.' : null),
      ctx: { ...makeCtx(), company: { id: company.id, name: company.name }, today: localDate(now()), lang, level: who.level },
      headers,
    });
  };

  async function start() {
    if (server || !allowed || !mine().enabled) return status();
    const s = createConnectorServer({ authorize, handle });
    try {
      await listenLocal(s, wantedPort());
      server = s;
      listeningPort = s.address().port;
      error = null;
    } catch (e) {
      error = e && e.code === 'EADDRINUSE' ? 'port_in_use' : 'could_not_start';
    }
    return status();
  }

  function stop() {
    const s = server;
    server = null;
    listeningPort = null;
    error = null;
    return new Promise((resolve) => {
      if (!s) return resolve(status());
      s.close(() => resolve(status()));
      if (typeof s.closeAllConnections === 'function') s.closeAllConnections();
    });
  }

  function status() {
    const access = mine();
    return {
      companyName: company.name || '',
      enabled: access.enabled,
      allowed,
      running: !!server,
      error: access.enabled && allowed && !server ? error : null,
      level: access.level,
      url: `http://127.0.0.1:${listeningPort || wantedPort()}${CONNECTOR_PATH}`,
      keyCreatedAt: access.keyCreatedAt,
      relay: access.relay,
      toolCount: tools.filter((t) => t.readOnly !== false || access.level !== LEVEL_READ).length,
      ...activity,
    };
  }

  // A new key: the connector is on from here, and any earlier key stops working.
  async function newKey() {
    if (!allowed) return { ok: false, error: 'plan', status: status() };
    let key = null;
    write((cfg) => { const issued = issueKey(cfg, company.id, now()); key = issued.key; return issued.config; });
    await start();
    return { ok: true, key, status: status() };
  }

  async function disable() {
    write((cfg) => withCompany(cfg, company.id, { enabled: false, keyHash: null, keyCreatedAt: null }));
    await stop();
    return { ok: true, status: status() };
  }

  // Online assistants (ChatGPT and others) reach this company through the relay.
  // The switch is the owner's; the questions arrive by the app's own signed-in
  // request, never through the local address, and are always read-only.
  async function setRelay(on) {
    if (on && !allowed) return { ok: false, error: 'plan', status: status() };
    write((cfg) => withCompany(cfg, company.id, { relay: on === true }));
    return { ok: true, status: status() };
  }

  function handleRelayed(message, headers) {
    if (!allowed || !mine().relay || !message || typeof message !== 'object' || Array.isArray(message)) return { status: 403, body: null };
    const heads = {};
    for (const [k, v] of Object.entries(headers && typeof headers === 'object' ? headers : {})) if (typeof v === 'string') heads[k.toLowerCase()] = v;
    return handle(message, { level: LEVEL_READ }, heads);
  }

  // The plan decides whether the connector may run. A key made while it was
  // allowed is kept, and works again when the plan includes it again.
  function setAllowed(value) {
    allowed = !!value;
    return allowed ? start() : stop();
  }

  return { start, stop, status, enable: newKey, newKey, disable, setAllowed, setRelay, handleRelayed };
}
