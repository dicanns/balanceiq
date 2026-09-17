// Boots a packed BalanceIQ.app once and reads its window, so a packaging or
// native-module problem shows up here rather than on a customer's Mac.
//   node scripts/smoke-packed-app.mjs release/mac-arm64/BalanceIQ.app/Contents/MacOS/BalanceIQ
import { _electron as electron } from '@playwright/test';

const exe = process.argv[2];
if (!exe) { console.error('usage: node scripts/smoke-packed-app.mjs <path to BalanceIQ binary>'); process.exit(2); }
const app = await electron.launch({ executablePath: exe, env: { ...process.env, NODE_ENV: 'test' } });
try {
  const win = await app.firstWindow();
  await win.waitForURL(u => !/^about:blank/.test(String(u)), { timeout: 30000 }).catch(() => {});
  await win.waitForLoadState('domcontentloaded');
  const title = await win.title();
  const text = (await win.evaluate(() => document.body.innerText)).slice(0, 80).replace(/\n/g, ' | ');
  const version = await app.evaluate(({ app: a }) => a.getVersion());
  if (!title.includes('BalanceIQ') || !text.trim()) throw new Error(`unexpected window: title="${title}" body="${text}"`);
  console.log(`packed boot ok | version ${version} | title "${title}" | body "${text}"`);
} finally {
  await app.close();
}
