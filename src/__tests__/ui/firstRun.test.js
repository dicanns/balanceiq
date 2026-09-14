/**
 * BIZTYPE-001  a business can be invoicing, register, or both
 * BIZTYPE-002  what each type shows, and what it hides
 * FIRSTRUN-001 the getting-started list fits the business
 * FIRSTRUN-002 items tick themselves off from real data, and only from real data
 * FIRSTRUN-003 every item leads to a screen that exists
 * FIRSTRUN-004 the counts come from the database, and survive a missing table
 * FIRSTRUN-005 it is wired end to end
 *
 * Phase 6 of the navigation rebuild. The app only knew restaurant or franchise, so
 * a wholesale business opened on "What type of restaurant?", was set up with cash
 * registers, and carried six register screens it never uses. The checklist that
 * followed had two copies of its own rules, and four of its six links pointed at
 * restaurant screens or a Settings tab that did not exist.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import {
  BUSINESS_TYPES, BUSINESS_TYPE_INFO, normalizeBusinessTypes, businessTypesChosen,
  visibleDestinations, landingDestination, firstRunItems,
} from '../../services/businessProfile.js';
import { buildAccountingDb } from '../accounting/helpers/testSchema.js';

const require = createRequire(import.meta.url);
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(join(SRC, rel), 'utf8');
const keys = (items) => items.map(i => i.key);

describe('BIZTYPE-001 invoicing, register, or both', () => {
  it('unset means both, so nothing disappears for an existing business', () => {
    expect(normalizeBusinessTypes(undefined)).toEqual(['invoicing', 'register']);
    expect(normalizeBusinessTypes([])).toEqual(['invoicing', 'register']);
  });

  it('keeps a single choice', () => {
    expect(normalizeBusinessTypes(['register'])).toEqual(['register']);
    expect(normalizeBusinessTypes(['invoicing'])).toEqual(['invoicing']);
  });

  it('keeps both, in a stable order, without duplicates', () => {
    expect(normalizeBusinessTypes(['register', 'invoicing', 'register'])).toEqual(['invoicing', 'register']);
  });

  it('ignores anything it does not recognise', () => {
    expect(normalizeBusinessTypes(['wholesale'])).toEqual(['invoicing', 'register']);
    expect(normalizeBusinessTypes('invoicing')).toEqual(['invoicing', 'register']);
  });

  it('knows the difference between chosen and defaulted', () => {
    expect(businessTypesChosen(undefined)).toBe(false);
    expect(businessTypesChosen([])).toBe(false);
    expect(businessTypesChosen(['invoicing'])).toBe(true);
  });

  it('both types are described in both languages', () => {
    expect(BUSINESS_TYPE_INFO.map(b => b.key)).toEqual(BUSINESS_TYPES);
    for (const b of BUSINESS_TYPE_INFO) {
      for (const f of ['labelEn', 'labelFr', 'descEn', 'descFr']) expect(b[f]).toBeTruthy();
    }
  });
});

describe('BIZTYPE-002 what each type shows', () => {
  it('both: everything', () => {
    expect(visibleDestinations({ businessTypes: ['invoicing', 'register'] }))
      .toEqual(['facturation', 'today', 'bank', 'books', 'taxes', 'operations', 'settings']);
  });

  it('invoicing only: no Operations', () => {
    const v = visibleDestinations({ businessTypes: ['invoicing'] });
    expect(v).not.toContain('operations');
    expect(v).toContain('facturation');
  });

  it('register only: no Sales', () => {
    const v = visibleDestinations({ businessTypes: ['register'] });
    expect(v).not.toContain('facturation');
    expect(v).toContain('operations');
  });

  it('a franchisor keeps Sales whatever is ticked, because royalties are invoiced', () => {
    const v = visibleDestinations({ businessTypes: ['register'], appMode: 'franchiseur' });
    expect(v).toContain('facturation');
    expect(v[0]).toBe('reseau');
  });

  it('the accounting screens and Settings are always there', () => {
    for (const types of [['invoicing'], ['register'], ['invoicing', 'register']]) {
      const v = visibleDestinations({ businessTypes: types });
      for (const id of ['today', 'bank', 'books', 'taxes', 'settings']) expect(v).toContain(id);
    }
  });

  it('lands on Sales when there is one, otherwise Today', () => {
    expect(landingDestination(visibleDestinations({ businessTypes: ['invoicing'] }))).toBe('facturation');
    expect(landingDestination(visibleDestinations({ businessTypes: ['register'] }))).toBe('today');
  });
});

describe('FIRSTRUN-001 the list fits the business', () => {
  it('everyone gets the accounting path, in order', () => {
    const k = keys(firstRunItems({ businessTypes: ['invoicing'], lang: 'en' }));
    const path = ['fr_bank_account', 'fr_statement', 'fr_categorize', 'fr_books', 'fr_tax'];
    expect(k.filter(x => path.includes(x))).toEqual(path);
    expect(k[0]).toBe('fr_business');
  });

  it('invoicing adds the first invoice and not the daily close', () => {
    const k = keys(firstRunItems({ businessTypes: ['invoicing'] }));
    expect(k).toContain('fr_invoice');
    expect(k).not.toContain('fr_dayclose');
  });

  it('register adds the daily close and not the first invoice', () => {
    const k = keys(firstRunItems({ businessTypes: ['register'] }));
    expect(k).toContain('fr_dayclose');
    expect(k).not.toContain('fr_invoice');
  });

  it('both gets both', () => {
    const k = keys(firstRunItems({ businessTypes: ['invoicing', 'register'] }));
    expect(k).toContain('fr_invoice');
    expect(k).toContain('fr_dayclose');
  });

  it('uses new keys, so the old restaurant checklist progress does not count', () => {
    for (const k of keys(firstRunItems({}))) expect(k).toMatch(/^fr_/);
  });

  it('reads in both languages', () => {
    const en = firstRunItems({ businessTypes: ['invoicing'], lang: 'en' });
    const fr = firstRunItems({ businessTypes: ['invoicing'], lang: 'fr' });
    expect(en.find(i => i.key === 'fr_statement').label).toBe('Import a bank statement');
    expect(fr.find(i => i.key === 'fr_statement').label).toBe('Importez un relevé bancaire');
  });
});

describe('FIRSTRUN-002 ticked off from real data', () => {
  const done = (items, key) => items.find(i => i.key === key).done;

  it('nothing is done on an empty business', () => {
    const items = firstRunItems({ businessTypes: ['invoicing', 'register'], facts: {} });
    expect(items.every(i => !i.done)).toBe(true);
  });

  it('the bank steps follow the counts', () => {
    const items = firstRunItems({ facts: { bankAccounts: 1, statements: 2, categorized: 3 } });
    expect(done(items, 'fr_bank_account')).toBe(true);
    expect(done(items, 'fr_statement')).toBe(true);
    expect(done(items, 'fr_categorize')).toBe(true);
  });

  it('two categorized lines is not three', () => {
    expect(done(firstRunItems({ facts: { categorized: 2 } }), 'fr_categorize')).toBe(false);
  });

  it('the business step needs a name and an explicit choice, not the default', () => {
    expect(done(firstRunItems({ companyInfo: { nom: 'Acme' }, chosen: false }), 'fr_business')).toBe(false);
    expect(done(firstRunItems({ companyInfo: { nom: '  ' }, chosen: true }), 'fr_business')).toBe(false);
    expect(done(firstRunItems({ companyInfo: { nom: 'Acme' }, chosen: true }), 'fr_business')).toBe(true);
  });

  it('a draft or a proforma is not a first invoice', () => {
    const k = 'fr_invoice';
    expect(done(firstRunItems({ businessTypes: ['invoicing'], factures: [{ statut: 'Brouillon' }] }), k)).toBe(false);
    expect(done(firstRunItems({ businessTypes: ['invoicing'], factures: [{ statut: 'Envoyée', documentType: 'proforma' }] }), k)).toBe(false);
    expect(done(firstRunItems({ businessTypes: ['invoicing'], factures: [{ statut: 'Envoyée' }] }), k)).toBe(true);
  });

  it('the daily close needs real activity, which the caller measures', () => {
    expect(done(firstRunItems({ businessTypes: ['register'], hasDailyData: false }), 'fr_dayclose')).toBe(false);
    expect(done(firstRunItems({ businessTypes: ['register'], hasDailyData: true }), 'fr_dayclose')).toBe(true);
  });

  it('seeing the books is done only by opening them', () => {
    const facts = { bankAccounts: 1, statements: 1, categorized: 9, postedEntries: 40 };
    expect(done(firstRunItems({ facts }), 'fr_books')).toBe(false);
    expect(done(firstRunItems({ facts, progress: { fr_books: { completed: true } } }), 'fr_books')).toBe(true);
  });

  it('the registration step follows the database', () => {
    expect(done(firstRunItems({ facts: { taxRegistration: true } }), 'fr_tax')).toBe(true);
  });
});

describe('FIRSTRUN-003 every item leads somewhere real', () => {
  const APP = read('App.jsx');
  const sectionsBlock = APP.slice(APP.indexOf('const SECTIONS={'), APP.indexOf('const SECTION_IDS='));
  const tabsOf = (section) => {
    const i = sectionsBlock.indexOf(`    ${section}:{`);
    const next = sectionsBlock.slice(i + 1).search(/\n    [a-z]+:\{/);
    const block = next === -1 ? sectionsBlock.slice(i) : sectionsBlock.slice(i, i + 1 + next);
    return [...block.matchAll(/\{id:"([a-z]+)"/g)].map(m => m[1]);
  };

  it('each section target is a real sub-tab of a real section', () => {
    const items = firstRunItems({ businessTypes: ['invoicing', 'register'] });
    for (const { target, key } of items.filter(i => i.target.kind === 'section')) {
      expect(tabsOf(target.section), `${key} -> ${target.section}/${target.tab}`).toContain(target.tab);
    }
  });

  it('the settings target is a real Settings tab, unlike the old "finances"', () => {
    const settings = firstRunItems({}).find(i => i.target.kind === 'settings');
    expect(APP).toMatch(new RegExp(`\\{id:"${settings.target.sub}",\\s*label:`));
    expect(APP).not.toContain('setConfigSubTab("finances")');
  });

  it('each tab target is in the sidebar', () => {
    const SIDEBAR = read('components/Sidebar.jsx');
    for (const { target } of firstRunItems({ businessTypes: ['invoicing'] }).filter(i => i.target.kind === 'tab')) {
      expect(SIDEBAR).toContain(`<NavItem id="${target.tab}"`);
    }
  });
});

describe('FIRSTRUN-004 the counts come from the database', () => {
  const { firstRunFacts } = require('../../db/database.js');
  let db;
  beforeEach(() => { db = buildAccountingDb(); });
  afterEach(() => { db?.close(); db = null; });

  it('an empty book counts nothing', () => {
    const f = firstRunFacts(db);
    expect(f).toMatchObject({ bankAccounts: 0, categorized: 0, postedEntries: 0 });
    expect(typeof f.statements).toBe('number');
    expect(typeof f.taxRegistration).toBe('boolean');
  });

  it('counts bank accounts and categorized lines, and ignores archived accounts', () => {
    db.prepare(`INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type) VALUES ('1010','Cash','Cash','asset')`).run();
    db.prepare(`INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type) VALUES ('6100','Rent','Rent','expense')`).run();
    const cash = db.prepare(`SELECT id FROM chart_of_accounts WHERE account_number='1010'`).get().id;
    const rent = db.prepare(`SELECT id FROM chart_of_accounts WHERE account_number='6100'`).get().id;
    const bank = db.prepare(`INSERT INTO bank_accounts (name, account_type, coa_account_id, opening_balance, opening_date) VALUES ('Chequing','bank',?,0,'2026-01-01')`).run(cash).lastInsertRowid;
    db.prepare(`INSERT INTO bank_accounts (name, account_type, coa_account_id, opening_balance, opening_date, is_archived) VALUES ('Old','bank',?,0,'2026-01-01',1)`).run(cash);
    const add = db.prepare(`INSERT INTO bank_transactions (bank_account_id, transaction_date, description, amount, coa_account_id) VALUES (?,?,?,?,?)`);
    add.run(bank, '2026-02-01', 'a', -10, rent);
    add.run(bank, '2026-02-02', 'b', -20, rent);
    add.run(bank, '2026-02-03', 'c', -30, null);
    const f = firstRunFacts(db);
    expect(f.bankAccounts).toBe(1);
    expect(f.categorized).toBe(2);
  });

  it('a database missing a table still answers the rest', () => {
    db.prepare('DROP TABLE IF EXISTS tax_registration').run();
    expect(() => firstRunFacts(db)).not.toThrow();
    expect(firstRunFacts(db).taxRegistration).toBe(false);
  });
});

describe('FIRSTRUN-005 wired end to end', () => {
  const APP = read('App.jsx');
  const SIDEBAR = read('components/Sidebar.jsx');
  const WIZARD = read('components/OnboardingWizard.jsx');

  it('there is one copy of the checklist rules, not two', () => {
    expect(APP).not.toContain('OB_ITEMS');
    expect(APP).not.toContain('obIsAutoComplete');
    expect(APP).toContain('const obItems=firstRunItems(');
    expect(APP).toContain('<OnboardingChecklist firstRun={obItems}');
  });

  it('the progress bar and the finish button follow the real list', () => {
    expect(APP).not.toContain('(doneCount/6)');
    expect(APP).toContain('onComplete();setActiveTab("today");');
  });

  it('the checklist does not pop up before it knows what is done', () => {
    expect(APP).toContain('!obDismissed&&firstRunFacts!==null');
  });

  it('the daily close is judged by real activity, not by weather-only days', () => {
    expect(APP).toContain('computeDay(k)?.anyData');
  });

  it('the counts reach the renderer', () => {
    expect(read('../main.js')).toContain("ipcMain.handle('onboarding:facts'");
    expect(read('../preload.js')).toContain("facts:    ()    => ipcRenderer.invoke('onboarding:facts')");
  });

  it('the sidebar hides Sales and Operations by type', () => {
    expect(SIDEBAR).toMatch(/businessTypes\.includes\('invoicing'\) \|\| appMode === 'franchiseur'\) && \(\s*\n\s*<NavItem id="facturation"/);
    expect(SIDEBAR).toMatch(/businessTypes\.includes\('register'\) && \([\s\S]{0,200}<NavItem id="operations"/);
    expect(APP).toContain('businessTypes={businessTypes}');
  });

  it('Cash position is register cash, so it goes with Operations', () => {
    expect(APP).toContain('...(hasRegister?[{id:"encaisse"');
  });

  it('nobody is stranded on a screen their type hides', () => {
    expect(APP).toContain('if(!visibleTabs.includes(activeTab))setActiveTab(landingDestination(visibleTabs));');
  });

  it('Settings, Business offers the choice and a way to confirm the default', () => {
    expect(APP).toContain('What kind of sales do you make?');
    expect(APP).toContain('At least one type is required');
    expect(APP).toContain('Confirm this choice');
  });

  it('the wizard asks business type first and only asks restaurant questions when relevant', () => {
    expect(WIZARD).toContain('function StepBusiness(');
    expect(WIZARD).toContain("const steps = ['business', 'info', ...(types.includes('register') ? ['type', 'registers', 'demo'] : []), 'ready'];");
    expect(WIZARD).not.toMatch(/\{step === \d+ && \(</);
  });

  it('the finish screen names screens that exist', () => {
    expect(WIZARD).not.toContain("whereEn: 'Config → Cashiers'");
    expect(WIZARD).not.toContain("whereEn: 'Daily tab'");
    expect(WIZARD).toContain("whereEn: 'Taxes, GST/QST, Registration'");
  });
});
