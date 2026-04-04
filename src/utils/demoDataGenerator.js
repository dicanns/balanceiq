// demoDataGenerator.js — BalanceIQ demo data generator v2
// 3 business presets, all dates anchored to today

// ─── UTILITIES ──────────────────────────────────────────────────────────────

function sr(s, min = 0, max = 1) {
  const x = Math.sin(s * 9301 + 49297) * 233280;
  return min + (x - Math.floor(x)) * (max - min);
}
function sri(s, a, b) { return Math.round(sr(s, a, b)); }
function r2(n) { return Math.round(n * 100) / 100; }
function fmtDate(d) { return d.toISOString().slice(0, 10); }
function dt(str) { return new Date(str + 'T12:00:00Z'); }
function addD(d, n) { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; }
function dateRange(startStr, endStr) {
  const dates = [], cur = dt(startStr), end = dt(endStr);
  while (cur <= end) { dates.push(fmtDate(cur)); cur.setUTCDate(cur.getUTCDate() + 1); }
  return dates;
}
function getDow(str) { return dt(str).getUTCDay(); } // 0=Sun
function isWeekend(str) { const d = getDow(str); return d === 0 || d === 6; }
function seedOf(str) { return parseInt(str.replace(/-/g, '')); }
function uid(p = 'demo') { return `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

// Three most recent complete months before today
function getPLMonths(today) {
  const months = [];
  for (let i = 1; i <= 3; i++) {
    const d = new Date(today); d.setDate(1); d.setMonth(d.getMonth() - i);
    months.push(fmtDate(d).slice(0, 7));
  }
  return months.reverse();
}

// ─── WEATHER ────────────────────────────────────────────────────────────────

const WEATHER_BY_MONTH = {
  1:  { minC: -18, maxC: -6,  codes: [71, 85, 3, 71, 2, 95, 1], descs: ['Neige légère','Poudrerie','Nuageux','Neige','Partiellement nuageux','Tempête','Ensoleillé'] },
  2:  { minC: -14, maxC: -3,  codes: [71, 3, 2, 1, 71, 85, 3],  descs: ['Neige légère','Nuageux','Partiellement nuageux','Ensoleillé','Neige légère','Poudrerie','Nuageux'] },
  3:  { minC: -6,  maxC: 8,   codes: [3, 2, 1, 61, 71, 2, 3],   descs: ['Nuageux','Partiellement nuageux','Ensoleillé','Pluie légère','Neige légère','Partiellement nuageux','Nuageux'] },
  4:  { minC: 2,   maxC: 14,  codes: [2, 3, 61, 1, 3, 61, 2],   descs: ['Partiellement nuageux','Nuageux','Pluie légère','Ensoleillé','Nuageux','Pluie','Partiellement nuageux'] },
  5:  { minC: 10,  maxC: 22,  codes: [1, 2, 1, 3, 61, 1, 2],    descs: ['Ensoleillé','Partiellement nuageux','Ensoleillé','Nuageux','Averse','Ensoleillé','Partiellement nuageux'] },
  6:  { minC: 16,  maxC: 28,  codes: [1, 1, 2, 61, 80, 1, 3],   descs: ['Ensoleillé','Ensoleillé','Partiellement nuageux','Pluie','Averses','Ensoleillé','Nuageux'] },
  7:  { minC: 19,  maxC: 30,  codes: [1, 1, 1, 2, 95, 1, 80],   descs: ['Ensoleillé','Ensoleillé','Ensoleillé','Partiellement nuageux','Orage','Ensoleillé','Averses'] },
  8:  { minC: 18,  maxC: 29,  codes: [1, 2, 1, 80, 1, 2, 3],    descs: ['Ensoleillé','Partiellement nuageux','Ensoleillé','Averses','Ensoleillé','Partiellement nuageux','Nuageux'] },
  9:  { minC: 12,  maxC: 22,  codes: [1, 2, 3, 61, 1, 1, 2],    descs: ['Ensoleillé','Partiellement nuageux','Nuageux','Pluie légère','Ensoleillé','Ensoleillé','Partiellement nuageux'] },
  10: { minC: 4,   maxC: 14,  codes: [2, 3, 61, 2, 1, 3, 61],   descs: ['Partiellement nuageux','Nuageux','Pluie légère','Partiellement nuageux','Ensoleillé','Nuageux','Pluie'] },
  11: { minC: -4,  maxC: 6,   codes: [3, 71, 2, 61, 3, 85, 2],  descs: ['Nuageux','Neige légère','Partiellement nuageux','Pluie','Nuageux','Poudrerie','Partiellement nuageux'] },
  12: { minC: -12, maxC: -2,  codes: [71, 73, 3, 71, 2, 1, 45], descs: ['Neige légère','Neige','Nuageux','Neige','Partiellement nuageux','Ensoleillé','Brouillard'] },
};

function weatherForDate(str) {
  const seed = seedOf(str);
  const month = parseInt(str.slice(5, 7));
  const wm = WEATHER_BY_MONTH[month] || WEATHER_BY_MONTH[4];
  const idx = Math.abs(sri(seed + 7, 0, wm.codes.length - 1));
  const tempC = r2(sr(seed + 3, wm.minC, wm.maxC));
  return { desc: wm.descs[idx] || wm.descs[0], code: wm.codes[idx] || wm.codes[0], tempC };
}

function gasForDate(anchorDate, str) {
  const daysDiff = Math.round((dt(str) - anchorDate) / 86400000);
  const week = Math.floor((daysDiff + 90) / 7);
  return r2(1.52 + sr(week * 17 + 3, -0.10, 0.10));
}

// ─── PRESET DEFINITIONS ─────────────────────────────────────────────────────

export const DEMO_PRESETS = {
  qsr: {
    key: 'qsr',
    name: 'Chez Grilladier',
    desc: 'Restauration rapide · 2 caisses',
    city: 'Laval, QC',
    emoji: '🍔',
    numCaisses: 2,
    salesMin: 1800, salesMax: 3200,
    companyInfo: {
      nom: 'Chez Grilladier Inc.', adresse: '3250 boul. Laval', ville: 'Laval',
      province: 'QC', codePostal: 'H7T 2K3', telephone: '450-555-0142',
      courriel: 'info@chezgrilladier.ca', siteWeb: 'www.chezgrilladier.ca',
      numeroTPS: '456789123 RT0001', numeroTVQ: '4567891230 TQ0001', logo: null,
    },
    cashiers: [
      { id: 'demo-cashier-marie', name: 'Marie Dufour' },
      { id: 'demo-cashier-lucas', name: 'Lucas Bergeron' },
      { id: 'demo-cashier-sofia', name: 'Sofia Tremblay' },
    ],
    employees: [
      { id: 'demo-emp-marie',  name: 'Marie Dufour',   wage: 16.50 },
      { id: 'demo-emp-lucas',  name: 'Lucas Bergeron', wage: 15.75 },
      { id: 'demo-emp-sofia',  name: 'Sofia Tremblay', wage: 16.50 },
      { id: 'demo-emp-pierre', name: 'Pierre Gosselin', wage: 18.00 },
      { id: 'demo-emp-amina',  name: 'Amina Diallo',   wage: 17.00 },
      { id: 'demo-emp-kevin',  name: 'Kevin Lapointe', wage: 17.50 },
    ],
    suppliers: [
      { id: 'demo-sup-1', name: 'Sysco Québec' },
      { id: 'demo-sup-2', name: 'Distribution Alimentaire Laval' },
      { id: 'demo-sup-3', name: 'Coca-Cola Embouteillage' },
      { id: 'demo-sup-4', name: 'Boulangerie Laval' },
      { id: 'demo-sup-5', name: 'Emballages Québec' },
    ],
    supplierRanges: { 'demo-sup-1': [2800,3800], 'demo-sup-2': [1200,1800], 'demo-sup-3': [300,500], 'demo-sup-4': [400,650], 'demo-sup-5': [200,350] },
    platforms: [
      { id: 'doordash', name: 'DoorDash', color: '#ef4444', rate: 0.20 },
      { id: 'ubereats',  name: 'Uber Eats', color: '#22c55e', rate: 0.20 },
      { id: 'skip',      name: 'Skip',      color: '#f59e0b', rate: 0.25 },
    ],
    hasInventory: true,
    hasBreadCheckpoints: true,
    loyer: 4200,
    weatherCoords: { lat: 45.6066, lon: -73.7124, city: 'Laval' },
  },
  bakery: {
    key: 'bakery',
    name: 'Boulangerie Saint-Laurent',
    desc: 'Boulangerie-café artisanale · 1 caisse',
    city: 'Montréal, QC',
    emoji: '🥐',
    numCaisses: 1,
    salesMin: 1200, salesMax: 2400,
    companyInfo: {
      nom: 'Boulangerie Saint-Laurent Inc.', adresse: '4200 boul. Saint-Laurent', ville: 'Montréal',
      province: 'QC', codePostal: 'H2W 1Z5', telephone: '514-555-0237',
      courriel: 'bonjour@boulangeriesaintlaurent.ca', siteWeb: 'www.boulangeriesaintlaurent.ca',
      numeroTPS: '789123456 RT0001', numeroTVQ: '7891234560 TQ0001', logo: null,
    },
    cashiers: [
      { id: 'demo-cashier-amelie', name: 'Amélie Fontaine' },
    ],
    employees: [
      { id: 'demo-emp-jean',   name: 'Jean-Claude Marin', wage: 22.00 },
      { id: 'demo-emp-amelie', name: 'Amélie Fontaine',   wage: 17.50 },
      { id: 'demo-emp-chloe',  name: 'Chloé Beaulieu',   wage: 17.00 },
      { id: 'demo-emp-marc',   name: 'Marc Leblanc',      wage: 18.00 },
    ],
    suppliers: [
      { id: 'demo-sup-1', name: 'Meunerie du Québec' },
      { id: 'demo-sup-2', name: 'Laiterie Chagnon' },
      { id: 'demo-sup-3', name: 'Beurre Paysanne' },
      { id: 'demo-sup-4', name: 'Torréfacteur Mile End' },
      { id: 'demo-sup-5', name: 'Emballages Éco' },
    ],
    supplierRanges: { 'demo-sup-1': [800,1200], 'demo-sup-2': [600,900], 'demo-sup-3': [400,650], 'demo-sup-4': [350,550], 'demo-sup-5': [150,250] },
    platforms: [
      { id: 'ubereats', name: 'Uber Eats', color: '#22c55e', rate: 0.20 },
    ],
    hasInventory: false,
    hasBreadCheckpoints: false,
    loyer: 3200,
    weatherCoords: { lat: 45.5231, lon: -73.5780, city: 'Montréal' },
  },
  retail: {
    key: 'retail',
    name: 'Marché Frais Verdun',
    desc: 'Épicerie indépendante · 2 caisses',
    city: 'Verdun, QC',
    emoji: '🛒',
    numCaisses: 2,
    salesMin: 2500, salesMax: 4500,
    companyInfo: {
      nom: 'Marché Frais Verdun Inc.', adresse: '4500 rue Wellington', ville: 'Verdun',
      province: 'QC', codePostal: 'H4G 1W8', telephone: '514-555-0385',
      courriel: 'info@marchefraiverdun.ca', siteWeb: 'www.marchefraiverdun.ca',
      numeroTPS: '321654987 RT0001', numeroTVQ: '3216549870 TQ0001', logo: null,
    },
    cashiers: [
      { id: 'demo-cashier-nadia', name: 'Nadia Côté' },
      { id: 'demo-cashier-yves',  name: 'Yves Moreau' },
    ],
    employees: [
      { id: 'demo-emp-nadia',   name: 'Nadia Côté',      wage: 17.00 },
      { id: 'demo-emp-yves',    name: 'Yves Moreau',     wage: 17.00 },
      { id: 'demo-emp-hassan',  name: 'Hassan Karim',    wage: 22.00 },
      { id: 'demo-emp-valerie', name: 'Valérie Simard',  wage: 17.50 },
      { id: 'demo-emp-eric',    name: 'Éric Dupont',     wage: 16.50 },
    ],
    suppliers: [
      { id: 'demo-sup-1', name: 'Marché Central Distribution' },
      { id: 'demo-sup-2', name: 'Boucherie Gros Québec' },
      { id: 'demo-sup-3', name: 'Fromagerie du Terroir' },
      { id: 'demo-sup-4', name: 'Fermes Locales Montérégie' },
      { id: 'demo-sup-5', name: 'Pepsi-QC' },
    ],
    supplierRanges: { 'demo-sup-1': [3500,5000], 'demo-sup-2': [1800,2800], 'demo-sup-3': [800,1200], 'demo-sup-4': [600,1000], 'demo-sup-5': [400,650] },
    platforms: [],
    hasInventory: false,
    hasBreadCheckpoints: false,
    loyer: 5500,
    weatherCoords: { lat: 45.4593, lon: -73.5670, city: 'Verdun' },
  },
};

// ─── DAILY DATA BUILDER ──────────────────────────────────────────────────────

const NOTES_POOL = [
  'Camion en retard, reçu à 14h',
  'Inspection santé — tout OK',
  'Nouveau menu lancé',
  'Caisse 2 hors service matin — résolue 11h',
  'Party de bureau 35 pers. commande traiteur',
  'Tempête de neige, fermé à 19h',
  'Fête des mères — rush brunch',
  'Équipement réparé — four remis en service',
  'Formation nouvel employé',
  'Livraison manquante — complétée lendemain',
];

function buildDailyEntry(dateStr, preset, carry, options = {}) {
  const seed = seedOf(dateStr);
  const dow = getDow(dateStr);
  const isWknd = isWeekend(dateStr);
  const { salesMin, salesMax, numCaisses } = preset;
  const { weather, tempC } = weatherForDate(dateStr);
  const isStormy = [71, 73, 85, 95].includes(weatherForDate(dateStr).code);
  const isSunny = [1].includes(weatherForDate(dateStr).code);
  const { desc: weatherDesc, code: weatherCode, tempC: wTemp } = weatherForDate(dateStr);

  // Base sales with day-of-week and weather adjustment
  let baseSale = r2(sr(seed, salesMin, salesMax));
  const dowMult = [0.88, 0.95, 1.00, 1.00, 1.10, 1.18, 1.08][dow] || 1.0;
  if (isStormy) baseSale *= 0.88;
  if (isSunny && wTemp > 15) baseSale *= 1.08;
  if (wTemp < -10) baseSale *= 0.93;
  baseSale = r2(baseSale * dowMult);

  const gross = (s) => r2(s * 1.14975);
  const tps   = (s) => r2(s * 0.05);
  const tvq   = (s) => r2(s * 0.09975);

  // Assign cashiers
  const cashiers = preset.cashiers;
  const c1 = cashiers[0];
  const c2 = cashiers[1] || cashiers[0];
  const isLucasFriday = (c2?.id === 'demo-cashier-lucas' && dow === 5);
  const isBig45Short = options.bigShort === true;

  function makeCaisse(cashierId, sales, varSeed) {
    const grossAmt = gross(sales);
    const interac = r2(grossAmt * sr(varSeed + 1, 0.52, 0.64));
    const cashExpected = r2(grossAmt - interac);
    const float = 200;
    let variance = r2(sr(varSeed + 2, -0.50, 0.50));
    if (cashierId === 'demo-cashier-lucas' && dow === 5) variance = r2(sr(varSeed + 99, -12, -8));
    if (isBig45Short && cashierId === c1.id) variance = -45.00;
    const finalCash = r2(float + cashExpected + variance);
    return { cashierId, posVentes: r2(sales), posTPS: tps(sales), posTVQ: tvq(sales),
      posLivraisons: 0, float, interac, livraisons: 0, deposits: 0, finalCash };
  }

  const caisses = [];
  if (numCaisses === 1) {
    caisses.push(makeCaisse(c1.id, baseSale, seed + 11));
  } else {
    const s1 = r2(baseSale * 0.58), s2 = r2(baseSale * 0.42);
    caisses.push(makeCaisse(c1.id, s1, seed + 11));
    caisses.push(makeCaisse(c2.id, s2, seed + 22));
  }

  // Employees
  const empPool = preset.employees;
  const empCount = isWknd ? sri(seed + 5, Math.min(5, empPool.length), empPool.length)
                          : sri(seed + 5, Math.min(4, empPool.length - 1), empPool.length - 1);
  const shuffled = [...empPool].sort((a, b) => sr(seed + a.id.length) - sr(seed + b.id.length));
  const employees = shuffled.slice(0, empCount).map(e => ({
    name: e.name, hours: r2(sr(seed + e.id.length + 1, 5.5, 8.5)), wage: e.wage,
  }));

  // Inventory (QSR only meaningful)
  let hamEnd = 0, hotEnd = 0, hamReceived = 0, hotReceived = 0;
  let hamB14 = null, hamB17 = null, hamB19 = null, hamB20 = null;
  let hotB14 = null, hotB17 = null, hotB19 = null, hotB20 = null;
  if (preset.hasInventory) {
    const hamStart = carry.ham || 38;
    const hotStart = carry.hot || 18;
    const hamUsed = sri(seed + 31, Math.floor(baseSale / 120), Math.floor(baseSale / 85));
    const hotUsed = sri(seed + 32, Math.floor(baseSale / 240), Math.floor(baseSale / 160));
    hamReceived = (dow === 1 || dow === 3 || dow === 5) ? sri(seed + 33, 30, 50) : 0;
    hotReceived = (dow === 1 || dow === 4) ? sri(seed + 34, 15, 25) : 0;
    hamEnd = Math.max(0, hamStart + hamReceived - hamUsed);
    hotEnd = Math.max(0, hotStart + hotReceived - hotUsed);
    const hamTot = hamStart + hamReceived;
    const hotTot = hotStart + hotReceived;
    hamB14 = Math.max(0, hamTot - sri(seed + 61, 3, 8));
    hamB17 = Math.max(0, hamB14 - sri(seed + 62, 5, 12));
    hamB19 = Math.max(0, hamB17 - sri(seed + 63, 3, 8));
    hamB20 = hamEnd;
    hotB14 = Math.max(0, hotTot - sri(seed + 64, 2, 5));
    hotB17 = Math.max(0, hotB14 - sri(seed + 65, 3, 7));
    hotB19 = Math.max(0, hotB17 - sri(seed + 66, 2, 4));
    hotB20 = hotEnd;
  }

  // Platform livraisons
  const platformLivraisons = {};
  preset.platforms.forEach(p => {
    let ventes = 0;
    if (p.id === 'doordash') ventes = r2(sr(seed + 41, 60, 180));
    else if (p.id === 'ubereats') ventes = r2(sr(seed + 42, 80, 220));
    else if (p.id === 'skip') ventes = sr(seed + 43) > 0.4 ? r2(sr(seed + 44, 20, 70)) : 0;
    platformLivraisons[p.id] = { ventes, depot: r2(ventes * (1 - p.rate)) };
  });

  // Notes (15-20% of days)
  let notes = '';
  if (sr(seed + 77) > 0.82) notes = NOTES_POOL[sri(seed + 78, 0, NOTES_POOL.length - 1)];

  return {
    entry: {
      cashes: caisses,
      employees,
      hamEnd, hamReceived, hamStartOverride: null,
      hotEnd, hotReceived, hotStartOverride: null,
      hamB14, hamB17, hamB19, hamB20,
      hotB14, hotB17, hotB19, hotB20,
      weather: weatherDesc,
      tempC: wTemp,
      gas: 0,
      notes,
      events: '',
      platformLivraisons,
    },
    hamEnd,
    hotEnd,
  };
}

// ─── MONTHLY P&L ─────────────────────────────────────────────────────────────

function buildMonthlyPL(monthStr, preset, isLastMonth = false) {
  const [year, month] = monthStr.split('-').map(Number);
  const seed = year * 100 + month;

  function bills(supId, min, max, count = 2) {
    return Array.from({ length: count }, (_, i) => {
      // Price increase on most recent month for supplier 2
      const priceBoost = (isLastMonth && supId === 'demo-sup-2') ? 1.12 : 1.0;
      const day = String(sri(seed + supId.length + i * 7, 2, 27)).padStart(2, '0');
      return {
        id: `demo-bill-${supId}-${monthStr}-${i}`,
        date: `${monthStr}-${day}`,
        amount: r2(sr(seed + supId.length + i * 13, min, max) * priceBoost),
        note: i === 0 ? 'Commande régulière' : 'Livraison supplémentaire',
      };
    });
  }

  const result = {
    _month: monthStr,
    pettyCashFP_bills: [
      { id: `demo-petty-${monthStr}-1`, date: `${monthStr}-04`, amount: r2(sr(seed + 1, 300, 600)), note: 'Épicerie dépannage' },
      { id: `demo-petty-${monthStr}-2`, date: `${monthStr}-18`, amount: r2(sr(seed + 2, 200, 450)), note: 'Papeterie / nettoyage' },
    ],
    pettyCashFP: 0,
    labourOverride: null,
  };

  preset.suppliers.forEach(sup => {
    const [mn, mx] = preset.supplierRanges[sup.id] || [500, 900];
    result[`sup_${sup.id}_bills`] = bills(sup.id, mn, mx, sri(seed + sup.id.length, 2, 3));
  });

  const expSeed = (k) => seed * 7 + k.length * 3;
  const coldMult = (month <= 2 || month === 12) ? 1.35 : 1.0;
  result.exp_hydro_bills = [{ id: `demo-exp-hydro-${monthStr}`, date: `${monthStr}-15`, amount: r2(sr(expSeed('hydro'), 280, 420) * coldMult), note: '' }];
  result.exp_gazNat_bills = [{ id: `demo-exp-gaznat-${monthStr}`, date: `${monthStr}-15`, amount: r2(sr(expSeed('gaz'), 160, 220) * (coldMult > 1 ? 1.6 : 1.0)), note: '' }];
  result.exp_loyer_bills = [{ id: `demo-exp-loyer-${monthStr}`, date: `${monthStr}-01`, amount: preset.loyer, note: '' }];
  result.exp_assurances_bills = [{ id: `demo-exp-assurances-${monthStr}`, date: `${monthStr}-01`, amount: 190, note: '' }];
  result.exp_telInternet_bills = [{ id: `demo-exp-tel-${monthStr}`, date: `${monthStr}-01`, amount: 98, note: '' }];
  result.exp_csst_bills = [{ id: `demo-exp-csst-${monthStr}`, date: `${monthStr}-15`, amount: r2(sr(expSeed('csst'), 130, 180)), note: '' }];
  if (sr(expSeed('rep') + month) > 0.6) {
    const repAmt = r2(sr(expSeed('rep2'), 180, 480));
    const repNotes = ['Réparation four', 'Plomberie urgente', 'Remplacement filtre HVAC', 'Entretien équipement'];
    result.exp_reparations_bills = [{ id: `demo-exp-rep-${monthStr}`, date: `${monthStr}-${String(sri(expSeed('rep'), 5, 25)).padStart(2,'0')}`, amount: repAmt, note: repNotes[month % repNotes.length] }];
  }

  return result;
}

// ─── ENCAISSE ────────────────────────────────────────────────────────────────

function buildEncaisseData(dates, dailyData) {
  const encaisse = {};
  let runningBalance = r2(sr(seedOf(dates[0]), 1200, 2200));

  const SORTIE_CATS = [
    { id: 'fournisseur_cash', label: 'Paiement fournisseur' },
    { id: 'reparation', label: 'Réparation / entretien' },
    { id: 'fournitures', label: 'Fournitures bureau' },
    { id: 'depannage', label: 'Dépannage épicerie' },
    { id: 'autre', label: 'Autre' },
  ];

  const SORTIE_LABELS = SORTIE_CATS.map(c => c.label);

  for (const d of dates) {
    const seed = seedOf(d);
    const dow = getDow(d);
    const entry = dailyData[d];
    let cashFromCaisses = 0;
    if (entry?.cashes) entry.cashes.forEach(c => { cashFromCaisses += (c.finalCash - c.float); });
    cashFromCaisses = r2(cashFromCaisses);

    // Skip deposit occasionally (weekends ~30%, random ~12%)
    const skipDeposit = (dow === 0 && sr(seed + 55) > 0.5) || (dow === 6 && sr(seed + 57) > 0.65) || sr(seed + 56) > 0.88;
    // Deposit = 70-95% of the cash that came in — keeps balance realistic and positive
    const depositAmt = skipDeposit ? 0 : r2(cashFromCaisses * sr(seed + 77, 0.70, 0.95));

    // Cash outs 2-3x per week
    const hasSortie = sr(seed + 88) > 0.65;
    const sortieAmt = hasSortie ? r2(sr(seed + 89, 80, 320)) : 0;
    const sortieCat = SORTIE_CATS[sri(seed + 90, 0, SORTIE_CATS.length - 1)];

    runningBalance = r2(runningBalance + cashFromCaisses - depositAmt - sortieAmt);

    // Physical count: close to balance, within $5-20, filled 82% of days
    const hasCount = sr(seed + 92) > 0.18;
    const countVariance = r2(sr(seed + 93, -18, 18));

    encaisse[d] = {
      openingOverride: null,
      autreEntrees: [],
      deposits: skipDeposit ? [] : [{ id: `demo-dep-${d}`, montant: depositAmt, note: 'Dépôt quotidien', slip: '' }],
      sorties: hasSortie ? [{ id: `demo-sortie-${d}`, categorie: sortieCat.id, description: sortieCat.label, montant: sortieAmt }] : [],
      physicalCount: hasCount
        ? { tills: r2(runningBalance * 0.3 + countVariance), petty: r2(runningBalance * 0.1), office: r2(runningBalance * 0.6) }
        : { tills: null, petty: null, office: null },
    };
  }

  return { data: encaisse, config: { sortieCats: SORTIE_CATS, cashLocations: [
    { id: 'tills', label: 'Caisses' }, { id: 'petty', label: 'Petite caisse' }, { id: 'office', label: 'Bureau' },
  ] } };
}

// ─── FACTURATION ─────────────────────────────────────────────────────────────

function buildFacturation(preset, today) {
  const d = (n) => fmtDate(addD(today, n));
  const uid2 = (p) => `${p}-${Math.random().toString(36).slice(2, 9)}`;

  function ligne(desc, qty, prix) {
    return { id: uid2('lig'), description: desc, quantite: qty, prixUnitaire: prix, remise: 0, tps: true, tvq: true };
  }
  function paiement(date, montant, mode = 'Virement', ref = '') {
    return { id: uid2('pay'), date, numero: `P-${Date.now().toString().slice(-5)}`, montant, mode, reference: ref, note: '' };
  }

  // QSR: Catering to offices/schools
  if (preset.key === 'qsr') {
    const cats = [
      { id: 'demo-cat-traiteur', nom: 'Traiteur & Événements', compteRevenu: '4100', actif: true },
      { id: 'demo-cat-corp', nom: 'Commandes corporatives', compteRevenu: '4200', actif: true },
      { id: 'demo-cat-scolaire', nom: 'Services scolaires', compteRevenu: '4300', actif: true },
    ];
    const prods = [
      { id: 'demo-prod-1', code: 'TRA-001', description: 'Plateau burger (par personne)', categorieId: 'demo-cat-traiteur', prixUnitaire: 22.00, uniteMesure: 'pers.', tps: true, tvq: true, actif: true },
      { id: 'demo-prod-2', code: 'TRA-002', description: 'Combo repas complet', categorieId: 'demo-cat-traiteur', prixUnitaire: 16.50, uniteMesure: 'repas', tps: true, tvq: true, actif: true },
      { id: 'demo-prod-3', code: 'CORP-001', description: 'Lunch corporatif livré (min. 20 pers.)', categorieId: 'demo-cat-corp', prixUnitaire: 18.75, uniteMesure: 'pers.', tps: true, tvq: true, actif: true },
      { id: 'demo-prod-4', code: 'SCO-001', description: 'Menu scolaire (par élève)', categorieId: 'demo-cat-scolaire', prixUnitaire: 9.25, uniteMesure: 'pers.', tps: true, tvq: true, actif: true },
      { id: 'demo-prod-5', code: 'TRA-003', description: 'Plateau desserts assortis', categorieId: 'demo-cat-traiteur', prixUnitaire: 45.00, uniteMesure: 'plateau', tps: true, tvq: true, actif: true },
    ];
    const clients = [
      { id: 'demo-cli-1', code: 'CLI-001', entreprise: 'Bureau Comptable Tremblay & Fils', contact: 'Jean-François Tremblay', adresse: '245 boul. des Laurentides', ville: 'Laval', province: 'QC', codePostal: 'H7G 2T4', tel1: '450-555-0101', courriel: 'jf@tremblayfils.ca', conditionsPaiement: 'Net 30', statut: 'actif' },
      { id: 'demo-cli-2', code: 'CLI-002', entreprise: 'École Primaire Saint-Joseph', contact: 'Directrice Morin', adresse: '1800 av. des Érables', ville: 'Laval', province: 'QC', codePostal: 'H7L 3K8', tel1: '450-555-0202', courriel: 'direction@stjosephlvl.qc.ca', conditionsPaiement: 'Net 45', statut: 'actif' },
      { id: 'demo-cli-3', code: 'CLI-003', entreprise: 'Centre Sportif Laval', contact: 'Marc Beauchamp', adresse: '900 boul. Industriel', ville: 'Laval', province: 'QC', codePostal: 'H7S 1P2', tel1: '450-555-0303', courriel: 'marc@centresportiflaval.ca', conditionsPaiement: 'Net 30', statut: 'actif' },
      { id: 'demo-cli-4', code: 'CLI-004', entreprise: 'Clinique Médicale Laval', contact: 'Isabelle Côté', adresse: '3840 boul. Saint-Martin O', ville: 'Laval', province: 'QC', codePostal: 'H7T 1C1', tel1: '450-555-0404', courriel: 'icote@cliniquelaval.ca', conditionsPaiement: 'Net 30', statut: 'actif' },
      { id: 'demo-cli-5', code: 'CLI-005', entreprise: 'Garderie Les Petits Anges', contact: 'Sophie Lavoie', adresse: '555 rue des Pins', ville: 'Laval', province: 'QC', codePostal: 'H7R 2N4', tel1: '450-555-0505', courriel: 'sophie@lespetitsanges.ca', conditionsPaiement: 'Net 30', statut: 'actif' },
      { id: 'demo-cli-6', code: 'CLI-006', entreprise: 'Pharmabec Inc.', contact: 'Antoine Bouchard', adresse: '1000 boul. Curé-Labelle', ville: 'Laval', province: 'QC', codePostal: 'H7V 2V8', tel1: '450-555-0606', courriel: 'abouchard@pharmabec.ca', conditionsPaiement: 'Net 30', statut: 'actif' },
    ];
    const soumissions = [
      { id: 'demo-som-1', numero: 'S-0001', date: d(-6), dateEcheance: d(24), clientId: 'demo-cli-3',
        statut: 'Envoyée', lignes: [ligne('Plateau burger — Tournoi hockey 85 pers.', 85, 22.00), ligne('Plateau desserts', 4, 45.00)], notes: 'Tournoi régional mars', paiements: [], acomptes: [] },
      { id: 'demo-som-2', numero: 'S-0002', date: d(-13), dateEcheance: d(17), clientId: 'demo-cli-1',
        statut: 'Envoyée', lignes: [ligne('Lunch corporatif — Formation Q2 (30 pers.)', 30, 18.75)], notes: 'Formation trimestrielle', paiements: [], acomptes: [] },
    ];
    const commandes = [
      { id: 'demo-cmd-1', numero: 'C-0001', date: d(-22), dateEcheance: d(8), clientId: 'demo-cli-2', soumissionId: null,
        statut: 'Confirmée', depositAmount: 500, depositDate: d(-20),
        lignes: [ligne('Menu scolaire — Avril (180 élèves × 20 jours)', 3600, 9.25)], notes: 'Contrat mensuel — avril', paiements: [], acomptes: [] },
    ];
    const factures = [
      { id: 'demo-fac-1', numero: 'F-0001', date: d(-75), dateEcheance: d(-45), clientId: 'demo-cli-4', statut: 'Payée',
        lignes: [ligne('Plateau burger — Fête personnel (40 pers.)', 40, 22.00), ligne('Combo repas', 5, 16.50)], notes: 'Fête fin d\'année',
        paiements: [paiement(d(-42), 1106.35, 'Chèque', 'CHQ-4421')], acomptes: [] },
      { id: 'demo-fac-2', numero: 'F-0002', date: d(-68), dateEcheance: d(-38), clientId: 'demo-cli-2', statut: 'Payée',
        lignes: [ligne('Menu scolaire — Janv. (180 élèves × 20j)', 3600, 9.25)], notes: 'Janvier',
        paiements: [paiement(d(-35), 38151.00, 'Virement', 'VIR-B1-JAN')], acomptes: [] },
      { id: 'demo-fac-3', numero: 'F-0003', date: d(-55), dateEcheance: d(-25), clientId: 'demo-cli-1', statut: 'Payée',
        lignes: [ligne('Lunch corporatif — Formation Q1 (25 pers.)', 25, 18.75)], notes: '',
        paiements: [paiement(d(-22), 537.50, 'Virement', 'VIR-TRB-01')], acomptes: [] },
      { id: 'demo-fac-4', numero: 'F-0004', date: d(-48), dateEcheance: d(-18), clientId: 'demo-cli-3', statut: 'Envoyée',
        lignes: [ligne('Plateau burger — Gala sportif 60 pers.', 60, 22.00), ligne('Plateau desserts', 3, 45.00)], notes: 'OVERDUE — relance envoyée',
        paiements: [], acomptes: [] },
      { id: 'demo-fac-5', numero: 'F-0005', date: d(-35), dateEcheance: d(-5), clientId: 'demo-cli-6', statut: 'Envoyée',
        lignes: [ligne('Plateau burger — Réunion annuelle (50 pers.)', 50, 22.00)], notes: '',
        paiements: [], acomptes: [] },
      { id: 'demo-fac-6', numero: 'F-0006', date: d(-30), dateEcheance: d(0), clientId: 'demo-cli-5', statut: 'Partielle',
        lignes: [ligne('Menu scolaire — Mars (95 élèves × 20j)', 1900, 9.25)], notes: '',
        paiements: [paiement(d(-15), 8000.00, 'Virement', 'VIR-PAG-MAR')], acomptes: [] },
      { id: 'demo-fac-7', numero: 'F-0007', date: d(-20), dateEcheance: d(10), clientId: 'demo-cli-1', statut: 'Envoyée',
        lignes: [ligne('Lunch corporatif — Séance conseil (35 pers.)', 35, 18.75), ligne('Combo repas VIP', 8, 16.50)], notes: '',
        paiements: [], acomptes: [] },
      { id: 'demo-fac-8', numero: 'F-0008', date: d(-12), dateEcheance: d(18), clientId: 'demo-cli-4', statut: 'Envoyée',
        lignes: [ligne('Plateau burger — Journée formation (55 pers.)', 55, 22.00), ligne('Plateau desserts', 2, 45.00)], notes: '',
        paiements: [], acomptes: [] },
      { id: 'demo-fac-9', numero: 'F-0009', date: d(-8), dateEcheance: d(22), clientId: 'demo-cli-3', statut: 'Envoyée',
        lignes: [ligne('Plateau burger — Tournoi Q2 (70 pers.)', 70, 22.00)], notes: '',
        paiements: [], acomptes: [] },
      { id: 'demo-fac-10', numero: 'F-0010', date: d(-5), dateEcheance: d(25), clientId: 'demo-cli-2', statut: 'Envoyée',
        lignes: [ligne('Menu scolaire — Avril (180 élèves × 20j)', 3600, 9.25)], notes: 'Avril',
        paiements: [], acomptes: [] },
      { id: 'demo-fac-11', numero: 'F-0011', date: d(-3), dateEcheance: d(27), clientId: 'demo-cli-6', statut: 'Envoyée',
        lignes: [ligne('Lunch corporatif (28 pers.)', 28, 18.75)], notes: '',
        paiements: [], acomptes: [] },
    ];
    const creditNotes = [
      { id: 'demo-nc-1', numero: 'NC-0001', date: d(-40), clientId: 'demo-cli-3', factureNumero: 'F-0004', facId: 'demo-fac-4', statut: 'Envoyée',
        lignes: [ligne('Annulation 5 pers. — événement réduit', 5, 22.00)], notes: 'Ajustement nb participants', paiements: [] },
      { id: 'demo-nc-2', numero: 'NC-0002', date: d(-28), clientId: 'demo-cli-6', factureNumero: 'F-0005', facId: 'demo-fac-5', statut: 'Envoyée',
        lignes: [ligne('Escompte fidélité 5%', 1, -55.00)], notes: 'Rabais client régulier', paiements: [] },
      { id: 'demo-nc-3', numero: 'NC-0003', date: d(-10), clientId: 'demo-cli-5', factureNumero: 'F-0006', facId: 'demo-fac-6', statut: 'Envoyée',
        lignes: [ligne('Correction facturation — 10 absences', 10, 9.25)], notes: 'Absences confirmées par direction', paiements: [] },
    ];
    const docNums = { soumission: 2, commande: 1, facture: 11, creditNote: 3, encaissement: 6 };
    return { cats, prods, clients, soumissions, commandes, factures, creditNotes, docNums, companyInfo: preset.companyInfo };
  }

  // BAKERY: Wholesale to restaurants/hotels
  if (preset.key === 'bakery') {
    const cats = [
      { id: 'demo-cat-gross', nom: 'Vente en gros', compteRevenu: '4100', actif: true },
      { id: 'demo-cat-event', nom: 'Commandes événements', compteRevenu: '4200', actif: true },
      { id: 'demo-cat-abonnement', nom: 'Abonnement hebdomadaire', compteRevenu: '4300', actif: true },
    ];
    const prods = [
      { id: 'demo-prod-1', code: 'GROS-001', description: 'Croissants (bte 12)', categorieId: 'demo-cat-gross', prixUnitaire: 18.00, uniteMesure: 'boîte', tps: true, tvq: true, actif: true },
      { id: 'demo-prod-2', code: 'GROS-002', description: 'Pain au chocolat (bte 12)', categorieId: 'demo-cat-gross', prixUnitaire: 22.00, uniteMesure: 'boîte', tps: true, tvq: true, actif: true },
      { id: 'demo-prod-3', code: 'GROS-003', description: 'Baguettes tradition (lot 6)', categorieId: 'demo-cat-gross', prixUnitaire: 14.00, uniteMesure: 'lot', tps: true, tvq: true, actif: true },
      { id: 'demo-prod-4', code: 'EVT-001', description: 'Plateau viennoiseries événement (24 pcs)', categorieId: 'demo-cat-event', prixUnitaire: 55.00, uniteMesure: 'plateau', tps: true, tvq: true, actif: true },
      { id: 'demo-prod-5', code: 'ABO-001', description: 'Abonnement hebdomadaire café', categorieId: 'demo-cat-abonnement', prixUnitaire: 120.00, uniteMesure: 'semaine', tps: true, tvq: true, actif: true },
    ];
    const clients = [
      { id: 'demo-cli-1', code: 'CLI-001', entreprise: 'Hôtel Le Plateau', contact: 'Nathalie Roy', adresse: '3700 boul. Saint-Laurent', ville: 'Montréal', province: 'QC', codePostal: 'H2X 2V5', tel1: '514-555-0101', courriel: 'nroy@hotelplateau.ca', conditionsPaiement: 'Net 15', statut: 'actif' },
      { id: 'demo-cli-2', code: 'CLI-002', entreprise: 'Bistro Le Comptoir', contact: 'Patrick Girard', adresse: '5400 rue Fairmount', ville: 'Montréal', province: 'QC', codePostal: 'H2V 1W2', tel1: '514-555-0202', courriel: 'pgirard@bistrolecomptoir.ca', conditionsPaiement: 'Net 30', statut: 'actif' },
      { id: 'demo-cli-3', code: 'CLI-003', entreprise: 'Café Bureau Mile End', contact: 'Julia Chen', adresse: '5765 boul. Saint-Laurent', ville: 'Montréal', province: 'QC', codePostal: 'H2T 1T3', tel1: '514-555-0303', courriel: 'jchen@cafebureaumileend.ca', conditionsPaiement: 'Net 30', statut: 'actif' },
      { id: 'demo-cli-4', code: 'CLI-004', entreprise: 'Traiteur Fête Express', contact: 'Michel Ouellet', adresse: '1230 rue Ontario E', ville: 'Montréal', province: 'QC', codePostal: 'H2L 1P7', tel1: '514-555-0404', courriel: 'mouellet@feteexpress.ca', conditionsPaiement: 'Net 30', statut: 'actif' },
      { id: 'demo-cli-5', code: 'CLI-005', entreprise: 'Résidence Les Érables', contact: 'Lucie Paquin', adresse: '222 av. Duluth E', ville: 'Montréal', province: 'QC', codePostal: 'H2W 1G9', tel1: '514-555-0505', courriel: 'lpaquin@residenceerabales.ca', conditionsPaiement: 'Net 30', statut: 'actif' },
    ];
    const soumissions = [
      { id: 'demo-som-1', numero: 'S-0001', date: d(-4), dateEcheance: d(26), clientId: 'demo-cli-4', statut: 'Envoyée',
        lignes: [ligne('Plateau viennoiseries événement', 8, 55.00), ligne('Croissants (bte 12)', 5, 18.00)], notes: 'Mariage — 200 personnes', paiements: [], acomptes: [] },
      { id: 'demo-som-2', numero: 'S-0002', date: d(-11), dateEcheance: d(19), clientId: 'demo-cli-1', statut: 'Envoyée',
        lignes: [ligne('Croissants (bte 12)', 15, 18.00), ligne('Pain au chocolat (bte 12)', 10, 22.00)], notes: 'Contrat service chambre mensuel', paiements: [], acomptes: [] },
    ];
    const commandes = [
      { id: 'demo-cmd-1', numero: 'C-0001', date: d(-18), dateEcheance: d(12), clientId: 'demo-cli-3', soumissionId: null,
        statut: 'Confirmée', depositAmount: 0, depositDate: null,
        lignes: [ligne('Abonnement hebdomadaire café × 4 semaines', 4, 120.00)], notes: 'Abonnement mensuel — livraison lundi', paiements: [], acomptes: [] },
    ];
    const factures = [
      { id: 'demo-fac-1', numero: 'F-0001', date: d(-72), dateEcheance: d(-42), clientId: 'demo-cli-1', statut: 'Payée',
        lignes: [ligne('Croissants (bte 12)', 20, 18.00), ligne('Pain au chocolat (bte 12)', 12, 22.00), ligne('Baguettes (lot 6)', 10, 14.00)], notes: 'Livraison hebdomadaire × 4',
        paiements: [paiement(d(-38), 799.54, 'Virement', 'VIR-HPL-01')], acomptes: [] },
      { id: 'demo-fac-2', numero: 'F-0002', date: d(-58), dateEcheance: d(-28), clientId: 'demo-cli-2', statut: 'Payée',
        lignes: [ligne('Croissants (bte 12)', 16, 18.00), ligne('Baguettes (lot 6)', 20, 14.00)], notes: '',
        paiements: [paiement(d(-24), 567.74, 'Virement', 'VIR-CTR-01')], acomptes: [] },
      { id: 'demo-fac-3', numero: 'F-0003', date: d(-44), dateEcheance: d(-14), clientId: 'demo-cli-5', statut: 'Envoyée',
        lignes: [ligne('Croissants (bte 12)', 8, 18.00), ligne('Pain au chocolat (bte 12)', 6, 22.00)], notes: 'OVERDUE',
        paiements: [], acomptes: [] },
      { id: 'demo-fac-4', numero: 'F-0004', date: d(-35), dateEcheance: d(-5), clientId: 'demo-cli-1', statut: 'Partielle',
        lignes: [ligne('Croissants (bte 12)', 22, 18.00), ligne('Pain au chocolat (bte 12)', 14, 22.00), ligne('Baguettes (lot 6)', 8, 14.00)], notes: '',
        paiements: [paiement(d(-10), 400.00, 'Chèque', 'CHQ-5520')], acomptes: [] },
      { id: 'demo-fac-5', numero: 'F-0005', date: d(-22), dateEcheance: d(8), clientId: 'demo-cli-2', statut: 'Envoyée',
        lignes: [ligne('Croissants (bte 12)', 16, 18.00), ligne('Baguettes (lot 6)', 18, 14.00)], notes: '',
        paiements: [], acomptes: [] },
      { id: 'demo-fac-6', numero: 'F-0006', date: d(-15), dateEcheance: d(15), clientId: 'demo-cli-3', statut: 'Envoyée',
        lignes: [ligne('Abonnement hebdomadaire café × 4', 4, 120.00)], notes: '',
        paiements: [], acomptes: [] },
      { id: 'demo-fac-7', numero: 'F-0007', date: d(-7), dateEcheance: d(23), clientId: 'demo-cli-4', statut: 'Envoyée',
        lignes: [ligne('Plateau viennoiseries événement', 6, 55.00)], notes: 'Événement corporatif',
        paiements: [], acomptes: [] },
      { id: 'demo-fac-8', numero: 'F-0008', date: d(-3), dateEcheance: d(27), clientId: 'demo-cli-1', statut: 'Envoyée',
        lignes: [ligne('Croissants (bte 12)', 24, 18.00), ligne('Pain au chocolat (bte 12)', 16, 22.00)], notes: '',
        paiements: [], acomptes: [] },
    ];
    const creditNotes = [
      { id: 'demo-nc-1', numero: 'NC-0001', date: d(-30), clientId: 'demo-cli-5', factureNumero: 'F-0003', facId: 'demo-fac-3', statut: 'Envoyée',
        lignes: [ligne('Retour — produits non conformes (2 boîtes)', 2, 18.00)], notes: 'Croissants reçus abîmés', paiements: [] },
      { id: 'demo-nc-2', numero: 'NC-0002', date: d(-18), clientId: 'demo-cli-2', factureNumero: 'F-0002', facId: 'demo-fac-2', statut: 'Envoyée',
        lignes: [ligne('Correction quantité — 2 lots baguettes manquants', 2, 14.00)], notes: 'Livraison incomplète confirmée', paiements: [] },
    ];
    const docNums = { soumission: 2, commande: 1, facture: 8, creditNote: 2, encaissement: 5 };
    return { cats, prods, clients, soumissions, commandes, factures, creditNotes, docNums, companyInfo: preset.companyInfo };
  }

  // RETAIL: Wholesale/office catering
  const cats = [
    { id: 'demo-cat-gross', nom: 'Vente en gros', compteRevenu: '4100', actif: true },
    { id: 'demo-cat-traiteur', nom: 'Plateaux & traiteur', compteRevenu: '4200', actif: true },
    { id: 'demo-cat-abonnement', nom: 'Abonnements bureaux', compteRevenu: '4300', actif: true },
  ];
  const prods = [
    { id: 'demo-prod-1', code: 'GR-001', description: 'Plateau fromages artisanaux (500g)', categorieId: 'demo-cat-traiteur', prixUnitaire: 38.00, uniteMesure: 'plateau', tps: true, tvq: true, actif: true },
    { id: 'demo-prod-2', code: 'GR-002', description: 'Plateau charcuterie (500g)', categorieId: 'demo-cat-traiteur', prixUnitaire: 42.00, uniteMesure: 'plateau', tps: true, tvq: true, actif: true },
    { id: 'demo-prod-3', code: 'GR-003', description: 'Commande épicerie bureau (hebdo)', categorieId: 'demo-cat-abonnement', prixUnitaire: 185.00, uniteMesure: 'semaine', tps: true, tvq: true, actif: true },
    { id: 'demo-prod-4', code: 'GR-004', description: 'Plateau repas préparés (6 portions)', categorieId: 'demo-cat-gross', prixUnitaire: 58.00, uniteMesure: 'plateau', tps: true, tvq: true, actif: true },
  ];
  const clients = [
    { id: 'demo-cli-1', code: 'CLI-001', entreprise: 'Agence Créative Verdun', contact: 'Diane Lefebvre', adresse: '4875 rue Wellington', ville: 'Verdun', province: 'QC', codePostal: 'H4G 1X4', tel1: '514-555-0101', courriel: 'dlefebvre@agencecreative.ca', conditionsPaiement: 'Net 30', statut: 'actif' },
    { id: 'demo-cli-2', code: 'CLI-002', entreprise: 'CIUSSS du Sud-Ouest', contact: 'Réjean Morin', adresse: '5600 av. Verdun', ville: 'Verdun', province: 'QC', codePostal: 'H4H 1M3', tel1: '514-555-0202', courriel: 'rmorin@ciussso.qc.ca', conditionsPaiement: 'Net 45', statut: 'actif' },
    { id: 'demo-cli-3', code: 'CLI-003', entreprise: 'Studio Photo Nadeau', contact: 'Caroline Nadeau', adresse: '3311 boul. LaSalle', ville: 'Verdun', province: 'QC', codePostal: 'H4G 2A2', tel1: '514-555-0303', courriel: 'cnadeau@studiophoton.ca', conditionsPaiement: 'Net 30', statut: 'actif' },
    { id: 'demo-cli-4', code: 'CLI-004', entreprise: 'Clinique Verdun Santé', contact: 'Dr. Paul Vézina', adresse: '3700 rue Wellington', ville: 'Verdun', province: 'QC', codePostal: 'H4G 1V3', tel1: '514-555-0404', courriel: 'pvezina@cliniqueverdunsante.ca', conditionsPaiement: 'Net 30', statut: 'actif' },
  ];
  const soumissions = [
    { id: 'demo-som-1', numero: 'S-0001', date: d(-5), dateEcheance: d(25), clientId: 'demo-cli-1', statut: 'Envoyée',
      lignes: [ligne('Plateau fromages × 4', 4, 38.00), ligne('Plateau charcuterie × 4', 4, 42.00)], notes: 'Soirée lancement produit', paiements: [], acomptes: [] },
    { id: 'demo-som-2', numero: 'S-0002', date: d(-10), dateEcheance: d(20), clientId: 'demo-cli-2', statut: 'Envoyée',
      lignes: [ligne('Commande épicerie bureau × 4 semaines', 4, 185.00)], notes: 'Contrat service alimentaire mensuel', paiements: [], acomptes: [] },
  ];
  const commandes = [
    { id: 'demo-cmd-1', numero: 'C-0001', date: d(-20), dateEcheance: d(10), clientId: 'demo-cli-3', soumissionId: null,
      statut: 'Confirmée', depositAmount: 0, depositDate: null,
      lignes: [ligne('Commande épicerie bureau × 4 semaines', 4, 185.00)], notes: 'Livraison vendredi matin', paiements: [], acomptes: [] },
  ];
  const factures = [
    { id: 'demo-fac-1', numero: 'F-0001', date: d(-70), dateEcheance: d(-40), clientId: 'demo-cli-4', statut: 'Payée',
      lignes: [ligne('Plateau repas préparés × 8', 8, 58.00)], notes: '', paiements: [paiement(d(-36), 529.37, 'Virement', 'VIR-CLV-01')], acomptes: [] },
    { id: 'demo-fac-2', numero: 'F-0002', date: d(-55), dateEcheance: d(-25), clientId: 'demo-cli-2', statut: 'Payée',
      lignes: [ligne('Commande épicerie bureau × 4 semaines', 4, 185.00)], notes: '', paiements: [paiement(d(-20), 840.99, 'Virement', 'VIR-CIU-01')], acomptes: [] },
    { id: 'demo-fac-3', numero: 'F-0003', date: d(-42), dateEcheance: d(-12), clientId: 'demo-cli-1', statut: 'Envoyée',
      lignes: [ligne('Plateau fromages × 6', 6, 38.00), ligne('Plateau charcuterie × 6', 6, 42.00)], notes: 'OVERDUE', paiements: [], acomptes: [] },
    { id: 'demo-fac-4', numero: 'F-0004', date: d(-30), dateEcheance: d(0), clientId: 'demo-cli-2', statut: 'Partielle',
      lignes: [ligne('Commande épicerie bureau × 4', 4, 185.00)], notes: '', paiements: [paiement(d(-12), 400.00, 'Chèque', 'CHQ-6610')], acomptes: [] },
    { id: 'demo-fac-5', numero: 'F-0005', date: d(-18), dateEcheance: d(12), clientId: 'demo-cli-4', statut: 'Envoyée',
      lignes: [ligne('Plateau repas préparés × 10', 10, 58.00)], notes: '', paiements: [], acomptes: [] },
    { id: 'demo-fac-6', numero: 'F-0006', date: d(-8), dateEcheance: d(22), clientId: 'demo-cli-3', statut: 'Envoyée',
      lignes: [ligne('Commande épicerie bureau × 4', 4, 185.00)], notes: '', paiements: [], acomptes: [] },
  ];
  const creditNotes = [
    { id: 'demo-nc-1', numero: 'NC-0001', date: d(-35), clientId: 'demo-cli-1', factureNumero: 'F-0003', facId: 'demo-fac-3', statut: 'Envoyée',
      lignes: [ligne('Produit endommagé — retour', 1, 38.00)], notes: 'Plateau fromages reçu non conforme', paiements: [] },
    { id: 'demo-nc-2', numero: 'NC-0002', date: d(-20), clientId: 'demo-cli-2', factureNumero: 'F-0004', facId: 'demo-fac-4', statut: 'Envoyée',
      lignes: [ligne('Escompte fidélité 3%', 1, -22.20)], notes: 'Rabais client institutionnel', paiements: [] },
  ];
  const docNums = { soumission: 2, commande: 1, facture: 6, creditNote: 2, encaissement: 4 };
  return { cats, prods, clients, soumissions, commandes, factures, creditNotes, docNums, companyInfo: preset.companyInfo };
}

// ─── PRÉVISIONS PRODUCTS ──────────────────────────────────────────────────────

function getPrevProducts(preset) {
  if (preset.key === 'qsr') return [
    { id: 'demo-prev-smashburger',  name: 'Smash Burger',       category: 'Burgers',     base_quantity: 85,  shelf_life_days: 1, weather_sensitivity: 0, unit_cost: 4.20, sell_price: 13.95 },
    { id: 'demo-prev-combo',        name: 'Combo Repas',         category: 'Burgers',     base_quantity: 60,  shelf_life_days: 1, weather_sensitivity: 0, unit_cost: 5.80, sell_price: 16.50 },
    { id: 'demo-prev-poutine',      name: 'Poutine classique',   category: 'Accompagnements', base_quantity: 70, shelf_life_days: 1, weather_sensitivity: 1, unit_cost: 2.10, sell_price: 8.50 },
    { id: 'demo-prev-frites',       name: 'Frites régulières',   category: 'Accompagnements', base_quantity: 120, shelf_life_days: 1, weather_sensitivity: 0, unit_cost: 0.60, sell_price: 4.50 },
    { id: 'demo-prev-wrappoulet',   name: 'Wrap poulet croustillant', category: 'Poulet', base_quantity: 45, shelf_life_days: 1, weather_sensitivity: 0, unit_cost: 3.40, sell_price: 11.95 },
    { id: 'demo-prev-milkshake',    name: 'Milkshake',           category: 'Boissons',    base_quantity: 30,  shelf_life_days: 1, weather_sensitivity: 2, unit_cost: 1.20, sell_price: 6.50 },
    { id: 'demo-prev-softdrink',    name: 'Boisson gazeuse',     category: 'Boissons',    base_quantity: 95,  shelf_life_days: 30, weather_sensitivity: 0, unit_cost: 0.35, sell_price: 2.75 },
    { id: 'demo-prev-sauce',        name: 'Sauce piquante maison', category: 'Extras',   base_quantity: 40,  shelf_life_days: 7, weather_sensitivity: 0, unit_cost: 0.20, sell_price: 1.50 },
  ];
  if (preset.key === 'bakery') return [
    { id: 'demo-prev-croissant',    name: 'Croissant',           category: 'Viennoiseries', base_quantity: 65, shelf_life_days: 1, weather_sensitivity: 0, unit_cost: 0.80, sell_price: 3.75 },
    { id: 'demo-prev-painchoco',    name: 'Pain au chocolat',    category: 'Viennoiseries', base_quantity: 48, shelf_life_days: 1, weather_sensitivity: 0, unit_cost: 0.95, sell_price: 4.25 },
    { id: 'demo-prev-baguette',     name: 'Baguette tradition',  category: 'Pains',         base_quantity: 32, shelf_life_days: 1, weather_sensitivity: 0, unit_cost: 0.55, sell_price: 3.50 },
    { id: 'demo-prev-tartefruits',  name: 'Tarte aux fruits',    category: 'Pâtisseries',   base_quantity: 12, shelf_life_days: 2, weather_sensitivity: 0, unit_cost: 3.20, sell_price: 9.50 },
    { id: 'demo-prev-cafelatte',    name: 'Café latte',          category: 'Boissons chaudes', base_quantity: 55, shelf_life_days: 1, weather_sensitivity: 1, unit_cost: 0.65, sell_price: 5.50 },
    { id: 'demo-prev-espresso',     name: 'Espresso',            category: 'Boissons chaudes', base_quantity: 40, shelf_life_days: 1, weather_sensitivity: 1, unit_cost: 0.40, sell_price: 3.25 },
    { id: 'demo-prev-cafeglace',    name: 'Café glacé',          category: 'Boissons froides', base_quantity: 20, shelf_life_days: 1, weather_sensitivity: 2, unit_cost: 0.75, sell_price: 6.25 },
    { id: 'demo-prev-sandwichmidi', name: 'Sandwich midi',       category: 'Salé',            base_quantity: 28, shelf_life_days: 1, weather_sensitivity: 0, unit_cost: 2.40, sell_price: 8.50 },
  ];
  // retail
  return [
    { id: 'demo-prev-pouletrotiss', name: 'Poulet rôtisserie',   category: 'Plats préparés', base_quantity: 18, shelf_life_days: 2, weather_sensitivity: 0, unit_cost: 6.50, sell_price: 14.99 },
    { id: 'demo-prev-sandwich',     name: 'Sandwich maison',     category: 'Plats préparés', base_quantity: 22, shelf_life_days: 1, weather_sensitivity: 0, unit_cost: 3.20, sell_price: 8.75 },
    { id: 'demo-prev-soupe',        name: 'Soupe du jour (L)',   category: 'Plats préparés', base_quantity: 25, shelf_life_days: 1, weather_sensitivity: 1, unit_cost: 1.80, sell_price: 6.50 },
    { id: 'demo-prev-salade',       name: 'Salade composée',     category: 'Plats préparés', base_quantity: 15, shelf_life_days: 1, weather_sensitivity: 0, unit_cost: 2.50, sell_price: 9.25 },
    { id: 'demo-prev-jufrais',      name: 'Jus pressé maison',   category: 'Boissons',       base_quantity: 20, shelf_life_days: 2, weather_sensitivity: 2, unit_cost: 1.20, sell_price: 5.50 },
    { id: 'demo-prev-fromage',      name: 'Plateau fromages 200g', category: 'Épicerie fine', base_quantity: 12, shelf_life_days: 7, weather_sensitivity: 0, unit_cost: 5.80, sell_price: 12.99 },
  ];
}

// ─── PRÉVISIONS SALES ────────────────────────────────────────────────────────

function prevSalesForDate(dateStr, product, preset) {
  const seed = seedOf(dateStr) + product.id.length * 7;
  const dow = getDow(dateStr);
  const month = parseInt(dateStr.slice(5, 7));
  const isWknd = isWeekend(dateStr);
  const { tempC, code } = weatherForDate(dateStr);
  const isStormy = [71, 73, 85, 95].includes(code);

  let base = product.base_quantity;

  // Day-of-week patterns
  const dowMult = {
    qsr: [0.88, 0.94, 0.98, 1.00, 1.22, 1.28, 1.08],
    bakery: [0.92, 0.82, 0.90, 0.92, 1.00, 1.48, 1.52],
    retail: [1.05, 0.80, 0.88, 0.90, 1.00, 1.50, 1.32],
  };
  base *= (dowMult[preset.key] || dowMult.qsr)[dow] || 1.0;

  // Weather sensitivity
  if (product.weather_sensitivity === 1) {
    if (tempC < 0) base *= 1.18;   // hot drinks up when cold
    else if (tempC > 18) base *= 0.82;
  }
  if (product.weather_sensitivity === 2) {
    if (tempC < 5) base *= 0.18;   // cold drinks near-zero when cold
    else if (tempC > 15) base *= 1.35;
    else if (tempC > 10) base *= 0.85;
  }
  if (isStormy) base *= 0.85;

  // Seasonal / trending items
  if (preset.key === 'qsr') {
    if (product.id === 'demo-prev-poutine') {
      if (month <= 2 || month === 12) base *= 1.28;  // comfort food in winter
      if (month >= 6 && month <= 8) base *= 0.78;
    }
    if (product.id === 'demo-prev-milkshake') {
      if (month <= 2 || month === 12) base *= 0.22;
      else if (month >= 5) base *= 1.30;
    }
    // Wrap: trending up — 2 week upward trend (simulate last 14 days)
    if (product.id === 'demo-prev-wrappoulet') {
      const daysAgo = Math.round((new Date() - dt(dateStr)) / 86400000);
      if (daysAgo <= 14) base *= (1 + (14 - daysAgo) * 0.015);
    }
  }
  if (preset.key === 'bakery') {
    if (product.id === 'demo-prev-cafeglace') {
      if (month <= 3) base *= 0.28;
      else if (month >= 6) base *= 1.55;
    }
    if (product.id === 'demo-prev-sandwichmidi') {
      // Lunch rush Mon-Fri, drops on weekend
      if (isWknd) base *= 0.45;
    }
    // Baguette: 2-week declining trend (fading seasonal item)
    if (product.id === 'demo-prev-baguette') {
      const daysAgo = Math.round((new Date() - dt(dateStr)) / 86400000);
      if (daysAgo <= 14) base *= (1 - (14 - daysAgo) * 0.018);
    }
  }
  if (preset.key === 'retail') {
    if (product.id === 'demo-prev-soupe') {
      if (month <= 3 || month >= 11) base *= 1.42;  // soup up in winter
    }
    if (product.id === 'demo-prev-jufrais') {
      if (month <= 2) base *= 0.30;
      else if (month >= 5) base *= 1.45;
    }
  }

  const made = Math.max(1, Math.round(base * (1 + sr(seed + 11, -0.07, 0.07))));

  // Stockout patterns
  const isStockoutCroissantSat = preset.key === 'bakery' && product.id === 'demo-prev-croissant' && dow === 6 && sr(seed + 99) > 0.22;
  const isStockoutSmashFri = preset.key === 'qsr' && product.id === 'demo-prev-smashburger' && dow === 5 && sr(seed + 98) > 0.35;
  const isStockoutPouletSat = preset.key === 'retail' && product.id === 'demo-prev-pouletrotiss' && dow === 6 && sr(seed + 97) > 0.30;

  // Overproduction (waste patterns)
  const isWasteBaguetteMon = preset.key === 'bakery' && product.id === 'demo-prev-baguette' && dow === 1;
  const isWasteSoupeMon = preset.key === 'retail' && product.id === 'demo-prev-soupe' && dow === 1;
  const isWasteFritesMon = preset.key === 'qsr' && product.id === 'demo-prev-frites' && dow === 1;

  let sold, remaining;
  if (isStockoutCroissantSat || isStockoutSmashFri || isStockoutPouletSat) {
    sold = made; remaining = 0;
  } else if (isWasteBaguetteMon || isWasteSoupeMon || isWasteFritesMon) {
    const wasteRate = r2(sr(seed + 88, 0.18, 0.26));
    sold = Math.max(0, Math.round(made * (1 - wasteRate)));
    remaining = made - sold;
  } else {
    sold = Math.min(made, Math.max(0, Math.round(made * (1 - sr(seed + 21, 0.00, 0.10)))));
    remaining = made - sold;
  }

  // Cross-product uplift: when croissant stocks out, pain au chocolat sells more
  if (preset.key === 'bakery' && product.id === 'demo-prev-painchoco' && dow === 6 && sr(seed + 95) > 0.22) {
    sold = Math.min(made + sri(seed + 96, 5, 9), made + 9);
    if (sold > made) { made + 0; } // note: sold can exceed made (cross-product effect)
  }

  return {
    id: `demo-sale-${product.id}-${dateStr}`,
    product_id: product.id, date: dateStr,
    quantity_made: made, quantity_sold: Math.min(sold, made + 10),
    quantity_remaining: Math.max(0, remaining),
    stockout: (remaining === 0 && sold >= made) ? 1 : 0,
    source: 'demo', notes: '',
  };
}

// ─── PATTERNS + INSIGHTS ──────────────────────────────────────────────────────

function getPatternsAndInsights(preset, lang) {
  const isFr = lang !== 'en';

  if (preset.key === 'qsr') {
    const patterns = [
      { id: 'demo-pat-smash-fri', pattern_type: 'day_of_week', entity: 'demo-prev-smashburger', key: 'friday', value: JSON.stringify({ avg: 108, weighted_avg: 112, sample_count: 10 }), confidence: 0.91, sample_size: 10 },
      { id: 'demo-pat-milkshake-warm', pattern_type: 'weather_correlation', entity: 'demo-prev-milkshake', key: 'warm_above_15', value: JSON.stringify({ uplift: 0.35, sample_count: 15 }), confidence: 0.82, sample_size: 15 },
      { id: 'demo-pat-wrap-trend', pattern_type: 'trend', entity: 'demo-prev-wrappoulet', key: 'last_14_days', value: JSON.stringify({ trend_pct: 0.21, direction: 'up', sample_count: 14 }), confidence: 0.87, sample_size: 14 },
      { id: 'demo-pat-poutine-cold', pattern_type: 'weather_correlation', entity: 'demo-prev-poutine', key: 'cold_below_0', value: JSON.stringify({ uplift: 0.28, sample_count: 22 }), confidence: 0.79, sample_size: 22 },
      { id: 'demo-pat-smash-frites-cross', pattern_type: 'cross_product', entity: 'demo-prev-smashburger', key: 'stockout_frites_uplift', value: JSON.stringify({ related_product: 'demo-prev-frites', uplift: 0.14, sample_count: 6 }), confidence: 0.74, sample_size: 6 },
    ];
    const insights = [
      { id: 'demo-ins-smash-stockout', type: 'stockout_critical', entity: 'demo-prev-smashburger', message_fr: 'Smash Burger: rupture de stock 3 vendredis sur 4. Revenu perdu estimé: $312/mois. Production suggérée: 125 unités le vendredi.', message_en: 'Smash Burger: stockout 3 of 4 Fridays. Estimated lost revenue: $312/month. Suggested production: 125 units on Fridays.', severity: 'critical', financial_impact: 312 },
      { id: 'demo-ins-frites-waste', type: 'overproduction_waste', entity: 'demo-prev-frites', message_fr: 'Frites: gaspillage moyen de 21% les lundis. Coût: $23/semaine. Réduisez la production de 120 à 92 unités.', message_en: 'Fries: average 21% waste on Mondays. Cost: $23/week. Reduce production from 120 to 92 units.', severity: 'warning', financial_impact: 92 },
      { id: 'demo-ins-wrap-trend', type: 'trend_up', entity: 'demo-prev-wrappoulet', message_fr: 'Wrap poulet +21% sur les 2 dernières semaines. Tendance soutenue — considérez augmenter l\'approvisionnement.', message_en: 'Chicken wrap +21% over the last 2 weeks. Sustained trend — consider increasing supply.', severity: 'suggestion', financial_impact: null },
      { id: 'demo-ins-milkshake-weather', type: 'weather_correlation', entity: 'demo-prev-milkshake', message_fr: 'Milkshake se vend 35% de plus quand la température dépasse 15°C. Ajustez la production selon la météo prévue.', message_en: 'Milkshakes sell 35% more when temperature exceeds 15°C. Adjust production based on forecast weather.', severity: 'suggestion', financial_impact: null },
      { id: 'demo-ins-lucas-variance', type: 'cashier_variance', entity: 'demo-cashier-lucas', message_fr: 'Lucas Bergeron: variance moyenne les vendredis: -$9.24 (6 vendredis consécutifs). Vérification recommandée.', message_en: 'Lucas Bergeron: average variance on Fridays: -$9.24 (6 consecutive Fridays). Review recommended.', severity: 'warning', financial_impact: 55 },
    ];
    return { patterns, insights };
  }

  if (preset.key === 'bakery') {
    const patterns = [
      { id: 'demo-pat-croissant-sat', pattern_type: 'day_of_week', entity: 'demo-prev-croissant', key: 'saturday', value: JSON.stringify({ avg: 95, weighted_avg: 98, sample_count: 9 }), confidence: 0.92, sample_size: 9 },
      { id: 'demo-pat-cafeglace-warm', pattern_type: 'weather_correlation', entity: 'demo-prev-cafeglace', key: 'warm_above_15', value: JSON.stringify({ uplift: 0.55, sample_count: 12 }), confidence: 0.85, sample_size: 12 },
      { id: 'demo-pat-baguette-decline', pattern_type: 'trend', entity: 'demo-prev-baguette', key: 'last_14_days', value: JSON.stringify({ trend_pct: -0.18, direction: 'down', sample_count: 14 }), confidence: 0.83, sample_size: 14 },
      { id: 'demo-pat-latte-cold', pattern_type: 'weather_correlation', entity: 'demo-prev-cafelatte', key: 'cold_below_0', value: JSON.stringify({ uplift: 0.22, sample_count: 18 }), confidence: 0.77, sample_size: 18 },
      { id: 'demo-pat-croissant-painchoco-cross', pattern_type: 'cross_product', entity: 'demo-prev-croissant', key: 'stockout_painchoco_uplift', value: JSON.stringify({ related_product: 'demo-prev-painchoco', uplift: 0.15, sample_count: 7 }), confidence: 0.73, sample_size: 7 },
    ];
    const insights = [
      { id: 'demo-ins-croissant-stockout', type: 'stockout_critical', entity: 'demo-prev-croissant', message_fr: 'Croissants: rupture de stock 3 samedis sur 4. Revenu perdu estimé: $284/mois. Production suggérée: 95 unités le samedi.', message_en: 'Croissants: stockout 3 of 4 Saturdays. Estimated lost revenue: $284/month. Suggested Saturday production: 95 units.', severity: 'critical', financial_impact: 284 },
      { id: 'demo-ins-baguette-waste', type: 'overproduction_waste', entity: 'demo-prev-baguette', message_fr: 'Baguettes: gaspillage moyen de 22% les lundis. Coût: $24/semaine. Réduisez la production de 32 à 24 unités.', message_en: 'Baguettes: average 22% waste on Mondays. Cost: $24/week. Reduce Monday production from 32 to 24 units.', severity: 'warning', financial_impact: 96 },
      { id: 'demo-ins-baguette-decline', type: 'trend_down', entity: 'demo-prev-baguette', message_fr: 'Baguettes -18% sur les 2 dernières semaines. Tendance à la baisse — réduisez les commandes de farine progressivement.', message_en: 'Baguettes -18% over 2 weeks. Downward trend — gradually reduce flour orders.', severity: 'suggestion', financial_impact: null },
      { id: 'demo-ins-cafeglace-weather', type: 'weather_correlation', entity: 'demo-prev-cafeglace', message_fr: 'Café glacé: +55% de ventes quand T > 15°C. Préparez 35 unités les jours de beau temps prévu.', message_en: 'Iced coffee: +55% sales when T > 15°C. Prepare 35 units on sunny forecast days.', severity: 'suggestion', financial_impact: null },
      { id: 'demo-ins-croissant-cross', type: 'cross_product', entity: 'demo-prev-croissant', message_fr: 'Quand le Croissant est en rupture, le Pain au chocolat vend 15% de plus. Augmentez les deux le samedi.', message_en: 'When Croissants stock out, Pain au chocolat sells 15% more. Increase both on Saturdays.', severity: 'suggestion', financial_impact: null },
    ];
    return { patterns, insights };
  }

  // retail
  const patterns = [
    { id: 'demo-pat-poulet-sat', pattern_type: 'day_of_week', entity: 'demo-prev-pouletrotiss', key: 'saturday', value: JSON.stringify({ avg: 28, weighted_avg: 30, sample_count: 9 }), confidence: 0.90, sample_size: 9 },
    { id: 'demo-pat-soupe-cold', pattern_type: 'weather_correlation', entity: 'demo-prev-soupe', key: 'cold_below_5', value: JSON.stringify({ uplift: 0.42, sample_count: 20 }), confidence: 0.86, sample_size: 20 },
    { id: 'demo-pat-jus-warm', pattern_type: 'weather_correlation', entity: 'demo-prev-jufrais', key: 'warm_above_15', value: JSON.stringify({ uplift: 0.45, sample_count: 14 }), confidence: 0.81, sample_size: 14 },
    { id: 'demo-pat-sandwich-trend', pattern_type: 'trend', entity: 'demo-prev-sandwich', key: 'last_14_days', value: JSON.stringify({ trend_pct: 0.17, direction: 'up', sample_count: 14 }), confidence: 0.80, sample_size: 14 },
  ];
  const insights = [
    { id: 'demo-ins-poulet-stockout', type: 'stockout_critical', entity: 'demo-prev-pouletrotiss', message_fr: 'Poulet rôtisserie: rupture 3 samedis sur 4. Revenu perdu estimé: $224/mois. Production suggérée: 30 unités le samedi.', message_en: 'Rotisserie chicken: stockout 3 of 4 Saturdays. Est. lost revenue: $224/month. Suggested: 30 units Saturdays.', severity: 'critical', financial_impact: 224 },
    { id: 'demo-ins-soupe-waste', type: 'overproduction_waste', entity: 'demo-prev-soupe', message_fr: 'Soupe du jour: gaspillage 23% les lundis. Coût: $21/semaine. Réduisez la production de 25 à 19 unités.', message_en: 'Daily soup: 23% waste on Mondays. Cost: $21/week. Reduce from 25 to 19 units on Mondays.', severity: 'warning', financial_impact: 84 },
    { id: 'demo-ins-soupe-seasonal', type: 'seasonal', entity: 'demo-prev-soupe', message_fr: 'Les ventes de soupe ont augmenté de 45% depuis novembre. Prévoyez une hausse de production pour l\'hiver.', message_en: 'Soup sales up 45% since November. Plan increased winter production.', severity: 'suggestion', financial_impact: null },
    { id: 'demo-ins-jus-weather', type: 'weather_correlation', entity: 'demo-prev-jufrais', message_fr: 'Jus pressé: +45% quand T > 15°C. Ajustez la production selon la météo.', message_en: 'Fresh juice: +45% when T > 15°C. Adjust production based on weather.', severity: 'suggestion', financial_impact: null },
  ];
  return { patterns, insights };
}

// ─── INGREDIENTS / RECIPES / WASTE ───────────────────────────────────────────

const INGREDIENT_DEFS = {
  qsr: [
    { name_fr: 'Galette de bœuf',      name_en: 'Beef patty',       category: 'Viandes',    default_unit: 'unité', current_unit_price: 1.85, supplier_id: 'demo-sup-1' },
    { name_fr: 'Pain burger',           name_en: 'Burger bun',       category: 'Boulangerie', default_unit: 'unité', current_unit_price: 0.45, supplier_id: 'demo-sup-4' },
    { name_fr: 'Cheddar tranché',       name_en: 'Sliced cheddar',   category: 'Produits laitiers', default_unit: 'tranche', current_unit_price: 0.28, supplier_id: 'demo-sup-1' },
    { name_fr: 'Laitue iceberg',        name_en: 'Iceberg lettuce',  category: 'Légumes',    default_unit: 'portion', current_unit_price: 0.12, supplier_id: 'demo-sup-2' },
    { name_fr: 'Tomate fraîche',        name_en: 'Fresh tomato',     category: 'Légumes',    default_unit: 'tranche', current_unit_price: 0.09, supplier_id: 'demo-sup-2' },
    { name_fr: 'Oignon blanc',          name_en: 'White onion',      category: 'Légumes',    default_unit: 'portion', current_unit_price: 0.07, supplier_id: 'demo-sup-2' },
    { name_fr: 'Sauce mayo',            name_en: 'Mayonnaise',       category: 'Condiments', default_unit: 'oz',      current_unit_price: 0.08, supplier_id: 'demo-sup-1' },
    { name_fr: 'Huile de friture',      name_en: 'Frying oil',       category: 'Épicerie',   default_unit: 'L',       current_unit_price: 1.95, supplier_id: 'demo-sup-1' },
    { name_fr: 'Pommes frites surgelées', name_en: 'Frozen fries',   category: 'Congelés',   default_unit: 'kg',      current_unit_price: 2.40, supplier_id: 'demo-sup-1' },
    { name_fr: 'Sauce poutine',         name_en: 'Poutine sauce',    category: 'Condiments', default_unit: 'L',       current_unit_price: 3.20, supplier_id: 'demo-sup-1' },
    { name_fr: 'Fromage en grains',     name_en: 'Cheese curds',     category: 'Produits laitiers', default_unit: 'kg', current_unit_price: 8.50, supplier_id: 'demo-sup-2' },
    { name_fr: 'Mix milkshake',         name_en: 'Milkshake mix',    category: 'Boissons',   default_unit: 'L',       current_unit_price: 4.20, supplier_id: 'demo-sup-1' },
  ],
  bakery: [
    { name_fr: 'Farine tout-usage',     name_en: 'All-purpose flour', category: 'Épicerie',  default_unit: 'kg',  current_unit_price: 1.20, supplier_id: 'demo-sup-1' },
    { name_fr: 'Beurre non salé',       name_en: 'Unsalted butter',  category: 'Produits laitiers', default_unit: 'kg', current_unit_price: 7.50, supplier_id: 'demo-sup-2' },
    { name_fr: 'Œufs frais',            name_en: 'Fresh eggs',       category: 'Produits laitiers', default_unit: 'unité', current_unit_price: 0.28, supplier_id: 'demo-sup-2' },
    { name_fr: 'Lait entier',           name_en: 'Whole milk',       category: 'Produits laitiers', default_unit: 'L',  current_unit_price: 1.90, supplier_id: 'demo-sup-2' },
    { name_fr: 'Levure fraîche',        name_en: 'Fresh yeast',      category: 'Épicerie',   default_unit: 'g',   current_unit_price: 0.05, supplier_id: 'demo-sup-1' },
    { name_fr: 'Sucre blanc',           name_en: 'White sugar',      category: 'Épicerie',   default_unit: 'kg',  current_unit_price: 1.10, supplier_id: 'demo-sup-1' },
    { name_fr: 'Sel fin',               name_en: 'Fine salt',        category: 'Épicerie',   default_unit: 'kg',  current_unit_price: 0.35, supplier_id: 'demo-sup-1' },
    { name_fr: 'Chocolat noir 70%',     name_en: 'Dark chocolate 70%', category: 'Épicerie', default_unit: 'kg',  current_unit_price: 12.50, supplier_id: 'demo-sup-3' },
    { name_fr: 'Amandes effilées',      name_en: 'Sliced almonds',   category: 'Épicerie',   default_unit: 'kg',  current_unit_price: 14.20, supplier_id: 'demo-sup-1' },
    { name_fr: 'Crème 35%',             name_en: 'Heavy cream 35%',  category: 'Produits laitiers', default_unit: 'L', current_unit_price: 4.20, supplier_id: 'demo-sup-2' },
    { name_fr: 'Extrait de vanille',    name_en: 'Vanilla extract',  category: 'Épicerie',   default_unit: 'mL',  current_unit_price: 0.12, supplier_id: 'demo-sup-1' },
  ],
  retail: [
    { name_fr: 'Poulet entier',         name_en: 'Whole chicken',    category: 'Viandes',    default_unit: 'unité', current_unit_price: 12.50, supplier_id: 'demo-sup-2' },
    { name_fr: 'Bouillon de poulet',    name_en: 'Chicken broth',    category: 'Épicerie',   default_unit: 'L',     current_unit_price: 2.80, supplier_id: 'demo-sup-1' },
    { name_fr: 'Légumes mixtes',        name_en: 'Mixed vegetables', category: 'Légumes',    default_unit: 'kg',    current_unit_price: 3.40, supplier_id: 'demo-sup-4' },
    { name_fr: 'Pain de campagne',      name_en: 'Country bread',    category: 'Boulangerie', default_unit: 'unité', current_unit_price: 3.20, supplier_id: 'demo-sup-1' },
    { name_fr: 'Riz basmati',           name_en: 'Basmati rice',     category: 'Épicerie',   default_unit: 'kg',    current_unit_price: 2.90, supplier_id: 'demo-sup-1' },
    { name_fr: 'Tomates Roma',          name_en: 'Roma tomatoes',    category: 'Légumes',    default_unit: 'kg',    current_unit_price: 4.20, supplier_id: 'demo-sup-4' },
    { name_fr: 'Crème 35%',             name_en: 'Heavy cream 35%',  category: 'Produits laitiers', default_unit: 'L', current_unit_price: 4.20, supplier_id: 'demo-sup-1' },
    { name_fr: 'Fines herbes fraîches', name_en: 'Fresh herbs',      category: 'Légumes',    default_unit: 'botte', current_unit_price: 1.80, supplier_id: 'demo-sup-4' },
    { name_fr: 'Jus d\'orange frais',   name_en: 'Fresh orange juice', category: 'Boissons', default_unit: 'L',     current_unit_price: 5.40, supplier_id: 'demo-sup-4' },
    { name_fr: 'Huile d\'olive',        name_en: 'Olive oil',        category: 'Épicerie',   default_unit: 'L',     current_unit_price: 8.50, supplier_id: 'demo-sup-1' },
  ],
};

// Recipe definitions: ingredients referenced by 0-based index into INGREDIENT_DEFS[preset]
const RECIPE_DEFS = {
  qsr: [
    { name_fr: 'Smash Burger', name_en: 'Smash Burger', category: 'Burgers', yield_qty: 1, yield_unit: 'unité',
      ings: [
        { idx: 0, quantity: 1,   unit: 'unité',   notes: '' }, // galette
        { idx: 1, quantity: 1,   unit: 'unité',   notes: '' }, // pain
        { idx: 2, quantity: 1,   unit: 'tranche', notes: '' }, // cheddar
        { idx: 3, quantity: 1,   unit: 'portion', notes: '' }, // laitue
        { idx: 4, quantity: 2,   unit: 'tranche', notes: '' }, // tomate
        { idx: 5, quantity: 0.5, unit: 'portion', notes: '' }, // oignon
        { idx: 6, quantity: 0.5, unit: 'oz',      notes: '' }, // mayo
      ]},
    { name_fr: 'Poutine régulière', name_en: 'Regular Poutine', category: 'À-côtés', yield_qty: 1, yield_unit: 'portion',
      ings: [
        { idx: 8,  quantity: 0.2,  unit: 'kg', notes: '' }, // frites
        { idx: 9,  quantity: 0.1,  unit: 'L',  notes: '' }, // sauce poutine
        { idx: 10, quantity: 0.05, unit: 'kg', notes: '' }, // fromage en grains
      ]},
    { name_fr: 'Milkshake', name_en: 'Milkshake', category: 'Boissons', yield_qty: 1, yield_unit: 'portion',
      ings: [
        { idx: 11, quantity: 0.25, unit: 'L', notes: '' }, // mix milkshake
      ]},
  ],
  bakery: [
    { name_fr: 'Croissant', name_en: 'Croissant', category: 'Viennoiseries', yield_qty: 6, yield_unit: 'unité',
      ings: [
        { idx: 0, quantity: 0.25, unit: 'kg',  notes: '' }, // farine
        { idx: 1, quantity: 0.12, unit: 'kg',  notes: '' }, // beurre
        { idx: 3, quantity: 0.06, unit: 'L',   notes: '' }, // lait
        { idx: 4, quantity: 5,    unit: 'g',   notes: '' }, // levure
        { idx: 6, quantity: 3,    unit: 'g',   notes: '' }, // sel
      ]},
    { name_fr: 'Pain au chocolat', name_en: 'Pain au chocolat', category: 'Viennoiseries', yield_qty: 6, yield_unit: 'unité',
      ings: [
        { idx: 0, quantity: 0.25, unit: 'kg',  notes: '' }, // farine
        { idx: 1, quantity: 0.10, unit: 'kg',  notes: '' }, // beurre
        { idx: 7, quantity: 0.06, unit: 'kg',  notes: '' }, // chocolat noir
        { idx: 3, quantity: 0.06, unit: 'L',   notes: '' }, // lait
        { idx: 4, quantity: 5,    unit: 'g',   notes: '' }, // levure
      ]},
    { name_fr: 'Baguette tradition', name_en: 'Traditional Baguette', category: 'Pains', yield_qty: 1, yield_unit: 'unité',
      ings: [
        { idx: 0, quantity: 0.30, unit: 'kg', notes: '' }, // farine
        { idx: 4, quantity: 3,    unit: 'g',  notes: '' }, // levure
        { idx: 6, quantity: 5,    unit: 'g',  notes: '' }, // sel
      ]},
  ],
  retail: [
    { name_fr: 'Poulet rôtisserie', name_en: 'Rotisserie Chicken', category: 'Prêt-à-manger', yield_qty: 1, yield_unit: 'unité',
      ings: [
        { idx: 0, quantity: 1,   unit: 'unité', notes: '' }, // poulet entier
        { idx: 7, quantity: 0.5, unit: 'botte', notes: '' }, // fines herbes
        { idx: 9, quantity: 0.02, unit: 'L',    notes: '' }, // huile d'olive
      ]},
    { name_fr: 'Soupe du jour', name_en: 'Daily Soup', category: 'Prêt-à-manger', yield_qty: 4, yield_unit: 'portion',
      ings: [
        { idx: 2, quantity: 0.50, unit: 'kg', notes: '' }, // légumes
        { idx: 1, quantity: 0.75, unit: 'L',  notes: '' }, // bouillon
        { idx: 6, quantity: 0.10, unit: 'L',  notes: '' }, // crème
      ]},
    { name_fr: 'Sandwich du marché', name_en: 'Market Sandwich', category: 'Prêt-à-manger', yield_qty: 1, yield_unit: 'unité',
      ings: [
        { idx: 3, quantity: 0.5, unit: 'unité', notes: '' }, // pain
        { idx: 5, quantity: 0.1, unit: 'kg',    notes: '' }, // tomates
        { idx: 2, quantity: 0.1, unit: 'kg',    notes: '' }, // légumes
        { idx: 9, quantity: 0.01, unit: 'L',    notes: '' }, // huile d'olive
      ]},
  ],
};

async function loadIngredientsAndRecipes(api, preset) {
  if (!api.ingredients || !api.recipes) return {};
  const ingDefs = INGREDIENT_DEFS[preset.key] || [];
  const ingIdMap = {}; // index → integer db id
  const today = new Date().toISOString().slice(0, 10);

  for (let i = 0; i < ingDefs.length; i++) {
    const def = ingDefs[i];
    const id = await api.ingredients.save({
      name_fr: def.name_fr, name_en: def.name_en,
      category: def.category, default_unit: def.default_unit,
      current_unit_price: def.current_unit_price,
      last_price_update: today, supplier_id: def.supplier_id,
      sku: '', notes: '', active: 1,
    });
    ingIdMap[i] = id;
  }

  const recipeDefs = RECIPE_DEFS[preset.key] || [];
  for (const rdef of recipeDefs) {
    const recipeId = await api.recipes.save({
      name_fr: rdef.name_fr, name_en: rdef.name_en,
      category: rdef.category, yield_qty: rdef.yield_qty,
      yield_unit: rdef.yield_unit, active: 1, notes: '',
    });
    const recipeIngs = rdef.ings
      .filter(r => ingIdMap[r.idx] != null)
      .map(r => ({ ingredient_id: ingIdMap[r.idx], quantity: r.quantity, unit: r.unit, notes: r.notes }));
    if (recipeIngs.length) await api.recipes.ingredientsSet(recipeId, recipeIngs);
  }

  return ingIdMap;
}

const WASTE_DEFS = {
  qsr: [
    { ingIdx: 0, category: 'Viandes',    quantity: 4,    unit: 'unité', reason: 'Périmé',         shift: 'soir',  unit_cost: 1.85 },
    { ingIdx: 1, category: 'Boulangerie', quantity: 12,  unit: 'unité', reason: 'Trop cuit',       shift: 'matin', unit_cost: 0.45 },
    { ingIdx: 8, category: 'Congelés',   quantity: 0.5,  unit: 'kg',    reason: 'Renversé',        shift: 'midi',  unit_cost: 2.40 },
    { ingIdx: 9, category: 'Condiments', quantity: 0.15, unit: 'L',     reason: 'Contenant brisé', shift: 'matin', unit_cost: 3.20 },
    { ingIdx: 10, category: 'Produits laitiers', quantity: 0.2, unit: 'kg', reason: 'Date dépassée', shift: 'matin', unit_cost: 8.50 },
    { ingIdx: 0, category: 'Viandes',    quantity: 2,    unit: 'unité', reason: 'Trop cuit',       shift: 'soir',  unit_cost: 1.85 },
    { ingIdx: 4, category: 'Légumes',    quantity: 0.3,  unit: 'kg',    reason: 'Périmé',          shift: 'matin', unit_cost: 0.09 },
    { ingIdx: 11, category: 'Boissons',  quantity: 0.3,  unit: 'L',     reason: 'Renversé',        shift: 'midi',  unit_cost: 4.20 },
    { ingIdx: 1, category: 'Boulangerie', quantity: 6,   unit: 'unité', reason: 'Périmé',          shift: 'soir',  unit_cost: 0.45 },
    { ingIdx: 8, category: 'Congelés',   quantity: 0.3,  unit: 'kg',    reason: 'Trop cuit',       shift: 'soir',  unit_cost: 2.40 },
  ],
  bakery: [
    { ingIdx: 0, category: 'Épicerie',   quantity: 0.5,  unit: 'kg',    reason: 'Renversé',        shift: 'matin', unit_cost: 1.20 },
    { ingIdx: 1, category: 'Produits laitiers', quantity: 0.25, unit: 'kg', reason: 'Date dépassée', shift: 'matin', unit_cost: 7.50 },
    { ingIdx: 7, category: 'Épicerie',   quantity: 0.1,  unit: 'kg',    reason: 'Trop fondu',      shift: 'midi',  unit_cost: 12.50 },
    { ingIdx: 9, category: 'Produits laitiers', quantity: 0.2, unit: 'L', reason: 'Date dépassée', shift: 'soir',  unit_cost: 4.20 },
    { ingIdx: 3, category: 'Produits laitiers', quantity: 0.5, unit: 'L', reason: 'Renversé',      shift: 'matin', unit_cost: 1.90 },
    { ingIdx: 0, category: 'Épicerie',   quantity: 0.3,  unit: 'kg',    reason: 'Trop cuit',       shift: 'matin', unit_cost: 1.20 },
    { ingIdx: 1, category: 'Produits laitiers', quantity: 0.15, unit: 'kg', reason: 'Périmé',      shift: 'soir',  unit_cost: 7.50 },
    { ingIdx: 7, category: 'Épicerie',   quantity: 0.15, unit: 'kg',    reason: 'Contenant brisé', shift: 'midi',  unit_cost: 12.50 },
    { ingIdx: 2, category: 'Produits laitiers', quantity: 3, unit: 'unité', reason: 'Cassés',      shift: 'matin', unit_cost: 0.28 },
  ],
  retail: [
    { ingIdx: 0, category: 'Viandes',    quantity: 1,    unit: 'unité', reason: 'Périmé',          shift: 'soir',  unit_cost: 12.50 },
    { ingIdx: 2, category: 'Légumes',    quantity: 0.8,  unit: 'kg',    reason: 'Périmé',          shift: 'matin', unit_cost: 3.40 },
    { ingIdx: 5, category: 'Légumes',    quantity: 0.5,  unit: 'kg',    reason: 'Abîmé',           shift: 'matin', unit_cost: 4.20 },
    { ingIdx: 1, category: 'Épicerie',   quantity: 0.3,  unit: 'L',     reason: 'Contenant brisé', shift: 'midi',  unit_cost: 2.80 },
    { ingIdx: 6, category: 'Produits laitiers', quantity: 0.15, unit: 'L', reason: 'Date dépassée', shift: 'soir', unit_cost: 4.20 },
    { ingIdx: 7, category: 'Légumes',    quantity: 1,    unit: 'botte', reason: 'Périmé',           shift: 'matin', unit_cost: 1.80 },
    { ingIdx: 8, category: 'Boissons',   quantity: 0.5,  unit: 'L',     reason: 'Date dépassée',   shift: 'matin', unit_cost: 5.40 },
    { ingIdx: 0, category: 'Viandes',    quantity: 1,    unit: 'unité', reason: 'Trop cuit',        shift: 'soir',  unit_cost: 12.50 },
    { ingIdx: 2, category: 'Légumes',    quantity: 0.6,  unit: 'kg',    reason: 'Abîmé',            shift: 'matin', unit_cost: 3.40 },
    { ingIdx: 3, category: 'Boulangerie', quantity: 2,   unit: 'unité', reason: 'Périmé',           shift: 'soir',  unit_cost: 3.20 },
  ],
};

async function loadWasteEntries(api, preset, today, ingIdMap) {
  if (!api.waste) return;
  const wasteDefs = WASTE_DEFS[preset.key] || [];
  const count = wasteDefs.length;
  const seed0 = seedOf(fmtDate(today));

  for (let i = 0; i < count; i++) {
    const def = wasteDefs[i];
    const ingId = ingIdMap[def.ingIdx] ?? null;
    // Spread entries over last 55 days, skip today
    const daysBack = Math.round(sr(seed0 + i * 13 + 7, 1, 55));
    const entryDate = fmtDate(addD(today, -daysBack));
    const dollar_value = r2(def.quantity * def.unit_cost);
    await api.waste.save({
      date: entryDate,
      ingredient_id: ingId,
      category: def.category,
      quantity: def.quantity,
      unit: def.unit,
      reason: def.reason,
      shift: def.shift,
      unit_cost: def.unit_cost,
      dollar_value,
      notes: '',
    });
  }
}

// ─── LOAD DEMO DATA ───────────────────────────────────────────────────────────

export async function loadDemoData(lang = 'fr', presetKey = 'qsr') {
  const api = window.api;
  const preset = DEMO_PRESETS[presetKey] || DEMO_PRESETS.qsr;
  const today = new Date();
  today.setUTCHours(12, 0, 0, 0);
  const todayStr = fmtDate(today);
  const startDate = fmtDate(addD(today, -91));
  const endDate   = todayStr;
  const allDates  = dateRange(startDate, endDate);

  try {
    // ─── Roster / config ──────────────────────────────────────────────────
    await api.storage.set('dicann-roster', JSON.stringify(preset.cashiers));
    await api.storage.set('dicann-emp-roster', JSON.stringify(preset.employees));
    await api.storage.set('dicann-suppliers-v2', JSON.stringify(preset.suppliers));
    await api.storage.set('dicann-platforms', JSON.stringify(preset.platforms));

    // ─── Daily data ───────────────────────────────────────────────────────
    const dailyData = {};
    const carry = { ham: 38, hot: 18 };
    // One "big short" day ~3 weeks ago
    const bigShortDate = fmtDate(addD(today, -21));

    for (const d of allDates) {
      const isBigShort = d === bigShortDate;
      const { entry, hamEnd, hotEnd } = buildDailyEntry(d, preset, carry, { bigShort: isBigShort });
      entry.gas = gasForDate(today, d);
      dailyData[d] = entry;
      carry.ham = hamEnd;
      carry.hot = hotEnd;
    }

    await api.storage.set('dicann-v7', JSON.stringify(dailyData));

    // ─── Monthly P&L ──────────────────────────────────────────────────────
    const plMonths = getPLMonths(today);
    for (let i = 0; i < plMonths.length; i++) {
      const m = plMonths[i];
      const isLast = (i === plMonths.length - 1);
      const pl = buildMonthlyPL(m, preset, isLast);
      await api.storage.set(`dicann-pl-${m}`, JSON.stringify(pl));
    }

    // ─── Current month partial P&L ───────────────────────────────────────
    const currentMonth = todayStr.slice(0, 7);
    if (!plMonths.includes(currentMonth)) {
      const partialPL = buildMonthlyPL(currentMonth, preset, false);
      await api.storage.set(`dicann-pl-${currentMonth}`, JSON.stringify(partialPL));
    }

    // ─── Encaisse ─────────────────────────────────────────────────────────
    const { data: encaisseData, config: encaisseConfig } = buildEncaisseData(allDates, dailyData);
    await api.storage.set('dicann-encaisse', JSON.stringify(encaisseData));
    await api.storage.set('dicann-encaisse-config', JSON.stringify(encaisseConfig));

    // ─── Facturation ──────────────────────────────────────────────────────
    const { cats, prods, clients, soumissions, commandes, factures, creditNotes, docNums, companyInfo } = buildFacturation(preset, today);
    await api.storage.set('dicann-fac-categories',  JSON.stringify(cats));
    await api.storage.set('dicann-fac-produits',    JSON.stringify(prods));
    await api.storage.set('dicann-fac-clients',     JSON.stringify(clients));
    await api.storage.set('dicann-fac-soumissions', JSON.stringify(soumissions));
    await api.storage.set('dicann-fac-commandes',   JSON.stringify(commandes));
    await api.storage.set('dicann-fac-factures',    JSON.stringify(factures));
    await api.storage.set('dicann-fac-creditnotes', JSON.stringify(creditNotes));
    await api.storage.set('dicann-fac-recurrents',  JSON.stringify([]));
    await api.storage.set('dicann-doc-nums',        JSON.stringify(docNums));
    await api.storage.set('dicann-company-info',    JSON.stringify(companyInfo));

    // ─── Ingredients / Recipes / Waste ───────────────────────────────────
    const ingIdMap = await loadIngredientsAndRecipes(api, preset);
    await loadWasteEntries(api, preset, today, ingIdMap);

    // ─── Prévisions ───────────────────────────────────────────────────────
    if (api.forecast) {
      // Clear existing forecast data first
      try { await api.forecast.clearAll(); } catch (_) {}

      const prevProducts = getPrevProducts(preset);
      for (const p of prevProducts) {
        await api.forecast.products.upsert({ ...p, active: 1, notes: '' });
      }

      // 62 days of sales history
      const prevStart = fmtDate(addD(today, -62));
      const prevDates = dateRange(prevStart, endDate);
      for (const d of prevDates) {
        for (const p of prevProducts) {
          const sale = prevSalesForDate(d, p, preset);
          await api.forecast.sales.upsert(sale);
        }
      }

      // Weather history + 7-day forward forecast
      const weatherDates = dateRange(prevStart, fmtDate(addD(today, 7)));
      for (const d of weatherDates) {
        const { desc, code, tempC } = weatherForDate(d);
        const seed = seedOf(d);
        await api.forecast.weather.upsert({
          date: d, temp_min: r2(tempC - sr(seed + 5, 2, 6)),
          temp_max: r2(tempC + sr(seed + 6, 1, 5)),
          precipitation: (code >= 51 && code <= 82) ? r2(sr(seed + 7, 1, 8)) : 0,
          weather_code: code, description: desc,
          source: d > todayStr ? 'forecast' : 'demo',
        });
      }

      // Patterns + insights
      const { patterns, insights } = getPatternsAndInsights(preset, lang);
      for (const p of patterns) await api.forecast.patterns.upsert(p);
      for (const ins of insights) await api.forecast.insights.upsert(ins);
    }

    // ─── API config ───────────────────────────────────────────────────────
    const apiConfigRaw = await api.storage.get('dicann-api-config');
    const apiConfig = JSON.parse(apiConfigRaw?.value || '{}');
    apiConfig.previsionsEnabled = true;
    apiConfig.demoMode = true;
    apiConfig.demoPreset = presetKey;
    apiConfig.weatherLat = preset.weatherCoords.lat;
    apiConfig.weatherLng = preset.weatherCoords.lon;
    apiConfig.weatherCity = preset.weatherCoords.city;
    await api.storage.set('dicann-api-config', JSON.stringify(apiConfig));
    await api.storage.set('balanceiq-previsions-enabled', JSON.stringify(true));

    return { success: true, message: lang === 'en' ? 'Demo data loaded successfully.' : 'Données démo chargées avec succès.' };
  } catch (err) {
    console.error('[demoDataGenerator] Error:', err);
    return { success: false, message: err?.message || String(err) };
  }
}

// ─── CLEAR DEMO DATA ──────────────────────────────────────────────────────────

export async function clearDemoData() {
  const api = window.api;
  try {
    // Clear kv_store demo keys
    const emptyKeys = [
      'dicann-v7', 'dicann-encaisse',
      'dicann-fac-categories', 'dicann-fac-produits', 'dicann-fac-clients',
      'dicann-fac-soumissions', 'dicann-fac-commandes', 'dicann-fac-factures',
      'dicann-fac-creditnotes', 'dicann-fac-recurrents', 'dicann-company-info',
    ];
    for (const k of emptyKeys) await api.storage.set(k, JSON.stringify({}));

    // Clear P&L months (last 6 months to be safe)
    const today = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(today); d.setDate(1); d.setMonth(d.getMonth() - i);
      const m = fmtDate(d).slice(0, 7);
      await api.storage.set(`dicann-pl-${m}`, JSON.stringify({}));
    }

    // Clear all forecast SQLite tables
    if (api.forecast?.clearAll) {
      await api.forecast.clearAll();
    }

    // Clear demo mode flag
    const apiConfigRaw = await api.storage.get('dicann-api-config');
    const apiConfig = JSON.parse(apiConfigRaw?.value || '{}');
    delete apiConfig.demoMode;
    delete apiConfig.demoPreset;
    await api.storage.set('dicann-api-config', JSON.stringify(apiConfig));

    return { success: true, message: 'Données démo effacées.' };
  } catch (err) {
    console.error('[clearDemoData] Error:', err);
    return { success: false, message: err?.message || String(err) };
  }
}
