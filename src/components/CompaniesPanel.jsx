import React, { useCallback, useEffect, useState } from 'react';

// Settings > Companies. Each company is a separate business with separate books.

const UI = {
  en: {
    title: 'Companies',
    intro: 'Keep the books for more than one business on this Mac. Each company is completely separate: its own data, backups, BalanceIQ account and plan. Switching restarts the app in the other company.',
    pricing: 'Your main company uses the plan it has today. Each additional company needs its own paid plan, at full price, signed in with its own BalanceIQ account.',
    main: 'Main company',
    active: 'Open now',
    switchTo: 'Switch to this company',
    rename: 'Rename',
    save: 'Save',
    cancel: 'Cancel',
    addTitle: 'Add a company',
    namePlaceholder: 'Company name',
    add: 'Add company',
    adding: 'Adding…',
    added: (n) => `"${n}" was added. Switch to it to set it up.`,
    needName: 'Enter a name for the company.',
    nameTaken: 'A company with that name already exists.',
    failed: 'The company could not be added.',
    confirmSwitch: (n) => `Switch to "${n}"? BalanceIQ will restart in that company.`,
  },
  fr: {
    title: 'Entreprises',
    intro: 'Tenez les livres de plus d\'une entreprise sur ce Mac. Chaque entreprise est entièrement séparée : ses données, ses sauvegardes, son compte BalanceIQ et son forfait. Changer d\'entreprise redémarre l\'application dans l\'autre entreprise.',
    pricing: 'Votre entreprise principale garde son forfait actuel. Chaque entreprise additionnelle a besoin de son propre forfait payant, au plein prix, avec son propre compte BalanceIQ.',
    main: 'Entreprise principale',
    active: 'Ouverte',
    switchTo: 'Passer à cette entreprise',
    rename: 'Renommer',
    save: 'Enregistrer',
    cancel: 'Annuler',
    addTitle: 'Ajouter une entreprise',
    namePlaceholder: 'Nom de l\'entreprise',
    add: 'Ajouter l\'entreprise',
    adding: 'Ajout…',
    added: (n) => `« ${n} » a été ajoutée. Passez-y pour la configurer.`,
    needName: 'Entrez un nom pour l\'entreprise.',
    nameTaken: 'Une entreprise porte déjà ce nom.',
    failed: 'L\'entreprise n\'a pas pu être ajoutée.',
    confirmSwitch: (n) => `Passer à « ${n} » ? BalanceIQ redémarrera dans cette entreprise.`,
  },
};

export default function CompaniesPanel({ lang = 'fr', t = {} }) {
  const L = UI[lang] || UI.fr;
  const [data, setData] = useState(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(null);
  const [editName, setEditName] = useState('');

  const load = useCallback(async () => {
    try { setData(await window.api?.companies?.list()); }
    catch (_) { setData({ companies: [], activeId: null }); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const label = (c) => c.name || L.main;

  const add = async () => {
    const n = name.trim();
    if (!n) { setError(L.needName); return; }
    setBusy(true); setError(''); setNotice('');
    const r = await window.api?.companies?.create({ name: n });
    setBusy(false);
    if (!r?.ok) { setError(r?.error === 'name_taken' ? L.nameTaken : L.failed); return; }
    setName(''); setNotice(L.added(r.company.name)); load();
  };

  const rename = async (c) => {
    const n = editName.trim();
    if (!n) return;
    const r = await window.api?.companies?.rename({ id: c.id, name: n });
    if (!r?.ok) { setError(r?.error === 'name_taken' ? L.nameTaken : L.failed); return; }
    setEditing(null); setError(''); load();
  };

  const switchTo = async (c) => {
    if (!window.confirm(L.confirmSwitch(label(c)))) return;
    await window.api?.companies?.switch({ id: c.id });
  };

  const card = { background: t.card, border: `1px solid ${t.cardBorder}`, borderRadius: 10, padding: '14px 16px' };
  const input = { background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 5, color: t.inputText, fontSize: 12.5, padding: '6px 9px', outline: 'none' };
  const btn = (primary) => ({
    padding: '5px 12px', borderRadius: 6, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
    border: primary ? 'none' : `1px solid ${t.cardBorder}`,
    background: primary ? 'linear-gradient(135deg,#f97316,#ea580c)' : t.section, color: primary ? '#fff' : t.textSub,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{L.title}</div>
        <div style={{ fontSize: 11.5, color: t.textMuted, marginTop: 4, lineHeight: 1.5 }}>{L.intro}</div>
        <div style={{ fontSize: 11.5, color: '#f97316', marginTop: 6, lineHeight: 1.5 }}>{L.pricing}</div>
      </div>

      <div style={card}>
        {(data?.companies || []).map((c, i) => {
          const isActive = c.id === data.activeId;
          return (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 0', borderTop: i ? `1px solid ${t.divider}` : 'none' }}>
              {editing === c.id ? (
                <>
                  <input autoFocus style={{ ...input, flex: '1 1 200px' }} value={editName} onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') rename(c); if (e.key === 'Escape') setEditing(null); }} />
                  <button type="button" style={btn(true)} onClick={() => rename(c)}>{L.save}</button>
                  <button type="button" style={btn(false)} onClick={() => setEditing(null)}>{L.cancel}</button>
                </>
              ) : (
                <>
                  <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{label(c)}</div>
                    {c.primary && c.name && <div style={{ fontSize: 10.5, color: t.textMuted }}>{L.main}</div>}
                  </div>
                  {isActive
                    ? <span style={{ fontSize: 10.5, fontWeight: 700, color: '#22c55e', background: 'rgba(34,197,94,0.1)', borderRadius: 8, padding: '2px 8px' }}>{L.active}</span>
                    : <button type="button" style={btn(true)} onClick={() => switchTo(c)}>{L.switchTo}</button>}
                  <button type="button" style={btn(false)} onClick={() => { setEditing(c.id); setEditName(c.name || ''); setError(''); }}>{L.rename}</button>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div style={card}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: t.text, marginBottom: 8 }}>{L.addTitle}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input style={{ ...input, flex: '1 1 240px' }} placeholder={L.namePlaceholder} value={name}
            onChange={e => { setName(e.target.value); setError(''); }} onKeyDown={e => { if (e.key === 'Enter') add(); }} />
          <button type="button" style={btn(true)} disabled={busy} onClick={add}>{busy ? L.adding : L.add}</button>
        </div>
        {error && <div style={{ fontSize: 11.5, color: '#ef4444', marginTop: 6 }}>{error}</div>}
        {notice && <div style={{ fontSize: 11.5, color: '#22c55e', marginTop: 6 }}>{notice}</div>}
      </div>
    </div>
  );
}
