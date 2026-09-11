/**
 * NAVWIRE-001  every nav item leads somewhere
 * NAVWIRE-002  every destination can be reached
 *
 * v1.60.0 shipped with the accounting sections unreachable and Tax Compliance
 * blank. The cause was structural, not a typo: destinations are declared in two
 * places that nothing keeps in sync. Sidebar.jsx renders the buttons, App.jsx
 * renders the content, and there is also a `tabs` array in App.jsx used for the
 * breadcrumb label. Phase 2 added Bank, Books and Taxes to that array and to the
 * render branches, but not to the sidebar - so there were no buttons - and
 * removed the taxconformite render branch while its button stayed, which is the
 * empty screen the user hit.
 *
 * Both halves are silent on their own. A button with no branch renders nothing; a
 * branch with no button is dead code nobody can reach. So this checks the two
 * files against each other, which is the only way either mistake shows up.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP = readFileSync(join(SRC, 'App.jsx'), 'utf8');
const SIDEBAR = readFileSync(join(SRC, 'components', 'Sidebar.jsx'), 'utf8');

// What the sidebar offers.
const navIds = [...SIDEBAR.matchAll(/<NavItem\s+id="([a-z]+)"/g)].map(m => m[1]);

// What App.jsx will actually render. A destination is reachable either through
// its own branch or through the phase-2 section block.
const SECTION_IDS = ['bank', 'books', 'taxes'];
const hasBranch = (id) =>
  APP.includes(`activeTab==="${id}"`) ||
  (SECTION_IDS.includes(id) && APP.includes('["bank","books","taxes"].includes(activeTab)'));

describe('NAVWIRE-001 every nav item leads somewhere', () => {
  it('finds the sidebar destinations', () => {
    expect(navIds.length).toBeGreaterThan(8);
    expect(navIds).toContain('daily');
    expect(navIds).toContain('settings');
  });

  it('every button in the sidebar has something to render', () => {
    const dead = navIds.filter(id => !hasBranch(id));
    expect(dead).toEqual([]);
  });

  it('the accounting sections have buttons, which is what v1.60.0 missed', () => {
    for (const id of SECTION_IDS) expect(navIds).toContain(id);
  });

  it('Tax Compliance has no orphaned button, which is what went blank', () => {
    expect(navIds).not.toContain('taxconformite');
    expect(APP).not.toContain('activeTab==="taxconformite"');
  });
});

describe('NAVWIRE-002 every destination can be reached', () => {
  // Top-level branches in App.jsx, excluding the section block's inner checks.
  const branchIds = [...new Set(
    [...APP.matchAll(/activeTab==="([a-z]+)"/g)].map(m => m[1])
  )].filter(id => !SECTION_IDS.includes(id));

  it('finds the render branches', () => {
    expect(branchIds).toContain('daily');
    expect(branchIds).toContain('settings');
  });

  it('no branch is unreachable dead code', () => {
    const unreachable = branchIds.filter(id => !navIds.includes(id));
    expect(unreachable).toEqual([]);
  });

  it('the breadcrumb label list agrees with the sidebar', () => {
    // App.jsx keeps its own `tabs` array purely to label the top crumb. It is a
    // second list of the same thing, so it drifts unless something checks it.
    const i = APP.indexOf('const tabs=[');
    const arr = APP.slice(i, APP.indexOf('];', i));
    const labelIds = [...arr.matchAll(/\{id:"([a-z]+)"/g)].map(m => m[1]);
    for (const id of labelIds) expect(navIds).toContain(id);
  });

  it('destinations the label list omits still get a crumb from the fallback', () => {
    // facturation and settings are labelled by name rather than from the array.
    expect(APP).toMatch(/activeTab==="facturation"\?T\.tabInvoicing/);
    expect(APP).toMatch(/activeTab==="settings"\?T\.tabConfig/);
  });
});
