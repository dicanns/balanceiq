/**
 * SHELL-001  mailto: links open a mail draft and nothing else; other schemes stay blocked
 * SHELL-002  the packaged app lists the files it needs, not the whole folder
 * SHELL-003  printed documents escape the free text they print
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(__dirname, '../../..');
const MAIN = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// Pull the URL allowlist code out of main.js and run it on its own.
function loadIsUrlSafe() {
  const a = MAIN.indexOf('const ALLOWED_URL_SCHEMES');
  const b = MAIN.indexOf('// ─────', MAIN.indexOf('function isUrlSafe'));
  const src = MAIN.slice(a, b) + '\n;isUrlSafe';
  return vm.runInNewContext(src, { URL });
}

describe('SHELL-001 external links', () => {
  const safe = loadIsUrlSafe();
  it('allows a mail draft with the usual fields', () => {
    expect(safe('mailto:client@example.com?subject=Facture%20F-1&body=Bonjour%0D%0AMerci')).toBe(true);
    expect(safe('mailto:?subject=Hello')).toBe(true);
    expect(safe('mailto:a@example.com,b@example.com?cc=c@example.com')).toBe(true);
  });
  it('refuses attachment fields, header injection and junk recipients', () => {
    expect(safe('mailto:a@example.com?attach=/etc/passwd')).toBe(false);
    expect(safe('mailto:a@example.com?subject=x%0D%0Abcc=evil@example.com')).toBe(true); // encoded: stays inside the subject
    expect(safe('mailto:a@example.com\nbcc:x@y.z')).toBe(false);
    expect(safe('mailto:not an address')).toBe(false);
  });
  it('keeps every other scheme and host blocked', () => {
    expect(safe('https://balanceiq.ca/x')).toBe(true);
    expect(safe('https://evil.example.com/')).toBe(false);
    expect(safe('http://balanceiq.ca/')).toBe(false);
    expect(safe('file:///etc/passwd')).toBe(false);
    expect(safe('javascript:alert(1)')).toBe(false);
  });
});

describe('SHELL-002 packaged files', () => {
  const files = PKG.build.files;
  it('does not bundle the whole folder', () => {
    expect(files).not.toContain('**/*');
    for (const need of ['main.js', 'preload.js', 'companies.js', 'dist/**/*', 'src/db/**/*', 'src/services/**/*', 'src/utils/**/*', 'node_modules/**/*']) {
      expect(files).toContain(need);
    }
  });
  it('names no secret or signing file', () => {
    for (const f of files.filter(x => !x.startsWith('!'))) expect(f).not.toMatch(/\.env|certificate|\.p12|\.pem|release|docs/i);
  });
  it('switches off the debug entry points', () => {
    expect(PKG.build.electronFuses).toMatchObject({ runAsNode: false, enableNodeCliInspectArguments: false });
  });
});

describe('SHELL-003 print builders escape free text', () => {
  const must = {
    'src/components/YearEndPackage.jsx': ['esc(co.name', 'esc(clientName(f))', 'esc(f.numero', 'esc(name)'],
    'src/components/PrevisionsTab.jsx': ['esc(item.product.name)', 'esc(title)', 'esc(a.product.name)'],
    'src/components/TipPoolModal.jsx': ['esc(e.name)', 'esc(notes)'],
    'src/components/TaxPeriodTab.jsx': ['esc(period.period_start)', 'esc(period.confirmation_number)'],
    'src/components/EcocontributionTab.jsx': ['esc(c.label)', 'esc(title)'],
  };
  for (const [file, needles] of Object.entries(must)) {
    it(file, () => {
      const src = read(file);
      for (const n of needles) expect(src, n).toContain(n);
    });
  }
  it('the packaged shell has no developer tools and PIN checks lock out', () => {
    expect(MAIN).toContain("devtools-opened");
    expect(MAIN).toMatch(/pin_locked/);
  });
});
