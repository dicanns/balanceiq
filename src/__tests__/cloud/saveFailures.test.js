/**
 * SAVEFAIL-001  no storage write swallows its failure any more
 * SAVEFAIL-002  a failed save reaches the operator, in both languages
 * SAVEFAIL-003  background checks work on the live lists, not a copy read off disk
 * SAVEFAIL-004  the storage wrapper is read for its value, never parsed whole
 *
 * Forty-two saves ended in .catch(()=>{}); a write SQLite refused looked like a
 * success. Three startup checks parsed the {value} wrapper instead of its value
 * and had never worked; the same empty catch hid it. The NSF check then wrote a
 * whole invoice list back from a copy read off disk, over anything saved in
 * between.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const APP = fs.readFileSync(path.join(ROOT, 'src/App.jsx'), 'utf8');
const I18N = fs.readFileSync(path.join(ROOT, 'src/i18n/translations.js'), 'utf8');
const components = fs.readdirSync(path.join(ROOT, 'src/components')).filter(f => f.endsWith('.jsx'))
  .map(f => fs.readFileSync(path.join(ROOT, 'src/components', f), 'utf8')).join('\n');

describe('SAVEFAIL-001 nothing swallowed', () => {
  it('every storage write reports through saveFailed', () => {
    const swallowed = (APP + components).match(/storage\??\.set\([^\n]*?\)\.catch\(\(\)=>\{\}\)/g) || [];
    expect(swallowed).toEqual([]);
    expect((APP.match(/\.catch\(saveFailed\(/g) || []).length).toBeGreaterThanOrEqual(38);
    expect(APP).toMatch(/function saveFailed\(key\)\{return e=>\{console\.error\('\[save\]',key,e\);/);
  });
});

describe('SAVEFAIL-002 the operator sees it', () => {
  it('a banner listens for the event and both languages have the words', () => {
    expect(APP).toMatch(/window\.addEventListener\('biq:save-failed',on\)/);
    expect(APP).toMatch(/\{T\.saveFailedBanner\(saveError\.key,saveError\.message\)\}/);
    expect((I18N.match(/saveFailedBanner:/g) || []).length).toBe(2);
    expect((I18N.match(/saveFailedDismiss:/g) || []).length).toBe(2);
  });
});

describe('SAVEFAIL-003 live lists, not a copy', () => {
  it('the NSF check maps the refs and saves through the helpers', () => {
    expect(APP).toMatch(/const nextFacs=facFacturesRef\.current\.map\(/);
    expect(APP).toMatch(/const nextCls=facClientsRef\.current\.map\(/);
    expect(APP).toMatch(/if\(changed\)\{saveFacFactures\(nextFacs\);saveFacClients\(nextCls\);\}/);
    expect(APP).toMatch(/const saveFacClients=useCallback\(listOrFn=>/);
  });
});

describe('SAVEFAIL-004 the wrapper is read for its value', () => {
  it('no startup check parses the {value} object itself', () => {
    expect(APP).not.toMatch(/JSON\.parse\(stored\)/);
    expect(APP).not.toMatch(/JSON\.parse\(cfgRaw\)/);
    expect(APP).not.toMatch(/JSON\.parse\(stored2\)/);
  });
});
