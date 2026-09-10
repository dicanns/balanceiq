import React, { useState, useEffect, useRef } from 'react';

const TYPE_LABELS = {
  asset:     { fr: 'Actifs',          en: 'Assets' },
  liability: { fr: 'Passifs',         en: 'Liabilities' },
  equity:    { fr: 'Capitaux propres',en: 'Equity' },
  revenue:   { fr: 'Revenus',         en: 'Revenue' },
  cogs:      { fr: 'Coût des ventes', en: 'COGS' },
  expense:   { fr: 'Frais',           en: 'Expenses' },
};
const TYPE_ORDER = ['asset','liability','equity','revenue','cogs','expense'];

const UI = {
  fr: {
    itcLabel: 'CTI',
    itcHelp: "Part de la TPS/TVQ payée sur ce compte qui peut être réclamée. 100 % pour la plupart des dépenses; les repas et représentation sont limités à 50 %. Validez avec votre comptable.",
    search:        'Rechercher un compte…',
    simplified:    'Mode simplifié',
    showArchived:  'Afficher archivés',
    hideArchived:  'Masquer archivés',
    import:        'Importer CSV',
    importing:     'Importation…',
    export:        'Exporter CSV',
    addAccount:    '+ Ajouter un compte',
    noAccounts:    'Aucun compte trouvé.',
    editAccount:   'Modifier le compte',
    newAccount:    'Nouveau compte',
    accountNum:    'N° de compte *',
    nameFr:        'Nom (FR) *',
    nameEn:        'Nom (EN)',
    type:          'Type *',
    taxHint:       'Indice fiscal',
    noTax:         'Aucun',
    tpsOnly:       'TPS seulement',
    tvqOnly:       'TVQ seulement',
    both:          'TPS + TVQ',
    contra:        'Compte de contrepartie',
    simplified_cb: 'Mode simplifié',
    cancel:        'Annuler',
    save:          'Enregistrer',
    create:        'Créer',
    edit:          'Modifier',
    archive:       'Archiver',
    restore:       'Restaurer',
    archiveConfirm:(num, name) => `Archiver le compte ${num} — ${name} ?`,
    importOk:      (c, s) => `Import: ${c} créé(s), ${s} ignoré(s)`,
    requiredErr:   'Numéro et nom (FR) requis.',
    saveErr:       'Erreur lors de la sauvegarde.',
    count:         (n) => `(${n})`,
  },
  en: {
    itcLabel: 'ITC',
    itcHelp: "Share of the GST/QST paid on this account that can be claimed. 100% for most expenses; meals and entertainment are limited to 50%. Confirm with your accountant.",
    search:        'Search accounts…',
    simplified:    'Simplified mode',
    showArchived:  'Show archived',
    hideArchived:  'Hide archived',
    import:        'Import CSV',
    importing:     'Importing…',
    export:        'Export CSV',
    addAccount:    '+ Add account',
    noAccounts:    'No accounts found.',
    editAccount:   'Edit account',
    newAccount:    'New account',
    accountNum:    'Account # *',
    nameFr:        'Name (FR) *',
    nameEn:        'Name (EN)',
    type:          'Type *',
    taxHint:       'Tax hint',
    noTax:         'None',
    tpsOnly:       'GST only',
    tvqOnly:       'QST only',
    both:          'GST + QST',
    contra:        'Contra account',
    simplified_cb: 'Simplified mode',
    cancel:        'Cancel',
    save:          'Save',
    create:        'Create',
    edit:          'Edit',
    archive:       'Archive',
    restore:       'Restore',
    archiveConfirm:(num, name) => `Archive account ${num} — ${name}?`,
    importOk:      (c, s) => `Import: ${c} created, ${s} skipped`,
    requiredErr:   'Account number and name (FR) are required.',
    saveErr:       'Error saving account.',
    count:         (n) => `(${n})`,
  },
};

function AccountModal({ account, lang, onSave, onClose, C = { text:'#e2e8f0', sub:'#94a3b8', muted:'#64748b', card:'#0f1724', border:'#1e293b', inputBg:'#0f1724' } }) {
  const t = UI[lang] || UI.fr;
  const [form, setForm] = useState({
    account_number: account?.account_number || '',
    name_fr:        account?.name_fr || '',
    name_en:        account?.name_en || '',
    type:           account?.type || 'expense',
    tax_hint:       account?.tax_hint || '',
    is_contra:      account?.is_contra || 0,
    is_simplified:  account?.is_simplified || 0,
  });
  const [error, setError] = useState('');
  const isEdit = !!account;

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSave() {
    if (!form.account_number.trim() || !form.name_fr.trim()) {
      setError(t.requiredErr); return;
    }
    if (!window.api?.coa) { setError('API non disponible — redémarrez l\'application.'); return; }
    try {
      if (isEdit) {
        await window.api.coa.update(account.id, {
          name_fr:       form.name_fr,
          name_en:       form.name_en,
          type:          form.type,
          tax_hint:      form.tax_hint || null,
          is_contra:     form.is_contra ? 1 : 0,
          is_simplified: form.is_simplified ? 1 : 0,
        });
      } else {
        await window.api.coa.create({
          account_number: form.account_number.trim(),
          name_fr:        form.name_fr.trim(),
          name_en:        form.name_en.trim() || form.name_fr.trim(),
          type:           form.type,
          tax_hint:       form.tax_hint || null,
          is_contra:      form.is_contra ? 1 : 0,
          is_simplified:  form.is_simplified ? 1 : 0,
        });
      }
      onSave();
    } catch (e) {
      setError(
        String(e?.message || '').includes('ERR_ACCOUNT_NUMBER_TAKEN')
          ? (lang === 'en'
              ? `Account number ${String(e.message).split('|')[1] || ''} is already in use.`
              : `Le numéro de compte ${String(e.message).split('|')[1] || ''} est déjà utilisé.`)
          : (e.message || t.saveErr)
      );
    }
  }

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999 }}>
      <div style={{ background:'#1a1d27',border:'1px solid #2a2d3a',borderRadius:12,padding:28,width:480,maxWidth:'90vw' }}>
        <h3 style={{ margin:'0 0 20px',color:C.text,fontSize:16 }}>
          {isEdit ? t.editAccount : t.newAccount}
        </h3>
        {error && <div style={{ background:'#7f1d1d',color:'#fca5a5',padding:'8px 12px',borderRadius:6,marginBottom:14,fontSize:13 }}>{error}</div>}
        <div style={{ display:'grid',gap:14 }}>
          <label style={labelStyle}>
            <span>{t.accountNum}</span>
            <input style={inputStyle} value={form.account_number} disabled={isEdit}
              onChange={e => set('account_number', e.target.value)} placeholder="ex. 6510" />
          </label>
          <label style={labelStyle}>
            <span>{t.nameFr}</span>
            <input style={inputStyle} value={form.name_fr} onChange={e => set('name_fr', e.target.value)} />
          </label>
          <label style={labelStyle}>
            <span>{t.nameEn}</span>
            <input style={inputStyle} value={form.name_en} onChange={e => set('name_en', e.target.value)} />
          </label>
          <label style={labelStyle}>
            <span>{t.type}</span>
            <select style={inputStyle} value={form.type} onChange={e => set('type', e.target.value)}>
              {TYPE_ORDER.map(tp => <option key={tp} value={tp}>{TYPE_LABELS[tp][lang] || TYPE_LABELS[tp].fr}</option>)}
            </select>
          </label>
          <label style={labelStyle}>
            <span>{t.taxHint}</span>
            <select style={inputStyle} value={form.tax_hint || ''} onChange={e => set('tax_hint', e.target.value)}>
              <option value="">{t.noTax}</option>
              <option value="tps">{t.tpsOnly}</option>
              <option value="tvq">{t.tvqOnly}</option>
              <option value="both">{t.both}</option>
            </select>
          </label>
          <div style={{ display:'flex',gap:20 }}>
            <label style={{ color:C.sub,fontSize:13,display:'flex',alignItems:'center',gap:8,cursor:'pointer' }}>
              <input type="checkbox" checked={!!form.is_contra} onChange={e => set('is_contra', e.target.checked ? 1 : 0)} />
              {t.contra}
            </label>
            <label style={{ color:C.sub,fontSize:13,display:'flex',alignItems:'center',gap:8,cursor:'pointer' }}>
              <input type="checkbox" checked={!!form.is_simplified} onChange={e => set('is_simplified', e.target.checked ? 1 : 0)} />
              {t.simplified_cb}
            </label>
          </div>
        </div>
        <div style={{ display:'flex',justifyContent:'flex-end',gap:10,marginTop:22 }}>
          <button onClick={onClose} style={btnSecStyle}>{t.cancel}</button>
          <button onClick={handleSave} style={btnPrimStyle}>
            {isEdit ? t.save : t.create}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ChartOfAccountsTab({ lang = 'fr', t: theme }) {
  const C = {
    text:   theme?.text       ?? '#e2e8f0',
    sub:    theme?.textSub    ?? '#94a3b8',
    muted:  theme?.textMuted  ?? '#64748b',
    card:   theme?.card       ?? '#0f1724',
    border: theme?.cardBorder ?? '#1e293b',
    inputBg:theme?.inputBg    ?? '#0f1724',
  };
  const [accounts, setAccounts] = useState([]);
  const [search, setSearch] = useState('');
  const [simplified, setSimplified] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [modal, setModal] = useState(null); // null | 'create' | account object
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const fileRef = useRef();
  const t = UI[lang] || UI.fr;

  async function load() {
    try {
      if (!window.api?.coa?.list) return;
      const list = await window.api.coa.list();
      setAccounts(Array.isArray(list) ? list : []);
    } catch (_) {}
  }

  useEffect(() => { load(); }, []);

  const filtered = accounts.filter(a => {
    if (!showArchived && a.is_archived) return false;
    if (simplified && !a.is_simplified) return false;
    if (search) {
      const s = search.toLowerCase();
      return a.account_number.includes(s) || a.name_fr.toLowerCase().includes(s) || (a.name_en||'').toLowerCase().includes(s);
    }
    return true;
  });

  const grouped = TYPE_ORDER.map(type => ({
    type,
    rows: filtered.filter(a => a.type === type),
  })).filter(g => g.rows.length > 0);

  // Written straight through on change: this is one number, and making the user
  // open a dialog to move it from 100 to 50 would be friction for nothing.
  async function handleItcPct(acct, value) {
    const pct = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
    setAccounts(prev => prev.map(a => a.id === acct.id ? { ...a, itc_pct: pct } : a));
    try { await window.api?.coa?.setItcPct(acct.id, pct); } catch (_) { load(); }
  }

  async function handleArchive(acct) {
    if (!window.api?.coa || !confirm(t.archiveConfirm(acct.account_number, acct.name_fr))) return;
    await window.api.coa.archive(acct.id);
    load();
  }

  async function handleUnarchive(acct) {
    if (!window.api?.coa) return;
    await window.api.coa.unarchive(acct.id);
    load();
  }

  async function handleExport() {
    if (!window.api?.coa) return;
    const csv = await window.api.coa.exportCSV();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'plan-comptable.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setImporting(true);
    const text = await file.text();
    const result = await window.api.coa.importCSV(text);
    setImportResult(result);
    setImporting(false);
    load();
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div style={{ padding:'16px 20px 40px', fontFamily:"'Satoshi',-apple-system,BlinkMacSystemFont,sans-serif", background:C.card, borderRadius:12, color:C.text, minHeight:400 }}>
      {/* Header toolbar */}
      <div style={{ display:'flex',alignItems:'center',gap:12,marginBottom:20,flexWrap:'wrap' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder={t.search}
          style={{ ...inputStyle, width:220, flex:'none' }}
        />
        <button
          onClick={() => setSimplified(s => !s)}
          style={{ ...btnSecStyle, background: simplified ? '#1e3a5f' : undefined, color: simplified ? '#60a5fa' : undefined }}
        >
          {simplified ? '✓ ' : ''}{t.simplified}
        </button>
        <button onClick={() => setShowArchived(s => !s)} style={{ ...btnSecStyle, fontSize:12 }}>
          {showArchived ? t.hideArchived : t.showArchived}
        </button>

        <div style={{ flex:1 }} />
        <input ref={fileRef} type="file" accept=".csv" style={{ display:'none' }} onChange={handleImportFile} />
        <button onClick={() => fileRef.current?.click()} style={btnSecStyle} disabled={importing}>
          {importing ? t.importing : t.import}
        </button>
        <button onClick={handleExport} style={btnSecStyle}>{t.export}</button>
        <button onClick={() => setModal('create')} style={btnPrimStyle}>{t.addAccount}</button>
      </div>

      {importResult && (
        <div style={{ background:'#0f2a1a',border:'1px solid #166534',borderRadius:8,padding:'10px 16px',marginBottom:16,fontSize:13,color:'#86efac' }}>
          {t.importOk(importResult.created, importResult.skipped)}
          {importResult.errors.length > 0 && (
            <div style={{ color:'#fca5a5',marginTop:6 }}>
              {importResult.errors.map((e,i) => <div key={i}>{e}</div>)}
            </div>
          )}
          <button onClick={() => setImportResult(null)} style={{ float:'right',background:'none',border:'none',color:'#86efac',cursor:'pointer' }}>✕</button>
        </div>
      )}

      {/* Account table grouped by type */}
      {grouped.length === 0 && (
        <div style={{ textAlign:'center',color:'#475569',padding:'40px 0' }}>{t.noAccounts}</div>
      )}
      {grouped.map(({ type, rows }) => (
        <div key={type} style={{ marginBottom:24 }}>
          <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:8 }}>
            <span style={{ fontSize:11,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.08em' }}>
              {TYPE_LABELS[type][lang] || TYPE_LABELS[type].fr}
            </span>
            <span style={{ fontSize:11,color:C.border }}>{t.count(rows.length)}</span>
          </div>
          <table style={{ width:'100%',borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid #1e2130' }}>
                <th style={thStyle}>{lang === 'fr' ? 'N°' : '#'}</th>
                <th style={thStyle}>{lang === 'fr' ? 'Nom' : 'Name'}</th>
                <th style={thStyle}>{lang === 'fr' ? 'Fiscal' : 'Tax'}</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(acct => (
                <tr key={acct.id} style={{ borderBottom:'1px solid #13151f', opacity: acct.is_archived ? 0.45 : 1 }}>
                  <td style={tdStyle}>
                    <span style={{ fontFamily:'monospace',color:C.sub,fontSize:13 }}>{acct.account_number}</span>
                    {acct.is_system ? <span style={tagStyle('#1e3a5f','#60a5fa')}>sys</span> : null}
                    {acct.is_contra ? <span style={tagStyle('#3b1f00','#fb923c')}>contra</span> : null}
                    {acct.is_archived ? <span style={tagStyle('#1a1a2e','#6b7280')}>{lang === 'fr' ? 'archivé' : 'archived'}</span> : null}
                  </td>
                  <td style={tdStyle}>
                    <span style={{ color:C.text,fontSize:14 }}>{lang === 'fr' ? acct.name_fr : (acct.name_en || acct.name_fr)}</span>
                  </td>
                  <td style={tdStyle}>
                    {acct.tax_hint
                      ? <span style={tagStyle('#1a2a1a','#4ade80')}>{acct.tax_hint.toUpperCase()}</span>
                      : <span style={{ color:C.border,fontSize:12 }}>-</span>}
                    {['expense','cogs'].includes(acct.type) && (
                      <span style={{ marginLeft: 8, whiteSpace: 'nowrap' }}>
                        <span style={{ color:C.sub, fontSize:11 }}>{t.itcLabel}</span>
                        <input type="number" min="0" max="100" step="5"
                          value={acct.itc_pct == null ? 100 : acct.itc_pct}
                          onChange={e => handleItcPct(acct, e.target.value)}
                          title={t.itcHelp}
                          style={{ width: 52, marginLeft: 5, background:'#0f1119',
                            border:`1px solid ${(acct.itc_pct ?? 100) === 100 ? C.border : '#a1791f'}`,
                            borderRadius:4, color:(acct.itc_pct ?? 100) === 100 ? C.sub : '#fbbf24',
                            fontSize:12, padding:'2px 5px', textAlign:'right' }} />
                        <span style={{ color:C.sub, fontSize:11, marginLeft:2 }}>%</span>
                      </span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, textAlign:'right', whiteSpace:'nowrap' }}>
                    {!acct.is_system && !acct.is_archived && (
                      <button onClick={() => setModal(acct)} style={rowBtnStyle}>{t.edit}</button>
                    )}
                    {!acct.is_archived
                      ? <button onClick={() => handleArchive(acct)} style={{ ...rowBtnStyle, color:'#f87171' }}>{t.archive}</button>
                      : <button onClick={() => handleUnarchive(acct)} style={{ ...rowBtnStyle, color:'#4ade80' }}>{t.restore}</button>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {modal && (
        <AccountModal
          C={C}
          account={modal === 'create' ? null : modal}
          lang={lang}
          onSave={() => { setModal(null); load(); }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const inputStyle = {
  background:'#0c0e14', border:'1px solid #2a2d3a', borderRadius:6,
  color:'#e2e8f0', padding:'7px 10px', fontSize:13, outline:'none', width:'100%',
};
const labelStyle = { display:'flex', flexDirection:'column', gap:5, color:'#94a3b8', fontSize:13 };
const btnPrimStyle = {
  background:'linear-gradient(135deg,#f97316,#ea580c)', border:'none',
  borderRadius:6, color:'#fff', padding:'8px 14px', fontSize:13, cursor:'pointer', fontWeight:600,
};
const btnSecStyle = {
  background:'#1a1d27', border:'1px solid #2a2d3a', borderRadius:6,
  color:'#94a3b8', padding:'7px 12px', fontSize:13, cursor:'pointer',
};
const thStyle = {
  textAlign:'left', padding:'5px 10px', fontSize:11, color:'#8b93a1',
  fontWeight:600, textTransform:'uppercase', letterSpacing:'0.05em',
};
const tdStyle = { padding:'8px 10px', verticalAlign:'middle' };
const rowBtnStyle = {
  background:'none', border:'none', color:'#64748b', fontSize:12,
  cursor:'pointer', padding:'3px 8px', marginLeft:4,
};
function tagStyle(bg, color) {
  return {
    display:'inline-block', marginLeft:6, padding:'1px 6px',
    borderRadius:4, fontSize:10, fontWeight:700, background:bg, color,
  };
}
