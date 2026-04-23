import React, { useState, useEffect, useCallback, useMemo } from 'react';

// ── Constants ──────────────────────────────────────────────────────────────────

const SOURCE_LABELS = {
  invoice:          { fr: 'Facture',           en: 'Invoice' },
  invoice_payment:  { fr: 'Paiement facture',  en: 'Invoice payment' },
  refund:           { fr: 'Remboursement',     en: 'Refund' },
  bill:             { fr: 'Facture fournisseur',en: 'Bill' },
  bill_payment:     { fr: 'Paiement fourn.',   en: 'Bill payment' },
  bank_tx:          { fr: 'Transaction banc.', en: 'Bank transaction' },
  tax_close:        { fr: 'Fermeture taxe',    en: 'Tax close' },
  depreciation:     { fr: 'Amortissement',     en: 'Depreciation' },
  recurring:        { fr: 'Récurrent',         en: 'Recurring' },
  manual:           { fr: 'Manuel',            en: 'Manual' },
  opening_balance:  { fr: 'Solde ouverture',   en: 'Opening balance' },
  year_close:       { fr: 'Fermeture annuelle',en: 'Year-close' },
  reversal:         { fr: 'Annulation',        en: 'Reversal' },
  stripe_fee:       { fr: 'Frais Stripe',      en: 'Stripe fee' },
  stripe_payout:    { fr: 'Virement Stripe',   en: 'Stripe payout' },
  suspense_promote: { fr: 'Reclassification',  en: 'Reclassify' },
};

const STATUS_STYLE = {
  draft:    { bg: '#1e293b', color: '#94a3b8', label: { fr: 'Brouillon', en: 'Draft' } },
  posted:   { bg: '#14532d', color: '#86efac', label: { fr: 'Comptabilisé', en: 'Posted' } },
  reversed: { bg: '#3b1616', color: '#fca5a5', label: { fr: 'Annulé', en: 'Reversed' } },
};

const TYPE_SIGN = { asset: 1, cogs: 1, expense: 1, liability: -1, equity: -1, revenue: -1 };

function fmtCents(cents) {
  if (!cents && cents !== 0) return '—';
  const abs = Math.abs(cents);
  const dollars = (abs / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return cents < 0 ? `(${dollars})` : dollars;
}

function fmtDate(s) {
  if (!s) return '';
  return s.slice(0, 10);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ── UI strings ─────────────────────────────────────────────────────────────────

const UI = {
  fr: {
    tabJournal:       'Journal',
    tabBalance:       'Balance de vérification',
    tabPeriods:       'Périodes',
    newEntry:         '+ Nouvelle écriture',
    search:           'Rechercher…',
    statusAll:        'Tous',
    statusDraft:      'Brouillon',
    statusPosted:     'Comptabilisé',
    statusReversed:   'Annulé',
    colDate:          'Date',
    colNumber:        'N° écriture',
    colDesc:          'Description',
    colSource:        'Source',
    colStatus:        'État',
    colDebit:         'Débit',
    colCredit:        'Crédit',
    noEntries:        'Aucune écriture trouvée.',
    loading:          'Chargement…',
    postBtn:          'Comptabiliser',
    reverseBtn:       'Annuler',
    deleteBtn:        'Supprimer',
    editBtn:          'Modifier',
    viewBtn:          'Voir',
    cancelBtn:        'Annuler',
    saveBtn:          'Enregistrer brouillon',
    confirmPost:      'Comptabiliser l\'écriture',
    confirmReverse:   'Annuler l\'écriture',
    reversalReason:   'Raison de l\'annulation',
    reasonRequired:   'Une raison est requise',
    entryDate:        'Date',
    description:      'Description',
    sourceType:       'Type de source',
    addLine:          '+ Ajouter une ligne',
    removeLine:       'Suppr.',
    account:          'Compte',
    debit:            'Débit ($)',
    credit:           'Crédit ($)',
    memo:             'Mémo',
    balanceOk:        '✓ Équilibré',
    balanceBad:       '⚠ Déséquilibré',
    errorSave:        'Erreur lors de la sauvegarde',
    errorPost:        'Erreur lors de la comptabilisation',
    successPost:      'Écriture comptabilisée',
    successReverse:   'Écriture annulée',
    successDelete:    'Écriture supprimée',
    asOf:             'Au',
    generate:         'Générer',
    accountNum:       'N°',
    accountName:      'Nom',
    colType:          'Type',
    totalDebit:       'Total débit',
    totalCredit:      'Total crédit',
    noData:           'Aucune donnée.',
    periodStatus:     { open: 'Ouvert', review: 'Révision', closed: 'Fermé', reopened: 'Rouvert' },
    closeBtn:         'Fermer la période',
    reopenBtn:        'Rouvrir',
    reopenReason:     'Raison de réouverture',
    closedAt:         'Fermé le',
    periodType:       { month: 'Mensuelle', quarter: 'Trimestrielle', year: 'Annuelle' },
    noPeriods:        'Aucune période créée. Les périodes sont créées automatiquement à la première écriture du mois.',
    prev:             '← Préc.',
    next:             'Suiv. →',
    disclaimer:       'BalanceIQ produit ces calculs à titre indicatif. La responsabilité de la conformité fiscale incombe au contribuable. Consultez votre comptable avant toute déclaration.',
  },
  en: {
    tabJournal:       'Journal',
    tabBalance:       'Trial Balance',
    tabPeriods:       'Periods',
    newEntry:         '+ New entry',
    search:           'Search…',
    statusAll:        'All',
    statusDraft:      'Draft',
    statusPosted:     'Posted',
    statusReversed:   'Reversed',
    colDate:          'Date',
    colNumber:        'Entry #',
    colDesc:          'Description',
    colSource:        'Source',
    colStatus:        'Status',
    colDebit:         'Debit',
    colCredit:        'Credit',
    noEntries:        'No entries found.',
    loading:          'Loading…',
    postBtn:          'Post',
    reverseBtn:       'Reverse',
    deleteBtn:        'Delete',
    editBtn:          'Edit',
    viewBtn:          'View',
    cancelBtn:        'Cancel',
    saveBtn:          'Save draft',
    confirmPost:      'Post entry',
    confirmReverse:   'Reverse entry',
    reversalReason:   'Reversal reason',
    reasonRequired:   'A reason is required',
    entryDate:        'Date',
    description:      'Description',
    sourceType:       'Source type',
    addLine:          '+ Add line',
    removeLine:       'Del',
    account:          'Account',
    debit:            'Debit ($)',
    credit:           'Credit ($)',
    memo:             'Memo',
    balanceOk:        '✓ Balanced',
    balanceBad:       '⚠ Imbalanced',
    errorSave:        'Error saving entry',
    errorPost:        'Error posting entry',
    successPost:      'Entry posted',
    successReverse:   'Entry reversed',
    successDelete:    'Entry deleted',
    asOf:             'As of',
    generate:         'Generate',
    accountNum:       '#',
    accountName:      'Account Name',
    colType:          'Type',
    totalDebit:       'Total debit',
    totalCredit:      'Total credit',
    noData:           'No data.',
    periodStatus:     { open: 'Open', review: 'Review', closed: 'Closed', reopened: 'Reopened' },
    closeBtn:         'Close period',
    reopenBtn:        'Reopen',
    reopenReason:     'Reopen reason',
    closedAt:         'Closed on',
    periodType:       { month: 'Monthly', quarter: 'Quarterly', year: 'Annual' },
    noPeriods:        'No periods yet. Periods are created automatically on first entry of each month.',
    prev:             '← Prev.',
    next:             'Next →',
    disclaimer:       'BalanceIQ produces these calculations for informational purposes. Tax compliance responsibility rests with the taxpayer. Consult your accountant before filing.',
  },
};

// ── EntryFormModal ─────────────────────────────────────────────────────────────

function EntryFormModal({ lang, accounts, editEntry, onClose, onSaved }) {
  const t = UI[lang];
  const [entryDate, setEntryDate] = useState(editEntry?.entry_date || todayStr());
  const [description, setDescription] = useState(editEntry?.description || '');
  const [sourceType, setSourceType] = useState(editEntry?.source_type || 'manual');
  const [lines, setLines] = useState(() => {
    if (editEntry?.lines?.length) {
      return editEntry.lines.map(l => ({
        account_id: l.account_id,
        debit: l.debit_cents ? (l.debit_cents / 100).toFixed(2) : '',
        credit: l.credit_cents ? (l.credit_cents / 100).toFixed(2) : '',
        memo: l.memo || '',
      }));
    }
    return [
      { account_id: '', debit: '', credit: '', memo: '' },
      { account_id: '', debit: '', credit: '', memo: '' },
    ];
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const totalDebit  = lines.reduce((s, l) => s + (parseFloat(l.debit)  || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.005 && totalDebit > 0;

  const accountById = useMemo(() => {
    const m = {};
    for (const a of accounts) m[a.id] = a;
    return m;
  }, [accounts]);

  function updateLine(i, field, val) {
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: val } : l));
  }

  function addLine() {
    setLines(prev => [...prev, { account_id: '', debit: '', credit: '', memo: '' }]);
  }

  function removeLine(i) {
    setLines(prev => prev.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const lineData = lines
        .filter(l => l.account_id)
        .map(l => ({
          account_id:   parseInt(l.account_id, 10),
          debit_cents:  Math.round((parseFloat(l.debit)  || 0) * 100),
          credit_cents: Math.round((parseFloat(l.credit) || 0) * 100),
          memo:         l.memo || null,
        }));

      const data = { entry_date: entryDate, description, source_type: sourceType, lines: lineData };
      let result;
      if (editEntry?.id) {
        await window.api.ledger.entry.update(editEntry.id, data);
        result = { entryId: editEntry.id };
      } else {
        result = await window.api.ledger.entry.draft(data);
      }
      onSaved(result);
    } catch (e) {
      setError(e.message || t.errorSave);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#1a1d2e', border: '1px solid #2d3148', borderRadius: 12, width: '90%', maxWidth: 820, maxHeight: '90vh', overflow: 'auto', padding: 28 }}>
        <h3 style={{ margin: '0 0 20px', color: '#f1f5f9', fontSize: 17 }}>
          {editEntry?.id ? t.editBtn : t.newEntry}
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>{t.entryDate}</label>
            <input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>{t.sourceType}</label>
            <select value={sourceType} onChange={e => setSourceType(e.target.value)} style={inputStyle}>
              {Object.entries(SOURCE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v[lang]}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>{t.description}</label>
            <input value={description} onChange={e => setDescription(e.target.value)} style={inputStyle} placeholder="…" />
          </div>
        </div>

        {/* Lines table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 8 }}>
          <thead>
            <tr style={{ color: '#94a3b8', borderBottom: '1px solid #2d3148' }}>
              <th style={{ textAlign: 'left', padding: '6px 4px', width: '35%' }}>{t.account}</th>
              <th style={{ textAlign: 'right', padding: '6px 4px', width: '15%' }}>{t.debit}</th>
              <th style={{ textAlign: 'right', padding: '6px 4px', width: '15%' }}>{t.credit}</th>
              <th style={{ textAlign: 'left', padding: '6px 4px' }}>{t.memo}</th>
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <tr key={i}>
                <td style={{ padding: '4px 4px' }}>
                  <select value={line.account_id} onChange={e => updateLine(i, 'account_id', e.target.value)} style={{ ...inputStyle, margin: 0 }}>
                    <option value="">— {t.account} —</option>
                    {accounts.filter(a => !a.is_archived).map(a => (
                      <option key={a.id} value={a.id}>{a.account_number} {a.name_fr}</option>
                    ))}
                  </select>
                </td>
                <td style={{ padding: '4px 4px' }}>
                  <input type="number" step="0.01" min="0" value={line.debit} onChange={e => updateLine(i, 'debit', e.target.value)}
                    style={{ ...inputStyle, margin: 0, textAlign: 'right' }} placeholder="0.00" />
                </td>
                <td style={{ padding: '4px 4px' }}>
                  <input type="number" step="0.01" min="0" value={line.credit} onChange={e => updateLine(i, 'credit', e.target.value)}
                    style={{ ...inputStyle, margin: 0, textAlign: 'right' }} placeholder="0.00" />
                </td>
                <td style={{ padding: '4px 4px' }}>
                  <input value={line.memo} onChange={e => updateLine(i, 'memo', e.target.value)}
                    style={{ ...inputStyle, margin: 0 }} placeholder="…" />
                </td>
                <td style={{ padding: '4px 4px', textAlign: 'center' }}>
                  {lines.length > 2 && (
                    <button onClick={() => removeLine(i)} style={btnDangerSm}>{t.removeLine}</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '1px solid #2d3148', color: balanced ? '#86efac' : '#fbbf24' }}>
              <td style={{ padding: '8px 4px', color: '#94a3b8' }}>
                <button onClick={addLine} style={btnGhost}>{t.addLine}</button>
              </td>
              <td style={{ padding: '8px 4px', textAlign: 'right', fontWeight: 600 }}>
                {totalDebit.toFixed(2)}
              </td>
              <td style={{ padding: '8px 4px', textAlign: 'right', fontWeight: 600 }}>
                {totalCredit.toFixed(2)}
              </td>
              <td colSpan={2} style={{ padding: '8px 4px', fontSize: 12 }}>
                {balanced ? t.balanceOk : t.balanceBad}
              </td>
            </tr>
          </tfoot>
        </table>

        {error && <p style={{ color: '#fca5a5', fontSize: 13, margin: '8px 0' }}>{error}</p>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onClose} style={btnSecondary}>{t.cancelBtn}</button>
          <button onClick={handleSave} disabled={saving} style={btnPrimary}>
            {saving ? '…' : t.saveBtn}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ReverseModal ───────────────────────────────────────────────────────────────

function ReverseModal({ lang, entry, onClose, onDone }) {
  const t = UI[lang];
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleReverse() {
    if (!reason.trim()) { setError(t.reasonRequired); return; }
    setSaving(true);
    setError('');
    try {
      await window.api.ledger.entry.reverse(entry.id, reason.trim());
      onDone(t.successReverse);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#1a1d2e', border: '1px solid #2d3148', borderRadius: 12, width: 480, padding: 28 }}>
        <h3 style={{ margin: '0 0 16px', color: '#f1f5f9' }}>{t.confirmReverse}</h3>
        <p style={{ color: '#94a3b8', fontSize: 14, marginBottom: 16 }}>{entry.entry_number} — {entry.description}</p>
        <label style={labelStyle}>{t.reversalReason} *</label>
        <textarea value={reason} onChange={e => setReason(e.target.value)}
          rows={3} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', resize: 'vertical' }} />
        {error && <p style={{ color: '#fca5a5', fontSize: 13, margin: '8px 0' }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onClose} style={btnSecondary}>{t.cancelBtn}</button>
          <button onClick={handleReverse} disabled={saving} style={{ ...btnPrimary, background: '#dc2626' }}>
            {saving ? '…' : t.reverseBtn}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── EntryDetailModal ───────────────────────────────────────────────────────────

function EntryDetailModal({ lang, entry, onClose }) {
  const t = UI[lang];
  if (!entry) return null;
  const statusCfg = STATUS_STYLE[entry.status] || STATUS_STYLE.draft;
  const totalDebit  = (entry.lines || []).reduce((s, l) => s + l.debit_cents, 0);
  const totalCredit = (entry.lines || []).reduce((s, l) => s + l.credit_cents, 0);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#1a1d2e', border: '1px solid #2d3148', borderRadius: 12, width: '90%', maxWidth: 700, maxHeight: '85vh', overflow: 'auto', padding: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, color: '#f1f5f9', fontSize: 16 }}>{entry.entry_number}</h3>
            <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: 13 }}>{fmtDate(entry.entry_date)} — {entry.description || '—'}</p>
          </div>
          <span style={{ background: statusCfg.bg, color: statusCfg.color, padding: '3px 10px', borderRadius: 20, fontSize: 12 }}>
            {statusCfg.label[lang]}
          </span>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ color: '#94a3b8', borderBottom: '1px solid #2d3148' }}>
              <th style={{ textAlign: 'left', padding: '6px 4px' }}>{t.account}</th>
              <th style={{ textAlign: 'right', padding: '6px 4px' }}>{t.debit}</th>
              <th style={{ textAlign: 'right', padding: '6px 4px' }}>{t.credit}</th>
              <th style={{ textAlign: 'left', padding: '6px 4px' }}>{t.memo}</th>
            </tr>
          </thead>
          <tbody>
            {(entry.lines || []).map((l, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #1e293b' }}>
                <td style={{ padding: '7px 4px', color: '#e2e8f0' }}>
                  {l.account_number} {l.name_fr}
                </td>
                <td style={{ padding: '7px 4px', textAlign: 'right', color: '#86efac' }}>
                  {l.debit_cents ? fmtCents(l.debit_cents) : ''}
                </td>
                <td style={{ padding: '7px 4px', textAlign: 'right', color: '#93c5fd' }}>
                  {l.credit_cents ? fmtCents(l.credit_cents) : ''}
                </td>
                <td style={{ padding: '7px 4px', color: '#64748b' }}>{l.memo || ''}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '1px solid #2d3148', fontWeight: 600 }}>
              <td style={{ padding: '8px 4px', color: '#94a3b8' }}>Total</td>
              <td style={{ padding: '8px 4px', textAlign: 'right', color: '#86efac' }}>{fmtCents(totalDebit)}</td>
              <td style={{ padding: '8px 4px', textAlign: 'right', color: '#93c5fd' }}>{fmtCents(totalCredit)}</td>
              <td />
            </tr>
          </tfoot>
        </table>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onClose} style={btnSecondary}>{t.cancelBtn}</button>
        </div>
      </div>
    </div>
  );
}

// ── JournalTab ────────────────────────────────────────────────────────────────

function JournalTab({ lang, accounts }) {
  const t = UI[lang];
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [offset, setOffset] = useState(0);
  const [toast, setToast] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editEntry, setEditEntry] = useState(null);
  const [viewEntry, setViewEntry] = useState(null);
  const [reverseEntry, setReverseEntry] = useState(null);
  const LIMIT = 50;

  const load = useCallback(async (newOffset = 0) => {
    setLoading(true);
    try {
      const opts = { limit: LIMIT, offset: newOffset };
      if (statusFilter) opts.status = statusFilter;
      if (dateFrom) opts.dateFrom = dateFrom;
      if (dateTo) opts.dateTo = dateTo;
      const res = await window.api.ledger.entry.list(opts);
      setEntries(res.entries || []);
      setTotal(res.total || 0);
      setOffset(newOffset);
    } catch (_) {}
    setLoading(false);
  }, [statusFilter, dateFrom, dateTo]);

  useEffect(() => { load(0); }, [load]);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  async function handlePost(entry) {
    try {
      await window.api.ledger.entry.post(entry.id);
      showToast(t.successPost);
      load(offset);
    } catch (e) {
      showToast(e.message);
    }
  }

  async function handleDelete(entry) {
    try {
      await window.api.ledger.entry.delete(entry.id);
      showToast(t.successDelete);
      load(offset);
    } catch (e) {
      showToast(e.message);
    }
  }

  async function handleView(entry) {
    const full = await window.api.ledger.entry.get(entry.id);
    setViewEntry(full);
  }

  async function handleEdit(entry) {
    const full = await window.api.ledger.entry.get(entry.id);
    setEditEntry(full);
    setShowForm(true);
  }

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={() => { setEditEntry(null); setShowForm(true); }} style={btnPrimary}>{t.newEntry}</button>
        <div style={{ display: 'flex', gap: 6 }}>
          {[['', t.statusAll], ['draft', t.statusDraft], ['posted', t.statusPosted], ['reversed', t.statusReversed]].map(([v, label]) => (
            <button key={v} onClick={() => setStatusFilter(v)}
              style={{ ...btnFilter, ...(statusFilter === v ? btnFilterActive : {}) }}>{label}</button>
          ))}
        </div>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ ...inputStyle, width: 140, margin: 0 }} />
        <span style={{ color: '#64748b' }}>–</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ ...inputStyle, width: 140, margin: 0 }} />
      </div>

      {loading && <p style={{ color: '#94a3b8', fontSize: 13 }}>{t.loading}</p>}

      {!loading && entries.length === 0 && <p style={{ color: '#64748b', fontSize: 13 }}>{t.noEntries}</p>}

      {!loading && entries.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ color: '#94a3b8', borderBottom: '1px solid #2d3148' }}>
              <th style={{ textAlign: 'left', padding: '8px 6px' }}>{t.colDate}</th>
              <th style={{ textAlign: 'left', padding: '8px 6px' }}>{t.colNumber}</th>
              <th style={{ textAlign: 'left', padding: '8px 6px' }}>{t.colDesc}</th>
              <th style={{ textAlign: 'left', padding: '8px 6px' }}>{t.colSource}</th>
              <th style={{ textAlign: 'center', padding: '8px 6px' }}>{t.colStatus}</th>
              <th style={{ textAlign: 'right', padding: '8px 6px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(entry => {
              const sc = STATUS_STYLE[entry.status] || STATUS_STYLE.draft;
              const srcLabel = SOURCE_LABELS[entry.source_type];
              return (
                <tr key={entry.id} style={{ borderBottom: '1px solid #1a1d2e' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#1e2235'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <td style={{ padding: '9px 6px', color: '#94a3b8' }}>{fmtDate(entry.entry_date)}</td>
                  <td style={{ padding: '9px 6px', color: '#e2e8f0', fontFamily: 'monospace' }}>{entry.entry_number}</td>
                  <td style={{ padding: '9px 6px', color: '#cbd5e1', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {entry.description || '—'}
                  </td>
                  <td style={{ padding: '9px 6px', color: '#64748b' }}>{srcLabel ? srcLabel[lang] : entry.source_type}</td>
                  <td style={{ padding: '9px 6px', textAlign: 'center' }}>
                    <span style={{ background: sc.bg, color: sc.color, padding: '2px 8px', borderRadius: 12, fontSize: 11 }}>
                      {sc.label[lang]}
                    </span>
                  </td>
                  <td style={{ padding: '9px 6px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      <button onClick={() => handleView(entry)} style={btnActionSm}>{t.viewBtn}</button>
                      {entry.status === 'draft' && <>
                        <button onClick={() => handleEdit(entry)} style={btnActionSm}>{t.editBtn}</button>
                        <button onClick={() => handlePost(entry)} style={{ ...btnActionSm, color: '#86efac' }}>{t.postBtn}</button>
                        <button onClick={() => handleDelete(entry)} style={{ ...btnActionSm, color: '#fca5a5' }}>{t.deleteBtn}</button>
                      </>}
                      {entry.status === 'posted' && (
                        <button onClick={() => setReverseEntry(entry)} style={{ ...btnActionSm, color: '#fbbf24' }}>{t.reverseBtn}</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Pagination */}
      {total > LIMIT && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'center' }}>
          {offset > 0 && <button onClick={() => load(offset - LIMIT)} style={btnSecondary}>{t.prev}</button>}
          <span style={{ color: '#94a3b8', fontSize: 13, alignSelf: 'center' }}>{offset + 1}–{Math.min(offset + LIMIT, total)} / {total}</span>
          {offset + LIMIT < total && <button onClick={() => load(offset + LIMIT)} style={btnSecondary}>{t.next}</button>}
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '10px 18px', color: '#f1f5f9', fontSize: 14, zIndex: 2000 }}>
          {toast}
        </div>
      )}

      {showForm && (
        <EntryFormModal lang={lang} accounts={accounts} editEntry={editEntry}
          onClose={() => { setShowForm(false); setEditEntry(null); }}
          onSaved={() => { setShowForm(false); setEditEntry(null); load(offset); }} />
      )}

      {viewEntry && (
        <EntryDetailModal lang={lang} entry={viewEntry} onClose={() => setViewEntry(null)} />
      )}

      {reverseEntry && (
        <ReverseModal lang={lang} entry={reverseEntry}
          onClose={() => setReverseEntry(null)}
          onDone={(msg) => { setReverseEntry(null); showToast(msg); load(offset); }} />
      )}
    </div>
  );
}

// ── TrialBalanceTab ────────────────────────────────────────────────────────────

function TrialBalanceTab({ lang }) {
  const t = UI[lang];
  const [asOf, setAsOf] = useState(todayStr());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  async function generate() {
    setLoading(true);
    try {
      const data = await window.api.ledger.trialBalance(asOf);
      setRows(data || []);
      setGenerated(true);
    } catch (_) {}
    setLoading(false);
  }

  const totalDebit  = rows.reduce((s, r) => s + (r.total_debit_cents || 0), 0);
  const totalCredit = rows.reduce((s, r) => s + (r.total_credit_cents || 0), 0);
  const balanced = totalDebit === totalCredit;

  const TYPE_ORDER = ['asset', 'liability', 'equity', 'revenue', 'cogs', 'expense'];
  const TYPE_LABELS = {
    asset:     { fr: 'Actifs',           en: 'Assets' },
    liability: { fr: 'Passifs',          en: 'Liabilities' },
    equity:    { fr: 'Capitaux propres', en: 'Equity' },
    revenue:   { fr: 'Revenus',          en: 'Revenue' },
    cogs:      { fr: 'Coût des ventes',  en: 'COGS' },
    expense:   { fr: 'Frais',            en: 'Expenses' },
  };

  const byType = useMemo(() => {
    const m = {};
    for (const r of rows) {
      if (!m[r.type]) m[r.type] = [];
      m[r.type].push(r);
    }
    return m;
  }, [rows]);

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20 }}>
        <span style={{ color: '#94a3b8', fontSize: 14 }}>{t.asOf}</span>
        <input type="date" value={asOf} onChange={e => setAsOf(e.target.value)} style={{ ...inputStyle, width: 160, margin: 0 }} />
        <button onClick={generate} disabled={loading} style={btnPrimary}>{loading ? '…' : t.generate}</button>
      </div>

      {generated && rows.length === 0 && <p style={{ color: '#64748b', fontSize: 13 }}>{t.noData}</p>}

      {generated && rows.length > 0 && (
        <>
          <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 12px', fontStyle: 'italic' }}>{t.disclaimer}</p>
          {TYPE_ORDER.filter(type => byType[type]?.length).map(type => (
            <div key={type} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, padding: '4px 0', borderBottom: '1px solid #2d3148', marginBottom: 4 }}>
                {TYPE_LABELS[type][lang]}
              </div>
              {byType[type].map(r => (
                <div key={r.account_id} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 120px 120px', gap: 8, padding: '5px 4px', alignItems: 'center' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#1e2235'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <span style={{ color: '#64748b', fontFamily: 'monospace', fontSize: 13 }}>{r.account_number}</span>
                  <span style={{ color: '#cbd5e1', fontSize: 13 }}>{r.name_fr}</span>
                  <span style={{ color: '#86efac', textAlign: 'right', fontFamily: 'monospace', fontSize: 13 }}>
                    {r.total_debit_cents ? fmtCents(r.total_debit_cents) : ''}
                  </span>
                  <span style={{ color: '#93c5fd', textAlign: 'right', fontFamily: 'monospace', fontSize: 13 }}>
                    {r.total_credit_cents ? fmtCents(r.total_credit_cents) : ''}
                  </span>
                </div>
              ))}
            </div>
          ))}

          {/* Totals */}
          <div style={{ borderTop: '2px solid #2d3148', paddingTop: 10, display: 'grid', gridTemplateColumns: '80px 1fr 120px 120px', gap: 8 }}>
            <span />
            <span style={{ color: '#94a3b8', fontWeight: 700, fontSize: 13 }}>Total</span>
            <span style={{ color: balanced ? '#86efac' : '#fbbf24', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, fontSize: 13 }}>
              {fmtCents(totalDebit)}
            </span>
            <span style={{ color: balanced ? '#93c5fd' : '#fbbf24', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, fontSize: 13 }}>
              {fmtCents(totalCredit)}
            </span>
          </div>
          {!balanced && (
            <p style={{ color: '#fbbf24', fontSize: 13, marginTop: 8 }}>
              ⚠ {lang === 'fr' ? 'Déséquilibre détecté' : 'Imbalance detected'}: {fmtCents(Math.abs(totalDebit - totalCredit))}
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ── PeriodsTab ────────────────────────────────────────────────────────────────

function PeriodsTab({ lang }) {
  const t = UI[lang];
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reopenId, setReopenId] = useState(null);
  const [reopenReason, setReopenReason] = useState('');
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    try {
      const data = await window.api.period.list({});
      setPeriods((data || []).sort((a, b) => b.start_date.localeCompare(a.start_date)));
    } catch (_) {}
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  async function handleClose(periodId) {
    try {
      const res = await window.api.period.close(periodId);
      if (!res.success) {
        setError((res.blockers || []).join('\n'));
        return;
      }
      showToast(lang === 'fr' ? 'Période fermée' : 'Period closed');
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleReopen() {
    if (!reopenReason.trim()) { setError(t.reasonRequired); return; }
    try {
      await window.api.period.reopen(reopenId, reopenReason.trim());
      setReopenId(null);
      setReopenReason('');
      showToast(lang === 'fr' ? 'Période rouverte' : 'Period reopened');
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  const STATUS_COLORS = { open: '#86efac', review: '#fbbf24', closed: '#94a3b8', reopened: '#c4b5fd' };

  return (
    <div>
      {loading && <p style={{ color: '#94a3b8', fontSize: 13 }}>{t.loading}</p>}
      {!loading && periods.length === 0 && <p style={{ color: '#64748b', fontSize: 13 }}>{t.noPeriods}</p>}

      {!loading && periods.map(p => (
        <div key={p.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #1e293b' }}>
          <span style={{ color: STATUS_COLORS[p.status] || '#94a3b8', fontSize: 11, width: 70, textAlign: 'center', background: '#1e293b', borderRadius: 12, padding: '2px 6px' }}>
            {t.periodStatus[p.status] || p.status}
          </span>
          <span style={{ color: '#94a3b8', fontSize: 12, width: 80 }}>{t.periodType[p.period_type] || p.period_type}</span>
          <span style={{ color: '#cbd5e1', fontSize: 14, flex: 1 }}>{fmtDate(p.start_date)} – {fmtDate(p.end_date)}</span>
          {p.closed_at && (
            <span style={{ color: '#64748b', fontSize: 12 }}>{t.closedAt} {fmtDate(p.closed_at)}</span>
          )}
          {p.status === 'open' || p.status === 'reopened' ? (
            <button onClick={() => handleClose(p.id)} style={{ ...btnSecondary, fontSize: 12 }}>{t.closeBtn}</button>
          ) : p.status === 'closed' ? (
            <button onClick={() => { setReopenId(p.id); setReopenReason(''); setError(''); }}
              style={{ ...btnSecondary, fontSize: 12, color: '#fbbf24' }}>{t.reopenBtn}</button>
          ) : null}
        </div>
      ))}

      {/* Reopen modal */}
      {reopenId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#1a1d2e', border: '1px solid #2d3148', borderRadius: 12, width: 420, padding: 28 }}>
            <h3 style={{ margin: '0 0 12px', color: '#f1f5f9' }}>{t.reopenBtn}</h3>
            <label style={labelStyle}>{t.reopenReason} *</label>
            <textarea value={reopenReason} onChange={e => setReopenReason(e.target.value)}
              rows={3} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', resize: 'vertical' }} />
            {error && <p style={{ color: '#fca5a5', fontSize: 13, margin: '8px 0' }}>{error}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button onClick={() => setReopenId(null)} style={btnSecondary}>{t.cancelBtn}</button>
              <button onClick={handleReopen} style={btnPrimary}>{t.reopenBtn}</button>
            </div>
          </div>
        </div>
      )}

      {error && !reopenId && (
        <div style={{ background: '#3b1616', border: '1px solid #dc2626', borderRadius: 8, padding: 12, marginTop: 12, color: '#fca5a5', fontSize: 13, whiteSpace: 'pre-wrap' }}>
          {error}
          <button onClick={() => setError('')} style={{ float: 'right', background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '10px 18px', color: '#f1f5f9', fontSize: 14, zIndex: 2000 }}>
          {toast}
        </div>
      )}
    </div>
  );
}

// ── Main GrandLivreTab ─────────────────────────────────────────────────────────

export default function GrandLivreTab({ lang = 'fr' }) {
  const t = UI[lang];
  const [subTab, setSubTab] = useState('journal');
  const [accounts, setAccounts] = useState([]);

  useEffect(() => {
    if (!window.api?.coa?.list) return;
    window.api.coa.list().then(data => setAccounts(Array.isArray(data) ? data : [])).catch(() => {});
  }, []);

  return (
    <div style={{ padding: '20px 24px', minHeight: 400, background: '#0c0e14', borderRadius: 12, color: '#e2e8f0', fontFamily: "'Satoshi',-apple-system,BlinkMacSystemFont,sans-serif" }}>
      {/* Sub-tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid #2d3148' }}>
        {[
          ['journal', t.tabJournal],
          ['balance', t.tabBalance],
          ['periods', t.tabPeriods],
        ].map(([key, label]) => (
          <button key={key} onClick={() => setSubTab(key)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '8px 16px', fontSize: 14, fontWeight: subTab === key ? 700 : 400,
              color: subTab === key ? '#f97316' : '#94a3b8',
              borderBottom: subTab === key ? '2px solid #f97316' : '2px solid transparent',
              marginBottom: -1,
            }}>
            {label}
          </button>
        ))}
      </div>

      {subTab === 'journal' && <JournalTab lang={lang} accounts={accounts} />}
      {subTab === 'balance' && <TrialBalanceTab lang={lang} />}
      {subTab === 'periods' && <PeriodsTab lang={lang} />}
    </div>
  );
}

// ── Shared styles ──────────────────────────────────────────────────────────────

const inputStyle = {
  background: '#0f1117', border: '1px solid #2d3148', borderRadius: 6,
  color: '#f1f5f9', padding: '7px 10px', fontSize: 13, width: '100%', margin: '4px 0',
  outline: 'none', fontFamily: "'Satoshi',-apple-system,BlinkMacSystemFont,sans-serif",
};
const labelStyle = { display: 'block', color: '#94a3b8', fontSize: 12, marginBottom: 2 };
const btnPrimary = {
  background: '#f97316', border: 'none', borderRadius: 7,
  color: '#fff', padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
const btnSecondary = {
  background: '#1e293b', border: '1px solid #334155', borderRadius: 7,
  color: '#94a3b8', padding: '7px 14px', fontSize: 13, cursor: 'pointer',
};
const btnGhost = {
  background: 'none', border: '1px dashed #334155', borderRadius: 6,
  color: '#64748b', padding: '4px 10px', fontSize: 12, cursor: 'pointer',
};
const btnDangerSm = {
  background: 'none', border: '1px solid #7f1d1d', borderRadius: 5,
  color: '#fca5a5', padding: '3px 7px', fontSize: 11, cursor: 'pointer',
};
const btnActionSm = {
  background: 'none', border: '1px solid #334155', borderRadius: 5,
  color: '#94a3b8', padding: '3px 9px', fontSize: 11, cursor: 'pointer',
};
const btnFilter = {
  background: 'none', border: '1px solid #334155', borderRadius: 20,
  color: '#64748b', padding: '4px 12px', fontSize: 12, cursor: 'pointer',
};
const btnFilterActive = {
  background: '#1e293b', border: '1px solid #f97316',
  color: '#f97316',
};
