// demoDataGenerator.js — BalanceIQ demo data generator
// Generates 90 days of realistic data for screenshots and demos
// TODAY = March 15, 2026 | Daily data: Dec 15, 2025 → Mar 14, 2026

function sr(s, min = 0, max = 1) {
  const x = Math.sin(s * 9301 + 49297) * 233280;
  return min + (x - Math.floor(x)) * (max - min);
}
function sri(s, a, b) { return Math.round(sr(s, a, b)); }
function r2(n) { return Math.round(n * 100) / 100; }

function dateRange(startStr, endStr) {
  const dates = [];
  const cur = new Date(startStr + 'T12:00:00Z');
  const end = new Date(endStr + 'T12:00:00Z');
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function uid(prefix = 'demo') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

const CASHIERS = [
  { id: 'demo-cashier-marie', name: 'Marie' },
  { id: 'demo-cashier-lucas', name: 'Lucas' },
  { id: 'demo-cashier-sofia', name: 'Sofia' },
];

const EMPLOYEES = [
  { id: 'demo-emp-marie',  name: 'Marie',  wage: 16.00 },
  { id: 'demo-emp-lucas',  name: 'Lucas',  wage: 15.75 },
  { id: 'demo-emp-sofia',  name: 'Sofia',  wage: 16.50 },
  { id: 'demo-emp-pierre', name: 'Pierre', wage: 17.00 },
  { id: 'demo-emp-amina',  name: 'Amina',  wage: 18.50 },
  { id: 'demo-emp-david',  name: 'David',  wage: 22.00 },
];

const SUPPLIERS = [
  { id: 'demo-sup-1', name: 'Distribution Maple' },
  { id: 'demo-sup-2', name: 'Boucherie Québec' },
  { id: 'demo-sup-3', name: 'Épicerie en Gros' },
  { id: 'demo-sup-4', name: 'Boulangerie St-Laurent' },
  { id: 'demo-sup-5', name: 'Boissons Québec' },
  { id: 'demo-sup-6', name: 'Emballages Unifood' },
];

const PLATFORMS = [
  { id: 'doordash', name: 'DoorDash', emoji: '🔴', rate: 0.20 },
  { id: 'ubereats', name: 'Uber Eats', emoji: '🟢', rate: 0.20 },
  { id: 'skip',     name: 'Skip',      emoji: '🟡', rate: 0.25 },
];

const WEATHER_BY_MONTH = {
  12: { minC: -12, maxC: -2,  codes: [71, 73, 3, 71, 2, 1, 45], descs: ['Neige légère','Neige','Nuageux','Neige','Partiellement nuageux','Ensoleillé','Brouillard'] },
  1:  { minC: -18, maxC: -6,  codes: [71, 85, 3, 71, 2, 95, 1], descs: ['Neige légère','Poudrerie','Nuageux','Neige','Partiellement nuageux','Tempête','Ensoleillé'] },
  2:  { minC: -14, maxC: -3,  codes: [71, 3, 2, 1, 71, 85, 3],  descs: ['Neige légère','Nuageux','Partiellement nuageux','Ensoleillé','Neige légère','Poudrerie','Nuageux'] },
  3:  { minC: -6,  maxC: 5,   codes: [3, 2, 1, 61, 71, 2, 3],   descs: ['Nuageux','Partiellement nuageux','Ensoleillé','Pluie légère','Neige légère','Partiellement nuageux','Nuageux'] },
};

function weatherForDate(dateStr) {
  const seed = dateStr.replace(/-/g, '') | 0;
  const month = parseInt(dateStr.slice(5, 7));
  const wm = WEATHER_BY_MONTH[month] || WEATHER_BY_MONTH[3];
  const idx = sri(seed + 7, 0, wm.codes.length - 1);
  const tempC = r2(sr(seed + 3, wm.minC, wm.maxC));
  return { desc: wm.descs[idx], code: wm.codes[idx], tempC };
}

function gasForDate(dateStr) {
  const week = Math.floor((new Date(dateStr) - new Date('2025-12-15')) / (7 * 86400000));
  const base = 1.52;
  return r2(base + sr(week * 17 + 3, -0.10, 0.10));
}

function isWeekend(dateStr) {
  const dow = new Date(dateStr + 'T12:00:00Z').getUTCDay();
  return dow === 0 || dow === 6;
}

function getDow(dateStr) {
  return new Date(dateStr + 'T12:00:00Z').getUTCDay(); // 0=Sun
}

const QUEBEC_HOLIDAYS = new Set(['2025-12-25', '2025-12-26', '2026-01-01', '2026-01-02']);

function baseSales(dateStr) {
  const dow = getDow(dateStr);
  const isHol = QUEBEC_HOLIDAYS.has(dateStr);
  let base = dow === 0 ? 1900 : (dow === 5 || dow === 6) ? 2700 : 2100;
  if (isHol) base *= 1.15;
  const seed = parseInt(dateStr.replace(/-/g, ''));
  return r2(base * (1 + sr(seed, -0.20, 0.20)));
}

function buildDailyEntry(dateStr, hamStartCarry, hotStartCarry) {
  const seed = parseInt(dateStr.replace(/-/g, ''));
  const dow = getDow(dateStr);
  const totalSales = baseSales(dateStr);
  const sales1 = r2(totalSales * 0.60);
  const sales2 = r2(totalSales * 0.40);
  const gross = (sales) => r2(sales * 1.14975);
  const tps  = (sales) => r2(sales * 0.05);
  const tvq  = (sales) => r2(sales * 0.09975);

  // Caisse 1: Marie (Mon-Thu), Sofia (Fri-Sun)
  const c1CashierId = (dow >= 1 && dow <= 4) ? 'demo-cashier-marie' : 'demo-cashier-sofia';
  // Caisse 2: Lucas always
  const c2CashierId = 'demo-cashier-lucas';

  // Lucas short on Fridays
  const lucasVariance = (dow === 5) ? sr(seed + 99, -12, -8) : sr(seed + 1, -0.50, 0.50);

  function buildCaisse(cashierId, sales, varianceSeed) {
    const posVentes = r2(sales);
    const posTPS = tps(sales);
    const posTVQ = tvq(sales);
    const grossAmt = gross(sales);
    const interac = r2(grossAmt * 0.55);
    const cashExpected = r2(grossAmt - interac);
    const float = 200;
    const variance = (cashierId === 'demo-cashier-lucas' && dow === 5)
      ? r2(lucasVariance)
      : r2(sr(varianceSeed, -0.50, 0.50));
    const finalCash = r2(float + cashExpected + variance);
    return { cashierId, posVentes, posTPS, posTVQ, posLivraisons: 0, float, interac, livraisons: 0, deposits: 0, finalCash };
  }

  const caisse1 = buildCaisse(c1CashierId, sales1, seed + 11);
  const caisse2 = buildCaisse(c2CashierId, sales2, seed + 22);

  // Employees: 4-6, more on weekends
  const empCount = isWeekend(dateStr) ? sri(seed + 5, 5, 6) : sri(seed + 5, 4, 5);
  const shuffled = [...EMPLOYEES].sort((a, b) => sr(seed + a.id.length) - sr(seed + b.id.length));
  const employees = shuffled.slice(0, empCount).map(e => ({
    name: e.name,
    hours: r2(sr(seed + e.id.length + 1, 6, 9)),
    wage: e.wage,
  }));

  // Inventory
  const dozSold = r2(totalSales / 100 * 1.2 / 1.2); // approx dozens
  const hamUsed = sri(seed + 31, Math.floor(dozSold * 0.6), Math.floor(dozSold * 0.8));
  const hotUsed = sri(seed + 32, Math.floor(dozSold * 0.3), Math.floor(dozSold * 0.4));
  const hamReceived = (dow === 1 || dow === 3 || dow === 5) ? sri(seed + 33, 30, 50) : 0;
  const hotReceived = (dow === 1 || dow === 4) ? sri(seed + 34, 15, 25) : 0;
  const hamEnd = Math.max(0, hamStartCarry + hamReceived - hamUsed);
  const hotEnd = Math.max(0, hotStartCarry + hotReceived - hotUsed);

  // Platform livraisons
  const ddSales = r2(sr(seed + 41, 40, 120));
  const ueSales = r2(sr(seed + 42, 60, 180));
  const skipSales = (sr(seed + 43) > 0.65) ? r2(sr(seed + 44, 20, 60)) : 0;

  const { desc: weatherDesc, tempC } = weatherForDate(dateStr);

  // Bread checkpoints
  const hamTotal = hamStartCarry + hamReceived;
  const hotTotal = hotStartCarry + hotReceived;
  const hamB14 = Math.max(0, hamTotal - sri(seed + 61, 3, 8));
  const hamB17 = Math.max(0, hamB14 - sri(seed + 62, 5, 12));
  const hamB19 = Math.max(0, hamB17 - sri(seed + 63, 3, 8));
  const hamB20 = hamEnd;
  const hotB14 = Math.max(0, hotTotal - sri(seed + 64, 2, 5));
  const hotB17 = Math.max(0, hotB14 - sri(seed + 65, 3, 7));
  const hotB19 = Math.max(0, hotB17 - sri(seed + 66, 2, 4));
  const hotB20 = hotEnd;

  return {
    entry: {
      cashes: [caisse1, caisse2],
      employees,
      hamEnd, hamReceived, hamStartOverride: null,
      hotEnd, hotReceived, hotStartOverride: null,
      hamB14, hamB17, hamB19, hamB20,
      hotB14, hotB17, hotB19, hotB20,
      weather: weatherDesc,
      tempC,
      gas: gasForDate(dateStr),
      notes: '',
      events: QUEBEC_HOLIDAYS.has(dateStr) ? 'Congé férié' : '',
      platformLivraisons: {
        doordash: { ventes: ddSales, depot: r2(ddSales * 0.80) },
        ubereats:  { ventes: ueSales, depot: r2(ueSales * 0.80) },
        skip:      { ventes: skipSales, depot: r2(skipSales * 0.75) },
      },
    },
    hamEnd,
    hotEnd,
  };
}

function buildMonthlyPL(monthStr, dailyData, suppliers) {
  const [year, month] = monthStr.split('-').map(Number);
  const seed = year * 100 + month;
  const days = Object.keys(dailyData).filter(d => d.startsWith(monthStr));

  function bills(supId, min, max, count = 2) {
    return Array.from({ length: count }, (_, i) => {
      const day = String(sri(seed + supId.length + i * 7, 1, 28)).padStart(2, '0');
      return {
        id: `demo-bill-${supId}-${monthStr}-${i}`,
        date: `${monthStr}-${day}`,
        amount: r2(sr(seed + supId.length + i * 13, min, max)),
        note: 'Facture mensuelle',
      };
    });
  }

  const result = {
    _month: monthStr,
    pettyCashFP_bills: [
      { id: `demo-petty-${monthStr}-1`, date: `${monthStr}-05`, amount: r2(sr(seed + 1, 400, 600)), note: 'Livraison' },
      { id: `demo-petty-${monthStr}-2`, date: `${monthStr}-18`, amount: r2(sr(seed + 2, 300, 500)), note: 'Divers F&P' },
    ],
    pettyCashFP: 0,
    labourOverride: null,
  };

  suppliers.forEach(sup => {
    const ranges = {
      'demo-sup-1': [2800, 3500],
      'demo-sup-2': [1200, 1600],
      'demo-sup-3': [800, 1000],
      'demo-sup-4': [400, 600],
      'demo-sup-5': [300, 500],
      'demo-sup-6': [200, 350],
    };
    const [mn, mx] = ranges[sup.id] || [500, 800];
    result[`sup_${sup.id}_bills`] = bills(sup.id, mn, mx, sri(seed + sup.id.length, 1, 3));
  });

  const expSeed = (k) => seed * 7 + k.length * 3;
  result.exp_hydro_bills = [{ id: `demo-exp-hydro-${monthStr}`, date: `${monthStr}-15`, amount: r2(sr(expSeed('hydro'), 280, 420)), note: '' }];
  result.exp_gazNat_bills = [{ id: `demo-exp-gaznat-${monthStr}`, date: `${monthStr}-15`, amount: r2(sr(expSeed('gaz'), month === 1 ? 220 : 160, month === 1 ? 280 : 220)), note: '' }];
  result.exp_loyer_bills = [{ id: `demo-exp-loyer-${monthStr}`, date: `${monthStr}-01`, amount: 3200, note: '' }];
  result.exp_assurances_bills = [{ id: `demo-exp-assurances-${monthStr}`, date: `${monthStr}-01`, amount: 190, note: '' }];
  result.exp_telInternet_bills = [{ id: `demo-exp-tel-${monthStr}`, date: `${monthStr}-01`, amount: 95, note: '' }];
  result.exp_csst_bills = [{ id: `demo-exp-csst-${monthStr}`, date: `${monthStr}-15`, amount: r2(sr(expSeed('csst'), 130, 180)), note: '' }];
  if (sr(expSeed('rep') + month) > 0.55) {
    result.exp_reparations_bills = [{ id: `demo-exp-rep-${monthStr}`, date: `${monthStr}-${String(sri(expSeed('rep'), 5, 25)).padStart(2, '0')}`, amount: r2(sr(expSeed('rep2'), 150, 450)), note: 'Entretien équipement' }];
  }

  return result;
}

function buildEncaisseData(dates, dailyData) {
  const encaisse = {};
  let runningBalance = 5200;

  for (const d of dates) {
    const seed = parseInt(d.replace(/-/g, ''));
    const entry = dailyData[d];
    let cashFromCaisses = 0;
    if (entry && entry.cashes) {
      entry.cashes.forEach(c => { cashFromCaisses += (c.finalCash - c.float); });
    }
    cashFromCaisses = r2(cashFromCaisses);

    const depositAmt = r2(sr(seed + 77, 1500, 2500));
    const hasSortie = sr(seed + 88) > 0.70;
    const sortieAmt = hasSortie ? r2(sr(seed + 89, 100, 300)) : 0;

    encaisse[d] = {
      openingOverride: null,
      autreEntrees: [],
      deposits: [{ id: `demo-dep-${d}`, montant: depositAmt, note: 'Dépôt quotidien', slip: '' }],
      sorties: hasSortie ? [{ id: `demo-sortie-${d}`, categorie: 'fournisseur_cash', description: 'Paiement fournisseur', montant: sortieAmt }] : [],
      physicalCount: { tills: null, petty: null, office: null },
    };

    runningBalance = r2(runningBalance + cashFromCaisses - depositAmt - sortieAmt);
  }

  return encaisse;
}

// ——— Facturation ———

function buildFacturation() {
  const now = '2026-03-15';
  const cats = [
    { id: 'demo-cat-traiteur', nom: 'Traiteur & Événements', compteRevenu: '4100', actif: true },
    { id: 'demo-cat-location', nom: 'Location de salle', compteRevenu: '4200', actif: true },
    { id: 'demo-cat-service',  nom: 'Services professionnels', compteRevenu: '4300', actif: true },
  ];

  const prods = [
    { id: 'demo-prod-1', code: 'TRAI-001', description: 'Menu traiteur standard (par personne)', categorieId: 'demo-cat-traiteur', prixUnitaire: 35.00, uniteMesure: 'pers.', tps: true, tvq: true, actif: true },
    { id: 'demo-prod-2', code: 'TRAI-002', description: 'Menu traiteur prestige (par personne)',  categorieId: 'demo-cat-traiteur', prixUnitaire: 55.00, uniteMesure: 'pers.', tps: true, tvq: true, actif: true },
    { id: 'demo-prod-3', code: 'LOC-001',  description: 'Location salle événements (demi-journée)', categorieId: 'demo-cat-location', prixUnitaire: 450.00, uniteMesure: 'unité', tps: true, tvq: true, actif: true },
    { id: 'demo-prod-4', code: 'LOC-002',  description: 'Location salle événements (journée)',     categorieId: 'demo-cat-location', prixUnitaire: 750.00, uniteMesure: 'unité', tps: true, tvq: true, actif: true },
    { id: 'demo-prod-5', code: 'SERV-001', description: 'Service de serveurs (par heure)',          categorieId: 'demo-cat-service',  prixUnitaire: 28.00,  uniteMesure: 'heure', tps: true, tvq: true, actif: true },
  ];

  const clients = [
    { id: 'demo-cli-1', code: 'CLI-001', entreprise: 'Traiteur Les Pins Inc.',       contact: 'Jean-François Tremblay', adresse: '245 rue des Pins',          ville: 'Montréal', province: 'QC', codePostal: 'H2L 2V8', tel1: '514-555-0101', courriel: 'jf@traiteurlespins.ca',     conditionsPaiement: 'Net 30', statut: 'actif' },
    { id: 'demo-cli-2', code: 'CLI-002', entreprise: 'Événements Montréal',           contact: 'Sophie Lavoie',          adresse: '1800 av. McGill College',   ville: 'Montréal', province: 'QC', codePostal: 'H3A 3J6', tel1: '514-555-0202', courriel: 'sophie@evmtl.ca',           conditionsPaiement: 'Net 30', statut: 'actif' },
    { id: 'demo-cli-3', code: 'CLI-003', entreprise: 'Hôtel Royal QC',               contact: 'Marc Beauchamp',         adresse: '900 boul. René-Lévesque E', ville: 'Québec',   province: 'QC', codePostal: 'G1R 2B5', tel1: '418-555-0303', courriel: 'marc@hotelroyalqc.ca',      conditionsPaiement: 'Net 15', statut: 'actif' },
    { id: 'demo-cli-4', code: 'CLI-004', entreprise: 'CSSS Métro',                   contact: 'Isabelle Côté',          adresse: '3840 rue Saint-Urbain',     ville: 'Montréal', province: 'QC', codePostal: 'H2W 1T8', tel1: '514-555-0404', courriel: 'icote@csssmetro.qc.ca',     conditionsPaiement: 'Net 45', statut: 'actif' },
    { id: 'demo-cli-5', code: 'CLI-005', entreprise: 'Catering Pro SENC',            contact: 'Antoine Bouchard',       adresse: '555 rue Wellington',        ville: 'Montréal', province: 'QC', codePostal: 'H3C 1T3', tel1: '514-555-0505', courriel: 'abouchard@cateringpro.ca',  conditionsPaiement: 'Net 30', statut: 'actif' },
    { id: 'demo-cli-6', code: 'CLI-006', entreprise: 'Gestion Immobilière Maple',    contact: 'Diane Lefebvre',         adresse: '1000 rue de la Commune',    ville: 'Montréal', province: 'QC', codePostal: 'H2Y 1J1', tel1: '514-555-0606', courriel: 'dlefebvre@gimapple.ca',     conditionsPaiement: 'Net 30', statut: 'actif' },
    { id: 'demo-cli-7', code: 'CLI-007', entreprise: 'Resto Bar Le Vieux',           contact: 'Philippe Martin',        adresse: '350 rue Saint-Paul E',      ville: 'Montréal', province: 'QC', codePostal: 'H2Y 1H2', tel1: '514-555-0707', courriel: 'pmartin@levieux.ca',        conditionsPaiement: 'Net 30', statut: 'actif' },
    { id: 'demo-cli-8', code: 'CLI-008', entreprise: 'Traiteur Prestige MTL',        contact: 'Caroline Roy',           adresse: '1425 boul. René-Lévesque O', ville: 'Montréal', province: 'QC', codePostal: 'H3G 1T7', tel1: '514-555-0808', courriel: 'croy@traiteurprestige.ca', conditionsPaiement: 'Net 15', statut: 'actif' },
  ];

  function ligne(desc, qty, prix, tps = true, tvq = true) {
    return { id: uid('lig'), description: desc, quantite: qty, prixUnitaire: prix, remise: 0, tps, tvq };
  }

  function paiement(date, montant, mode = 'Virement', ref = '') {
    return { id: uid('pay'), date, numero: `P-${String(Date.now()).slice(-4)}`, montant, mode, reference: ref, note: '' };
  }

  const factures = [
    // CLI-1: overdue $2,847 (45 days ago, unpaid)
    {
      id: 'demo-fac-1', numero: 'F-0001', date: '2026-01-29', dateEcheance: '2026-02-28',
      clientId: 'demo-cli-1', statut: 'Envoyée',
      lignes: [ligne('Menu traiteur prestige — Gala annuel (82 pers.)', 82, 55.00), ligne('Service de serveurs', 12, 28.00)],
      notes: 'Gala annuel 2026', paiements: [], acomptes: [],
    },
    // CLI-2: partially paid $1,200 remaining
    {
      id: 'demo-fac-2', numero: 'F-0002', date: '2026-02-10', dateEcheance: '2026-03-12',
      clientId: 'demo-cli-2', statut: 'Partielle',
      lignes: [ligne('Menu traiteur standard — Conférence (90 pers.)', 90, 35.00), ligne('Location salle journée', 2, 750.00)],
      notes: 'Conférence Printemps 2026',
      paiements: [paiement('2026-02-20', 2000, 'Virement', 'VIR-20260220')],
      acomptes: [],
    },
    // CLI-3: fully paid
    {
      id: 'demo-fac-3', numero: 'F-0003', date: '2026-02-01', dateEcheance: '2026-02-16',
      clientId: 'demo-cli-3', statut: 'Payée',
      lignes: [ligne('Cocktail dînatoire (45 pers.)', 45, 45.00), ligne('Location salle demi-journée', 1, 450.00)],
      notes: '',
      paiements: [paiement('2026-02-14', 2480.63, 'Virement', 'VIR-20260214')],
      acomptes: [],
    },
    // CLI-4: fully paid older
    {
      id: 'demo-fac-4', numero: 'F-0004', date: '2025-12-20', dateEcheance: '2026-02-03',
      clientId: 'demo-cli-4', statut: 'Payée',
      lignes: [ligne('Repas du personnel — Fête de fin d\'année (60 pers.)', 60, 35.00)],
      notes: 'Fête de Noël',
      paiements: [paiement('2026-01-30', 2413.50, 'Chèque', 'CHQ-8821')],
      acomptes: [],
    },
    // CLI-5: current, not yet due
    {
      id: 'demo-fac-5', numero: 'F-0005', date: '2026-03-01', dateEcheance: '2026-03-31',
      clientId: 'demo-cli-5', statut: 'Envoyée',
      lignes: [ligne('Menu traiteur prestige — Lancement produit (50 pers.)', 50, 55.00), ligne('Location salle journée', 1, 750.00), ligne('Service de serveurs', 8, 28.00)],
      notes: 'Lancement printemps 2026', paiements: [], acomptes: [],
    },
    // CLI-6: overdue small
    {
      id: 'demo-fac-6', numero: 'F-0006', date: '2026-01-15', dateEcheance: '2026-02-14',
      clientId: 'demo-cli-6', statut: 'Envoyée',
      lignes: [ligne('Réception inauguration (25 pers.)', 25, 35.00)],
      notes: 'Inauguration nouveau bureau', paiements: [], acomptes: [],
    },
    // CLI-7: partially paid, credit note applied
    {
      id: 'demo-fac-7', numero: 'F-0007', date: '2026-02-05', dateEcheance: '2026-03-07',
      clientId: 'demo-cli-7', statut: 'Partielle',
      lignes: [ligne('Buffet froid — vernissage (35 pers.)', 35, 35.00), ligne('Location salle demi-journée', 1, 450.00)],
      notes: '',
      paiements: [paiement('2026-02-22', 700, 'Virement', 'VIR-20260222')],
      acomptes: [],
    },
    // CLI-8: recently paid
    {
      id: 'demo-fac-8', numero: 'F-0008', date: '2026-03-05', dateEcheance: '2026-03-20',
      clientId: 'demo-cli-8', statut: 'Payée',
      lignes: [ligne('Collaboration traiteur — Mariage (120 pers.)', 120, 55.00), ligne('Service de serveurs', 16, 28.00)],
      notes: 'Mariage Dupont-Lapierre',
      paiements: [paiement('2026-03-12', 7876.20, 'Virement', 'VIR-20260312')],
      acomptes: [],
    },
    // Additional invoices for volume
    {
      id: 'demo-fac-9', numero: 'F-0009', date: '2026-01-10', dateEcheance: '2026-02-09',
      clientId: 'demo-cli-3', statut: 'Payée',
      lignes: [ligne('Menu traiteur standard — Réunion conseil (30 pers.)', 30, 35.00)],
      notes: '',
      paiements: [paiement('2026-02-05', 1191.38, 'Virement', 'VIR-20260205')],
      acomptes: [],
    },
    {
      id: 'demo-fac-10', numero: 'F-0010', date: '2026-02-15', dateEcheance: '2026-03-17',
      clientId: 'demo-cli-1', statut: 'Envoyée',
      lignes: [ligne('Menu traiteur standard — Formation (40 pers.)', 40, 35.00)],
      notes: '', paiements: [], acomptes: [],
    },
    {
      id: 'demo-fac-11', numero: 'F-0011', date: '2025-12-05', dateEcheance: '2026-01-04',
      clientId: 'demo-cli-2', statut: 'Payée',
      lignes: [ligne('Cocktail de Noël (70 pers.)', 70, 45.00), ligne('Location salle journée', 1, 750.00)],
      notes: 'Soirée de Noël corporative',
      paiements: [paiement('2026-01-03', 4254.75, 'Chèque', 'CHQ-7744')],
      acomptes: [],
    },
    {
      id: 'demo-fac-12', numero: 'F-0012', date: '2026-03-10', dateEcheance: '2026-04-09',
      clientId: 'demo-cli-4', statut: 'Envoyée',
      lignes: [ligne('Menu traiteur standard — Assemblée annuelle (55 pers.)', 55, 35.00)],
      notes: '', paiements: [], acomptes: [],
    },
  ];

  const creditNotes = [
    {
      id: 'demo-nc-1', numero: 'NC-0001', date: '2026-02-28',
      clientId: 'demo-cli-7', factureNumero: 'F-0007', facId: 'demo-fac-7',
      statut: 'Envoyée',
      lignes: [ligne('Retour — serveuses non fournies', 2, 28.00)],
      notes: 'Ajustement pour service non rendu', paiements: [],
    },
    {
      id: 'demo-nc-2', numero: 'NC-0002', date: '2026-01-28',
      clientId: 'demo-cli-2', factureNumero: 'F-0002', facId: 'demo-fac-2',
      statut: 'Envoyée',
      lignes: [ligne('Réduction — annulation 10 convives', 10, 35.00)],
      notes: 'Annulation partielle J-3', paiements: [],
    },
    {
      id: 'demo-nc-3', numero: 'NC-0003', date: '2026-03-08',
      clientId: 'demo-cli-5', factureNumero: 'F-0005', facId: 'demo-fac-5',
      statut: 'Envoyée',
      lignes: [ligne('Escompte fidélité 5%', 1, -137.50)],
      notes: 'Rabais client fidèle', paiements: [],
    },
  ];

  const docNums = { soumission: 2, commande: 1, facture: 12, creditNote: 3, encaissement: 8 };

  const companyInfo = {
    nom: 'Bistro Maple',
    adresse: '1450 rue Sainte-Catherine O.',
    ville: 'Montréal',
    province: 'QC',
    codePostal: 'H3G 1R3',
    telephone: '514-555-0190',
    courriel: 'info@bistromaple.ca',
    siteWeb: 'www.bistromaple.ca',
    numeroTPS: '123456789 RT0001',
    numeroTVQ: '1234567890 TQ0001',
    logo: null,
  };

  return { cats, prods, clients, factures, creditNotes, docNums, companyInfo };
}

// ——— Prévisions ———

const PREV_PRODUCTS = [
  { id: 'demo-prev-cornetto',   name: 'Cornetto',           category: 'Viennoiseries', base_quantity: 30, shelf_life_days: 1, weather_sensitivity: 0, unit_cost: 1.20, sell_price: 3.50 },
  { id: 'demo-prev-sfogliatella', name: 'Sfogliatella',     category: 'Viennoiseries', base_quantity: 15, shelf_life_days: 1, weather_sensitivity: 0, unit_cost: 1.80, sell_price: 4.50 },
  { id: 'demo-prev-zeppole',    name: 'Zeppole',            category: 'Viennoiseries', base_quantity: 20, shelf_life_days: 1, weather_sensitivity: 0, unit_cost: 2.80, sell_price: 6.50 },
  { id: 'demo-prev-ciabatta',   name: 'Ciabatta',           category: 'Pains',         base_quantity: 20, shelf_life_days: 2, weather_sensitivity: 0, unit_cost: 0.90, sell_price: 4.00 },
  { id: 'demo-prev-focaccia',   name: 'Focaccia (plaque)',  category: 'Pains',         base_quantity: 8,  shelf_life_days: 1, weather_sensitivity: 0, unit_cost: 4.20, sell_price: 12.00 },
  { id: 'demo-prev-panedicasa', name: 'Pane di Casa',       category: 'Pains',         base_quantity: 18, shelf_life_days: 2, weather_sensitivity: 0, unit_cost: 1.10, sell_price: 5.00 },
  { id: 'demo-prev-cannoli',    name: 'Cannoli',            category: 'Pâtisseries',   base_quantity: 25, shelf_life_days: 1, weather_sensitivity: 0, unit_cost: 1.50, sell_price: 4.50 },
  { id: 'demo-prev-tiramisu',   name: 'Tiramisu (portion)', category: 'Pâtisseries',   base_quantity: 20, shelf_life_days: 2, weather_sensitivity: 0, unit_cost: 3.00, sell_price: 8.00 },
  { id: 'demo-prev-biscotti',   name: 'Biscotti (sachet)',  category: 'Pâtisseries',   base_quantity: 30, shelf_life_days: 14, weather_sensitivity: 0, unit_cost: 0.60, sell_price: 3.50 },
  { id: 'demo-prev-espresso',   name: 'Espresso',           category: 'Boissons',      base_quantity: 60, shelf_life_days: 1, weather_sensitivity: 1, unit_cost: 0.40, sell_price: 3.00 },
  { id: 'demo-prev-limonata',   name: 'Limonata',           category: 'Boissons',      base_quantity: 25, shelf_life_days: 3, weather_sensitivity: 2, unit_cost: 0.80, sell_price: 4.50 },
  { id: 'demo-prev-cappuccino', name: 'Cappuccino',         category: 'Boissons',      base_quantity: 50, shelf_life_days: 1, weather_sensitivity: 1, unit_cost: 0.60, sell_price: 4.00 },
];

function prevSalesForDate(dateStr, product) {
  const seed = parseInt(dateStr.replace(/-/g, '')) + product.id.length * 7;
  const dow = getDow(dateStr);
  const month = parseInt(dateStr.slice(5, 7));
  const isWknd = (dow === 0 || dow === 6);
  const { tempC } = weatherForDate(dateStr);

  let base = product.base_quantity;

  // Weekend boost
  if (isWknd) base *= (1 + sr(seed + 5, 0.30, 0.40));

  // Zeppole: March peak
  if (product.id === 'demo-prev-zeppole' && month === 3) {
    base *= 1.45;
    // Around March 19
    const dayNum = parseInt(dateStr.slice(8, 10));
    if (dayNum >= 17 && dayNum <= 21) base *= 1.80;
  }

  // Limonata: very low Jan/Feb, picking up March
  if (product.id === 'demo-prev-limonata') {
    if (month === 1) base *= 0.35;
    else if (month === 2) base *= 0.50;
    else if (month === 3) base *= 0.85;
  }

  // Espresso/Cappuccino: higher when cold
  if (product.weather_sensitivity === 1 && tempC < 0) base *= 1.12;

  // Limonata warm boost (sensitivity=2)
  if (product.weather_sensitivity === 2 && tempC > 10) base *= 1.28;

  const made = Math.max(1, Math.round(base * (1 + sr(seed + 11, -0.08, 0.08))));

  // Cornetto: stockout Friday afternoons
  const isStockoutCornetto = product.id === 'demo-prev-cornetto' && dow === 5;
  // Zeppole: stockout Saturdays in March
  const isStockoutZeppole = product.id === 'demo-prev-zeppole' && dow === 6 && month === 3 && sr(seed + 99) > 0.20;
  // Focaccia: overproduction Mondays
  const isFocacciaMonday = product.id === 'demo-prev-focaccia' && dow === 1;

  let sold, remaining;
  if (isStockoutCornetto || isStockoutZeppole) {
    sold = made;
    remaining = 0;
  } else if (isFocacciaMonday) {
    sold = Math.max(0, made - sri(seed + 88, 2, 3));
    remaining = made - sold;
  } else {
    sold = Math.min(made, Math.max(0, Math.round(made * (1 - sr(seed + 21, 0.00, 0.12)))));
    remaining = made - sold;
  }

  return {
    id: `demo-sale-${product.id}-${dateStr}`,
    product_id: product.id,
    date: dateStr,
    quantity_made: made,
    quantity_sold: sold,
    quantity_remaining: remaining,
    stockout: (remaining === 0 && sold === made) ? 1 : 0,
    source: 'demo',
    notes: '',
  };
}

async function upsertAll(ipcFns, items) {
  for (const item of items) {
    try { await ipcFns(item); } catch (_) { /* ignore individual failures */ }
  }
}

export async function loadDemoData(_lang = 'fr') {
  try {
    const api = window.api;

    // ——— Roster ———
    await api.storage.set('dicann-roster', JSON.stringify(CASHIERS));
    await api.storage.set('dicann-emp-roster', JSON.stringify(EMPLOYEES));
    await api.storage.set('dicann-suppliers-v2', JSON.stringify(SUPPLIERS));
    await api.storage.set('dicann-platforms', JSON.stringify(PLATFORMS.map(({ id, name, emoji }) => ({ id, name, emoji }))));

    // ——— Daily data (dicann-v7) ———
    const allDates = dateRange('2025-12-15', '2026-03-14');
    const dailyData = {};
    let hamCarry = 38;
    let hotCarry = 18;

    for (const d of allDates) {
      const { entry, hamEnd, hotEnd } = buildDailyEntry(d, hamCarry, hotCarry);
      dailyData[d] = entry;
      hamCarry = hamEnd;
      hotCarry = hotEnd;
    }

    await api.storage.set('dicann-v7', JSON.stringify(dailyData));

    // ——— Monthly P&L ———
    for (const m of ['2025-12', '2026-01', '2026-02']) {
      const pl = buildMonthlyPL(m, dailyData, SUPPLIERS);
      await api.storage.set(`dicann-pl-${m}`, JSON.stringify(pl));
    }

    // ——— Encaisse ———
    const encaisse = buildEncaisseData(allDates, dailyData);
    await api.storage.set('dicann-encaisse', JSON.stringify(encaisse));

    const encaisseConfig = {
      sortieCats: [
        { id: 'fournisseur_cash', label: 'Paiement fournisseur' },
        { id: 'reparation',       label: 'Réparation / entretien' },
        { id: 'fournitures',      label: 'Fournitures bureau' },
        { id: 'autre',            label: 'Autre' },
      ],
      cashLocations: [
        { id: 'tills',  label: 'Caisses' },
        { id: 'petty',  label: 'Petite caisse' },
        { id: 'office', label: 'Bureau' },
      ],
    };
    await api.storage.set('dicann-encaisse-config', JSON.stringify(encaisseConfig));

    // ——— Facturation ———
    const { cats, prods, clients, factures, creditNotes, docNums, companyInfo } = buildFacturation();
    await api.storage.set('dicann-fac-categories',  JSON.stringify(cats));
    await api.storage.set('dicann-fac-produits',    JSON.stringify(prods));
    await api.storage.set('dicann-fac-clients',     JSON.stringify(clients));
    await api.storage.set('dicann-fac-factures',    JSON.stringify(factures));
    await api.storage.set('dicann-fac-creditnotes', JSON.stringify(creditNotes));
    await api.storage.set('dicann-fac-soumissions', JSON.stringify([]));
    await api.storage.set('dicann-fac-commandes',   JSON.stringify([]));
    await api.storage.set('dicann-fac-recurrents',  JSON.stringify([]));
    await api.storage.set('dicann-doc-nums',        JSON.stringify(docNums));
    await api.storage.set('dicann-company-info',    JSON.stringify(companyInfo));

    // ——— Prévisions products (via IPC) ———
    if (api.forecast) {
      for (const p of PREV_PRODUCTS) {
        await api.forecast.products.upsert({ ...p, active: 1, notes: '' });
      }

      // Daily sales: Jan 15 → Mar 14 (60 days)
      const prevDates = dateRange('2026-01-15', '2026-03-14');
      for (const d of prevDates) {
        for (const p of PREV_PRODUCTS) {
          const sale = prevSalesForDate(d, p);
          await api.forecast.sales.upsert(sale);
        }
      }

      // Weather for those 60 days
      for (const d of prevDates) {
        const { desc, code, tempC } = weatherForDate(d);
        const month = parseInt(d.slice(5, 7));
        const wm = WEATHER_BY_MONTH[month] || WEATHER_BY_MONTH[3];
        await api.forecast.weather.upsert({
          date: d,
          temp_min: r2(tempC - sr(parseInt(d.replace(/-/g,'')) + 5, 2, 6)),
          temp_max: r2(tempC + sr(parseInt(d.replace(/-/g,'')) + 6, 1, 5)),
          precipitation: (code >= 51 && code <= 82) ? r2(sr(parseInt(d.replace(/-/g,'')) + 7, 1, 8)) : 0,
          weather_code: code,
          description: desc,
          source: 'demo',
        });
      }

      // Learned patterns
      const patterns = [
        {
          id: 'demo-pat-cornetto-fri',
          pattern_type: 'day_of_week',
          entity: 'demo-prev-cornetto',
          key: 'friday',
          value: JSON.stringify({ avg: 45, weighted_avg: 47, sample_count: 8 }),
          confidence: 0.88,
          sample_size: 8,
        },
        {
          id: 'demo-pat-limonata-warm',
          pattern_type: 'weather_correlation',
          entity: 'demo-prev-limonata',
          key: 'warm_above_10',
          value: JSON.stringify({ uplift: 0.28, sample_count: 12 }),
          confidence: 0.80,
          sample_size: 12,
        },
        {
          id: 'demo-pat-zeppole-cannoli-cross',
          pattern_type: 'cross_product',
          entity: 'demo-prev-zeppole',
          key: 'stockout_cannoli_uplift',
          value: JSON.stringify({ related_product: 'demo-prev-cannoli', uplift: 0.15, sample_count: 5 }),
          confidence: 0.72,
          sample_size: 5,
        },
        {
          id: 'demo-pat-zeppole-trend',
          pattern_type: 'trend',
          entity: 'demo-prev-zeppole',
          key: 'last_14_days',
          value: JSON.stringify({ trend_pct: 0.25, direction: 'up', sample_count: 14 }),
          confidence: 0.91,
          sample_size: 14,
        },
      ];
      for (const pat of patterns) {
        await api.forecast.patterns.upsert(pat);
      }

      // Insights
      const insights = [
        {
          id: 'demo-ins-zeppole-stockout',
          type: 'stockout_critical_zeppole_saturday',
          entity: 'demo-prev-zeppole',
          message_fr: '🔴 Zeppole: rupture de stock 4 samedis sur 5 le mois dernier. Revenu perdu estimé: $130/mois. Production suggérée: 52 unités.',
          message_en: '🔴 Zeppole: stockout 4 of 5 Saturdays last month. Estimated lost revenue: $130/month. Suggested production: 52 units.',
          severity: 'critical',
          financial_impact: 130,
        },
        {
          id: 'demo-ins-focaccia-waste',
          type: 'overproduction_focaccia_monday',
          entity: 'demo-prev-focaccia',
          message_fr: '🟡 Focaccia (plaque): gaspillage moyen de 22% les lundis. Coût: $18.52/semaine. Réduisez la production.',
          message_en: '🟡 Focaccia (plaque): average waste of 22% on Mondays. Cost: $18.52/week. Reduce production.',
          severity: 'warning',
          financial_impact: 74,
        },
        {
          id: 'demo-ins-zeppole-trend',
          type: 'trend_up_zeppole_march',
          entity: 'demo-prev-zeppole',
          message_fr: '📈 Zeppole +34% sur les 2 dernières semaines. Tendance soutenue — pic de la Saint-Joseph.',
          message_en: '📈 Zeppole +34% over the last 2 weeks. Sustained trend — Saint Joseph\'s Day peak.',
          severity: 'suggestion',
          financial_impact: null,
        },
        {
          id: 'demo-ins-limonata-weather',
          type: 'weather_correlation_limonata',
          entity: 'demo-prev-limonata',
          message_fr: '💡 Limonata se vend 28% de plus quand il fait plus de 10°C. Sensibilité actuelle: neutre. Mettre à jour dans Config Produits?',
          message_en: '💡 Limonata sells 28% more when temperature exceeds 10°C. Current sensitivity: neutral. Update in Product Config?',
          severity: 'suggestion',
          financial_impact: null,
        },
      ];
      for (const ins of insights) {
        await api.forecast.insights.upsert(ins);
      }
    }

    // ——— Enable prévisions ———
    const apiConfig = JSON.parse((await api.storage.get('dicann-api-config'))?.value || '{}');
    apiConfig.previsionsEnabled = true;
    await api.storage.set('dicann-api-config', JSON.stringify(apiConfig));
    await api.storage.set('balanceiq-previsions-enabled', JSON.stringify(true));

    return { success: true, message: 'Données démo chargées avec succès.' };
  } catch (err) {
    console.error('[demoDataGenerator] Error:', err);
    return { success: false, message: err?.message || String(err) };
  }
}
