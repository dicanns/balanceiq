/**
 * BalanceIQ — Comprehensive Stress Test (Playwright E2E)
 *
 * Clicks through every tab, major section, and data-entry flow to catch
 * crashes that only appear in the built Electron environment.
 *
 * Run: npx playwright test --project=electron tests/e2e/stress.spec.js
 *
 * Notes:
 * - Tests run serially (state is shared across suites via SQLite)
 * - Test data written to SQLite persists — clearly labeled for easy cleanup
 * - Cloud sync / login intentionally skipped
 * - Pro-gated features: upgrade prompt is dismissed and test continues
 */

import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';

const APP_ROOT = path.resolve(process.cwd());
const JS_ERRORS = [];

// ── Launch helper ─────────────────────────────────────────────────────────────
async function launchApp() {
  const app = await electron.launch({
    args: [path.join(APP_ROOT, 'main.js')],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      ELECTRON_IS_DEV: '0',
    },
  });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');

  // Capture JS errors globally
  win.on('pageerror', (err) => {
    JS_ERRORS.push(`[pageerror] ${err.message}`);
  });
  win.on('console', (msg) => {
    if (msg.type() === 'error') JS_ERRORS.push(`[console.error] ${msg.text()}`);
  });

  return { app, win };
}

// ── Click a sidebar nav item by label text ────────────────────────────────────
async function clickTab(win, labelText) {
  // Sidebar NavItem buttons contain the label as a <span>
  const btn = await win.locator(`button:has-text("${labelText}")`).first();
  if (await btn.count() === 0) return false;
  await btn.click();
  await win.waitForTimeout(600);
  return true;
}

// ── Dismiss an upgrade prompt if one appears ──────────────────────────────────
async function dismissUpgrade(win) {
  const close = await win.locator('button:has-text("Fermer"), button:has-text("Close"), button:has-text("Plus tard"), button:has-text("Later"), button:has-text("Annuler"), button:has-text("Cancel")').first();
  if (await close.count() > 0) await close.click();
}

// ── Assert no crash banner visible ───────────────────────────────────────────
async function assertNoCrash(win, label) {
  const overlay = await win.$('.error-overlay, .error-boundary, #crash-reporter');
  expect(overlay, `Crash overlay visible after: ${label}`).toBeNull();
}

// ── Assert no NaN text visible in the page ────────────────────────────────────
async function assertNoNaN(win, label) {
  const body = await win.textContent('body');
  const hasNaN = /\bNaN\b/.test(body);
  expect(hasNaN, `NaN found in page after: ${label}`).toBe(false);
}

// =============================================================================
// SUITE 0: App launch + welcome screen
// =============================================================================
test.describe.serial('0 — App launch & mode selection', () => {
  let app, win;

  test.beforeAll(async () => {
    ({ app, win } = await launchApp());
  });
  test.afterAll(async () => { await app.close(); });

  test('app starts and shows BalanceIQ title', async () => {
    const title = await win.title();
    expect(title).toContain('BalanceIQ');
  });

  test('welcome screen appears or app mode already set', async () => {
    // If welcome screen appears, choose Restaurant mode
    const restaurantBtn = await win.locator('button:has-text("Restaurant")').first();
    if (await restaurantBtn.count() > 0) {
      await restaurantBtn.click();
      await win.waitForTimeout(800);
    }
    // Either way, the sidebar should now be visible (BIQ logo)
    const sidebar = await win.locator('text=BIQ').first();
    expect(await sidebar.count()).toBeGreaterThan(0);
  });
});

// =============================================================================
// SUITE 1: Sidebar tab navigation
// =============================================================================
test.describe.serial('1 — Sidebar tab navigation', () => {
  let app, win;

  test.beforeAll(async () => {
    ({ app, win } = await launchApp());
    // Dismiss welcome screen if present
    const btn = await win.locator('button:has-text("Restaurant")').first();
    if (await btn.count() > 0) await btn.click();
    await win.waitForTimeout(800);
  });
  test.afterAll(async () => { await app.close(); });

  const TABS = [
    { label: 'Quotidien',     id: 'daily' },
    { label: 'Encaisse',      id: 'encaisse' },
    { label: 'Facturation',   id: 'facturation' },
    { label: 'P&L Mensuel',   id: 'monthly' },
    { label: 'Intelligence',  id: 'intelligence' },
    { label: 'Gaspillage',    id: 'waste' },
    { label: 'Config',        id: 'settings' },
  ];

  for (const tab of TABS) {
    test(`navigates to ${tab.id} without crash`, async () => {
      await clickTab(win, tab.label);
      await assertNoCrash(win, `Tab: ${tab.label}`);
    });
  }
});

// =============================================================================
// SUITE 2: Daily close-out data entry
// =============================================================================
test.describe.serial('2 — Daily close-out data entry', () => {
  let app, win;

  test.beforeAll(async () => {
    ({ app, win } = await launchApp());
    const btn = await win.locator('button:has-text("Restaurant")').first();
    if (await btn.count() > 0) await btn.click();
    await win.waitForTimeout(800);
    await clickTab(win, 'Quotidien');
    await win.waitForTimeout(500);
  });
  test.afterAll(async () => { await app.close(); });

  test('POS sales field accepts numeric input', async () => {
    // The first number input in the POS section
    const inputs = await win.locator('input[type="number"], input[inputmode="decimal"]').all();
    if (inputs.length === 0) { test.skip(); return; }
    await inputs[0].click();
    await inputs[0].fill('1500');
    const val = await inputs[0].inputValue();
    expect(parseFloat(val)).toBeGreaterThan(0);
    await assertNoCrash(win, 'POS sales input');
  });

  test('holiday checkbox toggles without crash', async () => {
    const cb = await win.locator('input[type="checkbox"]').first();
    if (await cb.count() === 0) { test.skip(); return; }
    await cb.click();
    await win.waitForTimeout(200);
    await cb.click();
    await assertNoCrash(win, 'Holiday checkbox toggle');
  });

  test('notes textarea accepts text', async () => {
    const ta = await win.locator('textarea').first();
    if (await ta.count() === 0) { test.skip(); return; }
    await ta.fill('Test automatisé — stress test 2026-04-04');
    const val = await ta.inputValue();
    expect(val.length).toBeGreaterThan(0);
    await assertNoCrash(win, 'Notes textarea');
  });

  test('weather auto-fill button clicks without crash', async () => {
    const btn = await win.locator('button:has-text("Météo"), button:has-text("Weather"), button:has-text("Vérifier")').first();
    if (await btn.count() === 0) { test.skip(); return; }
    await btn.click();
    await win.waitForTimeout(1500); // allow network call
    await assertNoCrash(win, 'Weather auto-fill');
  });

  test('print daily report button opens PDF preview', async () => {
    const btn = await win.locator('button:has-text("Rapport"), button:has-text("Imprimer"), button:has-text("Print")').first();
    if (await btn.count() === 0) { test.skip(); return; }
    await btn.click();
    await win.waitForTimeout(800);
    await assertNoCrash(win, 'Print daily report');
    // Close preview if it opened
    const closeBtn = await win.locator('button:has-text("Fermer"), button:has-text("Close"), button[title*="lose"]').first();
    if (await closeBtn.count() > 0) await closeBtn.click();
  });
});

// =============================================================================
// SUITE 3: Monthly P&L
// =============================================================================
test.describe.serial('3 — Monthly P&L', () => {
  let app, win;

  test.beforeAll(async () => {
    ({ app, win } = await launchApp());
    const btn = await win.locator('button:has-text("Restaurant")').first();
    if (await btn.count() > 0) await btn.click();
    await win.waitForTimeout(800);
    await clickTab(win, 'P&L Mensuel');
    await win.waitForTimeout(600);
  });
  test.afterAll(async () => { await app.close(); });

  test('P&L tab loads without crash or NaN', async () => {
    await assertNoCrash(win, 'P&L initial load');
    await assertNoNaN(win, 'P&L initial load');
  });

  test('month back navigation works', async () => {
    const backBtn = await win.locator('button:has-text("←"), button[title*="précédent"], button[aria-label*="prev"]').first();
    if (await backBtn.count() === 0) { test.skip(); return; }
    await backBtn.click();
    await win.waitForTimeout(500);
    await assertNoCrash(win, 'P&L month back');
    await assertNoNaN(win, 'P&L month back');
  });

  test('adding a supplier invoice line does not crash', async () => {
    // Look for "Ajouter facture" or "+" button inside a supplier row
    const addBtn = await win.locator('button:has-text("Ajouter"), button:has-text("Facture"), button:has-text("+")').first();
    if (await addBtn.count() === 0) { test.skip(); return; }
    await addBtn.click();
    await win.waitForTimeout(400);
    // Fill in amount if an input appeared
    const amtInput = await win.locator('input[type="number"]:visible, input[inputmode="decimal"]:visible').last();
    if (await amtInput.count() > 0) {
      await amtInput.fill('250');
      await amtInput.press('Tab');
    }
    await assertNoCrash(win, 'P&L add invoice line');
    await assertNoNaN(win, 'P&L add invoice line');
  });
});

// =============================================================================
// SUITE 4: Intelligence tab
// =============================================================================
test.describe.serial('4 — Intelligence tab', () => {
  let app, win;

  test.beforeAll(async () => {
    ({ app, win } = await launchApp());
    const btn = await win.locator('button:has-text("Restaurant")').first();
    if (await btn.count() > 0) await btn.click();
    await win.waitForTimeout(800);
    await clickTab(win, 'Intelligence');
    await win.waitForTimeout(800);
  });
  test.afterAll(async () => { await app.close(); });

  test('Intelligence tab loads without crash or NaN', async () => {
    await assertNoCrash(win, 'Intelligence load');
    await assertNoNaN(win, 'Intelligence load');
  });

  test('scrolls through content without crash', async () => {
    await win.locator('body').evaluate((el) => { el.scrollTop = 500; });
    await win.waitForTimeout(300);
    await assertNoCrash(win, 'Intelligence scroll');
  });
});

// =============================================================================
// SUITE 5: Encaisse tab
// =============================================================================
test.describe.serial('5 — Encaisse (cash position) tab', () => {
  let app, win;

  test.beforeAll(async () => {
    ({ app, win } = await launchApp());
    const btn = await win.locator('button:has-text("Restaurant")').first();
    if (await btn.count() > 0) await btn.click();
    await win.waitForTimeout(800);
    await clickTab(win, 'Encaisse');
    await win.waitForTimeout(600);
  });
  test.afterAll(async () => { await app.close(); });

  test('Encaisse loads without crash or NaN', async () => {
    await assertNoCrash(win, 'Encaisse load');
    await assertNoNaN(win, 'Encaisse load');
  });

  test('can add a cash outflow entry', async () => {
    // Look for the amount input in the sorties/outflows section
    const amtInput = await win.locator('input[placeholder*="Montant"], input[placeholder*="Amount"]').first();
    if (await amtInput.count() === 0) { test.skip(); return; }
    await amtInput.fill('50');
    await win.waitForTimeout(200);
    await assertNoCrash(win, 'Encaisse cash outflow entry');
  });
});

// =============================================================================
// SUITE 6: Facturation (invoicing) tab
// =============================================================================
test.describe.serial('6 — Facturation (invoicing) tab', () => {
  let app, win;

  test.beforeAll(async () => {
    ({ app, win } = await launchApp());
    const btn = await win.locator('button:has-text("Restaurant")').first();
    if (await btn.count() > 0) await btn.click();
    await win.waitForTimeout(800);
    await clickTab(win, 'Facturation');
    await win.waitForTimeout(800);
  });
  test.afterAll(async () => { await app.close(); });

  test('Facturation loads without crash', async () => {
    await assertNoCrash(win, 'Facturation load');
  });

  test('Clients section is accessible', async () => {
    const clientsBtn = await win.locator('button:has-text("Clients")').first();
    if (await clientsBtn.count() === 0) { test.skip(); return; }
    await clientsBtn.click();
    await win.waitForTimeout(400);
    await assertNoCrash(win, 'Facturation clients section');
  });

  test('New client button opens form without crash', async () => {
    const newBtn = await win.locator('button:has-text("Nouveau client"), button:has-text("New client"), button:has-text("Nouveau")').first();
    if (await newBtn.count() === 0) { test.skip(); return; }
    await newBtn.click();
    await win.waitForTimeout(400);
    // Fill in client name
    const nameInput = await win.locator('input[placeholder*="Entreprise"], input[placeholder*="Company"], input[placeholder*="Nom"]').first();
    if (await nameInput.count() > 0) {
      await nameInput.fill('Test Stress Inc.');
    }
    await assertNoCrash(win, 'New client form');
    // Close/cancel without saving
    const cancelBtn = await win.locator('button:has-text("Annuler"), button:has-text("Cancel")').first();
    if (await cancelBtn.count() > 0) await cancelBtn.click();
  });

  test('Factures dashboard loads without NaN', async () => {
    const facBtn = await win.locator('button:has-text("Factures")').first();
    if (await facBtn.count() === 0) { test.skip(); return; }
    await facBtn.click();
    await win.waitForTimeout(400);
    await assertNoCrash(win, 'Factures dashboard');
    await assertNoNaN(win, 'Factures dashboard');
  });

  test('upgrade prompt is handled gracefully (Pro features)', async () => {
    // Click something Pro-gated (e.g. bulk email, Excel export)
    const excelBtn = await win.locator('button:has-text("Excel")').first();
    if (await excelBtn.count() > 0) {
      await excelBtn.click();
      await win.waitForTimeout(400);
      await dismissUpgrade(win);
    }
    await assertNoCrash(win, 'Facturation upgrade prompt');
  });
});

// =============================================================================
// SUITE 7: Config / Settings tab
// =============================================================================
test.describe.serial('7 — Config tab', () => {
  let app, win;

  test.beforeAll(async () => {
    ({ app, win } = await launchApp());
    const btn = await win.locator('button:has-text("Restaurant")').first();
    if (await btn.count() > 0) await btn.click();
    await win.waitForTimeout(800);
    await clickTab(win, 'Config');
    await win.waitForTimeout(600);
  });
  test.afterAll(async () => { await app.close(); });

  test('Config loads without crash', async () => {
    await assertNoCrash(win, 'Config load');
  });

  test('theme toggle switches without crash', async () => {
    // Theme toggle is in the sidebar bottom (Clair/Sombre or Light/Dark)
    const darkBtn = await win.locator('button:has-text("Sombre"), button:has-text("Dark")').first();
    if (await darkBtn.count() === 0) { test.skip(); return; }
    await darkBtn.click();
    await win.waitForTimeout(300);
    const lightBtn = await win.locator('button:has-text("Clair"), button:has-text("Light")').first();
    if (await lightBtn.count() > 0) {
      await lightBtn.click();
      await win.waitForTimeout(300);
    }
    await assertNoCrash(win, 'Theme toggle');
  });

  test('Config sub-tabs open without crash', async () => {
    // Try clicking config sub-tabs (Entreprise, Personnel, P&L, etc.)
    const subTabs = await win.locator('button').filter({ hasText: /Entreprise|Personnel|P&L|Opérations|Intégrations|Application/i }).all();
    for (const tab of subTabs.slice(0, 4)) {
      await tab.click();
      await win.waitForTimeout(400);
      await assertNoCrash(win, `Config sub-tab`);
    }
  });

  test('adding a cashier name does not crash', async () => {
    // Navigate to caisses/cashier section
    const caisseBtn = await win.locator('button:has-text("Caisses"), button:has-text("Registers")').first();
    if (await caisseBtn.count() === 0) { test.skip(); return; }
    await caisseBtn.click();
    await win.waitForTimeout(400);
    const addInput = await win.locator('input[placeholder*="Caissier"], input[placeholder*="Cashier"], input[placeholder*="Nom"]').first();
    if (await addInput.count() === 0) { test.skip(); return; }
    await addInput.fill('Caissier Test Stress');
    await addInput.press('Enter');
    await win.waitForTimeout(300);
    await assertNoCrash(win, 'Add cashier name');
  });
});

// =============================================================================
// SUITE 8: Gaspillage (Waste) tab
// =============================================================================
test.describe.serial('8 — Gaspillage tab', () => {
  let app, win;

  test.beforeAll(async () => {
    ({ app, win } = await launchApp());
    const btn = await win.locator('button:has-text("Restaurant")').first();
    if (await btn.count() > 0) await btn.click();
    await win.waitForTimeout(800);
    await clickTab(win, 'Gaspillage');
    await win.waitForTimeout(800);
  });
  test.afterAll(async () => { await app.close(); });

  test('Waste tab loads without crash or NaN', async () => {
    await assertNoCrash(win, 'Waste tab load');
    await assertNoNaN(win, 'Waste tab load');
  });
});

// =============================================================================
// SUITE 9: Edge case inputs — bad data, no crash
// =============================================================================
test.describe.serial('9 — Edge case inputs', () => {
  let app, win;

  test.beforeAll(async () => {
    ({ app, win } = await launchApp());
    const btn = await win.locator('button:has-text("Restaurant")').first();
    if (await btn.count() > 0) await btn.click();
    await win.waitForTimeout(800);
    await clickTab(win, 'Quotidien');
    await win.waitForTimeout(500);
  });
  test.afterAll(async () => { await app.close(); });

  const BAD_INPUTS = [
    { label: 'negative number', value: '-100' },
    { label: 'non-numeric string', value: 'abc' },
    { label: 'very large number', value: '9999999999' },
    { label: 'empty string', value: '' },
  ];

  for (const { label, value } of BAD_INPUTS) {
    test(`handles ${label} without crash or NaN`, async () => {
      const inputs = await win.locator('input[type="number"], input[inputmode="decimal"]').all();
      if (inputs.length === 0) { test.skip(); return; }
      const target = inputs[0];
      await target.click();
      await target.selectText();
      await target.fill(value);
      await target.press('Tab');
      await win.waitForTimeout(300);
      await assertNoCrash(win, `Bad input: ${label}`);
      await assertNoNaN(win, `Bad input: ${label}`);
    });
  }
});

// =============================================================================
// FINAL: JS error summary
// =============================================================================
test('Final — no unhandled JS errors during run', async () => {
  if (JS_ERRORS.length > 0) {
    console.error('\n=== JS ERRORS CAPTURED DURING STRESS TEST ===');
    JS_ERRORS.forEach((e) => console.error(e));
    console.error(`=== TOTAL: ${JS_ERRORS.length} error(s) ===\n`);
  }
  // We report but don't hard-fail on ALL console errors (some are benign warnings);
  // hard-fail only on actual page errors (uncaught exceptions)
  const pageErrors = JS_ERRORS.filter((e) => e.startsWith('[pageerror]'));
  expect(pageErrors, `Uncaught JS exceptions during stress test:\n${pageErrors.join('\n')}`).toHaveLength(0);
});
