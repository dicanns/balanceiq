// EcocontributionTab.jsx — ÉEQ packaging fee calculator (Franchise tier)
import { useState, useEffect, useCallback, useMemo } from 'react';

const MATERIAL_CATEGORIES = [
  { id: 'corrugated',          labelFr: 'Carton ondulé / Kraft',                  labelEn: 'Corrugated cardboard / Kraft' },
  { id: 'flat_cardboard',      labelFr: 'Carton plat / Papier',                   labelEn: 'Flat cardboard / Paper' },
  { id: 'paper_laminates',     labelFr: 'Papier laminé (verres, contenants)',      labelEn: 'Paper laminates (cups, containers)' },
  { id: 'pp_plastic',          labelFr: 'Polypropylène (PP)',                      labelEn: 'Polypropylene (PP)' },
  { id: 'pet_plastic',         labelFr: 'PET',                                     labelEn: 'PET' },
  { id: 'hdpe_film',           labelFr: 'Films et sacs PEHD/PEBD',                labelEn: 'HDPE/LDPE films & bags' },
  { id: 'polystyrene_pvc_pla', labelFr: 'Polystyrène, PVC, PLA',               labelEn: 'Polystyrene, PVC, PLA' },
  { id: 'aluminum',            labelFr: 'Contenants en aluminium',                 labelEn: 'Aluminum containers' },
  { id: 'printed_matter',      labelFr: 'Imprimés (reçus, menus)',                labelEn: 'Printed matter (receipts, menus)' },
];

const DISCLAIMER_FR = 'Cette estimation est fournie à titre indicatif uniquement. Les taux et règles ÉEQ peuvent changer. Vérifiez toujours avec Éco Entreprises Québec (eeq.ca) avant de déclarer.';
const DISCLAIMER_EN = 'This estimate is for reference only. ÉEQ rates and rules may change. Always verify with Éco Entreprises Québec (eeq.ca) before filing.';

const FLAT_FEE_NOTE_FR = 'Si votre tonnage total est entre 1 et 15 tonnes, vous pouvez opter pour le tarif forfaitaire ÉEQ. Consultez le calendrier des tarifs forfaitaires actuel sur eeq.ca pour comparer.';
const FLAT_FEE_NOTE_EN = 'If your total tonnage is between 1 and 15 tonnes, you may opt for the ÉEQ flat fee. Check the current flat fee schedule at eeq.ca to compare.';

function r2(n) { return Math.round((n || 0) * 100) / 100; }
function fmtCA(n) { return (n || 0).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' }); }
function fmtNum(n, dec = 4) { return (n || 0).toFixed(dec); }

export default function EcocontributionTab({ t, T, lang }) {
  const [subTab, setSubTab] = useState('rapport');
  const [items, setItems] = useState([]);
  const [config, setConfig] = useState({ year: new Date().getFullYear(), takeout_percentage: 80, dine_in_percentage: 20, methodology_notes: '', num_quebec_locations: 1 });
  const [rates, setRates] = useState([]);
  const [usage, setUsage] = useState([]);
  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Item form
  const [itemForm, setItemForm] = useState(null); // null = closed, {} = new, {id,...} = editing
  // Rate editing
  const [editingRate, setEditingRate] = useState(null); // {material_category, rate_per_tonne, malus_percentage}

  const isMobile = false;
  const th = { bg: '#0c0e14', card: '#13151f', cardBorder: 'rgba(255,255,255,0.07)', text: '#e5e7eb', textSub: '#9ca3af', textMuted: '#6b7280', inputBg: 'rgba(255,255,255,0.04)', inputBorder: 'rgba(255,255,255,0.1)', section: 'rgba(255,255,255,0.04)' };
  const inputStyle = { background: th.inputBg, border: `1px solid ${th.inputBorder}`, borderRadius: 5, color: th.text, fontSize: 12, padding: '5px 8px', outline: 'none', fontFamily: "'Satoshi',-apple-system,BlinkMacSystemFont,sans-serif" };

  const catLabel = useCallback((id) =>{
    const c = MATERIAL_CATEGORIES.find(m => m.id === id);
    if (!c) return id;
    return lang === 'en' ? c.labelEn : c.labelFr;
  }, [lang]);

  const load = useCallback(async (year) => {
    setLoading(true);
    try {
      const [its, cfg, rts, usg] = await Promise.all([
        window.api.eco.items.getAll(),
        window.api.eco.config.get(),
        window.api.eco.rates.getForYear(year),
        window.api.eco.usage.getForYear(year),
      ]);
      setItems(its || []);
      if (cfg) setConfig(cfg);
      setRates(rts || []);
      setUsage(usg || []);
    } catch (e) { console.error('[EcoTab] load error', e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(reportYear); }, [reportYear, load]);

  const saveConfig = async () => {
    setSaving(true);
    await window.api.eco.config.save(config);
    setSaving(false);
  };

  const saveRate = async (rate) => {
    await window.api.eco.rates.upsert({ ...rate, year: reportYear });
    const updated = await window.api.eco.rates.getForYear(reportYear);
    setRates(updated || []);
    setEditingRate(null);
  };

  const saveItem = async () => {
    if (!itemForm) return;
    const item = { name_fr: itemForm.name_fr || '', name_en: itemForm.name_en || '', material_category: itemForm.material_category || MATERIAL_CATEGORIES[0].id, unit_weight_grams: parseFloat(itemForm.unit_weight_grams) || 0, supplier_id: itemForm.supplier_id || null, active: 1, notes: itemForm.notes || '' };
    if (itemForm.id) item.id = itemForm.id;
    await window.api.eco.items.upsert(item);
    const updated = await window.api.eco.items.getAll();
    setItems(updated || []);
    setItemForm(null);
  };

  const deleteItem = async (id) => {
    if (!window.confirm(lang === 'en' ? 'Archive this packaging item?' : 'Archiver cet article d\'emballage?')) return;
    await window.api.eco.items.delete(id);
    const updated = await window.api.eco.items.getAll();
    setItems(updated || []);
  };

  const setUsageUnits = async (itemId, units) => {
    const val = parseFloat(units) || 0;
    await window.api.eco.usage.upsert({ year: reportYear, packaging_item_id: itemId, annual_units: val, source: 'manual', location_id: 'all', notes: '' });
    const updated = await window.api.eco.usage.getForYear(reportYear);
    setUsage(updated || []);
  };

  // ── Calculation engine ──
  const calcResults = useMemo(() => {
    const takeoutPct = (config.takeout_percentage || 80) / 100;
    const activeItems = items.filter(i => i.active);
    // Map usage by item id
    const usageMap = {};
    usage.forEach(u => { usageMap[u.packaging_item_id] = u.annual_units || 0; });
    // Map rates by category
    const ratesMap = {};
    rates.forEach(r => { ratesMap[r.material_category] = r; });

    // Per-item calculations
    const itemRows = activeItems.map(item => {
      const annualUnits = usageMap[item.id] || 0;
      const takeoutUnits = annualUnits * takeoutPct;
      const weightKg = takeoutUnits * (item.unit_weight_grams || 0) / 1000;
      const weightTonnes = weightKg / 1000;
      return { ...item, annualUnits, takeoutUnits, weightKg, weightTonnes };
    });

    // Group by material category
    const byCategory = {};
    itemRows.forEach(row => {
      if (!byCategory[row.material_category]) byCategory[row.material_category] = { weightTonnes: 0, weightKg: 0, items: [] };
      byCategory[row.material_category].weightTonnes += row.weightTonnes;
      byCategory[row.material_category].weightKg += row.weightKg;
      byCategory[row.material_category].items.push(row);
    });

    // Fee per category
    const catRows = Object.entries(byCategory).map(([cat, data]) => {
      const r = ratesMap[cat] || { rate_per_tonne: 0, malus_percentage: 0, recycled_credit_percentage: 0 };
      const baseFee = data.weightTonnes * r.rate_per_tonne;
      const malus = baseFee * (r.malus_percentage || 0) / 100;
      const credit = baseFee * (r.recycled_credit_percentage || 0) / 100;
      const netFee = baseFee + malus - credit;
      return { cat, label: catLabel(cat), weightKg: data.weightKg, weightTonnes: data.weightTonnes, rateTonne: r.rate_per_tonne, malusPct: r.malus_percentage || 0, creditPct: r.recycled_credit_percentage || 0, baseFee, malus, credit, netFee, items: data.items };
    }).sort((a, b) => a.label.localeCompare(b.label));

    const totalTonnes = catRows.reduce((s, c) => s + c.weightTonnes, 0);
    const totalFee = catRows.reduce((s, c) => s + c.netFee, 0);
    const showFlatFeeNote = totalTonnes >= 1 && totalTonnes<= 15;

    return { itemRows, catRows, totalTonnes, totalFee, showFlatFeeNote };
  }, [items, usage, rates, config, catLabel]);

  const buildReportHTML = () =>{
    const { catRows, totalTonnes, totalFee, showFlatFeeNote } = calcResults;
    const disclaimer = lang === 'en' ? DISCLAIMER_EN : DISCLAIMER_FR;
    const flatNote = lang === 'en' ? FLAT_FEE_NOTE_EN : FLAT_FEE_NOTE_FR;
    const title = lang === 'en' ? `Annual ÉEQ Declaration — Estimate ${reportYear}` : `Déclaration annuelle ÉEQ — Estimation ${reportYear}`;
    const rows = catRows.filter(c => c.weightTonnes > 0).map(c => `<tr><td>${c.label}</td><td>${fmtNum(c.weightKg, 2)} kg</td><td>${fmtNum(c.weightTonnes, 4)} t</td><td>${fmtCA(c.rateTonne)}/t${c.malusPct > 0 ? ` (+${c.malusPct}% malus)` : ''}</td><td><strong>${fmtCA(c.netFee)}</strong></td></tr>`).join('');
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:'Helvetica Neue',sans-serif;color:#1a1a1a;padding:32px;font-size:13px;}
  h1{font-size:20px;font-weight:800;color:#f97316;margin-bottom:4px;}
  .sub{font-size:11px;color:#888;margin-bottom:24px;}
  table{width:100%;border-collapse:collapse;margin-bottom:20px;}
  th{background:#f97316;color:#fff;padding:8px 10px;text-align:left;font-size:12px;}
  td{padding:7px 10px;border-bottom:1px solid #eee;font-size:12px;}
  .total{font-size:22px;font-weight:900;color:#f97316;margin-bottom:8px;}
  .disc{font-size:10px;color:#888;border:1px solid #ddd;padding:10px 14px;border-radius:4px;margin-top:20px;line-height:1.6;}
  .flat{font-size:11px;color:#92400e;background:#fef3c7;border:1px solid #fcd34d;padding:10px 14px;border-radius:4px;margin-bottom:16px;line-height:1.6;}</style></head><body><h1>${title}</h1><p class="sub">${lang === 'en' ? 'Generated' : 'Généré le'} ${new Date().toLocaleDateString('fr-CA')} · ${config.num_quebec_locations} ${lang === 'en' ? 'Quebec location(s)' : 'succursale(s) au Québec'} · ${lang === 'en' ? 'Takeout/delivery' : 'Pour emporter/livraison'}: ${config.takeout_percentage}%</p>${showFlatFeeNote ? `<p class="flat">${flatNote}</p>` : ''}<table><thead><tr><th>${lang === 'en' ? 'Material category' : 'Catégorie de matière'}</th><th>${lang === 'en' ? 'Total kg' : 'Total kg'}</th><th>${lang === 'en' ? 'Total tonnes' : 'Total tonnes'}</th><th>${lang === 'en' ? 'Rate/tonne' : 'Taux/tonne'}</th><th>${lang === 'en' ? 'Net fee' : 'Frais nets'}</th></tr></thead><tbody>${rows || `<tr><td colspan="5" style="text-align:center;color:#888">${lang === 'en' ? 'No data' : 'Aucune donnée'}</td></tr>`}</tbody><tfoot><tr style="font-weight:700;background:#f9f9f9"><td>${lang === 'en' ? 'TOTAL' : 'TOTAL'}</td><td></td><td>${fmtNum(totalTonnes, 4)} t</td><td></td><td>${fmtCA(totalFee)}</td></tr></tfoot></table><p class="disc">${disclaimer}</p></body></html>`;
  };

  if (loading) return<div style={{ padding: 40, color: th.textMuted, textAlign: 'center' }}>Chargement...</div>;

  const SUB_TABS = [
    { id: 'rapport', label: lang === 'en' ? 'Annual Report' : 'Rapport annuel' },
    { id: 'inventaire', label: lang === 'en' ? 'Packaging Inventory' : 'Inventaire emballages' },
    { id: 'config', label: lang === 'en' ? 'Config & Rates' : 'Config & Taux' },
  ];

  return (<div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px', fontFamily: "'Satoshi',-apple-system,BlinkMacSystemFont,sans-serif" }}>{/* Header */}<div style={{ marginBottom: 20 }}><div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}><div style={{ width: 36, height: 32, borderRadius: 7, background: 'linear-gradient(135deg,#16a34a,#15803d)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}></div><div><div style={{ fontSize: 17, fontWeight: 800, color: th.text }}>{lang === 'en' ? 'Écocontribution Calculator' : 'Calculateur d\'écocontribution'}</div><div style={{ fontSize: 11, color: th.textMuted }}>{lang === 'en' ? 'Quebec ÉEQ packaging fee — annual declaration estimate' : 'Frais d\'emballage ÉEQ Québec — estimation de la déclaration annuelle'}</div></div></div>{/* Disclaimer banner */}<div style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)', borderRadius: 6, padding: '8px 12px', fontSize: 10.5, color: '#ca8a04', lineHeight: 1.55 }}>{lang === 'en' ? DISCLAIMER_EN : DISCLAIMER_FR}</div></div>{/* Sub-tabs */}<div style={{ display: 'flex', gap: 4, marginBottom: 18, borderBottom: `1px solid ${th.cardBorder}`, paddingBottom: 0 }}>{SUB_TABS.map(st => (<button key={st.id} onClick={() =>setSubTab(st.id)} style={{ padding: '7px 14px', borderRadius: '6px 6px 0 0', border: `1px solid ${subTab === st.id ? th.cardBorder : 'transparent'}`, borderBottom: subTab === st.id ? `1px solid ${th.card}` : '1px solid transparent', background: subTab === st.id ? th.card : 'transparent', color: subTab === st.id ? '#f97316' : th.textSub, cursor: 'pointer', fontWeight: subTab === st.id ? 700 : 500, fontSize: 12, fontFamily: "'Satoshi',-apple-system,BlinkMacSystemFont,sans-serif", marginBottom: -1 }}>
            {st.label}</button>))}</div>{/* ── RAPPORT ANNUEL ── */}
      {subTab === 'rapport' && (<div>{/* Year picker + total */}<div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><label style={{ fontSize: 12, color: th.textSub, fontWeight: 600 }}>{lang === 'en' ? 'Year' : 'Année'}</label><select value={reportYear} onChange={e =>setReportYear(Number(e.target.value))} style={{ ...inputStyle, width: 90 }}>
                {[2023, 2024, 2025, 2026].map(y =><option key={y} value={y}>{y}</option>)}</select></div><div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}><button onClick={() =>window.api.pdf.print(buildReportHTML())} style={{ padding: '7px 16px', borderRadius: 7, border: '1px solid rgba(249,115,22,0.35)', background: 'rgba(249,115,22,0.08)', color: '#f97316', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                 {lang === 'en' ? 'Print / PDF' : 'Imprimer / PDF'}</button></div></div>{calcResults.showFlatFeeNote && (<div style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 6, padding: '8px 12px', fontSize: 11, color: '#ca8a04', marginBottom: 14, lineHeight: 1.55 }}>{lang === 'en' ? FLAT_FEE_NOTE_EN : FLAT_FEE_NOTE_FR}</div>)}

          {items.filter(i => i.active).length === 0 ? (<div style={{ textAlign: 'center', padding: '48px 20px', color: th.textMuted }}><div style={{ fontSize: 32, marginBottom: 12 }}></div><div style={{ fontSize: 14, fontWeight: 700, color: th.textSub, marginBottom: 6 }}>{lang === 'en' ? 'No packaging items yet' : 'Aucun article d\'emballage'}</div><div style={{ fontSize: 12, marginBottom: 16 }}>{lang === 'en' ? 'Add your packaging items in the Inventory tab first.' : 'Ajoutez vos articles d\'emballage dans l\'onglet Inventaire d\'abord.'}</div><button onClick={() =>setSubTab('inventaire')} style={{ padding: '8px 20px', borderRadius: 8, border: '1.5px solid #f97316', background: 'rgba(249,115,22,0.08)', color: '#f97316', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                {lang === 'en' ? '→ Go to Inventory' : '→ Aller à l\'inventaire'}</button></div>) : (<>{/* Usage input table */}<div style={{ background: th.card, border: `1px solid ${th.cardBorder}`, borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}><div style={{ padding: '10px 14px', borderBottom: `1px solid ${th.cardBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><div style={{ fontSize: 12, fontWeight: 700, color: th.textSub }}>{lang === 'en' ? `Units purchased in ${reportYear} (all locations combined)` : `Unités achetées en ${reportYear} (toutes succursales combinées)`}</div><div style={{ fontSize: 10, color: th.textMuted }}>{lang === 'en' ? `Takeout rate: ${config.takeout_percentage}%` : `Taux pour emporter: ${config.takeout_percentage}%`}</div></div><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}><thead><tr style={{ background: 'rgba(255,255,255,0.03)' }}><th style={{ padding: '8px 14px', textAlign: 'left', color: th.textMuted, fontWeight: 600 }}>{lang === 'en' ? 'Item' : 'Article'}</th><th style={{ padding: '8px 10px', textAlign: 'left', color: th.textMuted, fontWeight: 600 }}>{lang === 'en' ? 'Category' : 'Catégorie'}</th><th style={{ padding: '8px 10px', textAlign: 'right', color: th.textMuted, fontWeight: 600 }}>{lang === 'en' ? 'Unit weight (g)' : 'Poids unitaire (g)'}</th><th style={{ padding: '8px 10px', textAlign: 'right', color: th.textMuted, fontWeight: 600 }}>{lang === 'en' ? 'Annual units' : 'Unités annuelles'}</th><th style={{ padding: '8px 10px', textAlign: 'right', color: th.textMuted, fontWeight: 600 }}>{lang === 'en' ? 'Takeout kg' : 'KG pour emporter'}</th></tr></thead><tbody>{items.filter(i => i.active).map(item => {
                      const row = calcResults.itemRows.find(r => r.id === item.id);
                      const usageVal = (usage.find(u => u.packaging_item_id === item.id)?.annual_units) || 0;
                      return (<tr key={item.id} style={{ borderTop: `1px solid ${th.cardBorder}` }}><td style={{ padding: '7px 14px', color: th.text, fontWeight: 600 }}>{lang === 'en' ? (item.name_en || item.name_fr) : item.name_fr}</td><td style={{ padding: '7px 10px', color: th.textSub, fontSize: 11 }}>{catLabel(item.material_category)}</td><td style={{ padding: '7px 10px', textAlign: 'right', color: th.textSub }}>{item.unit_weight_grams}g</td><td style={{ padding: '4px 10px', textAlign: 'right' }}><input type="number" min="0" step="1" defaultValue={usageVal || ''} placeholder="0"
                              onBlur={e =>setUsageUnits(item.id, e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                              style={{ ...inputStyle, width: 90, textAlign: 'right' }} /></td><td style={{ padding: '7px 10px', textAlign: 'right', color: th.textSub }}>{fmtNum(row?.weightKg || 0, 2)}</td></tr>);
                    })}</tbody></table></div>{/* Results table by category */}<div style={{ background: th.card, border: `1px solid ${th.cardBorder}`, borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}><div style={{ padding: '10px 14px', borderBottom: `1px solid ${th.cardBorder}` }}><div style={{ fontSize: 12, fontWeight: 700, color: th.textSub }}>{lang === 'en' ? 'Fee calculation by material category' : 'Calcul des frais par catégorie de matière'}</div></div><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}><thead><tr style={{ background: 'rgba(255,255,255,0.03)' }}><th style={{ padding: '8px 14px', textAlign: 'left', color: th.textMuted, fontWeight: 600 }}>{lang === 'en' ? 'Category' : 'Catégorie'}</th><th style={{ padding: '8px 10px', textAlign: 'right', color: th.textMuted, fontWeight: 600 }}>{lang === 'en' ? 'Total kg' : 'Total kg'}</th><th style={{ padding: '8px 10px', textAlign: 'right', color: th.textMuted, fontWeight: 600 }}>{lang === 'en' ? 'Tonnes' : 'Tonnes'}</th><th style={{ padding: '8px 10px', textAlign: 'right', color: th.textMuted, fontWeight: 600 }}>{lang === 'en' ? 'Rate/tonne' : 'Taux/tonne'}</th><th style={{ padding: '8px 10px', textAlign: 'right', color: th.textMuted, fontWeight: 600 }}>{lang === 'en' ? 'Net fee' : 'Frais nets'}</th></tr></thead><tbody>{calcResults.catRows.filter(c => c.weightTonnes > 0).length === 0 ? (<tr><td colSpan={5} style={{ textAlign: 'center', padding: '20px', color: th.textMuted, fontSize: 11 }}>{lang === 'en' ? 'Enter annual units above to calculate.' : 'Entrez les unités annuelles ci-dessus pour calculer.'}</td></tr>) : (
                      calcResults.catRows.filter(c => c.weightTonnes > 0).map(c => (<tr key={c.cat} style={{ borderTop: `1px solid ${th.cardBorder}` }}><td style={{ padding: '8px 14px', color: th.text }}>{c.label}</td><td style={{ padding: '8px 10px', textAlign: 'right', color: th.textSub }}>{fmtNum(c.weightKg, 2)}</td><td style={{ padding: '8px 10px', textAlign: 'right', color: th.textSub }}>{fmtNum(c.weightTonnes, 4)}</td><td style={{ padding: '8px 10px', textAlign: 'right', color: th.textSub }}>{fmtCA(c.rateTonne)}{c.malusPct > 0 &&<span style={{ color: '#ef4444', fontSize: 10, marginLeft: 4 }}>+{c.malusPct}%</span>}</td><td style={{ padding: '8px 10px', textAlign: 'right', color: '#f97316', fontWeight: 700 }}>{fmtCA(c.netFee)}</td></tr>))
                    )}</tbody>{calcResults.catRows.some(c => c.weightTonnes > 0) && (<tfoot><tr style={{ borderTop: `2px solid ${th.cardBorder}`, background: 'rgba(249,115,22,0.05)' }}><td style={{ padding: '10px 14px', fontWeight: 800, color: th.text }}>TOTAL</td><td></td><td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 700, color: th.textSub }}>{fmtNum(calcResults.totalTonnes, 4)} t</td><td></td><td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 900, color: '#f97316', fontSize: 16 }}>{fmtCA(calcResults.totalFee)}</td></tr></tfoot>)}</table></div></>)}</div>)}

      {/* ── INVENTAIRE ── */}
      {subTab === 'inventaire' && (<div><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}><div style={{ fontSize: 12, color: th.textSub }}>{lang === 'en' ? 'List all packaging you give to customers (takeout containers, cups, bags, etc.).' : 'Listez tous les emballages remis aux clients (contenants pour emporter, verres, sacs, etc.).'}</div><button onClick={() =>setItemForm({ name_fr: '', name_en: '', material_category: 'corrugated', unit_weight_grams: '', notes: '' })} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#f97316,#ea580c)', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap' }}>
              + {lang === 'en' ? 'Add item' : 'Ajouter un article'}</button></div>{/* Item form */}
          {itemForm && (<div style={{ background: th.card, border: `1px solid rgba(249,115,22,0.3)`, borderRadius: 10, padding: 16, marginBottom: 14 }}><div style={{ fontSize: 12, fontWeight: 700, color: th.text, marginBottom: 12 }}>{itemForm.id ? (lang === 'en' ? 'Edit item' : 'Modifier l\'article') : (lang === 'en' ? 'New packaging item' : 'Nouvel article d\'emballage')}</div><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}><div><div style={{ fontSize: 10.5, color: th.textMuted, marginBottom: 3 }}>{lang === 'en' ? 'Name (French)' : 'Nom (français)'} *</div><input value={itemForm.name_fr} onChange={e =>setItemForm(f => ({ ...f, name_fr: e.target.value }))} placeholder="ex: Boîte hamburger" style={{ ...inputStyle, width: '100%' }} /></div><div><div style={{ fontSize: 10.5, color: th.textMuted, marginBottom: 3 }}>{lang === 'en' ? 'Name (English)' : 'Nom (anglais)'}</div><input value={itemForm.name_en} onChange={e =>setItemForm(f => ({ ...f, name_en: e.target.value }))} placeholder="ex: Burger box" style={{ ...inputStyle, width: '100%' }} /></div><div><div style={{ fontSize: 10.5, color: th.textMuted, marginBottom: 3 }}>{lang === 'en' ? 'Material category' : 'Catégorie de matière'} *</div><select value={itemForm.material_category} onChange={e =>setItemForm(f => ({ ...f, material_category: e.target.value }))} style={{ ...inputStyle, width: '100%' }}>
                    {MATERIAL_CATEGORIES.map(c =><option key={c.id} value={c.id}>{lang === 'en' ? c.labelEn : c.labelFr}</option>)}</select></div><div><div style={{ fontSize: 10.5, color: th.textMuted, marginBottom: 3 }}>{lang === 'en' ? 'Unit weight (grams)' : 'Poids unitaire (grammes)'} *</div><input type="number" min="0" step="0.1" value={itemForm.unit_weight_grams} onChange={e =>setItemForm(f => ({ ...f, unit_weight_grams: e.target.value }))} placeholder="ex: 12.5" style={{ ...inputStyle, width: '100%' }} /></div></div><div style={{ marginBottom: 10 }}><div style={{ fontSize: 10.5, color: th.textMuted, marginBottom: 3 }}>{lang === 'en' ? 'Notes' : 'Notes'}</div><input value={itemForm.notes} onChange={e =>setItemForm(f => ({ ...f, notes: e.target.value }))} placeholder={lang === 'en' ? 'Supplier, SKU, etc.' : 'Fournisseur, SKU, etc.'} style={{ ...inputStyle, width: '100%' }} /></div><div style={{ display: 'flex', gap: 8 }}><button onClick={saveItem} disabled={!itemForm.name_fr || !itemForm.unit_weight_grams} style={{ padding: '7px 18px', borderRadius: 7, border: 'none', background: 'linear-gradient(135deg,#f97316,#ea580c)', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 12, opacity: (!itemForm.name_fr || !itemForm.unit_weight_grams) ? 0.5 : 1 }}>{lang === 'en' ? 'Save' : 'Enregistrer'}</button><button onClick={() =>setItemForm(null)} style={{ padding: '7px 14px', borderRadius: 7, border: `1px solid ${th.cardBorder}`, background: 'none', color: th.textMuted, cursor: 'pointer', fontSize: 12 }}>
                  {lang === 'en' ? 'Cancel' : 'Annuler'}</button></div></div>)}

          {items.length === 0 && !itemForm ? (<div style={{ textAlign: 'center', padding: '48px 20px', color: th.textMuted }}><div style={{ fontSize: 32, marginBottom: 10 }}></div><div style={{ fontSize: 14, fontWeight: 700, color: th.textSub, marginBottom: 6 }}>{lang === 'en' ? 'No packaging items yet' : 'Aucun article d\'emballage'}</div><div style={{ fontSize: 12 }}>{lang === 'en' ? 'Click "Add item" to get started.' : 'Cliquez sur "Ajouter un article" pour commencer.'}</div></div>) : (<div style={{ background: th.card, border: `1px solid ${th.cardBorder}`, borderRadius: 10, overflow: 'hidden' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}><thead><tr style={{ background: 'rgba(255,255,255,0.03)' }}><th style={{ padding: '8px 14px', textAlign: 'left', color: th.textMuted, fontWeight: 600 }}>{lang === 'en' ? 'Name' : 'Nom'}</th><th style={{ padding: '8px 10px', textAlign: 'left', color: th.textMuted, fontWeight: 600 }}>{lang === 'en' ? 'Category' : 'Catégorie'}</th><th style={{ padding: '8px 10px', textAlign: 'right', color: th.textMuted, fontWeight: 600 }}>{lang === 'en' ? 'Weight (g)' : 'Poids (g)'}</th><th style={{ padding: '8px 10px', textAlign: 'left', color: th.textMuted, fontWeight: 600 }}>{lang === 'en' ? 'Notes' : 'Notes'}</th><th style={{ padding: '8px 10px', textAlign: 'center', color: th.textMuted, fontWeight: 600 }}></th></tr></thead><tbody>{items.map(item => (<tr key={item.id} style={{ borderTop: `1px solid ${th.cardBorder}`, opacity: item.active ? 1 : 0.45 }}><td style={{ padding: '8px 14px', color: th.text, fontWeight: 600 }}>{lang === 'en' ? (item.name_en || item.name_fr) : item.name_fr}
                        {item.name_en && item.name_fr !== item.name_en &&<div style={{ fontSize: 10, color: th.textMuted }}>{lang === 'en' ? item.name_fr : item.name_en}</div>}</td><td style={{ padding: '8px 10px', color: th.textSub, fontSize: 11 }}>{catLabel(item.material_category)}</td><td style={{ padding: '8px 10px', textAlign: 'right', color: th.textSub }}>{item.unit_weight_grams}g</td><td style={{ padding: '8px 10px', color: th.textMuted, fontSize: 11 }}>{item.notes || '—'}</td><td style={{ padding: '8px 10px', textAlign: 'center' }}><div style={{ display: 'flex', gap: 5, justifyContent: 'center' }}><button onClick={() =>setItemForm({ ...item })} style={{ padding: '3px 10px', borderRadius: 5, border: `1px solid ${th.cardBorder}`, background: 'none', color: th.textSub, cursor: 'pointer', fontSize: 11 }}></button>{item.active ?<button onClick={() =>deleteItem(item.id)} style={{ padding: '3px 8px', borderRadius: 5, border: '1px solid rgba(239,68,68,0.3)', background: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 11 }}></button>: null}</div></td></tr>))}</tbody></table></div>)}</div>)}

      {/* ── CONFIG & RATES ── */}
      {subTab === 'config' && (<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>{/* Config card */}<div style={{ background: th.card, border: `1px solid ${th.cardBorder}`, borderRadius: 10, padding: 16 }}><div style={{ fontSize: 13, fontWeight: 700, color: th.text, marginBottom: 14 }}>{lang === 'en' ? 'Declaration configuration' : 'Configuration de la déclaration'}</div><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}><div><div style={{ fontSize: 10.5, color: th.textMuted, marginBottom: 3 }}>{lang === 'en' ? 'Takeout/delivery orders (%)' : 'Commandes pour emporter/livraison (%)'}</div><input type="number" min="0" max="100" step="1" value={config.takeout_percentage} onChange={e =>setConfig(c => ({ ...c, takeout_percentage: parseFloat(e.target.value) || 0, dine_in_percentage: 100 - (parseFloat(e.target.value) || 0) }))} style={{ ...inputStyle, width: '100%' }} /><div style={{ fontSize: 10, color: th.textMuted, marginTop: 3 }}>{lang === 'en' ? `Dine-in (exempt): ${config.dine_in_percentage}%` : `Sur place (exempté): ${config.dine_in_percentage}%`}</div></div><div><div style={{ fontSize: 10.5, color: th.textMuted, marginBottom: 3 }}>{lang === 'en' ? 'Number of Quebec locations' : 'Nombre de succursales au Québec'}</div><input type="number" min="1" step="1" value={config.num_quebec_locations} onChange={e =>setConfig(c => ({ ...c, num_quebec_locations: parseInt(e.target.value) || 1 }))} style={{ ...inputStyle, width: '100%' }} /></div></div><div style={{ marginBottom: 14 }}><div style={{ fontSize: 10.5, color: th.textMuted, marginBottom: 3 }}>{lang === 'en' ? 'Methodology notes (audit trail)' : 'Notes de méthodologie (piste d\'audit)'}</div><textarea rows={3} value={config.methodology_notes} onChange={e =>setConfig(c => ({ ...c, methodology_notes: e.target.value }))} placeholder={lang === 'en' ? 'How you determined the takeout split, data sources, etc.' : 'Comment vous avez déterminé la répartition pour emporter, sources de données, etc.'} style={{ ...inputStyle, width: '100%', resize: 'vertical' }} /></div><button onClick={saveConfig} disabled={saving} style={{ padding: '7px 18px', borderRadius: 7, border: 'none', background: 'linear-gradient(135deg,#f97316,#ea580c)', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>{saving ? '...' : (lang === 'en' ? 'Save configuration' : 'Enregistrer la configuration')}</button></div>{/* Rates table */}<div style={{ background: th.card, border: `1px solid ${th.cardBorder}`, borderRadius: 10, overflow: 'hidden' }}><div style={{ padding: '10px 14px', borderBottom: `1px solid ${th.cardBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><div><div style={{ fontSize: 12, fontWeight: 700, color: th.text }}>{lang === 'en' ? `ÉEQ PFP Rates — ${reportYear}` : `Taux PFP ÉEQ — ${reportYear}`}</div><div style={{ fontSize: 10, color: th.textMuted, marginTop: 2 }}>{lang === 'en' ? 'Pre-populated with 2025 rates. Edit if ÉEQ updates the schedule.' : 'Pré-rempli avec les taux 2025. Modifiez si ÉEQ met à jour le barème.'}</div></div><select value={reportYear} onChange={e =>setReportYear(Number(e.target.value))} style={{ ...inputStyle, width: 90 }}>
                {[2023, 2024, 2025, 2026].map(y =><option key={y} value={y}>{y}</option>)}</select></div><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}><thead><tr style={{ background: 'rgba(255,255,255,0.03)' }}><th style={{ padding: '8px 14px', textAlign: 'left', color: th.textMuted, fontWeight: 600 }}>{lang === 'en' ? 'Material category' : 'Catégorie de matière'}</th><th style={{ padding: '8px 10px', textAlign: 'right', color: th.textMuted, fontWeight: 600 }}>{lang === 'en' ? 'Rate/tonne ($)' : 'Taux/tonne ($)'}</th><th style={{ padding: '8px 10px', textAlign: 'right', color: th.textMuted, fontWeight: 600 }}>{lang === 'en' ? 'Malus (%)' : 'Malus (%)'}</th><th style={{ padding: '8px 10px', textAlign: 'center', color: th.textMuted, fontWeight: 600 }}></th></tr></thead><tbody>{MATERIAL_CATEGORIES.map(cat => {
                  const r = rates.find(x => x.material_category === cat.id) || { material_category: cat.id, rate_per_tonne: 0, malus_percentage: 0, recycled_credit_percentage: 0 };
                  const isEditing = editingRate?.material_category === cat.id;
                  return (<tr key={cat.id} style={{ borderTop: `1px solid ${th.cardBorder}` }}><td style={{ padding: '8px 14px', color: th.text }}>{lang === 'en' ? cat.labelEn : cat.labelFr}</td>{isEditing ? (<><td style={{ padding: '4px 10px', textAlign: 'right' }}><input type="number" min="0" step="0.01" value={editingRate.rate_per_tonne} onChange={e =>setEditingRate(x => ({ ...x, rate_per_tonne: parseFloat(e.target.value) || 0 }))} style={{ ...inputStyle, width: 90, textAlign: 'right' }} /></td><td style={{ padding: '4px 10px', textAlign: 'right' }}><input type="number" min="0" step="1" value={editingRate.malus_percentage} onChange={e =>setEditingRate(x => ({ ...x, malus_percentage: parseFloat(e.target.value) || 0 }))} style={{ ...inputStyle, width: 70, textAlign: 'right' }} /></td><td style={{ padding: '4px 10px', textAlign: 'center' }}><div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}><button onClick={() =>saveRate(editingRate)} style={{ padding: '3px 10px', borderRadius: 5, border: 'none', background: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}></button><button onClick={() =>setEditingRate(null)} style={{ padding: '3px 8px', borderRadius: 5, border: `1px solid ${th.cardBorder}`, background: 'none', color: th.textMuted, cursor: 'pointer', fontSize: 11 }}></button></div></td></>) : (<><td style={{ padding: '8px 10px', textAlign: 'right', color: '#f97316', fontWeight: 700 }}>{fmtCA(r.rate_per_tonne)}</td><td style={{ padding: '8px 10px', textAlign: 'right', color: r.malus_percentage >0 ? '#ef4444' : th.textMuted }}>{r.malus_percentage > 0 ? `${r.malus_percentage}%` : '—'}</td><td style={{ padding: '8px 10px', textAlign: 'center' }}><button onClick={() =>setEditingRate({ ...r })} style={{ padding: '3px 10px', borderRadius: 5, border: `1px solid ${th.cardBorder}`, background: 'none', color: th.textSub, cursor: 'pointer', fontSize: 11 }}></button></td></>)}</tr>);
                })}</tbody></table></div></div>)}</div>
  );
}
