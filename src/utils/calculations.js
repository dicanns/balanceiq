// ── BalanceIQ Pure Calculation Functions ────────────────────────────────────
// All financial math extracted as pure, side-effect-free functions.
// Imported by both the React app (App.jsx, components) and the Vitest test suite.
// No React, no Electron, no browser APIs here.

const r2 = (n) => Math.round((n ?? 0) * 100) / 100;

// ── TAX ──────────────────────────────────────────────────────────────────────
export function calcTPS(amount) {
  return r2((amount || 0) * 0.05);
}
export function calcTVQ(amount) {
  return r2((amount || 0) * 0.09975);
}
export function calcTaxTotal(amount) {
  return r2(amount + calcTPS(amount) + calcTVQ(amount));
}

// ── CASH REGISTER RECONCILIATION ─────────────────────────────────────────────
// Manual total = interac + finalCash + deposits (what was physically collected)
export function calcManualTotal(interac, finalCash, deposits) {
  return r2((interac || 0) + (finalCash || 0) + (deposits || 0));
}

// POS total including taxes (gross ring)
export function calcPOSGross(posVentes, posTPS, posTVQ) {
  return r2((posVentes || 0) + (posTPS || 0) + (posTVQ || 0));
}

// Expected cash in register = POS gross − deliveries (paid out separately)
export function calcExpectedInRegister(posGross, posLivraisons) {
  return r2(posGross - (posLivraisons || 0));
}

// Variance = manual − expected  (positive = over, negative = short)
export function calcVariance(manualTotal, expectedInRegister) {
  return r2(manualTotal - expectedInRegister);
}

export function isBalanced(variance) {
  return Math.abs(variance) <= 1;
}

// ── NET SALES ────────────────────────────────────────────────────────────────
export function calcNetSalesPOS(posVentes, posDiscounts, posRefunds) {
  return r2((posVentes || 0) - (posDiscounts || 0) - (posRefunds || 0));
}

// ── DAILY AVERAGES ───────────────────────────────────────────────────────────
export function calcMoyenneParDouzaine(netSales, totalDozens) {
  if (!netSales || !totalDozens || totalDozens <= 0) return null;
  return r2(netSales / totalDozens);
}

// ── INVENTORY ────────────────────────────────────────────────────────────────
export function calcInventoryUsed(start, received, end) {
  if (start == null || end == null) return null;
  return r2(start + (received || 0) - end);
}

// ── LABOUR ───────────────────────────────────────────────────────────────────
export function calcLabourCost(employees) {
  return r2(employees.reduce((s, e) => s + (e.hours || 0) * (e.wage || 0), 0));
}

export function calcLabourPct(labourCost, netSales) {
  if (!netSales || netSales <= 0) return null;
  return (labourCost / netSales) * 100;
}

// ── P&L ──────────────────────────────────────────────────────────────────────
export function calcFoodCostPct(foodCost, revenue) {
  if (!revenue || revenue <= 0) return null;
  return (foodCost / revenue) * 100;
}

export function calcPrimeCost(foodCost, labourCost) {
  return r2(foodCost + labourCost);
}

export function calcPrimeCostPct(foodCost, labourCost, revenue) {
  if (!revenue || revenue <= 0) return null;
  return ((foodCost + labourCost) / revenue) * 100;
}

export function calcNetProfit(revenue, foodCost, labourCost, expenses) {
  return r2(revenue - foodCost - labourCost - expenses);
}

export function calcNetProfitPct(netProfit, revenue) {
  if (!revenue || revenue <= 0) return null;
  return (netProfit / revenue) * 100;
}

// ── INVOICE LINE TOTALS ───────────────────────────────────────────────────────
export function calcInvoiceLine(quantite, prixUnitaire, remise = 0) {
  return r2((quantite || 0) * (prixUnitaire || 0) * (1 - (remise || 0) / 100));
}

export function calcInvoiceTotals(lignes) {
  let sousTotal = 0, tpsTotal = 0, tvqTotal = 0;
  (lignes || []).forEach((l) => {
    const lt = calcInvoiceLine(l.quantite || l.qty, l.prixUnitaire || l.unitPrice, l.remise || l.discount);
    sousTotal += lt;
    if (l.tps) tpsTotal += lt * 0.05;
    if (l.tvq) tvqTotal += lt * 0.09975;
  });
  sousTotal = r2(sousTotal);
  tpsTotal  = r2(tpsTotal);
  tvqTotal  = r2(tvqTotal);
  return { sousTotal, tpsTotal, tvqTotal, total: r2(sousTotal + tpsTotal + tvqTotal) };
}

// ── TIP POOL ─────────────────────────────────────────────────────────────────
export function calcTipPool(method, totalTips, employees) {
  if (!totalTips || totalTips <= 0 || !employees || employees.length === 0) return [];
  const total = parseFloat(totalTips) || 0;
  let shares = [];

  if (method === 'equal') {
    const each = r2(total / employees.length);
    shares = employees.map(() => each);

  } else if (method === 'hours') {
    const totalHours = employees.reduce((s, e) => s + (parseFloat(e.hours) || 0), 0);
    if (totalHours === 0) return employees.map((e) => ({ ...e, share: 0 }));
    shares = employees.map((e) => r2((parseFloat(e.hours) || 0) / totalHours * total));

  } else if (method === 'points') {
    const totalPoints = employees.reduce((s, e) => s + (parseFloat(e.points) || 0), 0);
    if (totalPoints === 0) return employees.map((e) => ({ ...e, share: 0 }));
    shares = employees.map((e) => r2((parseFloat(e.points) || 0) / totalPoints * total));

  } else if (method === 'pct') {
    shares = employees.map((e) => r2((parseFloat(e.pct) || 0) / 100 * total));
  }

  // Fix rounding remainder on first employee
  const allocated = shares.reduce((s, v) => s + v, 0);
  const remainder = r2(total - allocated);
  if (shares.length > 0 && remainder !== 0) shares[0] = r2(shares[0] + remainder);

  return employees.map((e, i) => ({ ...e, share: shares[i] ?? 0 }));
}

// ── ÉCOCONTRIBUTION ──────────────────────────────────────────────────────────
export function calcEcoItem(annualUnits, unitWeightGrams, takeoutPct) {
  const takeoutUnits = (annualUnits || 0) * ((takeoutPct || 0) / 100);
  const weightKg     = takeoutUnits * ((unitWeightGrams || 0) / 1000);
  const weightTonnes = weightKg / 1000;
  return { takeoutUnits, weightKg, weightTonnes };
}

export function calcEcoFee(weightTonnes, rateTonne, malusPct = 0, creditPct = 0) {
  const baseFee = (weightTonnes || 0) * (rateTonne || 0);
  const malus   = baseFee * ((malusPct || 0) / 100);
  const credit  = baseFee * ((creditPct || 0) / 100);
  return { baseFee, malus, credit, netFee: r2(baseFee + malus - credit) };
}

// ── ROYALTY ───────────────────────────────────────────────────────────────────
export function calcRoyalty(netSales, royaltyRate, adRate = 0) {
  const royalty = r2((netSales || 0) * ((royaltyRate || 0) / 100));
  const ad      = r2((netSales || 0) * ((adRate || 0) / 100));
  return { royalty, ad, total: r2(royalty + ad) };
}

// ── DELIVERY COMMISSION ────────────────────────────────────────────────────────
export function calcDeliveryCommission(platformSales, commissionRate) {
  return r2((platformSales || 0) * ((commissionRate || 0) / 100));
}

export function calcDeliveryVariance(expectedCommission, actualCommission) {
  return r2(actualCommission - expectedCommission);
}

// ── RECIPE COSTING ────────────────────────────────────────────────────────────
export function calcRecipeCost(ingredients) {
  return r2(
    (ingredients || []).reduce((total, ing) => total + (ing.quantity || 0) * (ing.unitPrice || 0), 0)
  );
}

export function calcRecipeCostPerServing(totalCost, yieldQty) {
  if (!yieldQty || yieldQty <= 0) return null;
  return r2(totalCost / yieldQty);
}

// ── INVOICE AGING ─────────────────────────────────────────────────────────────
export function calcAgingDays(invoiceDate, referenceDate) {
  // Use UTC noon to avoid DST shifts skewing the day count
  const p1 = invoiceDate.split('-').map(Number);
  const p2 = referenceDate.split('-').map(Number);
  const d1 = Date.UTC(p1[0], p1[1] - 1, p1[2]);
  const d2 = Date.UTC(p2[0], p2[1] - 1, p2[2]);
  return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
}

export function calcAgingBucket(agingDays) {
  if (agingDays <= 30)  return '0-30';
  if (agingDays <= 60)  return '31-60';
  if (agingDays <= 90)  return '61-90';
  return '90+';
}

export function calcAgingTotals(invoices, referenceDate) {
  const buckets = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
  invoices.forEach((inv) => {
    const days   = calcAgingDays(inv.date, referenceDate);
    const bucket = calcAgingBucket(days);
    buckets[bucket] = r2(buckets[bucket] + (inv.balance || 0));
  });
  return buckets;
}

// ── BREAD VELOCITY / CHECKPOINTS ──────────────────────────────────────────────
// windowIdx: 0=open→14h(1/4), 1=14h→17h(2/4), 2=17h→19h(3/4), 3=19h→20h(4/4)
const WINDOW_FRACTIONS = [1 / 4, 2 / 4, 3 / 4, 4 / 4];

export function calcPasseParHeure(totalStart, received, remaining) {
  if (totalStart == null || remaining == null) return null;
  return r2((totalStart + (received || 0)) - remaining);
}

export function calcProjectionFinDeJour(consumed, windowIdx) {
  const fraction = WINDOW_FRACTIONS[windowIdx];
  if (!fraction || !consumed || consumed <= 0) return null;
  return Math.ceil(consumed / fraction);
}

// ── ENCAISSE (CASH POSITION) ──────────────────────────────────────────────────
export function calcSoldeCalcule(soldeOuverture, cashVentes, autresEntrees, depotsBanque, sortiesCash) {
  return r2(
    (soldeOuverture || 0) +
    (cashVentes || 0) +
    (autresEntrees || 0) -
    (depotsBanque || 0) -
    (sortiesCash || 0)
  );
}

export function calcEncaisseVariance(physicalCount, soldeCalcule) {
  return r2((physicalCount || 0) - soldeCalcule);
}

export function isEncaisseBalanced(variance) {
  return Math.abs(variance) <= 2;
}

// ── ENCAISSE RUNNING CHAIN ────────────────────────────────────────────────────
// Processes an ordered array of daily encaisse entries, carrying closing → opening.
// Each entry: { cashVentes, autresEntrees, depots, sorties, physicalCount, openingOverride }
export function computeEncaisseChain(days) {
  let prevClosing = null;
  return days.map((day) => {
    const opening = day.openingOverride != null ? day.openingOverride : (prevClosing ?? 0);
    const calculated = r2(
      opening +
      (day.cashVentes || 0) +
      (day.autresEntrees || 0) -
      (day.depots || 0) -
      (day.sorties || 0)
    );
    const closing = day.physicalCount != null ? day.physicalCount : calculated;
    prevClosing = closing;
    return { ...day, opening, calculated, closing };
  });
}

// ── INVOICE BALANCE (AR) ──────────────────────────────────────────────────────
export function calcInvoiceBalance(invoiceTotal, payments) {
  const totalPaid = r2((payments || []).reduce((s, p) => s + (p.montant || 0), 0));
  return r2(Math.max(0, invoiceTotal - totalPaid));
}

export function calcTotalOutstanding(invoices) {
  return r2(invoices.reduce((s, inv) => s + calcInvoiceBalance(inv.total, inv.paiements), 0));
}

// ── STEPPED ROYALTY ───────────────────────────────────────────────────────────
// Given monthly sales and a paliers array [{minVentes, rate}], returns the applicable rate.
// The palier with the highest minVentes that is still ≤ sales wins.
export function calcSteppedRoyaltyRate(sales, paliers) {
  if (!paliers || paliers.length === 0) return 0;
  const sorted = [...paliers].sort((a, b) => b.minVentes - a.minVentes);
  const match  = sorted.find((p) => (sales || 0) >= (p.minVentes || 0));
  return match ? (match.rate || 0) : (sorted[sorted.length - 1].rate || 0);
}

// Full royalty calc supporting flat and stepped structures + location-level override.
export function calcRoyaltyFull(sales, loc, royaltyConfig) {
  let rate;
  if (loc && loc.royaltyOverride && loc.royaltyRate != null) {
    rate = loc.royaltyRate;
  } else if (royaltyConfig.structure === 'paliers' && royaltyConfig.paliersMensuels?.length) {
    rate = calcSteppedRoyaltyRate(sales, royaltyConfig.paliersMensuels);
  } else {
    rate = royaltyConfig.rate || 0;
  }
  const adRate = (loc && loc.royaltyOverride && loc.adRate != null)
    ? loc.adRate
    : (royaltyConfig.adRate || 0);
  const royalty = r2((sales || 0) * rate / 100);
  const ad      = r2((sales || 0) * adRate / 100);
  return { rate, adRate, royalty, ad, total: r2(royalty + ad) };
}

// ── ANOMALY DETECTION ─────────────────────────────────────────────────────────
export function calcAnomalyPct(actual, average) {
  if (!average || average <= 0) return null;
  return ((actual - average) / average) * 100;
}

export function isAnomaly(pct, threshold = 25) {
  return pct != null && Math.abs(pct) > threshold;
}

// ── DOW PROFILING ─────────────────────────────────────────────────────────────
// Builds average sales per day-of-week from historical data.
// salesData: [{ dow: 0-6, venteNet: number }]
export function buildDOWProfiles(salesData) {
  const profiles = Array.from({ length: 7 }, () => ({ n: 0, totalSales: 0, avgSales: 0 }));
  (salesData || []).forEach(({ dow, venteNet }) => {
    if (venteNet > 0 && dow >= 0 && dow <= 6) {
      profiles[dow].n++;
      profiles[dow].totalSales += venteNet;
    }
  });
  profiles.forEach((p) => {
    if (p.n > 0) p.avgSales = r2(p.totalSales / p.n);
  });
  return profiles;
}

// ── FORECAST PREDICTION ENGINE ────────────────────────────────────────────────
// Weighted DOW base: recent weeks weighted 4-3-2-1 (most recent = highest weight)
export function calcForecastBase(salesHistory, targetDOW) {
  const dowSales = (salesHistory || [])
    .filter((s) => s.dow === targetDOW && s.quantity_sold > 0)
    .sort((a, b) => b.date.localeCompare(a.date)); // newest first

  if (!dowSales.length) return { base: 0, confidence: 'base', dataPoints: 0 };

  let weightedSum = 0, totalWeight = 0;
  dowSales.forEach((s, i) => {
    const wk     = i + 1;
    const weight = wk <= 1 ? 4 : wk <= 2 ? 3 : wk <= 3 ? 2 : 1;
    const qty    = s.stockout ? (s.quantity_sold * 1.12) : s.quantity_sold;
    weightedSum += qty * weight;
    totalWeight += weight;
  });

  const base       = totalWeight > 0 ? weightedSum / totalWeight : 0;
  const n          = dowSales.length;
  const confidence = n < 2 ? 'base' : n < 4 ? 'low' : n < 8 ? 'medium' : 'high';
  return { base, confidence, dataPoints: n };
}

// Weather factor: temp sensitivity + condition penalty
export function calcWeatherFactor(tempMax, weatherCode, sensitivity = 0) {
  let factor = 0;
  if (tempMax < 5)                       factor += (sensitivity || 0) * -0.15;
  else if (tempMax >= 15 && tempMax < 25) factor += (sensitivity || 0) *  0.10;
  else if (tempMax >= 25)                factor += (sensitivity || 0) *  0.20;

  const isRainy = (weatherCode >= 61 && weatherCode <= 67) || (weatherCode >= 80 && weatherCode <= 82);
  const isSnowy = weatherCode >= 71 && weatherCode <= 77;
  if (isRainy) factor -= 0.05;
  if (isSnowy) factor -= 0.10;
  return factor;
}

// Final prediction: base × (1+weather) × (1+trend) × wasteFactor
export function calcForecastPrediction(base, weatherFactor, trendFactor = 0, wasteFactor = 1) {
  return Math.max(0, Math.round(base * (1 + weatherFactor) * (1 + trendFactor) * wasteFactor));
}

// ── DATE UTILITIES ────────────────────────────────────────────────────────────
export const QC_HOL = {
  '01-01': "Jour de l'An",
  '03-29': 'Vendredi saint',
  '04-01': 'Lundi de Pâques',
  '05-20': 'Journée nationale des patriotes',
  '06-24': 'Fête nationale du Québec',
  '07-01': 'Fête du Canada',
  '09-02': 'Fête du Travail',
  '10-14': "Action de grâce",
  '12-25': 'Noël',
  '12-26': 'Lendemain de Noël',
};

// Date object → "YYYY-MM-DD" string
export function formatDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// "YYYY-MM-DD" → previous day's "YYYY-MM-DD"
export function prevDateKey(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  return formatDateKey(d);
}

// Date object → Quebec holiday name or null
export function getQCHoliday(date) {
  const key = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return QC_HOL[key] || null;
}
