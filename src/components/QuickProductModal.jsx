import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { addCatalogItem } from '../utils/catalog.js';

// Adds a product or service to the catalog without leaving the invoice. What you
// type on the line is carried in, so a line written by hand can be kept for next
// time in one step.

const UI = {
  en: {
    title: 'New product or service',
    hint: 'Saved to Products & services, so it is in the list next time.',
    description: 'Description',
    category: 'Category',
    newCategory: '+ New category',
    newCategoryName: 'New category name',
    categoryHint: 'Categories group what you sell for reports and the accounting export.',
    price: 'Unit price',
    unit: 'Unit',
    gst: 'GST',
    qst: 'QST',
    save: 'Save and use',
    cancel: 'Cancel',
    needDescription: 'Enter a description.',
    needCategory: 'Choose a category or name a new one.',
  },
  fr: {
    title: 'Nouveau produit ou service',
    hint: 'Enregistré dans Produits et services : il sera dans la liste la prochaine fois.',
    description: 'Description',
    category: 'Catégorie',
    newCategory: '+ Nouvelle catégorie',
    newCategoryName: 'Nom de la nouvelle catégorie',
    categoryHint: 'Les catégories regroupent ce que vous vendez pour les rapports et l\'export comptable.',
    price: 'Prix unitaire',
    unit: 'Unité',
    gst: 'TPS',
    qst: 'TVQ',
    save: 'Enregistrer et utiliser',
    cancel: 'Annuler',
    needDescription: 'Entrez une description.',
    needCategory: 'Choisissez une catégorie ou nommez-en une nouvelle.',
  },
};

export default function QuickProductModal({
  en = false, t = {}, categories = [], produits = [], saveCategories, saveProduits,
  genCode, units = [], unitLabel = (u) => u, initial = {}, onCreated, onClose,
}) {
  const L = en ? UI.en : UI.fr;
  const active = (categories || []).filter(c => c.actif !== false);
  const [draft, setDraft] = useState({
    description: initial.description || '',
    prixUnitaire: initial.prixUnitaire ? String(initial.prixUnitaire) : '',
    categorieId: active[0]?.id || '__new__',
    newCategory: '',
    uniteMesure: units[0] || 'unité',
    tps: initial.tps !== false,
    tvq: initial.tvq !== false,
  });
  const [error, setError] = useState('');
  const set = (patch) => { setError(''); setDraft(d => ({ ...d, ...patch })); };

  const save = () => {
    const r = addCatalogItem({ categories, produits, draft, genCode });
    if (r.error) { setError(r.error === 'description_required' ? L.needDescription : L.needCategory); return; }
    if (r.categoriesChanged && saveCategories) saveCategories(r.categories);
    if (saveProduits) saveProduits(r.produits);
    if (onCreated) onCreated(r.product);
  };

  const C = {
    card: t.card || '#161822', border: t.cardBorder || '#2d3148', text: t.text || '#e2e8f0',
    muted: t.textMuted || '#64748b', sub: t.textSub || '#94a3b8', section: t.section || '#1e2131',
  };
  const input = {
    background: t.inputBg || '#0f1119', border: `1px solid ${t.inputBorder || C.border}`, borderRadius: 5,
    color: t.inputText || C.text, fontSize: 12.5, padding: '6px 8px', outline: 'none', width: '100%', boxSizing: 'border-box',
  };
  const lbl = { fontSize: 10.5, color: C.muted, marginBottom: 3, display: 'block' };

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={L.title}
      onMouseDown={e => { if (e.target === e.currentTarget && onClose) onClose(); }}
      onKeyDown={e => { if (e.key === 'Escape' && onClose) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: 'min(460px, 100%)', background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{L.title}</div>
          <div style={{ fontSize: 11.5, color: C.muted, marginTop: 3 }}>{L.hint}</div>
        </div>

        <div><span style={lbl}>{L.description}</span>
          <input autoFocus style={input} value={draft.description} onChange={e => set({ description: e.target.value })} /></div>

        <div><span style={lbl}>{L.category}</span>
          <select style={input} value={draft.categorieId} onChange={e => set({ categorieId: e.target.value })}>
            {active.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
            <option value="__new__">{L.newCategory}</option>
          </select>
          {draft.categorieId === '__new__' && (
            <input style={{ ...input, marginTop: 6 }} placeholder={L.newCategoryName} value={draft.newCategory}
              onChange={e => set({ newCategory: e.target.value })} />
          )}
          <div style={{ fontSize: 10.5, color: C.muted, marginTop: 4 }}>{L.categoryHint}</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div><span style={lbl}>{L.price}</span>
            <input type="number" min="0" step="0.01" style={{ ...input, textAlign: 'right' }} value={draft.prixUnitaire}
              onFocus={e => e.target.select()} onChange={e => set({ prixUnitaire: e.target.value })} /></div>
          <div><span style={lbl}>{L.unit}</span>
            <select style={input} value={draft.uniteMesure} onChange={e => set({ uniteMesure: e.target.value })}>
              {(units.length ? units : ['unité']).map(u => <option key={u} value={u}>{unitLabel(u)}</option>)}
            </select></div>
        </div>

        <div style={{ display: 'flex', gap: 16 }}>
          {[['tps', L.gst], ['tvq', L.qst]].map(([k, label]) => (
            <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.sub, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!draft[k]} onChange={e => set({ [k]: e.target.checked })} style={{ accentColor: '#f97316' }} />
              {label}
            </label>
          ))}
        </div>

        {error && <div style={{ fontSize: 12, color: '#ef4444' }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={{ padding: '6px 14px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.section, color: C.sub, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>{L.cancel}</button>
          <button type="button" onClick={save} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: 'linear-gradient(135deg,#f97316,#ea580c)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>{L.save}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
