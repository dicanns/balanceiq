/**
 * CRUMB-001  the trail composes from what each level publishes
 * CRUMB-002  a level withdrawing its part does not disturb the others
 * CRUMB-003  levels do not collide, which is the bug that nearly shipped
 *
 * Phase 1 of the navigation rebuild. The deepest path in the app is four levels
 * of full-screen replacement, and the only way out is two buttons that both say
 * Back and neither says where to. The trail answers the question those buttons
 * never did.
 *
 * Levels publish rather than the shell deriving, because the state lives in
 * different components - activeTab in App, subTab and the open document in
 * FacturationTab. That design has one sharp edge: a child's effect runs before
 * its parent's, so if two levels share a depth the parent's clear wipes the
 * child's trail on every render. Settings publishes at 1 and invoicing at 2 for
 * exactly that reason.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP = readFileSync(join(SRC, 'App.jsx'), 'utf8');
const CRUMBS = readFileSync(join(SRC, 'components', 'Breadcrumbs.jsx'), 'utf8');

// Mirrors the provider's merge: depths in ascending order, flattened.
function compose(byDepth) {
  return Object.keys(byDepth).map(Number).sort((a, b) => a - b).flatMap(d => byDepth[d]);
}
function publish(byDepth, depth, items) {
  const next = { ...byDepth };
  if (!items || items.length === 0) delete next[depth];
  else next[depth] = items;
  return next;
}

describe('CRUMB-001 the trail composes', () => {
  it('one level alone is not a trail', () => {
    const s = publish({}, 0, [{ label: 'Invoicing' }]);
    expect(compose(s)).toHaveLength(1);
  });

  it('levels appear in depth order regardless of publish order', () => {
    let s = {};
    s = publish(s, 2, [{ label: 'Metro' }, { label: 'F-0012' }]);
    s = publish(s, 0, [{ label: 'Invoicing' }]);
    expect(compose(s).map(c => c.label)).toEqual(['Invoicing', 'Metro', 'F-0012']);
  });

  it('the deepest path the app can reach reads as a sentence', () => {
    let s = publish({}, 0, [{ label: 'Invoicing' }]);
    s = publish(s, 2, [
      { label: 'Customers', onClick: () => {} },
      { label: 'Metro', onClick: () => {} },
      { label: 'F-0012' },
    ]);
    expect(compose(s).map(c => c.label)).toEqual(['Invoicing', 'Customers', 'Metro', 'F-0012']);
  });

  it('every crumb but the last can be clicked', () => {
    let s = publish({}, 0, [{ label: 'Invoicing' }]);
    s = publish(s, 2, [{ label: 'Customers', onClick: () => {} }, { label: 'Metro' }]);
    const all = compose(s);
    expect(all[all.length - 1].onClick).toBeUndefined();
  });
});

describe('CRUMB-002 withdrawing is clean', () => {
  it('closing a document shortens the trail without losing the rest', () => {
    let s = publish({}, 0, [{ label: 'Invoicing' }]);
    s = publish(s, 2, [{ label: 'Customers' }, { label: 'Metro' }, { label: 'F-0012' }]);
    s = publish(s, 2, [{ label: 'Customers' }, { label: 'Metro' }]);
    expect(compose(s).map(c => c.label)).toEqual(['Invoicing', 'Customers', 'Metro']);
  });

  it('a level unmounting removes only its own part', () => {
    let s = publish({}, 0, [{ label: 'Invoicing' }]);
    s = publish(s, 2, [{ label: 'Customers' }]);
    s = publish(s, 2, null);                     // FacturationTab unmounts
    expect(compose(s).map(c => c.label)).toEqual(['Invoicing']);
  });

  it('an empty array withdraws, it does not publish a blank crumb', () => {
    let s = publish({}, 1, [{ label: 'Bank' }]);
    s = publish(s, 1, []);
    expect(compose(s)).toEqual([]);
  });

  it('switching tabs replaces the top crumb rather than appending', () => {
    let s = publish({}, 0, [{ label: 'Invoicing' }]);
    s = publish(s, 0, [{ label: 'Settings' }]);
    expect(compose(s).map(c => c.label)).toEqual(['Settings']);
  });
});

describe('CRUMB-003 the levels do not collide', () => {
  it('settings and invoicing publish at different depths', () => {
    // Sharing a depth is the bug: a child effect runs before its parent, so the
    // parent's clear would wipe the child's trail on every render.
    expect(APP).toContain('useBreadcrumb(1,_cfgLabel');
    expect(APP).toContain('useBreadcrumb(2,[');
  });

  it('sharing a depth would have lost the deeper trail', () => {
    let s = publish({}, 2, [{ label: 'Metro' }]);   // child publishes first
    s = publish(s, 2, []);                          // parent clears the same depth
    expect(compose(s)).toEqual([]);                 // the trail is gone
  });

  it('separate depths survive the same sequence', () => {
    let s = publish({}, 2, [{ label: 'Metro' }]);
    s = publish(s, 1, []);
    expect(compose(s).map(c => c.label)).toEqual(['Metro']);
  });
});

describe('CRUMB-004 the bar behaves', () => {
  it('hides itself when there is nothing to navigate back to', () => {
    expect(CRUMBS).toContain('crumbs.length < 2');
  });

  it('marks the current page for screen readers', () => {
    expect(CRUMBS).toContain("aria-current");
    expect(CRUMBS).toMatch(/aria-label=\{lang === 'en' \? 'Breadcrumb'/);
  });

  it('the provider wraps the app, since the app itself publishes', () => {
    expect(APP).toContain('<BreadcrumbProvider><AppInner/></BreadcrumbProvider>');
  });

  it('the bar is rendered once, at the top of the content area', () => {
    expect((APP.match(/<BreadcrumbBar/g) || []).length).toBe(1);
  });
});
