import React, { useEffect, useState } from 'react';

// On the client form: which payment reminders this client receives.

const UI = {
  en: {
    title: 'Payment reminders',
    all: 'All reminders',
    custom: 'Only these',
    none: 'No reminders',
    days: (n) => `${n} days after due`,
    empty: 'No reminders created yet. Add them in Invoicing > Reminders.',
    untitled: '(no subject)',
  },
  fr: {
    title: 'Rappels de paiement',
    all: 'Tous les rappels',
    custom: 'Seulement ceux-ci',
    none: 'Aucun rappel',
    days: (n) => `${n} jours après l'échéance`,
    empty: 'Aucun rappel créé. Ajoutez-en dans Facturation > Rappels.',
    untitled: '(sans objet)',
  },
};

export default function ClientReminderPicker({ mode = 'all', stepIds = [], onChange, en = false, t = {} }) {
  const L = en ? UI.en : UI.fr;
  const [steps, setSteps] = useState([]);
  useEffect(() => {
    window.api?.reminders?.ladder?.list?.()
      .then(ladders => {
        const ladder = (ladders || []).find(l => l.is_default) || (ladders || [])[0];
        setSteps([...(ladder?.steps || [])].sort((a, b) => a.days_after_due - b.days_after_due));
      })
      .catch(() => {});
  }, []);

  const selected = new Set((stepIds || []).map(Number));
  const setMode = (m) => onChange && onChange({
    reminderMode: m,
    reminderStepIds: m === 'custom' && !selected.size ? steps.map(s => s.id) : (stepIds || []),
  });
  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(Number(id))) next.delete(Number(id)); else next.add(Number(id));
    onChange && onChange({ reminderMode: 'custom', reminderStepIds: [...next] });
  };
  const subject = (s) => (en ? (s.subject_en || s.subject_fr) : (s.subject_fr || s.subject_en)) || L.untitled;
  const radio = { display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: t.textSub, cursor: 'pointer' };

  return (
    <div>
      <div style={{ fontSize: 10, color: t.textMuted, marginBottom: 4 }}>{L.title}</div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {['all', 'custom', 'none'].map(m => (
          <label key={m} style={radio}>
            <input type="radio" checked={mode === m} onChange={() => setMode(m)} style={{ accentColor: '#f97316' }} />
            {L[m]}
          </label>
        ))}
      </div>
      {mode === 'custom' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6, paddingLeft: 4 }}>
          {steps.length === 0 && <div style={{ fontSize: 11, color: t.textMuted }}>{L.empty}</div>}
          {steps.map(s => (
            <label key={s.id} style={radio}>
              <input type="checkbox" checked={selected.has(Number(s.id))} onChange={() => toggle(s.id)} style={{ accentColor: '#f97316' }} />
              <span style={{ fontWeight: 600, color: t.text }}>{L.days(s.days_after_due)}</span>
              <span style={{ color: t.textMuted }}>{subject(s)}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
