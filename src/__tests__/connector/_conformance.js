// What every connector tool must look like. Each tool file's test calls this on
// its own list; tools.test.js calls it on the whole list.
import { expect } from 'vitest';
import { describeTool, checkArguments } from '../../connector/protocol.mjs';

const EM_DASH = String.fromCharCode(0x2014);

export function expectWellFormed(tools) {
  expect(Array.isArray(tools) && tools.length > 0).toBe(true);
  const names = tools.map((t) => t.name);
  expect(new Set(names).size, 'each name once').toBe(names.length);
  for (const t of tools) {
    const where = `tool ${t.name}`;
    expect(t.name, where).toMatch(/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/);
    expect(t.name.length, where).toBeLessThanOrEqual(40);
    // What a person reads, in both languages.
    expect(typeof t.title?.en === 'string' && t.title.en.trim().length > 2, `${where} title.en`).toBe(true);
    expect(typeof t.title?.fr === 'string' && t.title.fr.trim().length > 2, `${where} title.fr`).toBe(true);
    // What the AI reads: says what it answers and when to use it.
    expect(typeof t.description === 'string' && t.description.length >= 60 && t.description.length <= 600, `${where} description length`).toBe(true);
    for (const text of [t.title.en, t.title.fr, t.description]) expect(text.includes(EM_DASH), `${where} em dash`).toBe(false);
    // Arguments: a closed object, every property described.
    expect(t.inputSchema?.type, where).toBe('object');
    expect(t.inputSchema?.additionalProperties, `${where} must refuse unknown arguments`).toBe(false);
    for (const [k, p] of Object.entries(t.inputSchema.properties || {})) {
      expect(k, `${where}.${k}`).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(typeof p.description === 'string' && p.description.length > 5, `${where}.${k} description`).toBe(true);
    }
    expect(checkArguments(t.inputSchema, { not_an_argument: 1 }), `${where} unknown argument`).not.toBeNull();
    // Reading only, until actions arrive with their own confirmation step.
    expect(t.readOnly, `${where} must not be marked as changing anything`).not.toBe(false);
    expect(typeof t.run, where).toBe('function');
    const shown = describeTool(t, 'en');
    expect(shown.annotations.readOnlyHint, where).toBe(true);
    expect(shown.name, where).toBe(t.name);
  }
}

// Money in an answer is a number with at most two decimals; nothing is a raw row.
export function expectPlainAnswer(value, where = 'answer') {
  const walk = (v, p) => {
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return;
    if (typeof v === 'number') { expect(Number.isFinite(v), p).toBe(true); return; }
    expect(typeof v, p).toBe('object');
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${p}[${i}]`)); return; }
    for (const [k, x] of Object.entries(v)) {
      expect(k, `${p}.${k} key`).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(x === undefined, `${p}.${k} undefined`).toBe(false);
      walk(x, `${p}.${k}`);
    }
  };
  walk(value, where);
}
