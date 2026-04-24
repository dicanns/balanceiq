import React, { useState, useEffect, useCallback, useRef } from 'react';

// ── i18n ─────────────────────────────────────────────────────────────────────
const UI = {
  fr: {
    tabComptes:       'Comptes',
    tabTransactions:  'Transactions',
    tabRapprochements:'Rapprochements',
    tabRegles:        'Règles appris',
    addAccount:       '+ Ajouter un compte',
    editAccount:      'Modifier',
    archiveAccount:   'Archiver',
    noAccounts:       'Aucun compte bancaire. Ajoutez-en un pour commencer.',
    importStatement:  'Importer un relevé',
    accountName:      'Nom du compte *',
    accountType:      'Type *',
    coaAccount:       'Compte GL (COA) *',
    openingBalance:   'Solde d\'ouverture ($) *',
    openingDate:      'Date d\'ouverture *',
    save:             'Enregistrer',
    cancel:           'Annuler',
    typeBank:         'Compte bancaire',
    typeCC:           'Carte de crédit',
    typeLOC:          'Marge de crédit',
    lastReconciled:   'Dernier rapprochement',
    never:            'Jamais',
    importTitle:      'Importer un relevé bancaire',
    importBtn:        'Importer',
    importing:        'Importation…',
    importResult:     (r) => `${r.rowCount} transactions importées — ${r.autoMatched} auto, ${r.suggested} suggestions, ${r.unmatched} non appariées${r.duplicateRows ? `, ${r.duplicateRows} doublons ignorés` : ''}.`,
    importDupe:       'Ce relevé a déjà été importé (fichier identique).',
    colMapTitle:      'Correspondance des colonnes',
    periodStart:      'Début de période',
    periodEnd:        'Fin de période',
    endingBalance:    'Solde final ($)',
    allStatuses:      'Tous les statuts',
    statusUnmatched:  'Non appariés',
    statusMatched:    'Appariés',
    statusSuggested:  'Suggestions',
    statusManual:     'Manuels',
    categorize:       'Catégoriser',
    match:            'Apparier',
    unmatch:          'Désapparier',
    selectCoa:        'Sélectionner un compte GL…',
    selectAccount:    '— Sélectionner un compte —',
    notes:            'Notes',
    saveCategorize:   'Enregistrer',
    previewTitle:     (name) => `Rapprochement — ${name}`,
    stmtBalance:      'Solde au relevé',
    biqBalance:       'Solde BalanceIQ',
    ecart:            'Écart',
    closeRec:         'Clôturer le rapprochement',
    reopenRec:        'Rouvrir',
    reopenReason:     'Raison de la réouverture *',
    noStatements:     'Aucun relevé importé pour ce compte.',
    noTransactions:   'Aucune transaction.',
    selectAccountFirst: 'Sélectionnez un compte pour voir les transactions.',
    selectAccountRec:   'Sélectionnez un compte.',
    unreconciledCount:(n) => `${n} transaction(s) non réconciliée(s)`,
    rulePattern:      'Description normalisée',
    ruleAccount:      'Compte GL assigné',
    ruleCount:        'Confirmations',
    ruleLastUsed:     'Dernière utilisation',
    ruleDelete:       'Supprimer',
    noRules:          'Aucune règle apprise.',
    confirmArchive:   'Archiver ce compte?',
    deleteRule:       'Supprimer cette règle?',
    reconciled:       'Réconcilié',
    open:             'En cours',
    ecartOk:          'Équilibré',
    suggestedCoa:     (name) => `Suggestion: ${name}`,
    confirm:          'Confirmer',
    fileLabel:        'Fichier (CSV, OFX, QFX, QBO)',
    optional:         'facultatif',
    openingBalance2:  'ex: 12 345.67',
    viewTransactions: 'Transactions',
    loading:          'Chargement…',
    colDate:          'Date',
    colDesc:          'Description',
    colAmount:        'Montant',
    colStatus:        'Statut',
    colCoa:           'Compte GL',
    colActions:       'Actions',
    colPeriod:        'Période',
    colEndBal:        'Solde final',
    colStatut:        'Statut',
    badgeMatched:     'Apparié',
    badgeSuggested:   'Suggestion',
    badgeManual:      'Manuel',
    badgeUnmatched:   'Non apparié',
    autoLabel:        '✓ auto',
    etransferBadge:   'Virement Interac',
    etransferMatch:   'Matcher',
    etransferSender:  'Expéditeur',
    etransferHint:    'Enregistrez le paiement sur la facture dans Facturation après avoir catégorisé cette transaction.',
    etransferMatchBtn:'Catégoriser vers Comptes clients (1100)',
  },
  en: {
    tabComptes:       'Accounts',
    tabTransactions:  'Transactions',
    tabRapprochements:'Reconciliations',
    tabRegles:        'Learned Rules',
    addAccount:       '+ Add Account',
    editAccount:      'Edit',
    archiveAccount:   'Archive',
    noAccounts:       'No bank accounts yet. Add one to get started.',
    importStatement:  'Import Statement',
    accountName:      'Account Name *',
    accountType:      'Type *',
    coaAccount:       'GL Account (COA) *',
    openingBalance:   'Opening Balance ($) *',
    openingDate:      'Opening Date *',
    save:             'Save',
    cancel:           'Cancel',
    typeBank:         'Bank Account',
    typeCC:           'Credit Card',
    typeLOC:          'Line of Credit',
    lastReconciled:   'Last reconciled',
    never:            'Never',
    importTitle:      'Import Bank Statement',
    importBtn:        'Import',
    importing:        'Importing…',
    importResult:     (r) => `${r.rowCount} transactions imported — ${r.autoMatched} auto-matched, ${r.suggested} suggested, ${r.unmatched} unmatched${r.duplicateRows ? `, ${r.duplicateRows} duplicates skipped` : ''}.`,
    importDupe:       'This statement appears to be already imported (identical file).',
    colMapTitle:      'Column Mapping',
    periodStart:      'Period Start',
    periodEnd:        'Period End',
    endingBalance:    'Ending Balance ($)',
    allStatuses:      'All statuses',
    statusUnmatched:  'Unmatched',
    statusMatched:    'Matched',
    statusSuggested:  'Suggested',
    statusManual:     'Manual',
    categorize:       'Categorize',
    match:            'Match',
    unmatch:          'Unmatch',
    selectCoa:        'Select a GL account…',
    selectAccount:    '— Select an account —',
    notes:            'Notes',
    saveCategorize:   'Save',
    previewTitle:     (name) => `Reconciliation — ${name}`,
    stmtBalance:      'Statement Balance',
    biqBalance:       'BalanceIQ Balance',
    ecart:            'Difference',
    closeRec:         'Close Reconciliation',
    reopenRec:        'Reopen',
    reopenReason:     'Reason for reopening *',
    noStatements:     'No statements imported for this account.',
    noTransactions:   'No transactions.',
    selectAccountFirst: 'Select an account to view transactions.',
    selectAccountRec:   'Select an account.',
    unreconciledCount:(n) => `${n} unreconciled transaction(s)`,
    rulePattern:      'Normalized Description',
    ruleAccount:      'Assigned GL Account',
    ruleCount:        'Confirmations',
    ruleLastUsed:     'Last Used',
    ruleDelete:       'Delete',
    noRules:          'No learned rules yet.',
    confirmArchive:   'Archive this account?',
    deleteRule:       'Delete this rule?',
    reconciled:       'Reconciled',
    open:             'In progress',
    ecartOk:          'Balanced',
    suggestedCoa:     (name) => `Suggestion: ${name}`,
    confirm:          'Confirm',
    fileLabel:        'File (CSV, OFX, QFX, QBO)',
    optional:         'optional',
    openingBalance2:  'e.g. 12,345.67',
    viewTransactions: 'Transactions',
    loading:          'Loading…',
    colDate:          'Date',
    colDesc:          'Description',
    colAmount:        'Amount',
    colStatus:        'Status',
    colCoa:           'GL Account',
    colActions:       'Actions',
    colPeriod:        'Period',
    colEndBal:        'Ending Balance',
    colStatut:        'Status',
    badgeMatched:     'Matched',
    badgeSuggested:   'Suggested',
    badgeManual:      'Manual',
    badgeUnmatched:   'Unmatched',
    autoLabel:        '✓ auto',
    etransferBadge:   'Interac E-Transfer',
    etransferMatch:   'Match',
    etransferSender:  'Sender',
    etransferHint:    'After categorizing this transaction, record the payment on the invoice in Facturation.',
    etransferMatchBtn:'Categorize to Accounts Receivable (1100)',
  },
};

const fmt = (n) => {
  const v = parseFloat(n) || 0;
  return (v < 0 ? '-' : '') + '$ ' + Math.abs(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
};

const fmtDate = (d) => d ? d.slice(0, 10) : '—';

// ── BanqueTab ─────────────────────────────────────────────────────────────────
export default function BanqueTab({ lang = 'fr' }) {
  const T = UI[lang] || UI.fr;
  const bankAvailable = !!window.api?.bank;

  // ALL hooks must be called unconditionally before any early return (Rules of Hooks)
  const [subTab, setSubTab] = useState('comptes');

  const [accounts, setAccounts]         = useState([]);
  const [coaList, setCoaList]           = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);

  const [showAccountModal, setShowAccountModal]   = useState(false);
  const [editingAccount, setEditingAccount]       = useState(null);
  const [accountForm, setAccountForm]             = useState({ name:'', account_type:'bank', coa_account_id:'', opening_balance:'0', opening_date: new Date().toISOString().slice(0,10) });

  const [showImportModal, setShowImportModal]     = useState(false);
  const [importAccountId, setImportAccountId]     = useState(null);
  const [importFile, setImportFile]               = useState(null);
  const [importPeriodStart, setImportPeriodStart] = useState('');
  const [importPeriodEnd, setImportPeriodEnd]     = useState('');
  const [importEndBal, setImportEndBal]           = useState('');
  const [importing, setImporting]                 = useState(false);
  const [importMsg, setImportMsg]                 = useState('');

  const [transactions, setTransactions]           = useState([]);
  const [txFilter, setTxFilter]                   = useState('all');
  const [txDateFrom, setTxDateFrom]               = useState('');
  const [txDateTo, setTxDateTo]                   = useState('');

  const [categorizingTx, setCategorizingTx]       = useState(null);
  const [categorizeCoaId, setCategorizeCoaId]     = useState('');
  const [categorizeNotes, setCategorizeNotes]     = useState('');
  const [etransferTx, setEtransferTx]             = useState(null);

  const [statements, setStatements]               = useState([]);
  const [recPreview, setRecPreview]               = useState(null);
  const [recLoading, setRecLoading]               = useState(false);

  const [learnedRules, setLearnedRules]           = useState([]);

  const [showReopenModal, setShowReopenModal]     = useState(null);
  const [reopenReason, setReopenReason]           = useState('');

  const fileInputRef = useRef(null);

  // ── Data loading ────────────────────────────────────────────────────────────
  const loadAccounts = useCallback(async () => {
    if (!window.api?.bank) return;
    try {
      const rows = await window.api.bank.accounts.list();
      setAccounts(rows || []);
    } catch (_) {}
  }, []);

  const loadCoa = useCallback(async () => {
    if (!window.api?.coa) return;
    try {
      const rows = await window.api.coa.list();
      setCoaList((rows || []).filter(a => !a.is_archived));
    } catch (_) {}
  }, []);

  const loadTransactions = useCallback(async () => {
    if (!window.api?.bank || !selectedAccount) return;
    try {
      const rows = await window.api.bank.transactions.list(selectedAccount.id, {
        statusFilter: txFilter !== 'all' ? txFilter : undefined,
        dateFrom: txDateFrom || undefined,
        dateTo:   txDateTo   || undefined,
      });
      setTransactions(rows || []);
    } catch (_) {}
  }, [selectedAccount, txFilter, txDateFrom, txDateTo]);

  const loadStatements = useCallback(async () => {
    if (!window.api?.bank || !selectedAccount) return;
    try {
      const rows = await window.api.bank.statement.list(selectedAccount.id);
      setStatements(rows || []);
    } catch (_) {}
  }, [selectedAccount]);

  const loadLearnedRules = useCallback(async () => {
    if (!window.api?.bank) return;
    try {
      const rows = await window.api.bank.learned.list();
      setLearnedRules(rows || []);
    } catch (_) {}
  }, []);

  const loadRecPreview = useCallback(async () => {
    if (!window.api?.bank || !selectedAccount) return;
    setRecLoading(true);
    try {
      const p = await window.api.bank.reconcile.preview(selectedAccount.id);
      setRecPreview(p);
    } catch (e) {
      setRecPreview(null);
    } finally {
      setRecLoading(false);
    }
  }, [selectedAccount]);

  useEffect(() => { loadAccounts(); loadCoa(); loadLearnedRules(); }, []);
  useEffect(() => { if (subTab === 'transactions') loadTransactions(); }, [subTab, selectedAccount, txFilter, txDateFrom, txDateTo]);
  useEffect(() => { if (subTab === 'rapprochements') { loadStatements(); loadRecPreview(); } }, [subTab, selectedAccount]);
  useEffect(() => { if (subTab === 'regles') loadLearnedRules(); }, [subTab]);

  // Guard AFTER all hooks — React Rules of Hooks require hooks before any early return
  if (!bankAvailable) {
    return (
      <div style={{ padding: 32, color: '#64748b', textAlign: 'center' }}>
        <p style={{ fontSize: 14 }}>🔄 {lang === 'en' ? 'Please restart the app to load the Bank module.' : 'Veuillez redémarrer l\'application pour charger le module Banque.'}</p>
      </div>
    );
  }

  // ── Account CRUD ────────────────────────────────────────────────────────────
  const openNewAccount = () => {
    setEditingAccount(null);
    setAccountForm({ name:'', account_type:'bank', coa_account_id:'', opening_balance:'0', opening_date: new Date().toISOString().slice(0,10) });
    setShowAccountModal(true);
  };

  const openEditAccount = (acc) => {
    setEditingAccount(acc);
    setAccountForm({ name: acc.name, account_type: acc.account_type, coa_account_id: String(acc.coa_account_id), opening_balance: String(acc.opening_balance), opening_date: acc.opening_date });
    setShowAccountModal(true);
  };

  const saveAccount = async () => {
    const fields = {
      name: accountForm.name.trim(),
      account_type: accountForm.account_type,
      coa_account_id: parseInt(accountForm.coa_account_id, 10),
      opening_balance: parseFloat(accountForm.opening_balance) || 0,
      opening_date: accountForm.opening_date,
    };
    if (!fields.name || !fields.coa_account_id || !fields.opening_date) return;
    try {
      if (editingAccount) {
        await window.api.bank.accounts.update(editingAccount.id, fields);
      } else {
        await window.api.bank.accounts.create(fields);
      }
      setShowAccountModal(false);
      loadAccounts();
    } catch (_) {}
  };

  const archiveAccount = async (id) => {
    if (!window.confirm(T.confirmArchive)) return;
    try {
      await window.api.bank.accounts.archive(id);
      if (selectedAccount?.id === id) setSelectedAccount(null);
      loadAccounts();
    } catch (_) {}
  };

  // ── Import ──────────────────────────────────────────────────────────────────
  const openImport = (acc) => {
    setImportAccountId(acc.id);
    setImportFile(null);
    setImportPeriodStart('');
    setImportPeriodEnd('');
    setImportEndBal('');
    setImportMsg('');
    setShowImportModal(true);
  };

  const handleImport = async () => {
    if (!importFile) return;
    setImporting(true);
    setImportMsg('');
    try {
      const text = await importFile.text();
      const ext  = importFile.name.split('.').pop().toLowerCase();
      const result = await window.api.bank.statement.import({
        bankAccountId: importAccountId,
        fileText: text,
        fileName: importFile.name,
        fileType: ext,
        periodStart: importPeriodStart || undefined,
        periodEnd:   importPeriodEnd   || undefined,
        endingBalance: importEndBal ? parseFloat(importEndBal) : undefined,
      });
      setImportMsg(T.importResult(result));
      loadAccounts();
      if (selectedAccount?.id === importAccountId) { loadTransactions(); loadStatements(); loadRecPreview(); }
    } catch (e) {
      setImportMsg(e.message || (lang === 'en' ? 'Import error.' : 'Erreur lors de l\'importation.'));
    } finally {
      setImporting(false);
    }
  };

  // ── Categorize ──────────────────────────────────────────────────────────────
  const openCategorize = (tx) => {
    setCategorizingTx(tx);
    setCategorizeCoaId(tx.coa_account_id ? String(tx.coa_account_id) : '');
    setCategorizeNotes(tx.notes || '');
  };

  const saveCategorize = async () => {
    if (!categorizingTx || !categorizeCoaId) return;
    try {
      await window.api.bank.transactions.categorize(categorizingTx.id, parseInt(categorizeCoaId, 10), categorizeNotes);
      setCategorizingTx(null);
      loadTransactions();
      loadRecPreview();
    } catch (_) {}
  };

  const unmatch = async (txId) => {
    try {
      await window.api.bank.transactions.unmatch(txId);
      loadTransactions();
    } catch (_) {}
  };

  // ── Reconciliation ──────────────────────────────────────────────────────────
  const closeReconciliation = async (stmtId) => {
    if (!selectedAccount) return;
    try {
      const result = await window.api.bank.reconcile.close(selectedAccount.id, stmtId);
      if (result.success) { loadStatements(); loadRecPreview(); }
      else alert(result.message);
    } catch (_) {}
  };

  const reopenReconciliation = async () => {
    if (!showReopenModal || !reopenReason.trim()) return;
    try {
      await window.api.bank.reconcile.reopen(selectedAccount.id, showReopenModal.id, reopenReason.trim());
      setShowReopenModal(null);
      setReopenReason('');
      loadStatements();
      loadRecPreview();
    } catch (_) {}
  };

  const deleteLearnedRule = async (id) => {
    if (!window.confirm(T.deleteRule)) return;
    try {
      await window.api.bank.learned.delete(id);
      loadLearnedRules();
    } catch (_) {}
  };

  // ── E-transfer detection ──────────────────────────────────────────────────────
  const detectEtransfer = (description = '') => {
    const up = description.toUpperCase();
    if (!up.includes('INTERAC') && !up.includes('E-TFR') && !up.includes('ETFR')) return null;
    const patterns = [/VIREMENT INTERAC\s+(.+?)(?:\s+\d|$)/i, /INTERAC\s+(.+?)(?:\s+\d|$)/i, /E-TFR\s+(.+?)(?:\s+\d|$)/i];
    for (const p of patterns) { const m = description.match(p); if (m?.[1]) return m[1].trim(); }
    return '—';
  };

  const doEtransferCategorize = async () => {
    if (!etransferTx) return;
    const arAccount = coa.find(a => a.account_number === '1100' || (a.name_fr || '').toLowerCase().includes('clients'));
    const coaId = arAccount?.id;
    if (!coaId) { alert(lang === 'fr' ? 'Compte Comptes clients (1100) introuvable.' : 'Accounts Receivable (1100) account not found.'); return; }
    try {
      await window.api.bank.transactions.categorize(etransferTx.id, coaId, lang === 'fr' ? 'Virement Interac' : 'Interac E-Transfer');
      setEtransferTx(null);
      loadTransactions();
    } catch (e) { alert(e.message); }
  };

  // ── Status badge ─────────────────────────────────────────────────────────────
  const StatusBadge = ({ status }) => {
    const color = status === 'matched' ? '#22c55e' : status === 'suggested' ? '#f59e0b' : status === 'manual' ? '#a78bfa' : '#ef4444';
    const label = status === 'matched' ? T.badgeMatched : status === 'suggested' ? T.badgeSuggested : status === 'manual' ? T.badgeManual : T.badgeUnmatched;
    return <span style={{ background: color + '22', color, border: `1px solid ${color}44`, borderRadius: 4, padding: '1px 7px', fontSize: 11, fontWeight: 600 }}>{label}</span>;
  };

  // ── Account type label ────────────────────────────────────────────────────────
  const typeLabel = (t) => t === 'credit_card' ? T.typeCC : t === 'line_of_credit' ? T.typeLOC : T.typeBank;

  // ── Render ────────────────────────────────────────────────────────────────────
  const SUB_TABS = [
    { key: 'comptes',        label: T.tabComptes },
    { key: 'transactions',   label: T.tabTransactions },
    { key: 'rapprochements', label: T.tabRapprochements },
    { key: 'regles',         label: T.tabRegles },
  ];

  return (
    <div style={{ padding: '18px 20px', color: '#e2e8f0', fontFamily: 'inherit' }}>
      {/* Sub-tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid #1e293b', paddingBottom: 0 }}>
        {SUB_TABS.map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)} style={{
            background: 'none', border: 'none', borderBottom: subTab === t.key ? '2px solid #f97316' : '2px solid transparent',
            color: subTab === t.key ? '#f97316' : '#94a3b8', cursor: 'pointer', padding: '6px 14px', fontWeight: 600, fontSize: 13,
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── COMPTES ─────────────────────────────────────────────────────────── */}
      {subTab === 'comptes' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 15, color: '#f1f5f9' }}>🏦 {T.tabComptes}</h3>
            <button onClick={openNewAccount} style={btnStyle('#f97316')}>{T.addAccount}</button>
          </div>

          {accounts.length === 0 ? (
            <p style={{ color: '#64748b', textAlign: 'center', marginTop: 40 }}>{T.noAccounts}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {accounts.map(acc => (
                <div key={acc.id} style={{ background: '#0f1724', border: '1px solid #1e293b', borderRadius: 8, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#f1f5f9' }}>{acc.name}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                      {typeLabel(acc.account_type)} · {acc.account_number} {acc.coa_name_fr}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, color: '#94a3b8' }}>{fmt(acc.opening_balance)} {T.openingDate.replace(' *','').toLowerCase()}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { setSelectedAccount(acc); openImport(acc); }} style={btnStyle('#0ea5e9', 12)}>{T.importStatement}</button>
                    <button onClick={() => { setSelectedAccount(acc); setSubTab('transactions'); }} style={btnStyle('#64748b', 12)}>{T.viewTransactions}</button>
                    <button onClick={() => openEditAccount(acc)} style={btnSmall}>{T.editAccount}</button>
                    <button onClick={() => archiveAccount(acc.id)} style={btnSmallDanger}>{T.archiveAccount}</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TRANSACTIONS ─────────────────────────────────────────────────────── */}
      {subTab === 'transactions' && (
        <div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
              <select value={selectedAccount?.id || ''} onChange={e => {
                const acc = accounts.find(a => a.id === parseInt(e.target.value, 10));
                setSelectedAccount(acc || null);
              }} style={selectStyle}>
                <option value=''>{T.selectAccount}</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <select value={txFilter} onChange={e => setTxFilter(e.target.value)} style={selectStyle}>
                <option value='all'>{T.allStatuses}</option>
                <option value='unmatched'>{T.statusUnmatched}</option>
                <option value='suggested'>{T.statusSuggested}</option>
                <option value='matched'>{T.statusMatched}</option>
                <option value='manual'>{T.statusManual}</option>
              </select>
              <input type='date' value={txDateFrom} onChange={e => setTxDateFrom(e.target.value)} style={inputStyle} />
              <input type='date' value={txDateTo}   onChange={e => setTxDateTo(e.target.value)}   style={inputStyle} />
            </div>
          </div>

          {!selectedAccount ? (
            <p style={{ color: '#64748b', textAlign: 'center', marginTop: 40 }}>{T.selectAccountFirst}</p>
          ) : transactions.length === 0 ? (
            <p style={{ color: '#64748b', textAlign: 'center', marginTop: 40 }}>{T.noTransactions}</p>
          ) : (
            <div style={{ overflowX: 'auto', background: '#0f172a', borderRadius: 8, padding: '0 0 4px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #1e293b', color: '#64748b' }}>
                    <th style={{ ...th, whiteSpace: 'nowrap', width: 90 }}>{T.colDate}</th>
                    <th style={th}>{T.colDesc}</th>
                    <th style={{ ...th, textAlign: 'right', width: 100 }}>{T.colAmount}</th>
                    <th style={{ ...th, width: 160 }}>{T.colStatus}</th>
                    <th style={{ ...th, width: 90, textAlign: 'center' }}>{T.colActions}</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map(tx => {
                    const etSender = detectEtransfer(tx.description);
                    return (
                    <tr key={tx.id} style={{ borderBottom: '1px solid #0f172a' }}>
                      <td style={{ ...td, whiteSpace: 'nowrap', fontSize: 12 }}>{fmtDate(tx.transaction_date)}</td>
                      <td style={{ ...td, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 0 }} title={tx.description}>
                        {tx.description}
                        {etSender && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: '#a78bfa', background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.25)', borderRadius: 3, padding: '1px 5px' }}>{T.etransferBadge}</span>}
                      </td>
                      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap', color: tx.amount < 0 ? '#f87171' : '#86efac', fontWeight: 600 }}>{fmt(tx.amount)}</td>
                      <td style={td}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <StatusBadge status={tx.match_status} />
                          {tx.account_number && (
                            <span style={{ fontSize: 10, color: '#64748b' }}>{tx.account_number} {lang === 'en' && tx.coa_name_en ? tx.coa_name_en : tx.coa_name_fr}</span>
                          )}
                          {tx.match_status === 'suggested' && tx.match_reason && (
                            <span style={{ fontSize: 9, color: '#78716c', fontStyle: 'italic' }}>{tx.match_reason}</span>
                          )}
                        </div>
                      </td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
                          {etSender && tx.match_status !== 'matched' && (
                            <button onClick={() => setEtransferTx({ ...tx, etSender })} style={{ ...btnSmall, background: 'rgba(167,139,250,0.12)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.25)' }}>{T.etransferMatch}</button>
                          )}
                          {tx.match_status !== 'matched' && (
                            <button onClick={() => openCategorize(tx)} style={btnSmall}>{T.categorize}</button>
                          )}
                          {(tx.match_status === 'matched' || tx.match_status === 'manual' || tx.match_status === 'suggested') && (
                            <button onClick={() => unmatch(tx.id)} style={btnSmallDanger}>{T.unmatch}</button>
                          )}
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── RAPPROCHEMENTS ────────────────────────────────────────────────────── */}
      {subTab === 'rapprochements' && (
        <div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 15, color: '#f1f5f9', flex: 1 }}>✅ {T.tabRapprochements}</h3>
            <select value={selectedAccount?.id || ''} onChange={e => {
              const acc = accounts.find(a => a.id === parseInt(e.target.value, 10));
              setSelectedAccount(acc || null);
            }} style={selectStyle}>
              <option value=''>{T.selectAccount}</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>

          {!selectedAccount ? (
            <p style={{ color: '#64748b', textAlign: 'center', marginTop: 40 }}>{T.selectAccountRec}</p>
          ) : (
            <>
              {/* Preview card */}
              {recLoading ? (
                <p style={{ color: '#64748b' }}>{T.loading}</p>
              ) : recPreview && (
                <div style={{ background: '#0f1724', border: '1px solid #1e293b', borderRadius: 8, padding: '16px 20px', marginBottom: 20 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: '#f1f5f9' }}>{T.previewTitle(selectedAccount.name)}</div>
                  <div style={{ display: 'flex', gap: 24 }}>
                    <div><div style={kpiLabel}>{T.stmtBalance}</div><div style={kpiVal}>{fmt(recPreview.statementBalance)}</div></div>
                    <div><div style={kpiLabel}>{T.biqBalance}</div><div style={kpiVal}>{fmt(recPreview.biqBalance)}</div></div>
                    <div>
                      <div style={kpiLabel}>{T.ecart}</div>
                      <div style={{ ...kpiVal, color: Math.abs(recPreview.ecart) <= 0.02 ? '#22c55e' : '#f87171' }}>
                        {fmt(recPreview.ecart)}
                      </div>
                    </div>
                    {recPreview.unreconciledCount > 0 && (
                      <div style={{ marginLeft: 'auto', alignSelf: 'center', color: '#f59e0b', fontSize: 13 }}>
                        {T.unreconciledCount(recPreview.unreconciledCount)}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Statements list */}
              {statements.length === 0 ? (
                <p style={{ color: '#64748b', textAlign: 'center', marginTop: 20 }}>{T.noStatements}</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #1e293b', color: '#64748b' }}>
                      <th style={th}>{T.colPeriod}</th>
                      <th style={{ ...th, textAlign: 'right' }}>{T.colEndBal}</th>
                      <th style={th}>{T.colStatut}</th>
                      <th style={th}>{T.colActions}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statements.map(stmt => (
                      <tr key={stmt.id} style={{ borderBottom: '1px solid #0f172a' }}>
                        <td style={td}>{fmtDate(stmt.period_start)} → {fmtDate(stmt.period_end)}</td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{fmt(stmt.ending_balance)}</td>
                        <td style={td}>
                          {stmt.reconciled
                            ? <span style={{ color: '#22c55e', fontWeight: 600 }}>✓ {T.reconciled}</span>
                            : <span style={{ color: '#f59e0b' }}>{T.open}</span>}
                        </td>
                        <td style={td}>
                          {!stmt.reconciled && recPreview && Math.abs(recPreview.ecart) <= 0.02 && (
                            <button onClick={() => closeReconciliation(stmt.id)} style={btnStyle('#22c55e', 12)}>{T.closeRec}</button>
                          )}
                          {stmt.reconciled && (
                            <button onClick={() => { setShowReopenModal(stmt); setReopenReason(''); }} style={btnSmall}>{T.reopenRec}</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      )}

      {/* ── RÈGLES ─────────────────────────────────────────────────────────────── */}
      {subTab === 'regles' && (
        <div>
          <h3 style={{ margin: '0 0 14px', fontSize: 15, color: '#f1f5f9' }}>🧠 {T.tabRegles}</h3>
          {learnedRules.length === 0 ? (
            <p style={{ color: '#64748b', textAlign: 'center', marginTop: 40 }}>{T.noRules}</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#64748b' }}>
                  <th style={th}>{T.rulePattern}</th>
                  <th style={th}>{T.ruleAccount}</th>
                  <th style={{ ...th, textAlign: 'center' }}>{T.ruleCount}</th>
                  <th style={th}>{T.ruleLastUsed}</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {learnedRules.map(rule => (
                  <tr key={rule.id} style={{ borderBottom: '1px solid #0f172a' }}>
                    <td style={{ ...td, fontFamily: 'monospace', fontSize: 12 }}>{rule.description_pattern}</td>
                    <td style={td}>{rule.account_number} {rule.coa_name_fr}</td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <span style={{ color: rule.match_count >= 3 ? '#22c55e' : '#f59e0b', fontWeight: 700 }}>{rule.match_count}</span>
                      {rule.match_count >= 3 && <span style={{ color: '#22c55e', marginLeft: 4, fontSize: 11 }}>{T.autoLabel}</span>}
                    </td>
                    <td style={{ ...td, color: '#64748b', fontSize: 12 }}>{fmtDate(rule.last_used_at)}</td>
                    <td style={td}>
                      <button onClick={() => deleteLearnedRule(rule.id)} style={btnSmallDanger}>{T.ruleDelete}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── ACCOUNT MODAL ─────────────────────────────────────────────────────── */}
      {showAccountModal && (
        <ModalOverlay onClose={() => setShowAccountModal(false)}>
          <h3 style={{ margin: '0 0 16px', color: '#f1f5f9' }}>{editingAccount ? T.editAccount : T.addAccount}</h3>
          <label style={labelStyle}>{T.accountName}</label>
          <input style={inputFull} value={accountForm.name} onChange={e => setAccountForm(f => ({ ...f, name: e.target.value }))} />
          <label style={labelStyle}>{T.accountType}</label>
          <select style={inputFull} value={accountForm.account_type} onChange={e => setAccountForm(f => ({ ...f, account_type: e.target.value }))}>
            <option value='bank'>{T.typeBank}</option>
            <option value='credit_card'>{T.typeCC}</option>
            <option value='line_of_credit'>{T.typeLOC}</option>
          </select>
          <label style={labelStyle}>{T.coaAccount}</label>
          <select style={inputFull} value={accountForm.coa_account_id} onChange={e => setAccountForm(f => ({ ...f, coa_account_id: e.target.value }))}>
            <option value=''>—</option>
            {coaList.filter(a => ['asset','liability'].includes(a.type)).map(a => (
              <option key={a.id} value={a.id}>{a.account_number} — {a.name_fr}</option>
            ))}
          </select>
          <label style={labelStyle}>{T.openingBalance}</label>
          <input style={inputFull} type='number' step='0.01' value={accountForm.opening_balance} onChange={e => setAccountForm(f => ({ ...f, opening_balance: e.target.value }))} />
          <label style={labelStyle}>{T.openingDate}</label>
          <input style={inputFull} type='date' value={accountForm.opening_date} onChange={e => setAccountForm(f => ({ ...f, opening_date: e.target.value }))} />
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button onClick={saveAccount} style={btnStyle('#f97316')}>{T.save}</button>
            <button onClick={() => setShowAccountModal(false)} style={btnStyle('#374151')}>{T.cancel}</button>
          </div>
        </ModalOverlay>
      )}

      {/* ── IMPORT MODAL ─────────────────────────────────────────────────────── */}
      {showImportModal && (
        <ModalOverlay onClose={() => setShowImportModal(false)}>
          <h3 style={{ margin: '0 0 16px', color: '#f1f5f9' }}>{T.importTitle}</h3>
          <label style={labelStyle}>{T.fileLabel}</label>
          <input ref={fileInputRef} type='file' accept='.csv,.ofx,.qfx,.qbo' onChange={e => setImportFile(e.target.files?.[0] || null)}
            style={{ ...inputFull, padding: '6px 0', color: '#94a3b8', background: 'none', border: 'none' }} />
          <label style={labelStyle}>{T.periodStart} ({T.optional})</label>
          <input style={inputFull} type='date' value={importPeriodStart} onChange={e => setImportPeriodStart(e.target.value)} />
          <label style={labelStyle}>{T.periodEnd} ({T.optional})</label>
          <input style={inputFull} type='date' value={importPeriodEnd} onChange={e => setImportPeriodEnd(e.target.value)} />
          <label style={labelStyle}>{T.endingBalance} ({T.optional})</label>
          <input style={inputFull} type='number' step='0.01' placeholder={T.openingBalance2} value={importEndBal} onChange={e => setImportEndBal(e.target.value)} />
          {importMsg && (
            <div style={{ marginTop: 10, padding: '8px 12px', background: importMsg.includes('Erreur') || importMsg.includes('déjà') || importMsg.includes('error') || importMsg.includes('already') ? '#450a0a' : '#052e16', borderRadius: 6, fontSize: 13, color: importMsg.includes('Erreur') || importMsg.includes('déjà') || importMsg.includes('error') || importMsg.includes('already') ? '#fca5a5' : '#86efac' }}>
              {importMsg}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button onClick={handleImport} disabled={!importFile || importing} style={btnStyle('#f97316')}>{importing ? T.importing : T.importBtn}</button>
            <button onClick={() => setShowImportModal(false)} style={btnStyle('#374151')}>{T.cancel}</button>
          </div>
        </ModalOverlay>
      )}

      {/* ── CATEGORIZE MODAL ─────────────────────────────────────────────────── */}
      {categorizingTx && (
        <ModalOverlay onClose={() => setCategorizingTx(null)}>
          <h3 style={{ margin: '0 0 10px', color: '#f1f5f9' }}>{T.categorize}</h3>
          <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 14 }}>
            <strong style={{ color: '#f1f5f9' }}>{categorizingTx.description}</strong><br />
            {fmtDate(categorizingTx.transaction_date)} · <span style={{ color: categorizingTx.amount < 0 ? '#f87171' : '#86efac', fontWeight: 700 }}>{fmt(categorizingTx.amount)}</span>
          </div>
          {categorizingTx.coa_name_fr && (
            <div style={{ marginBottom: 10, fontSize: 12, color: '#f59e0b' }}>{T.suggestedCoa(categorizingTx.coa_name_fr)}</div>
          )}
          <label style={labelStyle}>{T.selectCoa}</label>
          <select style={inputFull} value={categorizeCoaId} onChange={e => setCategorizeCoaId(e.target.value)}>
            <option value=''>—</option>
            {coaList.map(a => <option key={a.id} value={a.id}>{a.account_number} — {a.name_fr}</option>)}
          </select>
          <label style={labelStyle}>{T.notes}</label>
          <input style={inputFull} value={categorizeNotes} onChange={e => setCategorizeNotes(e.target.value)} />
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={saveCategorize} disabled={!categorizeCoaId} style={btnStyle('#f97316')}>{T.saveCategorize}</button>
            <button onClick={() => setCategorizingTx(null)} style={btnStyle('#374151')}>{T.cancel}</button>
          </div>
        </ModalOverlay>
      )}

      {/* ── E-TRANSFER MATCH MODAL ──────────────────────────────────────────── */}
      {etransferTx && (
        <ModalOverlay onClose={() => setEtransferTx(null)}>
          <h3 style={{ margin: '0 0 10px', color: '#a78bfa' }}>{T.etransferBadge}</h3>
          <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 14 }}>
            <strong style={{ color: '#f1f5f9' }}>{etransferTx.description}</strong><br />
            {fmtDate(etransferTx.transaction_date)} · <span style={{ color: '#86efac', fontWeight: 700 }}>{fmt(etransferTx.amount)}</span>
          </div>
          <div style={{ marginBottom: 12, padding: '6px 10px', background: 'rgba(167,139,250,0.07)', border: '1px solid rgba(167,139,250,0.2)', borderRadius: 6 }}>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>{T.etransferSender}: </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#a78bfa' }}>{etransferTx.etSender}</span>
          </div>
          <div style={{ fontSize: 11, color: '#f59e0b', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 5, padding: '6px 10px', marginBottom: 14 }}>{T.etransferHint}</div>
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button onClick={doEtransferCategorize} style={btnStyle('#a78bfa')}>{T.etransferMatchBtn}</button>
            <button onClick={() => setEtransferTx(null)} style={btnStyle('#374151')}>{T.cancel}</button>
          </div>
        </ModalOverlay>
      )}

      {/* ── REOPEN MODAL ─────────────────────────────────────────────────────── */}
      {showReopenModal && (
        <ModalOverlay onClose={() => setShowReopenModal(null)}>
          <h3 style={{ margin: '0 0 14px', color: '#f1f5f9' }}>{T.reopenRec}</h3>
          <label style={labelStyle}>{T.reopenReason}</label>
          <input style={inputFull} value={reopenReason} onChange={e => setReopenReason(e.target.value)} />
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={reopenReconciliation} disabled={!reopenReason.trim()} style={btnStyle('#f97316')}>{T.confirm}</button>
            <button onClick={() => setShowReopenModal(null)} style={btnStyle('#374151')}>{T.cancel}</button>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

// ── ModalOverlay ──────────────────────────────────────────────────────────────
function ModalOverlay({ children, onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#0f1724', border: '1px solid #1e293b', borderRadius: 10, padding: '24px 28px', minWidth: 360, maxWidth: 520, width: '90vw', maxHeight: '85vh', overflowY: 'auto' }}>
        {children}
      </div>
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const btnStyle = (bg, fontSize = 13) => ({
  background: bg, color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px',
  cursor: 'pointer', fontWeight: 600, fontSize,
});
const btnSmall      = { background: '#1e293b', color: '#94a3b8', border: 'none', borderRadius: 5, padding: '4px 10px', cursor: 'pointer', fontSize: 12 };
const btnSmallDanger= { background: '#450a0a', color: '#fca5a5', border: 'none', borderRadius: 5, padding: '4px 10px', cursor: 'pointer', fontSize: 12 };
const selectStyle   = { background: '#0f1724', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 6, padding: '5px 10px', fontSize: 12 };
const inputStyle    = { background: '#0f1724', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 6, padding: '5px 10px', fontSize: 12 };
const inputFull     = { width: '100%', boxSizing: 'border-box', background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 6, padding: '7px 10px', fontSize: 13, marginBottom: 10 };
const labelStyle    = { display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4 };
const th            = { textAlign: 'left', padding: '8px 10px', fontWeight: 600, fontSize: 12, color: '#94a3b8' };
const td            = { padding: '7px 10px', verticalAlign: 'middle', color: '#e2e8f0' };
const kpiLabel      = { fontSize: 11, color: '#64748b', marginBottom: 2 };
const kpiVal        = { fontSize: 16, fontWeight: 700, color: '#f1f5f9' };
