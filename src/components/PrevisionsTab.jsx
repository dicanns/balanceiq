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

function computePrediction(productId, dateStr, allSales, weatherMap, product, learnedPatterns = []) {
  const targetDow = new Date(dateStr + 'T12:00:00').getDay();
  const dayName = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][targetDow];

  const getLP = (type, entity, key) => {
    const p = learnedPatterns.find(lp=>lp.pattern_type===type&&lp.entity===entity&&lp.key===key);
    if (!p) return null;
    try { return { ...JSON.parse(p.value), confidence:p.confidence, sample_size:p.sample_size }; }
    catch { return null; }
  };

  // 1. BASE — use learned DOW pattern if confidence >= 0.4, else weighted avg
  let baseAvg = product.base_quantity || 0;
  let dataPoints = 0;
  let confidence = 'base';
  const dowP = getLP('day_of_week', productId, dayName);
  if (dowP && dowP.confidence >= 0.4) {
    baseAvg = dowP.weighted_avg || dowP.avg || baseAvg;
    dataPoints = dowP.sample_count || 0;
    confidence = dowP.confidence>=0.9?'high':dowP.confidence>=0.7?'medium':dowP.confidence>=0.4?'low':'base';
  } else {
    const sameDow = allSales
      .filter(s=>s.product_id===productId&&new Date(s.date+'T12:00:00').getDay()===targetDow)
      .sort((a,b)=>b.date.localeCompare(a.date));
    if (sameDow.length > 0) {
      const now = new Date(dateStr+'T12:00:00');
      let wSum=0,wTotal=0;
      sameDow.forEach(s=>{
        const wk=Math.round((now-new Date(s.date+'T12:00:00'))/(7*86400000));
        const w=wk<=1?4:wk<=2?3:wk<=3?2:1;
        const qty=s.stockout?Math.round(s.quantity_sold*1.12):s.quantity_sold;
        wSum+=qty*w;wTotal+=w;
      });
      baseAvg=wTotal>0?wSum/wTotal:baseAvg;
      dataPoints=sameDow.length;
      confidence=dataPoints<2?'base':dataPoints<4?'low':dataPoints<8?'medium':'high';
    }
  }

  // 2. WEATHER
  let weatherFactor = 0;
  const w = weatherMap[dateStr];
  if (w) {
    const temp = w.temp_max ?? 10;
    const sens = product.weather_sensitivity || 0;
    const tempRange = temp<5?'below_5':temp<15?'5_15':temp<25?'15_25':'above_25';
    const learnedCorr = getLP('weather_correlation', productId, tempRange);
    if (learnedCorr && learnedCorr.confidence >= 0.5) {
      weatherFactor = learnedCorr.pct_change_vs_baseline || 0;
    } else if (sens !== 0) {
      if(temp<5)weatherFactor=sens*-0.15;
      else if(temp>=15&&temp<25)weatherFactor=sens*0.10;
      else if(temp>=25)weatherFactor=sens*0.20;
    }
    const code=w.weather_code||0;
    const condKey=(code===0||code===1)?'sunny':(code<=3)?'cloudy':((code>=51&&code<=67)||(code>=80&&code<=82))?'rainy':(code>=71&&code<=77)?'snowy':null;
    if (condKey) {
      const learnedCond = getLP('weather_condition', productId, condKey);
      if (learnedCond && learnedCond.confidence >= 0.5) {
        weatherFactor = (weatherFactor + (learnedCond.pct_change||0)) / 2;
      } else {
        if(condKey==='rainy')weatherFactor-=0.05;
        if(condKey==='snowy')weatherFactor-=0.10;
      }
    }
  }

  // 3. TREND
  let trendFactor = 0;
  const trend = getLP('trend', productId, 'current');
  if (trend && trend.confidence >= 0.4) trendFactor = (trend.pct_change||0) * 0.5;

  // 4. WASTE — reduce prediction if this day has chronic waste
  let wasteFactor = 1;
  const wasteP = getLP('waste_pattern', productId, dayName);
  if (wasteP && wasteP.avg_waste_pct > 0.15) wasteFactor = 1 - wasteP.avg_waste_pct * 0.5;

  // 5. STOCKOUT — increase if chronic stockouts on this day
  const stockoutP = getLP('stockout_pattern', productId, dayName);
  if (stockoutP && stockoutP.stockout_count >= 2 && stockoutP.estimated_unmet_demand > 0) {
    const rate = stockoutP.total_days_tracked > 0 ? stockoutP.stockout_count/stockoutP.total_days_tracked : 0;
    if (rate >= 0.3) baseAvg = Math.max(baseAvg, baseAvg + stockoutP.estimated_unmet_demand);
  }

  const prediction = Math.max(0, Math.round(baseAvg * (1+weatherFactor) * (1+trendFactor) * wasteFactor));
  return { prediction, confidence, dataPoints, baseAvg: Math.round(baseAvg), weatherFactor, trendFactor };
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

function ProductFormModal({ product, existingCategories, onSave, onClose, T, t, lang }) {
  const [form, setForm] = useState({
    id: product?.id || uuid(),
    name: product?.name || '',
    category: product?.category || '',
    base_quantity: String(product?.base_quantity ?? 0),
    shelf_life_days: product?.shelf_life_days ?? 1,
    weather_sensitivity: product?.weather_sensitivity ?? 0,
    active: product?.active ?? 1,
    notes: product?.notes || '',
    unit_cost: product?.unit_cost != null ? String(product.unit_cost) : '',
    sell_price: product?.sell_price != null ? String(product.sell_price) : '',
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

  const freqPresets = lang === 'en'
    ? [{v:1,label:'Every day',sub:'daily'},{v:2,label:'Every 2 days',sub:'~3-4×/wk'},{v:3,label:'Every 3 days',sub:'~2-3×/wk'},{v:7,label:'Weekly',sub:'1×/wk'}]
    : [{v:1,label:'Quotidien',sub:'chaque jour'},{v:2,label:'Tous les 2j',sub:'~3-4×/sem'},{v:3,label:'Tous les 3j',sub:'~2-3×/sem'},{v:7,label:'Hebdomadaire',sub:'1×/sem'}];

  const freqHint = form.shelf_life_days <= 1
    ? (lang==='en' ? 'Appears in each daily production card' : 'Apparaît dans chaque carte journalière')
    : (lang==='en' ? `Batched — make once every ${form.shelf_life_days} days` : `En lot — produire une fois tous les ${form.shelf_life_days} jours`);

  const isPreset = freqPresets.some(p => p.v === form.shelf_life_days);

  const inp = { background:t.inputBg, border:`1px solid ${t.inputBorder}`, borderRadius:6, color:t.text, fontSize:13, padding:'8px 10px', outline:'none', width:'100%', boxSizing:'border-box', fontFamily:"'Outfit',sans-serif" };
  const lbl = { fontSize:12, fontWeight:600, color:t.textSub, display:'block', marginBottom:4 };

  const handleSave = () => {
    if (!form.name.trim()) return;
    onSave({
      ...form,
      base_quantity: parseInt(form.base_quantity) >= 0 ? parseInt(form.base_quantity) : 0,
      shelf_life_days: Math.max(1, form.shelf_life_days || 1),
      unit_cost: form.unit_cost !== '' ? parseFloat(form.unit_cost) : null,
      sell_price: form.sell_price !== '' ? parseFloat(form.sell_price) : null,
    });
  };

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{background:t.card,border:`1px solid ${t.cardBorder}`,borderRadius:14,padding:28,width:460,maxWidth:'95vw',maxHeight:'90vh',overflowY:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.25)'}}>
        <div style={{fontSize:15,fontWeight:700,color:t.text,marginBottom:20}}>{product ? T.prevProdEdit : T.prevProdNew}</div>

        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          <div>
            <label style={lbl}>{T.prevProdName} *</label>
            <input style={inp} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} autoFocus/>
          </div>

          <div>
            <label style={lbl}>{T.prevProdCategory}</label>
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

          <div>
            <label style={lbl}>{T.prevProdBaseQty}</label>
            <input
              type="number" min="0" style={{...inp, width:'50%'}}
              value={form.base_quantity}
              onChange={e => setForm(f => ({...f, base_quantity: e.target.value}))}
              onBlur={e => { const v = parseInt(e.target.value); setForm(f => ({...f, base_quantity: String(isNaN(v)||v<0?0:v)})); }}
            />
          </div>

          {/* Cost & Price (optional) */}
          <div>
            <label style={lbl}>{lang==='en'?'Pricing & Cost (optional)':'Coût & Prix (optionnel)'}</label>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              <div style={{position:'relative'}}>
                <span style={{position:'absolute',left:8,top:'50%',transform:'translateY(-50%)',fontSize:12,opacity:0.4}}>$</span>
                <input type="number" min="0" step="0.01" style={{...inp,paddingLeft:18}}
                  value={form.unit_cost}
                  onChange={e=>setForm(f=>({...f,unit_cost:e.target.value}))}
                  onBlur={e=>{const v=parseFloat(e.target.value);setForm(f=>({...f,unit_cost:isNaN(v)||v<0?'':v.toFixed(2)}));}}
                  placeholder={lang==='en'?'Cost per unit':'Coût/unité'}/>
              </div>
              <div style={{position:'relative'}}>
                <span style={{position:'absolute',left:8,top:'50%',transform:'translateY(-50%)',fontSize:12,opacity:0.4}}>$</span>
                <input type="number" min="0" step="0.01" style={{...inp,paddingLeft:18}}
                  value={form.sell_price}
                  onChange={e=>setForm(f=>({...f,sell_price:e.target.value}))}
                  onBlur={e=>{const v=parseFloat(e.target.value);setForm(f=>({...f,sell_price:isNaN(v)||v<0?'':v.toFixed(2)}));}}
                  placeholder={lang==='en'?'Sell price':'Prix de vente'}/>
              </div>
            </div>
            {(() => {
              const cost=parseFloat(form.unit_cost),price=parseFloat(form.sell_price);
              if(isNaN(cost)||isNaN(price)||cost<=0||price<=0)return null;
              const margin=price-cost,pct=(margin/price)*100;
              const color=pct>50?'#22c55e':pct>30?'#f97316':'#ef4444';
              return <div style={{fontSize:11,marginTop:4,color}}>{lang==='en'?'Margin':'Marge'}: ${margin.toFixed(2)} ({pct.toFixed(0)}%)</div>;
            })()}
          </div>

          <div>
            <label style={lbl}>{lang==='en' ? 'Production frequency' : 'Fréquence de production'}</label>
            <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:8}}>
              {freqPresets.map(({v,label,sub}) => {
                const active = form.shelf_life_days === v;
                return (
                  <button key={v} type="button" onClick={()=>setForm(f=>({...f,shelf_life_days:v}))}
                    style={{padding:'7px 12px',borderRadius:8,border:`1px solid ${active?'#f97316':t.cardBorder}`,background:active?'rgba(249,115,22,0.15)':t.section,color:active?'#f97316':t.textSub,cursor:'pointer',textAlign:'center',lineHeight:1.3}}>
                    <div style={{fontSize:12,fontWeight:600}}>{label}</div>
                    <div style={{fontSize:10,opacity:0.65}}>{sub}</div>
                  </button>
                );
              })}
            </div>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:11,color:t.textSub,whiteSpace:'nowrap'}}>{lang==='en'?'Custom: every':'Autre: tous les'}</span>
              <input
                type="number" min="1" max="30"
                style={{...inp, width:64, padding:'5px 8px', fontSize:12}}
                value={form.shelf_life_days}
                onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v) && v >= 1) setForm(f=>({...f,shelf_life_days:v})); }}
              />
              <span style={{fontSize:11,color:t.textSub}}>{lang==='en'?'day(s)':'jour(s)'}</span>
            </div>
            <div style={{fontSize:10,opacity:0.55,marginTop:6,color:form.shelf_life_days<=1?'#22c55e':'#f97316'}}>{freqHint}</div>
          </div>

          <div>
            <label style={lbl}>{T.prevProdWeatherSens}</label>
            <select style={inp} value={form.weather_sensitivity} onChange={e=>setForm(f=>({...f,weather_sensitivity:parseInt(e.target.value)}))}>
              {ws.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div>
            <label style={lbl}>{T.prevProdNotes}</label>
            <textarea style={{...inp,minHeight:64,resize:'vertical'}} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/>
          </div>
        </div>

        <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:22}}>
          <button onClick={onClose} style={{padding:'8px 18px',borderRadius:7,border:`1px solid ${t.cardBorder}`,background:t.section,color:t.textSub,cursor:'pointer',fontSize:13}}>{T.prevImportCancel}</button>
          <button onClick={handleSave} style={{padding:'8px 18px',borderRadius:7,border:'none',background:'linear-gradient(135deg,#f97316,#ea580c)',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:600}}>{T.prevProdSave}</button>
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
      <div style={{background:t.optionBg,border:`1px solid ${t.cardBorder}`,borderRadius:12,padding:20,width:280}}>
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
    <div style={{position:'fixed',inset:0,zIndex:1200,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.35)'}} onClick={onClose}>
      <div style={{background:t.optionBg,border:`1px solid ${t.cardBorder}`,borderRadius:12,padding:20,width:280,boxShadow:'0 12px 40px rgba(0,0,0,0.4)'}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:13,fontWeight:700,color:t.text,marginBottom:4}}>{T.prevCellDetail}{product.name}</div>
        <div style={{fontSize:11,color:t.textMuted,marginBottom:12}}>{formatDateFull(dateStr, lang)}</div>
        <div style={{fontSize:28,fontWeight:800,color:'#f97316',marginBottom:10,lineHeight:1}}>{result.prediction}</div>
        <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:12}}>
          <span style={{fontSize:10,fontWeight:700,color:confColors[result.confidence],background:`${confColors[result.confidence]}22`,border:`1px solid ${confColors[result.confidence]}44`,borderRadius:8,padding:'2px 8px'}}>{confLabels[result.confidence]}</span>
          <span style={{fontSize:11,color:t.textMuted}}>{T.prevDataPoints(result.dataPoints)}</span>
        </div>
        <div style={{borderTop:`1px solid ${t.cardBorder}`,paddingTop:10,fontSize:12,color:t.textSub,lineHeight:2}}>
          <div style={{display:'flex',justifyContent:'space-between'}}>
            <span style={{opacity:0.7}}>{T.prevWeightedAvg}</span>
            <strong style={{color:t.text}}>{result.baseAvg}</strong>
          </div>
          {result.weatherFactor !== 0 && (
            <div style={{display:'flex',justifyContent:'space-between'}}>
              <span style={{opacity:0.7}}>{T.prevWeatherAdj}{w?` (${conditionToIcon(weatherCodeToCondition(w.weather_code))} ${Math.round(w.temp_max||0)}°C)`:''}</span>
              <strong style={{color:result.weatherFactor>0?'#22c55e':'#ef4444'}}>{pct(result.weatherFactor)}</strong>
            </div>
          )}
          {result.trendFactor !== 0 && (
            <div style={{display:'flex',justifyContent:'space-between'}}>
              <span style={{opacity:0.7}}>{T.prevTrendAdj}</span>
              <strong style={{color:result.trendFactor>0?'#22c55e':'#ef4444'}}>{pct(result.trendFactor)}</strong>
            </div>
          )}
        </div>
        <button onClick={onClose} style={{marginTop:14,padding:'6px 0',borderRadius:6,border:`1px solid ${t.cardBorder}`,background:t.section,color:t.textSub,cursor:'pointer',fontSize:11,width:'100%'}}>✕ {lang==='en'?'Close':'Fermer'}</button>
      </div>
    </div>
  );
}

// ── AI Analysis View (dedicated sub-tab) ─────────────────────────────────────

function AIAnalysisView({ canUse, allSales, products, weatherMap, weekDates, predictions, showUpgradePrompt, apiConfig, T, t, lang }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [analysisType, setAnalysisType] = useState('weekly'); // weekly | item
  const [selectedProductId, setSelectedProductId] = useState('');

  const locked = !canUse('aiAnalysis');

  const buildContext = () => {
    if (analysisType === 'item') {
      const product = products.find(p=>p.id===selectedProductId);
      if (!product) return null;
      const sales = allSales.filter(s=>s.product_id===product.id)
        .sort((a,b)=>b.date.localeCompare(a.date)).slice(0,60);
      const last30 = sales.slice(0,30);
      const avgSold = last30.length ? Math.round(last30.reduce((a,s)=>a+s.quantity_sold,0)/last30.length) : 0;
      const withMade = last30.filter(s=>s.quantity_made>0);
      const waste = withMade.length ? Math.round(withMade.reduce((a,s)=>a+(s.quantity_made-s.quantity_sold)/s.quantity_made,0)/withMade.length*100) : null;
      const stockoutDays = last30.filter(s=>s.stockout).length;
      const cutoff2w = sales[0] ? new Date(new Date(sales[0].date).getTime()-14*86400000).toISOString().slice(0,10) : '';
      const r2w = last30.filter(s=>s.date>=cutoff2w);
      const p2w = last30.filter(s=>s.date<cutoff2w);
      const trend = r2w.length && p2w.length
        ? Math.round(((r2w.reduce((a,s)=>a+s.quantity_sold,0)/r2w.length)-(p2w.reduce((a,s)=>a+s.quantity_sold,0)/p2w.length))/(p2w.reduce((a,s)=>a+s.quantity_sold,0)/p2w.length)*100)
        : null;
      return {
        queryType: 'previsions_item',
        contextData: {
          name: product.name, category: product.category, shelfLife: product.shelf_life_days,
          sensitivity: product.weather_sensitivity, baseQty: product.base_quantity,
          avgSold, waste, stockoutDays, trend,
          sales: sales.map(s=>({ date:s.date, sold:s.quantity_sold, made:s.quantity_made, stockout:s.stockout?1:0, waste:s.quantity_made>0?Math.round((s.quantity_made-s.quantity_sold)/s.quantity_made*100):null, temp:weatherMap[s.date]?Math.round(weatherMap[s.date].temp_max||0):null })),
        },
      };
    }
    // Weekly
    const prods = products.filter(p=>p.active).map(p => {
      const sales = allSales.filter(s=>s.product_id===p.id).slice(0,30);
      const avgSold = sales.length ? Math.round(sales.reduce((a,s)=>a+s.quantity_sold,0)/sales.length) : 0;
      const stockouts = sales.filter(s=>s.stockout).length;
      const withMade = sales.filter(s=>s.quantity_made>0);
      const waste = withMade.length ? Math.round(withMade.reduce((a,s)=>a+(s.quantity_made-s.quantity_sold)/s.quantity_made,0)/withMade.length*100) : null;
      const weekForecast = weekDates.reduce((a,d)=>a+(predictions?.[p.id]?.[d]?.prediction||0),0);
      return { name:p.name, category:p.category, avgSold, stockouts, waste, weekForecast, sensitivity:p.weather_sensitivity };
    });
    const weather = weekDates.map(d=>{ const w=weatherMap[d]; return w?`${d.slice(5)}: ${Math.round(w.temp_max||0)}°C`:null; }).filter(Boolean).join(', ')||'unknown';
    return { queryType:'previsions_weekly', contextData:{ products:prods, weather } };
  };

  const analyze = async () => {
    setLoading(true);
    setResult(null);
    try {
      const ctx = buildContext();
      if (!ctx) { setResult(lang==='en'?'Select a product first.':'Sélectionnez un produit d\'abord.'); setLoading(false); return; }
      const { supabase } = await import('../services/supabase.js');
      let { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error(lang==='en'?'Sign in required — go to Config → Application':'Connexion requise — allez dans Config → Application');
      // Always refresh the token before calling the edge function to avoid Invalid JWT errors
      try {
        const { data: refreshed } = await supabase.auth.refreshSession();
        if (refreshed?.session) session = refreshed.session;
      } catch {}
      const orgId = apiConfig?.supabaseOrgId || null;
      const resp = await fetch('https://etiwnesxjypdwhxqnqqq.supabase.co/functions/v1/ai-intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ ...ctx, orgId, lang, ownApiKey: apiConfig?.anthropicApiKey || null }),
      });
      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`HTTP ${resp.status}: ${errText.slice(0,120)}`);
      }
      const data = await resp.json();
      console.log('[AI Intelligence] response:', data);
      if (data.error === 'upgrade_required') throw new Error(lang==='en'?'Pro plan required — upgrade in Config → Application':'Plan Pro requis — mettez à niveau dans Config → Application');
      if (data.error === 'limit_reached') throw new Error(lang==='en'?`Monthly AI limit reached (${data.usageCount}/${data.usageLimit})`:`Limite IA mensuelle atteinte (${data.usageCount}/${data.usageLimit})`);
      if (data.error === 'no_auth') throw new Error(lang==='en'?'Sign in required — go to Config → Application':'Connexion requise — allez dans Config → Application');
      if (data.error === 'no_org') throw new Error(lang==='en'?'Cloud account not linked — go to Config → Application':'Compte cloud non lié — allez dans Config → Application');
      if (data.error === 'no_key') throw new Error(lang==='en'?'ANTHROPIC_API_KEY not configured on server':'ANTHROPIC_API_KEY non configuré sur le serveur');
      if (data.error) throw new Error(data.message || data.error);
      if (!data.text) {
        console.warn('[AI Intelligence] empty text, full response:', JSON.stringify(data));
        throw new Error(lang==='en'?'Claude returned an empty response. Open DevTools Console for details.':'Réponse vide de Claude. Voir la console pour les détails.');
      }
      setResult({ text: data.text, usageCount: data.usageCount, usageLimit: data.usageLimit });
    } catch (e) {
      setResult({ error: e.message });
    }
    setLoading(false);
  };

  const inp = { background:t.inputBg, border:`1px solid ${t.inputBorder}`, borderRadius:5, color:t.text, fontSize:12, padding:'6px 8px', outline:'none' };

  if (locked) {
    return (
      <div style={{padding:'32px 24px',textAlign:'center'}}>
        <div style={{fontSize:32,marginBottom:12}}>✨</div>
        <div style={{fontSize:16,fontWeight:700,marginBottom:8}}>{lang==='en'?'AI Analysis — Pro Feature':'Analyse IA — Fonctionnalité Pro'}</div>
        <div style={{fontSize:13,opacity:0.6,marginBottom:6,maxWidth:380,margin:'0 auto 16px'}}>
          {lang==='en'
            ? 'Get Claude AI to analyze your production patterns, identify waste risks, stockout alerts, and give specific weekly recommendations.'
            : 'Faites analyser vos données de production par Claude AI — gaspillage, ruptures de stock, recommandations hebdomadaires spécifiques.'}
        </div>
        <div style={{fontSize:11,opacity:0.5,marginBottom:20}}>{lang==='en'?'Pro: 50 queries/month · Franchise: 200 queries/month · On-demand only':'Pro: 50 requêtes/mois · Franchise: 200 requêtes/mois · À la demande seulement'}</div>
        <button onClick={()=>showUpgradePrompt&&showUpgradePrompt('aiAnalysis')}
          style={{padding:'10px 24px',borderRadius:8,border:'none',background:'linear-gradient(135deg,#a78bfa,#7c3aed)',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700}}>
          {lang==='en'?'Upgrade to Pro':'Passer au Pro'} ↑
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16,flexWrap:'wrap'}}>
        <div style={{fontSize:11,fontWeight:700,color:'#a78bfa',textTransform:'uppercase',letterSpacing:1}}>{lang==='en'?'AI Analysis':'Analyse IA'}</div>
        <span style={{fontSize:9,padding:'2px 6px',borderRadius:4,background:'rgba(167,139,250,0.15)',color:'#a78bfa',fontWeight:700}}>PRO</span>
        {result?.usageCount != null && <span style={{fontSize:10,opacity:0.5,marginLeft:'auto'}}>{result.usageCount}/{result.usageLimit} {lang==='en'?'queries/mo':'requêtes/mois'}</span>}
      </div>

      <div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap',alignItems:'center'}}>
        {[['weekly', lang==='en'?'Weekly overview':'Vue hebdomadaire'], ['item', lang==='en'?'Product deep dive':'Analyse produit']].map(([v,l])=>(
          <button key={v} onClick={()=>{setAnalysisType(v);setResult(null);}}
            style={{padding:'5px 14px',borderRadius:12,border:`1px solid ${analysisType===v?'#a78bfa':t.cardBorder}`,background:analysisType===v?'rgba(167,139,250,0.12)':t.section,color:analysisType===v?'#a78bfa':'inherit',cursor:'pointer',fontSize:11,fontWeight:600}}>
            {l}
          </button>
        ))}
        {analysisType === 'item' && (
          <select style={{...inp,fontSize:11}} value={selectedProductId} onChange={e=>setSelectedProductId(e.target.value)}>
            <option value="">{lang==='en'?'— Select product —':'— Choisir un produit —'}</option>
            {products.filter(p=>p.active).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </div>

      <button onClick={analyze} disabled={loading || (analysisType==='item'&&!selectedProductId)}
        style={{padding:'9px 22px',borderRadius:8,border:'none',background:'linear-gradient(135deg,#a78bfa,#7c3aed)',color:'#fff',cursor:(loading||(analysisType==='item'&&!selectedProductId))?'not-allowed':'pointer',fontSize:13,fontWeight:700,opacity:(loading||(analysisType==='item'&&!selectedProductId))?0.6:1,marginBottom:16}}>
        {loading ? (lang==='en'?'Analyzing…':'Analyse en cours…') : (lang==='en'?'✨ Analyze with Claude AI':'✨ Analyser avec Claude AI')}
      </button>

      {result?.error && (
        <div style={{padding:'12px 16px',background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:8,fontSize:12,color:'#fca5a5',marginBottom:12}}>
          ⚠️ {result.error}
        </div>
      )}

      {result?.text && (
        <div style={{padding:'18px 20px',background:'rgba(167,139,250,0.06)',border:'1px solid rgba(167,139,250,0.2)',borderRadius:10,fontSize:13,lineHeight:1.75,whiteSpace:'pre-wrap',color:t.text}}>
          <div style={{fontSize:11,fontWeight:700,color:'#a78bfa',marginBottom:12,display:'flex',alignItems:'center',gap:6}}>
            ✨ {analysisType==='weekly'?(lang==='en'?'Weekly Production Analysis':'Analyse hebdomadaire de production'):(lang==='en'?`Product Analysis — ${products.find(p=>p.id===selectedProductId)?.name||''}`:` Analyse produit — ${products.find(p=>p.id===selectedProductId)?.name||''}`)}
            <span style={{fontSize:9,padding:'1px 5px',borderRadius:3,background:'rgba(167,139,250,0.2)',color:'#c084fc'}}>Claude AI</span>
          </div>
          {result.text}
        </div>
      )}

      <div style={{marginTop:20,fontSize:10,opacity:0.4,textAlign:'center'}}>
        {lang==='en'?'Pro: 50 queries/month · Franchise: 200 queries/month · On-demand only — no surprise API costs':'Pro: 50 requêtes/mois · Franchise: 200 requêtes/mois · À la demande — aucun coût surprise'}
      </div>
    </div>
  );
}

// ── Products Sub-view ─────────────────────────────────────────────────────────

function ProductsView({ products, onSaveProduct, T, t, lang }) {
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
          T={T} t={t} lang={lang}
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

function CSVImportView({ products, onImported, savedFormats, onSaveFormat, T, t, lang, canUse, apiConfig, showUpgradePrompt }) {
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

  // Determine connected POS name (if any)
  const posIntegrations = apiConfig?.posIntegrations || {};
  const connectedPos = Object.entries(posIntegrations).find(([,cfg]) => cfg?.connected && cfg?.accessToken);
  const connectedPosName = connectedPos ? connectedPos[0] : null;

  return (
    <div>
      <div style={{fontSize:13,fontWeight:700,marginBottom:12}}>{T.prevImportTitle}</div>

      {/* POS Import section */}
      <div style={{marginBottom:14,padding:'10px 12px',background:t.section,borderRadius:7,border:`1px solid ${t.cardBorder}`}}>
        <div style={{fontSize:11,fontWeight:700,marginBottom:6,opacity:0.8}}>📡 POS</div>
        {!canUse('posIntegration') ? (
          <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
            <span style={{fontSize:11,opacity:0.6}}>{T.prevPOSProRequired}</span>
            <button onClick={()=>showUpgradePrompt&&showUpgradePrompt('posIntegration')}
              style={{padding:'3px 10px',borderRadius:12,border:'1px solid #f97316',color:'#f97316',background:'rgba(249,115,22,0.1)',cursor:'pointer',fontSize:10,fontWeight:600,whiteSpace:'nowrap'}}>Pro ↑</button>
          </div>
        ) : connectedPosName ? (
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontSize:11,opacity:0.7}}>{connectedPosName}</span>
            <button style={{padding:'5px 14px',borderRadius:6,border:'1px solid #3b82f6',background:'rgba(59,130,246,0.1)',color:'#3b82f6',cursor:'not-allowed',fontSize:11,fontWeight:600,opacity:0.7}}>
              {T.prevPOSImportBtn(connectedPosName)}
            </button>
            <span style={{fontSize:10,opacity:0.5,fontStyle:'italic'}}>(item-level import — coming soon)</span>
          </div>
        ) : (
          <span style={{fontSize:11,opacity:0.5,fontStyle:'italic'}}>{T.prevPOSNoConn}</span>
        )}
      </div>

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

// ── Weather Correlation Section ───────────────────────────────────────────────

function WeatherCorrelationSection({ product, last30, weatherMap, onUpdateSensitivity, T, t, lang }) {
  const [dismissed, setDismissed] = useState(false);

  // Group last30 by whether weather was warm (>15°C) or cold (<10°C)
  const warmDays = last30.filter(s => (weatherMap[s.date]?.temp_max ?? 12) > 15);
  const coldDays = last30.filter(s => (weatherMap[s.date]?.temp_max ?? 12) < 10);
  const neutralDays = last30.filter(s => { const t = weatherMap[s.date]?.temp_max ?? 12; return t >= 10 && t <= 15; });

  const avg = arr => arr.length ? arr.reduce((a,s)=>a+s.quantity_sold,0)/arr.length : null;
  const warmAvg = avg(warmDays);
  const coldAvg = avg(coldDays);
  const neutralAvg = avg(neutralDays) || avg(last30) || 0;

  if (!neutralAvg || (warmDays.length < 3 && coldDays.length < 3)) return null;

  // Compute observed sensitivity: +2 if warm avg >25% above neutral, +1 if 10-25%, etc.
  let observedSens = 0;
  if (warmAvg && warmAvg > neutralAvg * 1.25) observedSens = 2;
  else if (warmAvg && warmAvg > neutralAvg * 1.10) observedSens = 1;
  else if (coldAvg && coldAvg > neutralAvg * 1.25) observedSens = -2;
  else if (coldAvg && coldAvg > neutralAvg * 1.10) observedSens = -1;

  const warmPct = warmAvg ? `${warmAvg > neutralAvg ? '+' : ''}${Math.round((warmAvg/neutralAvg-1)*100)}%` : null;
  const coldPct = coldAvg ? `${coldAvg > neutralAvg ? '+' : ''}${Math.round((coldAvg/neutralAvg-1)*100)}%` : null;

  return (
    <div style={{marginBottom:16,padding:'10px 12px',background:'rgba(96,165,250,0.06)',border:'1px solid rgba(96,165,250,0.2)',borderRadius:8}}>
      <div style={{fontSize:11,fontWeight:600,marginBottom:6,color:'#60a5fa'}}>{T.prevItemWeatherCorr}</div>
      <div style={{fontSize:11,opacity:0.8,marginBottom:4,display:'flex',gap:16,flexWrap:'wrap'}}>
        {warmAvg && warmDays.length >= 3 && <span>☀️ &gt;15°C: <strong style={{color:warmAvg>neutralAvg?'#22c55e':'#ef4444'}}>{warmPct} vs neutre</strong> ({warmDays.length}j)</span>}
        {coldAvg && coldDays.length >= 3 && <span>❄️ &lt;10°C: <strong style={{color:coldAvg>neutralAvg?'#22c55e':'#ef4444'}}>{coldPct} vs neutre</strong> ({coldDays.length}j)</span>}
      </div>
      {!dismissed && observedSens !== 0 && observedSens !== product.weather_sensitivity && (
        <div style={{fontSize:11,color:'#f59e0b',marginTop:6,display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
          <span>💡 {T.prevItemUpdateSens}<strong>{observedSens > 0 ? `+${observedSens}` : observedSens}</strong>{T.prevItemUpdateSens2}</span>
          <button onClick={()=>{ onUpdateSensitivity(product, observedSens); setDismissed(true); }} style={{padding:'2px 10px',borderRadius:10,border:'none',background:'#f59e0b',color:'#fff',cursor:'pointer',fontSize:10,fontWeight:700}}>{T.prevItemYes}</button>
          <button onClick={()=>setDismissed(true)} style={{padding:'2px 10px',borderRadius:10,border:'1px solid rgba(245,158,11,0.4)',background:'transparent',color:'#f59e0b',cursor:'pointer',fontSize:10}}>{T.prevItemNo}</button>
        </div>
      )}
    </div>
  );
}

// ── Item Detail View ──────────────────────────────────────────────────────────

function ItemDetailView({ product, allSales, weatherMap, onBack, onBackToAI, onUpdateSensitivity, canUse, T, t, lang }) {
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

  const cutoff2w = toDateStr(new Date(Date.now() - 14*86400000));
  const cutoff4w = toDateStr(new Date(Date.now() - 28*86400000));
  const r2w = last30.filter(s=>s.date>=cutoff2w);
  const p2w = last30.filter(s=>s.date>=cutoff4w&&s.date<cutoff2w);
  const trendPct = r2w.length && p2w.length
    ? ((r2w.reduce((a,s)=>a+s.quantity_sold,0)/r2w.length) - (p2w.reduce((a,s)=>a+s.quantity_sold,0)/p2w.length)) / (p2w.reduce((a,s)=>a+s.quantity_sold,0)/p2w.length) * 100
    : 0;

  const dayNames = lang==='en'
    ? ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
    : ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];

  const dowAvg = Array(7).fill(null).map((_,dow) => {
    const s = last30.filter(x=>new Date(x.date+'T12:00:00').getDay()===dow);
    return s.length ? s.reduce((a,x)=>a+x.quantity_sold,0)/s.length : null;
  });
  const maxDow = Math.max(...dowAvg.filter(v=>v!=null), 1);
  const maxDowIdx = dowAvg.findIndex(v => v === maxDow);

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

  // Overview stats
  const stockoutsByDow = {};
  last30.filter(s=>s.stockout).forEach(s => {
    const dow = new Date(s.date+'T12:00:00').getDay();
    stockoutsByDow[dow] = (stockoutsByDow[dow]||0) + 1;
  });
  const topStockoutDow = Object.entries(stockoutsByDow).sort((a,b)=>b[1]-a[1])[0];
  const stockoutLabel = topStockoutDow
    ? `${stockoutDays} (${getDayFullName(parseInt(topStockoutDow[0]),lang)})`
    : String(stockoutDays);

  const weekCount = Math.round(productSales.length / 7);
  const confText = weekCount < 2
    ? (lang==='en'?'Base (< 2 weeks)':'Base (< 2 sem.)')
    : weekCount < 4 ? `${lang==='en'?'Low':'Faible'} (${weekCount} ${lang==='en'?'wks':'sem'})`
    : weekCount < 8 ? `${lang==='en'?'Medium':'Moyen'} (${weekCount} ${lang==='en'?'wks':'sem'})`
    : `${lang==='en'?'High':'Élevé'} (${weekCount} ${lang==='en'?'wks':'sem'})`;
  const confColor = weekCount >= 8 ? '#22c55e' : weekCount >= 4 ? '#f59e0b' : '#6b7280';

  const sensitivityLabels = {'-2':lang==='en'?'Strong cold seller':'Fort vendeur froid','-1':lang==='en'?'Slight cold seller':'Léger froid','0':lang==='en'?'Neutral':'Neutre','1':lang==='en'?'Slight warm seller':'Léger chaud','2':lang==='en'?'Strong warm seller':'Fort vendeur chaud'};
  const sensDisplay = `${product.weather_sensitivity>0?'+':''}${product.weather_sensitivity} (${sensitivityLabels[String(product.weather_sensitivity)]||'—'})`;

  // DOW insight
  const weekdayAvgs = dowAvg.filter((v,i) => v!=null && i>=1 && i<=5);
  const weekdayMean = weekdayAvgs.length ? weekdayAvgs.reduce((a,b)=>a+b,0)/weekdayAvgs.length : 0;
  const peakMultiplier = (weekdayMean > 0 && maxDowIdx !== -1) ? (maxDow/weekdayMean).toFixed(1) : null;
  const peakStockouts = last30.filter(s=>new Date(s.date+'T12:00:00').getDay()===maxDowIdx&&s.stockout).length;
  const peakTotal = last30.filter(s=>new Date(s.date+'T12:00:00').getDay()===maxDowIdx).length;

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,marginBottom:14,flexWrap:'wrap'}}>
        <button onClick={onBack} style={{background:'none',border:'none',color:'#f97316',cursor:'pointer',fontSize:12,fontWeight:600,padding:0}}>{T.prevItemBack}</button>
        <button onClick={onBackToAI}
          style={{padding:'5px 12px',borderRadius:6,border:'1px solid rgba(167,139,250,0.3)',background:'rgba(167,139,250,0.08)',color:'#a78bfa',cursor:'pointer',fontSize:11,fontWeight:600}}>
          ✨ {lang==='en'?'Analyze with AI':'Analyser avec IA'}{!canUse('aiAnalysis')&&<span style={{marginLeft:4,fontSize:8,verticalAlign:'middle',padding:'1px 4px',borderRadius:3,background:'rgba(167,139,250,0.2)'}}>PRO</span>}
        </button>
      </div>

      <div style={{fontSize:10,fontWeight:700,color:'#f97316',textTransform:'uppercase',letterSpacing:2,marginBottom:4}}>{T.prevItemProfile}</div>
      <div style={{fontSize:16,fontWeight:700,marginBottom:2}}>{product.name}</div>
      {product.category && <div style={{fontSize:11,opacity:0.5,marginBottom:14}}>{product.category}</div>}

      {last30.length === 0 ? (
        <div style={{textAlign:'center',padding:'20px 0',fontSize:12,opacity:0.5}}>{T.prevItemNoData}</div>
      ) : (
        <>
          {/* Two-column: Overview + DOW Pattern */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
            {/* Overview card */}
            <div style={{padding:'16px',background:t.section,border:`1px solid ${t.cardBorder}`,borderRadius:10}}>
              <div style={{fontSize:10,fontWeight:700,color:'#f97316',textTransform:'uppercase',letterSpacing:1,marginBottom:12}}>
                📊 {lang==='en'?'Overview':'Vue d\'ensemble'}
              </div>
              {[
                [lang==='en'?'Average sold / day':'Moy. vendu / jour', Math.round(avgSold), null],
                [lang==='en'?'Average produced / day':'Moy. produit / jour', avgMade > 0 ? Math.round(avgMade) : '—', null],
                [lang==='en'?'Waste rate':'Taux gaspillage', avgMade > 0 ? `${Math.round(wasteRate*100)}%` : '—', avgMade>0?(wasteRate>0.15?'#ef4444':wasteRate>0.08?'#f59e0b':'#22c55e'):null],
                [lang==='en'?'Stockout days':'Jours rupture', stockoutLabel, stockoutDays>0?'#ef4444':null],
                [lang==='en'?'Trend':'Tendance', `${trendPct>0?'↑ +':trendPct<0?'↓ ':'→ '}${Math.round(Math.abs(trendPct))}% ${lang==='en'?'this mo.':'ce mois'}`, trendPct>5?'#22c55e':trendPct<-5?'#ef4444':null],
                [lang==='en'?'Weather sensitivity':'Sensibilité météo', sensDisplay, null],
                [lang==='en'?'Shelf life':'Durée de vie', `${product.shelf_life_days} ${lang==='en'?'day':'jour'}${product.shelf_life_days>1?'s':''}`, null],
                [lang==='en'?'Forecast confidence':'Fiabilité prévision', confText, confColor],
              ].map(([label,val,color])=>(
                <div key={label} style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',padding:'5px 0',borderBottom:`1px solid ${t.cardBorder}`,fontSize:11,gap:8}}>
                  <span style={{opacity:0.6,flexShrink:0}}>{label}</span>
                  <strong style={{color:color||t.text,textAlign:'right',fontSize:12}}>{val}</strong>
                </div>
              ))}
            </div>

            {/* DOW Pattern card */}
            <div style={{padding:'16px',background:t.section,border:`1px solid ${t.cardBorder}`,borderRadius:10,display:'flex',flexDirection:'column',gap:10}}>
              <div style={{fontSize:10,fontWeight:700,color:'#f97316',textTransform:'uppercase',letterSpacing:1}}>
                📅 {lang==='en'?'Day-of-Week Pattern':'Profil par jour'}
              </div>
              <div>
                {dowAvg.map((val,i) => {
                  if (val === null) return null;
                  const isPeak = i === maxDowIdx;
                  const pct = maxDow > 0 ? (val / maxDow) * 100 : 0;
                  return (
                    <div key={i} style={{display:'flex',alignItems:'center',gap:6,marginBottom:5,fontSize:11}}>
                      <span style={{width:26,opacity:0.6,fontSize:10,flexShrink:0}}>{dayNames[i]}</span>
                      <div style={{flex:1,background:t.cardBorder,borderRadius:3,height:12,overflow:'hidden'}}>
                        <div style={{width:`${pct}%`,height:'100%',background:isPeak?'#f97316':'rgba(249,115,22,0.35)',borderRadius:3}}/>
                      </div>
                      <span style={{width:30,textAlign:'right',fontWeight:isPeak?700:400,color:isPeak?'#f97316':'inherit',flexShrink:0,fontSize:isPeak?12:11}}>{Math.round(val)}</span>
                    </div>
                  );
                })}
              </div>
              {maxDowIdx !== -1 && peakMultiplier && parseFloat(peakMultiplier) > 1.2 && (
                <div style={{fontSize:11,opacity:0.75,lineHeight:1.5}}>
                  {lang==='en'
                    ? `${dayNames[maxDowIdx]} demand is ${peakMultiplier}× the weekday avg.`
                    : `La demande du ${dayNames[maxDowIdx]} est ${peakMultiplier}× la moy. semaine.`}
                  {peakStockouts >= 2 && <span style={{color:'#ef4444',marginLeft:4}}>🔴 {lang==='en'?`Out of stock ${peakStockouts}/${peakTotal} times.`:`Rupture ${peakStockouts}/${peakTotal} fois.`}</span>}
                </div>
              )}
              {accuracyByDow.length > 0 && (
                <div>
                  <div style={{fontSize:10,opacity:0.55,marginBottom:4}}>{T.prevItemAccTitle}</div>
                  <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
                    {accuracyByDow.map(a=>(
                      <span key={a.dow} style={{padding:'2px 7px',borderRadius:6,background:'rgba(34,197,94,0.08)',border:'1px solid rgba(34,197,94,0.2)',fontSize:10}}>
                        {a.name}: <strong style={{color:'#22c55e'}}>{a.acc}%</strong>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <WeatherCorrelationSection product={product} last30={last30} weatherMap={weatherMap} onUpdateSensitivity={onUpdateSensitivity} T={T} t={t} lang={lang}/>
            </div>
          </div>

          {/* Recent History */}
          <div style={{padding:'16px',background:t.section,border:`1px solid ${t.cardBorder}`,borderRadius:10}}>
            <div style={{fontSize:10,fontWeight:700,color:'#f97316',textTransform:'uppercase',letterSpacing:1,marginBottom:12}}>
              🗒️ {T.prevItemHistory}
            </div>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                <thead>
                  <tr style={{borderBottom:`1px solid ${t.cardBorder}`}}>
                    {[T.prevColDate,T.prevColMade,T.prevColSold,T.prevColRemaining,T.prevColStockout,lang==='en'?'Weather':'Météo',lang==='en'?'Waste':'Gaspillage'].map(h=>(
                      <th key={h} style={{padding:'5px 8px',textAlign:'left',opacity:0.55,fontWeight:700,fontSize:10,textTransform:'uppercase',letterSpacing:0.5}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {last14.map((s,i)=>{
                    const wDay = weatherMap[s.date];
                    const weatherCell = wDay ? `${conditionToIcon(weatherCodeToCondition(wDay.weather_code))} ${Math.round(wDay.temp_max||0)}°` : '—';
                    let wasteCell = '—';
                    let wasteColor = 'inherit';
                    if (s.quantity_made > 0) {
                      const wastePct = Math.round((s.quantity_made - s.quantity_sold) / s.quantity_made * 100);
                      wasteCell = `${wastePct}%`;
                      wasteColor = wastePct > 15 ? '#ef4444' : wastePct > 8 ? '#f59e0b' : '#22c55e';
                    }
                    return (
                      <tr key={i} style={{borderBottom:`1px solid ${t.cardBorder}`}}>
                        <td style={{padding:'5px 8px'}}>{formatDateShort(s.date,lang)}</td>
                        <td style={{padding:'5px 8px'}}>{s.quantity_made??'—'}</td>
                        <td style={{padding:'5px 8px',fontWeight:600}}>{s.quantity_sold}</td>
                        <td style={{padding:'5px 8px'}}>{s.quantity_remaining??'—'}</td>
                        <td style={{padding:'5px 8px'}}>{s.stockout?<span style={{color:'#ef4444',fontWeight:700}}>🔴 {lang==='en'?'Yes':'Oui'}</span>:'—'}</td>
                        <td style={{padding:'5px 8px'}}>{weatherCell}</td>
                        <td style={{padding:'5px 8px',fontWeight:600,color:wasteColor}}>{wasteCell}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Financial Profile */}
          {(product.unit_cost != null || product.sell_price != null) && (
            <div style={{padding:'14px 16px',background:t.section,border:`1px solid ${t.cardBorder}`,borderRadius:10,marginTop:12}}>
              <div style={{fontSize:12,fontWeight:700,marginBottom:8}}>💰 {lang==='en'?'Profitability':'Rentabilité'} — {product.name}</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,fontSize:11}}>
                {product.unit_cost!=null&&<div><span style={{opacity:0.6}}>{lang==='en'?'Unit cost:':'Coût/unité:'}</span> ${product.unit_cost.toFixed(2)}</div>}
                {product.sell_price!=null&&<div><span style={{opacity:0.6}}>{lang==='en'?'Sell price:':'Prix de vente:'}</span> ${product.sell_price.toFixed(2)}</div>}
                {product.unit_cost!=null&&product.sell_price!=null&&(()=>{
                  const m=product.sell_price-product.unit_cost,p=(m/product.sell_price)*100;
                  const c=p>50?'#22c55e':p>30?'#f97316':'#ef4444';
                  return <div style={{color:c}}><span style={{opacity:0.6,color:t.textSub}}>{lang==='en'?'Margin:':'Marge:'}</span> ${m.toFixed(2)} ({p.toFixed(0)}%)</div>;
                })()}
              </div>
              {(()=>{
                const ps=allSales.filter(s=>s.product_id===product.id&&s.quantity_remaining!=null);
                if(ps.length===0)return null;
                const avgWaste=ps.reduce((a,s)=>a+(s.quantity_remaining||0),0)/ps.length;
                const weeklyWasteCost=product.unit_cost!=null?avgWaste*7*product.unit_cost:null;
                const stockouts=ps.filter(s=>s.stockout);
                const weeklyLost=product.sell_price!=null&&stockouts.length>0?(stockouts.length/ps.length)*avgWaste*1.25*product.sell_price*7:null;
                if(!weeklyWasteCost&&!weeklyLost)return null;
                return (
                  <div style={{marginTop:8,paddingTop:8,borderTop:`1px solid ${t.cardBorder}`,fontSize:11,display:'flex',flexDirection:'column',gap:3}}>
                    {weeklyWasteCost!=null&&avgWaste>0&&<div style={{opacity:0.7}}>{lang==='en'?`Avg weekly waste: ~${Math.round(avgWaste)} units = $${(avgWaste*product.unit_cost).toFixed(2)}`:`Gaspillage moy./sem: ~${Math.round(avgWaste)} u = ${(avgWaste*product.unit_cost).toFixed(2)}$`}</div>}
                    {weeklyLost!=null&&weeklyLost>0&&<div style={{color:'#ef4444',opacity:0.85}}>{lang==='en'?`Est. weekly stockout loss: -$${weeklyLost.toFixed(2)}`:`Ruptures est./sem: -${weeklyLost.toFixed(2)}$`}</div>}
                    {weeklyWasteCost!=null&&weeklyLost!=null&&<div style={{color:'#22c55e',fontWeight:600}}>{lang==='en'?`If optimized: +$${(weeklyWasteCost*0.6+weeklyLost*0.8).toFixed(2)}/week`:`Si optimisé: +${(weeklyWasteCost*0.6+weeklyLost*0.8).toFixed(2)}$/semaine`}</div>}
                  </div>
                );
              })()}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Production List View ──────────────────────────────────────────────────────

function ProductionListView({ products, allSales, weatherMap, learnedPatterns = [], T, t, lang }) {
  const [range, setRange] = useState('3');
  const [customStart, setCustomStart] = useState(toDateStr(new Date()));
  const [customEnd, setCustomEnd] = useState(addDays(toDateStr(new Date()), 2));
  const [stockOverrides, setStockOverrides] = useState({});
  const [stockInitialized, setStockInitialized] = useState(false);
  const [generated, setGenerated] = useState(null);

  // Auto-populate On Hand from most recent quantity_remaining in sales data
  useEffect(() => {
    if (stockInitialized || allSales.length === 0 || products.length === 0) return;
    const defaults = {};
    products.filter(p=>p.active).forEach(p => {
      const recent = allSales
        .filter(s => s.product_id === p.id && s.quantity_remaining != null)
        .sort((a,b) => b.date.localeCompare(a.date))[0];
      if (recent?.quantity_remaining != null) {
        defaults[p.id] = String(recent.quantity_remaining);
      }
    });
    if (Object.keys(defaults).length > 0) {
      setStockOverrides(defaults);
      setStockInitialized(true);
    }
  }, [allSales, products]);

  const today = toDateStr(new Date());
  const getStartDate = (r=range) => r === 'custom' ? customStart : addDays(today, 1);
  const getEndDate   = (r=range) => r === '7' ? addDays(today, 7) : r === '3' ? addDays(today, 3) : customEnd;
  const startDate = getStartDate();
  const endDate   = getEndDate();

  const getDates = (r=range) => {
    const s = getStartDate(r), e = getEndDate(r);
    const dates = [];
    let d = s;
    while (d <= e) { dates.push(d); d = addDays(d, 1); }
    return dates;
  };

  const generate = (rangeOverride) => {
    const r = rangeOverride || range;
    const dates = getDates(r);
    const activeProducts = products.filter(p=>p.active);
    const list = [];
    const weatherAnnotations = [];
    const adjustments = [];
    const batchMap = {};

    activeProducts.forEach(p => {
      if (p.shelf_life_days <= 1) {
        // Daily products
        const dailyPreds = [];
        dates.forEach(date => {
          const r = computePrediction(p.id, date, allSales, weatherMap, p, learnedPatterns);
          const onHand = parseInt(stockOverrides[p.id] || 0);
          const toMake = Math.max(0, r.prediction - (date === dates[0] ? onHand : 0));
          list.push({ product: p, date, forecast: r.prediction, onHand: date===dates[0]?onHand:0, toMake, type:'daily', weatherFactor: r.weatherFactor });
          dailyPreds.push(r.prediction);

          // Collect per-date weather annotations for weather-sensitive products
          if (r.weatherFactor !== 0 && p.weather_sensitivity !== 0) {
            const w = weatherMap[date];
            if (w) {
              const icon = conditionToIcon(weatherCodeToCondition(w.weather_code));
              const pctStr = (r.weatherFactor >= 0 ? '+' : '') + Math.round(r.weatherFactor * 100) + '%';
              weatherAnnotations.push({ date, product: p, factor: r.weatherFactor, icon, temp: Math.round(w.temp_max ?? 0), pctStr });
            }
          }
        });

        // Smart adjustments: base_quantity (per-day baseline) vs avg predicted
        if (p.base_quantity > 0 && dailyPreds.length > 0) {
          const avgPred = Math.round(dailyPreds.reduce((a,b)=>a+b,0) / dailyPreds.length);
          const diff = avgPred - p.base_quantity;
          const diffPct = p.base_quantity > 0 ? diff / p.base_quantity : 0;
          let reason = T.prevListAdjOnTrack;
          if (diffPct < -0.10) reason = T.prevListAdjOverprod; // model predicts less than baseline → overproduction if keeping base
          else if (diffPct > 0.10) reason = T.prevListAdjStockout; // model predicts more → stockout risk if keeping base
          adjustments.push({ product: p, baseQty: p.base_quantity, avgPredicted: avgPred, diff, reason, isBatch: false });
        }
      } else {
        // Batch products
        let totalPred = 0;
        dates.forEach(date => {
          const r = computePrediction(p.id, date, allSales, weatherMap, p, learnedPatterns);
          totalPred += r.prediction;
          if (r.weatherFactor !== 0 && p.weather_sensitivity !== 0) {
            const w = weatherMap[date];
            if (w) {
              const icon = conditionToIcon(weatherCodeToCondition(w.weather_code));
              const pctStr = (r.weatherFactor >= 0 ? '+' : '') + Math.round(r.weatherFactor * 100) + '%';
              weatherAnnotations.push({ date, product: p, factor: r.weatherFactor, icon, temp: Math.round(w.temp_max ?? 0), pctStr });
            }
          }
        });
        const total = Math.round(totalPred);
        const onHand = parseInt(stockOverrides[p.id] || 0);
        const toMake = Math.max(0, total - onHand);
        if (!batchMap[p.id]) batchMap[p.id] = { product:p, total, onHand, toMake, type:'batch', dates };

        // Smart adjustments for batch: base_quantity × days vs total predicted
        const baseTotal = p.base_quantity * dates.length;
        if (baseTotal > 0) {
          const diff = total - baseTotal;
          const diffPct = Math.abs(diff) / baseTotal;
          let reason = T.prevListAdjOnTrack;
          if (diff < -baseTotal * 0.10) reason = T.prevListAdjOverprod;
          else if (diff > baseTotal * 0.10) reason = T.prevListAdjStockout;
          adjustments.push({ product: p, baseQty: baseTotal, avgPredicted: total, diff: Math.round(diff), reason, isBatch: true });
        }
      }
    });

    const batchItems = Object.values(batchMap);
    setGenerated({ list, batchItems, dates, weatherAnnotations, adjustments });

    // Snapshot predictions to accuracy table
    const todayStr = toDateStr(new Date());
    list.forEach(item => {
      if (item.date >= todayStr) {
        window.api.forecast.accuracy.upsert({
          id: `${item.product.id}_${item.date}`,
          product_id: item.product.id, date: item.date,
          predicted: item.forecast, actual: null, error_pct: null,
        }).catch(()=>{});
      }
    });
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

    let weatherSection = '';
    if (generated.weatherAnnotations.length > 0) {
      weatherSection = `<h2 style="font-size:13px;margin-top:28px;margin-bottom:8px">${T.prevListWeatherAnno}</h2><ul style="font-size:12px;padding-left:18px;margin:0">`;
      generated.weatherAnnotations.forEach(a => {
        weatherSection += `<li>${a.icon} ${formatDateShort(a.date,lang)} ${a.temp}°C — ${a.product.name} <strong>${a.pctStr}</strong> vs base</li>`;
      });
      weatherSection += '</ul>';
    }

    let adjSection = '';
    if (generated.adjustments.length > 0) {
      adjSection = `<h2 style="font-size:13px;margin-top:28px;margin-bottom:8px">${T.prevListAdjTitle}</h2><table><thead><tr><th>${T.prevColProduct}</th><th>${T.prevListAdjCurrent}</th><th>${T.prevListAdjSuggested}</th><th>${T.prevListAdjDiff}</th><th>${T.prevListAdjReason}</th></tr></thead><tbody>`;
      generated.adjustments.forEach(a => {
        const diffStr = (a.diff >= 0 ? '+' : '') + a.diff;
        adjSection += `<tr><td>${a.product.name}${a.isBatch?' (batch)':''}</td><td>${a.baseQty}</td><td>${a.avgPredicted}</td><td>${diffStr}</td><td>${a.reason}</td></tr>`;
      });
      const savings = generated.adjustments.filter(a=>a.diff<0).reduce((sum,a)=>sum+Math.abs(a.diff),0);
      adjSection += `</tbody></table>`;
      if (savings > 0) adjSection += `<p style="font-size:11px;color:#f97316;margin-top:8px">💡 ${T.prevListSavingsTotal(savings, T.prevColProduct)}</p>`;
    }

    return `<html><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:'Outfit',sans-serif;margin:32px;color:#111}h1{font-size:18px;margin-bottom:4px}h2{color:#374151}p{font-size:12px;color:#666;margin-bottom:20px}table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:8px}th{background:#f3f4f6;padding:8px 10px;text-align:left;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.5px}td{padding:8px 10px;border-bottom:1px solid #e5e7eb}strong{color:#f97316;font-size:15px}@media print{body{margin:16px}}</style></head><body><h1>${title}</h1><table><thead><tr><th>${T.prevColProduct}</th><th>${T.prevColDate}</th><th>${T.prevListForecast}</th><th>${T.prevListOnHand}</th><th>${T.prevListToMake}</th></tr></thead><tbody>${rows}</tbody></table>${weatherSection}${adjSection}</body></html>`;
  };

  const inp = { background:t.inputBg, border:`1px solid ${t.inputBorder}`, borderRadius:5, color:'inherit', fontSize:12, padding:'5px 8px', outline:'none', fontFamily:"'Outfit',sans-serif" };

  return (
    <div>
      <div style={{fontSize:13,fontWeight:700,marginBottom:12}}>{T.prevListTitle}</div>

      <div style={{display:'flex',gap:8,marginBottom:10,flexWrap:'wrap',alignItems:'center'}}>
        <span style={{fontSize:11,opacity:0.6}}>{T.prevListRange}:</span>
        {[['3',T.prevListDays3],['7',T.prevListDays7],['custom',T.prevListCustom]].map(([v,l])=>(
          <button key={v} onClick={()=>{ setRange(v); if(v!=='custom') generate(v); else setGenerated(null); }} style={{padding:'4px 12px',borderRadius:12,border:`1px solid ${range===v?'#f97316':t.cardBorder}`,background:range===v?'rgba(249,115,22,0.15)':t.section,color:range===v?'#f97316':'inherit',cursor:'pointer',fontSize:11}}>{l}</button>
        ))}
        {range==='custom'&&<><input type="date" value={customStart} onChange={e=>setCustomStart(e.target.value)} style={inp}/><span style={{opacity:0.4}}>→</span><input type="date" value={customEnd} onChange={e=>setCustomEnd(e.target.value)} style={inp}/></>}
      </div>

      {/* Stock on hand */}
      {products.filter(p=>p.active).length > 0 && (
        <div style={{marginBottom:12,padding:'10px 12px',background:t.section,borderRadius:7,border:`1px solid ${t.cardBorder}`}}>
          <div style={{display:'flex',alignItems:'baseline',gap:8,marginBottom:6}}>
            <div style={{fontSize:11,fontWeight:600,opacity:0.7}}>{T.prevListCurrentStock}</div>
            <div style={{fontSize:10,opacity:0.45}}>{lang==='en'?'auto-filled from last entry · edit to override':'rempli depuis la dernière saisie · modifiable'}</div>
          </div>
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
          {/* Daily items rendered as per-day cards */}
          {generated.dates.map(date => {
            const dayItems = generated.list.filter(item => item.date === date);
            if (dayItems.length === 0) return null;
            const w = weatherMap[date];
            const weatherNote = w ? ` — ${conditionToIcon(weatherCodeToCondition(w.weather_code))} ${Math.round(w.temp_max||0)}°/${Math.round(w.temp_min||0)}°` : '';
            const hasWeatherAdj = dayItems.some(item => item.weatherFactor !== 0);
            return (
              <div key={date} style={{marginBottom:10,padding:'14px 16px',background:t.section,border:`1px solid ${t.cardBorder}`,borderRadius:10}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>
                  🗓️ {formatDateShort(date,lang)}{weatherNote}
                </div>
                {(() => {
                  const hasCost = dayItems.some(item=>item.product.unit_cost!=null);
                  const headers = [T.prevColProduct,T.prevListForecast,T.prevListOnHand,T.prevListToMake,...(hasCost?[lang==='en'?'Cost':'Coût']:[])]
                  return (
                    <>
                      <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                        <thead><tr style={{opacity:0.6}}>
                          {headers.map(h=>(
                            <th key={h} style={{padding:'4px 8px',textAlign:'left',fontWeight:600,fontSize:10,borderBottom:`1px solid ${t.cardBorder}`}}>{h}</th>
                          ))}
                        </tr></thead>
                        <tbody>
                          {dayItems.map((item,i)=>(
                            <tr key={i} style={{borderBottom:`1px solid ${t.cardBorder}`}}>
                              <td style={{padding:'5px 8px',fontWeight:600}}>
                                {item.product.name}
                                {item.weatherFactor !== 0 && (
                                  <span style={{marginLeft:7,fontSize:9,padding:'1px 5px',borderRadius:8,background:item.weatherFactor>0?'rgba(34,197,94,0.1)':'rgba(239,68,68,0.1)',color:item.weatherFactor>0?'#22c55e':'#ef4444',fontWeight:700,display:'inline-block'}}>
                                    {item.weatherFactor>=0?'+':''}{Math.round(item.weatherFactor*100)}%
                                  </span>
                                )}
                              </td>
                              <td style={{padding:'5px 8px'}}>{item.forecast}</td>
                              <td style={{padding:'5px 8px'}}>{item.onHand||0}</td>
                              <td style={{padding:'5px 8px',fontWeight:800,color:'#f97316',fontSize:13}}>{item.toMake}</td>
                              {hasCost&&<td style={{padding:'5px 8px',fontSize:11,opacity:0.7}}>{item.product.unit_cost!=null?`$${(item.toMake*item.product.unit_cost).toFixed(2)}`:'—'}</td>}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {(() => {
                        const totalCost = dayItems.filter(i=>i.product.unit_cost!=null).reduce((a,i)=>a+(i.toMake*(i.product.unit_cost||0)),0);
                        if (totalCost === 0) return null;
                        return (
                          <div style={{marginTop:6,paddingTop:5,borderTop:`1px solid ${t.cardBorder}`,fontSize:11,textAlign:'right',opacity:0.7}}>
                            {lang==='en'?'Ingredient cost:':'Coût ingrédients:'} <strong>${totalCost.toFixed(2)}</strong>
                          </div>
                        );
                      })()}
                    </>
                  );
                })()}
              </div>
            );
          })}

          {/* Batch items card */}
          {generated.batchItems.length > 0 && (
            <div style={{marginBottom:10,padding:'14px 16px',background:t.section,border:`1px solid rgba(249,115,22,0.15)`,borderRadius:10}}>
              <div style={{fontSize:13,fontWeight:700,marginBottom:3}}>📦 {lang==='en'?'Batch items':'Produits en lot'} — {generated.dates.length} {lang==='en'?'days':'jours'}</div>
              <div style={{fontSize:11,opacity:0.5,marginBottom:10}}>{lang==='en'?'These products have shelf life > 1 day — make once for the full period, not daily':'Ces produits ont une durée de vie > 1 jour — à produire en lot pour toute la période'}</div>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead><tr style={{opacity:0.6}}>
                  {[T.prevColProduct, generated.dates.length+' '+(lang==='en'?'day':'j')+' total', T.prevListOnHand, T.prevListToMake].map(h=>(
                    <th key={h} style={{padding:'4px 8px',textAlign:'left',fontWeight:600,fontSize:10,borderBottom:`1px solid ${t.cardBorder}`}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {generated.batchItems.map((item,i)=>(
                    <tr key={i} style={{borderBottom:`1px solid ${t.cardBorder}`}}>
                      <td style={{padding:'5px 8px',fontWeight:600}}>{item.product.name}<span style={{fontSize:10,opacity:0.5,marginLeft:4}}>({lang==='en'?'shelf life':'durée de vie'}: {item.product.shelf_life_days}{lang==='en'?' day':' j'}{item.product.shelf_life_days>1?'s':''})</span></td>
                      <td style={{padding:'5px 8px'}}>{item.total}</td>
                      <td style={{padding:'5px 8px'}}>{item.onHand}</td>
                      <td style={{padding:'5px 8px',fontWeight:800,color:'#f97316',fontSize:13}}>{item.toMake}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}


          {/* Smart adjustments table */}
          {generated.adjustments.length > 0 ? (
            <div style={{marginBottom:12,padding:'10px 12px',background:t.section,borderRadius:7,border:`1px solid ${t.cardBorder}`}}>
              <div style={{fontSize:11,fontWeight:700,marginBottom:8,opacity:0.8}}>{T.prevListAdjTitle}</div>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                <thead><tr style={{opacity:0.6}}>
                  {[T.prevColProduct,T.prevListAdjCurrent,T.prevListAdjSuggested,T.prevListAdjDiff,T.prevListAdjReason].map(h=>(
                    <th key={h} style={{padding:'4px 8px',textAlign:'left',fontWeight:600,borderBottom:`1px solid ${t.cardBorder}`}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {generated.adjustments.map((a,i)=>(
                    <tr key={i} style={{borderBottom:`1px solid ${t.cardBorder}`}}>
                      <td style={{padding:'5px 8px',fontWeight:600}}>{a.product.name}{a.isBatch?` (×${generated.dates.length}d)`:''}</td>
                      <td style={{padding:'5px 8px',fontFamily:"'DM Mono',monospace"}}>{a.baseQty}</td>
                      <td style={{padding:'5px 8px',fontFamily:"'DM Mono',monospace"}}>{a.avgPredicted}</td>
                      <td style={{padding:'5px 8px',fontWeight:700,color:a.diff<0?'#22c55e':a.diff>0?'#f59e0b':'inherit',fontFamily:"'DM Mono',monospace"}}>
                        {a.diff>=0?'+':''}{a.diff}
                      </td>
                      <td style={{padding:'5px 8px',fontSize:10,opacity:0.8}}>{a.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(() => {
                const savings = generated.adjustments.filter(a=>a.diff<0).reduce((sum,a)=>sum+Math.abs(a.diff),0);
                return savings > 0 ? (
                  <div style={{marginTop:8,fontSize:11,color:'#22c55e'}}>
                    💡 {T.prevListSavingsTotal(savings, lang==='en'?'units':'unités')}
                  </div>
                ) : null;
              })()}
            </div>
          ) : products.filter(p=>p.active&&p.base_quantity>0).length===0 ? (
            <div style={{marginBottom:12,fontSize:11,opacity:0.5,fontStyle:'italic'}}>{T.prevListNoAdj}</div>
          ) : null}

          {/* Print/Export buttons */}
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

export default function PrevisionsTab({ apiConfig, showUpgradePrompt, canUse, T, t, lang, onInsightCountChange }) {
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
  const [learnedPatterns, setLearnedPatterns] = useState([]);
  const [insights, setInsights] = useState([]);
  const [insightUnread, setInsightUnread] = useState(0);
  const [accuracyData, setAccuracyData] = useState([]);

  const weekDates = useMemo(() => getWeekDates(currentWeekMonday), [currentWeekMonday]);
  const lastWeekDates = useMemo(() => getWeekDates(addDays(currentWeekMonday, -7)), [currentWeekMonday]);

  // Notify parent of insight count changes
  useEffect(() => { onInsightCountChange?.(insightUnread); }, [insightUnread]);

  // Load everything on mount
  useEffect(() => {
    const init = async () => {
      await loadProducts();
      await loadSales();
      loadWeather();
      loadFormats();
      await loadPatterns();
      await loadInsights();
      await loadAccuracy();
    };
    init();
  }, []);

  const loadProducts = async () => {
    const p = await window.api.forecast.products.getAll();
    setProducts(p || []);
  };

  const loadSales = useCallback(async () => {
    // Load 90 days back
    const from = toDateStr(new Date(Date.now() - 90*86400000));
    const to = toDateStr(new Date(Date.now() + 30*86400000));
    const sales = await window.api.forecast.sales.getRange(from, to);
    setAllSales(sales || []);
    // Group by date for manual entry
    const byDate = {};
    (sales||[]).forEach(s => { if (!byDate[s.date]) byDate[s.date]=[]; byDate[s.date].push(s); });
    setSalesByDate(byDate);
    return sales || [];
  }, []);

  const loadPatterns = useCallback(async () => {
    const data = await window.api.forecast.patterns.getAll().catch(()=>[]);
    setLearnedPatterns(data || []);
  }, []);

  const loadInsights = useCallback(async () => {
    const data = await window.api.forecast.insights.getAll().catch(()=>[]);
    setInsights(data || []);
    setInsightUnread((data||[]).filter(i=>!i.read).length);
  }, []);

  const loadAccuracy = useCallback(async () => {
    const data = await window.api.forecast.accuracy.getAll().catch(()=>[]);
    setAccuracyData(data || []);
  }, []);

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
    const updatedSales = await loadSales();
    // Trigger learning engine after sales are saved
    try {
      const { triggerLearning } = await import('../services/learningEngine.js');
      triggerLearning({ products, allSales: updatedSales, weatherMap, dailyData: [], lang });
      setTimeout(() => { loadPatterns(); loadInsights(); loadAccuracy(); }, 11000);
    } catch(e) { console.error('[LearningEngine] trigger:', e); }
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

  // ── Sample data seeding (demo only) ──────────────────────────────────────────
  const seedSampleData = async () => {
    // 5 products typical of a QSR / burger restaurant
    const sampleProds = [
      { id: uuid(), name: lang==='en'?'Hamburger Buns':'Pains à hamburger',   category: lang==='en'?'Bread':'Pain',      base_quantity:80,  shelf_life_days:1, weather_sensitivity: 0, active:1, notes:'' },
      { id: uuid(), name: lang==='en'?'Hot Dog Buns':'Pains à hot-dog',        category: lang==='en'?'Bread':'Pain',      base_quantity:30,  shelf_life_days:1, weather_sensitivity: 0, active:1, notes:'' },
      { id: uuid(), name: lang==='en'?'Milkshake':'Milkshake',                 category: lang==='en'?'Drinks':'Boissons', base_quantity:25,  shelf_life_days:1, weather_sensitivity: 2, active:1, notes:'' },
      { id: uuid(), name: lang==='en'?'Beef Patties':'Galettes de bœuf',       category: lang==='en'?'Meats':'Viandes',   base_quantity:90,  shelf_life_days:2, weather_sensitivity: 1, active:1, notes:'' },
      { id: uuid(), name: lang==='en'?'Poutine Sauce':'Sauce poutine',         category: lang==='en'?'Sauces':'Sauces',   base_quantity:15,  shelf_life_days:3, weather_sensitivity:-1, active:1, notes:'' },
    ];
    for (const p of sampleProds) await window.api.forecast.products.upsert(p);

    // 14 days of sales: March 1–14, 2026
    // Week 1 (Mar 1–7) slightly lower; Week 2 (Mar 8–14) slightly higher — shows upward trend
    // [hamburger, hotdog, milkshake, patty, sauce] — [made, sold, stockout]
    const salesW1 = {
      sun: [[75,64,0],[28,19,0],[22,13,0],[85,70,0],[15,11,0]],
      mon: [[78,51,0],[28,13,0],[18,10,0],[88,57,0],[14, 7,0]],
      tue: [[78,65,0],[28,19,0],[18,12,0],[88,73,0],[14, 9,0]],
      wed: [[78,67,0],[28,21,0],[18,14,0],[88,75,0],[14,11,0]],
      thu: [[78,71,0],[28,23,0],[18,16,0],[88,79,0],[14,12,0]],
      fri: [[82,78,0],[28,25,0],[20,18,0],[88,81,0],[14,13,0]],
      sat: [[78,75,1],[33,27,0],[24,17,0],[88,81,0],[19,16,0]],
    };
    const salesW2 = {
      sun: [[75,68,0],[30,22,0],[25,16,0],[90,76,0],[15,12,0]],
      mon: [[80,56,0],[30,16,0],[20,13,0],[90,61,0],[15, 9,0]],
      tue: [[80,71,0],[30,23,0],[20,15,0],[90,79,0],[15,11,0]],
      wed: [[80,73,0],[30,25,0],[20,17,0],[90,81,0],[15,13,0]],
      thu: [[80,76,0],[30,27,0],[20,19,0],[90,83,0],[15,14,0]],
      fri: [[85,83,0],[32,29,0],[22,21,0],[92,86,0],[15,15,0]],
      sat: [[80,80,1],[35,31,0],[26,21,0],[92,86,0],[20,19,0]],
    };
    // March 1=Sun, 7=Sat, 8=Sun, 14=Sat
    const allDays = [
      { date:'2026-03-01', m:salesW1, dow:'sun' },
      { date:'2026-03-02', m:salesW1, dow:'mon' },
      { date:'2026-03-03', m:salesW1, dow:'tue' },
      { date:'2026-03-04', m:salesW1, dow:'wed' },
      { date:'2026-03-05', m:salesW1, dow:'thu' },
      { date:'2026-03-06', m:salesW1, dow:'fri' },
      { date:'2026-03-07', m:salesW1, dow:'sat' },
      { date:'2026-03-08', m:salesW2, dow:'sun' },
      { date:'2026-03-09', m:salesW2, dow:'mon' },
      { date:'2026-03-10', m:salesW2, dow:'tue' },
      { date:'2026-03-11', m:salesW2, dow:'wed' },
      { date:'2026-03-12', m:salesW2, dow:'thu' },
      { date:'2026-03-13', m:salesW2, dow:'fri' },
      { date:'2026-03-14', m:salesW2, dow:'sat' },
    ];
    for (const day of allDays) {
      const matrix = day.m[day.dow];
      for (let i = 0; i < sampleProds.length; i++) {
        const [made, sold, stockout] = matrix[i];
        await window.api.forecast.sales.upsert({
          id: uuid(), product_id: sampleProds[i].id, date: day.date,
          quantity_made: made, quantity_sold: sold, quantity_remaining: made - sold,
          stockout, source: 'manual',
        });
      }
    }
    await loadProducts();
    await loadSales();
  };

  const activeProducts = useMemo(() => products.filter(p=>p.active), [products]);

  // Compute predictions for current week
  const predictions = useMemo(() => {
    const result = {};
    activeProducts.forEach(p => {
      result[p.id] = {};
      weekDates.forEach(date => {
        result[p.id][date] = computePrediction(p.id, date, allSales, weatherMap, p, learnedPatterns);
      });
    });
    return result;
  }, [activeProducts, weekDates, allSales, weatherMap, learnedPatterns]);

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

  // Daily prediction snapshot on load
  useEffect(() => {
    if (activeProducts.length === 0 || Object.keys(predictions).length === 0) return;
    const todayStr = toDateStr(new Date());
    const lastSnap = localStorage.getItem('biq-last-snapshot-date');
    if (lastSnap === todayStr) return;
    activeProducts.forEach(p => {
      const pred = predictions[p.id]?.[todayStr];
      if (!pred) return;
      window.api.forecast.accuracy.upsert({
        id: `${p.id}_${todayStr}`,
        product_id: p.id, date: todayStr,
        predicted: Math.round(pred.prediction), actual: null, error_pct: null,
      }).catch(()=>{});
    });
    localStorage.setItem('biq-last-snapshot-date', todayStr);
  }, [activeProducts, predictions]);

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
    { id:'forecast',   label: T.prevSubForecast },
    { id:'import',     label: T.prevSubImport },
    { id:'alerts',     label: T.prevSubAlerts },
    { id:'production', label: T.prevSubProdList },
    { id:'products',   label: T.prevSubProducts },
    { id:'ai',         label: T.prevSubAI, isPro: true },
  ];

  return (
    <div style={{display:'flex',flexDirection:'column',gap:0}}>
      {/* Sub-nav */}
      <div style={{display:'flex',gap:0,borderBottom:`1px solid ${t.cardBorder}`,marginBottom:16,overflowX:'auto'}}>
        {subTabs.map(tab=>{
          const isAI = tab.id === 'ai';
          const active = subView === tab.id;
          return (
            <button key={tab.id} onClick={()=>{setSubView(tab.id);setSelectedProduct(null);}}
              style={{background:'none',border:'none',borderBottom:active?(isAI?'2px solid #a78bfa':'2px solid #f97316'):'2px solid transparent',color:active?(isAI?'#a78bfa':'#f97316'):t.textMuted,fontSize:12,fontWeight:600,padding:'8px 14px',cursor:'pointer',whiteSpace:'nowrap',transition:'all 0.15s',display:'flex',alignItems:'center',gap:4}}>
              {tab.label}
              {isAI && !canUse('aiAnalysis') && <span style={{fontSize:8,padding:'1px 4px',borderRadius:3,background:'rgba(167,139,250,0.15)',color:'#a78bfa',fontWeight:700,lineHeight:1.5}}>PRO</span>}
            </button>
          );
        })}
      </div>

      {/* Item detail overlay */}
      {selectedProduct && subView==='forecast' && (
        <ItemDetailView
          product={selectedProduct}
          allSales={allSales}
          weatherMap={weatherMap}
          onBack={()=>setSelectedProduct(null)}
          onBackToAI={()=>{setSelectedProduct(null);setSubView('ai');}}
          onUpdateSensitivity={(prod,sens)=>saveProduct({...prod,weather_sensitivity:sens})}
          canUse={canUse} T={T} t={t} lang={lang}
        />
      )}

      {/* FORECAST VIEW */}
      {subView==='forecast' && !selectedProduct && (
        <div>
          {/* ── Financial Dashboard ── */}
          {(() => {
            const withCost = activeProducts.filter(p=>p.unit_cost!=null&&p.unit_cost>0);
            if (withCost.length === 0) return (
              <div style={{padding:'10px 14px',background:t.section,border:`1px solid ${t.cardBorder}`,borderRadius:8,marginBottom:14,fontSize:11,display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,flexWrap:'wrap'}}>
                <span style={{opacity:0.65}}>{lang==='en'?'Add cost & sell price to your products to see financial impact.':'Ajoutez coût et prix de vente à vos produits pour voir l\'impact financier.'}</span>
                <button onClick={()=>setSubView('products')} style={{padding:'4px 10px',borderRadius:5,border:'none',background:'linear-gradient(135deg,#f97316,#ea580c)',color:'#fff',cursor:'pointer',fontSize:10,fontWeight:600,whiteSpace:'nowrap'}}>{lang==='en'?'Configure':'Configurer'}</button>
              </div>
            );
            const now = new Date();
            const mStart = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
            const pmDate = new Date(now.getFullYear(),now.getMonth()-1,1);
            const pmStart = `${pmDate.getFullYear()}-${String(pmDate.getMonth()+1).padStart(2,'0')}-01`;
            const pmEnd = `${now.getFullYear()}-${String(now.getMonth()).padStart(2,'0')}-${String(new Date(now.getFullYear(),now.getMonth(),0).getDate()).padStart(2,'0')}`;
            let mWaste=0,pmWaste=0,mStock=0,pmStock=0;
            activeProducts.forEach(p=>{
              allSales.filter(s=>s.product_id===p.id).forEach(s=>{
                const inM=s.date>=mStart, inPM=s.date>=pmStart&&s.date<=pmEnd;
                if(p.unit_cost!=null&&s.quantity_remaining!=null){
                  const wc=s.quantity_remaining*p.unit_cost;
                  if(inM)mWaste+=wc; if(inPM)pmWaste+=wc;
                }
                if(s.stockout&&p.sell_price!=null){
                  const lr=s.quantity_sold*0.25*p.sell_price;
                  if(inM)mStock+=lr; if(inPM)pmStock+=lr;
                }
              });
            });
            const potential=mWaste*0.6+mStock*0.8;
            const wTrend=pmWaste>0?(mWaste-pmWaste)/pmWaste:null;
            const sTrend=pmStock>0?(mStock-pmStock)/pmStock:null;
            return (
              <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:14}}>
                {[
                  {icon:'🗑️',label:lang==='en'?'Monthly Waste':'Gaspillage du mois',val:`$${mWaste.toFixed(0)}`,trend:wTrend,goodDown:true},
                  {icon:'📉',label:lang==='en'?'Estimated Stockouts':'Ruptures estimées',val:`$${mStock.toFixed(0)}`,trend:sTrend,goodDown:true},
                  {icon:'💰',label:lang==='en'?'Potential Improvement':'Amélioration potentielle',val:`$${potential.toFixed(0)}/mo`,trend:null,highlight:true},
                ].map((c,i)=>(
                  <div key={i} style={{padding:'12px 14px',background:c.highlight?'rgba(249,115,22,0.08)':t.section,border:`1px solid ${c.highlight?'rgba(249,115,22,0.3)':t.cardBorder}`,borderRadius:8}}>
                    <div style={{fontSize:10,opacity:0.6,marginBottom:3}}>{c.icon} {c.label}</div>
                    <div style={{fontSize:18,fontWeight:800,color:c.highlight?'#f97316':t.text}}>{c.val}</div>
                    {c.trend!=null&&<div style={{fontSize:10,marginTop:2,color:((c.goodDown&&c.trend<0)||(!c.goodDown&&c.trend>0))?'#22c55e':'#ef4444'}}>{c.trend>=0?'↑':'↓'}{Math.abs(Math.round(c.trend*100))}% vs {lang==='en'?'last month':'mois dernier'}</div>}
                  </div>
                ))}
              </div>
            );
          })()}

          {/* ── Insights ── */}
          {insights.filter(i=>!i.read).length > 0 && (
            <div style={{marginBottom:14,padding:'12px 14px',background:t.section,border:`1px solid ${t.cardBorder}`,borderRadius:8}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                <div style={{fontSize:12,fontWeight:700}}>
                  📊 {insights.filter(i=>!i.read).length} {lang==='en'?'new insights this week':'nouveaux insights cette semaine'}
                </div>
                <button onClick={async()=>{await window.api.forecast.insights.markAllRead().catch(()=>{});await loadInsights();}}
                  style={{fontSize:10,background:'none',border:'none',cursor:'pointer',opacity:0.55,color:t.textSub}}>
                  {lang==='en'?'Mark all read':'Tout marquer lu'}
                </button>
              </div>
              {insights.filter(i=>!i.read).slice(0,5).map(ins=>(
                <div key={ins.id} style={{display:'flex',alignItems:'flex-start',gap:8,padding:'7px 0',borderTop:`1px solid ${t.cardBorder}`}}>
                  <div style={{flex:1,fontSize:11,lineHeight:1.5,color:ins.severity==='critical'?'#ef4444':ins.severity==='warning'?'#f97316':t.text}}>
                    {lang==='en'?ins.message_en:ins.message_fr}
                  </div>
                  {ins.financial_impact!=null&&<div style={{fontSize:10,fontWeight:700,color:'#f97316',whiteSpace:'nowrap'}}>${Math.round(Math.abs(ins.financial_impact))}</div>}
                  <button onClick={async()=>{await window.api.forecast.insights.markRead(ins.id).catch(()=>{});await loadInsights();}}
                    style={{fontSize:9,background:'none',border:`1px solid ${t.cardBorder}`,borderRadius:3,padding:'2px 5px',cursor:'pointer',color:t.textSub,whiteSpace:'nowrap'}}>
                    {lang==='en'?'Dismiss':'Ignorer'}
                  </button>
                </div>
              ))}
            </div>
          )}

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
            <button onClick={()=>{setSubView('ai');setSelectedProduct(null);}} style={{padding:'5px 12px',borderRadius:6,border:'1px solid rgba(167,139,250,0.3)',background:'rgba(167,139,250,0.08)',color:'#a78bfa',cursor:'pointer',fontSize:11,fontWeight:600}}>
              ✨ {lang==='en'?'AI Analysis':'Analyse IA'}{!canUse('aiAnalysis')&&<span style={{marginLeft:4,fontSize:8,verticalAlign:'middle',padding:'1px 4px',borderRadius:3,background:'rgba(167,139,250,0.2)'}}>PRO</span>}
            </button>
          </div>

          {/* Inline alert summary */}
          {(() => {
            if (activeProducts.length === 0) return null;
            const topAlerts = computeAlerts(activeProducts, allSales, T, lang);
            const badges = [
              ...topAlerts.stockout.map(a => ({ color:'#fca5a5', bg:'rgba(239,68,68,0.08)', border:'rgba(239,68,68,0.2)', text:`🔴 ${a.product.name} — ${a.dowName}` })),
              ...topAlerts.overproduction.map(a => ({ color:'#fde68a', bg:'rgba(234,179,8,0.08)', border:'rgba(234,179,8,0.2)', text:`🟡 ${a.product.name} — ${a.dowName} ${a.wastePct}%` })),
              ...topAlerts.optimized.slice(0,2).map(a => ({ color:'#86efac', bg:'rgba(34,197,94,0.08)', border:'rgba(34,197,94,0.2)', text:`🟢 ${a.product.name}` })),
            ].slice(0,4);
            if (!badges.length) return null;
            return (
              <div style={{display:'flex',gap:6,marginBottom:8,flexWrap:'wrap'}}>
                {badges.map((b,i)=>(
                  <span key={i} style={{padding:'5px 10px',borderRadius:7,fontSize:11,background:b.bg,border:`1px solid ${b.border}`,color:b.color}}>{b.text}</span>
                ))}
              </div>
            );
          })()}

          {/* Forecast table — weather row is first row in thead so columns align perfectly */}
          <div style={{overflowX:'auto',border:`1px solid ${t.cardBorder}`,borderRadius:8}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
              <thead>
                {/* Weather row */}
                <tr style={{background:t.section,borderBottom:`1px solid ${t.cardBorder}`}}>
                  <th style={{textAlign:'left',padding:'6px 8px',fontSize:10,fontWeight:600,opacity:0.5,minWidth:100}}>{T.prevWeatherBar}</th>
                  {weekDates.map(date => {
                    const w = weatherMap[date];
                    const isManual = w?.source === 'manual';
                    const cond = w ? weatherCodeToCondition(w.weather_code) : null;
                    return (
                      <th key={date} style={{textAlign:'center',padding:'5px 4px',cursor:'pointer',minWidth:44,fontWeight:'normal'}}
                        title={isManual ? T.prevWeatherManual : T.prevWeatherAuto}
                        onClick={()=>setWeatherOverrideDate(date)}>
                        <div style={{fontSize:14}}>{w ? conditionToIcon(cond) : '—'}</div>
                        <div style={{fontSize:10,fontWeight:600,lineHeight:1.3}}>{w ? <><span style={{color:'#f97316'}}>{Math.round(w.temp_max||0)}°</span><span style={{opacity:0.45,fontSize:9}}>{' / '}{Math.round(w.temp_min||0)}°</span></> : ''}</div>
                        <div style={{fontSize:9,opacity:0.45}}>{isManual?'✏️':'auto'}</div>
                      </th>
                    );
                  })}
                  <th style={{minWidth:50}}></th>
                  <th style={{minWidth:40}}></th>
                </tr>
                {/* Day headers row */}
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
              {activeProducts.length === 0 ? (
                <tbody>
                  <tr>
                    <td colSpan={10} style={{textAlign:'center',padding:'30px 20px'}}>
                      <div style={{fontSize:12,opacity:0.5,marginBottom:10}}>{T.prevNoProducts}</div>
                      <button onClick={seedSampleData} style={{padding:'6px 16px',borderRadius:6,border:'1px solid rgba(249,115,22,0.4)',background:'rgba(249,115,22,0.08)',color:'#f97316',cursor:'pointer',fontSize:11,fontWeight:600}}>
                        {lang==='en'?'Load demo data':'Charger données démo'}
                      </button>
                    </td>
                  </tr>
                </tbody>
              ) : (
                (() => {
                  // Group by category for table display
                  const catGroups = {};
                  activeProducts.forEach(p => {
                    const cat = (p.category && p.category.trim()) || T.prevOther;
                    if (!catGroups[cat]) catGroups[cat] = [];
                    catGroups[cat].push(p);
                  });
                  const catKeys = Object.keys(catGroups).sort();
                  const showCatRows = catKeys.length > 1;
                  return (
                    <tbody>
                      {catKeys.map(cat => (
                        <React.Fragment key={cat}>
                          {showCatRows && (
                            <tr style={{background:'rgba(249,115,22,0.04)'}}>
                              <td colSpan={10} style={{padding:'10px 10px 4px',fontSize:10,fontWeight:700,color:'#f97316',textTransform:'uppercase',letterSpacing:'1px',borderBottom:`1px solid ${t.cardBorder}`}}>{cat}</td>
                            </tr>
                          )}
                          {catGroups[cat].map(p => {
                            const weekTotal = weekDates.reduce((s,d) => s + (predictions[p.id]?.[d]?.prediction||0), 0);
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
                        </React.Fragment>
                      ))}
                    </tbody>
                  );
                })()
              )}
            </table>
          </div>

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

          {/* ── Prediction Accuracy ── */}
          {(() => {
            const withBoth = accuracyData.filter(a=>a.predicted!=null&&a.actual!=null);
            if (withBoth.length < 3) return null;
            // Group by week number
            const weekMap = {};
            withBoth.forEach(a=>{
              const d = new Date(a.date+'T12:00:00');
              const yr = d.getFullYear(), wk = Math.ceil((d.getDate()+new Date(yr,d.getMonth(),1).getDay())/7);
              const key = `${yr}-${d.getMonth()}-${wk}`;
              if(!weekMap[key])weekMap[key]=[];
              weekMap[key].push(a.error_pct!=null?1-Math.min(a.error_pct,1):null);
            });
            const weeks = Object.entries(weekMap).sort(([a],[b])=>a.localeCompare(b)).slice(-4);
            if (weeks.length < 2) return null;
            return (
              <div style={{padding:'10px 14px',background:t.section,border:`1px solid ${t.cardBorder}`,borderRadius:8,marginTop:14}}>
                <div style={{fontSize:11,fontWeight:700,marginBottom:6}}>📊 {lang==='en'?'Forecast Accuracy':'Précision des prévisions'}</div>
                <div style={{display:'flex',gap:16,alignItems:'flex-end'}}>
                  {weeks.map(([wk,accs],i)=>{
                    const valid=accs.filter(v=>v!=null&&v>=0);
                    const avg=valid.length>0?valid.reduce((a,b)=>a+b,0)/valid.length:null;
                    const pct=avg!=null?Math.round(avg*100):null;
                    const color=pct==null?t.textSub:pct>=80?'#22c55e':pct>=60?'#f97316':'#ef4444';
                    return (
                      <div key={wk} style={{textAlign:'center'}}>
                        <div style={{fontSize:15,fontWeight:800,color}}>{pct!=null?`${pct}%`:'—'}</div>
                        <div style={{fontSize:9,opacity:0.5,marginTop:1}}>{lang==='en'?`Week ${i+1}`:`Sem. ${i+1}`}</div>
                      </div>
                    );
                  })}
                  <div style={{flex:1,fontSize:10,opacity:0.5,paddingBottom:2}}>
                    {lang==='en'?'Accuracy improves as more sales data is entered.':'La précision s\'améliore avec plus de données de ventes.'}
                  </div>
                </div>
              </div>
            );
          })()}
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
              canUse={canUse} apiConfig={apiConfig} showUpgradePrompt={showUpgradePrompt}
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
        <ProductionListView products={products} allSales={allSales} weatherMap={weatherMap} learnedPatterns={learnedPatterns} T={T} t={t} lang={lang}/>
      )}

      {/* PRODUCTS VIEW */}
      {subView==='products' && (
        <ProductsView products={products} onSaveProduct={saveProduct} T={T} t={t} lang={lang}/>
      )}

      {/* AI ANALYSIS VIEW */}
      {subView==='ai' && (
        <AIAnalysisView
          canUse={canUse} allSales={allSales} products={activeProducts} weatherMap={weatherMap}
          weekDates={weekDates} predictions={predictions} showUpgradePrompt={showUpgradePrompt}
          apiConfig={apiConfig} T={T} t={t} lang={lang}
        />
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
