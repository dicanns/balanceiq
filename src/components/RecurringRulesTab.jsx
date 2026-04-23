import { useState, useEffect, useCallback } from 'react';

const T = {
  fr: {
    title: 'Écritures récurrentes',
    subtitle: 'Loyer, assurances, abonnements — créés automatiquement selon l\'échéancier',
    newRule: 'Nouvelle règle',
    noRules: 'Aucune règle récurrente configurée.',
    noRulesHint: 'Créez une règle pour automatiser vos entrées périodiques.',
    pending: 'À approuver',
    noPending: 'Aucune écriture en attente d\'approbation.',
    history: 'Historique',
    rules: 'Règles',
    approve: 'Approuver',
    skip: 'Ignorer',
    approving: 'Approbation...',
    activate: 'Activer',
    deactivate: 'Désactiver',
    edit: 'Modifier',
    cancel: 'Annuler',
    save: 'Enregistrer',
    free3: 'Gratuit — 3 règles max. Passez à Pro pour un nombre illimité.',
    freeLimitReached: 'Limite de 3 règles atteinte. Passez à Pro.',
    upgradeBtn: 'Passer à Pro',
    ruleName: 'Nom de la règle',
    ruleType: 'Type',
    ruleTypeSupplierBill: 'Facture fournisseur',
    ruleTypeJournalEntry: 'Écriture comptable',
    ruleTypeBankTransfer: 'Virement bancaire',
    frequency: 'Fréquence',
    freqDaily: 'Quotidien',
    freqWeekly: 'Hebdomadaire',
    freqBiweekly: 'Bihebdomadaire',
    freqMonthly: 'Mensuel',
    freqQuarterly: 'Trimestriel',
    freqAnnual: 'Annuel',
    startDate: 'Date de début',
    endDate: 'Date de fin (optionnel)',
    dayOfMonth: 'Jour du mois (1-31)',
    autoApprove: 'Approbation automatique',
    autoApproveHint: 'Les écritures seront créées et approuvées sans confirmation.',
    supplierName: 'Fournisseur',
    amount: 'Montant',
    category: 'Catégorie',
    note: 'Note',
    tps: 'TPS',
    tvq: 'TVQ',
    coaAccount: 'Compte (COA)',
    debitAccount: 'Compte débité',
    creditAccount: 'Compte crédité',
    transferAmount: 'Montant',
    nextRun: 'Prochain déclenchement',
    lastRun: 'Dernier déclenchement',
    status: 'Statut',
    active: 'Actif',
    inactive: 'Inactif',
    type: 'Type',
    pending_status: 'En attente',
    approved_status: 'Approuvé',
    skipped_status: 'Ignoré',
    scheduledFor: 'Prévu pour',
    checkDue: 'Vérifier les échéances',
    checking: 'Vérification...',
    fired: (n) => `${n} règle(s) déclenchée(s).`,
    noFired: 'Aucune règle à déclencher aujourd\'hui.',
    deleteConfirm: 'Désactiver cette règle ?',
    freeLimit: 3,
  },
  en: {
    title: 'Recurring Transactions',
    subtitle: 'Rent, insurance, subscriptions — created automatically on schedule',
    newRule: 'New rule',
    noRules: 'No recurring rules configured.',
    noRulesHint: 'Create a rule to automate your periodic entries.',
    pending: 'Pending approval',
    noPending: 'No entries pending approval.',
    history: 'History',
    rules: 'Rules',
    approve: 'Approve',
    skip: 'Skip',
    approving: 'Approving...',
    activate: 'Activate',
    deactivate: 'Deactivate',
    edit: 'Edit',
    cancel: 'Cancel',
    save: 'Save',
    free3: 'Free — 3 rules max. Upgrade to Pro for unlimited.',
    freeLimitReached: '3-rule limit reached. Upgrade to Pro.',
    upgradeBtn: 'Upgrade to Pro',
    ruleName: 'Rule name',
    ruleType: 'Type',
    ruleTypeSupplierBill: 'Supplier bill',
    ruleTypeJournalEntry: 'Journal entry',
    ruleTypeBankTransfer: 'Bank transfer',
    frequency: 'Frequency',
    freqDaily: 'Daily',
    freqWeekly: 'Weekly',
    freqBiweekly: 'Biweekly',
    freqMonthly: 'Monthly',
    freqQuarterly: 'Quarterly',
    freqAnnual: 'Annual',
    startDate: 'Start date',
    endDate: 'End date (optional)',
    dayOfMonth: 'Day of month (1-31)',
    autoApprove: 'Auto-approve',
    autoApproveHint: 'Entries will be created and approved without confirmation.',
    supplierName: 'Supplier',
    amount: 'Amount',
    category: 'Category',
    note: 'Note',
    tps: 'GST',
    tvq: 'QST',
    coaAccount: 'Account (COA)',
    debitAccount: 'Debit account',
    creditAccount: 'Credit account',
    transferAmount: 'Amount',
    nextRun: 'Next run',
    lastRun: 'Last run',
    status: 'Status',
    active: 'Active',
    inactive: 'Inactive',
    type: 'Type',
    pending_status: 'Pending',
    approved_status: 'Approved',
    skipped_status: 'Skipped',
    scheduledFor: 'Scheduled for',
    checkDue: 'Check due now',
    checking: 'Checking...',
    fired: (n) => `${n} rule(s) triggered.`,
    noFired: 'No rules due today.',
    deleteConfirm: 'Deactivate this rule?',
    freeLimit: 3,
  },
};

const FREQ_OPTS = (t) => [
  { value: 'daily', label: t.freqDaily },
  { value: 'weekly', label: t.freqWeekly },
  { value: 'biweekly', label: t.freqBiweekly },
  { value: 'monthly', label: t.freqMonthly },
  { value: 'quarterly', label: t.freqQuarterly },
  { value: 'annual', label: t.freqAnnual },
];

const TYPE_OPTS = (t) => [
  { value: 'supplier_bill', label: t.ruleTypeSupplierBill },
  { value: 'journal_entry', label: t.ruleTypeJournalEntry },
  { value: 'bank_transfer', label: t.ruleTypeBankTransfer },
];

function computeNextRun(freq, startDate, dayOfMonth) {
  const today = new Date().toISOString().slice(0, 10);
  if (!startDate) return today;
  if (startDate >= today) return startDate;
  const d = new Date(startDate);
  while (d.toISOString().slice(0, 10) <= today) {
    switch (freq) {
      case 'daily': d.setDate(d.getDate() + 1); break;
      case 'weekly': d.setDate(d.getDate() + 7); break;
      case 'biweekly': d.setDate(d.getDate() + 14); break;
      case 'monthly': d.setMonth(d.getMonth() + 1); if (dayOfMonth) d.setDate(Math.min(dayOfMonth, new Date(d.getFullYear(), d.getMonth()+1, 0).getDate())); break;
      case 'quarterly': d.setMonth(d.getMonth() + 3); break;
      case 'annual': d.setFullYear(d.getFullYear() + 1); break;
      default: d.setMonth(d.getMonth() + 1);
    }
  }
  return d.toISOString().slice(0, 10);
}

const DARK = { background: '#0c0e14', card: '#131720', cardBorder: '#1e2433', text: '#e2e8f0', textSub: '#94a3b8', textMuted: '#64748b', inputBg: '#1a2035', inputBorder: '#2a3550', section: '#181e2e', accent: '#f97316', accentHover: '#ea580c', danger: '#ef4444', green: '#22c55e', yellow: '#eab308' };

const BLANK_RULE = {
  rule_type: 'supplier_bill',
  name: '',
  frequency: 'monthly',
  start_date: new Date().toISOString().slice(0, 10),
  end_date: '',
  day_of_month: 1,
  auto_approve: false,
  template: { supplier_name: '', amount: '', tps: '', tvq: '', category: '', note: '', debit_account_id: '', credit_account_id: '', description: '' },
};

export default function RecurringRulesTab({ lang = 'fr', canUsePro = false, onUpgrade }) {
  const t = T[lang] || T.fr;
  const s = DARK;
  const [subTab, setSubTab] = useState('rules');
  const [rules, setRules] = useState([]);
  const [pending, setPending] = useState([]);
  const [historyRule, setHistoryRule] = useState(null);
  const [historyRows, setHistoryRows] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(BLANK_RULE);
  const [approvingId, setApprovingId] = useState(null);
  const [checking, setChecking] = useState(false);
  const [msg, setMsg] = useState('');

  const flash = (m, dur = 3000) => { setMsg(m); setTimeout(() => setMsg(''), dur); };

  const load = useCallback(async () => {
    const r = await window.api.recurring.list({});
    setRules(Array.isArray(r) ? r : []);
    const p = await window.api.recurring.pending();
    setPending(Array.isArray(p) ? p : []);
  }, []);

  useEffect(() => { load(); window.api.recurring.checkDue(); }, [load]);

  const handleSave = async () => {
    const next = computeNextRun(form.frequency, form.start_date, form.day_of_month);
    const data = { ...form, next_run_at: next };
    if (editingId) {
      await window.api.recurring.update(editingId, data);
    } else {
      await window.api.recurring.create(data);
    }
    setShowForm(false);
    setEditingId(null);
    setForm(BLANK_RULE);
    load();
  };

  const handleDeactivate = async (id) => {
    if (!window.confirm(t.deleteConfirm)) return;
    await window.api.recurring.deactivate(id);
    load();
  };

  const handleReactivate = async (id) => {
    await window.api.recurring.update(id, { is_active: 1 });
    load();
  };

  const handleApprove = async (genId) => {
    setApprovingId(genId);
    await window.api.recurring.approve(genId);
    setApprovingId(null);
    load();
    flash(lang === 'fr' ? 'Écriture approuvée.' : 'Entry approved.');
  };

  const handleSkip = async (genId) => {
    await window.api.recurring.skip(genId);
    load();
  };

  const handleCheckDue = async () => {
    setChecking(true);
    const fired = await window.api.recurring.checkDue();
    setChecking(false);
    if (Array.isArray(fired) && fired.length > 0) { flash(t.fired(fired.length)); load(); }
    else flash(t.noFired);
  };

  const handleShowHistory = async (rule) => {
    setHistoryRule(rule);
    const rows = await window.api.recurring.history(rule.id);
    setHistoryRows(Array.isArray(rows) ? rows : []);
    setSubTab('history');
  };

  const startEdit = (rule) => {
    setEditingId(rule.id);
    setForm({
      rule_type: rule.rule_type,
      name: rule.name,
      frequency: rule.frequency,
      start_date: rule.start_date,
      end_date: rule.end_date || '',
      day_of_month: rule.day_of_month || 1,
      auto_approve: !!rule.auto_approve,
      template: rule.template || {},
    });
    setShowForm(true);
  };

  const freeLimitReached = !canUsePro && rules.filter(r => r.is_active).length >= t.freeLimit;

  const inp = (label, key, type = 'text', placeholder = '') => (
    <div style={{ marginBottom: 10 }}>
      <label style={{ fontSize: 11, color: s.textMuted, display: 'block', marginBottom: 3 }}>{label}</label>
      <input
        type={type}
        value={form[key] ?? ''}
        onChange={e => setForm(f => ({ ...f, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))}
        placeholder={placeholder}
        style={{ width: '100%', boxSizing: 'border-box', background: s.inputBg, border: `1px solid ${s.inputBorder}`, borderRadius: 5, color: s.text, fontSize: 12, padding: '6px 9px', outline: 'none' }}
      />
    </div>
  );

  const tplInp = (label, key, type = 'text', placeholder = '') => (
    <div style={{ marginBottom: 10 }}>
      <label style={{ fontSize: 11, color: s.textMuted, display: 'block', marginBottom: 3 }}>{label}</label>
      <input
        type={type}
        value={form.template?.[key] ?? ''}
        onChange={e => setForm(f => ({ ...f, template: { ...f.template, [key]: e.target.value } }))}
        placeholder={placeholder}
        style={{ width: '100%', boxSizing: 'border-box', background: s.inputBg, border: `1px solid ${s.inputBorder}`, borderRadius: 5, color: s.text, fontSize: 12, padding: '6px 9px', outline: 'none' }}
      />
    </div>
  );

  const freqLabel = (freq) => FREQ_OPTS(t).find(f => f.value === freq)?.label || freq;
  const typeLabel = (type) => TYPE_OPTS(t).find(tp => tp.value === type)?.label || type;
  const statusColor = (status) => status === 'approved' ? s.green : status === 'skipped' ? s.textMuted : s.yellow;
  const statusLabel = (status) => t[status + '_status'] || status;

  return (
    <div style={{ fontFamily: "'Satoshi',-apple-system,BlinkMacSystemFont,sans-serif", color: s.text, background: s.background, minHeight: '100vh', padding: '16px 0' }}>
      {/* Header */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: s.text, marginBottom: 2 }}>🔄 {t.title}</div>
        <div style={{ fontSize: 11.5, color: s.textMuted }}>{t.subtitle}</div>
        {msg && <div style={{ marginTop: 8, padding: '6px 12px', borderRadius: 6, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', color: s.green, fontSize: 12 }}>{msg}</div>}
        {!canUsePro && <div style={{ marginTop: 8, fontSize: 11, color: s.accent }}>{t.free3}</div>}
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${s.cardBorder}`, marginBottom: 14 }}>
        {[['rules', `${t.rules} (${rules.length})`], ['pending', `${t.pending} (${pending.length})`], ['history', t.history]].map(([id, label]) => (
          <button key={id} onClick={() => setSubTab(id)} style={{ background: 'none', border: 'none', color: subTab === id ? s.accent : s.textMuted, fontSize: 11, fontWeight: subTab === id ? 700 : 500, padding: '5px 12px', cursor: 'pointer', borderBottom: subTab === id ? `2px solid ${s.accent}` : '2px solid transparent' }}>{label}</button>
        ))}
      </div>

      {/* Rules tab */}
      {subTab === 'rules' && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
            <button
              onClick={() => { if (freeLimitReached) { onUpgrade?.(); return; } setShowForm(true); setEditingId(null); setForm(BLANK_RULE); }}
              style={{ padding: '7px 14px', borderRadius: 6, border: 'none', background: `linear-gradient(135deg,${s.accent},${s.accentHover})`, color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', opacity: freeLimitReached ? 0.5 : 1 }}
            >
              + {t.newRule}
              {freeLimitReached && <span style={{ fontSize: 9, fontWeight: 700, color: '#fff', background: 'rgba(0,0,0,0.2)', padding: '1px 5px', borderRadius: 5, marginLeft: 5 }}>Pro</span>}
            </button>
            <button onClick={handleCheckDue} disabled={checking} style={{ padding: '7px 12px', borderRadius: 6, border: `1px solid ${s.cardBorder}`, background: s.section, color: s.textSub, fontSize: 12, cursor: 'pointer' }}>
              {checking ? t.checking : `⏱ ${t.checkDue}`}
            </button>
          </div>

          {rules.length === 0 ? (
            <div style={{ background: s.card, border: `1px solid ${s.cardBorder}`, borderRadius: 9, padding: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: s.textMuted, marginBottom: 4 }}>{t.noRules}</div>
              <div style={{ fontSize: 11.5, color: s.textMuted }}>{t.noRulesHint}</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {rules.map(rule => (
                <div key={rule.id} style={{ background: s.card, border: `1px solid ${s.cardBorder}`, borderRadius: 9, padding: 12, opacity: rule.is_active ? 1 : 0.55 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: s.text, marginBottom: 3 }}>
                        {rule.is_active
                          ? <span style={{ fontSize: 11, color: s.green, marginRight: 6 }}>●</span>
                          : <span style={{ fontSize: 11, color: s.textMuted, marginRight: 6 }}>●</span>}
                        {rule.name}
                      </div>
                      <div style={{ display: 'flex', gap: 10, fontSize: 11, color: s.textMuted, flexWrap: 'wrap' }}>
                        <span>📋 {typeLabel(rule.rule_type)}</span>
                        <span>🔁 {freqLabel(rule.frequency)}</span>
                        <span>📅 {lang === 'fr' ? 'Prochain' : 'Next'}: {rule.next_run_at}</span>
                        {rule.auto_approve && <span style={{ color: s.yellow }}>⚡ {t.autoApprove}</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button onClick={() => startEdit(rule)} style={{ padding: '4px 10px', borderRadius: 5, border: `1px solid ${s.inputBorder}`, background: s.section, color: s.textSub, fontSize: 11, cursor: 'pointer' }}>{t.edit}</button>
                      <button onClick={() => handleShowHistory(rule)} style={{ padding: '4px 10px', borderRadius: 5, border: `1px solid ${s.inputBorder}`, background: s.section, color: s.textSub, fontSize: 11, cursor: 'pointer' }}>📋</button>
                      {rule.is_active
                        ? <button onClick={() => handleDeactivate(rule.id)} style={{ padding: '4px 10px', borderRadius: 5, border: 'none', background: 'rgba(239,68,68,0.07)', color: s.danger, fontSize: 11, cursor: 'pointer' }}>{t.deactivate}</button>
                        : <button onClick={() => handleReactivate(rule.id)} style={{ padding: '4px 10px', borderRadius: 5, border: 'none', background: 'rgba(34,197,94,0.07)', color: s.green, fontSize: 11, cursor: 'pointer' }}>{t.activate}</button>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Pending tab */}
      {subTab === 'pending' && (
        <>
          {pending.length === 0 ? (
            <div style={{ background: s.card, border: `1px solid ${s.cardBorder}`, borderRadius: 9, padding: 24, textAlign: 'center', color: s.textMuted, fontSize: 12 }}>{t.noPending}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pending.map(gen => (
                <div key={gen.id} style={{ background: s.card, border: `1px solid ${s.cardBorder}`, borderRadius: 9, padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: s.text }}>{gen.rule_name}</div>
                      <div style={{ fontSize: 11, color: s.textMuted, marginTop: 2 }}>
                        📋 {typeLabel(gen.rule_type)} · 📅 {t.scheduledFor}: {gen.scheduled_for}
                      </div>
                      {gen.template && (
                        <div style={{ fontSize: 11, color: s.textSub, marginTop: 3 }}>
                          {gen.template.supplier_name && <span>Fournisseur: <strong>{gen.template.supplier_name}</strong> · </span>}
                          {gen.template.amount && <span style={{ fontVariantNumeric: 'tabular-nums' }}>{parseFloat(gen.template.amount).toFixed(2)} $</span>}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button onClick={() => handleApprove(gen.id)} disabled={approvingId === gen.id} style={{ padding: '5px 14px', borderRadius: 6, border: 'none', background: 'rgba(34,197,94,0.12)', color: s.green, fontWeight: 700, fontSize: 12, cursor: 'pointer', border: '1px solid rgba(34,197,94,0.25)' }}>
                        {approvingId === gen.id ? t.approving : `✓ ${t.approve}`}
                      </button>
                      <button onClick={() => handleSkip(gen.id)} style={{ padding: '5px 12px', borderRadius: 6, border: `1px solid ${s.inputBorder}`, background: s.section, color: s.textMuted, fontSize: 12, cursor: 'pointer' }}>{t.skip}</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* History tab */}
      {subTab === 'history' && (
        <>
          {historyRule ? (
            <>
              <div style={{ marginBottom: 10, fontSize: 12.5, fontWeight: 700, color: s.text }}>📋 {historyRule.name}</div>
              {historyRows.length === 0 ? (
                <div style={{ color: s.textMuted, fontSize: 12 }}>{lang === 'fr' ? 'Aucun historique.' : 'No history.'}</div>
              ) : (
                <div style={{ background: s.card, border: `1px solid ${s.cardBorder}`, borderRadius: 9, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${s.cardBorder}`, background: s.section }}>
                        {[t.scheduledFor, t.status, lang === 'fr' ? 'Créé le' : 'Created', lang === 'fr' ? 'Approuvé le' : 'Approved'].map((h, i) => (
                          <th key={i} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, color: s.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {historyRows.map(row => (
                        <tr key={row.id} style={{ borderBottom: `1px solid ${s.cardBorder}` }}>
                          <td style={{ padding: '7px 12px', color: s.text }}>{row.scheduled_for}</td>
                          <td style={{ padding: '7px 12px' }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: statusColor(row.status), background: `${statusColor(row.status)}18`, padding: '2px 8px', borderRadius: 10 }}>{statusLabel(row.status)}</span>
                          </td>
                          <td style={{ padding: '7px 12px', color: s.textMuted }}>{row.created_at?.slice(0, 10)}</td>
                          <td style={{ padding: '7px 12px', color: s.textMuted }}>{row.approved_at?.slice(0, 10) || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <div style={{ color: s.textMuted, fontSize: 12 }}>{lang === 'fr' ? 'Cliquez sur 📋 d\'une règle pour voir son historique.' : 'Click 📋 on a rule to see its history.'}</div>
          )}
        </>
      )}

      {/* Rule form modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9000, padding: 20 }}>
          <div style={{ background: s.card, border: `1px solid ${s.cardBorder}`, borderRadius: 12, padding: 22, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: s.text, marginBottom: 16 }}>
              🔄 {editingId ? (lang === 'fr' ? 'Modifier la règle' : 'Edit rule') : t.newRule}
            </div>

            {inp(t.ruleName, 'name', 'text', lang === 'fr' ? 'Ex: Loyer mensuel' : 'Ex: Monthly rent')}

            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: s.textMuted, display: 'block', marginBottom: 3 }}>{t.ruleType}</label>
              <select value={form.rule_type} onChange={e => setForm(f => ({ ...f, rule_type: e.target.value }))} style={{ width: '100%', background: s.inputBg, border: `1px solid ${s.inputBorder}`, borderRadius: 5, color: s.text, fontSize: 12, padding: '6px 9px', outline: 'none' }}>
                {TYPE_OPTS(t).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: s.textMuted, display: 'block', marginBottom: 3 }}>{t.frequency}</label>
              <select value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))} style={{ width: '100%', background: s.inputBg, border: `1px solid ${s.inputBorder}`, borderRadius: 5, color: s.text, fontSize: 12, padding: '6px 9px', outline: 'none' }}>
                {FREQ_OPTS(t).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {form.frequency === 'monthly' && inp(t.dayOfMonth, 'day_of_month', 'number', '1')}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: s.textMuted, display: 'block', marginBottom: 3 }}>{t.startDate}</label>
                <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box', background: s.inputBg, border: `1px solid ${s.inputBorder}`, borderRadius: 5, color: s.text, fontSize: 12, padding: '6px 9px', outline: 'none' }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: s.textMuted, display: 'block', marginBottom: 3 }}>{t.endDate}</label>
                <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box', background: s.inputBg, border: `1px solid ${s.inputBorder}`, borderRadius: 5, color: s.text, fontSize: 12, padding: '6px 9px', outline: 'none' }} />
              </div>
            </div>

            <div style={{ borderTop: `1px solid ${s.cardBorder}`, paddingTop: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: s.textSub, marginBottom: 8 }}>
                {form.rule_type === 'supplier_bill' ? `📋 ${t.ruleTypeSupplierBill}` : form.rule_type === 'journal_entry' ? `📒 ${t.ruleTypeJournalEntry}` : `🏦 ${t.ruleTypeBankTransfer}`}
              </div>

              {form.rule_type === 'supplier_bill' && (
                <>
                  {tplInp(t.supplierName, 'supplier_name', 'text', 'Propriétaire SA')}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    <div>
                      <label style={{ fontSize: 11, color: s.textMuted, display: 'block', marginBottom: 3 }}>{t.amount} $</label>
                      <input type="number" step="0.01" value={form.template?.amount ?? ''} onChange={e => setForm(f => ({ ...f, template: { ...f.template, amount: e.target.value } }))} style={{ width: '100%', boxSizing: 'border-box', background: s.inputBg, border: `1px solid ${s.inputBorder}`, borderRadius: 5, color: s.text, fontSize: 12, padding: '6px 9px', outline: 'none' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: s.textMuted, display: 'block', marginBottom: 3 }}>{t.tps} $</label>
                      <input type="number" step="0.01" value={form.template?.tps ?? ''} onChange={e => setForm(f => ({ ...f, template: { ...f.template, tps: e.target.value } }))} style={{ width: '100%', boxSizing: 'border-box', background: s.inputBg, border: `1px solid ${s.inputBorder}`, borderRadius: 5, color: s.text, fontSize: 12, padding: '6px 9px', outline: 'none' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: s.textMuted, display: 'block', marginBottom: 3 }}>{t.tvq} $</label>
                      <input type="number" step="0.01" value={form.template?.tvq ?? ''} onChange={e => setForm(f => ({ ...f, template: { ...f.template, tvq: e.target.value } }))} style={{ width: '100%', boxSizing: 'border-box', background: s.inputBg, border: `1px solid ${s.inputBorder}`, borderRadius: 5, color: s.text, fontSize: 12, padding: '6px 9px', outline: 'none' }} />
                    </div>
                  </div>
                  {tplInp(t.note, 'note', 'text', lang === 'fr' ? 'Note optionnelle' : 'Optional note')}
                </>
              )}

              {form.rule_type === 'journal_entry' && (
                <>
                  {tplInp(lang === 'fr' ? 'Description' : 'Description', 'description', 'text', lang === 'fr' ? 'Ex: Amortissement mensuel' : 'Ex: Monthly amortization')}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <label style={{ fontSize: 11, color: s.textMuted, display: 'block', marginBottom: 3 }}>{t.debitAccount} (COA ID)</label>
                      <input type="number" value={form.template?.debit_account_id ?? ''} onChange={e => setForm(f => ({ ...f, template: { ...f.template, debit_account_id: e.target.value } }))} style={{ width: '100%', boxSizing: 'border-box', background: s.inputBg, border: `1px solid ${s.inputBorder}`, borderRadius: 5, color: s.text, fontSize: 12, padding: '6px 9px', outline: 'none' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: s.textMuted, display: 'block', marginBottom: 3 }}>{t.creditAccount} (COA ID)</label>
                      <input type="number" value={form.template?.credit_account_id ?? ''} onChange={e => setForm(f => ({ ...f, template: { ...f.template, credit_account_id: e.target.value } }))} style={{ width: '100%', boxSizing: 'border-box', background: s.inputBg, border: `1px solid ${s.inputBorder}`, borderRadius: 5, color: s.text, fontSize: 12, padding: '6px 9px', outline: 'none' }} />
                    </div>
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ fontSize: 11, color: s.textMuted, display: 'block', marginBottom: 3 }}>{t.amount} $</label>
                    <input type="number" step="0.01" value={form.template?.amount ?? ''} onChange={e => setForm(f => ({ ...f, template: { ...f.template, amount: e.target.value } }))} style={{ width: '100%', boxSizing: 'border-box', background: s.inputBg, border: `1px solid ${s.inputBorder}`, borderRadius: 5, color: s.text, fontSize: 12, padding: '6px 9px', outline: 'none' }} />
                  </div>
                </>
              )}

              {form.rule_type === 'bank_transfer' && (
                <>
                  {tplInp(lang === 'fr' ? 'De (compte source)' : 'From (source account)', 'from_account', 'text')}
                  {tplInp(lang === 'fr' ? 'Vers (compte destination)' : 'To (destination account)', 'to_account', 'text')}
                  <div>
                    <label style={{ fontSize: 11, color: s.textMuted, display: 'block', marginBottom: 3 }}>{t.transferAmount} $</label>
                    <input type="number" step="0.01" value={form.template?.amount ?? ''} onChange={e => setForm(f => ({ ...f, template: { ...f.template, amount: e.target.value } }))} style={{ width: '100%', boxSizing: 'border-box', background: s.inputBg, border: `1px solid ${s.inputBorder}`, borderRadius: 5, color: s.text, fontSize: 12, padding: '6px 9px', outline: 'none' }} />
                  </div>
                </>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <input type="checkbox" id="autoApprove" checked={!!form.auto_approve} onChange={e => setForm(f => ({ ...f, auto_approve: e.target.checked }))} style={{ accentColor: s.accent }} />
              <label htmlFor="autoApprove" style={{ fontSize: 12, color: s.text, cursor: 'pointer' }}>
                ⚡ {t.autoApprove}
              </label>
              <span style={{ fontSize: 10.5, color: s.textMuted }}>— {t.autoApproveHint}</span>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleSave} disabled={!form.name.trim()} style={{ flex: 1, padding: '8px', borderRadius: 6, border: 'none', background: `linear-gradient(135deg,${s.accent},${s.accentHover})`, color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', opacity: !form.name.trim() ? 0.5 : 1 }}>{t.save}</button>
              <button onClick={() => { setShowForm(false); setEditingId(null); setForm(BLANK_RULE); }} style={{ flex: 1, padding: '8px', borderRadius: 6, border: `1px solid ${s.cardBorder}`, background: s.section, color: s.textSub, fontSize: 12, cursor: 'pointer' }}>{t.cancel}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
