import React, { useState, useEffect, useCallback } from 'react';
import {
  buildPacketDefaults,
  parseChecklist,
  parseRequiredDocs,
  validatePacket,
  REPORTING_CADENCES,
  REPORTING_CADENCE_LABELS,
} from '../../services/packetGenerator.js';

const UI = {
  fr: {
    title:          'Modèles d\'intégration',
    subtitle:       'Créez des modèles d\'intégration réutilisables pour les nouvelles succursales.',
    newPacket:      'Nouveau modèle',
    save:           'Enregistrer',
    cancel:         'Annuler',
    delete:         'Supprimer',
    apply:          'Appliquer',
    applyTo:        'Appliquer à une succursale',
    packetName:     'Nom du modèle',
    cadence:        'Cadence de rapport',
    checklistTitle: 'Liste de contrôle d\'intégration',
    docsTitle:      'Documents requis',
    itemLabel:      'Libellé (FR)',
    itemLabelEn:    'Libellé (EN)',
    addItem:        '+ Ajouter',
    removeItem:     'Retirer',
    royaltyRate:    'Taux redevance (%)',
    adRate:         'Taux pub. (%)',
    selectLoc:      'Choisir une succursale',
    applied:        'Modèle appliqué.',
    deleted:        'Modèle supprimé.',
    confirmDelete:  'Supprimer ce modèle?',
    noPackets:      'Aucun modèle créé. Cliquez «Nouveau modèle» pour commencer.',
    applied_to:     'Appliqué',
    notApplied:     'Non appliqué',
    locTab:         'Par succursale',
    packetsTab:     'Modèles',
    loading:        '...',
    errName:        'Le nom est requis.',
  },
  en: {
    title:          'Onboarding Templates',
    subtitle:       'Build reusable onboarding packets for new locations.',
    newPacket:      'New template',
    save:           'Save',
    cancel:         'Cancel',
    delete:         'Delete',
    apply:          'Apply',
    applyTo:        'Apply to a location',
    packetName:     'Template name',
    cadence:        'Reporting cadence',
    checklistTitle: 'Setup checklist',
    docsTitle:      'Required documents',
    itemLabel:      'Label (FR)',
    itemLabelEn:    'Label (EN)',
    addItem:        '+ Add item',
    removeItem:     'Remove',
    royaltyRate:    'Royalty rate (%)',
    adRate:         'Ad fund rate (%)',
    selectLoc:      'Choose a location',
    applied:        'Template applied.',
    deleted:        'Template deleted.',
    confirmDelete:  'Delete this template?',
    noPackets:      'No templates yet. Click «New template» to get started.',
    applied_to:     'Applied',
    notApplied:     'Not applied',
    locTab:         'By location',
    packetsTab:     'Templates',
    loading:        '...',
    errName:        'Name is required.',
  },
};

const ACCENT = '#a78bfa';

function emptyChecklist() {
  return [
    { key: 'pos_setup',      labelFr: 'Configuration du PDV',         labelEn: 'POS setup',              done: false },
    { key: 'bank_account',   labelFr: 'Compte bancaire ouvert',       labelEn: 'Bank account opened',    done: false },
    { key: 'royalty_client', labelFr: 'Client redevance créé',        labelEn: 'Royalty client created', done: false },
    { key: 'close_policy',   labelFr: 'Politique de fermeture reçue', labelEn: 'Close policy received',  done: false },
    { key: 'training_done',  labelFr: 'Formation complétée',          labelEn: 'Training completed',     done: false },
    { key: 'docs_uploaded',  labelFr: 'Documents téléversés',         labelEn: 'Documents uploaded',     done: false },
  ];
}

function emptyDocs() {
  return [
    { key: 'franchise_agreement', labelFr: 'Contrat de franchise',    labelEn: 'Franchise agreement'   },
    { key: 'insurance_cert',      labelFr: 'Certificat d\'assurance', labelEn: 'Insurance certificate' },
    { key: 'municipal_permit',    labelFr: 'Permis municipal',        labelEn: 'Municipal permit'      },
    { key: 'health_permit',       labelFr: 'Permis de santé',         labelEn: 'Health permit'         },
  ];
}

function PacketForm({ packet, onSave, onCancel, T, t, lang }) {
  const [name, setName]         = useState(packet?.packet_name ?? '');
  const [cadence, setCadence]   = useState(packet?.reporting_cadence ?? 'monthly');
  const [checklist, setChecklist] = useState(
    packet ? parseChecklist(packet.setup_checklist_json) : emptyChecklist()
  );
  const [docs, setDocs]         = useState(
    packet ? parseRequiredDocs(packet.required_docs_list_json) : emptyDocs()
  );
  const [err, setErr]           = useState('');

  const handleSave = () => {
    if (!name.trim()) { setErr(T.errName); return; }
    setErr('');
    onSave({
      ...(packet ? { id: packet.id } : {}),
      packetName:          name.trim(),
      reportingCadence:    cadence,
      setupChecklistJson:  JSON.stringify(checklist),
      requiredDocsListJson: JSON.stringify(docs),
    });
  };

  const addChecklistItem = () =>
    setChecklist(prev => [...prev, { key: `item_${Date.now()}`, labelFr: '', labelEn: '', done: false }]);

  const addDocItem = () =>
    setDocs(prev => [...prev, { key: `doc_${Date.now()}`, labelFr: '', labelEn: '' }]);

  const inputStyle = {
    background: t.inputBg ?? '#1e2333', border: `1px solid ${t.inputBorder ?? '#2d3348'}`,
    borderRadius: 5, color: t.text, fontSize: 11, padding: '4px 8px', outline: 'none', width: '100%',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Name */}
      <div>
        <div style={{ fontSize: 9.5, color: t.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{T.packetName}</div>
        <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} />
        {err && <div style={{ fontSize: 10, color: '#ef4444', marginTop: 3 }}>{err}</div>}
      </div>

      {/* Cadence */}
      <div>
        <div style={{ fontSize: 9.5, color: t.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{T.cadence}</div>
        <select value={cadence} onChange={e => setCadence(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
          {REPORTING_CADENCES.map(c => (
            <option key={c} value={c}>{REPORTING_CADENCE_LABELS[lang === 'en' ? 'en' : 'fr'][c]}</option>
          ))}
        </select>
      </div>

      {/* Checklist */}
      <div>
        <div style={{ fontSize: 9.5, color: t.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{T.checklistTitle}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {checklist.map((item, i) => (
            <div key={item.key} style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              <input
                value={item.labelFr} placeholder={T.itemLabel}
                onChange={e => setChecklist(prev => prev.map((it, idx) => idx === i ? { ...it, labelFr: e.target.value } : it))}
                style={{ ...inputStyle, flex: 1 }}
              />
              <input
                value={item.labelEn} placeholder={T.itemLabelEn}
                onChange={e => setChecklist(prev => prev.map((it, idx) => idx === i ? { ...it, labelEn: e.target.value } : it))}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button onClick={() => setChecklist(prev => prev.filter((_, idx) => idx !== i))}
                style={{ fontSize: 10, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {T.removeItem}
              </button>
            </div>
          ))}
          <button onClick={addChecklistItem} style={{ fontSize: 10, color: ACCENT, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: '2px 0' }}>
            {T.addItem}
          </button>
        </div>
      </div>

      {/* Required docs */}
      <div>
        <div style={{ fontSize: 9.5, color: t.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{T.docsTitle}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {docs.map((doc, i) => (
            <div key={doc.key} style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              <input
                value={doc.labelFr} placeholder={T.itemLabel}
                onChange={e => setDocs(prev => prev.map((d, idx) => idx === i ? { ...d, labelFr: e.target.value } : d))}
                style={{ ...inputStyle, flex: 1 }}
              />
              <input
                value={doc.labelEn} placeholder={T.itemLabelEn}
                onChange={e => setDocs(prev => prev.map((d, idx) => idx === i ? { ...d, labelEn: e.target.value } : d))}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button onClick={() => setDocs(prev => prev.filter((_, idx) => idx !== i))}
                style={{ fontSize: 10, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {T.removeItem}
              </button>
            </div>
          ))}
          <button onClick={addDocItem} style={{ fontSize: 10, color: ACCENT, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: '2px 0' }}>
            {T.addItem}
          </button>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={{ padding: '5px 14px', borderRadius: 6, border: `1px solid ${t.divider}`, background: 'none', color: t.textMuted, cursor: 'pointer', fontSize: 11 }}>
          {T.cancel}
        </button>
        <button onClick={handleSave} style={{ padding: '5px 14px', borderRadius: 6, border: `1px solid ${ACCENT}44`, background: `${ACCENT}18`, color: ACCENT, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
          {T.save}
        </button>
      </div>
    </div>
  );
}

function ApplyModal({ packet, locations, onApply, onClose, T, t }) {
  const [locId, setLocId]       = useState(locations[0]?.id ?? '');
  const [royaltyRate, setRR]    = useState('');
  const [adRate, setAR]         = useState('');

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
    }}>
      <div style={{ background: t.card, borderRadius: 12, padding: 24, minWidth: 320, maxWidth: 420, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 14 }}>{T.applyTo}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <div style={{ fontSize: 9.5, color: t.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{T.selectLoc}</div>
            <select value={locId} onChange={e => setLocId(Number(e.target.value))}
              style={{ background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 5, color: t.text, fontSize: 11, padding: '4px 8px', width: '100%', outline: 'none' }}>
              {locations.map(l => <option key={l.id} value={l.id}>{l.nom}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9.5, color: t.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{T.royaltyRate}</div>
              <input type="number" step="0.1" min="0" max="100" value={royaltyRate} onChange={e => setRR(e.target.value)} placeholder="—"
                style={{ background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 5, color: t.text, fontSize: 11, padding: '4px 8px', width: '100%', outline: 'none' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9.5, color: t.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{T.adRate}</div>
              <input type="number" step="0.1" min="0" max="100" value={adRate} onChange={e => setAR(e.target.value)} placeholder="—"
                style={{ background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 5, color: t.text, fontSize: 11, padding: '4px 8px', width: '100%', outline: 'none' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button onClick={onClose} style={{ padding: '5px 14px', borderRadius: 6, border: `1px solid ${t.divider}`, background: 'none', color: t.textMuted, cursor: 'pointer', fontSize: 11 }}>
              {T.cancel}
            </button>
            <button
              onClick={() => onApply(packet.id, locId, royaltyRate ? parseFloat(royaltyRate) : null, adRate ? parseFloat(adRate) : null)}
              style={{ padding: '5px 14px', borderRadius: 6, border: `1px solid ${ACCENT}44`, background: `${ACCENT}18`, color: ACCENT, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
              {T.apply}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OnboardingPacketBuilder({ t, lang, locations = [] }) {
  const fr = lang !== 'en';
  const T  = UI[fr ? 'fr' : 'en'];

  const [tab, setTab]             = useState('packets');
  const [packets, setPackets]     = useState([]);
  const [locStates, setLocStates] = useState({});
  const [loading, setLoading]     = useState(true);
  const [editing, setEditing]     = useState(null);   // null | 'new' | packet object
  const [applyTarget, setApplyTarget] = useState(null);
  const [flash, setFlash]         = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const pkts = await window.api?.franchiseOnboarding?.listPackets?.() ?? [];
    setPackets(pkts);
    if (locations.length) {
      const states = {};
      await Promise.all(locations.map(async l => {
        states[l.id] = await window.api?.franchiseOnboarding?.getLocationState?.(l.id) ?? null;
      }));
      setLocStates(states);
    }
    setLoading(false);
  }, [locations]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (data) => {
    await window.api?.franchiseOnboarding?.savePacket?.(data);
    setEditing(null);
    await load();
  };

  const handleDelete = async (id) => {
    if (!window.confirm(T.confirmDelete)) return;
    await window.api?.franchiseOnboarding?.deletePacket?.(id);
    setFlash(T.deleted);
    setTimeout(() => setFlash(''), 3000);
    await load();
  };

  const handleApply = async (packetId, locationId, rr, ar) => {
    await window.api?.franchiseOnboarding?.applyPacket?.(packetId, locationId, rr, ar);
    setApplyTarget(null);
    setFlash(T.applied);
    setTimeout(() => setFlash(''), 3000);
    await load();
  };

  const cadenceLabel = (c) => REPORTING_CADENCE_LABELS[fr ? 'fr' : 'en'][c] || c;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{T.title}</div>
        <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>{T.subtitle}</div>
      </div>

      {flash && (
        <div style={{ padding: '7px 12px', borderRadius: 7, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', color: '#4ade80', fontSize: 11 }}>
          {flash}
        </div>
      )}

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: `1px solid ${t.dividerMid}`, paddingBottom: 1 }}>
        {[{ id: 'packets', label: T.packetsTab }, { id: 'locations', label: T.locTab }].map(s => (
          <button key={s.id} onClick={() => setTab(s.id)} style={{
            background: 'none', border: 'none', color: tab === s.id ? ACCENT : t.textMuted,
            fontSize: 11, fontWeight: tab === s.id ? 700 : 500, padding: '5px 11px', cursor: 'pointer',
            borderBottom: tab === s.id ? `2px solid ${ACCENT}` : '2px solid transparent',
          }}>
            {s.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ fontSize: 12, color: t.textMuted, padding: 12 }}>{T.loading}</div>
      ) : tab === 'packets' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {editing ? (
            <div style={{ background: t.card, border: `1px solid ${t.cardBorder}`, borderRadius: 9, padding: 16 }}>
              <PacketForm
                packet={editing === 'new' ? null : editing}
                onSave={handleSave}
                onCancel={() => setEditing(null)}
                T={T} t={t} lang={lang}
              />
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setEditing('new')} style={{
                padding: '6px 14px', borderRadius: 7, border: `1px solid ${ACCENT}44`,
                background: `${ACCENT}18`, color: ACCENT, cursor: 'pointer', fontSize: 11, fontWeight: 700,
              }}>
                {T.newPacket}
              </button>
            </div>
          )}

          {!editing && packets.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: t.textMuted, fontSize: 12 }}>{T.noPackets}</div>
          )}

          {!editing && packets.map(p => {
            const cl = parseChecklist(p.setup_checklist_json);
            const docs = parseRequiredDocs(p.required_docs_list_json);
            return (
              <div key={p.id} style={{ background: t.card, border: `1px solid ${t.cardBorder}`, borderRadius: 9 }}>
                <div style={{ padding: '10px 14px', borderBottom: `1px solid ${t.dividerMid}`, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: t.text }}>{p.packet_name}</div>
                    <div style={{ fontSize: 10, color: t.textMuted, marginTop: 1 }}>
                      {cadenceLabel(p.reporting_cadence)} &nbsp;·&nbsp; {cl.length} {T.checklistTitle.toLowerCase()} &nbsp;·&nbsp; {docs.length} {T.docsTitle.toLowerCase()}
                    </div>
                  </div>
                  <button onClick={() => setApplyTarget(p)} style={{ padding: '4px 11px', borderRadius: 6, border: `1px solid ${ACCENT}44`, background: `${ACCENT}14`, color: ACCENT, cursor: 'pointer', fontSize: 10, fontWeight: 700 }}>
                    {T.apply}
                  </button>
                  <button onClick={() => setEditing(p)} style={{ padding: '4px 11px', borderRadius: 6, border: `1px solid ${t.divider}`, background: 'none', color: t.textMuted, cursor: 'pointer', fontSize: 10 }}>
                    ✎
                  </button>
                  <button onClick={() => handleDelete(p.id)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.05)', color: '#ef4444', cursor: 'pointer', fontSize: 10 }}>
                    ✕
                  </button>
                </div>
                {/* Checklist preview */}
                <div style={{ padding: '8px 14px', display: 'flex', flexWrap: 'wrap', gap: '4px 10px' }}>
                  {cl.slice(0, 6).map(item => (
                    <span key={item.key} style={{ fontSize: 9.5, color: t.textMuted, background: t.section, borderRadius: 4, padding: '2px 7px' }}>
                      {fr ? item.labelFr : item.labelEn}
                    </span>
                  ))}
                  {cl.length > 6 && <span style={{ fontSize: 9.5, color: t.textMuted }}>+{cl.length - 6}</span>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Per-location tab */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {locations.map(loc => {
            const state = locStates[loc.id];
            const pkt   = state ? packets.find(p => p.id === state.packet_id) : null;
            const cl    = state ? parseChecklist(state.checklist_json) : [];
            return (
              <div key={loc.id} style={{ background: t.card, border: `1px solid ${t.cardBorder}`, borderRadius: 9, overflow: 'hidden' }}>
                <div style={{ padding: '9px 14px', borderBottom: state ? `1px solid ${t.dividerMid}` : 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: t.text, flex: 1 }}>{loc.nom}</span>
                  {state ? (
                    <span style={{ fontSize: 9, fontWeight: 700, color: '#22c55e', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 6, padding: '2px 8px' }}>
                      {T.applied_to}: {pkt?.packet_name ?? `#${state.packet_id}`}
                    </span>
                  ) : (
                    <span style={{ fontSize: 9, fontWeight: 700, color: t.textMuted, background: t.section, borderRadius: 6, padding: '2px 8px' }}>
                      {T.notApplied}
                    </span>
                  )}
                </div>
                {state && (
                  <div style={{ padding: '8px 14px', display: 'flex', flexWrap: 'wrap', gap: '5px 12px' }}>
                    {state.royalty_rate !== null && (
                      <span style={{ fontSize: 9.5, color: t.textMuted }}>{T.royaltyRate}: <strong style={{ color: ACCENT }}>{state.royalty_rate}%</strong></span>
                    )}
                    {state.ad_rate !== null && (
                      <span style={{ fontSize: 9.5, color: t.textMuted }}>{T.adRate}: <strong style={{ color: ACCENT }}>{state.ad_rate}%</strong></span>
                    )}
                    <span style={{ fontSize: 9.5, color: t.textMuted }}>{T.cadence}: <strong style={{ color: t.text }}>{cadenceLabel(state.reporting_cadence)}</strong></span>
                    <span style={{ fontSize: 9.5, color: t.textMuted }}>{T.checklistTitle}: <strong style={{ color: t.text }}>{cl.length}</strong></span>
                  </div>
                )}
              </div>
            );
          })}
          {locations.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: t.textMuted, fontSize: 12 }}>{T.noPackets}</div>
          )}
        </div>
      )}

      {applyTarget && locations.length > 0 && (
        <ApplyModal
          packet={applyTarget}
          locations={locations}
          onApply={handleApply}
          onClose={() => setApplyTarget(null)}
          T={T} t={t}
        />
      )}
    </div>
  );
}
