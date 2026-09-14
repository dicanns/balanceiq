import React from 'react';

// The to-do list. One line per thing waiting on you, each with the one button that
// opens the screen that resolves it. Not a dashboard: nothing here is decorative,
// and when there is nothing to do it says so rather than filling the space.

const TONES = {
  alert: { dot: '#ef4444', label: { en: 'Overdue', fr: 'En retard' } },
  warn:  { dot: '#f59e0b', label: { en: 'To do',   fr: 'À faire' } },
  info:  { dot: '#60a5fa', label: { en: 'Set up',  fr: 'À configurer' } },
};

export default function TodayWorklist({ items = [], loading = false, onOpen, t = {}, lang = 'fr' }) {
  const en = lang === 'en';
  const text = t.text || '#e2e8f0';
  const muted = t.textMuted || '#64748b';
  const card = t.card || '#161822';
  const border = t.cardBorder || '#2d3148';

  const heading = (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: text }}>
        {en ? 'What needs you' : 'Ce qui vous attend'}
      </div>
      <div style={{ fontSize: 11.5, color: muted }}>
        {en ? 'Checked each time you switch screens' : 'Vérifié à chaque changement d\'écran'}
      </div>
    </div>
  );

  if (!loading && items.length === 0) {
    return (
      <div style={{ maxWidth: 760 }}>
        {heading}
        <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 10, padding: '22px 20px' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: text }}>
            {en ? 'Nothing needs your attention.' : 'Rien ne demande votre attention.'}
          </div>
          <div style={{ fontSize: 12.5, color: muted, marginTop: 5, lineHeight: 1.5 }}>
            {en
              ? 'Overdue invoices, bank lines to categorize, cash against the bank and your next GST/QST return all check out.'
              : 'Factures en retard, lignes bancaires, encaisse contre banque et prochaine déclaration TPS/TVQ : tout est en ordre.'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 760 }}>
      {heading}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(item => {
          const tone = TONES[item.tone] || TONES.warn;
          return (
            <li key={item.id} style={{
              display: 'grid', gridTemplateColumns: '10px 1fr auto', alignItems: 'center', gap: 14,
              background: card, border: `1px solid ${border}`, borderRadius: 10, padding: '13px 16px',
            }}>
              <span aria-label={tone.label[en ? 'en' : 'fr']}
                style={{ width: 9, height: 9, borderRadius: '50%', background: tone.dot }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: text }}>{item.title}</div>
                {item.detail && (
                  <div style={{ fontSize: 12, color: muted, marginTop: 3, lineHeight: 1.45 }}>{item.detail}</div>
                )}
              </div>
              <button type="button" onClick={() => onOpen && onOpen(item.target)}
                style={{
                  background: 'none', border: `1px solid ${border}`, borderRadius: 6, color: text,
                  fontSize: 12, fontWeight: 600, padding: '6px 12px', cursor: 'pointer', whiteSpace: 'nowrap',
                }}>
                {item.cta}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
