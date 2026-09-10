/**
 * CAPEXGUIDE-001  the guide answers the decision, in both languages
 * CAPEXGUIDE-002  it does not hard-code rates that can go stale
 * CAPEXGUIDE-003  a manufacturer has a class to put its machinery in
 *
 * "I don't know the difference when to put it where" is the honest position of
 * almost everyone who has just started a business, and the flag added in v1.54
 * asked the question without helping anyone answer it. The guide is a decision
 * aid rather than a rate table: the three-question test, the cases that come up,
 * the repair-versus-improvement trap, and then the accountant.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { buildAccountingDb } from '../helpers/testSchema.js';
import { CAPEX_REVIEW_THRESHOLD } from '../../../utils/calculations.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const GUIDE = readFileSync(join(SRC, 'components', 'CapexGuide.jsx'), 'utf8');

let db;
beforeEach(() => { db = buildAccountingDb(); });
afterEach(() => { db?.close(); db = null; });

describe('CAPEXGUIDE-001 it answers the decision', () => {
  it('carries the three-question test', () => {
    for (const key of ['q1', 'q2', 'q3', 'testYes', 'testNo']) {
      expect(GUIDE).toContain(`${key}:`);
    }
  });

  it('covers the repair-versus-improvement trap, which is the hard one', () => {
    expect(GUIDE).toContain('repairTitle');
    expect(GUIDE).toMatch(/back the way it was is a repair/);
    expect(GUIDE).toMatch(/Replacing the motor in a mixer/);
  });

  it('says the tax credit is unaffected, which is the common worry', () => {
    expect(GUIDE).toMatch(/fully claimable in the year of purchase either way/);
  });

  it('tells the user what to actually do next', () => {
    expect(GUIDE).toContain('how1');
    expect(GUIDE).toContain('how2');
    expect(GUIDE).toMatch(/Fixed Assets/);
  });

  it('ends at the accountant rather than pretending the answer is mechanical', () => {
    expect(GUIDE).toMatch(/for your accountant to confirm/);
    expect(GUIDE).toMatch(/not obliged to claim it all/);
  });

  it('is complete in both languages, per the bilingual rule', () => {
    const fr = GUIDE.slice(GUIDE.indexOf('  fr: {'), GUIDE.indexOf('  en: {'));
    const en = GUIDE.slice(GUIDE.indexOf('  en: {'));
    const keys = (s) => [...s.matchAll(/^\s{4}(\w+):/gm)].map(m => m[1]).sort();
    expect(keys(en)).toEqual(keys(fr));
  });

  it('uses the shared threshold rather than repeating the number', () => {
    expect(GUIDE).toContain('CAPEX_REVIEW_THRESHOLD');
    expect(GUIDE).not.toMatch(/cost more than \$?500/);
    expect(CAPEX_REVIEW_THRESHOLD).toBe(500);
  });
});

describe('CAPEXGUIDE-002 rates come from the data, not the copy', () => {
  it('reads the classes the app will actually compute with', () => {
    expect(GUIDE).toContain('window.api?.cca?.classes()');
  });

  it('renders the description held against each class', () => {
    expect(GUIDE).toContain('description_en');
    expect(GUIDE).toContain('description_fr');
  });

  it('survives the classes being unavailable', () => {
    // The guide is still worth reading without them, so the block is conditional.
    expect(GUIDE).toContain('classes.length > 0 &&');
  });

  it('no percentage is written into the prose', () => {
    const prose = GUIDE.slice(GUIDE.indexOf('const UI ='), GUIDE.indexOf('export default'));
    // Class labels in the examples table are fine; a rate in a sentence is not.
    expect(prose).not.toMatch(/\d{1,3}\s?% (declining|per year|par an)/);
  });
});

describe('CAPEXGUIDE-003 a manufacturer has somewhere to put its machinery', () => {
  const rates = () => db.prepare(`SELECT * FROM cca_class_rates`).all();

  it('the seeded set covers manufacturing machinery', () => {
    // The original seed was a restaurant's list: equipment, vehicles, small
    // tools, leasehold, computers. Anyone making a product had no class.
    const classes = rates().map(r => String(r.class));
    if (classes.length === 0) return;               // pre-CCA schema
    expect(classes).toContain('43');
  });

  it('and buildings and intangibles', () => {
    const classes = rates().map(r => String(r.class));
    if (classes.length === 0) return;
    expect(classes).toContain('1');
    expect(classes).toContain('14.1');
  });

  it('the guide points production machinery at a real class', () => {
    expect(GUIDE).toMatch(/Production machinery', '43'/);
  });

  it('every class named in the examples is one the app knows', () => {
    const named = [...GUIDE.matchAll(/', '([\d.]+)'\],/g)].map(m => m[1]);
    expect(named.length).toBeGreaterThan(0);
    const known = rates().map(r => String(r.class));
    if (known.length === 0) return;
    for (const c of named) expect(known).toContain(c);
  });
});
