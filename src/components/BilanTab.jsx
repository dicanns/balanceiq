import { useState, useEffect, useCallback } from 'react';

const T = {
  fr: {
    title: 'Bilan',
    asOf: 'Au',
    compute: 'Calculer le bilan',
    computing: 'Calcul en cours...',
    draft: 'Bilan provisoire',
    final: 'Bilan final',
    draftBanner: 'Bilan provisoire — anomalies detectees',
    finalBanner: 'Bilan final — tous les elements sont reconcilies',
    noEntries: 'Aucune ecriture comptabilisee. Commencez par saisir un solde d\'ouverture dans le Grand livre.',
    assets: 'ACTIFS',
    currentAssets: 'Actifs a court terme',
    longTermAssets: 'Actifs a long terme',
    totalAssets: 'TOTAL DES ACTIFS',
    liabilities: 'PASSIFS',
    currentLiab: 'Passifs a court terme',
    longTermLiab: 'Passifs a long terme',
    totalLiab: 'TOTAL DES PASSIFS',
    equity: 'CAPITAUX PROPRES',
    netIncome: 'Resultat de l\'exercice',
    totalEquity: 'TOTAL DES CAPITAUX PROPRES',
    totalLiabEquity: 'TOTAL PASSIFS + CAPITAUX PROPRES',
    exceptions: 'Exceptions comptables',
    resolve: 'Resoudre',
    snapshot: 'Archiver ce bilan',
    snapshots: 'Bilans archives',
    noSnapshots: 'Aucun bilan archive',
    snapshotSaved: 'Bilan archive',
    balanced: 'Equilibre',
    imbalance: 'Desequilibre',
    diff: 'Ecart',
    proOnly: 'Disponible en version Pro',
    upgradeBtn: 'Passer a Pro',
  },
  en: {
    title: 'Balance Sheet',
    asOf: 'As of',
    compute: 'Compute balance sheet',
    computing: 'Computing...',
    draft: 'Draft balance sheet',
    final: 'Final balance sheet',
    draftBanner: 'Draft balance sheet — exceptions detected',
    finalBanner: 'Final balance sheet — all items reconciled',
    noEntries: 'No posted journal entries. Start by posting an opening balance entry in the General Ledger.',
    assets: 'ASSETS',
    currentAssets: 'Current assets',
    longTermAssets: 'Long-term assets',
    totalAssets: 'TOTAL ASSETS',
    liabilities: 'LIABILITIES',
    currentLiab: 'Current liabilities',
    longTermLiab: 'Long-term liabilities',
    totalLiab: 'TOTAL LIABILITIES',
    equity: 'EQUITY',
    netIncome: 'Net income for the period',
    totalEquity: 'TOTAL EQUITY',
    totalLiabEquity: 'TOTAL LIABILITIES + EQUITY',
    exceptions: 'Accounting exceptions',
    resolve: 'Resolve',
    snapshot: 'Archive this balance sheet',
    snapshots: 'Archived balance sheets',
    noSnapshots: 'No archived balance sheets',
    snapshotSaved: 'Balance sheet archived',
    balanced: 'Balanced',
    imbalance: 'Imbalanced',
    diff: 'Difference',
    proOnly: 'Available in Pro plan',
    upgradeBtn: 'Upgrade to Pro',
  },
};

const fmtAmt = (val) => {
  const n = typeof val === 'number' ? val : 0;
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `(${formatted})` : formatted;
};

const today = () => new Date().toISOString().slice(0, 10);
const lastMonthEnd = () => {
  const d = new Date();
  d.setDate(0);
  return d.toISOString().slice(0, 10);
};

function SectionRow({ label, value, bold, indent = 0, light }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: `${bold ? 4 : 2}px ${indent * 16}px 2px 0`, borderBottom: bold ? '1px solid rgba(148,163,184,0.15)' : 'none', marginBottom: bold ? 3 : 0 }}>
      <span style={{ fontSize: bold ? 12 : 11.5, fontWeight: bold ? 700 : 400, color: light ? '#94a3b8' : bold ? '#f1f5f9' : '#cbd5e1', paddingLeft: indent * 12 }}>{label}</span>
      <span style={{ fontSize: bold ? 12 : 11.5, fontWeight: bold ? 700 : 500, color: light ? '#64748b' : bold ? '#f1f5f9' : '#e2e8f0', fontVariantNumeric: 'tabular-nums', fontFamily: 'ui-monospace, monospace' }}>{fmtAmt(value)}</span>
    </div>
  );
}

function Section({ title, accounts = [], total, indent = 1 }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10.5, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, paddingLeft: indent * 12 }}>{title}</div>
      {accounts.map((a, i) => (
        <SectionRow key={i} label={`${a.account_number} — ${a.name_fr}`} value={a.balance} indent={indent + 1} />
      ))}
      <SectionRow label={`Total — ${title}`} value={total} bold indent={indent} />
    </div>
  );
}

export default function BilanTab({ lang = 'fr', canUsePro = false, onUpgrade }) {
  const L = T[lang] || T.fr;
  const [asOfDate, setAsOfDate] = useState(lastMonthEnd());
  const [bilan, setBilan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [snapshots, setSnapshots] = useState([]);
  const [saved, setSaved] = useState(false);

  const loadSnapshots = useCallback(async () => {
    try {
      const list = await window.api.bilan.snapshot.list();
      setSnapshots(list || []);
    } catch (_) {}
  }, []);

  useEffect(() => { loadSnapshots(); }, [loadSnapshots]);

  const compute = async () => {
    setLoading(true);
    setError(null);
    setBilan(null);
    setSaved(false);
    try {
      const result = await window.api.bilan.compute(asOfDate);
      setBilan(result);
    } catch (e) {
      setError(e.message || 'Erreur de calcul');
    } finally {
      setLoading(false);
    }
  };

  const handleSnapshot = async () => {
    if (!bilan || bilan.status !== 'final') return;
    try {
      const year = parseInt(asOfDate.slice(0, 4), 10);
      await window.api.bilan.snapshot.save({
        snapshot_date: asOfDate,
        fiscal_year: year,
        status: 'final',
        sections: bilan.sections,
        total_assets_cents: Math.round((bilan.sections?.totalAssets || 0) * 100),
        total_liabilities_cents: Math.round((bilan.sections?.totalLiabilities || 0) * 100),
        total_equity_cents: Math.round((bilan.sections?.equity?.total || 0) * 100),
      });
      setSaved(true);
      loadSnapshots();
    } catch (e) {
      setError(e.message || 'Erreur sauvegarde');
    }
  };

  const hasData = bilan && bilan.sections && bilan.sections.totalAssets !== undefined;
  const isEmpty = hasData && bilan.sections.totalAssets === 0 && bilan.sections.totalLiabilities === 0;

  const card = { background: '#1e293b', border: '1px solid rgba(148,163,184,0.12)', borderRadius: 10, padding: '14px 16px', marginBottom: 12 };
  const btn = { padding: '7px 18px', borderRadius: 7, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12, fontFamily: "'Satoshi',-apple-system,BlinkMacSystemFont,sans-serif" };

  if (!canUsePro) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', marginBottom: 8 }}>{L.title}</div>
        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 16 }}>{L.proOnly}</div>
        {onUpgrade && <button onClick={onUpgrade} style={{ ...btn, background: 'linear-gradient(135deg,#f97316,#ea580c)', color: '#fff' }}>{L.upgradeBtn}</button>}
      </div>
    );
  }

  return (
    <div style={{ padding: '12px 0', maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <span style={{ fontSize: 16, fontWeight: 800, color: '#f1f5f9' }}>{L.title}</span>
        <span style={{ fontSize: 12, color: '#64748b' }}>{L.asOf}</span>
        <input type="date" value={asOfDate} onChange={e => setAsOfDate(e.target.value)}
          style={{ background: '#0f172a', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 6, color: '#f1f5f9', fontSize: 12, padding: '4px 8px', outline: 'none' }} />
        <button onClick={compute} disabled={loading}
          style={{ ...btn, background: 'linear-gradient(135deg,#f97316,#ea580c)', color: '#fff', opacity: loading ? 0.6 : 1 }}>
          {loading ? L.computing : L.compute}
        </button>
      </div>

      {error && <div style={{ padding: '8px 12px', borderRadius: 7, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5', fontSize: 12, marginBottom: 12 }}>{error}</div>}

      {hasData && !isEmpty && (
        <>
          {/* Status banner */}
          <div style={{ padding: '8px 14px', borderRadius: 8, marginBottom: 12, background: bilan.status === 'final' ? 'rgba(34,197,94,0.08)' : 'rgba(249,115,22,0.08)', border: `1px solid ${bilan.status === 'final' ? 'rgba(34,197,94,0.25)' : 'rgba(249,115,22,0.25)'}` }}>
            <span style={{ fontWeight: 700, fontSize: 12.5, color: bilan.status === 'final' ? '#86efac' : '#fdba74' }}>{bilan.status === 'final' ? L.finalBanner : L.draftBanner}</span>
            {!bilan.isBalanced && (
              <span style={{ fontSize: 11, color: '#fca5a5', marginLeft: 12 }}>{L.diff}: {fmtAmt(bilan.trialBalanceDiff / 100)}</span>
            )}
          </div>

          {/* Exceptions */}
          {bilan.blockers && bilan.blockers.length > 0 && (
            <div style={{ ...card, border: '1px solid rgba(249,115,22,0.2)', marginBottom: 14 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#fdba74', marginBottom: 8 }}>{L.exceptions}</div>
              {bilan.blockers.map((b, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid rgba(148,163,184,0.08)', fontSize: 11.5, color: '#94a3b8' }}>
                  <span>{lang === 'fr' ? b.label_fr : b.label_en}</span>
                  <span style={{ fontSize: 10, color: b.blocking === false ? '#f59e0b' : '#ef4444', fontWeight: 600 }}>{b.blocking === false ? 'Avertissement' : 'Bloquant'}</span>
                </div>
              ))}
            </div>
          )}

          {/* ACTIFS */}
          <div style={card}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: '#f1f5f9', marginBottom: 10, borderBottom: '1px solid rgba(148,163,184,0.2)', paddingBottom: 6 }}>{L.assets}</div>
            <Section title={L.currentAssets} accounts={bilan.sections.currentAssets?.accounts || []} total={bilan.sections.currentAssets?.total || 0} />
            <Section title={L.longTermAssets} accounts={bilan.sections.longTermAssets?.accounts || []} total={bilan.sections.longTermAssets?.total || 0} />
            <SectionRow label={L.totalAssets} value={bilan.sections.totalAssets || 0} bold />
          </div>

          {/* PASSIFS */}
          <div style={card}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: '#f1f5f9', marginBottom: 10, borderBottom: '1px solid rgba(148,163,184,0.2)', paddingBottom: 6 }}>{L.liabilities}</div>
            <Section title={L.currentLiab} accounts={bilan.sections.currentLiab?.accounts || []} total={bilan.sections.currentLiab?.total || 0} />
            <Section title={L.longTermLiab} accounts={bilan.sections.longTermLiab?.accounts || []} total={bilan.sections.longTermLiab?.total || 0} />
            <SectionRow label={L.totalLiab} value={bilan.sections.totalLiabilities || 0} bold />
          </div>

          {/* CAPITAUX */}
          <div style={card}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: '#f1f5f9', marginBottom: 10, borderBottom: '1px solid rgba(148,163,184,0.2)', paddingBottom: 6 }}>{L.equity}</div>
            {(bilan.sections.equity?.accounts || []).map((a, i) => (
              <SectionRow key={i} label={`${a.account_number} — ${a.name_fr}`} value={a.balance} indent={1} />
            ))}
            <SectionRow label={L.netIncome} value={bilan.sections.equity?.netIncome || 0} indent={1} />
            <SectionRow label={L.totalEquity} value={bilan.sections.equity?.total || 0} bold />
          </div>

          {/* TOTAL */}
          <div style={{ ...card, background: bilan.isBalanced ? 'rgba(34,197,94,0.05)' : 'rgba(239,68,68,0.05)', border: `1px solid ${bilan.isBalanced ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
            <SectionRow label={L.totalLiabEquity} value={bilan.sections.totalLiabAndEquity || 0} bold />
          </div>

          {/* Archive button */}
          {bilan.status === 'final' && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 4 }}>
              <button onClick={handleSnapshot} style={{ ...btn, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', color: '#86efac' }}>{L.snapshot}</button>
              {saved && <span style={{ fontSize: 11, color: '#86efac' }}>{L.snapshotSaved}</span>}
            </div>
          )}
        </>
      )}

      {hasData && isEmpty && (
        <div style={{ padding: '18px 14px', borderRadius: 8, background: 'rgba(148,163,184,0.05)', border: '1px solid rgba(148,163,184,0.1)', fontSize: 12, color: '#64748b', textAlign: 'center' }}>{L.noEntries}</div>
      )}

      {/* Archived snapshots */}
      {snapshots.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 8 }}>{L.snapshots}</div>
          {snapshots.map(s => (
            <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 10px', borderRadius: 6, background: '#0f172a', border: '1px solid rgba(148,163,184,0.1)', marginBottom: 4, fontSize: 11.5, color: '#94a3b8' }}>
              <span>{s.snapshot_date}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtAmt((s.total_assets_cents || 0) / 100)}</span>
              <span style={{ fontSize: 10, color: s.status === 'final' ? '#86efac' : '#fdba74', fontWeight: 600 }}>{s.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
