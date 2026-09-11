import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';

// ── BREADCRUMBS ──────────────────────────────────────────────────────────────
// Phase 1 of the navigation rebuild, and the piece that has to come first: it is
// purely additive, and it makes every later move visible instead of disorienting.
//
// The deepest path in the app is four levels of full-screen replacement, and the
// only way out is two buttons that both say Back and neither says where to. A
// trail answers the question those buttons never did - where am I - and it
// replaces both of them.
//
// Levels publish rather than the shell deriving, because the state lives in
// different components: activeTab is held by App, subTab and the open document by
// FacturationTab. Asking each to say where it is costs one hook call and needs no
// state lifted out of an 8,000-line file.

const Ctx = createContext(null);

export function BreadcrumbProvider({ children }) {
  // depth -> [{ label, onClick }]. A map rather than an array so a level can
  // publish and withdraw without knowing what sits above or below it.
  const [byDepth, setByDepth] = useState({});

  const publish = useCallback((depth, items) => {
    setByDepth(prev => {
      const next = { ...prev };
      if (!items || items.length === 0) delete next[depth];
      else next[depth] = items;
      return next;
    });
  }, []);

  const crumbs = useMemo(() => Object.keys(byDepth)
    .map(Number).sort((a, b) => a - b)
    .flatMap(d => byDepth[d]), [byDepth]);

  const value = useMemo(() => ({ crumbs, publish }), [crumbs, publish]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Publish this screen's part of the trail.
 *
 *   useBreadcrumb(1, [{ label: 'Customers', onClick: back }, { label: client.nom }], [client]);
 *
 * The last crumb overall is the current place and is rendered inert, so a screen
 * does not need to know whether it is the deepest one.
 */
export function useBreadcrumb(depth, items, deps = []) {
  const ctx = useContext(Ctx);
  const publish = ctx?.publish;
  // Items are rebuilt every render, so the dependency list the caller gives is
  // what decides when the trail actually changes. Without that this publishes on
  // every render and loops.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const memo = useMemo(() => items, deps);

  useEffect(() => {
    if (!publish) return undefined;
    publish(depth, memo);
    return () => publish(depth, null);
  }, [publish, depth, memo]);
}

export function BreadcrumbBar({ lang = 'fr', theme }) {
  const ctx = useContext(Ctx);
  const crumbs = ctx?.crumbs || [];
  if (crumbs.length < 2) return null;   // a single crumb is a page title, not a trail

  const t = theme || {};
  const muted = t.textMuted || '#64748b';
  const text = t.text || '#e2e8f0';
  const border = t.dividerMid || t.cardBorder || '#2d3148';

  return (
    <nav aria-label={lang === 'en' ? 'Breadcrumb' : 'Fil d\'Ariane'}
      style={{
        display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2,
        padding: '7px 0 9px', marginBottom: 12, borderBottom: `1px solid ${border}`,
        fontSize: 12, lineHeight: 1.4,
      }}>
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        return (
          <React.Fragment key={`${i}-${c.label}`}>
            {i > 0 && <span aria-hidden="true" style={{ color: muted, opacity: 0.55, padding: '0 5px' }}>›</span>}
            {last || !c.onClick ? (
              <span aria-current={last ? 'page' : undefined}
                style={{ color: last ? text : muted, fontWeight: last ? 600 : 400 }}>
                {c.label}
              </span>
            ) : (
              <button type="button" onClick={c.onClick}
                style={{
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                  color: muted, fontSize: 12, fontFamily: 'inherit', lineHeight: 1.4,
                  textDecoration: 'none',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = '#f97316'; }}
                onMouseLeave={e => { e.currentTarget.style.color = muted; }}>
                {c.label}
              </button>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
