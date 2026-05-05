import React, { useState } from 'react';

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
  filings:    { fr: 'Contenu disponible dans la sous-étape 7B', en: 'Content available in sub-sprint 7B' },
  periods:    { fr: 'Contenu disponible dans la sous-étape 7C', en: 'Content available in sub-sprint 7C' },
  documents:  { fr: 'Contenu disponible dans la sous-étape 7E', en: 'Content available in sub-sprint 7E' },
  accountant: { fr: 'Contenu disponible dans une prochaine sous-étape', en: 'Content available in a future sub-sprint' },
};

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
  const next = fr ? PLACEHOLDER_NEXT[subTab].fr : PLACEHOLDER_NEXT[subTab].en;

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
            {next}
          </div>
        </div>
      </div>
    </div>
  );
}
