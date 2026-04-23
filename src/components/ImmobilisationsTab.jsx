import { useState, useEffect, useCallback } from 'react';

const T = {
  fr: {
    title: 'Immobilisations & DPA',
    addAsset: 'Ajouter un bien',
    noAssets: 'Aucune immobilisation enregistree',
    name: 'Description',
    coaAccount: 'Compte GL',
    ccaClass: 'Classe DPA',
    acquisitionDate: 'Date d\'acquisition',
    cost: 'Cout d\'acquisition',
    personalUse: 'Usage personnel (%)',
    disposalDate: 'Date de cession',
    disposalProceeds: 'Produit de cession',
    notes: 'Notes',
    save: 'Enregistrer',
    cancel: 'Annuler',
    delete: 'Archiver',
    confirmDelete: 'Archiver cette immobilisation?',
    schedule: 'Calendrier DPA',
    year: 'Annee',
    uccOpening: 'FNACC ouverture',
    additions: 'Acquisitions',
    disposals: 'Dispositions',
    ccaClaimed: 'DPA reclamee',
    uccClosing: 'FNACC cloture',
    computeSchedule: 'Calculer le calendrier',
    fiscalYear: 'Annee fiscale',
    noSchedule: 'Aucune immobilisation pour cette annee',
    proOnly: 'Disponible en version Pro',
    upgradeBtn: 'Passer a Pro',
    halfYearNote: 'Regle de la demi-annee appliquee a la premiere annee',
    classHelp: {
      '8':  'Classe 8 — Equipement divers (20% degressif)',
      '10': 'Classe 10 — Vehicules (30% degressif)',
      '12': 'Classe 12 — Petits outils / uniformes (100%)',
      '13': 'Classe 13 — Ameliorations locatives (lineaire)',
      '50': 'Classe 50 — Materiel informatique (55% degressif)',
    },
  },
  en: {
    title: 'Fixed Assets & CCA',
    addAsset: 'Add asset',
    noAssets: 'No assets recorded',
    name: 'Description',
    coaAccount: 'GL account',
    ccaClass: 'CCA class',
    acquisitionDate: 'Acquisition date',
    cost: 'Acquisition cost',
    personalUse: 'Personal use (%)',
    disposalDate: 'Disposal date',
    disposalProceeds: 'Disposal proceeds',
    notes: 'Notes',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Archive',
    confirmDelete: 'Archive this asset?',
    schedule: 'CCA schedule',
    year: 'Year',
    uccOpening: 'UCC opening',
    additions: 'Additions',
    disposals: 'Disposals',
    ccaClaimed: 'CCA claimed',
    uccClosing: 'UCC closing',
    computeSchedule: 'Compute schedule',
    fiscalYear: 'Fiscal year',
    noSchedule: 'No assets for this year',
    proOnly: 'Available in Pro plan',
    upgradeBtn: 'Upgrade to Pro',
    halfYearNote: 'Half-year rule applied in first year',
    classHelp: {
      '8':  'Class 8 — Misc equipment (20% declining)',
      '10': 'Class 10 — Vehicles (30% declining)',
      '12': 'Class 12 — Small tools / uniforms (100%)',
      '13': 'Class 13 — Leasehold improvements (straight-line)',
      '50': 'Class 50 — Computer equipment (55% declining)',
    },
  },
};

const fmtAmt = v => (v ?? 0).toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const currYear = () => new Date().getFullYear();

const BLANK = { name: '', coa_account_id: '', cca_class: '8', acquisition_date: '', acquisition_cost: '', personal_use_pct: 0, disposal_date: '', disposal_proceeds: '', notes: '' };

export default function ImmobilisationsTab({ lang = 'fr', canUsePro = false, onUpgrade }) {
  const L = T[lang] || T.fr;
  const [assets, setAssets] = useState([]);
  const [ccaClasses, setCcaClasses] = useState([]);
  const [coaAccounts, setCoaAccounts] = useState([]);
  const [form, setForm] = useState(null);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [fiscalYear, setFiscalYear] = useState(currYear());
  const [schedule, setSchedule] = useState(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const [a, c, coa] = await Promise.all([
        window.api.assets.list(),
        window.api.cca.classes(),
        window.api.coa.list(),
      ]);
      setAssets(a || []);
      setCcaClasses(c || []);
      const assetAccounts = (coa || []).filter(c => c.type === 'asset' && !c.is_archived && (c.account_number >= '1500' && c.account_number < '1600'));
      setCoaAccounts(assetAccounts);
    } catch (_) {}
  }, []);

  useEffect(() => { if (canUsePro) load(); }, [load, canUsePro]);

  const handleSubmit = async () => {
    if (!form?.name || !form?.acquisition_date || !form?.acquisition_cost) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        acquisition_cost: parseFloat(form.acquisition_cost) || 0,
        personal_use_pct: parseFloat(form.personal_use_pct) || 0,
        disposal_proceeds: form.disposal_proceeds ? parseFloat(form.disposal_proceeds) : null,
        disposal_date: form.disposal_date || null,
        coa_account_id: parseInt(form.coa_account_id) || null,
        notes: form.notes || null,
      };
      if (editId) {
        await window.api.assets.update(editId, payload);
      } else {
        await window.api.assets.create(payload);
      }
      setForm(null);
      setEditId(null);
      load();
    } catch (e) {
      alert(e.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm(L.confirmDelete)) return;
    try {
      await window.api.assets.delete(id);
      load();
    } catch (_) {}
  };

  const computeSchedule = async () => {
    setScheduleLoading(true);
    try {
      const s = await window.api.cca.schedule(fiscalYear);
      setSchedule(s || []);
    } catch (_) {
      setSchedule([]);
    } finally {
      setScheduleLoading(false);
    }
  };

  const card = { background: '#1e293b', border: '1px solid rgba(148,163,184,0.12)', borderRadius: 10, padding: '14px 16px', marginBottom: 12 };
  const btn = { padding: '6px 16px', borderRadius: 7, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12, fontFamily: "'Satoshi',-apple-system,BlinkMacSystemFont,sans-serif" };
  const input = { background: '#0f172a', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 5, color: '#f1f5f9', fontSize: 12, padding: '5px 8px', outline: 'none', fontFamily: "'Satoshi',-apple-system,BlinkMacSystemFont,sans-serif" };
  const label = { fontSize: 11, color: '#64748b', marginBottom: 2 };

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
    <div style={{ padding: '12px 0', width: '100%', minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{L.title}</span>
        {!form && (
          <button onClick={() => { setForm({ ...BLANK }); setEditId(null); }}
            style={{ ...btn, background: 'linear-gradient(135deg,#f97316,#ea580c)', color: '#fff' }}>
            + {L.addAsset}
          </button>
        )}
      </div>

      {/* Add/Edit form */}
      {form && (
        <div style={{ ...card, border: '1px solid rgba(249,115,22,0.25)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <div style={label}>{L.name} *</div>
              <input style={{ ...input, width: '100%', boxSizing: 'border-box' }} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <div style={label}>{L.ccaClass}</div>
              <select style={{ ...input, width: '100%', boxSizing: 'border-box' }} value={form.cca_class} onChange={e => setForm(f => ({ ...f, cca_class: e.target.value }))}>
                {ccaClasses.map(c => (
                  <option key={c.class} value={c.class}>{L.classHelp[c.class] || `Classe ${c.class}`}</option>
                ))}
              </select>
            </div>
            <div>
              <div style={label}>{L.acquisitionDate} *</div>
              <input type="date" style={{ ...input, width: '100%', boxSizing: 'border-box' }} value={form.acquisition_date} onChange={e => setForm(f => ({ ...f, acquisition_date: e.target.value }))} />
            </div>
            <div>
              <div style={label}>{L.cost} *</div>
              <input type="number" min="0" step="0.01" style={{ ...input, width: '100%', boxSizing: 'border-box' }} value={form.acquisition_cost} onChange={e => setForm(f => ({ ...f, acquisition_cost: e.target.value }))} />
            </div>
            <div>
              <div style={label}>{L.coaAccount}</div>
              <select style={{ ...input, width: '100%', boxSizing: 'border-box' }} value={form.coa_account_id} onChange={e => setForm(f => ({ ...f, coa_account_id: e.target.value }))}>
                <option value="">-- {lang === 'fr' ? 'Choisir' : 'Select'} --</option>
                {coaAccounts.map(a => <option key={a.id} value={a.id}>{a.account_number} {a.name_fr}</option>)}
              </select>
            </div>
            <div>
              <div style={label}>{L.personalUse}</div>
              <input type="number" min="0" max="100" step="1" style={{ ...input, width: '100%', boxSizing: 'border-box' }} value={form.personal_use_pct} onChange={e => setForm(f => ({ ...f, personal_use_pct: e.target.value }))} />
            </div>
            <div>
              <div style={label}>{L.disposalDate}</div>
              <input type="date" style={{ ...input, width: '100%', boxSizing: 'border-box' }} value={form.disposal_date || ''} onChange={e => setForm(f => ({ ...f, disposal_date: e.target.value }))} />
            </div>
            <div>
              <div style={label}>{L.disposalProceeds}</div>
              <input type="number" min="0" step="0.01" style={{ ...input, width: '100%', boxSizing: 'border-box' }} value={form.disposal_proceeds || ''} onChange={e => setForm(f => ({ ...f, disposal_proceeds: e.target.value }))} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={label}>{L.notes}</div>
              <input style={{ ...input, width: '100%', boxSizing: 'border-box' }} value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleSubmit} disabled={saving} style={{ ...btn, background: 'linear-gradient(135deg,#f97316,#ea580c)', color: '#fff', opacity: saving ? 0.6 : 1 }}>{saving ? '...' : L.save}</button>
            <button onClick={() => { setForm(null); setEditId(null); }} style={{ ...btn, background: 'rgba(148,163,184,0.1)', color: '#94a3b8' }}>{L.cancel}</button>
          </div>
        </div>
      )}

      {/* Assets list */}
      <div style={card}>
        {assets.length === 0 ? (
          <div style={{ fontSize: 12, color: '#64748b', textAlign: 'center', padding: '12px 0' }}>{L.noAssets}</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(148,163,184,0.15)' }}>
                {[L.name, L.ccaClass, L.acquisitionDate, L.cost, ''].map((h, i) => (
                  <th key={i} style={{ padding: '4px 6px', textAlign: i > 1 ? 'right' : 'left', color: '#64748b', fontWeight: 600, fontSize: 10.5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {assets.map(a => (
                <tr key={a.id} style={{ borderBottom: '1px solid rgba(148,163,184,0.06)' }}>
                  <td style={{ padding: '5px 6px', color: '#e2e8f0' }}>{a.name}</td>
                  <td style={{ padding: '5px 6px', color: '#94a3b8', fontFamily: 'ui-monospace,monospace', fontSize: 11 }}>{a.cca_class}</td>
                  <td style={{ padding: '5px 6px', color: '#94a3b8', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{a.acquisition_date}</td>
                  <td style={{ padding: '5px 6px', color: '#e2e8f0', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontFamily: 'ui-monospace,monospace' }}>{fmtAmt(a.acquisition_cost)}</td>
                  <td style={{ padding: '5px 6px', textAlign: 'right', display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                    <button onClick={() => { setEditId(a.id); setForm({ name: a.name, coa_account_id: a.coa_account_id || '', cca_class: a.cca_class, acquisition_date: a.acquisition_date, acquisition_cost: a.acquisition_cost, personal_use_pct: a.personal_use_pct || 0, disposal_date: a.disposal_date || '', disposal_proceeds: a.disposal_proceeds || '', notes: a.notes || '' }); }}
                      style={{ ...btn, padding: '3px 8px', background: 'rgba(148,163,184,0.08)', color: '#94a3b8', fontSize: 10 }}>
                      {lang === 'fr' ? 'Modifier' : 'Edit'}
                    </button>
                    <button onClick={() => handleDelete(a.id)} style={{ ...btn, padding: '3px 8px', background: 'rgba(239,68,68,0.07)', color: '#fca5a5', fontSize: 10 }}>{L.delete}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* CCA Schedule */}
      <div style={{ ...card, marginTop: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', marginBottom: 10 }}>{L.schedule}</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: '#64748b' }}>{L.fiscalYear}</span>
          <input type="number" min="2020" max="2050" value={fiscalYear} onChange={e => setFiscalYear(parseInt(e.target.value))}
            style={{ ...input, width: 80, textAlign: 'center' }} />
          <button onClick={computeSchedule} disabled={scheduleLoading} style={{ ...btn, background: 'linear-gradient(135deg,#f97316,#ea580c)', color: '#fff', opacity: scheduleLoading ? 0.6 : 1 }}>
            {scheduleLoading ? '...' : L.computeSchedule}
          </button>
        </div>

        {schedule !== null && (
          schedule.length === 0 ? (
            <div style={{ fontSize: 12, color: '#64748b' }}>{L.noSchedule}</div>
          ) : (
            <>
              <div style={{ fontSize: 10, color: '#64748b', marginBottom: 8, fontStyle: 'italic' }}>{L.halfYearNote}</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(148,163,184,0.15)' }}>
                    {[L.name, L.uccOpening, L.additions, L.disposals, L.ccaClaimed, L.uccClosing].map((h, i) => (
                      <th key={i} style={{ padding: '4px 6px', textAlign: i === 0 ? 'left' : 'right', color: '#64748b', fontWeight: 600, fontSize: 10.5 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {schedule.map((row, i) => {
                    const asset = assets.find(a => a.id === row.asset_id);
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(148,163,184,0.06)' }}>
                        <td style={{ padding: '5px 6px', color: '#e2e8f0' }}>{asset?.name || `ID ${row.asset_id}`}</td>
                        {[row.ucc_opening, row.additions, row.disposals, row.cca_claimed, row.ucc_closing].map((v, j) => (
                          <td key={j} style={{ padding: '5px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontFamily: 'ui-monospace,monospace', color: j === 3 ? '#f97316' : '#94a3b8' }}>{fmtAmt(v)}</td>
                        ))}
                      </tr>
                    );
                  })}
                  <tr style={{ borderTop: '2px solid rgba(148,163,184,0.2)' }}>
                    <td style={{ padding: '5px 6px', fontWeight: 700, color: '#f1f5f9', fontSize: 12 }}>Total</td>
                    {['ucc_opening','additions','disposals','cca_claimed','ucc_closing'].map((k, j) => (
                      <td key={j} style={{ padding: '5px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontFamily: 'ui-monospace,monospace', fontWeight: 700, color: j === 3 ? '#f97316' : '#f1f5f9', fontSize: 12 }}>
                        {fmtAmt(schedule.reduce((s, r) => s + (r[k] || 0), 0))}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </>
          )
        )}
      </div>
    </div>
  );
}
