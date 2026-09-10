import React, { useState, useEffect, useCallback } from 'react';
import QuebecTaxWizard from './QuebecTaxWizard.jsx';

const UI = {
  fr: {
    title: 'Déclarations TPS/TVQ',
    subtitle: 'Crédits de taxes sur intrants (CTI/RTI)',
    disclaimer: 'BalanceIQ produit ces calculs à titre indicatif. La responsabilité de la conformité fiscale incombe au contribuable. Consultez votre comptable avant toute déclaration.',
    tabPeriods: 'Périodes',
    tabProfiles: 'Profils fournisseurs',
    tabSuspense: 'Dépenses comptant',
    tabRegistration: 'Enregistrement',
    newPeriod: 'Nouvelle période',
    periodType: 'Type de période',
    typeQuarterly: 'Trimestrielle',
    typeMonthly: 'Mensuelle',
    typeAnnual: 'Annuelle',
    periodStart: 'Début (AAAA-MM)',
    periodEnd: 'Fin (AAAA-MM)',
    compute: 'Calculer',
    computing: 'Calcul…',
    save: 'Enregistrer',
    markFiled: 'Marquer comme produite',
    exportFPZ: 'Exporter FPZ-500.IF',
    noData: 'Aucun CTI/RTI détecté dans cette période.',
    noBills: 'Aucune facture avec taxes dans cette période. Utilisez le bouton CTI/RTI dans le P&L mensuel pour saisir les taxes payées.',
    statusOpen: 'Ouverte',
    statusFiled: 'Produite',
    statusPaid: 'Payée',
    tpsCollected: 'TPS collectée',
    tvqCollected: 'TVQ collectée',
    tpsCti: 'CTI (TPS payée)',
    tvqRti: 'RTI (TVQ payée)',
    netTps: 'Net TPS à remettre',
    netTvq: 'Net TVQ à remettre',
    suspenseCount: 'dépenses comptant non résolues',
    blockerWarning: 'La file de dépenses comptant contient des entrées non résolues. Résolvez-les avant de clore cette période.',
    confirmNum: 'N° de confirmation',
    markFiledConfirm: 'Numéro de confirmation de dépôt (optionnel) :',
    filedAt: 'Produite le',
    noPeriods: 'Aucune période enregistrée.',
    month: 'Mois',
    months: ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'],
    quarter: 'Trimestre',
    revenue: 'Revenus',
    bills: 'Factures avec taxes',
    profileSupplier: 'Fournisseur',
    profileTps: 'Taux TPS',
    profileTvq: 'Taux TVQ',
    profileApplies: 'Applicable',
    addProfile: 'Ajouter profil',
    deleteProfile: 'Supprimer',
    noProfiles: 'Aucun profil fournisseur.',
    suspenseTitle: 'Dépenses comptant à réviser',
    suspenseDesc: 'Transactions bancaires catégorisées comme dépenses sans facture fournisseur. Ces dépenses ne génèrent pas de CTI/RTI. Pour réclamer des taxes sur ces achats, promouvez-les en factures d\'achat.',
    classifyCash: 'Classifier sans taxes',
    noSuspense: 'Aucune dépense comptant à réviser.',
    billCount: 'facture(s) avec taxes',
    totalCti: 'CTI total de la période',
    totalRti: 'RTI total de la période',
    closeAction: 'Fermer la période',
    periodSaved: 'Période enregistrée.',
    periodFiled: 'Déclaration marquée comme produite.',
    vaultBlocker: (n) => `Fermeture bloquée : ${n} facture(s) d'achat >100 $ avec CTI sans document au coffre-fort. Joignez les pièces justificatives avant de continuer.`,
  },
  en: {
    title: 'GST/QST Filings',
    subtitle: 'Input Tax Credits (ITC/ITR)',
    disclaimer: 'BalanceIQ produces these calculations for informational purposes. Tax compliance responsibility rests with the taxpayer. Consult your accountant before filing.',
    tabPeriods: 'Periods',
    tabProfiles: 'Supplier Profiles',
    tabSuspense: 'Cash Expenses',
    tabRegistration: 'Registration',
    newPeriod: 'New period',
    periodType: 'Period type',
    typeQuarterly: 'Quarterly',
    typeMonthly: 'Monthly',
    typeAnnual: 'Annual',
    periodStart: 'Start (YYYY-MM)',
    periodEnd: 'End (YYYY-MM)',
    compute: 'Calculate',
    computing: 'Calculating…',
    save: 'Save',
    markFiled: 'Mark as filed',
    exportFPZ: 'Export FPZ-500.IF',
    noData: 'No ITC/ITR detected in this period.',
    noBills: 'No bills with tax amounts in this period. Use the CTI/RTI button in the monthly P&L to enter taxes paid.',
    statusOpen: 'Open',
    statusFiled: 'Filed',
    statusPaid: 'Paid',
    tpsCollected: 'GST collected',
    tvqCollected: 'QST collected',
    tpsCti: 'ITC (GST paid)',
    tvqRti: 'ITR (QST paid)',
    netTps: 'Net GST owing',
    netTvq: 'Net QST owing',
    suspenseCount: 'unresolved cash expenses',
    blockerWarning: 'The cash expense queue has unresolved entries. Resolve them before closing this period.',
    confirmNum: 'Confirmation number',
    markFiledConfirm: 'Filing confirmation number (optional):',
    filedAt: 'Filed on',
    noPeriods: 'No periods recorded.',
    month: 'Month',
    months: ['January','February','March','April','May','June','July','August','September','October','November','December'],
    quarter: 'Quarter',
    revenue: 'Revenue',
    bills: 'Bills with taxes',
    profileSupplier: 'Supplier',
    profileTps: 'GST rate',
    profileTvq: 'QST rate',
    profileApplies: 'Applicable',
    addProfile: 'Add profile',
    deleteProfile: 'Delete',
    noProfiles: 'No supplier profiles.',
    suspenseTitle: 'Cash expenses to review',
    suspenseDesc: 'Bank transactions categorized as expenses without a supplier bill. These do not generate ITC/ITR. To claim tax credits, promote them to purchase bills.',
    classifyCash: 'Classify as no-tax',
    noSuspense: 'No cash expenses to review.',
    billCount: 'bill(s) with taxes',
    totalCti: 'Total ITC for period',
    totalRti: 'Total ITR for period',
    closeAction: 'Close period',
    periodSaved: 'Period saved.',
    periodFiled: 'Filing marked as submitted.',
    vaultBlocker: (n) => `Close blocked: ${n} bill(s) over $100 with ITC claimed have no vault document. Attach supporting documents before continuing.`,
  },
};

const fmt = n => n == null ? '—' : `${n < 0 ? '-' : ''}$${Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
const fmtPct = n => n == null ? '—' : `${(n * 100).toFixed(3)}%`;

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function quarterStart() {
  const d = new Date();
  const qm = Math.floor(d.getMonth() / 3) * 3;
  const start = new Date(d.getFullYear(), qm, 1);
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
}

function quarterEnd() {
  const d = new Date();
  const qm = Math.floor(d.getMonth() / 3) * 3 + 2;
  const end = new Date(d.getFullYear(), qm, 1);
  return `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}`;
}

// The business name and registration numbers are operator-entered and go straight
// into the document, so they are escaped like every other PDF builder in the app.
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function buildFPZ500HTML(period, T, lang, company = {}) {
  const isFr = lang !== 'en';
  const today = new Date().toLocaleDateString(isFr ? 'fr-CA' : 'en-CA', { year: 'numeric', month: 'long', day: 'numeric' });

  // The box numbers are Revenu Quebec's and the CRA's, not any one bank's: 101,
  // 105, 108, 110, 111 and 113 on the GST/HST side, 205, 208, 210, 211 and 213 on
  // the QST side. Every bank filing service (BMO, RBC, TD, Desjardins, Scotia,
  // National Bank) submits the same FPZ-500.IF, and so does clicmesimpots and a
  // paper return, so the same sheet transcribes into any of them, and an
  // accountant reads it without translation. 113 and 213 are what the bank calls "Amount
  // payable"; a negative net is a refund and belongs in the refund column, which
  // is why each is printed on its own side rather than as one signed number.
  const supplies   = period.supplies || 0;
  const tpsColl    = period.tps_collected || 0;
  const tpsItc     = period.tps_cti || 0;
  const tpsNet     = tpsColl - tpsItc;
  const tvqColl    = period.tvq_collected || 0;
  const tvqItr     = period.tvq_rti || 0;
  const tvqNet     = tvqColl - tvqItr;
  const totalDue   = Math.max(0, tpsNet) + Math.max(0, tvqNet);
  const totalRef   = Math.max(0, -tpsNet) + Math.max(0, -tvqNet);

  const row = (box, label, value, sign = '') => `
    <tr>
      <td class="sign">${sign}</td>
      <td class="box">${box}</td>
      <td class="lbl">${label}</td>
      <td class="val">${fmt(value)}</td>
    </tr>`;
  const total = (box, label, value, refund) => `
    <tr class="tot">
      <td class="sign">=</td>
      <td class="box">${box}</td>
      <td class="lbl">${label}</td>
      <td class="val ${refund ? 'green' : 'red'}">${fmt(Math.abs(value))}${refund ? ` <span class="sub">(${isFr ? 'remboursement' : 'refund'})</span>` : ''}</td>
    </tr>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>FPZ-500.IF - ${period.period_start} to ${period.period_end}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font:12px/1.5 Arial,sans-serif;color:#222;padding:26px;max-width:700px}
h1{font-size:17px;color:#ea580c;margin-bottom:2px}
h2{font-size:12px;color:#1a5490;text-transform:uppercase;letter-spacing:.6px;margin:20px 0 4px;padding-bottom:4px;border-bottom:2px solid #1a5490}
table{width:100%;border-collapse:collapse}
td{padding:6px 4px;border-bottom:1px solid #eee;vertical-align:middle}
.sign{width:14px;color:#888;font-weight:700;text-align:center}
.box{width:38px}
.box{background:#111;color:#fff;font-weight:700;text-align:center;border-radius:3px;padding:3px 0;font-size:11px}
.lbl{color:#333}
.val{text-align:right;font-weight:700;width:130px;font-variant-numeric:tabular-nums}
.tot td{border-top:2px solid #111;border-bottom:none;padding-top:9px;font-size:13px}
.red{color:#b91c1c}.green{color:#15803d}
.sub{font-size:9px;color:#999;font-weight:400}
.pay{border:2px solid #ea580c;border-radius:5px;padding:12px 16px;margin-top:22px;display:flex;justify-content:space-between;align-items:center}
.pay-l{font-size:10px;text-transform:uppercase;letter-spacing:.6px;color:#ea580c;font-weight:700}
.pay-v{font-size:22px;font-weight:700}
.meta{display:flex;gap:26px;font-size:11px;color:#555;margin:10px 0 2px}
.disclaimer{font-size:10px;color:#7a5a2a;border-left:3px solid #f97316;padding:7px 10px;margin:14px 0;background:#fff8f0;line-height:1.5}
.foot{font-size:9.5px;color:#aaa;margin-top:22px}
</style></head><body>
<h1>${isFr ? 'Déclaration combinée TPS/TVQ - FPZ-500.IF' : 'Combined GST/QST return - FPZ-500.IF'}</h1>
<div class="meta">
  <span><strong>${isFr ? 'Période' : 'Period'}:</strong> ${period.period_start} &rarr; ${period.period_end}</span>
  <span><strong>${isFr ? 'Généré le' : 'Generated'}:</strong> ${today}</span>
</div>
${company.nom || company.numeroTPS || company.numeroTVQ ? `<div class="meta">
  ${company.nom ? `<span><strong>${isFr ? 'Entreprise' : 'Business'}:</strong> ${esc(company.nom)}</span>` : ''}
  ${company.numeroTPS ? `<span><strong>${isFr ? 'No TPS' : 'GST no.'}:</strong> ${esc(company.numeroTPS)}</span>` : ''}
  ${company.numeroTVQ ? `<span><strong>${isFr ? 'No TVQ' : 'QST no.'}:</strong> ${esc(company.numeroTVQ)}</span>` : ''}
</div>` : ''}
<p class="foot" style="margin:6px 0 0">${isFr
  ? 'Formulaire FPZ-500.IF (Revenu Québec) / GST34 (ARC). Les mêmes numéros de case servent chez toutes les institutions et sur clicmesimpots.'
  : 'Form FPZ-500.IF (Revenu Quebec) / GST34 (CRA). The same box numbers apply at every bank and on clicmesimpots.'}</p>
<div class="disclaimer">${T.disclaimer}</div>

<h2>${isFr ? 'Déclaration de TPS/TVH' : 'GST/HST return'}</h2>
<table>
${row('101', isFr ? 'Fournitures (chiffre des ventes)' : 'Supplies (sales figure)', supplies)}
${row('105', isFr ? 'TPS/TVH percue et percevable' : 'GST/HST collected and collectible', tpsColl)}
${row('108', isFr ? 'CTI et redressements' : 'ITCs payable and adjustments', tpsItc, '-')}
${row('110', isFr ? 'Acomptes provisionnels TPS/TVH' : 'GST/HST instalments', 0, '-')}
${row('111', isFr ? 'Autres remboursements TPS/TVH' : 'Other GST/HST rebates', 0, '-')}
${total('113', tpsNet >= 0 ? (isFr ? 'TPS/TVH à payer' : 'GST/HST payable') : (isFr ? 'Remboursement de TPS/TVH' : 'GST/HST refund'), tpsNet, tpsNet < 0)}
</table>

<h2>${isFr ? 'Déclaration de TVQ' : 'QST return'}</h2>
<table>
${row('205', isFr ? 'TVQ percue et percevable' : 'QST collected and collectible', tvqColl)}
${row('208', isFr ? 'RTI et redressements' : 'ITRs payable and adjustments', tvqItr, '-')}
${row('210', isFr ? 'Acomptes provisionnels TVQ' : 'QST instalment', 0, '-')}
${row('211', isFr ? 'Autres remboursements TVQ' : 'Other QST rebates', 0, '-')}
${total('213', tvqNet >= 0 ? (isFr ? 'TVQ à payer' : 'QST payable') : (isFr ? 'Remboursement de TVQ' : 'QST refund'), tvqNet, tvqNet < 0)}
</table>

<div class="pay">
  <span class="pay-l">${totalRef > totalDue ? (isFr ? 'Remboursement total' : 'Total refund') : (isFr ? 'Montant à payer' : 'Amount payable')}</span>
  <span class="pay-v ${totalRef > totalDue ? 'green' : 'red'}">${fmt(totalRef > totalDue ? totalRef : totalDue)}</span>
</div>

${(period.tps_collected || 0) === 0 && (period.tvq_collected || 0) === 0 ? `<div class="disclaimer"><strong>${isFr ? 'Aucune taxe percue dans cette période.' : 'No tax collected in this period.'}</strong> ${isFr ? "Vérifiez que vos factures sont à l'état Envoyée et que vos ventes au comptoir sont saisies avant de produire." : 'Check that your invoices are set to Sent and that any counter sales are entered before you file.'}</div>` : ''}

${period.status === 'filed' ? `<h2>${isFr ? 'Déclaration produite' : 'Filing submitted'}</h2>
<table>
<tr><td class="lbl">${T.filedAt}</td><td class="val">${period.filed_at ? new Date(period.filed_at).toLocaleDateString(isFr ? 'fr-CA' : 'en-CA') : '-'}</td></tr>
${period.confirmation_number ? `<tr><td class="lbl">${T.confirmNum}</td><td class="val">${period.confirmation_number}</td></tr>` : ''}
</table>` : ''}

<p class="foot">BalanceIQ &nbsp;|&nbsp; ${isFr ? 'Boîtes 110, 111, 210 et 211 à remplir manuellement si vous avez versé des acomptes ou demandé d\'autres remboursements.' : 'Boxes 110, 111, 210 and 211 are yours to fill in if you paid instalments or claimed other rebates.'}</p>
<p class="foot">${isFr ? 'À usage indicatif - validez avec votre comptable' : 'For reference only - validate with your accountant'}</p>
</body></html>`;
}

export default function TaxPeriodTab({ lang }) {
  const T = UI[lang] || UI.fr;

  const taxAvailable = !!window.api?.tax;

  // All hooks unconditional
  const [subTab, setSubTab] = useState('periods');
  // Every filing service asks for the registration numbers, so the sheet carries
  // them rather than sending the operator back to Config to look them up.
  const [company, setCompany] = useState({});
  useEffect(() => {
    (async () => {
      try {
        const r = await window.api?.storage?.get('dicann-company-info');
        if (r?.value) setCompany(JSON.parse(r.value));
      } catch (_) { /* not configured yet */ }
    })();
  }, []);
  const [periods, setPeriods] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [suspense, setSuspense] = useState([]);
  const [loading, setLoading] = useState(false);
  const [computing, setComputing] = useState(false);
  const [flash, setFlash] = useState('');

  // New period form
  const [periodType, setPeriodType] = useState('quarterly');
  const [pStart, setPStart] = useState(quarterStart);
  const [pEnd, setPEnd] = useState(quarterEnd);
  const [computed, setComputed] = useState(null);

  // Profile form
  const [editProfile, setEditProfile] = useState(null);
  const [profName, setProfName] = useState('');
  const [profTps, setProfTps] = useState('0.05');
  const [profTvq, setProfTvq] = useState('0.09975');
  const [profAppliesTps, setProfAppliesTps] = useState(true);
  const [profAppliesTvq, setProfAppliesTvq] = useState(true);

  const loadPeriods = useCallback(async () => {
    if (!window.api?.tax) return;
    try { setPeriods(await window.api.tax.period.list()); } catch (_) {}
  }, []);

  const loadProfiles = useCallback(async () => {
    if (!window.api?.tax) return;
    try { setProfiles(await window.api.tax.profile.list()); } catch (_) {}
  }, []);

  const loadSuspense = useCallback(async () => {
    if (!window.api?.tax) return;
    try { setSuspense(await window.api.tax.suspense.list({})); } catch (_) {}
  }, []);

  useEffect(() => {
    if (!taxAvailable) return;
    loadPeriods();
    loadSuspense();
  }, [loadPeriods, loadSuspense, taxAvailable]);

  useEffect(() => {
    if (!taxAvailable) return;
    if (subTab === 'profiles') loadProfiles();
    if (subTab === 'suspense') loadSuspense();
  }, [subTab, loadProfiles, loadSuspense, taxAvailable]);

  const doCompute = useCallback(async () => {
    if (!window.api?.tax) return;
    setComputing(true);
    try {
      const result = await window.api.tax.period.compute(pStart, pEnd);
      setComputed(result);
    } catch (e) {
      setFlash('Erreur: ' + (e?.message || 'calcul échoué'));
      setTimeout(() => setFlash(''), 5000);
    } finally {
      setComputing(false);
    }
  }, [pStart, pEnd]);

  const doSave = useCallback(async () => {
    if (!window.api?.tax || !computed) return;

    // Hard-block: CTI bills >$100 without a vault document
    try {
      const bills = await window.api.bills.list({ paid: null });
      if (Array.isArray(bills)) {
        const blocked = bills.filter(b => {
          if ((parseFloat(b.tps_paid) || 0) + (parseFloat(b.tvq_paid) || 0) <= 0) return false;
          if ((parseFloat(b.amount) || 0) <= 100) return false;
          if (b.vault_document_id) return false;
          // Only bills in the period range
          const d = b.bill_date || b.created_at || '';
          const ym = d.slice(0, 7);
          return ym >= pStart && ym <= pEnd;
        });
        if (blocked.length > 0) {
          setFlash(T.vaultBlocker(blocked.length));
          setTimeout(() => setFlash(''), 8000);
          return;
        }
      }
    } catch (_) {}

    setLoading(true);
    try {
      await window.api.tax.period.save({
        periodType, periodStart: pStart, periodEnd: pEnd,
        tpsCollected: computed.tpsCollected, tvqCollected: computed.tvqCollected,
        tpsCti: computed.tpsCti, tvqRti: computed.tvqRti,
        netTpsOwed: computed.netTpsOwed, netTvqOwed: computed.netTvqOwed,
        supplies: computed.supplies,
      });
      setFlash(T.periodSaved);
      setTimeout(() => setFlash(''), 3000);
      setComputed(null);
      await loadPeriods();
    } catch (e) {
      setFlash('Erreur: ' + (e?.message || 'sauvegarde échouée'));
      setTimeout(() => setFlash(''), 5000);
    } finally {
      setLoading(false);
    }
  }, [computed, periodType, pStart, pEnd, T, loadPeriods]);

  const doMarkFiled = useCallback(async (period) => {
    if (!window.api?.tax) return;
    const confirmNum = window.prompt(T.markFiledConfirm, '') ?? null;
    if (confirmNum === null) return;
    try {
      await window.api.tax.period.markFiled(period.id, confirmNum, null);
      setFlash(T.periodFiled);
      setTimeout(() => setFlash(''), 3000);
      await loadPeriods();
    } catch (e) {}
  }, [T, loadPeriods]);

  const doExportFPZ = useCallback((period) => {
    const html = buildFPZ500HTML(period, T, lang, company);
    if (window.api?.pdf?.print) {
      window.api.pdf.print(html);
    } else {
      const w = window.open('', '_blank');
      if (w) { w.document.write(html); w.document.close(); w.print(); }
    }
  }, [T, lang, company]);

  const doSaveProfile = useCallback(async () => {
    if (!window.api?.tax) return;
    try {
      await window.api.tax.profile.upsert({
        id: editProfile?.id || undefined,
        supplierName: profName,
        tpsRate: parseFloat(profTps) || 0.05,
        tvqRate: parseFloat(profTvq) || 0.09975,
        appliesTps: profAppliesTps,
        appliesTvq: profAppliesTvq,
      });
      setEditProfile(null); setProfName(''); setProfTps('0.05'); setProfTvq('0.09975');
      setProfAppliesTps(true); setProfAppliesTvq(true);
      await loadProfiles();
    } catch (_) {}
  }, [editProfile, profName, profTps, profTvq, profAppliesTps, profAppliesTvq, loadProfiles]);

  const doDeleteProfile = useCallback(async (id) => {
    if (!window.api?.tax) return;
    await window.api.tax.profile.delete(id);
    await loadProfiles();
  }, [loadProfiles]);

  const doClassifyCash = useCallback(async (tx) => {
    if (!window.api?.tax) return;
    const reason = window.prompt('Raison (optionnel):', '') ?? null;
    if (reason === null) return;
    await window.api.tax.suspense.classifyCash(tx.id, tx.coa_account_id, reason);
    await loadSuspense();
  }, [loadSuspense]);

  // Early return after all hooks
  if (!taxAvailable) {
    return (
      <div style={{ padding: 24, color: '#ef4444', fontSize: 13 }}>
        CTI/RTI non disponible — redémarrez l'application pour activer cette fonctionnalité.
        <br/>ITC/ITR unavailable — restart the application to enable this feature.
      </div>
    );
  }

  const cardStyle = {
    background: '#1a1d2a',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 8,
    padding: '12px 14px',
    marginBottom: 10,
  };

  const rowStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '5px 0',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
    fontSize: 12,
  };

  const labelStyle = { color: '#94a3b8', flex: 1 };
  const valueStyle = { color: '#e2e8f0', fontWeight: 600, fontFamily: 'monospace' };
  const greenValue = { ...valueStyle, color: '#10b981' };
  const redValue   = { ...valueStyle, color: '#ef4444' };

  const inputStyle = {
    padding: '5px 8px', borderRadius: 5,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.05)',
    color: '#e2e8f0', fontSize: 11, outline: 'none',
  };

  const btnPrimary = {
    padding: '6px 14px', borderRadius: 6, border: 'none',
    background: 'linear-gradient(135deg,#f97316,#ea580c)',
    color: '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer',
  };

  const btnSecondary = {
    padding: '5px 12px', borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.05)',
    color: '#94a3b8', fontSize: 11, cursor: 'pointer',
  };

  const btnTeal = {
    padding: '5px 12px', borderRadius: 6,
    border: '1px solid rgba(20,184,166,0.3)',
    background: 'rgba(20,184,166,0.08)',
    color: '#0d9488', fontSize: 11, cursor: 'pointer',
  };

  return (
    <div style={{ padding: '0 0 24px', width: '100%', minWidth: 0, fontFamily: "'Satoshi',-apple-system,BlinkMacSystemFont,sans-serif" }}>
      {/* Header */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>{T.title}</div>
        <div style={{ fontSize: 11, color: '#475569' }}>{T.subtitle}</div>
      </div>

      {/* Disclaimer */}
      <div style={{ fontSize: 10, color: '#94a3b8', padding: '7px 10px', borderRadius: 5, background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.18)', marginBottom: 12, lineHeight: 1.5 }}>
        {T.disclaimer}
      </div>

      {/* Suspense balance widget */}
      {suspense.length > 0 && (
        <div
          onClick={() => setSubTab('suspense')}
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 6, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', marginBottom: 12, cursor: 'pointer' }}>
          <span style={{ fontSize: 18, fontWeight: 900, color: '#f59e0b', fontVariantNumeric: 'tabular-nums' }}>{suspense.length}</span>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b' }}>{T.suspenseCount}</div>
            <div style={{ fontSize: 10, color: '#78716c' }}>{T.suspenseDesc?.slice(0, 80)}…</div>
          </div>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: '#f59e0b' }}>→</span>
        </div>
      )}

      {/* Flash */}
      {flash && <div style={{ fontSize: 11, color: '#10b981', padding: '5px 10px', borderRadius: 5, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', marginBottom: 10 }}>{flash}</div>}

      {/* Sub-tab bar */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 14 }}>
        {[['periods', T.tabPeriods], ['profiles', T.tabProfiles], ['suspense', T.tabSuspense], ['registration', T.tabRegistration]].map(([id, label]) => (
          <button key={id} onClick={() => setSubTab(id)} style={{
            background: 'none', border: 'none',
            color: subTab === id ? '#f97316' : '#64748b',
            fontSize: 11, fontWeight: subTab === id ? 700 : 500,
            padding: '5px 12px', cursor: 'pointer',
            borderBottom: subTab === id ? '2px solid #f97316' : '2px solid transparent',
            fontFamily: 'inherit',
          }}>{label}</button>
        ))}
      </div>

      {/* ── PERIODS TAB ── */}
      {subTab === 'periods' && (
        <div>
          {/* New period compute panel */}
          <div style={cardStyle}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#f97316', marginBottom: 10 }}>{T.newPeriod}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 9, color: '#64748b', marginBottom: 3 }}>{T.periodType}</div>
                <select value={periodType} onChange={e => setPeriodType(e.target.value)} style={{ ...inputStyle, width: '100%' }}>
                  <option value="quarterly">{T.typeQuarterly}</option>
                  <option value="monthly">{T.typeMonthly}</option>
                  <option value="annual">{T.typeAnnual}</option>
                </select>
              </div>
              <div>
                <div style={{ fontSize: 9, color: '#64748b', marginBottom: 3 }}>{T.periodStart}</div>
                <input type="month" value={pStart} onChange={e => setPStart(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
              </div>
              <div>
                <div style={{ fontSize: 9, color: '#64748b', marginBottom: 3 }}>{T.periodEnd}</div>
                <input type="month" value={pEnd} onChange={e => setPEnd(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={doCompute} disabled={computing} style={btnPrimary}>
                {computing ? T.computing : T.compute}
              </button>
              {computed && <button onClick={doSave} disabled={loading} style={btnTeal}>{T.save}</button>}
            </div>
          </div>

          {/* Computed result */}
          {computed && (
            <div style={{ ...cardStyle, border: '1px solid rgba(20,184,166,0.3)' }}>
              {computed.blockers?.length > 0 && (
                <div style={{ fontSize: 11, color: '#f59e0b', padding: '6px 10px', borderRadius: 5, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', marginBottom: 10 }}>
                  ⚠ {T.blockerWarning} ({computed.suspenseCount} {T.suspenseCount})
                </div>
              )}
              <div style={rowStyle}>
                <span style={labelStyle}>{T.tpsCollected} (5%)</span>
                <span style={valueStyle}>{fmt(computed.tpsCollected)}</span>
              </div>
              <div style={rowStyle}>
                <span style={labelStyle}>{T.tvqCollected} (9,975%)</span>
                <span style={valueStyle}>{fmt(computed.tvqCollected)}</span>
              </div>
              <div style={{ ...rowStyle, marginTop: 6 }}>
                <span style={labelStyle}>{T.tpsCti} ({computed.billCount} {T.billCount})</span>
                <span style={greenValue}>{fmt(computed.tpsCti)}</span>
              </div>
              <div style={rowStyle}>
                <span style={labelStyle}>{T.tvqRti}</span>
                <span style={greenValue}>{fmt(computed.tvqRti)}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                <div style={{ padding: '8px 12px', borderRadius: 6, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <div style={{ fontSize: 9, color: '#ef4444', marginBottom: 2 }}>{T.netTps}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: computed.netTpsOwed <= 0 ? '#10b981' : '#ef4444', fontFamily: 'monospace' }}>{fmt(computed.netTpsOwed)}</div>
                </div>
                <div style={{ padding: '8px 12px', borderRadius: 6, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <div style={{ fontSize: 9, color: '#ef4444', marginBottom: 2 }}>{T.netTvq}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: computed.netTvqOwed <= 0 ? '#10b981' : '#ef4444', fontFamily: 'monospace' }}>{fmt(computed.netTvqOwed)}</div>
                </div>
              </div>
              {computed.billCount === 0 && (
                <div style={{ fontSize: 10, color: '#f59e0b', marginTop: 8, padding: '5px 8px', borderRadius: 4, background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.18)' }}>
                  ℹ {T.noBills}
                </div>
              )}
            </div>
          )}

          {/* Saved periods list */}
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', margin: '14px 0 8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{T.tabPeriods}</div>
          {periods.length === 0 ? (
            <div style={{ fontSize: 11, color: '#475569', padding: '10px 0' }}>{T.noPeriods}</div>
          ) : periods.map(p => (
            <div key={p.id} style={{ ...cardStyle, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>{p.period_start} → {p.period_end}</div>
                  <div style={{ fontSize: 10, color: '#64748b' }}>{p.period_type}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 8,
                    background: p.status === 'filed' ? 'rgba(16,185,129,0.15)' : 'rgba(249,115,22,0.12)',
                    color: p.status === 'filed' ? '#10b981' : '#f97316',
                    border: `1px solid ${p.status === 'filed' ? 'rgba(16,185,129,0.3)' : 'rgba(249,115,22,0.25)'}`,
                  }}>
                    {p.status === 'filed' ? T.statusFiled : T.statusOpen}
                  </span>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 20px', marginBottom: 8 }}>
                {[
                  [T.tpsCollected, fmt(p.tps_collected)],
                  [T.tvqCollected, fmt(p.tvq_collected)],
                  [T.tpsCti, fmt(p.tps_cti), true],
                  [T.tvqRti, fmt(p.tvq_rti), true],
                  [T.netTps, fmt(p.net_tps_owed), false, true],
                  [T.netTvq, fmt(p.net_tvq_owed), false, true],
                ].map(([label, value, isGreen, isRed], i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                    <span style={{ color: '#64748b' }}>{label}</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 600, color: isGreen ? '#10b981' : isRed ? '#ef4444' : '#e2e8f0' }}>{value}</span>
                  </div>
                ))}
              </div>
              {p.status === 'filed' && p.filed_at && (
                <div style={{ fontSize: 10, color: '#10b981', marginBottom: 6 }}>
                  ✓ {T.filedAt}: {new Date(p.filed_at).toLocaleDateString(lang === 'en' ? 'en-CA' : 'fr-CA')}
                  {p.confirmation_number ? ` — ${p.confirmation_number}` : ''}
                </div>
              )}
              <div style={{ display: 'flex', gap: 6 }}>
                {p.status !== 'filed' && (
                  <button onClick={() => doMarkFiled(p)} style={btnTeal}>{T.markFiled}</button>
                )}
                <button onClick={() => doExportFPZ(p)} style={btnSecondary}>{T.exportFPZ}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── PROFILES TAB ── */}
      {subTab === 'profiles' && (
        <div>
          {/* Add/edit form */}
          <div style={cardStyle}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 9, color: '#64748b', marginBottom: 3 }}>{T.profileSupplier}</div>
                <input value={profName} onChange={e => setProfName(e.target.value)} placeholder="Nom du fournisseur" style={{ ...inputStyle, width: '100%' }} />
              </div>
              <div>
                <div style={{ fontSize: 9, color: '#64748b', marginBottom: 3 }}>{T.profileTps}</div>
                <input type="number" value={profTps} onChange={e => setProfTps(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
              </div>
              <div>
                <div style={{ fontSize: 9, color: '#64748b', marginBottom: 3 }}>{T.profileTvq}</div>
                <input type="number" value={profTvq} onChange={e => setProfTvq(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
              <label style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 11, color: '#94a3b8', cursor: 'pointer' }}>
                <input type="checkbox" checked={profAppliesTps} onChange={e => setProfAppliesTps(e.target.checked)} />
                TPS
              </label>
              <label style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 11, color: '#94a3b8', cursor: 'pointer' }}>
                <input type="checkbox" checked={profAppliesTvq} onChange={e => setProfAppliesTvq(e.target.checked)} />
                TVQ
              </label>
            </div>
            <button onClick={doSaveProfile} disabled={!profName} style={btnPrimary}>{T.addProfile}</button>
          </div>
          {profiles.length === 0 ? (
            <div style={{ fontSize: 11, color: '#475569', padding: '10px 0' }}>{T.noProfiles}</div>
          ) : profiles.map(p => (
            <div key={p.id} style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>{p.supplier_name}</div>
                <div style={{ fontSize: 10, color: '#64748b' }}>
                  {p.applies_tps ? `TPS ${fmtPct(p.tps_rate)}` : ''}{p.applies_tps && p.applies_tvq ? ' · ' : ''}{p.applies_tvq ? `TVQ ${fmtPct(p.tvq_rate)}` : ''}
                </div>
              </div>
              <button onClick={() => doDeleteProfile(p.id)} style={{ ...btnSecondary, color: '#ef4444', borderColor: 'rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.06)' }}>
                {T.deleteProfile}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── SUSPENSE / CASH EXPENSE TAB ── */}
      {subTab === 'suspense' && (
        <div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 12, lineHeight: 1.6 }}>{T.suspenseDesc}</div>
          {suspense.length === 0 ? (
            <div style={{ fontSize: 12, color: '#10b981', padding: '12px 0' }}>✓ {T.noSuspense}</div>
          ) : suspense.map(tx => (
            <div key={tx.id} style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 600 }}>{tx.description}</div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                  {tx.transaction_date} · {tx.coa_name_fr || tx.coa_account_id}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: tx.amount < 0 ? '#ef4444' : '#10b981', fontFamily: 'monospace' }}>
                  {fmt(tx.amount)}
                </span>
                <button onClick={() => doClassifyCash(tx)} style={btnSecondary}>{T.classifyCash}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── REGISTRATION TAB ── */}
      {subTab === 'registration' && (
        <div style={{ padding: '4px 0' }}>
          <QuebecTaxWizard lang={lang} locationId={null} />
        </div>
      )}
    </div>
  );
}
