/**
 * UIBTN-001  no button renders with nothing inside it
 *
 * 68 buttons across the app rendered as empty clickable boxes. Every remove,
 * close and edit control in a list was invisible: the credit note editor showed
 * no way to delete a line the user had just added, and the same was true of
 * roster rows, suppliers, platforms, recipe ingredients, royalty tiers and cash
 * locations. The glyphs had been stripped by a pass over the source at some
 * point - the JSX was still valid, the buttons still worked if you happened to
 * click the right few pixels, and nothing in the build said a word about it.
 *
 * This is a source-level check on purpose. A rendering test would need every one
 * of these screens mounted with its data; the defect is visible in the text.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function jsxFiles() {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === '__tests__' || e.name === 'node_modules') continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.jsx')) out.push(p);
    }
  };
  walk(SRC);
  return out;
}

// Walks a button's opening tag to its own closing ">", ignoring every ">" that
// belongs to a prop expression or a string, and reports the ones whose element
// content is empty. A regex cannot do this: `<button ...><span>x</span></button>`
// also ends in "></button>", so a naive pattern calls every button with an
// element child empty.
function emptyButtonLines(src) {
  const lines = [];
  for (let i = src.indexOf('<button'); i >= 0; i = src.indexOf('<button', i + 1)) {
    let j = i + 7, depth = 0, quote = null;
    for (; j < src.length; j++) {
      const c = src[j];
      if (quote) {
        if (c === '\\') { j++; continue; }
        if (c === quote) quote = null;
      } else if (c === '"' || c === "'" || c === '`') quote = c;
      else if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) break;
    }
    if (src.startsWith('</button>', j + 1)) lines.push(src.slice(0, i).split('\n').length);
  }
  return lines;
}

describe('UIBTN-001 every button says something', () => {
  const files = jsxFiles();

  it('finds the source to check', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it('no button in the app renders empty', () => {
    const offenders = [];
    for (const f of files) {
      for (const line of emptyButtonLines(readFileSync(f, 'utf8'))) {
        offenders.push(`${f.replace(SRC, 'src')}:${line}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the scanner is not fooled by a button whose last child is an element', () => {
    expect(emptyButtonLines('<button style={{a:1}}><span>x</span></button>')).toEqual([]);
    expect(emptyButtonLines('<button title=">">ok</button>')).toEqual([]);
    expect(emptyButtonLines('<button onClick={()=>f(a>b)}>ok</button>')).toEqual([]);
  });

  it('and does catch a genuinely empty one', () => {
    expect(emptyButtonLines('<button style={{a:1}}></button>')).toEqual([1]);
    expect(emptyButtonLines('\n\n<button onClick={x}></button>')).toEqual([3]);
  });

  it('the credit note line remover in particular has a label', () => {
    const app = readFileSync(join(SRC, 'App.jsx'), 'utf8');
    const removers = [...app.matchAll(/onClick=\{\(\)=>rmManual\(l\.id\)\}[\s\S]{0,300}?<\/button>/g)];
    expect(removers.length).toBeGreaterThanOrEqual(2);
    for (const r of removers) expect(r[0]).toMatch(/>\s*\S[\s\S]*<\/button>$/);
  });
});
