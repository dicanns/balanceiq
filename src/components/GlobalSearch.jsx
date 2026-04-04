import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';

// ── helpers ────────────────────────────────────────────────────────────────
const fmt = (n) => {
  if (n == null) return '';
  return Number(n).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });
};

function scoreMatch(query, text) {
  if (!text) return 0;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t === q) return 1;
  if (t.startsWith(q)) return 0.9;
  if (t.includes(q)) return 0.7;
  // Fuzzy: all chars of query appear in order in text
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++;
  }
  return qi === q.length ? 0.4 : 0;
}

function HighlightedText({ text, query }) {
  if (!text || !query) return <span>{text || ''}</span>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <span>{text}</span>;
  return (
    <span>
      {text.slice(0, idx)}
      <mark style={{ background: 'rgba(249,115,22,0.3)', color: 'inherit', borderRadius: 2, padding: '0 1px' }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </span>
  );
}

// ── Navigation items (hardcoded, bilingual) ───────────────────────────────
const NAV_ITEMS = [
  { id: 'tab-daily',        label: 'Quotidien',     labelEn: 'Daily',         tab: 'daily',        icon: '📋' },
  { id: 'tab-monthly',      label: 'P&L',           labelEn: 'P&L',           tab: 'monthly',      icon: '📊' },
  { id: 'tab-encaisse',     label: 'Encaisse',      labelEn: 'Cash Position', tab: 'encaisse',     icon: '💵' },
  { id: 'tab-facturation',  label: 'Facturation',   labelEn: 'Invoicing',     tab: 'facturation',  icon: '🧾' },
  { id: 'tab-recettes',     label: 'Coûts & Recettes', labelEn: 'Costs & Recipes', tab: 'recettes', icon: '🍽️' },
  { id: 'tab-previsions',   label: 'Prévisions',    labelEn: 'Forecasting',   tab: 'previsions',   icon: '📈' },
  { id: 'tab-intelligence', label: 'Intelligence',  labelEn: 'Intelligence',  tab: 'intelligence', icon: '🧠' },
  { id: 'tab-waste',        label: 'Gaspillage',    labelEn: 'Waste',         tab: 'waste',        icon: '♻️' },
  { id: 'tab-settings',     label: 'Configuration', labelEn: 'Settings',      tab: 'settings',     icon: '⚙️' },
];

const ACTION_ITEMS = [
  { id: 'action-new-invoice',   label: 'Nouvelle facture',         labelEn: 'New invoice',      tab: 'facturation', action: 'new-invoice',   icon: '⚡' },
  { id: 'action-close-day',     label: 'Fermer la journée',        labelEn: 'Close the day',    tab: 'daily',       action: 'close-day',     icon: '⚡' },
  { id: 'action-new-client',    label: 'Nouveau client',           labelEn: 'New client',       tab: 'facturation', action: 'new-client',    icon: '⚡' },
  { id: 'action-add-supplier',  label: 'Ajouter un fournisseur',   labelEn: 'Add supplier',     tab: 'monthly',     action: 'add-supplier',  icon: '⚡' },
  { id: 'action-monthly-pl',    label: 'Rapport mensuel P&L',      labelEn: 'Monthly P&L report', tab: 'monthly',   action: null,            icon: '⚡' },
  { id: 'action-tip-pool',      label: 'Répartition des pourboires', labelEn: 'Tip pool',       tab: 'daily',       action: 'tip-pool',      icon: '⚡' },
];

function getNavResults(query, lang) {
  if (!query) return [];
  return NAV_ITEMS
    .map(item => {
      const score = Math.max(
        scoreMatch(query, item.label),
        scoreMatch(query, item.labelEn)
      );
      return score > 0 ? { ...item, _score: score } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b._score - a._score)
    .slice(0, 4);
}

function getActionResults(query, lang) {
  if (!query) return ACTION_ITEMS.slice(0, 3); // pinned at zero state
  return ACTION_ITEMS
    .map(item => {
      const score = Math.max(
        scoreMatch(query, item.label),
        scoreMatch(query, item.labelEn)
      );
      return score > 0 ? { ...item, _score: score } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b._score - a._score)
    .slice(0, 3);
}

// ── Styles ────────────────────────────────────────────────────────────────
const getStyles = (isDark) => ({
  overlay: {
    position: 'fixed', inset: 0, zIndex: 9999,
    background: 'rgba(0,0,0,0.45)',
    backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
    paddingTop: '10vh',
  },
  modal: {
    width: 640, maxWidth: 'calc(100vw - 32px)',
    background: isDark ? '#1a1d27' : '#ffffff',
    border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
    borderRadius: 12,
    boxShadow: '0 25px 50px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)',
    overflow: 'hidden',
    maxHeight: '70vh',
    display: 'flex', flexDirection: 'column',
  },
  inputWrap: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '12px 16px',
    borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'}`,
    flexShrink: 0,
  },
  input: {
    flex: 1, background: 'none', border: 'none', outline: 'none',
    fontSize: 16, fontWeight: 500,
    color: isDark ? '#f1f3f9' : '#111',
    fontFamily: "'Satoshi',-apple-system,BlinkMacSystemFont,sans-serif",
  },
  results: {
    overflowY: 'auto', flex: 1,
    padding: '6px 0',
  },
  groupLabel: {
    padding: '6px 16px 3px',
    fontSize: 10, fontWeight: 700, letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.38)',
  },
  resultItem: (selected) => ({
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '7px 16px',
    cursor: 'pointer',
    background: selected
      ? (isDark ? 'rgba(249,115,22,0.15)' : 'rgba(249,115,22,0.10)')
      : 'transparent',
    borderLeft: selected ? '3px solid #f97316' : '3px solid transparent',
    transition: 'background 80ms',
  }),
  itemIcon: {
    fontSize: 14, width: 20, textAlign: 'center', flexShrink: 0,
  },
  itemMain: {
    flex: 1, minWidth: 0,
    fontSize: 13, color: isDark ? '#e8eaf0' : '#222',
    fontFamily: "'Satoshi',-apple-system,BlinkMacSystemFont,sans-serif",
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  itemSub: {
    fontSize: 11, color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)',
    marginLeft: 4,
  },
  itemHint: {
    fontSize: 10, color: isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.3)',
    flexShrink: 0, fontWeight: 500,
  },
  footer: {
    padding: '7px 16px',
    borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'}`,
    display: 'flex', gap: 14, alignItems: 'center',
    flexShrink: 0,
  },
  footerKey: {
    fontSize: 10, color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)',
    fontFamily: 'monospace',
    background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
    borderRadius: 3, padding: '1px 5px',
  },
  emptyMsg: {
    padding: '24px 16px', textAlign: 'center',
    fontSize: 12, color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)',
  },
});

// ── ResultGroup ───────────────────────────────────────────────────────────
function ResultGroup({ label, items, selectedIndex, onSelect, onHover, indexOffset, query, styles }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <div style={styles.groupLabel}>{label}</div>
      {items.map((item, i) => {
        const globalIdx = indexOffset + i;
        const selected = globalIdx === selectedIndex;
        return (
          <div
            key={item._key || item.id || i}
            data-result-index={globalIdx}
            style={styles.resultItem(selected)}
            onMouseEnter={() => onHover(globalIdx)}
            onClick={() => onSelect(item)}
          >
            <span style={styles.itemIcon}>{item._icon}</span>
            <span style={styles.itemMain}>
              <HighlightedText text={item._label} query={query} />
              {item._sub && <span style={styles.itemSub}>— <HighlightedText text={item._sub} query={query} /></span>}
            </span>
            {item._hint && <span style={styles.itemHint}>{item._hint} ↗</span>}
          </div>
        );
      })}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────
export default function GlobalSearch({ isOpen, onClose, onNavigate, lang = 'fr', isDark = true }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState({});
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  const T = lang === 'en';

  const styles = useMemo(() => getStyles(isDark), [isDark]);

  // Auto-focus on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setResults({});
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
      // Load history
      if (window.api?.search) {
        window.api.search.global({ query: '' }).then(r => {
          setHistory(r.history || []);
        }).catch(() => {});
      }
    }
  }, [isOpen]);

  // Debounced search
  useEffect(() => {
    if (!isOpen) return;
    clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults({}); setSelectedIndex(0); return; }
    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const r = await window.api.search.global({ query: query.trim(), limit: 5 });
        setResults(r.results || {});
        setSelectedIndex(0);
      } catch (_) {}
      setIsLoading(false);
    }, 150);
    return () => clearTimeout(debounceRef.current);
  }, [query, isOpen]);

  // Build flat list of all result items for keyboard nav
  const flatResults = useMemo(() => {
    const items = [];
    const q = query.trim();

    // Actions
    getActionResults(q, lang).forEach(a => {
      items.push({ _type: 'action', _icon: a.icon, _label: T ? a.labelEn : a.label, _hint: null, _key: a.id, ...a });
    });

    // Clients
    (results.clients || []).forEach(c => {
      items.push({ _type: 'client', _icon: '👤', _label: c.entreprise, _sub: c.ville || c.courriel || null, _hint: T ? 'Invoicing' : 'Facturation', _key: `cl-${c.id}`, ...c });
    });

    // Invoices
    (results.invoices || []).forEach(f => {
      const typeLabel = f.type === 'soumission' ? (T ? 'Quote' : 'Soumission') : f.type === 'commande' ? (T ? 'Order' : 'Commande') : (T ? 'Invoice' : 'Facture');
      items.push({ _type: 'invoice', _icon: '🧾', _label: `${f.numero}`, _sub: `${f.clientName}${f.total ? ' · ' + fmt(f.total) : ''}`, _hint: T ? 'Invoicing' : 'Facturation', _key: `fac-${f.id}`, _typeLabel: typeLabel, ...f });
    });

    // Suppliers
    (results.suppliers || []).forEach(s => {
      items.push({ _type: 'supplier', _icon: '🏭', _label: s.name, _sub: s.category || null, _hint: 'P&L', _key: `sup-${s.key}`, ...s });
    });

    // Employees
    (results.employees || []).forEach(e => {
      items.push({ _type: 'employee', _icon: '👷', _label: e.nom, _sub: e.role || null, _hint: T ? 'Daily' : 'Quotidien', _key: `emp-${e.id}`, ...e });
    });

    // Ingredients
    (results.ingredients || []).forEach(i => {
      const price = i.current_unit_price ? ` · ${fmt(i.current_unit_price)}/${i.default_unit}` : '';
      items.push({ _type: 'ingredient', _icon: '🥩', _label: T ? (i.name_en || i.name_fr) : i.name_fr, _sub: i.category ? `${i.category}${price}` : null, _hint: T ? 'Costs' : 'Recettes', _key: `ing-${i.id}`, ...i });
    });

    // Forecast products
    (results.forecastProducts || []).forEach(p => {
      items.push({ _type: 'forecast', _icon: '📈', _label: p.name, _sub: p.category || null, _hint: T ? 'Forecast' : 'Prévisions', _key: `fp-${p.id}`, ...p });
    });

    // Navigation
    getNavResults(q, lang).forEach(n => {
      items.push({ _type: 'nav', _icon: n.icon, _label: T ? n.labelEn : n.label, _hint: null, _key: n.id, ...n });
    });

    return items;
  }, [results, query, lang, T]);

  // Split for display — map flat items back to groups
  const groups = useMemo(() => {
    const q = query.trim();
    const actions = getActionResults(q, lang).map(a => ({
      ...a, _type: 'action', _icon: a.icon, _label: T ? a.labelEn : a.label, _hint: null, _key: a.id,
    }));
    const clients = (results.clients || []).map(c => ({ _type: 'client', _icon: '👤', _label: c.entreprise, _sub: c.ville || c.courriel || null, _hint: T ? 'Invoicing' : 'Facturation', _key: `cl-${c.id}`, ...c }));
    const invoices = (results.invoices || []).map(f => ({ _type: 'invoice', _icon: '🧾', _label: f.numero, _sub: `${f.clientName}${f.total ? ' · ' + fmt(f.total) : ''}`, _hint: T ? 'Invoicing' : 'Facturation', _key: `fac-${f.id}`, ...f }));
    const suppliers = (results.suppliers || []).map(s => ({ _type: 'supplier', _icon: '🏭', _label: s.name, _sub: s.category || null, _hint: 'P&L', _key: `sup-${s.key}`, ...s }));
    const employees = (results.employees || []).map(e => ({ _type: 'employee', _icon: '👷', _label: e.nom, _sub: e.role || null, _hint: T ? 'Daily' : 'Quotidien', _key: `emp-${e.id}`, ...e }));
    const ingredients = (results.ingredients || []).map(i => ({ _type: 'ingredient', _icon: '🥩', _label: T ? (i.name_en || i.name_fr) : i.name_fr, _sub: i.category || null, _hint: T ? 'Costs' : 'Recettes', _key: `ing-${i.id}`, ...i }));
    const nav = getNavResults(q, lang).map(n => ({ ...n, _type: 'nav', _icon: n.icon, _label: T ? n.labelEn : n.label, _hint: null, _key: n.id }));
    return { actions, clients, invoices, suppliers, employees, ingredients, nav };
  }, [results, query, lang, T]);

  // Scroll selected item into view
  useEffect(() => {
    const el = document.querySelector(`[data-result-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // Keyboard handler
  const handleKeyDown = useCallback((e) => {
    if (!isOpen) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, flatResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (flatResults[selectedIndex]) selectResult(flatResults[selectedIndex]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  }, [isOpen, selectedIndex, flatResults, onClose]);

  const selectResult = useCallback((item) => {
    if (!item) return;

    // Save to history
    if (query.trim() && window.api?.search) {
      window.api.search.saveHistory({ query: query.trim(), result_type: item._type, result_id: String(item.id || item._key || '') }).catch(() => {});
    }

    onClose();

    switch (item._type) {
      case 'action':
        onNavigate(item.tab, { action: item.action });
        break;
      case 'nav':
        onNavigate(item.tab, {});
        break;
      case 'client':
        onNavigate('facturation', { clientId: item.id });
        break;
      case 'invoice':
        onNavigate('facturation', { invoiceId: item.id });
        break;
      case 'supplier':
        onNavigate('monthly', {});
        break;
      case 'employee':
        onNavigate('daily', {});
        break;
      case 'ingredient':
        onNavigate('recettes', {});
        break;
      case 'forecast':
        onNavigate('previsions', {});
        break;
      default:
        if (item.tab) onNavigate(item.tab, {});
    }
  }, [query, onClose, onNavigate]);

  if (!isOpen) return null;

  const hasQuery = query.trim().length > 0;
  const hasResults = hasQuery && flatResults.length > 0;
  const showEmpty = hasQuery && !isLoading && flatResults.length === 0;

  // Compute index offsets per group for keyboard nav mapping
  let offset = 0;
  const offsets = {};
  for (const key of ['actions', 'clients', 'invoices', 'suppliers', 'employees', 'ingredients', 'nav']) {
    offsets[key] = offset;
    offset += (groups[key] || []).length;
  }

  return (
    <div style={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={styles.modal} onKeyDown={handleKeyDown}>
        {/* Search input */}
        <div style={styles.inputWrap}>
          <span style={{ fontSize: 16, opacity: 0.4 }}>🔍</span>
          <input
            ref={inputRef}
            style={styles.input}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={T ? 'Search BalanceIQ…' : 'Rechercher dans BalanceIQ…'}
            autoComplete="off"
            spellCheck={false}
          />
          {isLoading && <span style={{ fontSize: 11, opacity: 0.4 }}>…</span>}
          <kbd style={{ fontSize: 10, opacity: 0.35, background: 'rgba(128,128,128,0.15)', borderRadius: 4, padding: '2px 5px', fontFamily: 'monospace' }}>Esc</kbd>
        </div>

        {/* Results */}
        <div style={styles.results}>
          {!hasQuery && (
            <div>
              {/* Zero state: pinned actions */}
              <ResultGroup
                label={T ? 'QUICK ACTIONS' : 'ACTIONS RAPIDES'}
                items={groups.actions}
                selectedIndex={selectedIndex}
                onSelect={selectResult}
                onHover={setSelectedIndex}
                indexOffset={offsets.actions}
                query={query}
                styles={styles}
              />
              {/* Recent searches */}
              {history.length > 0 && (
                <div>
                  <div style={styles.groupLabel}>{T ? 'RECENT' : 'RÉCENT'}</div>
                  {history.map((h, i) => (
                    <div
                      key={h.id}
                      style={{ ...styles.resultItem(false), opacity: 0.7 }}
                      onClick={() => setQuery(h.query)}
                    >
                      <span style={styles.itemIcon}>🕐</span>
                      <span style={styles.itemMain}>{h.query}</span>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ padding: '12px 16px', fontSize: 11, opacity: 0.3, textAlign: 'center' }}>
                {T ? 'Type to search clients, invoices, employees, ingredients…' : 'Tapez pour chercher clients, factures, employés, ingrédients…'}
              </div>
            </div>
          )}

          {hasQuery && (
            <>
              <ResultGroup label={T ? 'ACTIONS' : 'ACTIONS'} items={groups.actions} selectedIndex={selectedIndex} onSelect={selectResult} onHover={setSelectedIndex} indexOffset={offsets.actions} query={query} styles={styles} />
              <ResultGroup label={T ? 'CLIENTS' : 'CLIENTS'} items={groups.clients} selectedIndex={selectedIndex} onSelect={selectResult} onHover={setSelectedIndex} indexOffset={offsets.clients} query={query} styles={styles} />
              <ResultGroup label={T ? 'INVOICES / QUOTES' : 'FACTURES / SOUMISSIONS'} items={groups.invoices} selectedIndex={selectedIndex} onSelect={selectResult} onHover={setSelectedIndex} indexOffset={offsets.invoices} query={query} styles={styles} />
              <ResultGroup label={T ? 'SUPPLIERS' : 'FOURNISSEURS'} items={groups.suppliers} selectedIndex={selectedIndex} onSelect={selectResult} onHover={setSelectedIndex} indexOffset={offsets.suppliers} query={query} styles={styles} />
              <ResultGroup label={T ? 'EMPLOYEES' : 'EMPLOYÉS'} items={groups.employees} selectedIndex={selectedIndex} onSelect={selectResult} onHover={setSelectedIndex} indexOffset={offsets.employees} query={query} styles={styles} />
              <ResultGroup label={T ? 'INGREDIENTS' : 'INGRÉDIENTS'} items={groups.ingredients} selectedIndex={selectedIndex} onSelect={selectResult} onHover={setSelectedIndex} indexOffset={offsets.ingredients} query={query} styles={styles} />
              <ResultGroup label={T ? 'NAVIGATION' : 'NAVIGATION'} items={groups.nav} selectedIndex={selectedIndex} onSelect={selectResult} onHover={setSelectedIndex} indexOffset={offsets.nav} query={query} styles={styles} />
            </>
          )}

          {showEmpty && (
            <div style={styles.emptyMsg}>
              {T ? `No results for "${query}"` : `Aucun résultat pour « ${query} »`}
            </div>
          )}
        </div>

        {/* Footer keyboard hints */}
        <div style={styles.footer}>
          <span><kbd style={styles.footerKey}>↑↓</kbd> <span style={{ fontSize: 10, opacity: 0.4 }}>{T ? 'navigate' : 'naviguer'}</span></span>
          <span><kbd style={styles.footerKey}>↵</kbd> <span style={{ fontSize: 10, opacity: 0.4 }}>{T ? 'select' : 'sélectionner'}</span></span>
          <span><kbd style={styles.footerKey}>Esc</kbd> <span style={{ fontSize: 10, opacity: 0.4 }}>{T ? 'close' : 'fermer'}</span></span>
          <span style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.25 }}>⌘K / Ctrl+K</span>
        </div>
      </div>
    </div>
  );
}
