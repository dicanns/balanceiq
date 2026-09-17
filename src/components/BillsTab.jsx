import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { parseBillDocument, parseAmount, findDate, FIELD_KINDS } from '../utils/billParser.js';
import { BILL_TEMPLATES_KEY, findTemplate, anchorForPick, rememberBill } from '../utils/billTemplates.js';

// What you owe, before you pay it. Until now the app only knew about money that
// had already left the bank, which meant a bill sitting on the desk was invisible
// to the books and the expense landed in whatever month you happened to pay it.
//
// Recording a bill here posts it immediately (Dr expense, Cr 2010), so the cost
// lands in the month it was incurred and the input tax credit is claimable from
// that date. Marking it paid settles the payable against cash on the payment
// date. The two dates are deliberately separate - that is the whole point of
// tracking payables at all.
//
// A bill can be read from a PDF or a photo. The reader proposes; the operator
// checks. The document is shown beside the form, and any field can be set by
// choosing it and clicking its value on the page. The label printed beside a
// value clicked that way is remembered for that supplier, so their next bill is
// read the way it was corrected.

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
    quantity: 'Quantité',
    unitCost: 'Coût unitaire',
    note: 'Note',
    save: 'Enregistrer',
    cancel: 'Annuler',
    markPaid: 'Marquer payée',
    markUnpaid: 'Annuler le paiement',
    delete: 'Supprimer',
    confirmDelete: 'Supprimer cette facture ? Toute ecriture au grand livre sera contrepassee. Cette action est definitive.',
    paidOn: 'Payée le',
    paidVia: (n) => `· par ${n}`,
    attachTitle: 'Cette facture est peut-être déjà sur un relevé',
    attachBody: 'Une ligne du même montant a été importée. Attachez-la : la dépense reste comptabilisée une seule fois, par la facture, et la ligne devient le paiement.',
    attachNow: (n) => `actuellement catégorisée à ${n}`,
    attachUncat: 'pas encore catégorisée',
    attachBtn: 'Attacher',
    attachDismiss: 'Pas maintenant',
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
    taxFree: 'Aucune TPS ni TVQ sur cette facture : les produits ne sont pas taxables, il n\'y a pas de crédit de taxe à réclamer.',
    optional: 'facultatif',
    upload: 'Lire une facture',
    reading: 'Lecture…',
    readOk: (n) => `${n} champ(s) lus. Vérifiez chacun avant d'enregistrer.`,
    readNothing: 'Rien n\'a pu être lu de ce fichier. Saisissez la facture à la main.',
    badgeRead: 'lu',
    badgePicked: 'choisi',
    badgeLearned: 'mémorisé',
    accountRemembered: 'Compte repris de la dernière facture de ce fournisseur.',
    dropHere: 'Déposez un PDF ou une photo ici',
    errPdfNoText: 'Ce PDF est une image sans texte. Enregistrez-le en PNG ou JPG et réessayez : la reconnaissance de texte prendra le relais.',
    errUnsupported: 'Type de fichier non pris en charge. Utilisez un PDF, PNG ou JPG.',
    errRead: 'Le fichier n\'a pas pu être lu.',
    warnTotal: (e, f) => `Le total lu (${f}) ne correspond pas au sous-total plus les taxes (${e}). Vérifiez les montants.`,
    warnRatio: 'Le rapport TPS/TVQ ne suit pas les taux du Québec. Vérifiez les deux montants.',
    warnNoTotal: 'Aucun total n\'a été trouvé. Choisissez Montant total, puis cliquez le total sur la facture.',
    warnTaxOver: 'La taxe lue dépasse le total. Vérifiez les montants.',
    warnLineMath: (d) => `Quantité × prix ne donne pas le montant pour « ${d} ». Vérifiez la ligne.`,
    docTitle: 'La facture',
    pickHint: 'Pour corriger un champ : choisissez-le ci-dessous, puis cliquez sa valeur sur la facture.',
    pickActive: (f) => `Cliquez la valeur de « ${f} » sur la facture.`,
    pickNotValue: 'Ce texte ne ressemble pas à cette sorte de valeur. Cliquez le chiffre ou la date lui-même.',
    pickCancel: 'Annuler',
    rememberNote: 'Les étiquettes à côté des valeurs choisies seront mémorisées pour ce fournisseur à l\'enregistrement.',
    items: 'Articles sur la facture',
    colDesc: 'Description', colQty: 'Qté', colPrice: 'Prix', colAmount: 'Montant',
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
    quantity: 'Quantity',
    unitCost: 'Unit cost',
    note: 'Note',
    save: 'Save',
    cancel: 'Cancel',
    markPaid: 'Mark paid',
    markUnpaid: 'Undo payment',
    delete: 'Delete',
    confirmDelete: 'Delete this bill? Any ledger entry will be reversed. This cannot be undone.',
    paidOn: 'Paid',
    paidVia: (n) => `· via ${n}`,
    attachTitle: 'This bill may already be on a statement',
    attachBody: 'A statement line for the same amount was imported. Attach it: the expense stays booked once, by the bill, and the line becomes the payment.',
    attachNow: (n) => `currently categorized to ${n}`,
    attachUncat: 'not categorized yet',
    attachBtn: 'Attach',
    attachDismiss: 'Not now',
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
    taxFree: 'No GST or QST on this bill: the goods are not taxable, so there is no input tax credit to claim.',
    optional: 'optional',
    upload: 'Read a bill',
    reading: 'Reading…',
    readOk: (n) => `${n} field(s) read. Check each one before saving.`,
    readNothing: 'Nothing could be read from that file. Enter the bill by hand.',
    badgeRead: 'read',
    badgePicked: 'picked',
    badgeLearned: 'remembered',
    accountRemembered: 'Account taken from this supplier\'s last bill.',
    dropHere: 'Drop a PDF or a photo here',
    errPdfNoText: 'That PDF is an image with no text layer. Save it as PNG or JPG and try again - text recognition will take over.',
    errUnsupported: 'Unsupported file type. Use a PDF, PNG or JPG.',
    errRead: 'The file could not be read.',
    warnTotal: (e, f) => `The total read (${f}) does not match subtotal plus taxes (${e}). Check the amounts.`,
    warnRatio: 'The GST to QST ratio does not follow Quebec rates. Check both amounts.',
    warnNoTotal: 'No total was found. Choose Total amount, then click the total on the bill.',
    warnTaxOver: 'The tax read is larger than the total. Check the amounts.',
    warnLineMath: (d) => `Quantity × price does not give the amount for "${d}". Check the line.`,
    docTitle: 'The bill',
    pickHint: 'To fix a field: choose it below, then click its value on the bill.',
    pickActive: (f) => `Click the value for "${f}" on the bill.`,
    pickNotValue: 'That text does not look like that kind of value. Click the number or date itself.',
    pickCancel: 'Cancel',
    rememberNote: 'The labels beside the values you picked are remembered for this supplier when you save.',
    items: 'Items on the bill',
    colDesc: 'Description', colQty: 'Qty', colPrice: 'Price', colAmount: 'Amount',
  },
};

// Reader field -> form field, in the order the picker offers them.
const PICK_FIELDS = [
  ['supplier', 'supplier_name', 'supplier'],
  ['invoiceNumber', 'invoice_number', 'invoiceNo'],
  ['billDate', 'bill_date', 'billDate'],
  ['dueDate', 'due_date', 'dueDate'],
  ['amount', 'amount', 'amount'],
  ['tps', 'tps_paid', 'tps'],
  ['tvq', 'tvq_paid', 'tvq'],
  ['quantity', 'quantity', 'quantity'],
  ['unitCost', 'unit_cost', 'unitCost'],
];
const FORM_KEY = Object.fromEntries(PICK_FIELDS.map(([f, k]) => [f, k]));
const LABEL_KEY = Object.fromEntries(PICK_FIELDS.map(([f, , l]) => [f, l]));

const today = () => new Date().toISOString().slice(0, 10);
const numOrNull = (v) => (v === '' || v == null || !Number.isFinite(parseFloat(v)) ? null : parseFloat(v));

// The page as the reader saw it: every word where it sits, clickable. Not a
// picture of the bill, but the same layout, which is what matters for pointing.
function DocumentView({ lines, pages, positioned, activeField, picked, onPick, C }) {
  const ref = useRef(null);
  const [width, setWidth] = useState(520);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => setWidth(el.clientWidth || 520);
    measure();
    const Observer = typeof window !== 'undefined' ? window.ResizeObserver : undefined;
    if (!Observer) return undefined;
    const ro = new Observer(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pickedAt = new Map(Object.entries(picked || {}).map(([field, r]) => [`${r.li}:${r.ti}`, field]));
  const tokenStyle = (key) => ({
    cursor: activeField ? 'pointer' : 'default',
    background: pickedAt.has(key) ? 'rgba(249,115,22,0.30)' : 'transparent',
    borderRadius: 2,
  });

  const hoverCss = activeField ? '.biq-bill-tok:hover{background:rgba(59,130,246,0.22)!important;outline:1px solid rgba(59,130,246,0.6)}' : '';

  if (!positioned || !pages?.length) {
    return (
      <div ref={ref} style={{ background: '#fff', color: '#111', borderRadius: 6, padding: 10, overflow: 'auto', maxHeight: 640, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11.5, lineHeight: 1.6 }}>
        <style>{hoverCss}</style>
        {lines.map((line, li) => (
          <div key={li} style={{ whiteSpace: 'pre' }}>
            {line.tokens.map((tok, ti) => (
              <React.Fragment key={ti}>
                <span className="biq-bill-tok" onClick={() => onPick(li, ti)} style={tokenStyle(`${li}:${ti}`)}>{tok.str}</span>{' '}
              </React.Fragment>
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div ref={ref} style={{ background: '#fff', borderRadius: 6, overflow: 'auto', maxHeight: 640 }}>
      <style>{hoverCss}</style>
      {pages.map(pg => {
        const scale = width / (pg.width || 612);
        return (
          <div key={pg.page} style={{ position: 'relative', width: '100%', height: (pg.height || 792) * scale, borderBottom: `1px solid ${C.border}` }}>
            {lines.map((line, li) => (line.page !== pg.page ? null : line.tokens.map((tok, ti) => (
              <span key={`${li}:${ti}`} className="biq-bill-tok" title={tok.str} onClick={() => onPick(li, ti)}
                style={{
                  ...tokenStyle(`${li}:${ti}`),
                  position: 'absolute', left: tok.x * scale, top: tok.y * scale,
                  fontSize: Math.max(6, tok.h * scale * 0.9), lineHeight: 1, whiteSpace: 'nowrap',
                  color: '#111', fontFamily: 'Helvetica, Arial, sans-serif', padding: '0 1px',
                }}>{tok.str}</span>
            ))))}
          </div>
        );
      })}
    </div>
  );
}

export default function BillsTab({ lang = 'fr' }) {
  const T = UI[lang] || UI.fr;
  const [bills, setBills]       = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [filter, setFilter]     = useState('unpaid');
  const [editing, setEditing]   = useState(null);
  const [error, setError]       = useState('');
  const [busy, setBusy]         = useState(false);
  // What the reader proposed and the page it read, so each field can show where
  // its value came from and the operator can point at the right one.
  const [read, setRead]         = useState(null);
  const [doc, setDoc]           = useState(null);
  const [activeField, setActiveField] = useState(null);
  const [picked, setPicked]     = useState({});   // field -> { li, ti }
  const [picks, setPicks]       = useState({});   // field -> anchor to remember
  const [pickError, setPickError] = useState('');
  const [templates, setTemplates] = useState({});
  const [ownNames, setOwnNames] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [attach, setAttach]     = useState(null);   // { billId, lines } - statement lines that may be this bill's payment

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

  // Remembered supplier layouts, and this company's own name so it is never
  // proposed as the supplier from the "Sold to" block.
  useEffect(() => {
    (async () => {
      try {
        const r = await window.api?.storage?.get(BILL_TEMPLATES_KEY);
        if (r?.value) setTemplates(JSON.parse(r.value) || {});
      } catch (_) {}
      try {
        const r = await window.api?.storage?.get('dicann-company-info');
        const info = r?.value ? JSON.parse(r.value) : null;
        if (info?.nom) setOwnNames([info.nom]);
      } catch (_) {}
    })();
  }, []);

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
    coa_account_id: '', amount: '', tps_paid: '', tvq_paid: '', quantity: '', unit_cost: '', note: '',
  });

  const resetReading = () => {
    setRead(null); setDoc(null); setActiveField(null); setPicked({}); setPicks({}); setPickError('');
  };

  // A bill read elsewhere (the receipt scanner) arrives as a prefill, so it is
  // recorded once, in the one place that reaches the ledger and the return.
  useEffect(() => {
    (async () => {
      try {
        const r = await window.api?.storage?.get('balanceiq-bill-prefill');
        if (!r?.value) return;
        await window.api.storage.set('balanceiq-bill-prefill', '');
        const p = JSON.parse(r.value);
        setEditing({ ...blank(), supplier_name: p.supplier_name || '', bill_date: p.bill_date || today(),
          amount: p.amount || '', tps_paid: p.tps_paid || '', tvq_paid: p.tvq_paid || '', note: p.note || '' });
      } catch (_) { /* nothing to prefill */ }
    })();
  }, []);

  // Every value lands in an ordinary editable field, marked with where it came
  // from, and nothing is saved until Save. The expense account comes only from
  // this supplier's previous bill, never from the document.
  function applyParsed(parsed, fileName, template) {
    const f = parsed.fields;
    const val = (x) => (x && x.value != null ? String(x.value) : '');
    const rememberedAccount = template?.coaAccountId && accounts.some(a => a.id === template.coaAccountId)
      ? String(template.coaAccountId) : '';
    setEditing({
      ...blank(),
      supplier_name:  val(f.supplier),
      invoice_number: val(f.invoiceNumber),
      bill_date:      val(f.billDate) || today(),
      due_date:       val(f.dueDate),
      amount:         val(f.amount),
      tps_paid:       val(f.tps),
      tvq_paid:       val(f.tvq),
      quantity:       val(f.quantity),
      unit_cost:      val(f.unitCost),
      coa_account_id: rememberedAccount,
      note:           fileName || '',
    });
    const filled = PICK_FIELDS.map(([k]) => k).filter(k => f[k] && f[k].value != null);
    setRead({
      fields: f, warnings: parsed.warnings, count: filled.length, fileName,
      taxFree: parsed.taxFree, lineItems: parsed.lineItems, accountRemembered: !!rememberedAccount,
    });
    setActiveField(null); setPicked({}); setPicks({}); setPickError('');
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
      const source = Array.isArray(r.items) && r.items.length ? { items: r.items } : String(r.text || '');
      const firstPass = parseBillDocument(source, { ownNames });
      const template = findTemplate(templates, firstPass.fields);
      const parsed = template ? parseBillDocument(source, { template, ownNames }) : firstPass;
      setDoc({ lines: parsed.lines, pages: r.pages || null, positioned: typeof source === 'object' });
      if (applyParsed(parsed, r.fileName, template) === 0) setError(T.readNothing);
    } catch (e) { setError(String(e?.message ?? e)); }
    finally { setBusy(false); }
  }

  const onDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    const filePath = file?.path;
    if (filePath) readFrom(window.api.supplierBills.readDocumentAt(filePath));
  };

  // Clicking a word while a field is chosen puts that value in the field and
  // notes the label beside it, to be remembered for this supplier on save.
  function onPick(li, ti) {
    if (!activeField || !doc?.lines) return;
    const line = doc.lines[li];
    const tok = line?.tokens?.[ti];
    if (!tok) return;
    const kind = FIELD_KINDS[activeField];
    let value = null;
    if (kind === 'amount') {
      let raw = tok.str.replace(/\$/g, '');
      const next = line.tokens[ti + 1]?.str || '';
      if (/^\d{1,3}$/.test(raw) && /^\d{3}[.,]\d{2}\$?$/.test(next)) raw += next.replace(/\$/g, '');
      const n = parseAmount(raw);
      value = n == null ? null : String(n);
    } else if (kind === 'date') {
      value = findDate(line.tokens.slice(ti, ti + 3).map(t => t.str).join(' '));
    } else if (kind === 'code') {
      value = tok.str.replace(/^[#:]+|[,.;:]+$/g, '') || null;
    } else {
      const phrase = line.phrases.find(p => p.tokens.includes(tok));
      value = (phrase?.text || tok.str).trim() || null;
    }
    if (!value) { setPickError(T.pickNotValue); return; }
    const field = activeField;
    setEditing(ed => ({ ...ed, [FORM_KEY[field]]: value }));
    const anchor = anchorForPick(doc.lines, li, ti);
    setPicks(p => {
      const n = { ...p };
      if (anchor) n[field] = anchor; else delete n[field];
      return n;
    });
    setPicked(p => ({ ...p, [field]: { li, ti } }));
    setActiveField(null); setPickError('');
  }

  // A quiet badge on filled fields: read by the reader, picked on the page, or
  // taken from this supplier's remembered layout.
  const mark = (key) => {
    const kind = picked[key] ? 'picked' : read?.fields?.[key]?.learned ? 'learned' : read?.fields?.[key]?.value != null ? 'read' : null;
    if (!kind) return null;
    const tone = kind === 'picked' ? ['#fdba74', 'rgba(249,115,22,0.15)'] : kind === 'learned' ? ['#86efac', 'rgba(34,197,94,0.13)'] : ['#93c5fd', 'rgba(96,165,250,0.13)'];
    const text = kind === 'picked' ? T.badgePicked : kind === 'learned' ? T.badgeLearned : T.badgeRead;
    return (
      <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 600, letterSpacing: '.04em', color: tone[0], background: tone[1], borderRadius: 3, padding: '1px 5px', textTransform: 'none' }}>{text}</span>
    );
  };

  const warnText = (w) =>
    w.code === 'total_mismatch' ? T.warnTotal(money(w.expected), money(w.found))
    : w.code === 'tax_ratio_odd' ? T.warnRatio
    : w.code === 'tax_exceeds_total' ? T.warnTaxOver
    : w.code === 'no_total' ? T.warnNoTotal
    : w.code === 'line_math' ? T.warnLineMath(w.description || '')
    : null;

  async function save() {
    const f = editing;
    if (!f.supplier_name.trim() || !(parseFloat(f.amount) > 0) || !f.coa_account_id) {
      setError(T.required); return;
    }
    setError(''); setBusy(true);
    const payload = {
      supplier_name: f.supplier_name.trim(),
      invoice_number: String(f.invoice_number || '').trim() || null,
      bill_date: f.bill_date || today(),
      due_date: f.due_date || null,
      coa_account_id: parseInt(f.coa_account_id, 10),
      amount: parseFloat(f.amount) || 0,
      tps_paid: parseFloat(f.tps_paid) || 0,
      tvq_paid: parseFloat(f.tvq_paid) || 0,
      quantity: numOrNull(f.quantity),
      unit_cost: numOrNull(f.unit_cost),
      note: f.note || '',
      month_key: (f.bill_date || today()).slice(0, 7),
    };
    try {
      const saved = f.id ? await window.api.supplierBills.update(f.id, payload)
                         : await window.api.supplierBills.create(payload);
      if (read) {
        try {
          const next = rememberBill(templates, { read: read.fields, saved: payload, picks });
          setTemplates(next);
          await window.api?.storage?.set(BILL_TEMPLATES_KEY, JSON.stringify(next));
        } catch (_) { /* remembering a layout must never lose the bill */ }
      }
      setEditing(null); resetReading(); await load();
      // The statement may already carry this purchase: the card was imported and
      // categorized before the bill turned up. Offer to attach that line rather
      // than leave the same expense on the books twice.
      try {
        const billId = saved?.id || f.id;
        if (billId && !saved?.paid) {
          const lines = await window.api.supplierBills.linesForAmount(payload.amount);
          if (lines?.length) setAttach({ billId, lines });
        }
      } catch (_) { /* a courtesy: never stand between the operator and the bill */ }
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

  // Attaching re-points the statement line at accounts payable: whatever it had
  // posted as an expense is reversed first, so the bill is left as the only place
  // the expense is recorded and the line becomes its payment.
  async function attachLine(txId) {
    if (!attach) return;
    setBusy(true); setError('');
    try {
      const r = await window.api.supplierBills.payByBankTx(txId, attach.billId);
      if (r?.ok === false) { setError(String(r.error || '')); return; }
      setAttach(null);
      await load();
    } catch (e) { setError(String(e?.message ?? e)); }
    finally { setBusy(false); }
  }

  async function deleteBill(bill) {
    if (!window.confirm(T.confirmDelete)) return;
    setBusy(true); setError('');
    try {
      const r = await window.api.supplierBills.delete(bill.id);
      if (r?.ok === false) setError(T.errRead);
      if (editing?.id === bill.id) setEditing(null);
      await load();
    } catch (e) { setError(String(e?.message ?? e)); }
    finally { setBusy(false); }
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
  const amountInput = { ...input, textAlign: 'right' };
  const set = (patch) => setEditing(ed => ({ ...ed, ...patch }));

  const form = editing && (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: '1 1 380px', minWidth: 0 }}>
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
          <input style={input} value={editing.supplier_name} onChange={e => set({ supplier_name: e.target.value })} /></div>
        <div><span style={lbl}>{T.invoiceNo}{mark('invoiceNumber')}</span>
          <input style={input} value={editing.invoice_number || ''} onChange={e => set({ invoice_number: e.target.value })} /></div>
        <div><span style={lbl}>{T.billDate}{mark('billDate')}</span>
          <input type="date" style={input} value={editing.bill_date} onChange={e => set({ bill_date: e.target.value })} /></div>
        <div><span style={lbl}>{T.dueDate}{mark('dueDate')}</span>
          <input type="date" style={input} value={editing.due_date || ''} onChange={e => set({ due_date: e.target.value })} /></div>
      </div>

      <div>
        <span style={lbl}>{T.account} *</span>
        <select style={input} value={editing.coa_account_id} onChange={e => set({ coa_account_id: e.target.value })}>
          <option value="">-</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.account_number} · {accName(a)}{(a.itc_pct ?? 100) !== 100 ? ` (${a.itc_pct}%)` : ''}</option>)}
        </select>
        {read?.accountRemembered && <div style={{ fontSize: 11, color: '#86efac', marginTop: 4 }}>{T.accountRemembered}</div>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
        <div><span style={lbl}>{T.amount} *{mark('amount')}</span>
          <input type="number" step="0.01" min="0" style={amountInput} value={editing.amount} onChange={e => set({ amount: e.target.value })} /></div>
        <div><span style={lbl}>{T.tps}{mark('tps')}</span>
          <input type="number" step="0.01" min="0" style={amountInput} value={editing.tps_paid} onChange={e => set({ tps_paid: e.target.value })} /></div>
        <div><span style={lbl}>{T.tvq}{mark('tvq')}</span>
          <input type="number" step="0.01" min="0" style={amountInput} value={editing.tvq_paid} onChange={e => set({ tvq_paid: e.target.value })} /></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
        <div><span style={lbl}>{T.quantity} <span style={{ textTransform: 'none' }}>({T.optional})</span>{mark('quantity')}</span>
          <input type="number" step="any" min="0" style={amountInput} value={editing.quantity ?? ''} onFocus={e => e.target.select()} onChange={e => set({ quantity: e.target.value })} /></div>
        <div><span style={lbl}>{T.unitCost} <span style={{ textTransform: 'none' }}>({T.optional})</span>{mark('unitCost')}</span>
          <input type="number" step="0.0001" min="0" style={amountInput} value={editing.unit_cost ?? ''} onFocus={e => e.target.select()} onChange={e => set({ unit_cost: e.target.value })} /></div>
      </div>

      <div style={{ fontSize: 11, color: read?.taxFree ? '#86efac' : C.muted, lineHeight: 1.45 }}>{read?.taxFree ? T.taxFree : T.taxHint}</div>

      <div><span style={lbl}>{T.note}</span>
        <input style={input} value={editing.note} onChange={e => set({ note: e.target.value })} /></div>

      {error && <div style={{ fontSize: 12, color: '#ef4444' }}>{error}</div>}
      {attach && (
        <div style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.35)', borderRadius: 8, padding: '10px 12px' }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#fdba74' }}>{T.attachTitle}</div>
          <div style={{ fontSize: 11.5, color: C.muted, marginTop: 3, lineHeight: 1.5 }}>{T.attachBody}</div>
          {attach.lines.map(l => (
            <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: C.text }}>{l.transaction_date} · {l.account_name} · {money(Math.abs(l.amount))}</div>
                <div style={{ fontSize: 10.5, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {l.description} · {l.current_account_number ? T.attachNow(l.current_account_number) : T.attachUncat}
                </div>
              </div>
              <button onClick={() => attachLine(l.id)} disabled={busy} style={{
                background: 'none', border: '1px solid rgba(249,115,22,0.45)', borderRadius: 5, color: '#f97316',
                cursor: busy ? 'default' : 'pointer', fontSize: 11, fontWeight: 600, padding: '3px 10px', whiteSpace: 'nowrap',
              }}>{T.attachBtn}</button>
            </div>
          ))}
          <button onClick={() => setAttach(null)} style={{
            background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 11, padding: '6px 0 0',
          }}>{T.attachDismiss}</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={save} disabled={busy} style={btn('linear-gradient(135deg,#f97316,#ea580c)')}>{T.save}</button>
        <button onClick={() => { setEditing(null); setError(''); resetReading(); }} style={btn('#1e2131', C.sub)}>{T.cancel}</button>
      </div>
    </div>
  );

  const documentPanel = editing && doc?.lines?.length > 0 && (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: '1 1 420px', minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{T.docTitle}</div>
      <div style={{ fontSize: 11.5, color: activeField ? '#93c5fd' : C.muted, lineHeight: 1.45 }}>
        {activeField ? T.pickActive(T[LABEL_KEY[activeField]]) : T.pickHint}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {PICK_FIELDS.map(([field, , labelKey]) => {
          const on = activeField === field;
          return (
            <button key={field} type="button" onClick={() => { setPickError(''); setActiveField(on ? null : field); }}
              style={{
                padding: '3px 9px', borderRadius: 12, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                border: `1px solid ${on ? '#3b82f6' : picked[field] ? 'rgba(249,115,22,0.5)' : C.border}`,
                background: on ? 'rgba(59,130,246,0.18)' : 'transparent',
                color: on ? '#93c5fd' : picked[field] ? '#fdba74' : C.sub,
              }}>{T[labelKey]}</button>
          );
        })}
        {activeField && (
          <button type="button" onClick={() => { setActiveField(null); setPickError(''); }}
            style={{ padding: '3px 9px', borderRadius: 12, fontSize: 11, border: 'none', background: 'none', color: C.muted, cursor: 'pointer' }}>{T.pickCancel}</button>
        )}
      </div>
      {pickError && <div style={{ fontSize: 11.5, color: '#f59e0b' }}>{pickError}</div>}
      <DocumentView lines={doc.lines} pages={doc.pages} positioned={doc.positioned}
        activeField={activeField} picked={picked} onPick={onPick} C={C} />
      {Object.keys(picks).length > 0 && <div style={{ fontSize: 11, color: C.muted }}>{T.rememberNote}</div>}
      {read?.lineItems?.length > 1 && (
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, overflow: 'hidden' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.sub, padding: '6px 9px', borderBottom: `1px solid ${C.border}` }}>{T.items}</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={th}>{T.colDesc}</th><th style={{ ...th, textAlign: 'right' }}>{T.colQty}</th>
              <th style={{ ...th, textAlign: 'right' }}>{T.colPrice}</th><th style={{ ...th, textAlign: 'right' }}>{T.colAmount}</th>
            </tr></thead>
            <tbody>
              {read.lineItems.map((it, i) => (
                <tr key={i}>
                  <td style={{ ...td, fontSize: 12 }}>{it.description || '-'}</td>
                  <td style={{ ...num, fontSize: 12 }}>{it.quantity ?? '-'}</td>
                  <td style={{ ...num, fontSize: 12 }}>{it.unitPrice != null ? money(it.unitPrice) : '-'}</td>
                  <td style={{ ...num, fontSize: 12 }}>{money(it.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

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
            <button onClick={() => { setError(''); resetReading(); setEditing(blank()); }}
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
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, marginBottom: 16, display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {form}
          {documentPanel}
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
                      {b.quantity != null && b.unit_cost != null && (
                        <span style={{ color: C.muted, fontSize: 11, marginLeft: 7, fontVariantNumeric: 'tabular-nums' }}>{b.quantity} × {money(b.unit_cost)}</span>
                      )}
                    </td>
                    <td style={{ ...td, color: C.sub, whiteSpace: 'nowrap' }}>{b.bill_date || '-'}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      {b.paid
                        ? <span style={{ fontSize: 11.5, color: '#22c55e' }}>{T.paidOn} {b.payment_date || ''}
                            {b.paid_account_name && <span style={{ color: C.muted, marginLeft: 4 }}>{T.paidVia(b.paid_account_name)}</span>}
                          </span>
                        : due
                          ? <span style={{ fontSize: 11.5, color: due.tone }}>{due.label}</span>
                          : <span style={{ color: C.muted }}>-</span>}
                    </td>
                    <td style={{ ...td, color: C.sub, fontSize: 12 }}>{acct ? `${acct.account_number} · ${accName(acct)}` : '-'}</td>
                    <td style={num}>{money(b.amount)}</td>
                    <td style={{ ...num, whiteSpace: 'nowrap' }}>
                      {!b.paid && (
                        <button onClick={() => { setError(''); resetReading(); setEditing({
                          ...b,
                          amount: String(b.amount ?? ''),
                          tps_paid: String(b.tps_paid ?? ''),
                          tvq_paid: String(b.tvq_paid ?? ''),
                          quantity: b.quantity != null ? String(b.quantity) : '',
                          unit_cost: b.unit_cost != null ? String(b.unit_cost) : '',
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
                      <button onClick={() => deleteBill(b)} disabled={busy} style={{
                        background: 'none', border: '1px solid rgba(239,68,68,0.35)',
                        borderRadius: 5, color: '#ef4444', cursor: busy ? 'default' : 'pointer',
                        fontSize: 11, fontWeight: 600, padding: '3px 9px', marginLeft: 6,
                      }}>{T.delete}</button>
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
