import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { parseBillText } from '../utils/billParser.js';

// What you owe, before you pay it. Until now the app only knew about money that
// had already left the bank, which meant a bill sitting on the desk was invisible
// to the books and the expense landed in whatever month you happened to pay it.
//
// Recording a bill here posts it immediately (Dr expense, Cr 2010), so the cost
// lands in the month it was incurred and the input tax credit is claimable from
// that date. Marking it paid settles the payable against cash on the payment
// date. The two dates are deliberately separate - that is the whole point of
// tracking payables at all.

const UI = {
  fr: {
    title: 'Factures fournisseurs',
    intro: 'Ce que vous devez, avant de le payer. La dépense est comptabilisée à la date de la facture; le paiement, à la date du paiement.',
    add: 'Nouvelle facture',
    supplier: 'Fournisseur',
    invoiceNo: 'N° de facture',
    billDate: 'Date de la facture',
    dueDate: 'Échéance',
    account: 'Compte de dépense',
    amount: 'Montant total',
    tps: 'TPS payée',
    tvq: 'TVQ payée',
    note: 'Note',
    save: 'Enregistrer',
    cancel: 'Annuler',
    markPaid: 'Marquer payée',
    markUnpaid: 'Annuler le paiement',
    paidOn: 'Payée le',
    paymentDate: 'Date du paiement',
    outstanding: 'Solde impayé',
    unpaid: 'Impayées',
    paid: 'Payées',
    all: 'Toutes',
    none: 'Aucune facture.',
    overdue: 'En retard',
    dueIn: (n) => `Dans ${n} j`,
    required: 'Fournisseur, montant et compte de dépense sont requis.',
    confirmUnpaid: 'Annuler le paiement de cette facture ? L\'écriture de paiement sera contrepassée.',
    taxHint: 'Saisissez les montants inscrits sur la facture. Toute limite de CTI rattachée au compte est appliquée automatiquement.',
    upload: 'Lire une facture',
    reading: 'Lecture…',
    readOk: (n) => `${n} champ(s) lus. Vérifiez chacun avant d'enregistrer.`,
    readNothing: 'Rien n\'a pu être lu de ce fichier. Saisissez la facture à la main.',
    detected: 'lu du document',
    dropHere: 'Déposez un PDF ou une photo ici',
    errPdfNoText: 'Ce PDF est une image sans texte. Enregistrez-le en PNG ou JPG et réessayez : la reconnaissance de texte prendra le relais.',
    errUnsupported: 'Type de fichier non pris en charge. Utilisez un PDF, PNG ou JPG.',
    errRead: 'Le fichier n\'a pas pu être lu.',
    warnTotal: (e, f) => `Le total lu (${f}) ne correspond pas au sous-total plus les taxes (${e}). Vérifiez les montants.`,
    warnRatio: 'Le rapport TPS/TVQ ne suit pas les taux du Québec. Vérifiez les deux montants.',
    warnNoTotal: 'Aucun total n\'a été trouvé. Saisissez-le à la main.',
    warnTaxOver: 'La taxe lue dépasse le total. Vérifiez les montants.',
  },
  en: {
    title: 'Supplier bills',
    intro: 'What you owe, before you pay it. The expense posts on the bill date; the payment posts on the date you pay.',
    add: 'New bill',
    supplier: 'Supplier',
    invoiceNo: 'Invoice no.',
    billDate: 'Bill date',
    dueDate: 'Due',
    account: 'Expense account',
    amount: 'Total amount',
    tps: 'GST paid',
    tvq: 'QST paid',
    note: 'Note',
    save: 'Save',
    cancel: 'Cancel',
    markPaid: 'Mark paid',
    markUnpaid: 'Undo payment',
    paidOn: 'Paid',
    paymentDate: 'Payment date',
    outstanding: 'Outstanding',
    unpaid: 'Unpaid',
    paid: 'Paid',
    all: 'All',
    none: 'No bills yet.',
    overdue: 'Overdue',
    dueIn: (n) => `In ${n}d`,
    required: 'Supplier, amount and expense account are required.',
    confirmUnpaid: 'Undo the payment on this bill? The payment entry will be reversed.',
    taxHint: 'Enter the amounts shown on the bill. Any ITC limit on the account is applied for you.',
    upload: 'Read a bill',
    reading: 'Reading…',
    readOk: (n) => `${n} field(s) read. Check each one before saving.`,
    readNothing: 'Nothing could be read from that file. Enter the bill by hand.',
    detected: 'read from the document',
    dropHere: 'Drop a PDF or a photo here',
    errPdfNoText: 'That PDF is an image with no text layer. Save it as PNG or JPG and try again - text recognition will take over.',
    errUnsupported: 'Unsupported file type. Use a PDF, PNG or JPG.',
    errRead: 'The file could not be read.',
    warnTotal: (e, f) => `The total read (${f}) does not match subtotal plus taxes (${e}). Check the amounts.`,
    warnRatio: 'The GST to QST ratio does not follow Quebec rates. Check both amounts.',
    warnNoTotal: 'No total was found. Enter it by hand.',
    warnTaxOver: 'The tax read is larger than the total. Check the amounts.',
  },
};

const today = () => new Date().toISOString().slice(0, 10);

export default function BillsTab({ lang = 'fr' }) {
  const T = UI[lang] || UI.fr;
  const [bills, setBills]       = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [filter, setFilter]     = useState('unpaid');
  const [editing, setEditing]   = useState(null);
  const [error, setError]       = useState('');
  const [busy, setBusy]         = useState(false);
  // What the reader proposed, so each field can show where its value came from
  // and the operator can see at a glance what to check.
  const [read, setRead]         = useState(null);
  const [dragOver, setDragOver] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await window.api?.supplierBills?.list({});
      setBills(Array.isArray(list) ? list : []);
    } catch (_) { setBills([]); }
    try {
      const coa = await window.api?.coa?.list();
      setAccounts(Array.isArray(coa) ? coa.filter(a => ['expense', 'cogs'].includes(a.type) && !a.is_archived) : []);
    } catch (_) { setAccounts([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const money = (v) => (Number(v) || 0).toLocaleString(lang === 'en' ? 'en-CA' : 'fr-CA',
    { style: 'currency', currency: 'CAD' });
  const accName = (a) => lang === 'en' ? (a.name_en || a.name_fr) : (a.name_fr || a.name_en);

  const shown = useMemo(() => bills.filter(b =>
    filter === 'all' ? true : filter === 'paid' ? !!b.paid : !b.paid
  ), [bills, filter]);

  const outstanding = useMemo(() =>
    bills.filter(b => !b.paid).reduce((s, b) => s + (parseFloat(b.amount) || 0), 0), [bills]);

  const blank = () => ({
    supplier_name: '', invoice_number: '', bill_date: today(), due_date: '',
    coa_account_id: '', amount: '', tps_paid: '', tvq_paid: '', note: '',
  });

  // The reader proposes; the operator disposes. Every value lands in an ordinary
  // editable field, marked with where it came from, and nothing is saved until
  // they press Save - including the expense account, which the document cannot
  // tell us and which stays empty on purpose.
  function applyParsed(parsed, fileName) {
    const f = parsed.fields;
    const val = (x) => (x && x.value != null ? String(x.value) : '');
    const next = {
      ...blank(),
      supplier_name:  val(f.supplier),
      invoice_number: val(f.invoiceNumber),
      bill_date:      val(f.billDate) || today(),
      amount:         val(f.amount),
      tps_paid:       val(f.tps),
      tvq_paid:       val(f.tvq),
      note:           fileName ? `${fileName}` : '',
    };
    const filled = ['supplier', 'invoiceNumber', 'billDate', 'amount', 'tps', 'tvq']
      .filter(k => f[k] && f[k].value != null);
    setRead({ fields: f, warnings: parsed.warnings, count: filled.length, fileName });
    setEditing(next);
    setError('');
    return filled.length;
  }

  async function readFrom(promise) {
    setBusy(true); setError('');
    try {
      const r = await promise;
      if (r?.cancelled) return;
      if (!r?.ok) {
        setError(r?.error === 'pdf_has_no_text' ? T.errPdfNoText
               : r?.error === 'unsupported_type' ? T.errUnsupported
               : T.errRead);
        return;
      }
      const parsed = parseBillText(r.text);
      if (applyParsed(parsed, r.fileName) === 0) setError(T.readNothing);
    } catch (e) { setError(String(e?.message ?? e)); }
    finally { setBusy(false); }
  }

  const onDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    const filePath = file?.path;
    if (filePath) readFrom(window.api.supplierBills.readDocumentAt(filePath));
  };

  // A quiet badge on the fields the reader filled, so the ones to check are
  // obvious and the ones typed by hand are not decorated for no reason.
  const mark = (key) => read?.fields?.[key]?.value == null ? null : (
    <span title={T.detected} style={{
      marginLeft: 6, fontSize: 9, fontWeight: 600, letterSpacing: '.04em',
      color: '#93c5fd', background: 'rgba(96,165,250,0.13)',
      borderRadius: 3, padding: '1px 5px', textTransform: 'none',
    }}>{lang === 'en' ? 'read' : 'lu'}</span>
  );

  const warnText = (w) =>
    w.code === 'total_mismatch' ? T.warnTotal(money(w.expected), money(w.found))
    : w.code === 'tax_ratio_odd' ? T.warnRatio
    : w.code === 'tax_exceeds_total' ? T.warnTaxOver
    : w.code === 'no_total' ? T.warnNoTotal : null;

  async function save() {
    const f = editing;
    if (!f.supplier_name.trim() || !(parseFloat(f.amount) > 0) || !f.coa_account_id) {
      setError(T.required); return;
    }
    setError(''); setBusy(true);
    const payload = {
      supplier_name: f.supplier_name.trim(),
      invoice_number: f.invoice_number.trim() || null,
      bill_date: f.bill_date || today(),
      due_date: f.due_date || null,
      coa_account_id: parseInt(f.coa_account_id, 10),
      amount: parseFloat(f.amount) || 0,
      tps_paid: parseFloat(f.tps_paid) || 0,
      tvq_paid: parseFloat(f.tvq_paid) || 0,
      note: f.note || '',
      month_key: (f.bill_date || today()).slice(0, 7),
    };
    try {
      if (f.id) await window.api.supplierBills.update(f.id, payload);
      else      await window.api.supplierBills.create(payload);
      setEditing(null); await load();
    } catch (e) { setError(String(e?.message ?? e)); }
    finally { setBusy(false); }
  }

  async function togglePaid(bill) {
    setBusy(true);
    try {
      if (bill.paid) {
        if (!window.confirm(T.confirmUnpaid)) { setBusy(false); return; }
        await window.api.supplierBills.markUnpaid(bill.id);
      } else {
        await window.api.supplierBills.markPaid(bill.id, { payment_date: today() });
      }
      await load();
    } catch (_) {} finally { setBusy(false); }
  }

  const dueState = (b) => {
    if (b.paid || !b.due_date) return null;
    const days = Math.round((new Date(b.due_date) - new Date(today())) / 86400000);
    return days < 0 ? { label: T.overdue, tone: '#ef4444' } : { label: T.dueIn(days), tone: days <= 7 ? '#f59e0b' : '#64748b' };
  };

  const C = { text: '#e2e8f0', sub: '#94a3b8', muted: '#64748b', border: '#2d3148', card: '#161822', sunk: '#0f1119' };
  const input = { background: C.sunk, border: `1px solid ${C.border}`, borderRadius: 5, color: C.text, fontSize: 13, padding: '6px 9px', outline: 'none', width: '100%', boxSizing: 'border-box' };
  const lbl = { fontSize: 10.5, color: C.muted, marginBottom: 3, display: 'block', textTransform: 'uppercase', letterSpacing: '.04em' };
  const btn = (bg, fg = '#fff') => ({ padding: '6px 14px', borderRadius: 6, border: 'none', background: bg, color: fg, fontSize: 12, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 });
  const th = { textAlign: 'left', fontSize: 10.5, color: C.muted, fontWeight: 600, padding: '7px 9px', textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: `1px solid ${C.border}` };
  const td = { padding: '8px 9px', fontSize: 13, color: C.text, borderBottom: '1px solid #1e2131', verticalAlign: 'middle' };
  const num = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 6 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{T.title}</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 3, maxWidth: '62ch', lineHeight: 1.5 }}>{T.intro}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10.5, color: C.muted, textTransform: 'uppercase', letterSpacing: '.05em' }}>{T.outstanding}</div>
          <div style={{ fontSize: 21, fontWeight: 700, color: outstanding > 0 ? '#f59e0b' : '#22c55e', fontVariantNumeric: 'tabular-nums' }}>
            {money(outstanding)}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '16px 0 12px', flexWrap: 'wrap' }}>
        {[['unpaid', T.unpaid], ['paid', T.paid], ['all', T.all]].map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)} style={{
            padding: '4px 12px', borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            border: `1px solid ${filter === k ? '#f97316' : C.border}`,
            background: filter === k ? 'rgba(249,115,22,0.12)' : 'transparent',
            color: filter === k ? '#f97316' : C.sub,
          }}>{label}</button>
        ))}
        <span style={{ flex: 1 }} />
        {!editing && (
          <>
            <button onClick={() => readFrom(window.api.supplierBills.readDocument())} disabled={busy}
              style={btn('#1e2131', '#e2e8f0')}>{busy ? T.reading : T.upload}</button>
            <button onClick={() => { setError(''); setRead(null); setEditing(blank()); }}
              style={btn('linear-gradient(135deg,#f97316,#ea580c)')}>{T.add}</button>
          </>
        )}
      </div>

      {!editing && (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          style={{
            border: `1.5px dashed ${dragOver ? '#f97316' : C.border}`,
            background: dragOver ? 'rgba(249,115,22,0.06)' : 'transparent',
            borderRadius: 8, padding: '14px 16px', marginBottom: 14,
            fontSize: 12.5, color: dragOver ? '#f97316' : C.muted, textAlign: 'center',
          }}>
          {T.dropHere}
        </div>
      )}

      {editing && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {read && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 12, color: '#93c5fd', background: 'rgba(96,165,250,0.08)',
                border: '1px solid rgba(96,165,250,0.25)', borderRadius: 6, padding: '8px 11px', lineHeight: 1.45 }}>
                {T.readOk(read.count)}
                {read.fileName && <span style={{ color: C.muted, marginLeft: 6 }}>{read.fileName}</span>}
              </div>
              {read.warnings.map((w, i) => {
                const txt = warnText(w);
                return txt ? (
                  <div key={i} style={{ fontSize: 11.5, color: '#a1791f', background: 'rgba(251,191,36,0.08)',
                    border: '1px solid rgba(251,191,36,0.22)', borderRadius: 6, padding: '7px 11px', lineHeight: 1.45 }}>
                    {txt}
                  </div>
                ) : null;
              })}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            <div><span style={lbl}>{T.supplier} *{mark('supplier')}</span>
              <input style={input} value={editing.supplier_name} onChange={e => setEditing({ ...editing, supplier_name: e.target.value })} /></div>
            <div><span style={lbl}>{T.invoiceNo}{mark('invoiceNumber')}</span>
              <input style={input} value={editing.invoice_number} onChange={e => setEditing({ ...editing, invoice_number: e.target.value })} /></div>
            <div><span style={lbl}>{T.billDate}{mark('billDate')}</span>
              <input type="date" style={input} value={editing.bill_date} onChange={e => setEditing({ ...editing, bill_date: e.target.value })} /></div>
            <div><span style={lbl}>{T.dueDate}</span>
              <input type="date" style={input} value={editing.due_date || ''} onChange={e => setEditing({ ...editing, due_date: e.target.value })} /></div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            <div style={{ gridColumn: 'span 2', minWidth: 0 }}><span style={lbl}>{T.account} *</span>
              <select style={input} value={editing.coa_account_id} onChange={e => setEditing({ ...editing, coa_account_id: e.target.value })}>
                <option value="">-</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.account_number} · {accName(a)}{(a.itc_pct ?? 100) !== 100 ? ` (${a.itc_pct}%)` : ''}</option>)}
              </select></div>
            <div><span style={lbl}>{T.amount} *</span>
              <input type="number" step="0.01" min="0" style={{ ...input, textAlign: 'right' }} value={editing.amount} onChange={e => setEditing({ ...editing, amount: e.target.value })} /></div>
            <div><span style={lbl}>{T.tps}{mark('tps')}</span>
              <input type="number" step="0.01" min="0" style={{ ...input, textAlign: 'right' }} value={editing.tps_paid} onChange={e => setEditing({ ...editing, tps_paid: e.target.value })} /></div>
            <div><span style={lbl}>{T.tvq}{mark('tvq')}</span>
              <input type="number" step="0.01" min="0" style={{ ...input, textAlign: 'right' }} value={editing.tvq_paid} onChange={e => setEditing({ ...editing, tvq_paid: e.target.value })} /></div>
          </div>

          <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.45 }}>{T.taxHint}</div>

          <div><span style={lbl}>{T.note}</span>
            <input style={input} value={editing.note} onChange={e => setEditing({ ...editing, note: e.target.value })} /></div>

          {error && <div style={{ fontSize: 12, color: '#ef4444' }}>{error}</div>}

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={save} disabled={busy} style={btn('linear-gradient(135deg,#f97316,#ea580c)')}>{T.save}</button>
            <button onClick={() => { setEditing(null); setError(''); }} style={btn('#1e2131', C.sub)}>{T.cancel}</button>
          </div>
        </div>
      )}

      {shown.length === 0 ? (
        <div style={{ color: C.muted, fontSize: 13, padding: '24px 0' }}>{T.none}</div>
      ) : (
        <div style={{ overflowX: 'auto', border: `1px solid ${C.border}`, borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 660, background: C.card }}>
            <thead><tr>
              <th style={th}>{T.supplier}</th>
              <th style={th}>{T.billDate}</th>
              <th style={th}>{T.dueDate}</th>
              <th style={th}>{T.account}</th>
              <th style={{ ...th, textAlign: 'right' }}>{T.amount}</th>
              <th style={{ ...th, textAlign: 'right' }}></th>
            </tr></thead>
            <tbody>
              {shown.map(b => {
                const acct = accounts.find(a => a.id === b.coa_account_id);
                const due = dueState(b);
                return (
                  <tr key={b.id} style={{ opacity: b.paid ? 0.55 : 1 }}>
                    <td style={td}>
                      {b.supplier_name}
                      {b.invoice_number && <span style={{ color: C.muted, fontSize: 11, marginLeft: 7 }}>{b.invoice_number}</span>}
                    </td>
                    <td style={{ ...td, color: C.sub, whiteSpace: 'nowrap' }}>{b.bill_date || '-'}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      {b.paid
                        ? <span style={{ fontSize: 11.5, color: '#22c55e' }}>{T.paidOn} {b.payment_date || ''}</span>
                        : due
                          ? <span style={{ fontSize: 11.5, color: due.tone }}>{due.label}</span>
                          : <span style={{ color: C.muted }}>-</span>}
                    </td>
                    <td style={{ ...td, color: C.sub, fontSize: 12 }}>{acct ? `${acct.account_number} · ${accName(acct)}` : '-'}</td>
                    <td style={num}>{money(b.amount)}</td>
                    <td style={{ ...num, whiteSpace: 'nowrap' }}>
                      {!b.paid && (
                        <button onClick={() => { setError(''); setEditing({
                          ...b,
                          amount: String(b.amount ?? ''),
                          tps_paid: String(b.tps_paid ?? ''),
                          tvq_paid: String(b.tvq_paid ?? ''),
                          coa_account_id: String(b.coa_account_id ?? ''),
                          invoice_number: b.invoice_number || '',
                          note: b.note || '',
                        }); }} style={{ background: 'none', border: 'none', color: C.sub, cursor: 'pointer', fontSize: 12, marginRight: 6 }}>✎</button>
                      )}
                      <button onClick={() => togglePaid(b)} disabled={busy} style={{
                        background: 'none', border: `1px solid ${b.paid ? C.border : 'rgba(34,197,94,0.35)'}`,
                        borderRadius: 5, color: b.paid ? C.muted : '#22c55e', cursor: busy ? 'default' : 'pointer',
                        fontSize: 11, fontWeight: 600, padding: '3px 9px',
                      }}>{b.paid ? T.markUnpaid : T.markPaid}</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
