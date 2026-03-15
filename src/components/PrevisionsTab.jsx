import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';

// ── Helpers ──────────────────────────────────────────────────────────────────

function uuid() { return crypto.randomUUID(); }

function toDateStr(d) {
  if (typeof d === 'string') return d;
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

function getMondayOf(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const dow = d.getDay(); // 0=Sun
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return toDateStr(d);
}

function getWeekDates(monday) {
  return Array.from({length:7}, (_,i) => addDays(monday, i));
}

function formatDateShort(dateStr, lang) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString(lang==='en'?'en-CA':'fr-CA', {weekday:'short', day:'numeric', month:'short'});
}

function formatDateFull(dateStr, lang) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString(lang==='en'?'en-CA':'fr-CA', {weekday:'long', day:'numeric', month:'long'});
}

function getDayName(dateStr, lang) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString(lang==='en'?'en-CA':'fr-CA', {weekday:'short'});
}

function getDayFullName(dow, lang) {
  const days = lang === 'en'
    ? ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
    : ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  return days[dow];
}

const WEATHER_ICONS = {
  sunny: '☀️', cloudy: '☁️', rain: '🌧', snow: '🌨', storm: '⛈',
};

function weatherCodeToCondition(code) {
  if (!code && code !== 0) return 'cloudy';
  if (code === 0 || code === 1) return 'sunny';
  if (code <= 3) return 'cloudy';
  if (code >= 51 && code <= 67) return 'rain';
  if (code >= 71 && code <= 77) return 'snow';
  if (code >= 80 && code <= 82) return 'rain';
  if (code >= 95) return 'storm';
  return 'cloudy';
}

function conditionToIcon(cond) { return WEATHER_ICONS[cond] || '☁️'; }

// ── Prediction Engine ─────────────────────────────────────────────────────────

function computePrediction(productId, dateStr, allSales, weatherMap, product) {
  const targetDow = new Date(dateStr + 'T12:00:00').getDay();
  const sameDowSales = allSales
    .filter(s => s.product_id === productId && new Date(s.date + 'T12:00:00').getDay() === targetDow)
    .sort((a,b) => b.date.localeCompare(a.date));

  if (sameDowSales.length === 0) {
    return { prediction: product.base_quantity || 0, confidence: 'base', dataPoints: 0, baseAvg: product.base_quantity || 0, weatherFactor: 0, trendFactor: 0 };
  }

  const now = new Date(dateStr + 'T12:00:00');
  let weightedSum = 0, totalWeight = 0;
  sameDowSales.forEach(s => {
    const weeksAgo = Math.round((now - new Date(s.date + 'T12:00:00')) / (7 * 86400000));
    const w = weeksAgo === 0 ? 4 : weeksAgo === 1 ? 4 : weeksAgo === 2 ? 3 : weeksAgo === 3 ? 2 : 1;
    const qty = s.stockout ? Math.round(s.quantity_sold * 1.12) : s.quantity_sold;
    weightedSum += qty * w;
    totalWeight += w;
  });
  const baseAvg = totalWeight > 0 ? weightedSum / totalWeight : product.base_quantity || 0;

  // Weather adjustment
  let weatherFactor = 0;
  const w = weatherMap[dateStr];
  if (w && product.weather_sensitivity !== 0) {
    const temp = w.temp_max ?? 10;
    const sens = product.weather_sensitivity;
    if (temp < 5) weatherFactor = sens * -0.15;
    else if (temp > 25) weatherFactor = sens * 0.20;
    else if (temp > 15) weatherFactor = sens * 0.10;
    const cond = weatherCodeToCondition(w.weather_code);
    if (cond === 'rain') weatherFactor -= 0.05;
    if (cond === 'snow') weatherFactor -= 0.10;
  }

  // Trend adjustment
  let trendFactor = 0;
  if (sameDowSales.length >= 4) {
    const recent2 = sameDowSales.slice(0,2).reduce((a,s)=>a+s.quantity_sold,0) / 2;
    const prev2 = sameDowSales.slice(2,4).reduce((a,s)=>a+s.quantity_sold,0) / 2;
    if (prev2 > 0) trendFactor = Math.max(-0.15, Math.min(0.15, (recent2-prev2)/prev2 * 0.5));
  }

  const n = sameDowSales.length;
  const confidence = n < 2 ? 'base' : n < 4 ? 'low' : n < 8 ? 'medium' : 'high';
  const prediction = Math.max(0, Math.round(baseAvg * (1 + weatherFactor + trendFactor)));
  return { prediction, confidence, dataPoints: n, baseAvg: Math.round(baseAvg), weatherFactor, trendFactor };
}

function computeAlerts(products, allSales, T, lang) {
  const alerts = { stockout: [], overproduction: [], optimized: [] };
  const now = new Date();
  const cutoff = toDateStr(new Date(now.getTime() - 28 * 86400000));

  products.filter(p=>p.active).forEach(product => {
    const recent = allSales.filter(s => s.product_id === product.id && s.date >= cutoff);
    if (recent.length < 4) return;

    // Group by DOW
    const byDow = {};
    recent.forEach(s => {
      const dow = new Date(s.date + 'T12:00:00').getDay();
      if (!byDow[dow]) byDow[dow] = [];
      byDow[dow].push(s);
    });

    Object.entries(byDow).forEach(([dow, sales]) => {
      if (sales.length < 2) return;
      const stockouts = sales.filter(s=>s.stockout).length;
      const withMade = sales.filter(s=>s.quantity_made!=null&&s.quantity_made>0);
      const avgWaste = withMade.length > 0
        ? withMade.reduce((a,s)=>a+(s.quantity_made-s.quantity_sold)/s.quantity_made,0)/withMade.length
        : 0;
      const avgSold = sales.reduce((a,s)=>a+s.quantity_sold,0)/sales.length;
      const dowName = getDayFullName(Number(dow), lang);

      if (stockouts >= 2) {
        const suggested = Math.round(avgSold * 1.15);
        alerts.stockout.push({ product, dowName, count: stockouts, suggested, type:'stockout' });
      } else if (avgWaste > 0.15 && withMade.length >= 2) {
        const avgMade = withMade.reduce((a,s)=>a+s.quantity_made,0)/withMade.length;
        const suggested = Math.round(avgSold * 1.05);
        alerts.overproduction.push({ product, dowName, wastePct: Math.round(avgWaste*100), avgMade:Math.round(avgMade), avgSold:Math.round(avgSold), suggested, type:'overproduction' });
      } else if (stockouts === 0 && avgWaste < 0.10 && withMade.length >= 2) {
        alerts.optimized.push({ product, type:'optimized' });
      }
    });
  });
  // Deduplicate optimized by product
  const seenOptimized = new Set();
  alerts.optimized = alerts.optimized.filter(a => {
    if (seenOptimized.has(a.product.id)) return false;
    seenOptimized.add(a.product.id);
    return true;
  });
  return alerts;
}

// ── Weather fetch ─────────────────────────────────────────────────────────────

async function fetchWeatherForecast(lat, lng) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode&timezone=auto&forecast_days=7`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Weather API error');
  const data = await res.json();
  return data.daily.time.map((date, i) => ({
    date,
    temp_max: data.daily.temperature_2m_max[i],
    temp_min: data.daily.temperature_2m_min[i],
    precipitation: data.daily.precipitation_sum[i],
    weather_code: data.daily.weathercode[i],
    source: 'auto',
  }));
}

// ── Product Form Modal ────────────────────────────────────────────────────────

function ProductFormModal({ product, existingCategories, onSave, onClose, T, t }) {
  const [form, setForm] = useState({
    id: product?.id || uuid(),
    name: product?.name || '',
    category: product?.category || '',
    base_quantity: product?.base_quantity ?? 0,
    shelf_life_days: product?.shelf_life_days ?? 1,
    weather_sensitivity: product?.weather_sensitivity ?? 0,
    active: product?.active ?? 1,
    notes: product?.notes || '',
  });
  const [newCat, setNewCat] = useState('');
  const [catMode, setCatMode] = useState(false);

  const ws = [
    { value:-2, label: T.prevWSMinus2 },
    { value:-1, label: T.prevWSMinus1 },
    { value: 0, label: T.prevWSZero },
    { value: 1, label: T.prevWSPlus1 },
    { value: 2, label: T.prevWSPlus2 },
  ];

  const inp = { background:t.inputBg, border:`1px solid ${t.inputBorder}`, borderRadius:5, color:t.text, fontSize:12, padding:'5px 8px', outline:'none', width:'100%', boxSizing:'border-box', fontFamily:"'Outfit',sans-serif" };

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{background:t.cardBg,border:`1px solid ${t.cardBorder}`,borderRadius:12,padding:24,width:420,maxWidth:'95vw',maxHeight:'90vh',overflowY:'auto'}}>
        <div style={{fontSize:14,fontWeight:700,color:t.text,marginBottom:16}}>{product ? T.prevProdEdit : T.prevProdNew}</div>

        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          <div>
            <label style={{fontSize:11,color:t.textMuted,display:'block',marginBottom:3}}>{T.prevProdName} *</label>
            <input style={inp} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} autoFocus/>
          </div>

          <div>
            <label style={{fontSize:11,color:t.textMuted,display:'block',marginBottom:3}}>{T.prevProdCategory}</label>
            {catMode
              ? <div style={{display:'flex',gap:6}}>
                  <input style={{...inp,flex:1}} value={newCat} onChange={e=>setNewCat(e.target.value)} placeholder={T.prevProdNewCategory} autoFocus/>
                  <button onClick={()=>{setForm(f=>({...f,category:newCat.trim()}));setCatMode(false);}} style={{padding:'5px 10px',borderRadius:5,border:'none',background:'#f97316',color:'#fff',cursor:'pointer',fontSize:11,fontWeight:600}}>OK</button>
                  <button onClick={()=>setCatMode(false)} style={{padding:'5px 8px',borderRadius:5,border:`1px solid ${t.cardBorder}`,background:t.section,color:t.textSub,cursor:'pointer',fontSize:11}}>✕</button>
                </div>
              : <div style={{display:'flex',gap:6}}>
                  <select style={{...inp,flex:1}} value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>
                    <option value="">{T.prevProdUncategorized}</option>
                    {existingCategories.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                  <button onClick={()=>{setNewCat('');setCatMode(true);}} style={{padding:'5px 8px',borderRadius:5,border:`1px solid ${t.cardBorder}`,background:t.section,color:t.textSub,cursor:'pointer',fontSize:11,whiteSpace:'nowrap'}}>+</button>
                </div>
            }
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            <div>
              <label style={{fontSize:11,color:t.textMuted,display:'block',marginBottom:3}}>{T.prevProdBaseQty}</label>
              <input type="number" min="0" style={inp} value={form.base_quantity} onChange={e=>setForm(f=>({...f,base_quantity:parseInt(e.target.value)||0}))}/>
            </div>
            <div>
              <label style={{fontSize:11,color:t.textMuted,display:'block',marginBottom:3}}>{T.prevProdShelfLife}</label>
              <input type="number" min="1" max="30" style={inp} value={form.shelf_life_days} onChange={e=>setForm(f=>({...f,shelf_life_days:parseInt(e.target.value)||1}))}/>
            </div>
          </div>

          <div>
            <label style={{fontSize:11,color:t.textMuted,display:'block',marginBottom:3}}>{T.prevProdWeatherSens}</label>
            <select style={inp} value={form.weather_sensitivity} onChange={e=>setForm(f=>({...f,weather_sensitivity:parseInt(e.target.value)}))}>
              {ws.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div>
            <label style={{fontSize:11,color:t.textMuted,display:'block',marginBottom:3}}>{T.prevProdNotes}</label>
            <textarea style={{...inp,minHeight:54,resize:'vertical'}} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/>
          </div>
        </div>

        <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:18}}>
          <button onClick={onClose} style={{padding:'7px 16px',borderRadius:6,border:`1px solid ${t.cardBorder}`,background:t.section,color:t.textSub,cursor:'pointer',fontSize:12}}>{T.prevImportCancel}</button>
          <button onClick={()=>{ if(!form.name.trim()) return; onSave(form); }} style={{padding:'7px 16px',borderRadius:6,border:'none',background:'linear-gradient(135deg,#f97316,#ea580c)',color:'#fff',cursor:'pointer',fontSize:12,fontWeight:600}}>{T.prevProdSave}</button>
        </div>
      </div>
    </div>
  );
}

// ── Weather Override Modal ────────────────────────────────────────────────────

function WeatherOverrideModal({ date, existing, onSave, onClose, T, t, lang }) {
  const [temp, setTemp] = useState(existing?.temp_max ?? 15);
  const [cond, setCond] = useState(weatherCodeToCondition(existing?.weather_code) || 'cloudy');
  const condOptions = ['sunny','cloudy','rain','snow','storm'];
  const condLabels = { sunny:T.prevCondSunny, cloudy:T.prevCondCloudy, rain:T.prevCondRain, snow:T.prevCondSnow, storm:T.prevCondStorm };
  const condCodes = { sunny:0, cloudy:2, rain:61, snow:71, storm:95 };
  const inp = { background:t.inputBg, border:`1px solid ${t.inputBorder}`, borderRadius:5, color:t.text, fontSize:12, padding:'5px 8px', outline:'none', fontFamily:"'Outfit',sans-serif" };

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1100,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{background:t.cardBg,border:`1px solid ${t.cardBorder}`,borderRadius:12,padding:20,width:280}}>
        <div style={{fontSize:13,fontWeight:700,color:t.text,marginBottom:12}}>{T.prevWeatherOverride} — {formatDateShort(date, lang)}</div>
        <div style={{marginBottom:10}}>
          <label style={{fontSize:11,color:t.textMuted,display:'block',marginBottom:3}}>{T.prevWeatherTemp}</label>
          <input type="number" style={{...inp,width:'100%',boxSizing:'border-box'}} value={temp} onChange={e=>setTemp(parseFloat(e.target.value)||0)}/>
        </div>
        <div style={{marginBottom:14}}>
          <label style={{fontSize:11,color:t.textMuted,display:'block',marginBottom:3}}>{T.prevWeatherCond}</label>
          <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
            {condOptions.map(c=>(
              <button key={c} onClick={()=>setCond(c)} style={{padding:'4px 8px',borderRadius:12,border:`1px solid ${cond===c?'#f97316':t.cardBorder}`,background:cond===c?'rgba(249,115,22,0.15)':t.section,color:cond===c?'#f97316':t.textSub,cursor:'pointer',fontSize:11}}>{condLabels[c]}</button>
            ))}
          </div>
        </div>
        <div style={{display:'flex',justifyContent:'flex-end',gap:8}}>
          <button onClick={onClose} style={{padding:'6px 14px',borderRadius:6,border:`1px solid ${t.cardBorder}`,background:t.section,color:t.textSub,cursor:'pointer',fontSize:11}}>{T.prevImportCancel}</button>
          <button onClick={()=>onSave({ date, temp_max:temp, temp_min:temp-5, precipitation:0, weather_code:condCodes[cond], source:'manual' })} style={{padding:'6px 14px',borderRadius:6,border:'none',background:'linear-gradient(135deg,#f97316,#ea580c)',color:'#fff',cursor:'pointer',fontSize:11,fontWeight:600}}>{T.prevProdSave}</button>
        </div>
      </div>
    </div>
  );
}

// ── Cell Detail Popover ───────────────────────────────────────────────────────

function CellDetailPopover({ product, dateStr, result, weatherMap, T, t, lang, onClose }) {
  const w = weatherMap[dateStr];
  const confLabels = { base:T.prevConfBase, low:T.prevConfLow, medium:T.prevConfMed, high:T.prevConfHigh };
  const confColors = { base:'#6b7280', low:'#ef4444', medium:'#f59e0b', high:'#22c55e' };
  const pct = v => `${v>0?'+':''}${Math.round(v*100)}%`;

  return (
    <div style={{position:'fixed',inset:0,zIndex:1200,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={onClose}>
      <div style={{background:t.cardBg,border:`1px solid ${t.cardBorder}`,borderRadius:10,padding:16,width:260,boxShadow:'0 8px 32px rgba(0,0,0,0.3)'}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:12,fontWeight:700,color:t.text,marginBottom:8}}>{T.prevCellDetail}{product.name}</div>
        <div style={{fontSize:10.5,color:t.textMuted,marginBottom:2}}>{formatDateFull(dateStr, lang)}</div>
        <div style={{fontSize:18,fontWeight:800,color:'#f97316',marginBottom:8}}>{result.prediction}</div>
        <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:10}}>
          <span style={{fontSize:10,fontWeight:700,color:confColors[result.confidence],background:`${confColors[result.confidence]}20`,border:`1px solid ${confColors[result.confidence]}40`,borderRadius:8,padding:'1px 7px'}}>{confLabels[result.confidence]}</span>
          <span style={{fontSize:10,color:t.textMuted}}>{T.prevDataPoints(result.dataPoints)}</span>
        </div>
        <div style={{fontSize:11,color:t.textSub,lineHeight:1.7}}>
          <div>{T.prevWeightedAvg}: <strong style={{color:t.text}}>{result.baseAvg}</strong></div>
          {result.weatherFactor !== 0 && <div>{T.prevWeatherAdj}: <strong style={{color:result.weatherFactor>0?'#22c55e':'#ef4444'}}>{pct(result.weatherFactor)}</strong>{w&&` (${conditionToIcon(weatherCodeToCondition(w.weather_code))} ${Math.round(w.temp_max||0)}°C)`}</div>}
          {result.trendFactor !== 0 && <div>{T.prevTrendAdj}: <strong style={{color:result.trendFactor>0?'#22c55e':'#ef4444'}}>{pct(result.trendFactor)}</strong></div>}
        </div>
        <button onClick={onClose} style={{marginTop:10,padding:'4px 12px',borderRadius:5,border:`1px solid ${t.cardBorder}`,background:t.section,color:t.textSub,cursor:'pointer',fontSize:10,width:'100%'}}>✕</button>
      </div>
    </div>
  );
}

// ── Products Sub-view ─────────────────────────────────────────────────────────

function ProductsView({ products, onSaveProduct, T, t }) {
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const categories = [...new Set(products.map(p=>p.category||'').filter(Boolean))];
  const filtered = products.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.category||'').toLowerCase().includes(search.toLowerCase()));
  const grouped = {};
  filtered.forEach(p => { const cat = p.category||''; if (!grouped[cat]) grouped[cat]=[]; grouped[cat].push(p); });

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12,gap:8,flexWrap:'wrap'}}>
        <div>
          <div style={{fontSize:13,fontWeight:700,color:'inherit'}}>{T.prevProdTitle}</div>
          <div style={{fontSize:11,opacity:0.6,marginTop:2}}>{T.prevProdDesc}</div>
        </div>
        <button onClick={()=>{setEditing(null);setShowForm(true);}} style={{padding:'7px 14px',borderRadius:7,border:'none',background:'linear-gradient(135deg,#f97316,#ea580c)',color:'#fff',cursor:'pointer',fontSize:12,fontWeight:600,whiteSpace:'nowrap'}}>{T.prevProdNew}</button>
      </div>

      {products.length > 3 && (
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder={T.prevProdSearch}
          style={{background:t.inputBg,border:`1px solid ${t.inputBorder}`,borderRadius:6,color:'inherit',fontSize:12,padding:'6px 10px',outline:'none',width:'100%',boxSizing:'border-box',marginBottom:12,fontFamily:"'Outfit',sans-serif"}}/>
      )}

      {filtered.length === 0 && (
        <div style={{textAlign:'center',padding:'30px 0',fontSize:12,opacity:0.5}}>{T.prevProdEmpty}</div>
      )}

      {Object.entries(grouped).sort(([a],[b])=>a.localeCompare(b)).map(([cat, prods]) => (
        <div key={cat} style={{marginBottom:14}}>
          <div style={{fontSize:10,fontWeight:700,color:'#f97316',textTransform:'uppercase',letterSpacing:0.5,marginBottom:6}}>{cat||T.prevProdUncategorized}</div>
          {prods.map(p => (
            <div key={p.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 10px',background:t.section,border:`1px solid ${t.cardBorder}`,borderRadius:7,marginBottom:4,opacity:p.active?1:0.5}}>
              <div style={{flex:1,minWidth:0}}>
                <span style={{fontSize:12,fontWeight:600,color:'inherit'}}>{p.name}</span>
                <span style={{fontSize:10.5,opacity:0.55,marginLeft:10}}>base: {p.base_quantity} · {p.shelf_life_days}j</span>
                {p.weather_sensitivity !== 0 && <span style={{fontSize:10,marginLeft:6,color:p.weather_sensitivity>0?'#f97316':'#60a5fa'}}>{p.weather_sensitivity>0?`+${p.weather_sensitivity}☀️`:`${p.weather_sensitivity}❄️`}</span>}
              </div>
              <div style={{display:'flex',gap:5}}>
                <button onClick={()=>{setEditing(p);setShowForm(true);}} style={{padding:'3px 8px',borderRadius:4,border:`1px solid ${t.cardBorder}`,background:t.section,color:'inherit',cursor:'pointer',fontSize:10}}>{T.prevProdEdit}</button>
                <button onClick={()=>onSaveProduct({...p,active:p.active?0:1})} style={{padding:'3px 8px',borderRadius:4,border:`1px solid ${t.cardBorder}`,background:t.section,color:'inherit',cursor:'pointer',fontSize:10}}>{p.active?T.prevProdDeactivate:T.prevProdActivate}</button>
              </div>
            </div>
          ))}
        </div>
      ))}

      {showForm && (
        <ProductFormModal
          product={editing}
          existingCategories={categories}
          onSave={p=>{ onSaveProduct(p); setShowForm(false); setEditing(null); }}
          onClose={()=>{setShowForm(false);setEditing(null);}}
          T={T} t={t}
        />
      )}
    </div>
  );
}

// ── Manual Entry View ─────────────────────────────────────────────────────────

function ManualEntryView({ products, selectedDate, setSelectedDate, salesByDate, onSaveSales, T, t, lang }) {
  const activeProducts = products.filter(p=>p.active);
  const existing = salesByDate[selectedDate] || [];
  const byProd = {};
  existing.forEach(s => { byProd[s.product_id] = s; });

  const [rows, setRows] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Reset rows when date changes
  useEffect(() => {
    const init = {};
    activeProducts.forEach(p => {
      const s = byProd[p.id];
      init[p.id] = { made: s?.quantity_made??'', sold: s?.quantity_sold??'', remaining: s?.quantity_remaining??'', stockout: s?.stockout??0 };
    });
    setRows(init);
    setSaved(false);
  }, [selectedDate, JSON.stringify(salesByDate[selectedDate])]);

  const updateRow = (pid, field, val) => {
    setRows(r => {
      const row = { ...r[pid], [field]: val };
      // Auto-calc remaining if made and sold are filled
      if ((field==='made'||field==='sold') && row.made!=='' && row.sold!=='') {
        const rem = parseInt(row.made) - parseInt(row.sold);
        if (rem >= 0) row.remaining = rem;
      }
      return { ...r, [pid]: row };
    });
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    const records = activeProducts
      .filter(p => rows[p.id]?.sold !== '' && rows[p.id]?.sold != null)
      .map(p => ({
        id: byProd[p.id]?.id || uuid(),
        product_id: p.id,
        date: selectedDate,
        quantity_made: rows[p.id].made !== '' ? parseInt(rows[p.id].made) : null,
        quantity_sold: parseInt(rows[p.id].sold),
        quantity_remaining: rows[p.id].remaining !== '' ? parseInt(rows[p.id].remaining) : null,
        stockout: rows[p.id].stockout ? 1 : 0,
        source: 'manual',
      }));
    await onSaveSales(selectedDate, records);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const inp = { background:t.inputBg, border:`1px solid ${t.inputBorder}`, borderRadius:4, color:'inherit', fontSize:12, padding:'4px 6px', outline:'none', width:70, textAlign:'center', fontFamily:"'DM Mono',monospace" };

  if (activeProducts.length === 0) {
    return <div style={{textAlign:'center',padding:'30px 0',fontSize:12,opacity:0.5}}>{T.prevManualNoProds}</div>;
  }

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14,flexWrap:'wrap'}}>
        <div style={{fontSize:13,fontWeight:700}}>{T.prevManualTitle}<span style={{color:'#f97316'}}>{formatDateFull(selectedDate, lang)}</span></div>
        <input type="date" value={selectedDate} onChange={e=>setSelectedDate(e.target.value)}
          style={{background:t.inputBg,border:`1px solid ${t.inputBorder}`,borderRadius:5,color:'inherit',fontSize:12,padding:'4px 8px',outline:'none',fontFamily:"'Outfit',sans-serif"}}/>
      </div>

      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
          <thead>
            <tr style={{borderBottom:`2px solid ${t.cardBorder}`}}>
              <th style={{textAlign:'left',padding:'6px 8px',color:'inherit',fontWeight:600,fontSize:11}}>{T.prevColProduct}</th>
              <th style={{textAlign:'center',padding:'6px 8px',color:'inherit',fontWeight:600,fontSize:11}}>{T.prevColMade}</th>
              <th style={{textAlign:'center',padding:'6px 8px',color:'inherit',fontWeight:600,fontSize:11}}>{T.prevColSold}</th>
              <th style={{textAlign:'center',padding:'6px 8px',color:'inherit',fontWeight:600,fontSize:11}}>{T.prevColRemaining}</th>
              <th style={{textAlign:'center',padding:'6px 8px',color:'inherit',fontWeight:600,fontSize:11}}>{T.prevColStockout}</th>
            </tr>
          </thead>
          <tbody>
            {activeProducts.map(p => {
              const row = rows[p.id] || { made:'', sold:'', remaining:'', stockout:0 };
              return (
                <tr key={p.id} style={{borderBottom:`1px solid ${t.cardBorder}`}}>
                  <td style={{padding:'6px 8px',fontWeight:600}}>{p.name}{p.category&&<span style={{fontSize:10,opacity:0.5,marginLeft:6}}>{p.category}</span>}</td>
                  <td style={{padding:'6px 8px',textAlign:'center'}}><input type="number" min="0" style={inp} value={row.made} onChange={e=>updateRow(p.id,'made',e.target.value)} placeholder="—"/></td>
                  <td style={{padding:'6px 8px',textAlign:'center'}}><input type="number" min="0" style={{...inp,border:`1px solid ${row.sold!==''?'#f97316':t.inputBorder}`}} value={row.sold} onChange={e=>updateRow(p.id,'sold',e.target.value)} placeholder="0"/></td>
                  <td style={{padding:'6px 8px',textAlign:'center'}}><input type="number" min="0" style={inp} value={row.remaining} onChange={e=>updateRow(p.id,'remaining',e.target.value)} placeholder="—"/></td>
                  <td style={{padding:'6px 8px',textAlign:'center'}}>
                    <input type="checkbox" checked={!!row.stockout} onChange={e=>updateRow(p.id,'stockout',e.target.checked?1:0)} style={{cursor:'pointer',accentColor:'#ef4444',width:14,height:14}}/>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{display:'flex',justifyContent:'flex-end',marginTop:12,gap:8}}>
        {saved && <span style={{fontSize:11,color:'#22c55e',alignSelf:'center'}}>{T.prevManualSaved}</span>}
        <button onClick={handleSave} disabled={saving} style={{padding:'8px 20px',borderRadius:7,border:'none',background:'linear-gradient(135deg,#f97316,#ea580c)',color:'#fff',cursor:'pointer',fontSize:12,fontWeight:600,opacity:saving?0.6:1}}>{saving?'...' :T.prevManualSave}</button>
      </div>
    </div>
  );
}

// ── CSV Import View ───────────────────────────────────────────────────────────

function CSVImportView({ products, onImported, savedFormats, onSaveFormat, T, t, lang }) {
  const [step, setStep] = useState('upload'); // upload | map | unknown | preview | done
  const [rows, setRows] = useState([]);
  const [columns, setColumns] = useState([]);
  const [mapping, setMapping] = useState({ prod:'', sold:'', date:'', made:'', remaining:'' });
  const [importDate, setImportDate] = useState(toDateStr(new Date()));
  const [unknownProds, setUnknownProds] = useState([]); // [{name, action:'add'|'ignore'}]
  const [formatName, setFormatName] = useState('');
  const [savedMsg, setSavedMsg] = useState('');
  const [loadedFormat, setLoadedFormat] = useState('');
  const [result, setResult] = useState(null);

  const productNames = new Set(products.map(p=>p.name.toLowerCase()));
  const inp = { background:t.inputBg, border:`1px solid ${t.inputBorder}`, borderRadius:5, color:'inherit', fontSize:12, padding:'5px 8px', outline:'none', fontFamily:"'Outfit',sans-serif" };

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type:'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws, { header:1 });
      if (!json.length) return;
      const headers = json[0].map(String);
      const dataRows = json.slice(1).filter(r => r.some(c=>c!=null&&c!==''));
      setColumns(headers);
      setRows(dataRows);
      // Auto-apply saved format
      if (loadedFormat) {
        try {
          const fmt = savedFormats.find(f=>f.id===loadedFormat);
          if (fmt) setMapping(JSON.parse(fmt.mapping));
        } catch {}
      }
      setStep('map');
    } catch (err) {
      alert('Error reading file: ' + err.message);
    }
    e.target.value = '';
  };

  const handleConfirmMap = () => {
    if (!mapping.prod || !mapping.sold) return;
    // Find products not in catalog
    const seen = new Set();
    const unknown = [];
    rows.forEach(row => {
      const name = String(row[columns.indexOf(mapping.prod)]||'').trim();
      if (name && !productNames.has(name.toLowerCase()) && !seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase());
        unknown.push({ name, action: 'add' });
      }
    });
    if (unknown.length > 0) { setUnknownProds(unknown); setStep('unknown'); }
    else setStep('preview');
  };

  const handleImport = async () => {
    const toAdd = unknownProds.filter(u=>u.action==='add');
    const newProds = [];
    for (const u of toAdd) {
      const p = { id:uuid(), name:u.name, category:'', base_quantity:0, shelf_life_days:1, weather_sensitivity:0, active:1, notes:'' };
      await window.api.forecast.products.upsert(p);
      newProds.push(p);
    }
    const allProducts = [...products, ...newProds];
    const prodByName = {};
    allProducts.forEach(p => { prodByName[p.name.toLowerCase()] = p; });

    const toImport = [];
    rows.forEach(row => {
      const name = String(row[columns.indexOf(mapping.prod)]||'').trim();
      const prod = prodByName[name.toLowerCase()];
      if (!prod) return;
      const sold = parseInt(row[columns.indexOf(mapping.sold)]);
      if (isNaN(sold)) return;
      const date = mapping.date ? String(row[columns.indexOf(mapping.date)]||'').trim() : importDate;
      const parsedDate = date && date.length >= 8 ? date.substring(0,10) : importDate;
      const made = mapping.made ? parseInt(row[columns.indexOf(mapping.made)]) : null;
      const remaining = mapping.remaining ? parseInt(row[columns.indexOf(mapping.remaining)]) : null;
      toImport.push({ id:uuid(), product_id:prod.id, date:parsedDate, quantity_sold:sold, quantity_made:isNaN(made)?null:made, quantity_remaining:isNaN(remaining)?null:remaining, stockout:0, source:'csv' });
    });

    for (const rec of toImport) await window.api.forecast.sales.upsert(rec);
    setResult(toImport.length);
    setStep('done');
    onImported(toImport, newProds);
  };

  const handleSaveFormat = async () => {
    const m = { id: uuid(), name: formatName.trim() || 'Format ' + new Date().toLocaleDateString(), mapping: JSON.stringify(mapping) };
    await onSaveFormat(m);
    setSavedMsg(T.prevImportSavedFmt);
    setTimeout(()=>setSavedMsg(''),2500);
  };

  const colOpts = ['', ...columns];

  return (
    <div>
      <div style={{fontSize:13,fontWeight:700,marginBottom:12}}>{T.prevImportTitle}</div>

      {step === 'upload' && (
        <div>
          {savedFormats.length > 0 && (
            <div style={{marginBottom:10}}>
              <label style={{fontSize:11,opacity:0.6,display:'block',marginBottom:4}}>{T.prevImportLoadFmt}</label>
              <select style={{...inp,width:'100%',boxSizing:'border-box'}} value={loadedFormat} onChange={e=>setLoadedFormat(e.target.value)}>
                <option value="">{T.prevImportNoFmt}</option>
                {savedFormats.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
          )}
          <label style={{display:'inline-block',padding:'9px 18px',borderRadius:7,background:'linear-gradient(135deg,#f97316,#ea580c)',color:'#fff',cursor:'pointer',fontSize:12,fontWeight:600}}>
            {T.prevImportBtn}
            <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} style={{display:'none'}}/>
          </label>
        </div>
      )}

      {step === 'map' && (
        <div>
          <div style={{fontSize:12,opacity:0.6,marginBottom:10}}>{T.prevImportMapDesc}</div>
          {[['prod',T.prevImportColProd,true],['sold',T.prevImportColSold,true],['date',T.prevImportColDate,false],['made',T.prevImportColMade,false],['remaining',T.prevImportColRem,false]].map(([key,label,required])=>(
            <div key={key} style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
              <span style={{fontSize:11,width:180,flexShrink:0,opacity:0.8}}>{label}{required&&' *'}</span>
              <select style={{...inp,flex:1}} value={mapping[key]} onChange={e=>setMapping(m=>({...m,[key]:e.target.value}))}>
                {colOpts.map(c=><option key={c} value={c}>{c||'—'}</option>)}
              </select>
            </div>
          ))}
          {!mapping.date && (
            <div style={{display:'flex',alignItems:'center',gap:8,marginTop:6,marginBottom:8}}>
              <span style={{fontSize:11,width:180,opacity:0.8}}>{T.prevImportDatePrompt}</span>
              <input type="date" value={importDate} onChange={e=>setImportDate(e.target.value)} style={{...inp,flex:1}}/>
            </div>
          )}
          <div style={{borderTop:`1px solid ${t.cardBorder}`,marginTop:12,paddingTop:12}}>
            <div style={{fontSize:11,opacity:0.6,marginBottom:6}}>{T.prevImportFormatName}</div>
            <div style={{display:'flex',gap:6,marginBottom:10}}>
              <input style={{...inp,flex:1}} value={formatName} onChange={e=>setFormatName(e.target.value)} placeholder="Mon format..."/>
              <button onClick={handleSaveFormat} style={{padding:'5px 12px',borderRadius:5,border:`1px solid ${t.cardBorder}`,background:t.section,color:'inherit',cursor:'pointer',fontSize:11,whiteSpace:'nowrap'}}>{T.prevImportSaveFormat}</button>
              {savedMsg&&<span style={{fontSize:11,color:'#22c55e',alignSelf:'center'}}>{savedMsg}</span>}
            </div>
          </div>
          <div style={{display:'flex',gap:8}}>
            <button onClick={()=>setStep('upload')} style={{padding:'7px 14px',borderRadius:6,border:`1px solid ${t.cardBorder}`,background:t.section,color:'inherit',cursor:'pointer',fontSize:12}}>{T.prevImportCancel}</button>
            <button onClick={handleConfirmMap} disabled={!mapping.prod||!mapping.sold} style={{padding:'7px 14px',borderRadius:6,border:'none',background:'linear-gradient(135deg,#f97316,#ea580c)',color:'#fff',cursor:'pointer',fontSize:12,fontWeight:600,opacity:(!mapping.prod||!mapping.sold)?0.5:1}}>{T.prevImportPreview}</button>
          </div>
        </div>
      )}

      {step === 'unknown' && (
        <div>
          <div style={{fontSize:12,color:'#f59e0b',marginBottom:10,fontWeight:600}}>{T.prevImportNewProds(unknownProds.length)}</div>
          {unknownProds.map((u,i)=>(
            <div key={i} style={{display:'flex',alignItems:'center',gap:8,marginBottom:6,fontSize:12}}>
              <span style={{flex:1,fontWeight:600}}>{u.name}</span>
              {['add','ignore'].map(a=>(
                <button key={a} onClick={()=>setUnknownProds(up=>up.map((x,j)=>j===i?{...x,action:a}:x))}
                  style={{padding:'3px 10px',borderRadius:12,border:`1px solid ${u.action===a?'#f97316':t.cardBorder}`,background:u.action===a?'rgba(249,115,22,0.15)':t.section,color:u.action===a?'#f97316':'inherit',cursor:'pointer',fontSize:11}}>
                  {a==='add'?T.prevImportAddCat:T.prevImportIgnore}
                </button>
              ))}
            </div>
          ))}
          <div style={{display:'flex',gap:8,marginTop:12}}>
            <button onClick={()=>setStep('map')} style={{padding:'7px 14px',borderRadius:6,border:`1px solid ${t.cardBorder}`,background:t.section,color:'inherit',cursor:'pointer',fontSize:12}}>{T.prevImportCancel}</button>
            <button onClick={()=>setStep('preview')} style={{padding:'7px 14px',borderRadius:6,border:'none',background:'linear-gradient(135deg,#f97316,#ea580c)',color:'#fff',cursor:'pointer',fontSize:12,fontWeight:600}}>{T.prevImportConfirm}</button>
          </div>
        </div>
      )}

      {step === 'preview' && (
        <div>
          <div style={{fontSize:12,opacity:0.6,marginBottom:8}}>{T.prevImportPreview} ({rows.length} lignes)</div>
          <div style={{maxHeight:220,overflowY:'auto',border:`1px solid ${t.cardBorder}`,borderRadius:6,marginBottom:12}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
              <thead style={{position:'sticky',top:0,background:t.cardBg}}>
                <tr>{[T.prevColProduct,T.prevColSold,T.prevColDate,T.prevColMade,T.prevColRemaining].map(h=><th key={h} style={{padding:'5px 8px',textAlign:'left',fontWeight:600,opacity:0.7,borderBottom:`1px solid ${t.cardBorder}`}}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.slice(0,50).map((row,i)=>(
                  <tr key={i} style={{borderBottom:`1px solid ${t.cardBorder}`}}>
                    <td style={{padding:'4px 8px'}}>{String(row[columns.indexOf(mapping.prod)]||'')}</td>
                    <td style={{padding:'4px 8px'}}>{String(row[columns.indexOf(mapping.sold)]||'')}</td>
                    <td style={{padding:'4px 8px'}}>{mapping.date?String(row[columns.indexOf(mapping.date)]||''):importDate}</td>
                    <td style={{padding:'4px 8px'}}>{mapping.made?String(row[columns.indexOf(mapping.made)]||''):'—'}</td>
                    <td style={{padding:'4px 8px'}}>{mapping.remaining?String(row[columns.indexOf(mapping.remaining)]||''):'—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{display:'flex',gap:8}}>
            <button onClick={()=>setStep('map')} style={{padding:'7px 14px',borderRadius:6,border:`1px solid ${t.cardBorder}`,background:t.section,color:'inherit',cursor:'pointer',fontSize:12}}>{T.prevImportCancel}</button>
            <button onClick={handleImport} style={{padding:'7px 14px',borderRadius:6,border:'none',background:'linear-gradient(135deg,#f97316,#ea580c)',color:'#fff',cursor:'pointer',fontSize:12,fontWeight:600}}>{T.prevImportConfirm}</button>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div style={{textAlign:'center',padding:'20px 0'}}>
          <div style={{fontSize:24,marginBottom:8}}>✓</div>
          <div style={{fontSize:13,fontWeight:700,color:'#22c55e',marginBottom:4}}>{T.prevImportImported(result)}</div>
          <button onClick={()=>{setStep('upload');setRows([]);setColumns([]);setMapping({prod:'',sold:'',date:'',made:'',remaining:''});setResult(null);}} style={{marginTop:12,padding:'7px 18px',borderRadius:6,border:`1px solid ${t.cardBorder}`,background:t.section,color:'inherit',cursor:'pointer',fontSize:12}}>{T.prevImportBtn}</button>
        </div>
      )}
    </div>
  );
}

// ── Alerts View ───────────────────────────────────────────────────────────────

function AlertsView({ products, allSales, T, lang }) {
  const alerts = useMemo(() => computeAlerts(products, allSales, T, lang), [products, allSales]);
  const total = alerts.stockout.length + alerts.overproduction.length;

  return (
    <div>
      <div style={{fontSize:13,fontWeight:700,marginBottom:12}}>{T.prevSubAlerts}</div>
      {total === 0 && alerts.optimized.length === 0 && (
        <div style={{textAlign:'center',padding:'24px 0',fontSize:12,opacity:0.5}}>{T.prevNoAlerts}</div>
      )}
      {alerts.stockout.length > 0 && (
        <div style={{marginBottom:12}}>
          <div style={{fontSize:11,fontWeight:700,color:'#ef4444',textTransform:'uppercase',letterSpacing:0.5,marginBottom:6}}>{T.prevAlertStockout}</div>
          {alerts.stockout.map((a,i)=>(
            <div key={i} style={{padding:'10px 12px',background:'rgba(239,68,68,0.06)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:7,marginBottom:6,fontSize:12}}>
              {T.prevAlertStockoutMsg(a.product.name, a.dowName, a.count, a.suggested)}
            </div>
          ))}
        </div>
      )}
      {alerts.overproduction.length > 0 && (
        <div style={{marginBottom:12}}>
          <div style={{fontSize:11,fontWeight:700,color:'#f59e0b',textTransform:'uppercase',letterSpacing:0.5,marginBottom:6}}>{T.prevAlertOverprod}</div>
          {alerts.overproduction.map((a,i)=>(
            <div key={i} style={{padding:'10px 12px',background:'rgba(245,158,11,0.06)',border:'1px solid rgba(245,158,11,0.2)',borderRadius:7,marginBottom:6,fontSize:12}}>
              {T.prevAlertOverprodMsg(a.product.name, a.dowName, a.wastePct, a.suggested)}
            </div>
          ))}
        </div>
      )}
      {alerts.optimized.length > 0 && (
        <div>
          <div style={{fontSize:11,fontWeight:700,color:'#22c55e',textTransform:'uppercase',letterSpacing:0.5,marginBottom:6}}>{T.prevAlertOptimized}</div>
          {alerts.optimized.map((a,i)=>(
            <div key={i} style={{padding:'8px 12px',background:'rgba(34,197,94,0.06)',border:'1px solid rgba(34,197,94,0.2)',borderRadius:7,marginBottom:4,fontSize:12}}>
              {T.prevAlertOptimizedMsg(a.product.name)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Item Detail View ──────────────────────────────────────────────────────────

function ItemDetailView({ product, allSales, weatherMap, onBack, onUpdateSensitivity, T, t, lang }) {
  const productSales = allSales.filter(s=>s.product_id===product.id).sort((a,b)=>b.date.localeCompare(a.date));
  const last30 = productSales.filter(s => {
    const cutoff = toDateStr(new Date(Date.now() - 30*86400000));
    return s.date >= cutoff;
  });
  const last14 = productSales.slice(0,14);

  const avgSold = last30.length ? last30.reduce((a,s)=>a+s.quantity_sold,0)/last30.length : 0;
  const withMade = last30.filter(s=>s.quantity_made!=null&&s.quantity_made>0);
  const avgMade = withMade.length ? withMade.reduce((a,s)=>a+s.quantity_made,0)/withMade.length : 0;
  const wasteRate = (avgMade > 0 && avgSold >= 0) ? Math.max(0,(avgMade-avgSold)/avgMade) : 0;
  const stockoutDays = last30.filter(s=>s.stockout).length;

  // Trend: last 2 weeks vs previous 2 weeks (any DOW)
  const cutoff2w = toDateStr(new Date(Date.now() - 14*86400000));
  const cutoff4w = toDateStr(new Date(Date.now() - 28*86400000));
  const r2w = last30.filter(s=>s.date>=cutoff2w);
  const p2w = last30.filter(s=>s.date>=cutoff4w&&s.date<cutoff2w);
  const trendPct = r2w.length && p2w.length
    ? ((r2w.reduce((a,s)=>a+s.quantity_sold,0)/r2w.length) - (p2w.reduce((a,s)=>a+s.quantity_sold,0)/p2w.length)) / (p2w.reduce((a,s)=>a+s.quantity_sold,0)/p2w.length) * 100
    : 0;

  // Day-of-week bars
  const dowAvg = Array(7).fill(null).map((_,dow) => {
    const s = last30.filter(x=>new Date(x.date+'T12:00:00').getDay()===dow);
    return s.length ? s.reduce((a,x)=>a+x.quantity_sold,0)/s.length : null;
  });
  const maxDow = Math.max(...dowAvg.filter(v=>v!=null), 1);
  const dayNames = lang==='en'
    ? ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
    : ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];

  // Forecast accuracy (last 30 days with data)
  const accuracyByDow = Array(7).fill(null).map((_,dow) => {
    const past = productSales.filter(s => {
      const d = new Date(s.date+'T12:00:00');
      const cutoff = toDateStr(new Date(Date.now()-30*86400000));
      return d.getDay()===dow && s.date<toDateStr(new Date()) && s.date>=cutoff;
    });
    if (past.length < 2) return null;
    const accs = past.map(s => {
      const r = computePrediction(product.id, s.date, productSales.filter(x=>x.date<s.date), weatherMap, product);
      if (!r.prediction) return null;
      return Math.max(0, 1 - Math.abs(r.prediction - s.quantity_sold)/Math.max(s.quantity_sold,1));
    }).filter(v=>v!==null);
    if (!accs.length) return null;
    return { dow, name:dayNames[dow], acc: Math.round(accs.reduce((a,v)=>a+v,0)/accs.length*100) };
  }).filter(Boolean);

  return (
    <div>
      <button onClick={onBack} style={{background:'none',border:'none',color:'#f97316',cursor:'pointer',fontSize:12,fontWeight:600,padding:0,marginBottom:14}}>{T.prevItemBack}</button>

      <div style={{fontSize:14,fontWeight:700,marginBottom:4}}>{product.name}</div>
      <div style={{fontSize:11,opacity:0.5,marginBottom:14}}>{T.prevItemProfile}</div>

      {last30.length === 0 ? (
        <div style={{textAlign:'center',padding:'20px 0',fontSize:12,opacity:0.5}}>{T.prevItemNoData}</div>
      ) : (
        <>
          {/* Stats cards */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))',gap:8,marginBottom:16}}>
            {[
              [T.prevItemAvgSold, Math.round(avgSold)],
              [T.prevItemAvgMade, avgMade > 0 ? Math.round(avgMade) : '—'],
              [T.prevItemWaste, avgMade > 0 ? `${Math.round(wasteRate*100)}%` : '—'],
              [T.prevItemStockoutDays, stockoutDays],
              [T.prevItemTrend, `${trendPct>0?'+':''}${Math.round(trendPct)}%`],
            ].map(([label,val])=>(
              <div key={label} style={{padding:'10px 12px',background:'rgba(249,115,22,0.07)',border:'1px solid rgba(249,115,22,0.15)',borderRadius:8}}>
                <div style={{fontSize:10,opacity:0.6,marginBottom:3}}>{label}</div>
                <div style={{fontSize:16,fontWeight:800,color:'#f97316'}}>{val}</div>
              </div>
            ))}
          </div>

          {/* DOW bar chart */}
          <div style={{marginBottom:16}}>
            <div style={{fontSize:11,fontWeight:600,marginBottom:6,opacity:0.7}}>{lang==='en'?'Average by day of week':'Moyenne par jour de la semaine'}</div>
            <div style={{display:'flex',gap:4,alignItems:'flex-end',height:60}}>
              {dowAvg.map((val,i)=>(
                <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
                  <div style={{width:'100%',background:val!=null?'#f97316':'transparent',borderRadius:'3px 3px 0 0',height:val!=null?`${Math.round((val/maxDow)*48)}px`:'0px',minHeight:val!=null?2:0,transition:'height 0.3s'}}/>
                  <div style={{fontSize:9,opacity:0.6}}>{dayNames[i]}</div>
                  {val!=null&&<div style={{fontSize:9,opacity:0.8}}>{Math.round(val)}</div>}
                </div>
              ))}
            </div>
          </div>

          {/* History table */}
          <div style={{marginBottom:16}}>
            <div style={{fontSize:11,fontWeight:600,marginBottom:6,opacity:0.7}}>{T.prevItemHistory}</div>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                <thead><tr style={{borderBottom:`1px solid ${t.cardBorder}`}}>
                  {[T.prevColDate,T.prevColMade,T.prevColSold,T.prevColRemaining,T.prevColStockout].map(h=><th key={h} style={{padding:'4px 6px',textAlign:'left',opacity:0.6,fontWeight:600,fontSize:10}}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {last14.map((s,i)=>(
                    <tr key={i} style={{borderBottom:`1px solid ${t.cardBorder}`}}>
                      <td style={{padding:'4px 6px'}}>{formatDateShort(s.date,lang)}</td>
                      <td style={{padding:'4px 6px'}}>{s.quantity_made??'—'}</td>
                      <td style={{padding:'4px 6px',fontWeight:600}}>{s.quantity_sold}</td>
                      <td style={{padding:'4px 6px'}}>{s.quantity_remaining??'—'}</td>
                      <td style={{padding:'4px 6px'}}>{s.stockout?'⚠️':'—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Accuracy */}
          {accuracyByDow.length > 0 && (
            <div style={{marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:600,marginBottom:6,opacity:0.7}}>{T.prevItemAccTitle}</div>
              <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                {accuracyByDow.map(a=>(
                  <div key={a.dow} style={{padding:'6px 10px',borderRadius:7,background:'rgba(34,197,94,0.08)',border:'1px solid rgba(34,197,94,0.2)',fontSize:11}}>
                    <span style={{opacity:0.6}}>{a.name}: </span><strong style={{color:'#22c55e'}}>{a.acc}%</strong>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Production List View ──────────────────────────────────────────────────────

function ProductionListView({ products, allSales, weatherMap, T, t, lang }) {
  const [range, setRange] = useState('3');
  const [customStart, setCustomStart] = useState(toDateStr(new Date()));
  const [customEnd, setCustomEnd] = useState(addDays(toDateStr(new Date()), 2));
  const [stockOverrides, setStockOverrides] = useState({});
  const [generated, setGenerated] = useState(null);

  const today = toDateStr(new Date());
  const startDate = range === 'custom' ? customStart : addDays(today, 1);
  const endDate = range === '7' ? addDays(today, 7) : range === '3' ? addDays(today, 3) : customEnd;

  const getDates = () => {
    const dates = [];
    let d = startDate;
    while (d <= endDate) { dates.push(d); d = addDays(d, 1); }
    return dates;
  };

  const generate = () => {
    const dates = getDates();
    const activeProducts = products.filter(p=>p.active);
    const list = [];

    // Group by shelf life
    const batchMap = {};
    activeProducts.forEach(p => {
      if (p.shelf_life_days <= 1) {
        // Daily
        dates.forEach(date => {
          const r = computePrediction(p.id, date, allSales, weatherMap, p);
          const onHand = parseInt(stockOverrides[p.id] || 0);
          const toMake = Math.max(0, r.prediction - (date === dates[0] ? onHand : 0));
          list.push({ product: p, date, forecast: r.prediction, onHand: date===dates[0]?onHand:0, toMake, type:'daily' });
        });
      } else {
        // Batch
        const total = dates.reduce((sum, date) => sum + computePrediction(p.id, date, allSales, weatherMap, p).prediction, 0);
        const onHand = parseInt(stockOverrides[p.id] || 0);
        const toMake = Math.max(0, total - onHand);
        if (!batchMap[p.id]) batchMap[p.id] = { product:p, total, onHand, toMake, type:'batch', dates };
      }
    });
    const batchItems = Object.values(batchMap);
    setGenerated({ list, batchItems, dates });
  };

  const buildHTML = () => {
    if (!generated) return '';
    const title = `${T.prevListTitle} — ${formatDateShort(startDate,lang)} → ${formatDateShort(endDate,lang)}`;
    let rows = '';
    generated.list.forEach(item => {
      rows += `<tr><td>${item.product.name}</td><td>${formatDateShort(item.date,lang)}</td><td>${item.forecast}</td><td>${item.onHand||0}</td><td><strong>${item.toMake}</strong></td></tr>`;
    });
    generated.batchItems.forEach(item => {
      rows += `<tr><td>${item.product.name}</td><td>${T.prevListBatch}${item.product.shelf_life_days}${T.prevListDays}</td><td>${item.total}</td><td>${item.onHand}</td><td><strong>${item.toMake}</strong></td></tr>`;
    });
    return `<html><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:'Outfit',sans-serif;margin:32px;color:#111}h1{font-size:18px;margin-bottom:4px}p{font-size:12px;color:#666;margin-bottom:20px}table{width:100%;border-collapse:collapse;font-size:13px}th{background:#f3f4f6;padding:8px 10px;text-align:left;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.5px}td{padding:8px 10px;border-bottom:1px solid #e5e7eb}strong{color:#f97316;font-size:15px}@media print{body{margin:16px}}</style></head><body><h1>${title}</h1><table><thead><tr><th>${T.prevColProduct}</th><th>${T.prevColDate}</th><th>${T.prevListForecast}</th><th>${T.prevListOnHand}</th><th>${T.prevListToMake}</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
  };

  const inp = { background:t.inputBg, border:`1px solid ${t.inputBorder}`, borderRadius:5, color:'inherit', fontSize:12, padding:'5px 8px', outline:'none', fontFamily:"'Outfit',sans-serif" };

  return (
    <div>
      <div style={{fontSize:13,fontWeight:700,marginBottom:12}}>{T.prevListTitle}</div>

      <div style={{display:'flex',gap:8,marginBottom:10,flexWrap:'wrap',alignItems:'center'}}>
        <span style={{fontSize:11,opacity:0.6}}>{T.prevListRange}:</span>
        {[['3',T.prevListDays3],['7',T.prevListDays7],['custom',T.prevListCustom]].map(([v,l])=>(
          <button key={v} onClick={()=>setRange(v)} style={{padding:'4px 12px',borderRadius:12,border:`1px solid ${range===v?'#f97316':t.cardBorder}`,background:range===v?'rgba(249,115,22,0.15)':t.section,color:range===v?'#f97316':'inherit',cursor:'pointer',fontSize:11}}>{l}</button>
        ))}
        {range==='custom'&&<><input type="date" value={customStart} onChange={e=>setCustomStart(e.target.value)} style={inp}/><span style={{opacity:0.4}}>→</span><input type="date" value={customEnd} onChange={e=>setCustomEnd(e.target.value)} style={inp}/></>}
      </div>

      {/* Stock on hand */}
      {products.filter(p=>p.active).length > 0 && (
        <div style={{marginBottom:12,padding:'10px 12px',background:t.section,borderRadius:7,border:`1px solid ${t.cardBorder}`}}>
          <div style={{fontSize:11,fontWeight:600,marginBottom:6,opacity:0.7}}>{T.prevListCurrentStock}</div>
          <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
            {products.filter(p=>p.active).map(p=>(
              <div key={p.id} style={{display:'flex',alignItems:'center',gap:5}}>
                <span style={{fontSize:11,opacity:0.8}}>{p.name}:</span>
                <input type="number" min="0" value={stockOverrides[p.id]||''} onChange={e=>setStockOverrides(s=>({...s,[p.id]:e.target.value}))}
                  placeholder="0" style={{...inp,width:55,textAlign:'center',padding:'3px 6px',fontFamily:"'DM Mono',monospace"}}/>
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={generate} style={{padding:'8px 20px',borderRadius:7,border:'none',background:'linear-gradient(135deg,#f97316,#ea580c)',color:'#fff',cursor:'pointer',fontSize:12,fontWeight:600,marginBottom:16}}>{T.prevListGenerate}</button>

      {generated && (
        <div>
          <div style={{overflowX:'auto',marginBottom:12}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
              <thead><tr style={{background:t.section}}>
                {[T.prevColProduct,T.prevColDate,T.prevListForecast,T.prevListOnHand,T.prevListToMake].map(h=>(
                  <th key={h} style={{padding:'7px 10px',textAlign:'left',fontWeight:700,fontSize:11,opacity:0.7,borderBottom:`2px solid ${t.cardBorder}`}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {generated.list.map((item,i)=>(
                  <tr key={i} style={{borderBottom:`1px solid ${t.cardBorder}`}}>
                    <td style={{padding:'6px 10px',fontWeight:600}}>{item.product.name}</td>
                    <td style={{padding:'6px 10px',opacity:0.7}}>{formatDateShort(item.date,lang)}</td>
                    <td style={{padding:'6px 10px'}}>{item.forecast}</td>
                    <td style={{padding:'6px 10px'}}>{item.onHand||0}</td>
                    <td style={{padding:'6px 10px',fontWeight:800,color:'#f97316',fontSize:13}}>{item.toMake}</td>
                  </tr>
                ))}
                {generated.batchItems.map((item,i)=>(
                  <tr key={`b${i}`} style={{borderBottom:`1px solid ${t.cardBorder}`,background:'rgba(249,115,22,0.03)'}}>
                    <td style={{padding:'6px 10px',fontWeight:600}}>{item.product.name}</td>
                    <td style={{padding:'6px 10px',fontSize:10,opacity:0.6}}>{T.prevListBatch}{item.product.shelf_life_days}{T.prevListDays}</td>
                    <td style={{padding:'6px 10px'}}>{item.total}</td>
                    <td style={{padding:'6px 10px'}}>{item.onHand}</td>
                    <td style={{padding:'6px 10px',fontWeight:800,color:'#f97316',fontSize:13}}>{item.toMake}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{display:'flex',gap:8}}>
            <button onClick={()=>window.dispatchEvent(new CustomEvent('biq:pdf-preview',{detail:buildHTML()}))}
              style={{padding:'7px 14px',borderRadius:6,border:`1px solid ${t.cardBorder}`,background:t.section,color:'inherit',cursor:'pointer',fontSize:12}}>{T.prevListPrint}</button>
            <button onClick={()=>{
              const wb = XLSX.utils.book_new();
              const data = [[T.prevColProduct,T.prevColDate,T.prevListForecast,T.prevListOnHand,T.prevListToMake],
                ...generated.list.map(i=>[i.product.name,i.date,i.forecast,i.onHand||0,i.toMake]),
                ...generated.batchItems.map(i=>[i.product.name,'batch',i.total,i.onHand,i.toMake])];
              XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), 'Production');
              XLSX.writeFile(wb, `production-list-${startDate}.xlsx`);
            }} style={{padding:'7px 14px',borderRadius:6,border:`1px solid ${t.cardBorder}`,background:t.section,color:'inherit',cursor:'pointer',fontSize:12}}>{T.prevListExportCSV}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main PrevisionsTab ────────────────────────────────────────────────────────

export default function PrevisionsTab({ apiConfig, showUpgradePrompt, canUse, T, t, lang }) {
  const [products, setProducts] = useState([]);
  const [allSales, setAllSales] = useState([]);
  const [weatherMap, setWeatherMap] = useState({}); // {date: {temp_max, weather_code, source}}
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState(null);
  const [savedFormats, setSavedFormats] = useState([]);
  const [subView, setSubView] = useState('forecast'); // forecast | import | products | alerts | production | item
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [currentWeekMonday, setCurrentWeekMonday] = useState(getMondayOf(toDateStr(new Date())));
  const [manualDate, setManualDate] = useState(toDateStr(new Date()));
  const [salesByDate, setSalesByDate] = useState({});
  const [cellDetail, setCellDetail] = useState(null); // {product, date, result}
  const [weatherOverrideDate, setWeatherOverrideDate] = useState(null);

  const weekDates = useMemo(() => getWeekDates(currentWeekMonday), [currentWeekMonday]);
  const lastWeekDates = useMemo(() => getWeekDates(addDays(currentWeekMonday, -7)), [currentWeekMonday]);

  // Load everything on mount
  useEffect(() => {
    loadProducts();
    loadSales();
    loadWeather();
    loadFormats();
  }, []);

  const loadProducts = async () => {
    const p = await window.api.forecast.products.getAll();
    setProducts(p || []);
  };

  const loadSales = async () => {
    // Load 90 days back
    const from = toDateStr(new Date(Date.now() - 90*86400000));
    const to = toDateStr(new Date(Date.now() + 30*86400000));
    const sales = await window.api.forecast.sales.getRange(from, to);
    setAllSales(sales || []);
    // Group by date for manual entry
    const byDate = {};
    (sales||[]).forEach(s => { if (!byDate[s.date]) byDate[s.date]=[]; byDate[s.date].push(s); });
    setSalesByDate(byDate);
  };

  const loadWeather = async () => {
    const from = toDateStr(new Date());
    const to = toDateStr(new Date(Date.now() + 14*86400000));
    const cached = await window.api.forecast.weather.getRange(from, to);
    const map = {};
    (cached||[]).forEach(w => { map[w.date] = w; });

    // Check if we need a fresh fetch (stale > 6h or missing upcoming days)
    const upcomingDates = Array.from({length:7},(_,i) => toDateStr(new Date(Date.now()+i*86400000)));
    const missing = upcomingDates.filter(d => !map[d]);
    const oldest = cached?.[0];
    const staleHours = oldest ? (Date.now() - new Date(oldest.fetched_at).getTime()) / 3600000 : 999;

    if (missing.length > 0 || staleHours > 6) {
      const lat = apiConfig?.weatherLat;
      const lng = apiConfig?.weatherLng;
      if (lat && lng) {
        setWeatherLoading(true);
        try {
          const fresh = await fetchWeatherForecast(lat, lng);
          for (const w of fresh) {
            if (map[w.date]?.source === 'manual') continue; // don't overwrite manual
            await window.api.forecast.weather.upsert(w);
            map[w.date] = w;
          }
          setWeatherError(null);
        } catch (e) {
          setWeatherError(T.prevNoWeather);
        }
        setWeatherLoading(false);
      }
    }
    setWeatherMap(map);
  };

  const loadFormats = async () => {
    const fmts = await window.api.forecast.csvMappings.getAll();
    setSavedFormats(fmts || []);
  };

  const saveProduct = async (product) => {
    await window.api.forecast.products.upsert(product);
    await loadProducts();
  };

  const saveSales = async (date, records) => {
    for (const rec of records) await window.api.forecast.sales.upsert(rec);
    await loadSales();
  };

  const saveWeatherOverride = async (record) => {
    await window.api.forecast.weather.upsert(record);
    setWeatherMap(m => ({ ...m, [record.date]: record }));
  };

  const resetWeather = async (date) => {
    // Refetch from API for this specific day
    const lat = apiConfig?.weatherLat;
    const lng = apiConfig?.weatherLng;
    if (lat && lng) {
      try {
        const fresh = await fetchWeatherForecast(lat, lng);
        const day = fresh.find(w=>w.date===date);
        if (day) {
          await window.api.forecast.weather.upsert(day);
          setWeatherMap(m => ({ ...m, [date]: day }));
        }
      } catch {}
    }
  };

  const activeProducts = useMemo(() => products.filter(p=>p.active), [products]);

  // Compute predictions for current week
  const predictions = useMemo(() => {
    const result = {};
    activeProducts.forEach(p => {
      result[p.id] = {};
      weekDates.forEach(date => {
        result[p.id][date] = computePrediction(p.id, date, allSales, weatherMap, p);
      });
    });
    return result;
  }, [activeProducts, weekDates, allSales, weatherMap]);

  // Last week actuals
  const lastWeekActuals = useMemo(() => {
    const result = {};
    activeProducts.forEach(p => {
      result[p.id] = {};
      lastWeekDates.forEach(date => {
        const sale = allSales.find(s=>s.product_id===p.id && s.date===date);
        result[p.id][date] = sale || null;
      });
    });
    return result;
  }, [activeProducts, lastWeekDates, allSales]);

  // Missing data warning
  const missingDates = useMemo(() => {
    const today = toDateStr(new Date());
    const last7 = Array.from({length:7},(_,i) => toDateStr(new Date(Date.now()-(i+1)*86400000)));
    return last7.filter(d => {
      if (activeProducts.length === 0) return false;
      const hasSales = activeProducts.some(p => allSales.find(s=>s.product_id===p.id&&s.date===d));
      return !hasSales;
    });
  }, [activeProducts, allSales]);

  const confColors = { base:'#6b7280', low:'#ef4444', medium:'#f59e0b', high:'#22c55e' };
  const confDim = { base:0.3, low:0.55, medium:0.75, high:1 };

  const subTabs = [
    { id:'forecast', label: T.prevSubForecast },
    { id:'import', label: T.prevSubImport },
    { id:'alerts', label: T.prevSubAlerts },
    { id:'production', label: T.prevSubProdList },
    { id:'products', label: T.prevSubProducts },
  ];

  return (
    <div style={{display:'flex',flexDirection:'column',gap:0}}>
      {/* Sub-nav */}
      <div style={{display:'flex',gap:0,borderBottom:`1px solid ${t.cardBorder}`,marginBottom:16,overflowX:'auto'}}>
        {subTabs.map(tab=>(
          <button key={tab.id} onClick={()=>{setSubView(tab.id);setSelectedProduct(null);}}
            style={{background:'none',border:'none',borderBottom:subView===tab.id?'2px solid #f97316':'2px solid transparent',color:subView===tab.id?'#f97316':t.textMuted,fontSize:12,fontWeight:600,padding:'8px 14px',cursor:'pointer',whiteSpace:'nowrap',transition:'all 0.15s'}}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Item detail overlay */}
      {selectedProduct && subView==='forecast' && (
        <ItemDetailView
          product={selectedProduct}
          allSales={allSales}
          weatherMap={weatherMap}
          onBack={()=>setSelectedProduct(null)}
          onUpdateSensitivity={(prod,sens)=>saveProduct({...prod,weather_sensitivity:sens})}
          T={T} t={t} lang={lang}
        />
      )}

      {/* FORECAST VIEW */}
      {subView==='forecast' && !selectedProduct && (
        <div>
          {/* Missing data warning */}
          {missingDates.length > 0 && (
            <div style={{padding:'8px 12px',background:'rgba(245,158,11,0.08)',border:'1px solid rgba(245,158,11,0.25)',borderRadius:7,fontSize:11,color:'#f59e0b',marginBottom:12}}>
              {T.prevMissingData(missingDates.slice(0,3).map(d=>formatDateShort(d,lang)).join(', ') + (missingDates.length>3?`…`:''))}
            </div>
          )}

          {/* Week nav */}
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12,flexWrap:'wrap'}}>
            <button onClick={()=>setCurrentWeekMonday(m=>addDays(m,-7))} style={{background:t.section,border:`1px solid ${t.cardBorder}`,borderRadius:5,color:t.textSub,padding:'5px 10px',cursor:'pointer',fontSize:13}}>←</button>
            <span style={{fontSize:13,fontWeight:700,flex:1}}>{T.prevWeekOf(formatDateShort(currentWeekMonday, lang))} → {formatDateShort(addDays(currentWeekMonday,6), lang)}</span>
            <button onClick={()=>setCurrentWeekMonday(m=>addDays(m,7))} style={{background:t.section,border:`1px solid ${t.cardBorder}`,borderRadius:5,color:t.textSub,padding:'5px 10px',cursor:'pointer',fontSize:13}}>→</button>
            <button onClick={()=>setCurrentWeekMonday(getMondayOf(toDateStr(new Date())))} style={{background:t.section,border:`1px solid ${t.cardBorder}`,borderRadius:5,color:'#f97316',padding:'5px 10px',cursor:'pointer',fontSize:11,fontWeight:600}}>{T.prevToday}</button>
          </div>

          {/* Weather bar */}
          <div style={{display:'grid',gridTemplateColumns:`auto repeat(7,1fr)`,gap:0,marginBottom:0,border:`1px solid ${t.cardBorder}`,borderRadius:'8px 8px 0 0',overflow:'hidden'}}>
            <div style={{padding:'6px 8px',background:t.section,fontSize:10,fontWeight:600,opacity:0.5,borderRight:`1px solid ${t.cardBorder}`,display:'flex',alignItems:'center'}}>{T.prevWeatherBar}</div>
            {weekDates.map(date => {
              const w = weatherMap[date];
              const isManual = w?.source === 'manual';
              const cond = w ? weatherCodeToCondition(w.weather_code) : null;
              return (
                <div key={date} style={{padding:'5px 4px',background:t.section,textAlign:'center',borderRight:`1px solid ${t.cardBorder}`,cursor:'pointer',transition:'background 0.1s'}}
                  title={isManual ? T.prevWeatherManual : T.prevWeatherAuto}
                  onClick={()=>setWeatherOverrideDate(date)}>
                  <div style={{fontSize:13}}>{w ? conditionToIcon(cond) : '—'}</div>
                  <div style={{fontSize:10,fontWeight:600}}>{w ? `${Math.round(w.temp_max||0)}°` : '—'}</div>
                  <div style={{fontSize:9,opacity:0.5}}>{isManual?'✏️':'auto'}</div>
                </div>
              );
            })}
          </div>

          {/* Forecast table */}
          {activeProducts.length === 0 ? (
            <div style={{textAlign:'center',padding:'30px 0',fontSize:12,opacity:0.5,border:`1px solid ${t.cardBorder}`,borderTop:'none',borderRadius:'0 0 8px 8px'}}>{T.prevNoProducts}</div>
          ) : (
            <div style={{overflowX:'auto',border:`1px solid ${t.cardBorder}`,borderTop:'none',borderRadius:'0 0 8px 8px'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead>
                  <tr style={{borderBottom:`2px solid ${t.cardBorder}`,background:t.section}}>
                    <th style={{textAlign:'left',padding:'7px 10px',fontSize:11,fontWeight:700,minWidth:100}}>{T.prevColProduct}</th>
                    {weekDates.map(d=>(
                      <th key={d} style={{textAlign:'center',padding:'7px 5px',fontSize:10,fontWeight:600,minWidth:44}}>
                        <div>{getDayName(d,lang)}</div>
                        <div style={{fontWeight:400,opacity:0.5,fontSize:9}}>{d.slice(8)}</div>
                      </th>
                    ))}
                    <th style={{textAlign:'center',padding:'7px 5px',fontSize:11,fontWeight:700,minWidth:50}}>{T.prevColTotal}</th>
                    <th style={{textAlign:'center',padding:'7px 5px',fontSize:11,fontWeight:700,minWidth:40}}></th>
                  </tr>
                </thead>
                <tbody>
                  {activeProducts.map(p => {
                    const weekTotal = weekDates.reduce((s,d) => s + (predictions[p.id]?.[d]?.prediction||0), 0);
                    // Alert for this product
                    const pAlerts = computeAlerts([p], allSales, T, lang);
                    const alertIcon = pAlerts.stockout.length ? '🔴' : pAlerts.overproduction.length ? '🟡' : pAlerts.optimized.length ? '🟢' : '';
                    return (
                      <tr key={p.id} style={{borderBottom:`1px solid ${t.cardBorder}`,cursor:'pointer'}} onClick={()=>setSelectedProduct(p)}>
                        <td style={{padding:'6px 10px',fontWeight:600,whiteSpace:'nowrap'}}>{p.name}</td>
                        {weekDates.map(date => {
                          const r = predictions[p.id]?.[date];
                          if (!r) return <td key={date} style={{textAlign:'center',padding:'6px 4px'}}>—</td>;
                          return (
                            <td key={date} style={{textAlign:'center',padding:'6px 4px',opacity:confDim[r.confidence]}}
                              onClick={e=>{e.stopPropagation();setCellDetail({product:p,date,result:r});}}>
                              <span style={{fontWeight:r.confidence==='high'?700:400,cursor:'pointer',borderBottom:r.confidence!=='high'?'1px dotted currentColor':'none'}}>{r.prediction}</span>
                            </td>
                          );
                        })}
                        <td style={{textAlign:'center',padding:'6px 5px',fontWeight:800,color:'#f97316'}}>{weekTotal}</td>
                        <td style={{textAlign:'center',padding:'6px 5px',fontSize:14}}>{alertIcon}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Last week actuals */}
          {activeProducts.length > 0 && allSales.length > 0 && (
            <div style={{marginTop:16}}>
              <div style={{fontSize:11,fontWeight:600,opacity:0.6,marginBottom:6}}>{T.prevLastWeek}</div>
              <div style={{overflowX:'auto',border:`1px solid ${t.cardBorder}`,borderRadius:8}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                  <thead><tr style={{background:t.section,borderBottom:`1px solid ${t.cardBorder}`}}>
                    <th style={{textAlign:'left',padding:'6px 10px',fontWeight:600,fontSize:10,opacity:0.6,minWidth:100}}>{T.prevColProduct}</th>
                    {lastWeekDates.map(d=><th key={d} style={{textAlign:'center',padding:'5px 4px',fontWeight:600,fontSize:9,opacity:0.6,minWidth:40}}>{getDayName(d,lang)}</th>)}
                    <th style={{textAlign:'center',padding:'5px 5px',fontWeight:600,fontSize:10,opacity:0.6}}>{T.prevColWaste}</th>
                  </tr></thead>
                  <tbody>
                    {activeProducts.map(p => {
                      const withMade = lastWeekDates.map(d=>lastWeekActuals[p.id]?.[d]).filter(s=>s?.quantity_made>0);
                      const wasteAvg = withMade.length ? withMade.reduce((a,s)=>a+(s.quantity_made-s.quantity_sold)/s.quantity_made,0)/withMade.length : null;
                      return (
                        <tr key={p.id} style={{borderBottom:`1px solid ${t.cardBorder}`}}>
                          <td style={{padding:'5px 10px',fontWeight:600,opacity:0.8}}>{p.name}</td>
                          {lastWeekDates.map(d => {
                            const s = lastWeekActuals[p.id]?.[d];
                            return <td key={d} style={{textAlign:'center',padding:'5px 4px',opacity:0.7}}>{s ? s.quantity_sold : '—'}</td>;
                          })}
                          <td style={{textAlign:'center',padding:'5px 5px',fontWeight:600,color:wasteAvg==null?'inherit':wasteAvg>0.15?'#ef4444':wasteAvg>0.08?'#f59e0b':'#22c55e'}}>
                            {wasteAvg != null ? `${Math.round(wasteAvg*100)}%` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* IMPORT VIEW */}
      {subView==='import' && (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
          <div style={{padding:'16px',background:t.section,border:`1px solid ${t.cardBorder}`,borderRadius:8}}>
            <CSVImportView
              products={activeProducts}
              onImported={async (recs, newProds) => { await loadProducts(); await loadSales(); }}
              savedFormats={savedFormats}
              onSaveFormat={async (m) => { await window.api.forecast.csvMappings.save(m); await loadFormats(); }}
              T={T} t={t} lang={lang}
            />
          </div>
          <div style={{padding:'16px',background:t.section,border:`1px solid ${t.cardBorder}`,borderRadius:8}}>
            <ManualEntryView
              products={activeProducts}
              selectedDate={manualDate}
              setSelectedDate={setManualDate}
              salesByDate={salesByDate}
              onSaveSales={saveSales}
              T={T} t={t} lang={lang}
            />
          </div>
        </div>
      )}

      {/* ALERTS VIEW */}
      {subView==='alerts' && (
        <AlertsView products={products} allSales={allSales} T={T} lang={lang}/>
      )}

      {/* PRODUCTION LIST VIEW */}
      {subView==='production' && (
        <ProductionListView products={products} allSales={allSales} weatherMap={weatherMap} T={T} t={t} lang={lang}/>
      )}

      {/* PRODUCTS VIEW */}
      {subView==='products' && (
        <ProductsView products={products} onSaveProduct={saveProduct} T={T} t={t}/>
      )}

      {/* Modals */}
      {cellDetail && (
        <CellDetailPopover
          product={cellDetail.product}
          dateStr={cellDetail.date}
          result={cellDetail.result}
          weatherMap={weatherMap}
          T={T} t={t} lang={lang}
          onClose={()=>setCellDetail(null)}
        />
      )}
      {weatherOverrideDate && (
        <WeatherOverrideModal
          date={weatherOverrideDate}
          existing={weatherMap[weatherOverrideDate]}
          onSave={async (rec)=>{ await saveWeatherOverride(rec); setWeatherOverrideDate(null); }}
          onClose={()=>setWeatherOverrideDate(null)}
          T={T} t={t} lang={lang}
        />
      )}
    </div>
  );
}
