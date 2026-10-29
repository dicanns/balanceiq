import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { CHEQUE_ISSUED, CHEQUE_RECEIVED } from '../utils/chequeNumber.mjs';
import { buildChequesHtml, DEFAULT_PRINT_SETTINGS, CHEQUE_POSITIONS, DATE_FORMATS } from '../utils/chequePrint.mjs';

const PRINT_KEY = 'dicann-cheque-print';

// Cheque register (Banking > Cheques) and the dialog that links a statement line
// to the cheque(s) that cleared on it. The accounting lives in database.js
// (chequeRecord / chequeLink); this file only collects and shows.

const UI = {
  fr: {
    title: 'Chèques',
    intro: 'Les chèques émis sont comptabilisés le jour où vous les écrivez et restent « en circulation » jusqu\'à ce qu\'ils passent à la banque. Quand la ligne du relevé arrive, elle est liée au chèque (automatiquement si le relevé montre son numéro) et ne compte pas une deuxième fois. Les paiements de factures enregistrés avec le mode Chèque apparaissent ici d\'eux-mêmes.',
    writeBtn: 'Écrire un chèque',
    receiveBtn: 'Enregistrer un chèque reçu',
    outstandingWritten: (n, a) => `${n} chèque${n > 1 ? 's' : ''} émis en circulation : ${a}`,
    outstandingReceived: (n, a) => `${n} chèque${n > 1 ? 's' : ''} reçu${n > 1 ? 's' : ''} non déposé${n > 1 ? 's' : ''} : ${a}`,
    noneOutstanding: 'Aucun chèque en circulation.',
    filterAll: 'Tous', filterWritten: 'Émis', filterReceived: 'Reçus',
    filterOutstanding: 'En circulation', filterCleared: 'Passés', filterVoid: 'Annulés',
    colDate: 'Date', colNumber: 'No', colDirection: 'Type', colParty: 'À l\'ordre de / De', colFor: 'Pour', colAmount: 'Montant', colStatus: 'Statut',
    written: 'Émis', received: 'Reçu',
    statusOutstanding: 'En circulation', statusCleared: (d) => `Passé le ${d}`, statusVoid: 'Annulé',
    forBills: (n) => `${n} facture${n > 1 ? 's' : ''} fournisseur`, forInvoices: (r) => `Factures ${r}`,
    voidBtn: 'Annuler', voidConfirm: 'Annuler ce chèque ? Son écriture est contrepassée et les factures qu\'il payait redeviennent dues.',
    voidReasonLabel: 'Raison (optionnelle)',
    none: 'Aucun chèque pour l\'instant.',
    formWriteTitle: 'Écrire un chèque', formReceiveTitle: 'Enregistrer un chèque reçu',
    bankAccount: 'Compte bancaire', number: 'Numéro du chèque', date: 'Date du chèque',
    payee: 'À l\'ordre de', payer: 'Reçu de', amount: 'Montant',
    kindAccount: 'Une dépense ou un autre compte', kindBills: 'Des factures fournisseur',
    kindInvoice: 'Paiement de factures clients (déjà enregistré dans Facturation)', kindOther: 'Autre revenu ou remboursement',
    account: 'Compte', chooseAccount: '- Choisir -',
    tps: 'TPS', tvq: 'TVQ', calc: 'Calculer', taxHint: 'Les taxes inscrites sur la facture payée par ce chèque.',
    bills: 'Factures payées par ce chèque', noBills: 'Aucune facture fournisseur impayée.', billsTotal: (a) => `Total du chèque : ${a}`,
    invoiceRefs: 'Numéros de facture (optionnel)', memo: 'Note (optionnelle)',
    save: 'Enregistrer', cancel: 'Annuler',
    savedMatched: 'Enregistré, et lié à la ligne du relevé où il est déjà passé.',
    linkTitle: 'Quel chèque est passé sur cette ligne ?',
    linkHintIssued: 'Choisissez le chèque émis. La ligne est liée et ne compte pas une deuxième fois.',
    linkHintReceived: 'Un dépôt peut contenir plusieurs chèques : cochez tous ceux qui le composent.',
    linkNumberSeen: (n) => `Numéro lu sur le relevé : ${n}`,
    linkNone: 'Aucun chèque en circulation ne correspond. Enregistrez-le d\'abord dans Banque > Chèques.',
    linkSelected: (s, a) => `Sélectionné ${s} sur ${a}`,
    linkBtn: 'Lier', sameNumber: 'même numéro', sameAmount: 'même montant',
    errors: {
      duplicate_number: 'Ce numéro de chèque existe déjà pour ce compte.',
      amount_mismatch: 'Les montants ne concordent pas.',
      no_account: 'Choisissez le compte.', no_bank_account: 'Choisissez le compte bancaire.',
      invalid_amount: 'Entrez un montant.', invalid_date: 'Entrez la date.', no_bills: 'Cochez au moins une facture.',
      bill_already_paid: 'Une de ces factures est déjà payée.', cheque_cleared: 'Ce chèque est déjà passé à la banque : déliez d\'abord la ligne du relevé.',
      wrong_direction: 'Un chèque émis sort du compte et un chèque reçu y entre.', wrong_account: 'Ce chèque est sur un autre compte.',
      already_matched: 'Cette ligne est déjà liée à autre chose. Déliez-la d\'abord.',
      ERR_PERIOD_CLOSED_POST: 'Cette période comptable est fermée. Choisissez une date dans une période ouverte.',
    },
    errorGeneric: (c) => `Refusé : ${c}`,
    printBtn: 'Imprimer', saveAndPrint: 'Enregistrer et imprimer', printSettingsBtn: 'Réglages d\'impression',
    printSettingsTitle: (n) => `Impression des chèques : ${n}`,
    printIntro: 'Pour les chèques laser préimprimés (format lettre, chèque et deux talons). Choisissez où se trouve le chèque sur la feuille et le format de date imprimé sur votre papier. Imprimez la page test sur du papier ordinaire, superposez-la à un chèque à la lumière, puis ajustez au millimètre.',
    position: 'Position du chèque', posTop: 'En haut', posMiddle: 'Au milieu', posBottom: 'En bas',
    dateFormat: 'Format de la date (selon le guide sur le chèque)', offsetX: 'Décalage horizontal (mm, + vers la droite)', offsetY: 'Décalage vertical (mm, + vers le bas)',
    wordsLang: 'Montant en lettres', langFr: 'Français', langEn: 'Anglais',
    printTest: 'Imprimer une page test', saveSettings: 'Enregistrer les réglages', settingsSaved: 'Réglages enregistrés.',
    printHint: 'À l\'impression, choisissez le papier Lettre, échelle 100 %, sans « ajuster à la page ».',
    stub: { cheque: 'Chèque', payee: 'À l\'ordre de', amount: 'Montant', for: 'Pour', memo: 'Note' },
    testPayee: 'PAGE TEST - NE PAS ENCAISSER',
  },
  en: {
    title: 'Cheques',
    intro: 'Cheques you write are booked the day you write them and stay "outstanding" until they go through the bank. When the statement line arrives, it is linked to the cheque (automatically when the statement shows its number) and does not count a second time. Invoice payments recorded with the method Cheque appear here on their own.',
    writeBtn: 'Write a cheque',
    receiveBtn: 'Record a cheque received',
    outstandingWritten: (n, a) => `${n} cheque${n > 1 ? 's' : ''} written, outstanding: ${a}`,
    outstandingReceived: (n, a) => `${n} cheque${n > 1 ? 's' : ''} received, not yet deposited: ${a}`,
    noneOutstanding: 'No outstanding cheques.',
    filterAll: 'All', filterWritten: 'Written', filterReceived: 'Received',
    filterOutstanding: 'Outstanding', filterCleared: 'Cleared', filterVoid: 'Void',
    colDate: 'Date', colNumber: 'No.', colDirection: 'Type', colParty: 'Payee / From', colFor: 'For', colAmount: 'Amount', colStatus: 'Status',
    written: 'Written', received: 'Received',
    statusOutstanding: 'Outstanding', statusCleared: (d) => `Cleared ${d}`, statusVoid: 'Void',
    forBills: (n) => `${n} supplier bill${n > 1 ? 's' : ''}`, forInvoices: (r) => `Invoices ${r}`,
    voidBtn: 'Void', voidConfirm: 'Void this cheque? Its entry is reversed and any bills it paid are owed again.',
    voidReasonLabel: 'Reason (optional)',
    none: 'No cheques yet.',
    formWriteTitle: 'Write a cheque', formReceiveTitle: 'Record a cheque received',
    bankAccount: 'Bank account', number: 'Cheque number', date: 'Cheque date',
    payee: 'Pay to', payer: 'Received from', amount: 'Amount',
    kindAccount: 'An expense or other account', kindBills: 'Supplier bills',
    kindInvoice: 'Payment of customer invoices (already recorded in Invoicing)', kindOther: 'Other income or a refund',
    account: 'Account', chooseAccount: '- Choose -',
    tps: 'GST', tvq: 'QST', calc: 'Calculate', taxHint: 'The tax shown on the bill this cheque pays.',
    bills: 'Bills this cheque pays', noBills: 'No unpaid supplier bills.', billsTotal: (a) => `Cheque total: ${a}`,
    invoiceRefs: 'Invoice numbers (optional)', memo: 'Note (optional)',
    save: 'Save', cancel: 'Cancel',
    savedMatched: 'Saved, and linked to the statement line where it already cleared.',
    linkTitle: 'Which cheque cleared on this line?',
    linkHintIssued: 'Pick the cheque you wrote. The line is linked and does not count a second time.',
    linkHintReceived: 'One deposit can hold several cheques: tick every one in it.',
    linkNumberSeen: (n) => `Number on the statement: ${n}`,
    linkNone: 'No outstanding cheque matches. Record it first in Banking > Cheques.',
    linkSelected: (s, a) => `Selected ${s} of ${a}`,
    linkBtn: 'Link', sameNumber: 'same number', sameAmount: 'same amount',
    errors: {
      duplicate_number: 'That cheque number already exists for this account.',
      amount_mismatch: 'The amounts do not add up.',
      no_account: 'Choose the account.', no_bank_account: 'Choose the bank account.',
      invalid_amount: 'Enter an amount.', invalid_date: 'Enter the date.', no_bills: 'Tick at least one bill.',
      bill_already_paid: 'One of those bills is already paid.', cheque_cleared: 'This cheque already went through the bank: unlink its statement line first.',
      wrong_direction: 'A cheque written leaves the account and a cheque received comes in.', wrong_account: 'That cheque is on another account.',
      already_matched: 'This line is already linked to something else. Unlink it first.',
      ERR_PERIOD_CLOSED_POST: 'That accounting period is closed. Pick a date in an open period.',
    },
    errorGeneric: (c) => `Refused: ${c}`,
    printBtn: 'Print', saveAndPrint: 'Save and print', printSettingsBtn: 'Print settings',
    printSettingsTitle: (n) => `Cheque printing: ${n}`,
    printIntro: 'For pre-printed laser cheques (letter size, one cheque and two stubs). Choose where the cheque sits on the sheet and the date format printed on your stock. Print the test page on plain paper, hold it against a cheque to the light, then nudge it to the millimetre.',
    position: 'Cheque position', posTop: 'Top', posMiddle: 'Middle', posBottom: 'Bottom',
    dateFormat: 'Date format (as the guide on the cheque shows)', offsetX: 'Horizontal nudge (mm, + moves right)', offsetY: 'Vertical nudge (mm, + moves down)',
    wordsLang: 'Amount in words', langFr: 'French', langEn: 'English',
    printTest: 'Print a test page', saveSettings: 'Save settings', settingsSaved: 'Settings saved.',
    printHint: 'When printing, choose Letter paper, scale 100%, no "fit to page".',
    stub: { cheque: 'Cheque', payee: 'Pay to', amount: 'Amount', for: 'For', memo: 'Memo' },
    testPayee: 'TEST PAGE - DO NOT CASH',
  },
};

const money = (cents) => (cents < 0 ? '-' : '') + '$ ' + (Math.abs(cents) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const toCents = (v) => Math.round((parseFloat(String(v).replace(',', '.')) || 0) * 100);
const today = () => new Date().toISOString().slice(0, 10);
const say = (T, r) => { const code = String(r?.error || ''); const key = Object.keys(T.errors).find(k => code.includes(k)); return key ? T.errors[key] : T.errorGeneric(code || r?.detail || ''); };

function styles(C) {
  const input = { background: C.inputBg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px', fontSize: 12, width: '100%', boxSizing: 'border-box' };
  return {
    input,
    label: { display: 'block', fontSize: 11.5, color: C.muted, marginBottom: 3 },
    btn: { background: C.panel, color: C.sub, border: 'none', borderRadius: 5, padding: '5px 11px', cursor: 'pointer', fontSize: 12 },
    primary: { background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', cursor: 'pointer', fontWeight: 600, fontSize: 12.5 },
    danger: { background: 'none', color: '#ef4444', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 5, padding: '3px 9px', cursor: 'pointer', fontSize: 11, fontWeight: 600 },
    th: { textAlign: 'left', padding: '8px 10px', fontWeight: 600, fontSize: 12, color: C.sub, whiteSpace: 'nowrap' },
    td: { padding: '7px 10px', verticalAlign: 'middle', color: C.text, fontSize: 12.5 },
    card: { background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 14px' },
  };
}

export default function ChequesPanel({ lang = 'fr', C, accounts = [], coaList = [] }) {
  const T = UI[lang] || UI.fr;
  const S = styles(C);
  const bankAccounts = useMemo(() => accounts.filter(a => !a.is_archived && a.account_type === 'bank'), [accounts]);
  const [rows, setRows] = useState([]);
  const [dir, setDir] = useState('');
  const [status, setStatus] = useState('');
  const [summary, setSummary] = useState({});
  const [form, setForm] = useState(null);
  const [bills, setBills] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const [printCfg, setPrintCfg] = useState({});
  const [cfgFor, setCfgFor] = useState(null);   // { accountId, ...settings } while editing
  useEffect(() => {
    (async () => {
      try { const r = await window.api.storage.get(PRINT_KEY); setPrintCfg(r?.value ? JSON.parse(r.value) : {}); } catch (_) { setPrintCfg({}); }
    })();
  }, []);
  const settingsFor = (accountId) => ({ ...DEFAULT_PRINT_SETTINGS, wordsLang: lang === 'en' ? 'en' : 'fr', ...(printCfg[accountId] || {}) });
  const printCheques = async (list, accountId, testMarks = false) => {
    const html = buildChequesHtml(list, settingsFor(accountId), { labels: T.stub, testMarks, title: T.title });
    try { await window.api.pdf.print(html, { exact: true }); } catch (e) { setError(T.errorGeneric(String(e?.message || e))); }
  };
  const printRow = (c) => printCheques([{ ...c, forLabel: forLabel(c) }], c.bank_account_id);
  const saveCfg = async () => {
    const { accountId, ...cfg } = cfgFor;
    const next = { ...printCfg, [accountId]: cfg };
    setPrintCfg(next);
    try { await window.api.storage.set(PRINT_KEY, JSON.stringify(next)); setFlash(T.settingsSaved); } catch (e) { setError(T.errorGeneric(String(e?.message || e))); }
    setCfgFor(null);
  };
  const printTest = () => {
    const { accountId, ...cfg } = cfgFor;
    const sample = { cheque_number: '0000', cheque_date: today(), party_name: T.testPayee, amount_cents: 123456, memo: T.testPayee, bank_account_name: bankAccounts.find(a => a.id === accountId)?.name };
    const html = buildChequesHtml([sample], cfg, { labels: T.stub, testMarks: true, title: T.title });
    window.api.pdf.print(html, { exact: true }).catch(() => {});
  };

  const load = useCallback(async () => {
    try { setRows(await window.api.cheques.list({ direction: dir || null, status: status || null }) || []); } catch (_) { setRows([]); }
    const sums = {};
    for (const a of bankAccounts) {
      try { sums[a.id] = await window.api.cheques.outstanding(a.id, null); } catch (_) { /* summary is a courtesy */ }
    }
    setSummary(sums);
  }, [dir, status, bankAccounts]);
  useEffect(() => { load(); }, [load]);

  const accountOptions = useMemo(() => coaList.filter(a => !a.is_archived && !['1100'].includes(a.account_number)), [coaList]);
  const accName = (a) => `${a.account_number} · ${lang === 'en' ? (a.name_en || a.name_fr) : (a.name_fr || a.name_en)}`;

  const openForm = async (direction) => {
    setError(''); setFlash('');
    setForm({ direction, bankAccountId: bankAccounts[0] ? String(bankAccounts[0].id) : '', number: '', date: today(), party: '', amount: '',
      kind: direction === CHEQUE_ISSUED ? 'account' : 'invoice_payment', coaAccountId: '', tps: '', tvq: '', billIds: [], invoiceRefs: '', memo: '' });
    if (direction === CHEQUE_ISSUED) {
      try { setBills((await window.api.supplierBills.list({ paid: 0 })) || []); } catch (_) { setBills([]); }
    }
  };
  const set = (patch) => setForm(f => ({ ...f, ...patch }));
  const billCents = form ? bills.filter(b => form.billIds.includes(b.id)).reduce((n, b) => n + Math.round((Number(b.amount) || 0) * 100), 0) : 0;

  const save = async (andPrint = false) => {
    setBusy(true); setError('');
    try {
      const amountCents = form.kind === 'supplier_bills' ? billCents : toCents(form.amount);
      const r = await window.api.cheques.record({
        direction: form.direction, chequeNumber: form.number, chequeDate: form.date, partyName: form.party, amountCents,
        bankAccountId: form.bankAccountId ? Number(form.bankAccountId) : null, kind: form.kind,
        coaAccountId: form.coaAccountId ? Number(form.coaAccountId) : null,
        tpsCents: toCents(form.tps), tvqCents: toCents(form.tvq), billIds: form.billIds,
        invoiceRefs: form.invoiceRefs.split(/[,\s]+/).map(s => s.trim()).filter(Boolean), memo: form.memo,
      });
      if (!r?.ok) { setError(say(T, r)); return; }
      const bankId = form.bankAccountId ? Number(form.bankAccountId) : null;
      setForm(null);
      if (r.matchedTxId) setFlash(T.savedMatched);
      await load();
      if (andPrint) {
        const saved = (await window.api.cheques.list({})).find(c => c.id === r.id);
        if (saved) await printCheques([{ ...saved, forLabel: forLabel(saved) }], bankId);
      }
    } catch (e) { setError(T.errorGeneric(String(e?.message || e))); }
    finally { setBusy(false); }
  };

  const voidCheque = async (c) => {
    // The viewer's confirm() is unavailable in some hosts; Electron supports it.
    if (!window.confirm(T.voidConfirm)) return;
    setBusy(true); setError('');
    try {
      const r = await window.api.cheques.void(c.id, '');
      if (!r?.ok) setError(say(T, r)); else await load();
    } finally { setBusy(false); }
  };

  const calcTax = () => {
    const net = toCents(form.amount) / 1.14975;
    set({ tps: (net * 0.05 / 100).toFixed(2), tvq: (net * 0.09975 / 100).toFixed(2) });
  };

  const forLabel = (c) => {
    if (c.kind === 'supplier_bills') { try { return T.forBills(JSON.parse(c.bill_ids || '[]').length); } catch (_) { return T.kindBills; } }
    if (c.kind === 'invoice_payment') { try { const r = JSON.parse(c.invoice_refs || '[]'); return r.length ? T.forInvoices(r.join(', ')) : T.kindInvoice; } catch (_) { return T.kindInvoice; } }
    return c.account_number ? `${c.account_number} · ${lang === 'en' ? (c.account_name_en || c.account_name_fr) : (c.account_name_fr || c.account_name_en)}` : '-';
  };
  const pill = (c) => c.status === 'cleared'
    ? <span style={{ color: '#22c55e', fontSize: 11.5 }}>{T.statusCleared(c.cleared_date || '')}</span>
    : c.status === 'void' ? <span style={{ color: C.muted, fontSize: 11.5 }}>{T.statusVoid}</span>
      : <span style={{ color: '#f59e0b', fontSize: 11.5, fontWeight: 600 }}>{T.statusOutstanding}</span>;
  const chip = (on, label, onClick) => (
    <button type="button" onClick={onClick} style={{ ...S.btn, background: on ? 'rgba(14,165,233,0.15)' : C.panel, color: on ? '#0ea5e9' : C.sub, fontWeight: on ? 700 : 400 }}>{label}</button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.55, maxWidth: 640 }}>{T.intro}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => openForm(CHEQUE_ISSUED)} style={S.primary}>{T.writeBtn}</button>
          <button type="button" onClick={() => openForm(CHEQUE_RECEIVED)} style={{ ...S.primary, background: '#22c55e' }}>{T.receiveBtn}</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
        {bankAccounts.map(a => {
          const s = summary[a.id];
          const any = s && (s.issued.count || s.received.count);
          return (
            <div key={a.id} style={S.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: C.text }}>{a.name}</div>
                <button type="button" onClick={() => setCfgFor({ accountId: a.id, ...settingsFor(a.id) })} style={{ ...S.btn, fontSize: 11 }}>{T.printSettingsBtn}</button>
              </div>
              {!any ? <div style={{ fontSize: 12, color: C.muted }}>{T.noneOutstanding}</div> : <>
                {s.issued.count > 0 && <div style={{ fontSize: 12, color: '#f59e0b' }}>{T.outstandingWritten(s.issued.count, money(s.issued.cents))}</div>}
                {s.received.count > 0 && <div style={{ fontSize: 12, color: '#0ea5e9' }}>{T.outstandingReceived(s.received.count, money(s.received.cents))}</div>}
              </>}
            </div>
          );
        })}
      </div>

      {cfgFor && (
        <div style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{T.printSettingsTitle(bankAccounts.find(a => a.id === cfgFor.accountId)?.name || '')}</div>
          <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.5 }}>{T.printIntro}</div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12.5, color: C.text, alignItems: 'center' }}>
            <span style={{ ...S.label, marginBottom: 0 }}>{T.position}</span>
            {CHEQUE_POSITIONS.map(p => (
              <label key={p} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="radio" name="chq-pos" checked={cfgFor.position === p} onChange={() => setCfgFor(c => ({ ...c, position: p }))} style={{ accentColor: '#0ea5e9' }} />
                {p === 'top' ? T.posTop : p === 'middle' ? T.posMiddle : T.posBottom}
              </label>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
            <div><label style={S.label} htmlFor="chq-datefmt">{T.dateFormat}</label>
              <select id="chq-datefmt" style={S.input} value={cfgFor.dateFormat} onChange={e => setCfgFor(c => ({ ...c, dateFormat: e.target.value }))}>
                {DATE_FORMATS.map(f => <option key={f} value={f}>{f.replace(/(YYYY|MM|DD)/g, '$1 ').trim()}</option>)}
              </select></div>
            <div><label style={S.label} htmlFor="chq-offx">{T.offsetX}</label>
              <input id="chq-offx" type="number" step="0.5" style={{ ...S.input, textAlign: 'right' }} value={cfgFor.offsetXmm} onChange={e => setCfgFor(c => ({ ...c, offsetXmm: e.target.value }))} /></div>
            <div><label style={S.label} htmlFor="chq-offy">{T.offsetY}</label>
              <input id="chq-offy" type="number" step="0.5" style={{ ...S.input, textAlign: 'right' }} value={cfgFor.offsetYmm} onChange={e => setCfgFor(c => ({ ...c, offsetYmm: e.target.value }))} /></div>
            <div><label style={S.label} htmlFor="chq-words">{T.wordsLang}</label>
              <select id="chq-words" style={S.input} value={cfgFor.wordsLang} onChange={e => setCfgFor(c => ({ ...c, wordsLang: e.target.value }))}>
                <option value="fr">{T.langFr}</option><option value="en">{T.langEn}</option>
              </select></div>
          </div>
          <div style={{ fontSize: 11, color: C.muted }}>{T.printHint}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={printTest} style={S.btn}>{T.printTest}</button>
            <button type="button" onClick={saveCfg} style={S.primary}>{T.saveSettings}</button>
            <button type="button" onClick={() => setCfgFor(null)} style={S.btn}>{T.cancel}</button>
          </div>
        </div>
      )}

      {flash && <div style={{ fontSize: 12, color: '#22c55e' }}>{flash}</div>}
      {error && !form && <div style={{ fontSize: 12, color: '#ef4444' }}>{error}</div>}

      {form && (
        <div style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{form.direction === CHEQUE_ISSUED ? T.formWriteTitle : T.formReceiveTitle}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
            <div><label style={S.label} htmlFor="chq-bank">{T.bankAccount}</label>
              <select id="chq-bank" style={S.input} value={form.bankAccountId} onChange={e => set({ bankAccountId: e.target.value })}>
                {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select></div>
            <div><label style={S.label} htmlFor="chq-num">{T.number}</label>
              <input id="chq-num" style={S.input} value={form.number} onChange={e => set({ number: e.target.value })} /></div>
            <div><label style={S.label} htmlFor="chq-date">{T.date}</label>
              <input id="chq-date" type="date" style={S.input} value={form.date} onChange={e => set({ date: e.target.value })} /></div>
            <div><label style={S.label} htmlFor="chq-party">{form.direction === CHEQUE_ISSUED ? T.payee : T.payer}</label>
              <input id="chq-party" style={S.input} value={form.party} onChange={e => set({ party: e.target.value })} /></div>
            {form.kind !== 'supplier_bills' && (
              <div><label style={S.label} htmlFor="chq-amount">{T.amount}</label>
                <input id="chq-amount" type="number" step="0.01" min="0" style={{ ...S.input, textAlign: 'right' }} value={form.amount} onChange={e => set({ amount: e.target.value })} /></div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12.5, color: C.text }}>
            {(form.direction === CHEQUE_ISSUED ? [['account', T.kindAccount], ['supplier_bills', T.kindBills]] : [['invoice_payment', T.kindInvoice], ['account', T.kindOther]]).map(([k, label]) => (
              <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="radio" name="chq-kind" checked={form.kind === k} onChange={() => set({ kind: k })} style={{ accentColor: '#0ea5e9' }} />{label}
              </label>
            ))}
          </div>

          {form.kind === 'account' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, alignItems: 'end' }}>
              <div style={{ gridColumn: '1 / -1' }}><label style={S.label} htmlFor="chq-acc">{T.account}</label>
                <select id="chq-acc" style={S.input} value={form.coaAccountId} onChange={e => set({ coaAccountId: e.target.value })}>
                  <option value="">{T.chooseAccount}</option>
                  {accountOptions.map(a => <option key={a.id} value={a.id}>{accName(a)}</option>)}
                </select></div>
              <div><label style={S.label} htmlFor="chq-tps">{T.tps}</label>
                <input id="chq-tps" type="number" step="0.01" min="0" style={{ ...S.input, textAlign: 'right' }} value={form.tps} onChange={e => set({ tps: e.target.value })} /></div>
              <div><label style={S.label} htmlFor="chq-tvq">{T.tvq}</label>
                <input id="chq-tvq" type="number" step="0.01" min="0" style={{ ...S.input, textAlign: 'right' }} value={form.tvq} onChange={e => set({ tvq: e.target.value })} /></div>
              <div><button type="button" onClick={calcTax} style={S.btn}>{T.calc}</button></div>
              <div style={{ gridColumn: '1 / -1', fontSize: 11, color: C.muted }}>{T.taxHint}</div>
            </div>
          )}

          {form.kind === 'supplier_bills' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={S.label}>{T.bills}</div>
              {bills.length === 0 ? <div style={{ fontSize: 12, color: C.muted }}>{T.noBills}</div> : bills.map(b => (
                <label key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: C.text, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.billIds.includes(b.id)} style={{ accentColor: '#0ea5e9' }}
                    onChange={() => set({ billIds: form.billIds.includes(b.id) ? form.billIds.filter(x => x !== b.id) : [...form.billIds, b.id] })} />
                  <span style={{ flex: 1 }}>{b.bill_date} · {b.supplier_name}{b.invoice_number ? ` · ${b.invoice_number}` : ''}</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{money(Math.round((Number(b.amount) || 0) * 100))}</span>
                </label>
              ))}
              {form.billIds.length > 0 && <div style={{ fontSize: 12, color: C.sub }}>{T.billsTotal(money(billCents))}</div>}
            </div>
          )}

          {form.kind === 'invoice_payment' && (
            <div><label style={S.label} htmlFor="chq-refs">{T.invoiceRefs}</label>
              <input id="chq-refs" style={S.input} value={form.invoiceRefs} onChange={e => set({ invoiceRefs: e.target.value })} /></div>
          )}
          <div><label style={S.label} htmlFor="chq-memo">{T.memo}</label>
            <input id="chq-memo" style={S.input} value={form.memo} onChange={e => set({ memo: e.target.value })} /></div>

          {error && <div style={{ fontSize: 12, color: '#ef4444' }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => save(false)} disabled={busy} style={S.primary}>{T.save}</button>
            {form.direction === CHEQUE_ISSUED && <button type="button" onClick={() => save(true)} disabled={busy} style={{ ...S.primary, background: '#6366f1' }}>{T.saveAndPrint}</button>}
            <button type="button" onClick={() => { setForm(null); setError(''); }} style={S.btn}>{T.cancel}</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {chip(!dir, T.filterAll, () => setDir(''))}
        {chip(dir === CHEQUE_ISSUED, T.filterWritten, () => setDir(CHEQUE_ISSUED))}
        {chip(dir === CHEQUE_RECEIVED, T.filterReceived, () => setDir(CHEQUE_RECEIVED))}
        <span style={{ width: 10 }} />
        {chip(!status, T.filterAll, () => setStatus(''))}
        {chip(status === 'outstanding', T.filterOutstanding, () => setStatus('outstanding'))}
        {chip(status === 'cleared', T.filterCleared, () => setStatus('cleared'))}
        {chip(status === 'void', T.filterVoid, () => setStatus('void'))}
      </div>

      {rows.length === 0 ? <div style={{ fontSize: 12.5, color: C.muted, padding: '10px 0' }}>{T.none}</div> : (
        <div style={{ overflowX: 'auto', border: `1px solid ${C.border}`, borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760, background: C.card }}>
            <thead><tr style={{ borderBottom: `1px solid ${C.border}` }}>
              <th style={S.th}>{T.colDate}</th><th style={S.th}>{T.colNumber}</th><th style={S.th}>{T.colDirection}</th>
              <th style={S.th}>{T.colParty}</th><th style={S.th}>{T.colFor}</th>
              <th style={{ ...S.th, textAlign: 'right' }}>{T.colAmount}</th><th style={S.th}>{T.colStatus}</th><th style={S.th} />
            </tr></thead>
            <tbody>{rows.map(c => (
              <tr key={c.id} style={{ borderBottom: `1px solid ${C.divider}`, opacity: c.status === 'void' ? 0.55 : 1 }}>
                <td style={{ ...S.td, whiteSpace: 'nowrap' }}>{c.cheque_date}</td>
                <td style={{ ...S.td, fontVariantNumeric: 'tabular-nums' }}>{c.cheque_number || '-'}</td>
                <td style={S.td}>{c.direction === CHEQUE_ISSUED ? T.written : T.received}</td>
                <td style={S.td}>{c.party_name || '-'}</td>
                <td style={{ ...S.td, color: C.sub, fontSize: 12 }}>{forLabel(c)}</td>
                <td style={{ ...S.td, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: c.direction === CHEQUE_ISSUED ? C.text : '#22c55e' }}>
                  {c.direction === CHEQUE_ISSUED ? '-' : ''}{money(c.amount_cents)}</td>
                <td style={{ ...S.td, whiteSpace: 'nowrap' }}>{pill(c)}</td>
                <td style={{ ...S.td, textAlign: 'right' }}>
                  {c.direction === CHEQUE_ISSUED && c.status !== 'void' && <button type="button" onClick={() => printRow(c)} style={{ ...S.btn, fontSize: 11, marginRight: 6 }}>{T.printBtn}</button>}
                  {c.status === 'outstanding' && <button type="button" onClick={() => voidCheque(c)} disabled={busy} style={S.danger}>{T.voidBtn}</button>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// The dialog behind a statement line's "Cheque" button.
export function ChequeLinkModal({ lang = 'fr', C, tx, onClose, onLinked }) {
  const T = UI[lang] || UI.fr;
  const S = styles(C);
  const [data, setData] = useState(null);
  const [picked, setPicked] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await window.api.cheques.candidates(tx.id);
        if (!alive) return;
        setData(d);
        const auto = (d?.cheques || []).find(c => c.sameNumber && c.sameAmount);
        if (auto) setPicked([auto.id]);
      } catch (_) { if (alive) setData({ cheques: [] }); }
    })();
    return () => { alive = false; };
  }, [tx.id]);
  const issued = Number(tx.amount) < 0;
  const lineCents = Math.round(Math.abs(Number(tx.amount) || 0) * 100);
  const sel = (data?.cheques || []).filter(c => picked.includes(c.id)).reduce((n, c) => n + c.amount_cents, 0);
  const toggle = (id) => setPicked(p => issued ? [id] : (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));
  const link = async () => {
    setBusy(true); setError('');
    try {
      const r = await window.api.cheques.link(tx.id, picked);
      if (!r?.ok) { setError(say(T, r)); return; }
      onLinked?.(); onClose?.();
    } finally { setBusy(false); }
  };
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ ...S.card, width: 'min(560px, 100%)', maxHeight: '80vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{T.linkTitle}</div>
        <div style={{ fontSize: 12.5, color: C.text }}>{tx.transaction_date} · {tx.description} · <strong>{money(Math.round(Number(tx.amount) * 100))}</strong></div>
        <div style={{ fontSize: 11.5, color: C.muted }}>{issued ? T.linkHintIssued : T.linkHintReceived}{data?.number ? ` ${T.linkNumberSeen(data.number)}` : ''}</div>
        {!data ? null : data.cheques.length === 0 ? <div style={{ fontSize: 12, color: C.muted }}>{T.linkNone}</div> : data.cheques.map(c => (
          <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: C.text, cursor: 'pointer', padding: '4px 0' }}>
            <input type={issued ? 'radio' : 'checkbox'} name="chq-link" checked={picked.includes(c.id)} onChange={() => toggle(c.id)} style={{ accentColor: '#0ea5e9' }} />
            <span style={{ flex: 1, minWidth: 0 }}>{c.cheque_date} · #{c.cheque_number || '-'} · {c.party_name || '-'}
              {c.sameNumber && <span style={{ marginLeft: 6, fontSize: 10.5, color: '#22c55e' }}>{T.sameNumber}</span>}
              {c.sameAmount && <span style={{ marginLeft: 6, fontSize: 10.5, color: '#0ea5e9' }}>{T.sameAmount}</span>}
            </span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{money(c.amount_cents)}</span>
          </label>
        ))}
        {picked.length > 0 && <div style={{ fontSize: 12, color: sel === lineCents ? '#22c55e' : '#f59e0b' }}>{T.linkSelected(money(sel), money(lineCents))}</div>}
        {error && <div style={{ fontSize: 12, color: '#ef4444' }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={link} disabled={busy || sel !== lineCents || !picked.length} style={{ ...S.primary, opacity: sel === lineCents && picked.length ? 1 : 0.5 }}>{T.linkBtn}</button>
          <button type="button" onClick={onClose} style={S.btn}>{T.cancel}</button>
        </div>
      </div>
    </div>
  );
}
