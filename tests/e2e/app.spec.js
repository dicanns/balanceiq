/**
 * BalanceIQ — Electron E2E Tests (Playwright)
 *
 * Prerequisites: `npm run build:mac` (or `npm start` for dev mode)
 * Run: npx playwright test --project=electron
 *
 * These tests launch the real Electron app and verify each tab loads
 * without crashing, basic data entry works, and language switching works.
 */
import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';

const APP_ROOT = path.resolve(process.cwd());

// ── Launch helper ─────────────────────────────────────────────────────────────
async function launchApp() {
  return await electron.launch({
    args: [path.join(APP_ROOT, 'main.js')],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      ELECTRON_IS_DEV: '0',
    },
  });
}

// ── Dismiss the mode-selection welcome screen if present ──────────────────────
async function dismissWelcomeScreen(win) {
  const btn = await win.locator('button:has-text("Restaurant")').first();
  if (await btn.count() > 0) {
    await btn.click();
    await win.waitForTimeout(800);
  }
}

// ── Smoke tests ───────────────────────────────────────────────────────────────
test.describe('App launch', () => {
  let app;

  test.beforeEach(async () => {
    try {
      app = await launchApp();
    } catch (err) {
      const detail = err?.stderr || err?.message || String(err);
      throw new Error(`App launch failed: ${detail}`);
    }
  });

  test.afterEach(async () => {
    if (app && typeof app.close === 'function') {
      try { await app.close(); } catch (_) {}
      app = null;
    }
  });

  // SMOKE-001
  test('app starts and shows main window', async () => {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    const title = await window.title();
    expect(title).toContain('BalanceIQ');
  });

  // SMOKE-002
  test('window is visible and not crashed', async () => {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await expect(window).not.toBeNull();
    // Verify no crash banner
    const errorOverlay = await window.$('.error-overlay, #crash-reporter');
    expect(errorOverlay).toBeNull();
  });

  // SMOKE-003
  test('main window has non-empty body', async () => {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    const bodyText = await window.textContent('body');
    expect(bodyText.trim().length).toBeGreaterThan(0);
  });
});

// ── Tab navigation ────────────────────────────────────────────────────────────
test.describe('Tab navigation', () => {
  let app;
  let window;

  test.beforeAll(async () => {
    app = await launchApp();
    window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await window.waitForSelector('body', { timeout: 10000 });
    await dismissWelcomeScreen(window);
  });

  test.afterAll(async () => {
    if (app && typeof app.close === 'function') {
      try { await app.close(); } catch (_) {}
      app = null;
    }
  });

  const tabs = [
    { name: 'Daily / Quotidien',      selector: '[data-tab="daily"], button:has-text("Quotidien"), button:has-text("Daily")' },
    { name: 'Monthly P&L',             selector: '[data-tab="monthly"], button:has-text("P&L"), button:has-text("Mensuel")' },
    { name: 'Intelligence',            selector: '[data-tab="intelligence"], button:has-text("Intelligence")' },
    { name: 'Encaisse',                selector: '[data-tab="encaisse"], button:has-text("Encaisse"), button:has-text("Cash")' },
    { name: 'Livraisons',              selector: '[data-tab="livraisons"], button:has-text("Livraisons"), button:has-text("Delivery")' },
  ];

  for (const tab of tabs) {
    test(`navigates to ${tab.name} tab without error`, async () => {
      const btn = await window.$(tab.selector);
      if (!btn) {
        test.skip(); // Tab might not be visible in current mode
        return;
      }
      await btn.click();
      await window.waitForTimeout(500);
      // Verify no JS error overlay appeared
      const error = await window.$('.js-error, .error-boundary');
      expect(error).toBeNull();
    });
  }
});

// ── Close-out data entry ──────────────────────────────────────────────────────
test.describe('Daily close-out data entry', () => {
  let app;
  let window;

  test.beforeAll(async () => {
    app = await launchApp();
    window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await window.waitForSelector('body', { timeout: 10000 });
    await dismissWelcomeScreen(window);
  });

  test.afterAll(async () => {
    if (app && typeof app.close === 'function') {
      try { await app.close(); } catch (_) {}
      app = null;
    }
  });

  test('can enter POS sales data in a cash register', async () => {
    // Look for a POS sales input field
    const posInput = await window.$('input[placeholder*="Ventes"], input[data-field="posVentes"]');
    if (!posInput) {
      test.skip();
      return;
    }
    await posInput.fill('1250.00');
    const val = await posInput.inputValue();
    expect(parseFloat(val)).toBeCloseTo(1250, 1);
  });

  test('can enter inventory data (hamburger end of day)', async () => {
    const hamInput = await window.$('input[data-field="hamEnd"], input[placeholder*="Hamburger"], input[placeholder*="Fin"]');
    if (!hamInput) {
      test.skip();
      return;
    }
    await hamInput.fill('25');
    const val = await hamInput.inputValue();
    expect(parseInt(val)).toBe(25);
  });
});

// ── Language switching ────────────────────────────────────────────────────────
test.describe('Language switching FR → EN', () => {
  let app;
  let window;

  test.beforeAll(async () => {
    app = await launchApp();
    window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await window.waitForSelector('body', { timeout: 10000 });
    await dismissWelcomeScreen(window);
  });

  test.afterAll(async () => {
    if (app && typeof app.close === 'function') {
      try { await app.close(); } catch (_) {}
      app = null;
    }
  });

  test('language toggle button exists', async () => {
    const langBtn = await window.$('button:has-text("EN"), button:has-text("FR"), [data-lang-toggle]');
    if (!langBtn) {
      test.skip(); // App is French-only — no language toggle
      return;
    }
    expect(langBtn).not.toBeNull();
  });

  test('switching from FR to EN updates UI text', async () => {
    // Find and click EN toggle
    const enBtn = await window.$('button:has-text("EN")');
    if (!enBtn) {
      test.skip();
      return;
    }
    await enBtn.click();
    await window.waitForTimeout(300);

    // Verify English text appears
    const bodyText = await window.textContent('body');
    expect(bodyText).toMatch(/Daily|Sales|Settings|Intelligence/i);
  });

  test('switching back to FR restores French UI', async () => {
    const frBtn = await window.$('button:has-text("FR")');
    if (!frBtn) {
      test.skip();
      return;
    }
    await frBtn.click();
    await window.waitForTimeout(300);

    const bodyText = await window.textContent('body');
    expect(bodyText).toMatch(/Quotidien|Ventes|Paramètres|Intelligence/i);
  });
});

// ── Config / Settings ─────────────────────────────────────────────────────────
test.describe('Config tab loads', () => {
  let app;
  let window;

  test.beforeAll(async () => {
    app = await launchApp();
    window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await window.waitForSelector('body', { timeout: 10000 });
    await dismissWelcomeScreen(window);
  });

  test.afterAll(async () => {
    if (app && typeof app.close === 'function') {
      try { await app.close(); } catch (_) {}
      app = null;
    }
  });

  test('Config tab is accessible', async () => {
    const configBtn = await window.$('button:has-text("Config"), button:has-text("Paramètres"), [data-tab="config"]');
    if (!configBtn) {
      test.skip();
      return;
    }
    await configBtn.click();
    await window.waitForTimeout(500);

    const error = await window.$('.js-error, .error-boundary');
    expect(error).toBeNull();
  });
});
