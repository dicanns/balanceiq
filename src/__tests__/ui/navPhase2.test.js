/**
 * NAV2-001  the accounting work is out of Settings
 * NAV2-002  every screen that moved still renders somewhere
 * NAV2-003  the old addresses redirect rather than dead-ending
 *
 * Phase 2 of the navigation rebuild. Bank, General Ledger, Chart of Accounts,
 * Balance Sheet, GST/QST, Fixed Assets and Supplier Bills are daily work, and all
 * of them were filed behind a gear icon because that is where there was room when
 * they were built. Settings should hold what you configure once and forget.
 *
 * The risk in a move like this is not the move, it is the leftovers: a screen
 * whose tab is gone but whose render branch remains (invisible forever), or a
 * render branch removed while the tab still points at it (a blank panel). Both
 * are silent. So this checks the two halves against each other rather than
 * trusting either on its own.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP = readFileSync(join(SRC, 'App.jsx'), 'utf8');

// The Settings sub-tab list, as declared.
const settingsTabIds = [...APP.matchAll(/\{id:"([a-z-]+)",\s*label:/g)].map(m => m[1]);

const MOVED_OUT = [
  'banque', 'facturesfourn', 'grandlivre', 'comptabilite', 'bilan', 'taxperiod', 'immobilisations',
];

describe('NAV2-001 the accounting work is out of Settings', () => {
  it('none of the moved screens is still a Settings sub-tab', () => {
    const stillThere = MOVED_OUT.filter(id => APP.includes(`{id:"${id}",`) &&
      new RegExp(`\\{id:"${id}",\\s+label:lang`).test(APP));
    expect(stillThere).toEqual([]);
  });

  it('Bank, Books and Taxes are top-level destinations', () => {
    for (const id of ['bank', 'books', 'taxes']) {
      expect(APP).toContain(`{id:"${id}",label:SECTIONS.${id}.label}`);
    }
  });

  it('Tax Compliance is no longer its own top-level tab', () => {
    expect(APP).not.toMatch(/\{id:"taxconformite",label:/);
  });

  it('and its old render branch is gone with it, not left orphaned', () => {
    expect(APP).not.toContain('activeTab==="taxconformite"');
  });

  it('Settings keeps what is genuinely configuration', () => {
    for (const id of ['entreprise', 'integrations', 'coffre', 'donnees', 'application']) {
      expect(settingsTabIds).toContain(id);
    }
  });
});

describe('NAV2-002 every screen that moved still renders', () => {
  const RENDERS = [
    ['bank',  'comptes',         'BanqueTabLazy'],
    ['bank',  'fournisseurs',    'BillsTabLazy'],
    ['books', 'grandlivre',      'GrandLivreTabLazy'],
    ['books', 'comptabilite',    'ChartOfAccountsTabLazy'],
    ['books', 'bilan',           'BilanTabLazy'],
    ['taxes', 'taxperiod',       'TaxPeriodTabLazy'],
    ['taxes', 'immobilisations', 'ImmobilisationsTabLazy'],
    ['taxes', 'conformite',      'ComplianceTabLazy'],
  ];

  it.each(RENDERS)('%s / %s renders %s', (section, tab, component) => {
    expect(APP).toContain(`activeTab==="${section}"&&cur==="${tab}"&&<${component}`);
  });

  it('every declared sub-tab has a render branch, so none is a dead button', () => {
    const declared = [...APP.matchAll(/\{id:"([a-z]+)",\s+label: lang==="fr"/g)].map(m => m[1]);
    for (const id of declared) {
      expect(APP).toContain(`cur==="${id}"&&<`);
    }
  });

  it('each section remembers its own sub-tab independently', () => {
    expect(APP).toContain('sectionTab,setSectionTab');
    expect(APP).toMatch(/\{bank:"comptes",books:"grandlivre",taxes:"taxperiod"\}/);
  });
});

describe('NAV2-003 the old addresses redirect', () => {
  it('every moved screen has a forwarding entry', () => {
    for (const id of MOVED_OUT) {
      expect(APP).toMatch(new RegExp(`${id}:\\s*\\[`));
    }
  });

  it('each forwards to a section that exists', () => {
    const pairs = [...APP.matchAll(/^\s{4}([a-z]+):\s*\["(bank|books|taxes)","([a-z]+)"\],$/gm)];
    expect(pairs.length).toBe(MOVED_OUT.length);
    for (const [, , section, tab] of pairs) {
      expect(APP).toContain(`activeTab==="${section}"&&cur==="${tab}"&&<`);
    }
  });

  it('landing on an old address moves you and says so', () => {
    expect(APP).toContain('setMovedNotice');
    expect(APP).toMatch(/moved here, out of Settings/);
  });

  it('the notice can be dismissed rather than nagging', () => {
    expect(APP).toContain('setMovedNotice(null)');
  });

  it('the redirect clears the stale sub-tab, so it cannot fire twice', () => {
    expect(APP).toMatch(/setConfigSubTab\("entreprise"\);\s*\n\s*goSection\(section,tab\);/);
  });
});
