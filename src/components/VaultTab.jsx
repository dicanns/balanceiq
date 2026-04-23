import { useState, useEffect, useCallback } from 'react';

const T = {
  fr: {
    title: 'Coffre-fort des pièces justificatives',
    subtitle: 'Stockage local sécurisé — 6 ans de rétention conformément à la législation fiscale',
    search: 'Rechercher dans le coffre-fort...',
    attach: 'Attacher un document',
    openFolder: 'Ouvrir le dossier',
    export: 'Exporter l\'année',
    stats: 'Statistiques',
    totalDocs: 'Documents',
    totalSize: 'Taille totale',
    filterAll: 'Tous',
    filterBill: 'Factures fournisseur',
    filterInvoice: 'Factures client',
    filterBank: 'Transactions bancaires',
    filterJournal: 'Écritures comptables',
    filterDaily: 'Entrées quotidiennes',
    noDocuments: 'Aucun document dans le coffre-fort.',
    noResults: 'Aucun résultat pour cette recherche.',
    attachFirst: 'Attachez votre premier document en cliquant sur « Attacher un document ».',
    orphans: 'Documents non classés',
    orphansDesc: 'Ces documents ne sont liés à aucune entrée. Vous pouvez les classer manuellement.',
    noOrphans: 'Aucun document non classé.',
    open: 'Ouvrir',
    delete: 'Supprimer',
    confirmDelete: 'Supprimer ce document ? Cette action est irréversible.',
    deleting: 'Suppression...',
    exporting: 'Export en cours...',
    exportOk: 'Documents exportés avec succès.',
    exportErr: 'Erreur lors de l\'export : ',
    year: 'Année',
    date: 'Date',
    entity: 'Lié à',
    size: 'Taille',
    fileName: 'Fichier',
    entitySupplierBill: 'Facture fournisseur',
    entityCustomerInvoice: 'Facture client',
    entityBankTransaction: 'Transaction bancaire',
    entityJournalEntry: 'Écriture comptable',
    entityDailyEntry: 'Entrée quotidienne',
    entityUnknown: 'Non classé',
    proOnlyCloud: 'Synchronisation cloud disponible en version Pro.',
    proOnlyExport: 'Export d\'année disponible en version Pro.',
    upgradeBtn: 'Passer à Pro',
    reassign: 'Classer',
    reassignType: 'Type d\'entité',
    reassignId: 'ID de l\'entité',
    reassignOk: 'Document classé.',
  },
  en: {
    title: 'Source Document Vault',
    subtitle: 'Local secure storage — 6-year retention as required by tax law',
    search: 'Search the vault...',
    attach: 'Attach a document',
    openFolder: 'Open folder',
    export: 'Export year',
    stats: 'Statistics',
    totalDocs: 'Documents',
    totalSize: 'Total size',
    filterAll: 'All',
    filterBill: 'Supplier bills',
    filterInvoice: 'Customer invoices',
    filterBank: 'Bank transactions',
    filterJournal: 'Journal entries',
    filterDaily: 'Daily entries',
    noDocuments: 'No documents in the vault.',
    noResults: 'No results for this search.',
    attachFirst: 'Attach your first document by clicking "Attach a document".',
    orphans: 'Unclassified documents',
    orphansDesc: 'These documents are not linked to any entry. You can classify them manually.',
    noOrphans: 'No unclassified documents.',
    open: 'Open',
    delete: 'Delete',
    confirmDelete: 'Delete this document? This action cannot be undone.',
    deleting: 'Deleting...',
    exporting: 'Exporting...',
    exportOk: 'Documents exported successfully.',
    exportErr: 'Export error: ',
    year: 'Year',
    date: 'Date',
    entity: 'Linked to',
    size: 'Size',
    fileName: 'File',
    entitySupplierBill: 'Supplier bill',
    entityCustomerInvoice: 'Customer invoice',
    entityBankTransaction: 'Bank transaction',
    entityJournalEntry: 'Journal entry',
    entityDailyEntry: 'Daily entry',
    entityUnknown: 'Unclassified',
    proOnlyCloud: 'Cloud sync available on Pro plan.',
    proOnlyExport: 'Year export available on Pro plan.',
    upgradeBtn: 'Upgrade to Pro',
    reassign: 'Classify',
    reassignType: 'Entity type',
    reassignId: 'Entity ID',
    reassignOk: 'Document classified.',
  },
};

const ENTITY_LABELS = (t) => ({
  supplier_bill: t.entitySupplierBill,
  customer_invoice: t.entityCustomerInvoice,
  bank_transaction: t.entityBankTransaction,
  journal_entry: t.entityJournalEntry,
  daily_entry: t.entityDailyEntry,
});

function fmtSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

const DARK = { background: '#0c0e14', card: '#131720', cardBorder: '#1e2433', text: '#e2e8f0', textSub: '#94a3b8', textMuted: '#64748b', inputBg: '#1a2035', inputBorder: '#2a3550', section: '#181e2e', accent: '#f97316', accentHover: '#ea580c', danger: '#ef4444', green: '#22c55e' };

export default function VaultTab({ lang = 'fr', canUsePro = false, onUpgrade }) {
  const t = T[lang] || T.fr;
  const [docs, setDocs] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState(null);
  const [orphans, setOrphans] = useState([]);
  const [query, setQuery] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [exportYear, setExportYear] = useState(String(new Date().getFullYear()));
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [reassignId, setReassignId] = useState(null);
  const [reassignType, setReassignType] = useState('supplier_bill');
  const [reassignEntityId, setReassignEntityId] = useState('');

  const flash = (m, dur = 3000) => { setMsg(m); setTimeout(() => setMsg(''), dur); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (query.trim()) {
        const res = await window.api.vault.search(query.trim());
        setDocs(Array.isArray(res) ? res : []);
        setTotal(Array.isArray(res) ? res.length : 0);
      } else {
        const res = await window.api.vault.listAll({ entity_type: filterType || undefined, year: filterYear || undefined });
        setDocs(res?.rows || []);
        setTotal(res?.total || 0);
      }
      const s = await window.api.vault.stats();
      setStats(s);
      const o = await window.api.vault.orphans();
      setOrphans(Array.isArray(o) ? o : []);
    } finally {
      setLoading(false);
    }
  }, [query, filterType, filterYear]);

  useEffect(() => { load(); }, [load]);

  const handleAttach = async () => {
    const res = await window.api.vault.attach({ entity_type: 'journal_entry', entity_id: 0 });
    if (res?.ok) { flash(t.reassignOk); load(); }
    else if (res?.error && res.error !== 'cancelled') flash(res.error, 5000);
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t.confirmDelete)) return;
    setDeletingId(id);
    await window.api.vault.delete(id);
    setDeletingId(null);
    load();
  };

  const handleOpen = async (id) => {
    await window.api.vault.openById(id);
  };

  const handleExport = async () => {
    if (!canUsePro) { onUpgrade?.(); return; }
    flash(t.exporting);
    const res = await window.api.vault.exportYear(Number(exportYear));
    if (res?.ok) flash(t.exportOk);
    else flash((t.exportErr) + (res?.error || ''), 5000);
  };

  const handleReassign = async () => {
    if (!reassignId || !reassignEntityId) return;
    await window.api.vault.reassign(reassignId, reassignType, Number(reassignEntityId));
    setReassignId(null);
    setReassignEntityId('');
    flash(t.reassignOk);
    load();
  };

  const entityLabel = (doc) => {
    const labels = ENTITY_LABELS(t);
    return labels[doc.entity_type] || t.entityUnknown;
  };

  const years = Array.from({ length: 7 }, (_, i) => new Date().getFullYear() - i);
  const s = DARK;

  return (
    <div style={{ fontFamily: "'Satoshi',-apple-system,BlinkMacSystemFont,sans-serif", color: s.text, background: s.background, minHeight: '100vh', padding: '16px 0' }}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: s.text, marginBottom: 2 }}>📎 {t.title}</div>
        <div style={{ fontSize: 11.5, color: s.textMuted }}>{t.subtitle}</div>
        {msg && <div style={{ marginTop: 8, padding: '6px 12px', borderRadius: 6, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', color: s.green, fontSize: 12 }}>{msg}</div>}
      </div>

      {/* Stats bar */}
      {stats && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          <div style={{ background: s.card, border: `1px solid ${s.cardBorder}`, borderRadius: 8, padding: '8px 14px', minWidth: 110 }}>
            <div style={{ fontSize: 10, color: s.textMuted, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 2 }}>{t.totalDocs}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: s.accent }}>{stats.count ?? 0}</div>
          </div>
          <div style={{ background: s.card, border: `1px solid ${s.cardBorder}`, borderRadius: 8, padding: '8px 14px', minWidth: 110 }}>
            <div style={{ fontSize: 10, color: s.textMuted, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 2 }}>{t.totalSize}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: s.textSub }}>{fmtSize(stats.total_bytes)}</div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={t.search}
          style={{ flex: 1, minWidth: 180, background: s.inputBg, border: `1px solid ${s.inputBorder}`, borderRadius: 6, color: s.text, fontSize: 12, padding: '7px 11px', outline: 'none' }}
        />
        <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ background: s.inputBg, border: `1px solid ${s.inputBorder}`, borderRadius: 6, color: s.text, fontSize: 12, padding: '7px 10px', outline: 'none' }}>
          <option value="">{t.filterAll}</option>
          <option value="supplier_bill">{t.filterBill}</option>
          <option value="customer_invoice">{t.filterInvoice}</option>
          <option value="bank_transaction">{t.filterBank}</option>
          <option value="journal_entry">{t.filterJournal}</option>
          <option value="daily_entry">{t.filterDaily}</option>
        </select>
        <select value={filterYear} onChange={e => setFilterYear(e.target.value)} style={{ background: s.inputBg, border: `1px solid ${s.inputBorder}`, borderRadius: 6, color: s.text, fontSize: 12, padding: '7px 10px', outline: 'none' }}>
          <option value="">{t.year}: {lang === 'fr' ? 'Toutes' : 'All'}</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <button onClick={handleAttach} style={{ padding: '7px 14px', borderRadius: 6, border: 'none', background: `linear-gradient(135deg,${s.accent},${s.accentHover})`, color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
          + {t.attach}
        </button>
        <button onClick={() => window.api.vault.openRoot()} style={{ padding: '7px 12px', borderRadius: 6, border: `1px solid ${s.cardBorder}`, background: s.section, color: s.textSub, fontSize: 12, cursor: 'pointer' }}>
          📁 {t.openFolder}
        </button>
      </div>

      {/* Export row */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: s.textMuted }}>{t.export}:</span>
        <select value={exportYear} onChange={e => setExportYear(e.target.value)} style={{ background: s.inputBg, border: `1px solid ${s.inputBorder}`, borderRadius: 6, color: s.text, fontSize: 12, padding: '5px 9px', outline: 'none' }}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <button onClick={handleExport} style={{ padding: '5px 12px', borderRadius: 6, border: `1px solid ${canUsePro ? 'rgba(34,197,94,0.3)' : s.cardBorder}`, background: canUsePro ? 'rgba(34,197,94,0.08)' : s.section, color: canUsePro ? s.green : s.textMuted, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
          ⬇ {t.export}
          {!canUsePro && <span style={{ fontSize: 9, fontWeight: 700, color: s.accent, background: 'rgba(249,115,22,0.1)', padding: '1px 5px', borderRadius: 5, marginLeft: 5 }}>Pro</span>}
        </button>
      </div>

      {/* Documents list */}
      <div style={{ background: s.card, border: `1px solid ${s.cardBorder}`, borderRadius: 9, overflow: 'hidden', marginBottom: 16 }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: s.textMuted, fontSize: 12 }}>Chargement…</div>
        ) : docs.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: s.textMuted, fontSize: 12 }}>
            {query ? t.noResults : t.noDocuments}
            {!query && <div style={{ marginTop: 6, fontSize: 11.5 }}>{t.attachFirst}</div>}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${s.cardBorder}`, background: s.section }}>
                {[t.fileName, t.entity, t.date, t.size, ''].map((h, i) => (
                  <th key={i} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, color: s.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {docs.map(doc => (
                <tr key={doc.id} style={{ borderBottom: `1px solid ${s.cardBorder}` }}>
                  <td style={{ padding: '8px 12px', color: s.text, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ fontSize: 13, marginRight: 6 }}>{doc.mime_type?.includes('pdf') ? '📄' : doc.mime_type?.includes('image') ? '🖼' : '📎'}</span>
                    {doc.file_name}
                  </td>
                  <td style={{ padding: '8px 12px', color: s.textSub }}>
                    <span style={{ fontSize: 9.5, background: 'rgba(148,163,184,0.1)', padding: '2px 7px', borderRadius: 10 }}>{entityLabel(doc)}</span>
                    {doc.entity_id > 0 && <span style={{ marginLeft: 4, fontSize: 10, color: s.textMuted }}>#{doc.entity_id}</span>}
                  </td>
                  <td style={{ padding: '8px 12px', color: s.textMuted, whiteSpace: 'nowrap' }}>{doc.created_at?.slice(0, 10) || '—'}</td>
                  <td style={{ padding: '8px 12px', color: s.textMuted, fontVariantNumeric: 'tabular-nums' }}>{fmtSize(doc.size_bytes)}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => handleOpen(doc.id)} style={{ padding: '3px 9px', borderRadius: 5, border: `1px solid ${s.inputBorder}`, background: s.section, color: s.textSub, fontSize: 11, cursor: 'pointer' }}>{t.open}</button>
                      {(!doc.entity_id || doc.entity_id === 0) && (
                        <button onClick={() => setReassignId(doc.id)} style={{ padding: '3px 9px', borderRadius: 5, border: `1px solid rgba(249,115,22,0.25)`, background: 'rgba(249,115,22,0.07)', color: s.accent, fontSize: 11, cursor: 'pointer' }}>{t.reassign}</button>
                      )}
                      <button onClick={() => handleDelete(doc.id)} disabled={deletingId === doc.id} style={{ padding: '3px 9px', borderRadius: 5, border: 'none', background: 'rgba(239,68,68,0.07)', color: s.danger, fontSize: 11, cursor: 'pointer' }}>
                        {deletingId === doc.id ? t.deleting : t.delete}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {total > docs.length && (
          <div style={{ padding: '8px 14px', fontSize: 11, color: s.textMuted, borderTop: `1px solid ${s.cardBorder}` }}>
            {lang === 'fr' ? `Affichage de ${docs.length} sur ${total}` : `Showing ${docs.length} of ${total}`}
          </div>
        )}
      </div>

      {/* Reassign modal */}
      {reassignId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9000 }}>
          <div style={{ background: s.card, border: `1px solid ${s.cardBorder}`, borderRadius: 10, padding: 20, width: 340 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: s.text, marginBottom: 12 }}>📎 {t.reassign}</div>
            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 11, color: s.textMuted, display: 'block', marginBottom: 4 }}>{t.reassignType}</label>
              <select value={reassignType} onChange={e => setReassignType(e.target.value)} style={{ width: '100%', background: s.inputBg, border: `1px solid ${s.inputBorder}`, borderRadius: 5, color: s.text, fontSize: 12, padding: '6px 9px', outline: 'none' }}>
                <option value="supplier_bill">{t.filterBill}</option>
                <option value="customer_invoice">{t.filterInvoice}</option>
                <option value="bank_transaction">{t.filterBank}</option>
                <option value="journal_entry">{t.filterJournal}</option>
                <option value="daily_entry">{t.filterDaily}</option>
              </select>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, color: s.textMuted, display: 'block', marginBottom: 4 }}>{t.reassignId}</label>
              <input value={reassignEntityId} onChange={e => setReassignEntityId(e.target.value)} type="number" placeholder="ID" style={{ width: '100%', boxSizing: 'border-box', background: s.inputBg, border: `1px solid ${s.inputBorder}`, borderRadius: 5, color: s.text, fontSize: 12, padding: '6px 9px', outline: 'none' }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleReassign} style={{ flex: 1, padding: '7px', borderRadius: 6, border: 'none', background: `linear-gradient(135deg,${s.accent},${s.accentHover})`, color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>{t.reassign}</button>
              <button onClick={() => setReassignId(null)} style={{ flex: 1, padding: '7px', borderRadius: 6, border: `1px solid ${s.cardBorder}`, background: s.section, color: s.textSub, fontSize: 12, cursor: 'pointer' }}>{lang === 'fr' ? 'Annuler' : 'Cancel'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Orphans section */}
      <div style={{ background: s.card, border: `1px solid ${s.cardBorder}`, borderRadius: 9, padding: 14 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: s.text, marginBottom: 4 }}>🗂 {t.orphans}</div>
        <div style={{ fontSize: 11, color: s.textMuted, marginBottom: 10 }}>{t.orphansDesc}</div>
        {orphans.length === 0 ? (
          <div style={{ fontSize: 11.5, color: s.textMuted }}>{t.noOrphans}</div>
        ) : (
          orphans.map(doc => (
            <div key={doc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: `1px solid ${s.cardBorder}` }}>
              <span style={{ fontSize: 12, color: s.text }}>📎 {doc.file_name} <span style={{ fontSize: 10, color: s.textMuted }}>{doc.created_at?.slice(0, 10)}</span></span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => handleOpen(doc.id)} style={{ padding: '3px 9px', borderRadius: 5, border: `1px solid ${s.inputBorder}`, background: s.section, color: s.textSub, fontSize: 11, cursor: 'pointer' }}>{t.open}</button>
                <button onClick={() => setReassignId(doc.id)} style={{ padding: '3px 9px', borderRadius: 5, border: `1px solid rgba(249,115,22,0.25)`, background: 'rgba(249,115,22,0.07)', color: s.accent, fontSize: 11, cursor: 'pointer' }}>{t.reassign}</button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Privacy note */}
      <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 6, background: 'rgba(14,165,233,0.06)', border: '1px solid rgba(14,165,233,0.12)', fontSize: 10.5, color: '#7dd3fc' }}>
        🔒 {lang === 'fr'
          ? 'Les documents sont stockés localement sur votre ordinateur. La synchronisation cloud (Pro) utilise un chiffrement côté serveur AES-256 — BalanceIQ peut déchiffrer vos documents pour les synchroniser. Ce n\'est pas du chiffrement de bout en bout.'
          : 'Documents are stored locally on your computer. Cloud sync (Pro) uses server-side AES-256 encryption — BalanceIQ can decrypt your documents for sync. This is not end-to-end encryption.'}
      </div>
    </div>
  );
}
