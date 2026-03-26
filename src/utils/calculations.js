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
