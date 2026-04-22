import React, { useState, useEffect, useCallback } from 'react';

const UI = {
  fr: {
    title: 'Déclarations TPS/TVQ',
    subtitle: 'Crédits de taxes sur intrants (CTI/RTI)',
    disclaimer: 'BalanceIQ produit ces calculs à titre indicatif. La responsabilité de la conformité fiscale incombe au contribuable. Consultez votre comptable avant toute déclaration.',
    tabPeriods: 'Périodes',
    tabProfiles: 'Profils fournisseurs',
    tabSuspense: 'Dépenses comptant',
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
    exportFPZ: 'Exporter FPZ-500-V',
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
  },
  en: {
    title: 'GST/QST Filings',
    subtitle: 'Input Tax Credits (ITC/ITR)',
    disclaimer: 'BalanceIQ produces these calculations for informational purposes. Tax compliance responsibility rests with the taxpayer. Consult your accountant before filing.',
    tabPeriods: 'Periods',
    tabProfiles: 'Supplier Profiles',
    tabSuspense: 'Cash Expenses',
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
    exportFPZ: 'Export FPZ-500-V',
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

function buildFPZ500HTML(period, T, lang) {
  const isFr = lang !== 'en';
  const co = lang === 'en' ? 'Canada' : 'Canada';
  const today = new Date().toLocaleDateString(isFr ? 'fr-CA' : 'en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
  const netTps = Math.max(0, period.net_tps_owed || 0);
  const netTvq = Math.max(0, period.net_tvq_owed || 0);

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>FPZ-500-V — ${period.period_start} → ${period.period_end}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font:11px/1.5 Arial,sans-serif;color:#222;padding:24px;max-width:720px}
h1{font-size:16px;color:#ea580c;margin-bottom:4px}
h2{font-size:12px;color:#555;text-transform:uppercase;letter-spacing:0.5px;margin:16px 0 6px;padding-bottom:3px;border-bottom:1px solid #ddd}
.field{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f0f0f0;font-size:11px}
.field-label{color:#555;flex:1}
.field-value{font-weight:700;text-align:right;min-width:120px;font-family:Arial,sans-serif}
.box{border:2px solid #ea580c;padding:10px 14px;border-radius:4px;margin:12px 0}
.box-label{font-size:9px;text-transform:uppercase;color:#ea580c;letter-spacing:0.5px;margin-bottom:4px}
.box-value{font-size:20px;font-weight:700;color:#222}
.disclaimer{font-size:10px;color:#888;border-left:3px solid #f97316;padding:6px 10px;margin:14px 0;background:#fff8f0;line-height:1.5}
.sub{font-size:9px;color:#aaa}
.green{color:#16a34a}
.red{color:#dc2626}
</style></head><body>
<h1>${isFr ? 'Sommaire TPS/TVQ — FPZ-500-V' : 'GST/QST Summary — FPZ-500-V'}</h1>
<p class="sub">${isFr ? 'Généré le' : 'Generated'} ${today} &nbsp;|&nbsp; BalanceIQ</p>
<div class="disclaimer">${T.disclaimer}</div>

<h2>${isFr ? 'Période de déclaration' : 'Reporting period'}</h2>
<div class="field"><span class="field-label">${isFr ? 'Début' : 'Start'}</span><span class="field-value">${period.period_start}</span></div>
<div class="field"><span class="field-label">${isFr ? 'Fin' : 'End'}</span><span class="field-value">${period.period_end}</span></div>
<div class="field"><span class="field-label">${isFr ? 'Type' : 'Type'}</span><span class="field-value">${period.period_type}</span></div>

<h2>TPS ${isFr ? '(Taxe sur les produits et services)' : '(Goods and Services Tax)'}</h2>
<div class="field"><span class="field-label">${T.tpsCollected} (5%)</span><span class="field-value">${fmt(period.tps_collected)}</span></div>
<div class="field"><span class="field-label">${T.tpsCti}</span><span class="field-value class="green"">${fmt(period.tps_cti)}</span></div>
<div class="box">
  <div class="box-label">${T.netTps}</div>
  <div class="box-value ${netTps > 0 ? 'red' : 'green'}">${fmt(netTps)}</div>
</div>

<h2>TVQ ${isFr ? '(Taxe de vente du Québec)' : '(Quebec Sales Tax)'}</h2>
<div class="field"><span class="field-label">${T.tvqCollected} (9,975%)</span><span class="field-value">${fmt(period.tvq_collected)}</span></div>
<div class="field"><span class="field-label">${T.tvqRti}</span><span class="field-value">${fmt(period.tvq_rti)}</span></div>
<div class="box">
  <div class="box-label">${T.netTvq}</div>
  <div class="box-value ${netTvq > 0 ? 'red' : 'green'}">${fmt(netTvq)}</div>
</div>

${period.status === 'filed' ? `<h2>${isFr ? 'Déclaration produite' : 'Filing submitted'}</h2>
<div class="field"><span class="field-label">${T.filedAt}</span><span class="field-value">${period.filed_at ? new Date(period.filed_at).toLocaleDateString(isFr ? 'fr-CA' : 'en-CA') : '—'}</span></div>
${period.confirmation_number ? `<div class="field"><span class="field-label">${T.confirmNum}</span><span class="field-value">${period.confirmation_number}</span></div>` : ''}` : ''}

<p class="sub" style="margin-top:20px">BalanceIQ &nbsp;|&nbsp; ${isFr ? 'À usage indicatif — validez avec votre comptable' : 'For reference only — validate with your accountant'}</p>
</body></html>`;
}

export default function TaxPeriodTab({ lang }) {
  const T = UI[lang] || UI.fr;

  const taxAvailable = !!window.api?.tax;

  // All hooks unconditional
  const [subTab, setSubTab] = useState('periods');
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
  }, [loadPeriods, taxAvailable]);

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
    setLoading(true);
    try {
      await window.api.tax.period.save({
        periodType, periodStart: pStart, periodEnd: pEnd,
        tpsCollected: computed.tpsCollected, tvqCollected: computed.tvqCollected,
        tpsCti: computed.tpsCti, tvqRti: computed.tvqRti,
        netTpsOwed: computed.netTpsOwed, netTvqOwed: computed.netTvqOwed,
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
    const html = buildFPZ500HTML(period, T, lang);
    if (window.api?.pdf?.print) {
      window.api.pdf.print(html);
    } else {
      const w = window.open('', '_blank');
      if (w) { w.document.write(html); w.document.close(); w.print(); }
    }
  }, [T, lang]);

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
    <div style={{ padding: '0 0 24px', maxWidth: 700, fontFamily: "'Satoshi',-apple-system,BlinkMacSystemFont,sans-serif" }}>
      {/* Header */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 2 }}>{T.title}</div>
        <div style={{ fontSize: 11, color: '#64748b' }}>{T.subtitle}</div>
      </div>

      {/* Disclaimer */}
      <div style={{ fontSize: 10, color: '#94a3b8', padding: '7px 10px', borderRadius: 5, background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.18)', marginBottom: 12, lineHeight: 1.5 }}>
        {T.disclaimer}
      </div>

      {/* Flash */}
      {flash && <div style={{ fontSize: 11, color: '#10b981', padding: '5px 10px', borderRadius: 5, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', marginBottom: 10 }}>{flash}</div>}

      {/* Sub-tab bar */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 14 }}>
        {[['periods', T.tabPeriods], ['profiles', T.tabProfiles], ['suspense', T.tabSuspense]].map(([id, label]) => (
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
    </div>
  );
}
