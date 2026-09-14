// ── BUSINESS PROFILE ─────────────────────────────────────────────────────────
// What kind of sales a business makes decides which screens it needs. The app
// only ever knew restaurant or franchise, so a wholesale business opened on a
// restaurant setup wizard and carried six register screens it never uses.
//
// Two types, and a business can be both. Pure functions, shared by the setup
// wizard, Settings, the sidebar and the getting-started checklist, so none of
// them can hold its own idea of what a type means.

export const BUSINESS_TYPES = ['invoicing', 'register'];

export const BUSINESS_TYPE_INFO = [
  {
    key: 'invoicing',
    labelEn: 'Invoiced sales',
    labelFr: 'Ventes sur facture',
    descEn: 'You send invoices: wholesale, B2B, services, royalties.',
    descFr: 'Vous envoyez des factures : grossiste, B2B, services, redevances.',
  },
  {
    key: 'register',
    labelEn: 'Counter sales',
    labelFr: 'Ventes au comptoir',
    descEn: 'You close out a cash register: restaurant, café, retail.',
    descFr: 'Vous fermez une caisse : restaurant, café, commerce.',
  },
];

// An unset or unrecognisable value means both. Existing businesses had no way to
// say which they were, so on the update that introduces this nothing disappears;
// they narrow it themselves.
export function normalizeBusinessTypes(value) {
  const picked = Array.isArray(value) ? BUSINESS_TYPES.filter(t => value.includes(t)) : [];
  return picked.length ? picked : [...BUSINESS_TYPES];
}

export const businessTypesChosen = (value) =>
  Array.isArray(value) && value.some(t => BUSINESS_TYPES.includes(t));

// The sidebar destinations this business should see, in sidebar order.
// Sales stays for a franchisor whatever else is ticked: royalties are invoiced.
export function visibleDestinations({ businessTypes, appMode, hasLinkedLocations = false } = {}) {
  const types = normalizeBusinessTypes(businessTypes);
  const out = [];
  if (appMode === 'franchiseur') out.push('reseau');
  if (appMode !== 'franchiseur' && hasLinkedLocations) out.push('mylocations');
  if (types.includes('invoicing') || appMode === 'franchiseur') out.push('facturation');
  out.push('today', 'bank', 'books', 'taxes');
  if (types.includes('register')) out.push('operations');
  out.push('settings');
  return out;
}

export const landingDestination = (visible) =>
  (visible || []).includes('facturation') ? 'facturation' : 'today';

// ── GETTING STARTED ──────────────────────────────────────────────────────────
// Phase 6: a new user's first ten minutes. The accounting path is the same for
// everyone - add the bank, bring in a statement, categorize a few lines, see the
// books move - and each type adds the one thing specific to it. An item ticks
// itself off from real data where there is a signal, so nobody is told to do what
// they have already done.
export function firstRunItems({
  businessTypes, chosen = false, facts = null, companyInfo = {},
  factures = [], hasDailyData = false, progress = {}, lang = 'fr',
} = {}) {
  const en = lang === 'en';
  const say = (e, f) => (en ? e : f);
  const types = normalizeBusinessTypes(businessTypes);
  const f = facts || {};
  const clicked = (key) => !!progress?.[key]?.completed;

  const list = [
    {
      key: 'fr_business',
      label: say('Tell us about your business', 'Parlez-nous de votre entreprise'),
      hint: say('Company name and the kind of sales you make', "Nom de l'entreprise et type de ventes"),
      auto: !!String(companyInfo?.nom || '').trim() && chosen,
      target: { kind: 'settings', sub: 'entreprise' },
    },
    ...(types.includes('invoicing') ? [{
      key: 'fr_invoice',
      label: say('Send your first invoice', 'Envoyez votre première facture'),
      hint: say('Sales, then New invoice', 'Ventes, puis Nouvelle facture'),
      auto: (factures || []).some(x => x && x.statut && x.statut !== 'Brouillon' && x.documentType !== 'proforma'),
      target: { kind: 'tab', tab: 'facturation' },
    }] : []),
    {
      key: 'fr_bank_account',
      label: say('Add your bank account', 'Ajoutez votre compte bancaire'),
      hint: say('Bank, then Accounts', 'Banque, puis Comptes'),
      auto: (f.bankAccounts || 0) > 0,
      target: { kind: 'section', section: 'bank', tab: 'comptes' },
    },
    {
      key: 'fr_statement',
      label: say('Import a bank statement', 'Importez un relevé bancaire'),
      hint: say("An OFX or QFX file from your bank's website", 'Un fichier OFX ou QFX du site de votre banque'),
      auto: (f.statements || 0) > 0,
      target: { kind: 'section', section: 'bank', tab: 'comptes' },
    },
    {
      key: 'fr_categorize',
      label: say('Categorize three bank lines', 'Catégorisez trois lignes bancaires'),
      hint: say('Say what each one was. The app learns your merchants as you go.',
                "Indiquez ce que chacune était. L'app apprend vos fournisseurs au fur et à mesure."),
      auto: (f.categorized || 0) >= 3,
      target: { kind: 'section', section: 'bank', tab: 'comptes' },
    },
    {
      // No data can say someone has looked. Done when they open it.
      key: 'fr_books',
      label: say('See it in your books', 'Voyez-le dans vos livres'),
      hint: say('Books, General ledger, Income statement', 'Livres, Grand livre, Résultats'),
      auto: false,
      target: { kind: 'section', section: 'books', tab: 'grandlivre' },
    },
    {
      key: 'fr_tax',
      label: say('Set up your GST/QST registration', 'Configurez votre inscription TPS/TVQ'),
      hint: say('Taxes, GST/QST, Registration', 'Taxes, TPS/TVQ, Enregistrement'),
      auto: !!f.taxRegistration,
      target: { kind: 'section', section: 'taxes', tab: 'taxperiod' },
    },
    ...(types.includes('register') ? [{
      key: 'fr_dayclose',
      label: say('Do your first daily close', 'Faites votre première fermeture de journée'),
      hint: say('Operations, Daily close', 'Opérations, Fermeture quotidienne'),
      auto: !!hasDailyData,
      target: { kind: 'section', section: 'operations', tab: 'daily' },
    }] : []),
  ];

  return list.map(({ auto, ...item }) => ({ ...item, done: !!auto || clicked(item.key) }));
}
