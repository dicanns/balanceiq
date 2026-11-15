import React, { useCallback, useEffect, useState } from 'react';

// What an AI assistant prepared and the owner has not looked at yet. It floats
// over whatever screen is open: "Review" takes the owner to the normal form,
// already filled in, where the screen's own Save is the only way to record it.

export const UI = {
  en: {
    title: 'Prepared by your AI assistant',
    note: 'Nothing is recorded until you open it, check it and save it.',
    review: 'Review',
    reviewing: 'Open again',
    dismiss: 'Dismiss',
    kind: { invoice: 'Invoice', bill: 'Supplier bill' },
  },
  fr: {
    title: 'Préparé par votre assistant IA',
    note: 'Rien n\'est inscrit tant que vous ne l\'ouvrez pas pour le vérifier et l\'enregistrer.',
    review: 'Vérifier',
    reviewing: 'Rouvrir',
    dismiss: 'Écarter',
    kind: { invoice: 'Facture', bill: 'Facture fournisseur' },
  },
};

export default function AiProposalsBar({ lang = 'fr', t = {}, onReview }) {
  const L = UI[lang] || UI.fr;
  const [items, setItems] = useState([]);

  const load = useCallback(async () => {
    try { const list = await window.api?.connector?.proposals?.(); setItems(Array.isArray(list) ? list : []); } catch (_) { /* keep what is shown */ }
  }, []);

  useEffect(() => {
    if (!window.api?.connector?.onProposals) return undefined;
    load();
    return window.api.connector.onProposals(load);
  }, [load]);

  const review = async (p) => {
    try { await window.api.connector.markProposal(p.id, 'opened'); } catch (_) { /* it can still be opened */ }
    onReview?.(p);
    load();
  };
  const dismiss = async (p) => {
    try { await window.api.connector.markProposal(p.id, 'dismissed'); } catch (_) { /* it expires by itself */ }
    load();
  };

  if (!items.length) return null;
  const btn = (primary) => ({
    padding: '5px 12px', borderRadius: 6, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
    border: primary ? 'none' : `1px solid ${t.cardBorder || '#2d3148'}`,
    background: primary ? 'linear-gradient(135deg,#f97316,#ea580c)' : (t.section || 'transparent'), color: primary ? '#fff' : (t.textSub || '#94a3b8'),
  });
  return (
    <div role="region" aria-label={L.title} style={{
      position: 'fixed', right: 16, bottom: 16, zIndex: 900, width: 340, maxWidth: 'calc(100vw - 32px)', maxHeight: '60vh', overflowY: 'auto',
      background: t.card || '#161822', border: '1px solid #f97316', borderRadius: 10, padding: '12px 14px', boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
    }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: t.text || '#e2e8f0' }}>{L.title}</div>
      <div style={{ fontSize: 11, color: t.textMuted || '#64748b', marginTop: 2, lineHeight: 1.45 }}>{L.note}</div>
      {items.map((p) => (
        <div key={p.id} style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${t.divider || t.cardBorder || '#2d3148'}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: '#f97316' }}>{L.kind[p.kind] || p.kind}</div>
          <div style={{ fontSize: 12.5, color: t.text || '#e2e8f0', marginTop: 2, lineHeight: 1.45 }}>{(p.summary && (p.summary[lang] || p.summary.en)) || ''}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="button" style={btn(true)} onClick={() => review(p)}>{p.status === 'opened' ? L.reviewing : L.review}</button>
            <button type="button" style={btn(false)} onClick={() => dismiss(p)}>{L.dismiss}</button>
          </div>
        </div>
      ))}
    </div>
  );
}
