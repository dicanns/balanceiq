import React, { useState, useEffect } from 'react';

export const COMPLIANCE_SUBTABS = [
  { id: 'filings',    labelFr: 'Déclarations',      labelEn: 'Filings' },
  { id: 'periods',    labelFr: 'Périodes',           labelEn: 'Periods' },
  { id: 'documents',  labelFr: 'Documents',          labelEn: 'Documents' },
  { id: 'accountant', labelFr: 'Révision comptable', labelEn: 'Accountant review' },
];

const PLACEHOLDER_ICONS = {
  filings:    '📋',
  periods:    '📅',
  documents:  '📁',
  accountant: '🔍',
};

const PLACEHOLDER_NEXT = {
  filings:    { fr: 'Disponible prochainement.', en: 'Coming soon.' },
  accountant: { fr: 'Disponible prochainement.', en: 'Coming soon.' },
};

const UI_DOCS = {
  fr: {
    title: 'Documents requis — CTI/RTI (art. 169(4) LTA)',
    subtitle: 'Factures d\'achat de plus de 100 $ avec CTI/RTI réclamés mais sans pièce justificative dans le Coffre-fort.',
    allClear: 'Toutes les factures avec CTI/RTI sont documentées.',
    flagged: (n) => `${n} facture(s) sans pièce justificative`,
    goVault: 'Ouvrir le Coffre-fort',
    supplier: 'Fournisseur',
    amount: 'Montant',
    cti: 'CTI+RTI',
    date: 'Date',
    period: 'Période',
    noDoc: 'Pièce manquante',
  },
  en: {
    title: 'Required Documents — ITC/ITR (s. 169(4) ETA)',
    subtitle: 'Purchase bills over $100 with ITC/ITR claimed but no supporting document in the Vault.',
    allClear: 'All bills with ITC/ITR claims are documented.',
    flagged: (n) => `${n} bill(s) missing supporting documents`,
    goVault: 'Open Vault',
    supplier: 'Supplier',
    amount: 'Amount',
    cti: 'ITC+ITR',
    date: 'Date',
    period: 'Period',
    noDoc: 'Doc missing',
  },
};

function DocumentsSubTab({ lang, t }) {
  const fr = lang !== 'en';
  const T = UI_DOCS[fr ? 'fr' : 'en'];
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!window.api?.vaultCompliance?.check) { setLoading(false); return; }
    window.api.vaultCompliance.check().then(rows => {
      setBills(rows || []);
      setLoading(false);
    });
  }, []);

  if (loading) return <div style={{ fontSize: 12, color: '#64748b', padding: 12 }}>…</div>;

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 4 }}>{T.title}</div>
      <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 16, lineHeight: 1.5 }}>{T.subtitle}</div>

      {bills.length === 0 ? (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px', borderRadius: 8,
          background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
        }}>
          <span style={{ fontSize: 18 }}>✓</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#16a34a' }}>{T.allClear}</span>
        </div>
      ) : (
        <>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
            padding: '8px 14px', borderRadius: 8,
            background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)',
          }}>
            <span style={{ fontSize: 16 }}>⚠️</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#dc2626' }}>
              {T.flagged(bills.length)}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {bills.map(b => {
              const cti = ((parseFloat(b.tps_paid) || 0) + (parseFloat(b.tvq_paid) || 0)).toFixed(2);
              return (
                <div key={b.id} style={{
                  background: t.card,
                  border: `1px solid rgba(239,68,68,0.2)`,
                  borderRadius: 8,
                  padding: '10px 14px',
                  display: 'grid',
                  gridTemplateColumns: '1fr auto auto auto auto',
                  gap: '0 16px',
                  alignItems: 'center',
                }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: t.text, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {b.supplier_name}
                  </span>
                  <span style={{ fontSize: 11, color: t.textSub, fontFamily: 'monospace' }}>
                    ${parseFloat(b.amount).toFixed(2)}
                  </span>
                  <span style={{ fontSize: 11, color: '#dc2626', fontFamily: 'monospace' }}>
                    CTI ${cti}
                  </span>
                  <span style={{ fontSize: 10, color: t.textMuted }}>
                    {b.bill_date || b.month_key || '—'}
                  </span>
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: '2px 7px',
                    borderRadius: 8, background: 'rgba(239,68,68,0.1)', color: '#dc2626',
                    whiteSpace: 'nowrap',
                  }}>
                    {T.noDoc}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

const STATUS_COLORS = {
  open:   { bg: 'rgba(100,116,139,0.15)', text: '#94a3b8' },
  filed:  { bg: 'rgba(34,197,94,0.12)',   text: '#22c55e' },
  paid:   { bg: 'rgba(59,130,246,0.12)',  text: '#60a5fa' },
};

const UI_PERIODS = {
  fr: {
    title: 'Périodes de déclaration',
    noPeriods: 'Aucune période configurée.',
    noPeriodsHint: 'Allez dans Configuration → TPS/TVQ → Enregistrement pour configurer votre profil fiscal et générer vos périodes.',
    status: { open: 'Ouverte', filed: 'Produite', paid: 'Payée' },
    start: 'Début',
    end: 'Fin',
    type: 'Type',
  },
  en: {
    title: 'Filing Periods',
    noPeriods: 'No periods configured.',
    noPeriodsHint: 'Go to Configuration → GST/QST → Registration to set up your tax profile and generate periods.',
    status: { open: 'Open', filed: 'Filed', paid: 'Paid' },
    start: 'Start',
    end: 'End',
    type: 'Type',
  },
};

function PeriodsSubTab({ lang, t }) {
  const fr = lang !== 'en';
  const T = UI_PERIODS[fr ? 'fr' : 'en'];
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!window.api?.tax?.period?.list) { setLoading(false); return; }
    window.api.tax.period.list().then(rows => {
      setPeriods(rows || []);
      setLoading(false);
    });
  }, []);

  if (loading) return <div style={{ fontSize: 12, color: '#64748b', padding: 12 }}>…</div>;

  if (periods.length === 0) {
    return (
      <div style={{
        background: t.card,
        border: `1px solid ${t.cardBorder}`,
        borderRadius: 12,
        padding: 28,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
        maxWidth: 480,
        margin: '0 auto',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 32 }}>📅</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{T.noPeriods}</div>
        <div style={{ fontSize: 11, color: t.textMuted, lineHeight: 1.6 }}>{T.noPeriodsHint}</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 14 }}>{T.title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {periods.map(p => {
          const status = p.filed_at ? (p.paid_amount != null ? 'paid' : 'filed') : 'open';
          const sc = STATUS_COLORS[status];
          const statusLabel = T.status[status];
          return (
            <div key={p.id} style={{
              background: t.card,
              border: `1px solid ${t.cardBorder}`,
              borderRadius: 8,
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 8px',
                borderRadius: 10, background: sc.bg, color: sc.text,
                whiteSpace: 'nowrap',
              }}>
                {statusLabel}
              </span>
              <span style={{ fontSize: 11, color: t.textSub, fontFamily: 'monospace', minWidth: 80 }}>
                {p.period_start}
              </span>
              <span style={{ fontSize: 11, color: t.textMuted }}>→</span>
              <span style={{ fontSize: 11, color: t.textSub, fontFamily: 'monospace', minWidth: 80 }}>
                {p.period_end}
              </span>
              <span style={{ fontSize: 10, color: t.textMuted, flex: 1 }}>
                {p.period_type}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ComplianceTab({ t, lang, canUse }) {
  const [subTab, setSubTab] = useState('filings');
  const fr = lang !== 'en';

  if (!canUse('canadaCompliance')) {
    return (
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, maxWidth: 480, margin: '60px auto' }}>
        <div style={{ fontSize: 32 }}>🇨🇦</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: t.text, textAlign: 'center' }}>
          {fr ? 'Espace de conformité Canada' : 'Canada Compliance Workspace'}
        </div>
        <div style={{ fontSize: 12, color: t.textSub, textAlign: 'center', lineHeight: 1.6 }}>
          {fr
            ? 'Suivez vos obligations fiscales canadiennes — déclarations TPS/TVQ, périodes, documents requis et révision comptable — en un seul endroit.'
            : 'Track your Canadian tax obligations — GST/QST filings, periods, required documents, and accountant review — all in one place.'}
        </div>
        <div style={{
          padding: '12px 18px',
          borderRadius: 8,
          background: 'rgba(249,115,22,0.08)',
          border: '1px solid rgba(249,115,22,0.25)',
          fontSize: 11,
          fontWeight: 700,
          color: '#f97316',
        }}>
          {fr ? 'Fonctionnalité Pro' : 'Pro feature'}
        </div>
      </div>
    );
  }

  const cur = COMPLIANCE_SUBTABS.find(s => s.id === subTab);
  const label = fr ? cur.labelFr : cur.labelEn;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: t.bg }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px 0',
        borderBottom: `1px solid ${t.dividerMid}`,
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: t.text, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          🇨🇦
          {fr ? 'Conformité fiscale' : 'Tax Compliance'}
        </div>

        {/* Sub-tabs */}
        <div style={{ display: 'flex', gap: 2, overflowX: 'auto' }}>
          {COMPLIANCE_SUBTABS.map(s => {
            const lbl = fr ? s.labelFr : s.labelEn;
            const active = s.id === subTab;
            return (
              <button
                key={s.id}
                onClick={() => setSubTab(s.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: active ? '#f97316' : t.textMuted,
                  fontSize: 11,
                  fontWeight: active ? 700 : 500,
                  padding: '5px 12px',
                  cursor: 'pointer',
                  borderBottom: active ? '2px solid #f97316' : '2px solid transparent',
                  whiteSpace: 'nowrap',
                  fontFamily: "'Satoshi',-apple-system,BlinkMacSystemFont,sans-serif",
                }}
              >
                {PLACEHOLDER_ICONS[s.id]} {lbl}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content area */}
      <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        {/* Periods sub-tab — live data */}
        {subTab === 'periods' && <PeriodsSubTab lang={lang} t={t} />}

        {/* Documents sub-tab — vault compliance check */}
        {subTab === 'documents' && <DocumentsSubTab lang={lang} t={t} />}

        {/* Other sub-tabs — placeholder */}
        {subTab !== 'periods' && subTab !== 'documents' && (
          <div style={{
            background: t.card,
            border: `1px solid ${t.cardBorder}`,
            borderRadius: 12,
            padding: 32,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
            maxWidth: 480,
            margin: '0 auto',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 36 }}>{PLACEHOLDER_ICONS[subTab]}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>{label}</div>
            <div style={{
              fontSize: 11,
              color: t.textMuted,
              background: t.section,
              border: `1px solid ${t.cardBorder}`,
              borderRadius: 6,
              padding: '8px 14px',
              fontStyle: 'italic',
            }}>
              {PLACEHOLDER_NEXT[subTab] ? (fr ? PLACEHOLDER_NEXT[subTab].fr : PLACEHOLDER_NEXT[subTab].en) : ''}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
