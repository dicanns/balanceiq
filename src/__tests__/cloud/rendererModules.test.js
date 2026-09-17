/**
 * RMOD-001  no renderer file imports a CommonJS module
 *
 * A production build converts CommonJS for the browser; the Vite dev server does
 * not, and serves the file as written - module.exports and all - so the renderer
 * fails to start under `npm start`. Modules shared with the renderer are ESM
 * (.mjs); the main process loads those with require().
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(__dirname, '../..');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!['__tests__', 'db', 'public'].includes(e.name)) walk(p, out); }
    else if (/\.(jsx?|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
}

describe('RMOD-001 renderer imports', () => {
  it('none of them is a .cjs file', () => {
    const offenders = walk(SRC)
      .flatMap(f => (fs.readFileSync(f, 'utf8').match(/^\s*import[^;\n]*from\s+['"][^'"]+\.cjs['"]/gm) || []).map(m => `${path.relative(SRC, f)}: ${m.trim()}`));
    expect(offenders).toEqual([]);
  });
});
