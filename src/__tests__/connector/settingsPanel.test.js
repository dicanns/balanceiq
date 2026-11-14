// Settings > AI assistant panel: pure checks only (no DOM library in this repo).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { UI, connectCommand } from '../../components/AiConnectorSettings.jsx';

const SRC = path.resolve(__dirname, '../../components/AiConnectorSettings.jsx');
const EM_DASH = String.fromCharCode(0x2014);

// Visible text of every entry; functions are called with sample arguments.
const visible = (L) => Object.entries(L).map(([k, v]) =>
  [k, typeof v === 'function' ? String(v('Sample Co', 'Sample question')) : String(v)]);

describe('CONN-020 strings', () => {
  it('CONN-020 en and fr have the same keys and the same kinds of value', () => {
    expect(Object.keys(UI.fr).sort()).toEqual(Object.keys(UI.en).sort());
    for (const k of Object.keys(UI.en)) expect(typeof UI.fr[k], k).toBe(typeof UI.en[k]);
  });

  it('CONN-021 no technical words or em dash in any visible string', () => {
    const banned = [/mcp/i, /localhost/i, /endpoint/i, /token/i];
    for (const lang of ['en', 'fr']) {
      for (const [k, s] of visible(UI[lang])) {
        for (const re of banned) expect(re.test(s), `${lang}.${k} ${re}`).toBe(false);
        expect(s.includes(EM_DASH), `${lang}.${k} em dash`).toBe(false);
      }
    }
  });

  it('CONN-022 no empty strings', () => {
    for (const lang of ['en', 'fr']) {
      for (const [k, s] of visible(UI[lang])) expect(s.trim().length, `${lang}.${k}`).toBeGreaterThan(0);
    }
  });
});

describe('CONN-023 connect command', () => {
  it('CONN-023 builds the Claude Code command exactly', () => {
    expect(connectCommand('http://127.0.0.1:47821/mcp', 'biq_abc')).toBe(
      'claude mcp add --transport http balanceiq http://127.0.0.1:47821/mcp --header "Authorization: Bearer biq_abc"'
    );
  });
});

describe('CONN-024 the key stays in memory', () => {
  const src = fs.readFileSync(SRC, 'utf8');
  it('CONN-024 the component never writes the key to browser storage', () => {
    expect(src).not.toMatch(/localStorage/);
    expect(src).not.toMatch(/sessionStorage/);
  });
  it('CONN-025 the component source has no em dash', () => {
    expect(src.includes(EM_DASH)).toBe(false);
  });
});
