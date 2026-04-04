import React, { useState, useEffect, useMemo, useCallback } from 'react';

const WASTE_CATEGORIES = [
  { value: 'protein',  fr: 'Protéines',       en: 'Proteins' },
  { value: 'produce',  fr: 'Fruits & légumes', en: 'Produce' },
  { value: 'dairy',    fr: 'Produits laitiers',en: 'Dairy' },
  { value: 'bakery',   fr: 'Boulangerie',      en: 'Bakery' },
  { value: 'dry',      fr: 'Épicerie sèche',   en: 'Dry Goods' },
  { value: 'beverage', fr: 'Boissons',         en: 'Beverages' },
  { value: 'other',    fr: 'Autre',            en: 'Other' },
];
const WASTE_REASONS = [
  { value: 'expired',       fr: 'Périmé',             en: 'Expired' },
  { value: 'overproduction',fr: 'Surproduction',       en: 'Overproduction' },
  { value: 'dropped',       fr: 'Tombé / cassé',      en: 'Dropped / broken' },
  { value: 'return',        fr: 'Retour client',      en: 'Customer return' },
  { value: 'spoilage',      fr: 'Détérioration',      en: 'Spoilage' },
  { value: 'other',         fr: 'Autre',              en: 'Other' },
];
const SHIFTS = [
  { value: 'morning', fr: 'Matin',  en: 'Morning' },
  { value: 'evening', fr: 'Soir',   en: 'Evening' },
  { value: 'split',   fr: 'Double', en: 'Split' },
];
const UNITS = ['kg', 'lb', 'g', 'oz', 'L', 'mL', 'each', 'dz', 'case'];

const CAT_COLORS = {
  protein:'#ef4444', produce:'#22c55e', dairy:'#60a5fa', bakery:'#f59e0b',
  dry:'#a78bfa', beverage:'#06b6d4', other:'#6b7280',
};
const REASON_COLORS = {
  expired:'#ef4444', overproduction:'#f97316', dropped:'#f59e0b',
  return:'#60a5fa', spoilage:'#a78bfa', other:'#6b7280',
};

function InfoTip({ text, t }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}><button onMouseEnter={() =>setOpen(true)} onMouseLeave={() => setOpen(false)}
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: open ? '#f97316' : 'rgba(128,128,128,0.45)', fontSize: 12, padding: '0 3px', lineHeight: 1 }}>ℹ</button>{open && (<div style={{ position: 'absolute', left: 0, top: 'calc(100% + 4px)', zIndex: 200, width: 250,
          background: t?.name === 'dark' ? '#1e2130' : '#fff',
          border: '1px solid rgba(249,115,22,0.3)', borderRadius: 8, padding: '10px 12px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.35)', fontSize: 11.5, color: t?.textSub || '#9ca3af', lineHeight: 1.55, fontWeight: 400 }}><div style={{ position: 'absolute', top: -5, left: 8, width: 8, height: 8,
            background: t?.name === 'dark' ? '#1e2130' : '#fff',
            border: '1px solid rgba(249,115,22,0.3)', borderRight: 'none', borderBottom: 'none', transform: 'rotate(45deg)' }}/>{text}</div>)}</div>);
}

function catLabel(v, lang) { const c = WASTE_CATEGORIES.find(x => x.value === v); return c ? (lang==='en'?c.en:c.fr) : v; }
function reasonLabel(v, lang) { const c = WASTE_REASONS.find(x => x.value === v); return c ? (lang==='en'?c.en:c.fr) : v; }
function shiftLabel(v, lang) { const c = SHIFTS.find(x => x.value === v); return c ? (lang==='en'?c.en:c.fr) : v; }
function fmtDate(d) { if (!d) return '—'; return new Date(d+'T12:00:00').toLocaleDateString('fr-CA',{day:'2-digit',month:'short'}); }
function today() { return new Date().toISOString().slice(0, 10); }
function monthStart(m) { return `${m}-01`; }
function monthEnd(m) { const [y, mo] = m.split('-').map(Number); return new Date(y, mo, 0).toISOString().slice(0, 10); }
function currentMonth() { return new Date().toISOString().slice(0, 7); }

// Mini horizontal bar
function MiniBar({ value, max, color }) {
  const pct = max > 0 ? Math.min(value / max * 100, 100) : 0;
  return (<div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.4s' }} /></div>);
}

export default function WasteTab({ t, T, lang, canUse, ingredients }) {
  const [entries, setEntries] = useState([]);
  const [month, setMonth] = useState(currentMonth());
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [ings, setIngs] = useState(ingredients || []);

  const emptyEntry = { date: today(), ingredient_id: null, category: 'protein', quantity: '', unit: 'kg', reason: 'expired', shift: 'evening', notes: '' };

  useEffect(() => {
    window.api.ingredients?.getAll().then(r => setIngs(r || [])).catch(() => {});
  }, []);

  const reload = useCallback(async () => {
    const rows = await window.api.waste.getRange(monthStart(month), monthEnd(month));
    setEntries(rows || []);
  }, [month]);

  useEffect(() => { reload(); }, [reload]);

  const save = async () => {
    if (!editing || !editing.quantity || Number(editing.quantity)<= 0) return;
    const ing = ings.find(i =>i.id === Number(editing.ingredient_id));
    const unit_cost = ing?.current_unit_price ?? null;
    const dollar_value = unit_cost ? Math.round(Number(editing.quantity) * unit_cost * 100) / 100 : null;
    const entry = { ...editing, quantity: Number(editing.quantity), ingredient_id: editing.ingredient_id ? Number(editing.ingredient_id) : null, unit_cost, dollar_value };
    await window.api.waste.save(entry);
    setEditing(null);
    setShowForm(false);
    await reload();
  };

  const del = async (id) => {
    if (!window.confirm(lang === 'en' ? 'Delete this entry?' : 'Supprimer cette entrée ?')) return;
    await window.api.waste.delete(id);
    await reload();
  };

  // ── Computed stats ──────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const totalKg = entries.reduce((s, e) => s + (e.unit === 'kg' ? Number(e.quantity) : 0), 0);
    const totalDollars = entries.reduce((s, e) => s + (e.dollar_value || 0), 0);

    const byCat = {};
    for (const e of entries) {
      if (!byCat[e.category]) byCat[e.category] = { qty: 0, dollars: 0, count: 0 };
      byCat[e.category].qty += Number(e.quantity);
      byCat[e.category].dollars += e.dollar_value || 0;
      byCat[e.category].count++;
    }

    const byReason = {};
    for (const e of entries) {
      if (!byReason[e.reason]) byReason[e.reason] = { qty: 0, dollars: 0, count: 0 };
      byReason[e.reason].qty += Number(e.quantity);
      byReason[e.reason].dollars += e.dollar_value || 0;
      byReason[e.reason].count++;
    }

    const byShift = {};
    for (const e of entries) {
      if (!byShift[e.shift]) byShift[e.shift] = { qty: 0, dollars: 0 };
      byShift[e.shift].qty += Number(e.quantity);
      byShift[e.shift].dollars += e.dollar_value || 0;
    }

    const maxCatQty = Math.max(...Object.values(byCat).map(v => v.qty), 0.01);
    const maxReasonQty = Math.max(...Object.values(byReason).map(v => v.qty), 0.01);

    return { totalKg, totalDollars, byCat, byReason, byShift, maxCatQty, maxReasonQty };
  }, [entries]);

  const inp = { background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 6, color: t.text, fontSize: 12, padding: '6px 9px', outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: "'Satoshi',-apple-system,BlinkMacSystemFont,sans-serif" };
  const sel = { ...inp, appearance: 'none' };

  const hasDollarData = entries.some(e => e.dollar_value);

  return (<div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>{/* Header */}<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}><div><div style={{ fontSize: 16, fontWeight: 700, color: t.text, display: 'flex', alignItems: 'center', gap: 4 }}>{lang === 'en' ? 'Food Waste Tracking' : 'Suivi du gaspillage alimentaire'}<InfoTip t={t} text={lang === 'en'
              ? 'Log each waste event with its category, reason and shift. If you link an ingredient that has a unit price, the dollar value is calculated automatically. All data feeds the waste alerts in the Intelligence tab and the Prévisions learning engine.'
              : 'Enregistrez chaque gaspillage avec sa catégorie, raison et quart de travail. Si vous liez un ingrédient avec un prix unitaire, la valeur en dollars est calculée automatiquement. Les données alimentent les alertes de gaspillage dans l\'onglet Intelligence et le moteur d\'apprentissage des Prévisions.'
            }/></div><div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>{lang === 'en' ? `${entries.length} entries this month` : `${entries.length} entrée${entries.length !== 1 ? 's' : ''} ce mois`}</div></div><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="month" value={month} onChange={e =>setMonth(e.target.value)}
            style={{ ...inp, width: 140 }} /><button onClick={() =>{ setEditing({ ...emptyEntry }); setShowForm(true); }}
            style={{ padding: '7px 14px', borderRadius: 6, border: 'none', background: 'linear-gradient(135deg,#f97316,#ea580c)', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            + {lang === 'en' ? 'Log waste' : 'Enregistrer'}</button></div></div>{/* Entry form */}
      {showForm && editing && (<div style={{ background: t.card, border: `1px solid ${t.cardBorder}`, borderRadius: 10, padding: '14px 16px' }}><div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 12 }}>{editing.id ? (lang === 'en' ? 'Edit entry' : 'Modifier entrée') : (lang === 'en' ? '+ Log waste' : '+ Enregistrer gaspillage')}</div><div style={{ display: 'grid', gridTemplateColumns: '130px 1fr 1fr', gap: 10, marginBottom: 10 }}><div><div style={{ fontSize: 10, color: t.textMuted, marginBottom: 3 }}>{lang === 'en' ? 'Date' : 'Date'}</div><input type="date" style={inp} value={editing.date} onChange={e =>setEditing(p => ({ ...p, date: e.target.value }))} /></div><div><div style={{ fontSize: 10, color: t.textMuted, marginBottom: 3 }}>{lang === 'en' ? 'Ingredient (optional)' : 'Ingrédient (optionnel)'}</div><select style={sel} value={editing.ingredient_id || ''} onChange={e =>{
                const ing = ings.find(i => i.id === Number(e.target.value));
                setEditing(p => ({ ...p, ingredient_id: e.target.value || null, category: ing?.category || p.category, unit: ing?.default_unit || p.unit }));
              }}><option value="">{lang === 'en' ? '— Category only —' : '— Catégorie seulement —'}</option>{ings.map(i =><option key={i.id} value={i.id}>{lang === 'en' ? (i.name_en || i.name_fr) : i.name_fr}</option>)}</select></div><div><div style={{ fontSize: 10, color: t.textMuted, marginBottom: 3 }}>{lang === 'en' ? 'Category' : 'Catégorie'}</div><select style={sel} value={editing.category} onChange={e =>setEditing(p => ({ ...p, category: e.target.value }))}>
                {WASTE_CATEGORIES.map(c =><option key={c.value} value={c.value}>{lang === 'en' ? c.en : c.fr}</option>)}</select></div></div><div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr 1fr', gap: 10, marginBottom: 10 }}><div><div style={{ fontSize: 10, color: t.textMuted, marginBottom: 3 }}>{lang === 'en' ? 'Quantity' : 'Quantité'}</div><input type="number" min="0" step="0.1" style={inp} value={editing.quantity} onChange={e =>setEditing(p => ({ ...p, quantity: e.target.value }))} placeholder="0.0" /></div><div><div style={{ fontSize: 10, color: t.textMuted, marginBottom: 3 }}>{lang === 'en' ? 'Unit' : 'Unité'}</div><select style={sel} value={editing.unit} onChange={e =>setEditing(p => ({ ...p, unit: e.target.value }))}>
                {UNITS.map(u =><option key={u} value={u}>{u}</option>)}</select></div><div><div style={{ fontSize: 10, color: t.textMuted, marginBottom: 3 }}>{lang === 'en' ? 'Reason' : 'Raison'}</div><select style={sel} value={editing.reason} onChange={e =>setEditing(p => ({ ...p, reason: e.target.value }))}>
                {WASTE_REASONS.map(r =><option key={r.value} value={r.value}>{lang === 'en' ? r.en : r.fr}</option>)}</select></div><div><div style={{ fontSize: 10, color: t.textMuted, marginBottom: 3 }}>{lang === 'en' ? 'Shift' : 'Quart'}</div><select style={sel} value={editing.shift} onChange={e =>setEditing(p => ({ ...p, shift: e.target.value }))}>
                {SHIFTS.map(s =><option key={s.value} value={s.value}>{lang === 'en' ? s.en : s.fr}</option>)}</select></div></div><div style={{ marginBottom: 12 }}><div style={{ fontSize: 10, color: t.textMuted, marginBottom: 3 }}>{lang === 'en' ? 'Notes' : 'Notes'}</div><input style={inp} value={editing.notes || ''} onChange={e =>setEditing(p => ({ ...p, notes: e.target.value }))} placeholder={lang === 'en' ? 'Optional details…' : 'Détails optionnels…'} /></div>{/* Dollar estimate */}
          {(() => {
            const ing = ings.find(i => i.id === Number(editing.ingredient_id));
            if (!ing?.current_unit_price || !editing.quantity) return null;
            const est = Math.round(Number(editing.quantity) * ing.current_unit_price * 100) / 100;
            return<div style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.2)', borderRadius: 6, padding: '6px 10px', marginBottom: 10, fontSize: 11, color: '#f97316' }}>{lang === 'en' ? 'Estimated loss:' : 'Perte estimée:'}<strong>${est.toFixed(2)}</strong></div>;
          })()}<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button onClick={() =>{ setEditing(null); setShowForm(false); }} style={{ padding: '6px 14px', borderRadius: 6, border: `1px solid ${t.cardBorder}`, background: 'none', color: t.textMuted, fontSize: 11, cursor: 'pointer' }}>
              {lang === 'en' ? 'Cancel' : 'Annuler'}</button><button onClick={save} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: 'linear-gradient(135deg,#f97316,#ea580c)', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{lang === 'en' ? 'Save' : 'Enregistrer'}</button></div></div>)}

      {entries.length === 0 && !showForm
        ?<div style={{ background: t.card, border: `1px solid ${t.cardBorder}`, borderRadius: 10, padding: 24, textAlign: 'center', color: t.textMuted, fontSize: 12 }}>{lang === 'en' ? 'No waste entries for this month. Tap "+ Log waste" to start tracking.' : 'Aucune entrée ce mois. Cliquez sur "+ Enregistrer" pour commencer le suivi.'}</div>: entries.length > 0 && (<>{/* Summary cards */}<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}><div style={{ background: t.card, border: `1px solid ${t.cardBorder}`, borderRadius: 9, padding: '10px 14px', textAlign: 'center' }}><div style={{ fontSize: 11, color: t.textMuted, marginBottom: 4 }}>{lang === 'en' ? 'Total qty (kg)' : 'Total quantité (kg)'}</div><div style={{ fontSize: 20, fontWeight: 700, color: '#ef4444' }}>{stats.totalKg.toFixed(1)}</div><div style={{ fontSize: 10, color: t.textMuted }}>{entries.length} {lang === 'en' ? 'entries' : 'entrées'}</div></div>{hasDollarData && (<div style={{ background: t.card, border: `1px solid ${t.cardBorder}`, borderRadius: 9, padding: '10px 14px', textAlign: 'center' }}><div style={{ fontSize: 11, color: t.textMuted, marginBottom: 4 }}>{lang === 'en' ? 'Estimated loss ($)' : 'Perte estimée ($)'}</div><div style={{ fontSize: 20, fontWeight: 700, color: '#f97316' }}>${stats.totalDollars.toFixed(2)}</div><div style={{ fontSize: 10, color: '#f97316' }}>{lang === 'en' ? 'from ingredient prices' : 'selon prix ingrédients'}</div></div>)}<div style={{ background: t.card, border: `1px solid ${t.cardBorder}`, borderRadius: 9, padding: '10px 14px', textAlign: 'center' }}><div style={{ fontSize: 11, color: t.textMuted, marginBottom: 4 }}>{lang === 'en' ? 'Top reason' : 'Raison principale'}</div>{(() => {
                  const top = Object.entries(stats.byReason).sort((a, b) => b[1].qty - a[1].qty)[0];
                  return top ?<><div style={{ fontSize: 14, fontWeight: 700, color: REASON_COLORS[top[0]] || t.text }}>{reasonLabel(top[0], lang)}</div><div style={{ fontSize: 10, color: t.textMuted }}>{top[1].count} {lang === 'en' ? 'entries' : 'entrées'}</div></>:<div style={{ color: t.textMuted }}>—</div>;
                })()}</div></div>{/* By category + By reason side by side */}<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{/* By category */}<div style={{ background: t.card, border: `1px solid ${t.cardBorder}`, borderRadius: 9, padding: '12px 14px' }}><div style={{ fontSize: 12, fontWeight: 700, color: t.text, marginBottom: 10 }}>{lang === 'en' ? 'By category' : 'Par catégorie'}</div>{Object.entries(stats.byCat).sort((a, b) => b[1].qty - a[1].qty).map(([cat, data]) => (<div key={cat} style={{ marginBottom: 8 }}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}><span style={{ fontSize: 11, color: CAT_COLORS[cat] || t.textMuted, fontWeight: 600 }}>{catLabel(cat, lang)}</span><span style={{ fontSize: 11, color: t.text, fontFamily: "'Satoshi',-apple-system,BlinkMacSystemFont,sans-serif" }}>{data.qty.toFixed(1)} {hasDollarData && data.dollars > 0 ? `· $${data.dollars.toFixed(2)}` : ''}</span></div><MiniBar value={data.qty} max={stats.maxCatQty} color={CAT_COLORS[cat] || '#6b7280'} /></div>))}</div>{/* By reason */}<div style={{ background: t.card, border: `1px solid ${t.cardBorder}`, borderRadius: 9, padding: '12px 14px' }}><div style={{ fontSize: 12, fontWeight: 700, color: t.text, marginBottom: 10 }}>{lang === 'en' ? 'By reason' : 'Par raison'}</div>{Object.entries(stats.byReason).sort((a, b) => b[1].qty - a[1].qty).map(([reason, data]) => (<div key={reason} style={{ marginBottom: 8 }}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}><span style={{ fontSize: 11, color: REASON_COLORS[reason] || t.textMuted, fontWeight: 600 }}>{reasonLabel(reason, lang)}</span><span style={{ fontSize: 11, color: t.text, fontFamily: "'Satoshi',-apple-system,BlinkMacSystemFont,sans-serif" }}>{data.qty.toFixed(1)} · {data.count}×</span></div><MiniBar value={data.qty} max={stats.maxReasonQty} color={REASON_COLORS[reason] || '#6b7280'} /></div>))}</div></div>{/* By shift */}
            {Object.keys(stats.byShift).length > 0 && (<div style={{ background: t.card, border: `1px solid ${t.cardBorder}`, borderRadius: 9, padding: '12px 14px' }}><div style={{ fontSize: 12, fontWeight: 700, color: t.text, marginBottom: 8 }}>{lang === 'en' ? 'By shift' : 'Par quart'}</div><div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>{Object.entries(stats.byShift).map(([shift, data]) => (<div key={shift} style={{ background: t.section, borderRadius: 7, padding: '8px 14px', textAlign: 'center', minWidth: 80 }}><div style={{ fontSize: 11, color: t.textMuted, marginBottom: 2 }}>{shiftLabel(shift, lang)}</div><div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>{data.qty.toFixed(1)}</div>{hasDollarData && data.dollars > 0 &&<div style={{ fontSize: 10, color: '#f97316' }}>${data.dollars.toFixed(2)}</div>}</div>))}</div></div>)}

            {/* Entry list */}<div style={{ background: t.card, border: `1px solid ${t.cardBorder}`, borderRadius: 9, overflow: 'hidden' }}><div style={{ padding: '10px 14px', borderBottom: `1px solid ${t.cardBorder}`, fontSize: 12, fontWeight: 700, color: t.text }}>{lang === 'en' ? 'Entries' : 'Entrées'}</div><div style={{ maxHeight: 320, overflowY: 'auto' }}>{entries.map(e => (<div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: `1px solid ${t.cardBorder}` }}><div style={{ flexShrink: 0, width: 40, fontSize: 10, color: t.textMuted }}>{fmtDate(e.date)}</div><div style={{ flex: 1, minWidth: 0 }}><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ fontSize: 11, fontWeight: 600, color: CAT_COLORS[e.category] || t.text }}>{catLabel(e.category, lang)}</span><span style={{ fontSize: 10, color: t.textMuted }}>·</span><span style={{ fontSize: 11, color: REASON_COLORS[e.reason] || t.textMuted }}>{reasonLabel(e.reason, lang)}</span><span style={{ fontSize: 10, color: t.textMuted }}>·</span><span style={{ fontSize: 10, color: t.textMuted }}>{shiftLabel(e.shift, lang)}</span></div>{e.notes &&<div style={{ fontSize: 10, color: t.textMuted, marginTop: 1 }}>{e.notes}</div>}</div><div style={{ textAlign: 'right', flexShrink: 0 }}><div style={{ fontSize: 12, fontWeight: 600, color: t.text }}>{Number(e.quantity).toFixed(1)} {e.unit}</div>{e.dollar_value > 0 &&<div style={{ fontSize: 10, color: '#f97316' }}>${Number(e.dollar_value).toFixed(2)}</div>}</div><button onClick={() =>{ setEditing({ ...e }); setShowForm(true); }} style={{ background: 'none', border: 'none', color: '#f97316', cursor: 'pointer', fontSize: 13, padding: '2px 4px' }}></button><button onClick={() =>del(e.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 13, padding: '2px 4px' }}></button></div>))}</div></div>{/* PRO hint */}
            {!canUse?.('aiAnalysis') && (<div style={{ background: t.section, border: `1px solid ${t.cardBorder}`, borderRadius: 8, padding: '10px 14px', fontSize: 11, color: t.textMuted, display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 13 }}></span><span>{lang === 'en' ? 'Upgrade to Pro for AI waste analysis, trend detection, and sustainability report PDF.' : 'Passez à Pro pour l\'analyse IA du gaspillage, la détection de tendances et le rapport de durabilité PDF.'}</span></div>)}</>)
      }</div>
  );
}
