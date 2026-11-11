/**
 * INJ-001  print / PDF HTML builders escape user-controlled text, colours and image sources
 * INJ-002  opening-receivable imports store plain text (no angle brackets, no control characters)
 * INJ-003  the print and PDF windows run without script, sandboxed, with no navigation
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { escapeHtml, safeColor, safeImgSrc, stripMarkup, DEFAULT_ACCENT } from '../../utils/htmlSafe.mjs';
import { buildChequesHtml } from '../../utils/chequePrint.mjs';
import { buildMonthlySummaryHtml } from '../../utils/monthlySummaryHtml.mjs';
import { buildOpeningInvoices } from '../../utils/openingReceivables.mjs';

const EVIL = '<script>alert(1)</script>';
const ATTR = '" onload="alert(1)';

describe('INJ-001 html helpers', () => {
  it('escapeHtml neutralises markup and quotes', () => {
    const out = escapeHtml(`${EVIL}${ATTR}'`);
    expect(out).not.toMatch(/[<>"]/);
    expect(out).toContain('&lt;script&gt;');
    expect(out).toContain('&quot; onload=&quot;');
  });
  it('safeColor accepts hex and rgb only', () => {
    expect(safeColor('#f97316')).toBe('#f97316');
    expect(safeColor('rgb(1, 2, 3)')).toBe('rgb(1, 2, 3)');
    expect(safeColor('red;}</style><script>x</script>')).toBe(DEFAULT_ACCENT);
    expect(safeColor('#fff;background:url(x)')).toBe(DEFAULT_ACCENT);
    expect(safeColor('expression(alert(1))', '#000')).toBe('#000');
    expect(safeColor(undefined)).toBe(DEFAULT_ACCENT);
  });
  it('safeImgSrc accepts data images and https, drops the rest', () => {
    expect(safeImgSrc('data:image/png;base64,AAAA')).toContain('data:image/png');
    expect(safeImgSrc('https://example.com/a.png')).toBe('https://example.com/a.png');
    expect(safeImgSrc('javascript:alert(1)')).toBe('');
    expect(safeImgSrc('file:///etc/passwd')).toBe('');
    expect(safeImgSrc('x" onerror="alert(1)')).toBe('');
    expect(safeImgSrc('https://a.com/x"onerror="y')).toBe('');
  });
});

describe('INJ-001 cheque and monthly summary builders', () => {
  it('cheque page escapes payee, memo, number, title and date digits', () => {
    const html = buildChequesHtml([{ party_name: EVIL, memo: ATTR, cheque_number: EVIL, cheque_date: '2026-<b>-01', amount_cents: 12345, bank_account_name: EVIL, forLabel: EVIL }],
      { position: 'middle' }, { title: EVIL });
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<b>');
    expect(html).not.toMatch(/onload="alert/);
    const stub = buildChequesHtml([{ party_name: EVIL, memo: ATTR, cheque_number: EVIL, cheque_date: '2026-01-01', amount_cents: 100, forLabel: EVIL }], { position: 'top' }, {});
    expect(stub).not.toContain('<script');
  });
  it('monthly summary escapes names, descriptions and company', () => {
    const rows = { rows: [{ account_number: '5000', name_fr: EVIL, name_en: EVIL, count: 1, net_cents: 1, tps_cents: 0, tvq_cents: 0, gross_cents: 1, itc_pct: 50, items: [{ date: ATTR, description: EVIL, cents: 1 }] }], totals: { count: 1, net_cents: 1, tps_cents: 0, tvq_cents: 0, gross_cents: 1 } };
    const empty = { rows: [], totals: { count: 0, net_cents: 0, tps_cents: 0, tvq_cents: 0, gross_cents: 0 } };
    const html = buildMonthlySummaryHtml({ period: { from: EVIL, to: ATTR },
      accounts: [{ name: EVIL, expenses: rows, inflows: empty, transfers: { count: 0, cents: 0 }, uncategorized: [{ date: ATTR, description: EVIL, cents: 5 }] }] },
    { lang: 'en', companyName: EVIL, withDetail: true });
    expect(html).not.toContain('<script');
    expect(html).not.toMatch(/ onload="alert/);
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('INJ-002 opening receivables import', () => {
  it('stripMarkup removes angle brackets and control characters', () => {
    expect(stripMarkup(`  ac\u0000me <b>inc</b>\u0007\n`)).toBe('ac me binc/b');
    expect(stripMarkup(EVIL)).not.toMatch(/[<>]/);
  });
  it('imported customer names and invoice numbers are stored as plain text', () => {
    let n = 0;
    const r = buildOpeningInvoices([['Acme <script>alert(1)</script>', 'F-<img src=x onerror=1>1', '2026-10-01', '100.00']],
      ['client', 'numero', 'date', 'montant'], { hasHeader: false, ids: () => `id${++n}` });
    expect(r.errors).toEqual([]);
    expect(r.invoices[0].numero).not.toMatch(/[<>]/);
    expect(r.newClients[0].entreprise).not.toMatch(/[<>]/);
    expect(r.invoices[0].lignes[0].description).not.toMatch(/[<>]/);
  });
});

describe('INJ-003 print windows are hardened', () => {
  const main = fs.readFileSync(path.resolve(__dirname, '../../../main.js'), 'utf8');
  it('uses sandboxed, script-free web preferences and denies navigation, popups and permissions', () => {
    expect(main).toMatch(/PRINT_WEB_PREFERENCES = \{[^}]*sandbox: true[^}]*javascript: false/);
    expect(main).toMatch(/PRINT_WEB_PREFERENCES = \{[^}]*nodeIntegration: false[^}]*contextIsolation: true/);
    expect(main).toContain("setWindowOpenHandler(() => ({ action: 'deny' }))");
    expect(main).toContain("'will-navigate'");
    expect(main).toContain('setPermissionRequestHandler');
    expect((main.match(/webPreferences: PRINT_WEB_PREFERENCES/g) || []).length).toBe(2);
  });
});
