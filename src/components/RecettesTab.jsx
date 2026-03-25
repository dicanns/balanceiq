import React, { useState, useEffect, useMemo, useCallback } from 'react';

// ── Levenshtein distance for fuzzy matching ──────────────────────────────────
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j-1], dp[i-1][j], dp[i][j-1]);
  return dp[m][n];
}

// Fuzzy match: returns best ingredient match if distance < threshold
function fuzzyMatch(description, ingredients, threshold = 4) {
  const d = description.toLowerCase().trim();
  let best = null, bestDist = threshold;
  for (const ing of ingredients) {
    const targets = [ing.name_fr, ing.name_en].filter(Boolean);
    for (const t of targets) {
      const dist = levenshtein(d, t.toLowerCase().trim());
      if (dist < bestDist) { best = ing; bestDist = dist; }
    }
  }
  return best;
}

const CATEGORIES = [
  { value: 'protein',   fr: 'Protéines',      en: 'Proteins' },
  { value: 'dairy',     fr: 'Produits laitiers', en: 'Dairy' },
  { value: 'produce',   fr: 'Fruits & légumes', en: 'Produce' },
  { value: 'dry',       fr: 'Épicerie sèche',  en: 'Dry Goods' },
  { value: 'bakery',    fr: 'Boulangerie',     en: 'Bakery' },
  { value: 'packaging', fr: 'Emballage',       en: 'Packaging' },
  { value: 'cleaning',  fr: 'Nettoyage',       en: 'Cleaning' },
  { value: 'beverage',  fr: 'Boissons',        en: 'Beverages' },
  { value: 'other',     fr: 'Autre',           en: 'Other' },
];
const UNITS = ['kg', 'lb', 'g', 'oz', 'L', 'mL', 'case', 'each', 'dz', 'box', 'bag', 'can'];
const RECIPE_CATS = [
  { value: 'main',    fr: 'Plat principal', en: 'Main' },
  { value: 'side',    fr: 'Accompagnement', en: 'Side' },
  { value: 'sauce',   fr: 'Sauce',          en: 'Sauce' },
  { value: 'dessert', fr: 'Dessert',        en: 'Dessert' },
  { value: 'beverage',fr: 'Boisson',        en: 'Beverage' },
  { value: 'other',   fr: 'Autre',          en: 'Other' },
];

function catLabel(value, lang) {
  const c = CATEGORIES.find(x => x.value === value);
  return c ? (lang === 'en' ? c.en : c.fr) : value;
}
function recipeCatLabel(value, lang) {
  const c = RECIPE_CATS.find(x => x.value === value);
  return c ? (lang === 'en' ? c.en : c.fr) : value;
}
function fmt(n) { return n == null ? '—' : `$${Number(n).toFixed(2)}`; }
function fmtDate(d) { if (!d) return '—'; const dt = new Date(d); return isNaN(dt)?d:dt.toLocaleDateString('fr-CA'); }

// ── Small shared components ───────────────────────────────────────────────────
function Badge({ color, children }) {
  const colors = {
    green:  { bg: 'rgba(34,197,94,0.12)',   border: 'rgba(34,197,94,0.3)',   text: '#16a34a' },
    yellow: { bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.35)', text: '#d97706' },
    red:    { bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.3)',   text: '#dc2626' },
    orange: { bg: 'rgba(249,115,22,0.12)',  border: 'rgba(249,115,22,0.3)',  text: '#ea580c' },
    blue:   { bg: 'rgba(99,102,241,0.12)',  border: 'rgba(99,102,241,0.3)',  text: '#6366f1' },
    gray:   { bg: 'rgba(107,114,128,0.12)', border: 'rgba(107,114,128,0.3)', text: '#6b7280' },
  };
  const c = colors[color] || colors.gray;
  return <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 8,
    background: c.bg, border: `1px solid ${c.border}`, color: c.text, whiteSpace: 'nowrap' }}>{children}</span>;
}

// ── INGREDIENTS (Products) Tab ───────────────────────────────────────────────
function IngredientsTab({ t, T, lang, ingredients, setIngredients }) {
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [editing, setEditing] = useState(null); // null | ingredient obj
  const [showAliases, setShowAliases] = useState(null); // ingredient id
  const [aliases, setAliases] = useState([]);
  const [newAlias, setNewAlias] = useState('');
  const [priceHistory, setPriceHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(null); // ingredient id

  const empty = { name_fr: '', name_en: '', category: 'protein', default_unit: 'kg', current_unit_price: '', supplier_id: '', sku: '', notes: '', active: 1 };

  const filtered = useMemo(() => {
    let list = ingredients;
    if (catFilter) list = list.filter(i => i.category === catFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(i => i.name_fr.toLowerCase().includes(s) || (i.name_en || '').toLowerCase().includes(s));
    }
    return list;
  }, [ingredients, search, catFilter]);

  const reload = useCallback(async () => {
    const rows = await window.api.ingredients.getAll();
    setIngredients(rows);
  }, [setIngredients]);

  const save = async () => {
    if (!editing?.name_fr?.trim()) return;
    const p = { ...editing, current_unit_price: editing.current_unit_price !== '' ? Number(editing.current_unit_price) : null };
    await window.api.ingredients.save(p);
    await reload();
    setEditing(null);
  };

  const del = async (id) => {
    if (!window.confirm(lang === 'en' ? 'Delete this ingredient?' : 'Supprimer cet ingrédient ?')) return;
    await window.api.ingredients.delete(id);
    await reload();
  };

  const openAliases = async (id) => {
    setShowAliases(id);
    const rows = await window.api.ingredients.aliasesGet(id);
    setAliases(rows);
  };

  const addAlias = async (ingredientId) => {
    if (!newAlias.trim()) return;
    await window.api.ingredients.aliasSave({ ingredient_id: ingredientId, alias: newAlias.trim(), supplier_id: '', match_count: 0 });
    const rows = await window.api.ingredients.aliasesGet(ingredientId);
    setAliases(rows);
    setNewAlias('');
  };

  const removeAlias = async (aliasId, ingredientId) => {
    await window.api.ingredients.aliasDelete(aliasId);
    const rows = await window.api.ingredients.aliasesGet(ingredientId);
    setAliases(rows);
  };

  const openHistory = async (id) => {
    setShowHistory(id);
    const rows = await window.api.priceHistory.get(id);
    setPriceHistory(rows);
  };

  const inp = { background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 6, color: t.text, fontSize: 12, padding: '6px 9px', outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: "'Outfit',sans-serif" };
  const sel = { ...inp, appearance: 'none' };

  if (showAliases !== null) {
    const ing = ingredients.find(i => i.id === showAliases);
    return (
      <div>
        <button onClick={() => setShowAliases(null)} style={{ background: 'none', border: 'none', color: '#f97316', cursor: 'pointer', fontSize: 12, marginBottom: 12, fontWeight: 600 }}>← {lang === 'en' ? 'Back' : 'Retour'}</button>
        <div style={{ background: t.card, border: `1px solid ${t.cardBorder}`, borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 4 }}>
            {lang === 'en' ? 'Aliases for' : 'Alias pour'}: <span style={{ color: '#f97316' }}>{ing?.name_fr}</span>
          </div>
          <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 12 }}>
            {lang === 'en' ? 'These are alternative names used on invoices that will be auto-matched to this ingredient.' : 'Noms alternatifs utilisés sur les factures qui seront automatiquement associés à cet ingrédient.'}
          </div>
          {aliases.map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: t.section, borderRadius: 6, padding: '7px 10px', marginBottom: 5 }}>
              <span style={{ flex: 1, fontSize: 12, color: t.text }}>{a.alias}</span>
              {a.supplier_id && <Badge color="blue">{a.supplier_id}</Badge>}
              <Badge color="gray">{a.match_count}×</Badge>
              <button onClick={() => removeAlias(a.id, showAliases)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12 }}>✕</button>
            </div>
          ))}
          {aliases.length === 0 && <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 10 }}>{lang === 'en' ? 'No aliases yet.' : 'Aucun alias.'}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <input style={{ ...inp, flex: 1 }} value={newAlias} onChange={e => setNewAlias(e.target.value)}
              placeholder={lang === 'en' ? 'e.g. GRND BEEF 80/20' : 'Ex: BOEUF HACHE 80/20'}
              onKeyDown={e => e.key === 'Enter' && addAlias(showAliases)} />
            <button onClick={() => addAlias(showAliases)} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: 'linear-gradient(135deg,#f97316,#ea580c)', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              + {lang === 'en' ? 'Add' : 'Ajouter'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (showHistory !== null) {
    const ing = ingredients.find(i => i.id === showHistory);
    return (
      <div>
        <button onClick={() => setShowHistory(null)} style={{ background: 'none', border: 'none', color: '#f97316', cursor: 'pointer', fontSize: 12, marginBottom: 12, fontWeight: 600 }}>← {lang === 'en' ? 'Back' : 'Retour'}</button>
        <div style={{ background: t.card, border: `1px solid ${t.cardBorder}`, borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 12 }}>
            📈 {lang === 'en' ? 'Price history for' : 'Historique des prix —'} {ing?.name_fr}
          </div>
          {priceHistory.length === 0
            ? <div style={{ fontSize: 11, color: t.textMuted }}>{lang === 'en' ? 'No price history yet.' : 'Aucun historique de prix.'}</div>
            : <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${t.cardBorder}` }}>
                  {[lang === 'en' ? 'Date' : 'Date', lang === 'en' ? 'Supplier' : 'Fournisseur', lang === 'en' ? 'Unit Price' : 'Prix/unité', lang === 'en' ? 'Qty' : 'Qté', lang === 'en' ? 'Change' : 'Variation'].map((h, i) => (
                    <th key={i} style={{ padding: '4px 8px', color: t.textSub, fontWeight: 600, textAlign: i > 1 ? 'right' : 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {priceHistory.map((row, idx) => {
                  const prev = priceHistory[idx + 1];
                  const pct = prev ? ((row.unit_price - prev.unit_price) / prev.unit_price * 100) : null;
                  const color = pct == null ? null : pct > 5 ? '#ef4444' : pct > 1 ? '#f59e0b' : pct < -1 ? '#22c55e' : t.textMuted;
                  return (
                    <tr key={row.id} style={{ borderBottom: `1px solid ${t.cardBorder}` }}>
                      <td style={{ padding: '5px 8px', color: t.text }}>{fmtDate(row.invoice_date)}</td>
                      <td style={{ padding: '5px 8px', color: t.textMuted }}>{row.supplier_name || '—'}</td>
                      <td style={{ padding: '5px 8px', color: t.text, textAlign: 'right', fontWeight: 600 }}>{fmt(row.unit_price)}/{row.unit || ''}</td>
                      <td style={{ padding: '5px 8px', color: t.textMuted, textAlign: 'right' }}>{row.quantity ?? '—'}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', color: color || t.textMuted, fontWeight: pct != null ? 600 : 400 }}>
                        {pct != null ? `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          }
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Header + Add button */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input style={{ ...inp, flex: 1, minWidth: 140 }} value={search} onChange={e => setSearch(e.target.value)}
          placeholder={lang === 'en' ? '🔍 Search ingredients…' : '🔍 Rechercher…'} />
        <select style={{ ...sel, width: 140 }} value={catFilter} onChange={e => setCatFilter(e.target.value)}>
          <option value="">{lang === 'en' ? 'All categories' : 'Toutes catégories'}</option>
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{lang === 'en' ? c.en : c.fr}</option>)}
        </select>
        <button onClick={() => setEditing({ ...empty })}
          style={{ padding: '7px 14px', borderRadius: 6, border: 'none', background: 'linear-gradient(135deg,#f97316,#ea580c)', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          + {lang === 'en' ? 'Add ingredient' : 'Ajouter ingrédient'}
        </button>
      </div>

      {/* Edit form */}
      {editing && (
        <div style={{ background: t.card, border: `1px solid ${t.cardBorder}`, borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 12 }}>
            {editing.id ? (lang === 'en' ? '✏️ Edit ingredient' : '✏️ Modifier ingrédient') : (lang === 'en' ? '+ New ingredient' : '+ Nouvel ingrédient')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 10, color: t.textMuted, marginBottom: 3 }}>{lang === 'en' ? 'Name (French) *' : 'Nom (français) *'}</div>
              <input style={inp} value={editing.name_fr} onChange={e => setEditing(p => ({ ...p, name_fr: e.target.value }))} placeholder="Ex: Bœuf haché" />
            </div>
            <div>
              <div style={{ fontSize: 10, color: t.textMuted, marginBottom: 3 }}>{lang === 'en' ? 'Name (English)' : 'Nom (anglais)'}</div>
              <input style={inp} value={editing.name_en || ''} onChange={e => setEditing(p => ({ ...p, name_en: e.target.value }))} placeholder="Ex: Ground beef" />
            </div>
            <div>
              <div style={{ fontSize: 10, color: t.textMuted, marginBottom: 3 }}>{lang === 'en' ? 'Category' : 'Catégorie'}</div>
              <select style={sel} value={editing.category} onChange={e => setEditing(p => ({ ...p, category: e.target.value }))}>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{lang === 'en' ? c.en : c.fr}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, color: t.textMuted, marginBottom: 3 }}>{lang === 'en' ? 'Default unit' : 'Unité par défaut'}</div>
              <select style={sel} value={editing.default_unit} onChange={e => setEditing(p => ({ ...p, default_unit: e.target.value }))}>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, color: t.textMuted, marginBottom: 3 }}>{lang === 'en' ? 'Current price / unit ($)' : 'Prix actuel / unité ($)'}</div>
              <input style={inp} type="number" step="0.01" min="0" value={editing.current_unit_price ?? ''} onChange={e => setEditing(p => ({ ...p, current_unit_price: e.target.value }))} placeholder="0.00" />
            </div>
            <div>
              <div style={{ fontSize: 10, color: t.textMuted, marginBottom: 3 }}>{lang === 'en' ? 'Supplier' : 'Fournisseur'}</div>
              <input style={inp} value={editing.supplier_id || ''} onChange={e => setEditing(p => ({ ...p, supplier_id: e.target.value }))} placeholder="Ex: Sysco" />
            </div>
            <div>
              <div style={{ fontSize: 10, color: t.textMuted, marginBottom: 3 }}>SKU</div>
              <input style={inp} value={editing.sku || ''} onChange={e => setEditing(p => ({ ...p, sku: e.target.value }))} placeholder={lang === 'en' ? 'Supplier product code' : 'Code produit fournisseur'} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: t.textMuted, marginBottom: 3 }}>{lang === 'en' ? 'Notes' : 'Notes'}</div>
              <input style={inp} value={editing.notes || ''} onChange={e => setEditing(p => ({ ...p, notes: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setEditing(null)} style={{ padding: '6px 14px', borderRadius: 6, border: `1px solid ${t.cardBorder}`, background: 'none', color: t.textMuted, fontSize: 11, cursor: 'pointer' }}>
              {lang === 'en' ? 'Cancel' : 'Annuler'}
            </button>
            <button onClick={save} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: 'linear-gradient(135deg,#f97316,#ea580c)', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              {lang === 'en' ? 'Save' : 'Enregistrer'}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {filtered.length === 0
        ? <div style={{ background: t.card, border: `1px solid ${t.cardBorder}`, borderRadius: 10, padding: '20px 22px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 8 }}>
            {lang === 'en' ? 'No ingredients yet' : 'Aucun ingrédient pour l\'instant'}
          </div>
          <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.6, marginBottom: 12 }}>
            {lang === 'en'
              ? 'Start by adding your main ingredients (e.g., beef, buns, cheese, oil). You can also scan a supplier invoice — the system will extract products automatically.'
              : 'Commencez par ajouter vos ingrédients principaux (ex: bœuf, pain, fromage, huile). Vous pouvez aussi scanner une facture fournisseur — le système extraira les produits automatiquement.'}
          </div>
          <div style={{ padding: '10px 12px', borderRadius: 7, background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.15)', marginBottom: 14, fontSize: 11.5, color: t.text, lineHeight: 1.55 }}>
            💡 {lang === 'en'
              ? 'Tip: Start with your 5–10 most expensive ingredients. You don\'t need to add everything at once.'
              : 'Astuce: Commencez avec vos 5–10 ingrédients les plus coûteux. Vous n\'avez pas besoin de tout ajouter d\'un coup.'}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => setEditing({ ...empty })} style={{ padding: '7px 16px', borderRadius: 6, border: 'none', background: 'linear-gradient(135deg,#f97316,#ea580c)', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              + {lang === 'en' ? 'Add ingredient' : 'Ajouter un ingrédient'}
            </button>
            <div style={{ fontSize: 11, color: t.textMuted, display: 'flex', alignItems: 'center', padding: '0 4px' }}>
              {lang === 'en'
                ? '💡 Ingredients populate automatically from P&L invoice scans.'
                : '💡 Les ingrédients se remplissent automatiquement via les scans de factures du P&L.'}
            </div>
          </div>
        </div>
        : filtered.map(ing => (
          <div key={ing.id} style={{ background: t.card, border: `1px solid ${t.cardBorder}`, borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: t.text }}>{lang === 'en' ? (ing.name_en || ing.name_fr) : ing.name_fr}</span>
                <Badge color="blue">{catLabel(ing.category, lang)}</Badge>
                <Badge color="gray">{ing.default_unit}</Badge>
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: ing.current_unit_price ? '#f97316' : t.textMuted, fontWeight: ing.current_unit_price ? 600 : 400 }}>
                  {ing.current_unit_price ? `${fmt(ing.current_unit_price)}/${ing.default_unit}` : (lang === 'en' ? 'No price set' : 'Prix non défini')}
                </span>
                {ing.supplier_id && <span style={{ fontSize: 11, color: t.textMuted }}>{ing.supplier_id}</span>}
                {ing.last_price_update && <span style={{ fontSize: 10, color: t.textDim }}>{fmtDate(ing.last_price_update)}</span>}
              </div>
            </div>
            <button onClick={() => openHistory(ing.id)} title={lang === 'en' ? 'Price history' : 'Historique des prix'} style={{ background: 'none', border: 'none', color: t.textMuted, cursor: 'pointer', fontSize: 14, padding: '2px 5px' }}>📈</button>
            <button onClick={() => openAliases(ing.id)} title={lang === 'en' ? 'Aliases' : 'Alias'} style={{ background: 'none', border: 'none', color: t.textMuted, cursor: 'pointer', fontSize: 14, padding: '2px 5px' }}>🔗</button>
            <button onClick={() => setEditing({ ...ing })} style={{ background: 'none', border: 'none', color: '#f97316', cursor: 'pointer', fontSize: 13, padding: '2px 5px' }}>✏️</button>
            <button onClick={() => del(ing.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 13, padding: '2px 5px' }}>✕</button>
          </div>
        ))
      }
    </div>
  );
}

// ── RECIPE BUILDER Tab ────────────────────────────────────────────────────────
function RecipesTab({ t, T, lang, ingredients }) {
  const [recipes, setRecipes] = useState([]);
  const [editing, setEditing] = useState(null); // recipe obj with .ingredientRows
  const [expandedId, setExpandedId] = useState(null);
  const [expandedIngs, setExpandedIngs] = useState([]);

  const emptyRecipe = { name_fr: '', name_en: '', category: 'main', yield_qty: 1, yield_unit: 'portions', active: 1, notes: '', ingredientRows: [] };
  const emptyRow = { ingredient_id: '', quantity: '', unit: 'kg', notes: '' };

  const reload = useCallback(async () => {
    const rows = await window.api.recipes.getAll();
    setRecipes(rows);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const calcCost = (rows) => {
    let total = 0;
    for (const r of rows) {
      const ing = ingredients.find(i => i.id === Number(r.ingredient_id));
      if (!ing || !ing.current_unit_price || !r.quantity) continue;
      total += Number(r.quantity) * Number(ing.current_unit_price);
    }
    return total;
  };

  const save = async () => {
    if (!editing?.name_fr?.trim()) return;
    const rows = editing.ingredientRows || [];
    const recipe = { ...editing };
    delete recipe.ingredientRows;
    recipe.yield_qty = Number(recipe.yield_qty) || 1;
    const id = await window.api.recipes.save(recipe);
    const recipeId = editing.id || id;
    const validRows = rows.filter(r => r.ingredient_id && r.quantity);
    await window.api.recipes.ingredientsSet(recipeId, validRows.map(r => ({
      recipe_id: recipeId, ingredient_id: Number(r.ingredient_id),
      quantity: Number(r.quantity), unit: r.unit, notes: r.notes || ''
    })));
    await reload();
    setEditing(null);
  };

  const del = async (id) => {
    if (!window.confirm(lang === 'en' ? 'Delete this recipe?' : 'Supprimer cette recette ?')) return;
    await window.api.recipes.delete(id);
    await reload();
  };

  const openExpanded = async (recipe) => {
    if (expandedId === recipe.id) { setExpandedId(null); return; }
    setExpandedId(recipe.id);
    const rows = await window.api.recipes.ingredientsGet(recipe.id);
    setExpandedIngs(rows);
  };

  const openEdit = async (recipe) => {
    const rows = await window.api.recipes.ingredientsGet(recipe.id);
    setEditing({ ...recipe, ingredientRows: rows.map(r => ({ ingredient_id: r.ingredient_id, quantity: r.quantity, unit: r.unit, notes: r.notes })) });
  };

  const inp = { background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 6, color: t.text, fontSize: 12, padding: '6px 9px', outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: "'Outfit',sans-serif" };
  const sel = { ...inp, appearance: 'none' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={() => setEditing({ ...emptyRecipe })}
          style={{ padding: '7px 14px', borderRadius: 6, border: 'none', background: 'linear-gradient(135deg,#f97316,#ea580c)', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
          + {lang === 'en' ? 'New recipe' : 'Nouvelle recette'}
        </button>
      </div>

      {/* Edit form */}
      {editing && (
        <div style={{ background: t.card, border: `1px solid ${t.cardBorder}`, borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 12 }}>
            {editing.id ? (lang === 'en' ? '✏️ Edit recipe' : '✏️ Modifier recette') : (lang === 'en' ? '+ New recipe' : '+ Nouvelle recette')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 10, color: t.textMuted, marginBottom: 3 }}>{lang === 'en' ? 'Name (French) *' : 'Nom (français) *'}</div>
              <input style={inp} value={editing.name_fr} onChange={e => setEditing(p => ({ ...p, name_fr: e.target.value }))} placeholder="Ex: Hamburger classique" />
            </div>
            <div>
              <div style={{ fontSize: 10, color: t.textMuted, marginBottom: 3 }}>{lang === 'en' ? 'Name (English)' : 'Nom (anglais)'}</div>
              <input style={inp} value={editing.name_en || ''} onChange={e => setEditing(p => ({ ...p, name_en: e.target.value }))} placeholder="Ex: Classic Burger" />
            </div>
            <div>
              <div style={{ fontSize: 10, color: t.textMuted, marginBottom: 3 }}>{lang === 'en' ? 'Category' : 'Catégorie'}</div>
              <select style={sel} value={editing.category} onChange={e => setEditing(p => ({ ...p, category: e.target.value }))}>
                {RECIPE_CATS.map(c => <option key={c.value} value={c.value}>{lang === 'en' ? c.en : c.fr}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: t.textMuted, marginBottom: 3 }}>{lang === 'en' ? 'Yield qty' : 'Rendement'}</div>
                <input style={inp} type="number" min="0.1" step="0.1" value={editing.yield_qty} onChange={e => setEditing(p => ({ ...p, yield_qty: e.target.value }))} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: t.textMuted, marginBottom: 3 }}>{lang === 'en' ? 'Unit' : 'Unité'}</div>
                <input style={inp} value={editing.yield_unit} onChange={e => setEditing(p => ({ ...p, yield_unit: e.target.value }))} placeholder="portions" />
              </div>
            </div>
          </div>

          {/* Ingredients */}
          <div style={{ fontSize: 11, fontWeight: 700, color: t.textSub, marginBottom: 8 }}>
            {lang === 'en' ? 'Ingredients' : 'Ingrédients'}
          </div>
          {(editing.ingredientRows || []).map((row, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
              <select style={{ ...sel, flex: 2, minWidth: 0 }} value={row.ingredient_id || ''} onChange={e => setEditing(p => ({ ...p, ingredientRows: p.ingredientRows.map((r, j) => j === i ? { ...r, ingredient_id: e.target.value, unit: ingredients.find(x => x.id === Number(e.target.value))?.default_unit || r.unit } : r) }))}>
                <option value="">{lang === 'en' ? '— Select ingredient —' : '— Choisir ingrédient —'}</option>
                {CATEGORIES.map(cat => {
                  const group = ingredients.filter(x => x.category === cat.value);
                  if (!group.length) return null;
                  return <optgroup key={cat.value} label={lang === 'en' ? cat.en : cat.fr}>
                    {group.map(ing => <option key={ing.id} value={ing.id}>{lang === 'en' ? (ing.name_en || ing.name_fr) : ing.name_fr}</option>)}
                  </optgroup>;
                })}
              </select>
              <input style={{ ...inp, width: 70 }} type="number" min="0" step="0.001" value={row.quantity || ''} onChange={e => setEditing(p => ({ ...p, ingredientRows: p.ingredientRows.map((r, j) => j === i ? { ...r, quantity: e.target.value } : r) }))} placeholder="Qté" />
              <select style={{ ...sel, width: 70 }} value={row.unit} onChange={e => setEditing(p => ({ ...p, ingredientRows: p.ingredientRows.map((r, j) => j === i ? { ...r, unit: e.target.value } : r) }))}>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
              {(() => {
                const ing = ingredients.find(x => x.id === Number(row.ingredient_id));
                const cost = ing?.current_unit_price && row.quantity ? (Number(row.quantity) * ing.current_unit_price) : null;
                return <span style={{ fontSize: 11, color: '#f97316', fontWeight: 600, minWidth: 50, textAlign: 'right' }}>{cost != null ? fmt(cost) : ''}</span>;
              })()}
              <button onClick={() => setEditing(p => ({ ...p, ingredientRows: p.ingredientRows.filter((_, j) => j !== i) }))} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14, flexShrink: 0 }}>✕</button>
            </div>
          ))}
          <button onClick={() => setEditing(p => ({ ...p, ingredientRows: [...(p.ingredientRows || []), { ...emptyRow }] }))}
            style={{ fontSize: 11, padding: '4px 12px', borderRadius: 5, border: '1px solid rgba(249,115,22,0.3)', background: 'rgba(249,115,22,0.07)', color: '#f97316', cursor: 'pointer', fontWeight: 600, marginBottom: 12 }}>
            + {lang === 'en' ? 'Add ingredient' : 'Ajouter ingrédient'}
          </button>

          <div style={{ background: t.section, borderRadius: 6, padding: '8px 12px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: t.textSub }}>{lang === 'en' ? 'Estimated cost per portion' : 'Coût estimé par portion'}</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#f97316' }}>
              {fmt(calcCost(editing.ingredientRows || []) / Math.max(Number(editing.yield_qty) || 1, 0.01))}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setEditing(null)} style={{ padding: '6px 14px', borderRadius: 6, border: `1px solid ${t.cardBorder}`, background: 'none', color: t.textMuted, fontSize: 11, cursor: 'pointer' }}>
              {lang === 'en' ? 'Cancel' : 'Annuler'}
            </button>
            <button onClick={save} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: 'linear-gradient(135deg,#f97316,#ea580c)', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              {lang === 'en' ? 'Save' : 'Enregistrer'}
            </button>
          </div>
        </div>
      )}

      {/* Recipe list */}
      {recipes.length === 0 && !editing
        ? <div style={{ background: t.card, border: `1px solid ${t.cardBorder}`, borderRadius: 10, padding: 20, textAlign: 'center', color: t.textMuted, fontSize: 12 }}>
          {lang === 'en' ? 'No recipes yet. Add your first recipe to start tracking food costs.' : 'Aucune recette. Ajoutez votre première recette pour commencer le suivi du coût alimentaire.'}
        </div>
        : recipes.map(r => (
          <div key={r.id} style={{ background: t.card, border: `1px solid ${t.cardBorder}`, borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
              <button onClick={() => openExpanded(r)} style={{ background: 'none', border: 'none', color: t.text, cursor: 'pointer', fontSize: 13 }}>
                {expandedId === r.id ? '▼' : '▶'}
              </button>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{lang === 'en' ? (r.name_en || r.name_fr) : r.name_fr}</div>
                <div style={{ fontSize: 11, color: t.textMuted }}>
                  {recipeCatLabel(r.category, lang)} · {r.yield_qty} {r.yield_unit}
                </div>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#f97316' }}>
                {/* cost shown after expand */}
              </span>
              <button onClick={() => openEdit(r)} style={{ background: 'none', border: 'none', color: '#f97316', cursor: 'pointer', fontSize: 14 }}>✏️</button>
              <button onClick={() => del(r.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14 }}>✕</button>
            </div>
            {expandedId === r.id && (
              <div style={{ borderTop: `1px solid ${t.cardBorder}`, padding: '10px 14px', background: t.section }}>
                {expandedIngs.length === 0
                  ? <div style={{ fontSize: 11, color: t.textMuted }}>{lang === 'en' ? 'No ingredients in this recipe.' : 'Aucun ingrédient dans cette recette.'}</div>
                  : <>
                    {expandedIngs.map((ri, i) => {
                      const cost = ri.current_unit_price && ri.quantity ? (Number(ri.quantity) * Number(ri.current_unit_price)) : null;
                      return (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: i < expandedIngs.length - 1 ? `1px solid ${t.cardBorder}` : 'none' }}>
                          <span style={{ fontSize: 12, color: t.text }}>{lang === 'en' ? (ri.name_en || ri.name_fr) : ri.name_fr}</span>
                          <span style={{ fontSize: 11, color: t.textMuted }}>{ri.quantity} {ri.unit}</span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: cost ? '#f97316' : t.textMuted }}>{cost ? fmt(cost) : '—'}</span>
                        </div>
                      );
                    })}
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 0', borderTop: `1px solid ${t.cardBorder}`, marginTop: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: t.text }}>{lang === 'en' ? `Total cost (${r.yield_qty} ${r.yield_unit})` : `Coût total (${r.yield_qty} ${r.yield_unit})`}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#f97316' }}>{fmt(calcCost(expandedIngs))}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0 0' }}>
                      <span style={{ fontSize: 11, color: t.textMuted }}>{lang === 'en' ? 'Cost per portion' : 'Coût / portion'}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#f97316' }}>{fmt(calcCost(expandedIngs) / Math.max(Number(r.yield_qty) || 1, 0.01))}</span>
                    </div>
                  </>
                }
              </div>
            )}
          </div>
        ))
      }
    </div>
  );
}

// ── PRICE ALERTS Tab ─────────────────────────────────────────────────────────
function PrixTab({ t, T, lang, ingredients }) {
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    window.api.invoiceLines.getRecent().then(setRecent).catch(() => {});
  }, []);

  const priceAlerts = useMemo(() => {
    const alerts = [];
    // Group by ingredient_id + supplier to find recent price changes
    const byKey = {};
    for (const item of recent) {
      if (!item.ingredient_id || !item.unit_price) continue;
      const key = `${item.ingredient_id}-${item.supplier_name}`;
      if (!byKey[key]) byKey[key] = [];
      byKey[key].push(item);
    }
    for (const [, items] of Object.entries(byKey)) {
      if (items.length < 2) continue;
      // Items are already sorted by date DESC from DB
      const curr = items[0], prev = items[1];
      if (curr.unit_price === prev.unit_price) continue;
      const pct = (curr.unit_price - prev.unit_price) / prev.unit_price * 100;
      const ing = ingredients.find(i => i.id === curr.ingredient_id);
      alerts.push({ ...curr, prev_price: prev.unit_price, pct, ing_name: lang === 'en' ? (ing?.name_en || ing?.name_fr) : ing?.name_fr });
    }
    return alerts.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
  }, [recent, ingredients, lang]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ background: t.card, border: `1px solid ${t.cardBorder}`, borderRadius: 10, padding: '14px 16px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 4 }}>
          📊 {lang === 'en' ? 'Recent invoice line items' : 'Lignes de facture récentes'}
        </div>
        <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 10 }}>
          {lang === 'en' ? 'Extracted from scanned invoices via OCR.' : 'Extraites des factures numérisées via OCR.'}
        </div>
        {recent.length === 0
          ? <div style={{ fontSize: 11, color: t.textMuted }}>{lang === 'en' ? 'No scanned line items yet. Scan a supplier invoice to populate this section.' : 'Aucune ligne numérisée. Numérisez une facture fournisseur pour alimenter cette section.'}</div>
          : <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${t.cardBorder}` }}>
                {[lang === 'en' ? 'Date' : 'Date', lang === 'en' ? 'Supplier' : 'Fournisseur', lang === 'en' ? 'Description' : 'Description', lang === 'en' ? 'Unit Price' : 'Prix/u', lang === 'en' ? 'Matched to' : 'Associé à', lang === 'en' ? 'Status' : 'Statut'].map((h, i) => (
                  <th key={i} style={{ padding: '4px 6px', color: t.textSub, fontWeight: 600, textAlign: 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recent.map(item => (
                <tr key={item.id} style={{ borderBottom: `1px solid ${t.cardBorder}` }}>
                  <td style={{ padding: '5px 6px', color: t.textMuted }}>{fmtDate(item.invoice_date)}</td>
                  <td style={{ padding: '5px 6px', color: t.textMuted }}>{item.supplier_name || '—'}</td>
                  <td style={{ padding: '5px 6px', color: t.text, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.raw_description}</td>
                  <td style={{ padding: '5px 6px', color: t.text, fontWeight: 600 }}>{item.unit_price ? `$${Number(item.unit_price).toFixed(2)}` : '—'}</td>
                  <td style={{ padding: '5px 6px', color: '#f97316' }}>{item.name_fr || '—'}</td>
                  <td style={{ padding: '5px 6px' }}>
                    {item.match_status === 'matched' && <Badge color="green">{lang === 'en' ? 'Matched' : 'Associé'}</Badge>}
                    {item.match_status === 'price_change' && <Badge color="yellow">{lang === 'en' ? 'Price ↑' : 'Prix ↑'}</Badge>}
                    {item.match_status === 'new_product' && <Badge color="orange">{lang === 'en' ? 'New' : 'Nouveau'}</Badge>}
                    {item.match_status === 'unmatched' && <Badge color="gray">{lang === 'en' ? 'Unmatched' : 'Non associé'}</Badge>}
                    {item.match_status === 'skipped' && <Badge color="gray">{lang === 'en' ? 'Skipped' : 'Ignoré'}</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      </div>

      {priceAlerts.length > 0 && (
        <div style={{ background: t.card, border: `1px solid rgba(245,158,11,0.3)`, borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#d97706', marginBottom: 10 }}>
            ⚠️ {lang === 'en' ? 'Price change alerts' : 'Alertes de changement de prix'}
          </div>
          {priceAlerts.map((a, i) => {
            const isUp = a.pct > 0;
            const sev = Math.abs(a.pct) > 15 ? 'red' : Math.abs(a.pct) > 5 ? 'yellow' : 'gray';
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: i < priceAlerts.length - 1 ? `1px solid ${t.cardBorder}` : 'none' }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: t.text }}>{a.ing_name || a.raw_description}</span>
                  {a.supplier_name && <span style={{ fontSize: 11, color: t.textMuted }}> · {a.supplier_name}</span>}
                </div>
                <span style={{ fontSize: 11, color: t.textMuted }}>${Number(a.prev_price).toFixed(2)} →</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: isUp ? '#ef4444' : '#22c55e' }}>${Number(a.unit_price).toFixed(2)}</span>
                <Badge color={sev}>{isUp ? '+' : ''}{a.pct.toFixed(1)}%</Badge>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const SUB_TAB_DESCS = {
  ingredients: {
    fr: 'Tous les produits que vous achetez chez vos fournisseurs. Les prix se mettent à jour automatiquement quand vous scannez une facture.',
    en: 'Everything you buy from your suppliers. Prices update automatically when you scan an invoice.',
  },
  recipes: {
    fr: 'Combinez vos ingrédients pour connaître le coût exact de chaque item que vous vendez. Ex: un hamburger = pain + bœuf + fromage + sauce = coût par portion.',
    en: 'Combine ingredients to know the exact cost of every item you sell. Ex: a burger = bun + beef + cheese + sauce = cost per portion.',
  },
  prix: {
    fr: 'Historique des prix de vos fournisseurs. Détectez les hausses silencieuses et comparez les prix entre fournisseurs.',
    en: 'Supplier price history. Catch silent price increases and compare prices across suppliers.',
  },
};

const HOW_IT_WORKS = {
  fr: [
    '1. Ajoutez vos ingrédients (ou scannez une facture dans le P&L)',
    '2. Créez des recettes en combinant des ingrédients',
    '3. Le système calcule le coût par portion automatiquement',
    '4. Quand vous scannez une nouvelle facture, les prix se mettent à jour et les coûts des recettes sont recalculés',
    '5. Si un fournisseur augmente un prix, vous recevez une alerte immédiate',
  ],
  en: [
    '1. Add your ingredients (or scan an invoice in the P&L section)',
    '2. Create recipes by combining ingredients',
    '3. The system calculates cost per portion automatically',
    '4. When you scan a new invoice, prices update and recipe costs recalculate',
    '5. If a supplier raises a price, you get an immediate alert',
  ],
  exFr: 'Hamburger classique = Pain ($0.35) + Bœuf 150g ($1.12) + Fromage ($0.28) + Sauce ($0.15) + Emballage ($0.08) = Coût total: $1.98/portion. Si le bœuf augmente de 10%: $2.09/portion → alerte.',
  exEn: 'Classic burger = Bun ($0.35) + Beef 150g ($1.12) + Cheese ($0.28) + Sauce ($0.15) + Packaging ($0.08) = Total: $1.98/portion. If beef goes up 10%: $2.09/portion → alert.',
};

// ── MAIN EXPORT ───────────────────────────────────────────────────────────────
export default function RecettesTab({ t, T, lang, activePlan }) {
  const [subTab, setSubTab] = useState('ingredients');
  const [ingredients, setIngredients] = useState([]);
  const [howOpen, setHowOpen] = useState(false);

  useEffect(() => {
    window.api.ingredients.getAll().then(setIngredients).catch(() => {});
  }, []);

  const tabs = [
    { id: 'ingredients', fr: 'Ingrédients', en: 'Ingredients', icon: '📦' },
    { id: 'recipes',     fr: 'Recettes',    en: 'Recipes',     icon: '📋' },
    { id: 'prix',        fr: 'Prix',        en: 'Prices',      icon: '📊' },
  ];

  const fr = lang !== 'en';

  return (
    <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Page header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: t.text }}>
            💰 {fr ? 'Suivi des coûts — Ingrédients, recettes et prix' : 'Cost Tracking — Ingredients, recipes & prices'}
          </div>
          <span style={{ fontSize: 9.5, fontWeight: 700, color: '#f97316', background: 'rgba(249,115,22,0.1)', padding: '2px 7px', borderRadius: 4 }}>Pro</span>
        </div>
        <div style={{ fontSize: 11.5, color: t.textMuted, lineHeight: 1.55, marginBottom: 6 }}>
          {fr
            ? 'Suivez le coût réel de chaque produit que vous vendez. Scannez vos factures fournisseurs, le système apprend les prix et calcule vos marges automatiquement.'
            : 'Track the real cost of every product you sell. Scan supplier invoices, the system learns prices and calculates your margins automatically.'}
        </div>
        {/* P&L scan link */}
        <div style={{ fontSize: 11, color: '#f97316', background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.15)', borderRadius: 6, padding: '6px 10px', marginBottom: 4 }}>
          💡 {fr
            ? 'Vos ingrédients se remplissent automatiquement quand vous scannez des factures dans le P&L. Pas besoin de scanner deux fois.'
            : 'Your ingredients populate automatically when you scan invoices in the P&L section. No double scanning needed.'}
        </div>
        {/* How it works collapsible */}
        <button onClick={() => setHowOpen(o => !o)} style={{ background: 'none', border: 'none', color: t.textMuted, fontSize: 11, cursor: 'pointer', padding: '4px 0', display: 'flex', alignItems: 'center', gap: 4 }}>
          {howOpen ? '▾' : '▸'} {fr ? 'Comment ça marche ?' : 'How does this work?'}
        </button>
        {howOpen && (
          <div style={{ background: t.section, border: `1px solid ${t.cardBorder}`, borderRadius: 8, padding: '12px 14px', marginTop: 4 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
              {HOW_IT_WORKS[fr ? 'fr' : 'en'].map((step, i) => (
                <div key={i} style={{ fontSize: 11.5, color: t.text, lineHeight: 1.5 }}>{step}</div>
              ))}
            </div>
            <div style={{ background: t.card, borderRadius: 6, padding: '8px 12px', fontSize: 11, color: t.textSub, lineHeight: 1.6, borderLeft: '3px solid #f97316' }}>
              <strong style={{ color: t.text }}>Exemple / Example:</strong> {fr ? HOW_IT_WORKS.exFr : HOW_IT_WORKS.exEn}
            </div>
          </div>
        )}
      </div>

      {/* Sub-tabs */}
      <div>
        <div style={{ display: 'flex', gap: 2, background: t.section, borderRadius: 8, padding: 3, alignSelf: 'flex-start', width: 'fit-content' }}>
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setSubTab(tab.id)} style={{
              padding: '5px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700,
              background: subTab === tab.id ? 'linear-gradient(135deg,#f97316,#ea580c)' : 'none',
              color: subTab === tab.id ? '#fff' : t.textMuted,
              whiteSpace: 'nowrap',
            }}>
              {tab.icon} {fr ? tab.fr : tab.en}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: t.textMuted, marginTop: 6, lineHeight: 1.5 }}>
          {SUB_TAB_DESCS[subTab]?.[fr ? 'fr' : 'en']}
        </div>
      </div>

      {/* Sub-tab content */}
      {subTab === 'ingredients' && <IngredientsTab t={t} T={T} lang={lang} ingredients={ingredients} setIngredients={setIngredients} />}
      {subTab === 'recipes'     && <RecipesTab t={t} T={T} lang={lang} ingredients={ingredients} />}
      {subTab === 'prix'        && <PrixTab t={t} T={T} lang={lang} ingredients={ingredients} />}
    </div>
  );
}
