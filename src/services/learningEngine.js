// BalanceIQ — Learning Engine
// Runs silently in the background after data saves (10s debounce).
// Never blocks the UI. All errors are caught and logged to console only.
// TODO: add rush_hour pattern when POS hourly data is available

const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const DAY_NAMES_FR = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
const DAY_NAMES_EN = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function uid() { return crypto.randomUUID(); }

// ── Helpers ────────────────────────────────────────────────────────────────

function safePct(a, b) { return b > 0 ? (a - b) / b : 0; }
function safeAvg(arr) { return arr.length > 0 ? arr.reduce((a,b)=>a+b,0)/arr.length : 0; }

// ── Day-of-Week Patterns ───────────────────────────────────────────────────

async function learnDayOfWeekPatterns(products, allSales, lang) {
  const insights = [];
  for (const product of products) {
    if (!product.active) continue;
    const sales = allSales.filter(s => s.product_id === product.id);
    if (sales.length < 2) continue;
    for (let dow = 0; dow < 7; dow++) {
      const daySales = sales
        .filter(s => new Date(s.date + 'T12:00:00').getDay() === dow)
        .sort((a,b) => b.date.localeCompare(a.date));
      if (daySales.length < 2) continue;
      const now = new Date();
      let wSum = 0, wTotal = 0, sSum = 0;
      daySales.forEach(s => {
        const wk = Math.round((now - new Date(s.date+'T12:00:00'))/(7*86400000));
        const w = wk<=1?4:wk<=2?3:wk<=3?2:1;
        const qty = s.stockout ? Math.round(s.quantity_sold*1.12) : s.quantity_sold;
        wSum += qty*w; wTotal += w; sSum += qty;
      });
      const wavg = wTotal>0 ? wSum/wTotal : 0;
      const avg = sSum/daySales.length;
      const n = daySales.length;
      const conf = n<2?0.2:n<4?0.4:n<8?0.7:0.9;
      await window.api.forecast.patterns.upsert({
        id: uid(), pattern_type:'day_of_week', entity:product.id,
        key:DAY_NAMES[dow],
        value:JSON.stringify({avg, weighted_avg:wavg, sample_count:n}),
        confidence:conf, sample_size:n,
      });
      // Detect shift: last 3 consistently 15%+ above/below historical
      if (daySales.length >= 5) {
        const recent3 = daySales.slice(0,3).map(s=>s.quantity_sold);
        const hist = daySales.slice(3).map(s=>s.quantity_sold);
        const histAvg = safeAvg(hist);
        const recAvg = safeAvg(recent3);
        const shift = safePct(recAvg, histAvg);
        if (histAvg > 0 && Math.abs(shift) >= 0.15) {
          const pct = Math.round(Math.abs(shift)*100);
          const dirFr = shift>0?'plus':'moins';
          const dirEn = shift>0?'more':'less';
          insights.push({
            id:uid(), type:'dow_shift', entity:product.id,
            message_fr:`${product.name} se vend ${pct}% de ${dirFr} les ${DAY_NAMES_FR[dow]}s depuis 3 semaines. Les prévisions ont été ajustées.`,
            message_en:`${product.name} is selling ${pct}% ${dirEn} on ${DAY_NAMES_EN[dow]}s for the past 3 weeks. Forecasts have been adjusted.`,
            severity:'suggestion', financial_impact:null,
          });
        }
      }
    }
  }
  return insights;
}

// ── Weather Correlations ───────────────────────────────────────────────────

async function learnWeatherCorrelations(products, allSales, weatherMap, lang) {
  const insights = [];
  for (const product of products) {
    if (!product.active) continue;
    const sales = allSales.filter(s=>s.product_id===product.id&&weatherMap[s.date]);
    if (sales.length < 14) continue;
    const overallAvg = safeAvg(sales.map(s=>s.quantity_sold));
    if (overallAvg === 0) continue;
    const ranges = {below_5:[],_5_15:[],_15_25:[],above_25:[]};
    const conds = {sunny:[],cloudy:[],rainy:[],snowy:[]};
    sales.forEach(s => {
      const w = weatherMap[s.date];
      const t = w.temp_max??10; const qty = s.quantity_sold;
      if(t<5)ranges.below_5.push(qty);
      else if(t<15)ranges._5_15.push(qty);
      else if(t<25)ranges._15_25.push(qty);
      else ranges.above_25.push(qty);
      const c=w.weather_code||0;
      if(c===0||c===1)conds.sunny.push(qty);
      else if(c<=3)conds.cloudy.push(qty);
      else if((c>=51&&c<=67)||(c>=80&&c<=82))conds.rainy.push(qty);
      else if(c>=71&&c<=77)conds.snowy.push(qty);
    });
    const rangeKeys = {below_5:'below_5','_5_15':'5_15','_15_25':'15_25',above_25:'above_25'};
    for (const [rk, arr] of Object.entries(ranges)) {
      if (arr.length < 2) continue;
      const avg = safeAvg(arr);
      await window.api.forecast.patterns.upsert({
        id:uid(), pattern_type:'weather_correlation', entity:product.id,
        key:rangeKeys[rk]||rk,
        value:JSON.stringify({avg_sales:avg, sample_count:arr.length, pct_change_vs_baseline:safePct(avg,overallAvg)}),
        confidence:arr.length<3?0.3:arr.length<6?0.5:0.8, sample_size:arr.length,
      });
    }
    for (const [ck, arr] of Object.entries(conds)) {
      if (arr.length < 2) continue;
      const avg = safeAvg(arr);
      await window.api.forecast.patterns.upsert({
        id:uid(), pattern_type:'weather_condition', entity:product.id,
        key:ck,
        value:JSON.stringify({avg_sales:avg, pct_change:safePct(avg,overallAvg)}),
        confidence:arr.length<3?0.3:0.6, sample_size:arr.length,
      });
    }
    // Suggest sensitivity update
    const warm = ranges._15_25;
    if (warm.length >= 3 && product.weather_sensitivity === 0) {
      const warmAvg = safeAvg(warm);
      const pctChg = safePct(warmAvg, overallAvg);
      if (Math.abs(pctChg) >= 0.15) {
        const pct = Math.round(Math.abs(pctChg)*100);
        const dirFr = pctChg>0?'plus':'moins'; const dirEn = pctChg>0?'more':'less';
        insights.push({
          id:uid(), type:'weather_sensitivity_suggestion', entity:product.id,
          message_fr:`💡 Nos données montrent que ${product.name} se vend ${pct}% de ${dirFr} quand il fait plus de 15°C. Sensibilité actuelle: neutre. Mettre à jour dans Config Produits?`,
          message_en:`💡 Our data shows ${product.name} sells ${pct}% ${dirEn} above 15°C. Current sensitivity: neutral. Update in Product Config?`,
          severity:'suggestion', financial_impact:null,
        });
      }
    }
  }
  return insights;
}

// ── Waste Patterns ─────────────────────────────────────────────────────────

async function learnWastePatterns(products, allSales, lang) {
  const insights = [];
  for (const product of products) {
    if (!product.active) continue;
    const sales = allSales.filter(s=>s.product_id===product.id&&s.quantity_remaining!=null);
    if (sales.length < 4) continue;
    for (let dow = 0; dow < 7; dow++) {
      const ds = sales.filter(s=>new Date(s.date+'T12:00:00').getDay()===dow);
      if (ds.length < 2) continue;
      const wastePcts = ds.map(s=>s.quantity_made>0?s.quantity_remaining/s.quantity_made:0);
      const avgWastePct = safeAvg(wastePcts);
      const avgWasteUnits = safeAvg(ds.map(s=>s.quantity_remaining||0));
      const avgWasteCost = product.unit_cost!=null ? avgWasteUnits*product.unit_cost : null;
      await window.api.forecast.patterns.upsert({
        id:uid(), pattern_type:'waste_pattern', entity:product.id, key:DAY_NAMES[dow],
        value:JSON.stringify({avg_waste_pct:avgWastePct,avg_waste_units:avgWasteUnits,avg_waste_cost:avgWasteCost}),
        confidence:ds.length<3?0.3:0.7, sample_size:ds.length,
      });
      if (avgWastePct > 0.15 && ds.length >= 4) {
        const weeklyWasteCost = avgWasteCost!=null ? avgWasteCost*4 : null;
        const monthlyCost = weeklyWasteCost!=null ? weeklyWasteCost*4 : null;
        insights.push({
          id:uid(), type:`waste_warning_${product.id}_${DAY_NAMES[dow]}`,
          entity:product.id,
          message_fr:`🟡 ${product.name}: gaspillage moyen de ${Math.round(avgWastePct*100)}% les ${DAY_NAMES_FR[dow]}s.${weeklyWasteCost!=null?` Coût: ${weeklyWasteCost.toFixed(2)}$/semaine.`:''} Réduisez la production.`,
          message_en:`🟡 ${product.name}: average ${Math.round(avgWastePct*100)}% waste on ${DAY_NAMES_EN[dow]}s.${weeklyWasteCost!=null?` Cost: $${weeklyWasteCost.toFixed(2)}/week.`:''} Reduce production.`,
          severity:'warning', financial_impact:monthlyCost,
        });
      }
    }
  }
  return insights;
}

// ── Stockout Patterns ──────────────────────────────────────────────────────

async function learnStockoutPatterns(products, allSales, lang) {
  const insights = [];
  for (const product of products) {
    if (!product.active) continue;
    const sales = allSales.filter(s=>s.product_id===product.id);
    if (sales.length < 4) continue;
    for (let dow = 0; dow < 7; dow++) {
      const ds = sales.filter(s=>new Date(s.date+'T12:00:00').getDay()===dow);
      if (ds.length < 2) continue;
      const stockouts = ds.filter(s=>s.stockout);
      const estimatedUnmet = stockouts.reduce((a,s)=>a+(s.quantity_sold*0.25),0);
      const lostRev = product.sell_price!=null ? estimatedUnmet*product.sell_price : null;
      await window.api.forecast.patterns.upsert({
        id:uid(), pattern_type:'stockout_pattern', entity:product.id, key:DAY_NAMES[dow],
        value:JSON.stringify({stockout_count:stockouts.length,total_days_tracked:ds.length,estimated_unmet_demand:estimatedUnmet,estimated_lost_revenue:lostRev}),
        confidence:ds.length<3?0.3:0.7, sample_size:ds.length,
      });
      if (stockouts.length >= 2 && ds.length <= 6) {
        const monthlyLost = lostRev!=null ? lostRev*4 : null;
        const suggested = Math.round(safeAvg(ds.map(s=>s.quantity_sold))*1.2);
        insights.push({
          id:uid(), type:`stockout_critical_${product.id}_${DAY_NAMES[dow]}`,
          entity:product.id,
          message_fr:`🔴 ${product.name}: rupture de stock ${stockouts.length} ${DAY_NAMES_FR[dow]}s sur ${ds.length} le mois dernier.${monthlyLost!=null?` Revenu perdu estimé: ${monthlyLost.toFixed(2)}$/mois.`:''} Production suggérée: ${suggested} unités.`,
          message_en:`🔴 ${product.name}: stockout ${stockouts.length} of ${ds.length} ${DAY_NAMES_EN[dow]}s last month.${monthlyLost!=null?` Estimated lost revenue: $${monthlyLost.toFixed(2)}/month.`:''} Suggested production: ${suggested} units.`,
          severity:'critical', financial_impact:monthlyLost,
        });
      }
    }
  }
  return insights;
}

// ── Trends ─────────────────────────────────────────────────────────────────

async function learnTrends(products, allSales, lang) {
  const insights = [];
  for (const product of products) {
    if (!product.active) continue;
    const sales = allSales.filter(s=>s.product_id===product.id).sort((a,b)=>b.date.localeCompare(a.date));
    if (sales.length < 8) continue;
    const last2w = sales.slice(0,14);
    const prev2w = sales.slice(14,28);
    if (prev2w.length < 4) continue;
    const recAvg = safeAvg(last2w.map(s=>s.quantity_sold));
    const prevAvg = safeAvg(prev2w.map(s=>s.quantity_sold));
    const pct = safePct(recAvg, prevAvg);
    const dir = Math.abs(pct)<0.05?'stable':pct>0?'up':'down';
    await window.api.forecast.patterns.upsert({
      id:uid(), pattern_type:'trend', entity:product.id, key:'current',
      value:JSON.stringify({direction:dir,pct_change:pct,period_weeks:2,is_seasonal:false}),
      confidence:sales.length<14?0.3:0.6, sample_size:sales.length,
    });
    if (Math.abs(pct)>=0.10 && sales.length>=14) {
      const pctStr = `${pct>0?'+':''}${Math.round(pct*100)}%`;
      const arrow = pct>0?'📈':'📉';
      insights.push({
        id:uid(), type:`trend_${product.id}`, entity:product.id,
        message_fr:`${arrow} ${product.name} ${pctStr} sur les 2 dernières semaines. ${Math.abs(pct)>=0.2?'Croissance soutenue.':'Tendance à surveiller.'}`,
        message_en:`${arrow} ${product.name} ${pctStr} over the last 2 weeks. ${Math.abs(pct)>=0.2?'Sustained growth.':'Trend to watch.'}`,
        severity:'suggestion', financial_impact:null,
      });
    }
  }
  return insights;
}

// ── Cross-Product Substitution ─────────────────────────────────────────────

async function learnCrossProductPatterns(products, allSales, lang) {
  const insights = [];
  const active = products.filter(p=>p.active);
  for (const pA of active) {
    const stockoutDates = allSales.filter(s=>s.product_id===pA.id&&s.stockout).map(s=>s.date);
    if (stockoutDates.length < 3) continue;
    for (const pB of active) {
      if (pB.id===pA.id) continue;
      const bAll = allSales.filter(s=>s.product_id===pB.id);
      if (bAll.length < 4) continue;
      const bAvg = safeAvg(bAll.map(s=>s.quantity_sold));
      const bOnStockout = bAll.filter(s=>stockoutDates.includes(s.date));
      if (bOnStockout.length < 3) continue;
      const bStockoutAvg = safeAvg(bOnStockout.map(s=>s.quantity_sold));
      const spike = safePct(bStockoutAvg, bAvg);
      if (spike < 0.10) continue;
      const pct = Math.round(spike*100);
      await window.api.forecast.patterns.upsert({
        id:uid(), pattern_type:'cross_product', entity:pA.id, key:pB.id,
        value:JSON.stringify({correlation:Math.min(spike,1),direction:'substitute',description:`When ${pA.name} stocks out, ${pB.name} increases ~${pct}%`}),
        confidence:bOnStockout.length<4?0.4:0.7, sample_size:bOnStockout.length,
      });
      insights.push({
        id:uid(), type:`cross_product_${pA.id}_${pB.id}`, entity:pA.id,
        message_fr:`Quand ${pA.name} est en rupture, les ventes de ${pB.name} augmentent de ~${pct}%. Les clients semblent substituer.`,
        message_en:`When ${pA.name} stocks out, ${pB.name} sales increase by ~${pct}%. Customers appear to be substituting.`,
        severity:'suggestion', financial_impact:null,
      });
    }
  }
  return insights;
}

// ── Cashier Patterns ───────────────────────────────────────────────────────

async function learnCashierPatterns(dailyData, lang) {
  const insights = [];
  if (!dailyData || dailyData.length === 0) return insights;
  const cashierDow = {};
  for (const day of dailyData) {
    if (!day.caisses) continue;
    const dow = new Date(day.date+'T12:00:00').getDay();
    for (const c of day.caisses) {
      if (!c.name?.trim()) continue;
      const v = parseFloat(c.variance);
      if (isNaN(v)) continue;
      if (!cashierDow[c.name]) cashierDow[c.name] = {};
      if (!cashierDow[c.name][dow]) cashierDow[c.name][dow] = [];
      cashierDow[c.name][dow].push(v);
    }
  }
  for (const [name, dowMap] of Object.entries(cashierDow)) {
    for (const [dowStr, vars] of Object.entries(dowMap)) {
      const dow = parseInt(dowStr);
      if (vars.length < 3) continue;
      const avg = safeAvg(vars);
      const negCount = vars.filter(v=>v<-5).length;
      await window.api.forecast.patterns.upsert({
        id:uid(), pattern_type:'cashier_pattern', entity:name, key:DAY_NAMES[dow],
        value:JSON.stringify({avg_variance:avg,variance_count:vars.length,consecutive_count:negCount}),
        confidence:vars.length<4?0.4:0.7, sample_size:vars.length,
      });
      if (negCount >= 3 && avg < -5) {
        const minV = Math.round(Math.min(...vars));
        const maxV = Math.round(Math.max(...vars));
        insights.push({
          id:uid(), type:`cashier_${name}_${DAY_NAMES[dow]}`, entity:name,
          message_fr:`🕵️ ${name} est systématiquement court de ${Math.abs(minV)}-${Math.abs(maxV)}$ les ${DAY_NAMES_FR[dow]}s soir depuis ${negCount} semaines.`,
          message_en:`🕵️ ${name} is consistently short $${Math.abs(minV)}-$${Math.abs(maxV)} on ${DAY_NAMES_EN[dow]} evenings for the past ${negCount} weeks.`,
          severity:'warning', financial_impact:Math.abs(avg)*4,
        });
      }
    }
  }
  return insights;
}

// ── Track Prediction Accuracy ──────────────────────────────────────────────

async function trackPredictionAccuracy(products, allSales, existingAccuracy) {
  for (const product of products) {
    if (!product.active) continue;
    const pending = existingAccuracy.filter(a=>a.product_id===product.id&&a.predicted!=null&&a.actual==null);
    for (const acc of pending) {
      const actual = allSales.find(s=>s.product_id===product.id&&s.date===acc.date);
      if (!actual) continue;
      const errPct = acc.predicted>0 ? Math.abs(acc.predicted-actual.quantity_sold)/acc.predicted : null;
      await window.api.forecast.accuracy.upsert({
        id:acc.id, product_id:product.id, date:acc.date,
        predicted:acc.predicted, actual:actual.quantity_sold, error_pct:errPct,
      });
    }
  }
}

// ── Main Run ───────────────────────────────────────────────────────────────

export async function runLearningEngine({ products, allSales, weatherMap, dailyData = [], lang = 'fr' }) {
  const existingAccuracy = await window.api.forecast.accuracy.getAll().catch(()=>[]);
  const existingInsights = await window.api.forecast.insights.getAll().catch(()=>[]);
  const existingKeys = new Set(existingInsights.map(i=>i.type));
  const allNewInsights = [];

  const fns = [
    () => learnDayOfWeekPatterns(products, allSales, lang),
    () => learnWeatherCorrelations(products, allSales, weatherMap, lang),
    () => learnWastePatterns(products, allSales, lang),
    () => learnStockoutPatterns(products, allSales, lang),
    () => learnTrends(products, allSales, lang),
    () => learnCrossProductPatterns(products, allSales, lang),
    () => learnCashierPatterns(dailyData, lang),
    () => { trackPredictionAccuracy(products, allSales, existingAccuracy); return []; },
  ];

  for (const fn of fns) {
    try { const ins = await fn(); allNewInsights.push(...ins); }
    catch(e) { console.error('[LearningEngine]', e); }
  }

  // Save non-duplicate insights (max 10 unread at a time)
  const unreadCount = existingInsights.filter(i=>!i.read).length;
  let added = 0;
  for (const ins of allNewInsights) {
    if (existingKeys.has(ins.type)) continue;
    if (unreadCount + added >= 10) break;
    await window.api.forecast.insights.upsert(ins).catch(()=>{});
    existingKeys.add(ins.type);
    added++;
  }
}

// ── Debounced Trigger ──────────────────────────────────────────────────────

let _timer = null;
export function triggerLearning(params) {
  if (_timer) clearTimeout(_timer);
  _timer = setTimeout(() => runLearningEngine(params).catch(e=>console.error('[LearningEngine] run error:',e)), 10000);
}
