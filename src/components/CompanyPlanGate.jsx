import React, { useEffect, useState } from 'react';

// Shown instead of the app when an additional company has no paid plan of its own.
// It holds the sign-in and subscription controls, so the company can be set up
// right here, and lets you go back to another company.

const UI = {
  en: {
    title: (n) => `"${n}" needs its own plan`,
    body: 'Each company in BalanceIQ is a separate business with its own books, its own BalanceIQ account and its own paid plan. Sign in with this company\'s account, or create one, then choose a plan.',
    note: 'Your other companies are not affected.',
    useOther: 'Open another company',
    main: 'Main company',
    conflict: (n) => `That BalanceIQ account is already used by "${n}". Sign in with a separate account for this company.`,
  },
  fr: {
    title: (n) => `« ${n} » a besoin de son propre forfait`,
    body: 'Chaque entreprise dans BalanceIQ est une entreprise distincte, avec ses propres livres, son propre compte BalanceIQ et son propre forfait payant. Connectez-vous avec le compte de cette entreprise, ou créez-en un, puis choisissez un forfait.',
    note: 'Vos autres entreprises ne sont pas touchées.',
    useOther: 'Ouvrir une autre entreprise',
    main: 'Entreprise principale',
    conflict: (n) => `Ce compte BalanceIQ est déjà utilisé par « ${n} ». Connectez-vous avec un compte distinct pour cette entreprise.`,
  },
};

export default function CompanyPlanGate({ lang = 'fr', t = {}, company = null, conflictName = null, children }) {
  const L = UI[lang] || UI.fr;
  const [others, setOthers] = useState([]);
  useEffect(() => {
    window.api?.companies?.list?.()
      .then(r => setOthers((r?.companies || []).filter(c => c.id !== r.activeId)))
      .catch(() => {});
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: t.bg, color: t.text, display: 'flex', justifyContent: 'center', padding: '48px 16px' }}>
      <div style={{ width: 'min(620px, 100%)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ background: t.card, border: `1px solid ${t.cardBorder}`, borderRadius: 12, padding: '18px 20px' }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{L.title(company?.name || '')}</div>
          <div style={{ fontSize: 13, color: t.textSub, marginTop: 8, lineHeight: 1.55 }}>{L.body}</div>
          <div style={{ fontSize: 12, color: t.textMuted, marginTop: 6 }}>{L.note}</div>
          {conflictName != null && (
            <div style={{ fontSize: 12.5, color: '#ef4444', marginTop: 10 }}>{L.conflict(conflictName || L.main)}</div>
          )}
        </div>
        {children}
        {others.length > 0 && (
          <div style={{ background: t.card, border: `1px solid ${t.cardBorder}`, borderRadius: 12, padding: '14px 20px' }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>{L.useOther}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {others.map(c => (
                <button key={c.id} type="button" onClick={() => window.api?.companies?.switch({ id: c.id })}
                  style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${t.cardBorder}`, background: t.section, color: t.textSub, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                  {c.name || L.main}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
