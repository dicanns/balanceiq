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
  filings:    { fr: 'Contenu disponible dans la sous-étape 7D', en: 'Content available in sub-sprint 7D' },
  documents:  { fr: 'Contenu disponible dans la sous-étape 7E', en: 'Content available in sub-sprint 7E' },
  accountant: { fr: 'Contenu disponible dans une prochaine sous-étape', en: 'Content available in a future sub-sprint' },
};

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

        {/* Other sub-tabs — placeholder */}
        {subTab !== 'periods' && (
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
