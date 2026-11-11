import React, { useState, useMemo } from 'react';
import ColumnMapper from './ColumnMapper.jsx';
import { parseOpeningRows, guessOpeningRoles, buildOpeningInvoices, OPENING_ROLES } from '../utils/openingReceivables.mjs';

// Invoicing > Import open invoices: the invoices still owed when a business
// moved to BalanceIQ, from a CSV or cells pasted from a spreadsheet. Each becomes
// a sent invoice with one line (no tax: it was taxed in the old software) that
// can be paid, reminded and aged; the ledger books it against opening balance
// equity, never as revenue.

const UI = {
  fr: {
    title: 'Importer des factures ouvertes',
    intro: "Les factures de vos clients encore impayées dans votre ancien logiciel. Collez-les depuis un tableur (une par ligne : client, no de facture, date, échéance, solde dû) ou choisissez un fichier CSV. Chacune devient une facture envoyée, sans taxe (elle a été déclarée dans l'ancien logiciel), que vous pourrez encaisser, rappeler et voir sur l'état de compte. Pour une facture partiellement payée, entrez seulement le solde qui reste.",
    paste: 'Collez vos lignes ici', file: 'Choisir un fichier CSV', asOf: 'Date de reprise (information)',
    mapTitle: 'Dites-nous quelle colonne est quoi', mapHint: 'Chaque colonne a un rôle. Les lignes en gris ne sont pas importées.', hasHeader: 'La première ligne est un titre', readsAs: 'Se lit', column: 'Colonne',
    roles: { client: 'Client', numero: 'No de facture', date: 'Date', dateEcheance: 'Échéance', montant: 'Solde dû', ignore: 'Ignorer' },
    needRoles: 'Il faut au moins les colonnes Client, No de facture, Date et Solde dû.',
    preview: (n, total) => `${n} facture${n > 1 ? 's' : ''} prête${n > 1 ? 's' : ''}, ${total} au total`,
    newClients: (n) => `${n} client${n > 1 ? 's' : ''} sera${n > 1 ? 'ont' : ''} créé${n > 1 ? 's' : ''} (nom seulement; complétez la fiche ensuite)`,
    errors: 'Lignes qui ne seront pas importées',
    err: { no_client: 'client manquant', no_number: 'no de facture manquant', bad_date: 'date illisible (AAAA-MM-JJ ou JJ/MM/AAAA)', bad_amount: 'solde dû manquant ou nul', duplicate_number: 'ce no de facture existe déjà' },
    row: (r) => `Ligne ${r}`, lineLabel: (num, date) => `Solde d'ouverture - facture ${num}${date ? ' du ' + date : ''}`,
    import: 'Importer', cancel: 'Annuler', done: (n) => `${n} facture${n > 1 ? 's' : ''} importée${n > 1 ? 's' : ''}.`,
    ledgerWarn: (n) => `${n} facture${n > 1 ? 's n\'ont' : ' n\'a'} pas pu être comptabilisée${n > 1 ? 's' : ''} au grand livre; elles sont enregistrées et pourront l'être depuis Livres.`,
    close: 'Fermer', colClient: 'Client', colNumero: 'No', colDate: 'Date', colDue: 'Échéance', colAmount: 'Solde dû', newTag: 'nouveau',
  },
  en: {
    title: 'Import open invoices',
    intro: 'The customer invoices still unpaid in your previous software. Paste them from a spreadsheet (one per line: customer, invoice number, date, due date, balance owed) or choose a CSV file. Each becomes a sent invoice with no tax (it was reported in the old software) that you can collect, remind and show on statements. For a partly paid invoice, enter only the balance left.',
    paste: 'Paste your lines here', file: 'Choose a CSV file', asOf: 'Changeover date (for reference)',
    mapTitle: 'Tell us which column is which', mapHint: 'Each column has a role. Greyed lines are not imported.', hasHeader: 'The first line is a title', readsAs: 'Reads as', column: 'Column',
    roles: { client: 'Customer', numero: 'Invoice no.', date: 'Date', dateEcheance: 'Due date', montant: 'Balance owed', ignore: 'Ignore' },
    needRoles: 'At least the Customer, Invoice no., Date and Balance owed columns are needed.',
    preview: (n, total) => `${n} invoice${n > 1 ? 's' : ''} ready, ${total} in all`,
    newClients: (n) => `${n} customer${n > 1 ? 's' : ''} will be created (name only; fill in the rest later)`,
    errors: 'Lines that will not be imported',
    err: { no_client: 'customer missing', no_number: 'invoice number missing', bad_date: 'unreadable date (YYYY-MM-DD or DD/MM/YYYY)', bad_amount: 'balance owed missing or zero', duplicate_number: 'that invoice number already exists' },
    row: (r) => `Line ${r}`, lineLabel: (num, date) => `Opening balance - invoice ${num}${date ? ' of ' + date : ''}`,
    import: 'Import', cancel: 'Cancel', done: (n) => `${n} invoice${n > 1 ? 's' : ''} imported.`,
    ledgerWarn: (n) => `${n} invoice${n > 1 ? 's' : ''} could not be booked in the ledger; ${n > 1 ? 'they are' : 'it is'} saved and can be posted from Books.`,
    close: 'Close', colClient: 'Customer', colNumero: 'No.', colDate: 'Date', colDue: 'Due', colAmount: 'Balance owed', newTag: 'new',
  },
};

const money = (v) => '$ ' + (Number(v) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export default function OpeningReceivablesModal({ clients = [], saveClients, factures = [], saveFactures, lang = 'fr', t, onClose }) {
  const T = UI[lang] || UI.fr;
  const [text, setText] = useState('');
  const [rows, setRows] = useState([]);
  const [roles, setRoles] = useState([]);
  const [hasHeader, setHasHeader] = useState(true);
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const load = (raw) => {
    const r = parseOpeningRows(raw);
    setRows(r);
    const g = guessOpeningRoles(r);
    setRoles(g.roles); setHasHeader(g.hasHeader); setResult(null);
  };
  const onFile = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => { setText(''); load(String(reader.result || '')); };
    reader.readAsText(f);
  };
  const rolesReady = ['client', 'numero', 'date', 'montant'].every(r => roles.includes(r));
  const plan = useMemo(() => rows.length && rolesReady
    ? buildOpeningInvoices(rows, roles, { hasHeader, clients, factures, asOf, ids: newId, lineLabel: T.lineLabel })
    : { invoices: [], newClients: [], errors: [] }, [rows, roles, hasHeader, clients, factures, asOf, T]);
  const total = plan.invoices.reduce((s, f) => s + (f.lignes[0]?.prixUnitaire || 0), 0);
  const clientName = (id) => plan.newClients.find(c => c.id === id)?.entreprise || clients.find(c => c.id === id)?.entreprise || '';

  const doImport = async () => {
    if (!plan.invoices.length) return;
    setBusy(true);
    try {
      if (plan.newClients.length) saveClients([...clients, ...plan.newClients]);
      let posted = 0, failed = 0;
      const withEntries = [];
      for (const f of plan.invoices) {
        let glEntryId = null;
        try {
          const cents = Math.round((f.lignes[0]?.prixUnitaire || 0) * 100);
          const r = await window.api?.ledger?.invoicePost?.({ invoiceId: f.id, invoiceDate: f.date, subtotalCents: cents, tpsCents: 0, tvqCents: 0, totalCents: cents, taxExempt: true, openingBalance: true });
          if (r?.ok) { glEntryId = r.entryId; posted++; } else failed++;
        } catch (_) { failed++; }
        // An opening balance is frozen as one amount with no tax.
        const frozenCents = Math.round((f.lignes[0]?.prixUnitaire || 0) * 100);
        withEntries.push({ ...f, totauxCents: { sousTotal: frozenCents, tps: 0, tvq: 0, total: frozenCents }, ...(glEntryId ? { glEntryId } : {}) });
      }
      saveFactures([...factures, ...withEntries]);
      setResult({ count: withEntries.length, failed, posted });
    } finally { setBusy(false); }
  };

  const input = { background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 6, color: t.inputText, fontSize: 12, padding: '6px 9px', outline: 'none' };
  const btn = { padding: '6px 14px', borderRadius: 6, border: `1px solid ${t.cardBorder}`, background: t.section, color: t.textSub, cursor: 'pointer', fontWeight: 600, fontSize: 12 };
  const primary = { ...btn, border: 'none', background: 'linear-gradient(135deg,#f97316,#ea580c)', color: '#fff', fontWeight: 700 };
  const C = { text: t.text, sub: t.textSub, muted: t.textMuted, border: t.cardBorder, divider: t.divider, inputBg: t.inputBg };
  const roleOptions = OPENING_ROLES.map(r => ({ value: r, label: T.roles[r] }));

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: t.card, border: `1px solid ${t.cardBorder}`, borderRadius: 12, padding: 18, width: 'min(860px, 100%)', maxHeight: '88vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 700, color: t.text }}>{T.title}</div>
        <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.55 }}>{T.intro}</div>

        {result ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 13, color: '#22c55e', fontWeight: 700 }}>{T.done(result.count)}</div>
            {result.failed > 0 && <div style={{ fontSize: 12, color: '#f59e0b' }}>{T.ledgerWarn(result.failed)}</div>}
            <div><button type="button" onClick={onClose} style={primary}>{T.close}</button></div>
          </div>
        ) : (<>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 320px' }}>
              <textarea id="or-paste" value={text} onChange={e => { setText(e.target.value); load(e.target.value); }} placeholder={T.paste} rows={4}
                style={{ ...input, width: '100%', boxSizing: 'border-box', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11.5, resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ ...btn, textAlign: 'center' }}>{T.file}<input type="file" accept=".csv,.txt,.tsv" onChange={onFile} style={{ display: 'none' }} /></label>
              <label style={{ fontSize: 11, color: t.textMuted }}>{T.asOf}<br /><input id="or-asof" type="date" value={asOf} onChange={e => setAsOf(e.target.value)} style={{ ...input, marginTop: 2 }} /></label>
            </div>
          </div>

          {rows.length > 0 && (
            <ColumnMapper lines={rows.slice(0, 8)} roles={roles} hasHeader={hasHeader} options={roleOptions} onRoles={setRoles} onHasHeader={setHasHeader}
              labels={{ title: T.mapTitle, hint: T.mapHint, hasHeader: T.hasHeader, readsAs: T.readsAs, columnLabel: T.column }}
              warnings={[!rolesReady ? T.needRoles : null]} C={C} />
          )}

          {plan.invoices.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: t.text }}>{T.preview(plan.invoices.length, money(total))}</div>
              {plan.newClients.length > 0 && <div style={{ fontSize: 11.5, color: '#f59e0b' }}>{T.newClients(plan.newClients.length)}</div>}
              <div style={{ overflowX: 'auto', border: `1px solid ${t.cardBorder}`, borderRadius: 8, maxHeight: 260, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560, fontSize: 12 }}>
                  <thead><tr style={{ borderBottom: `1px solid ${t.cardBorder}` }}>
                    {[T.colClient, T.colNumero, T.colDate, T.colDue, T.colAmount].map((h, i) => <th key={h} style={{ textAlign: i === 4 ? 'right' : 'left', padding: '6px 8px', fontSize: 11, color: t.textSub }}>{h}</th>)}
                  </tr></thead>
                  <tbody>{plan.invoices.map(f => (
                    <tr key={f.id} style={{ borderBottom: `1px solid ${t.divider}`, color: t.text }}>
                      <td style={{ padding: '5px 8px' }}>{clientName(f.clientId)}{plan.newClients.some(c => c.id === f.clientId) && <span style={{ marginLeft: 6, fontSize: 10, color: '#f59e0b' }}>{T.newTag}</span>}</td>
                      <td style={{ padding: '5px 8px', fontVariantNumeric: 'tabular-nums' }}>{f.numero}</td>
                      <td style={{ padding: '5px 8px' }}>{f.date}</td><td style={{ padding: '5px 8px' }}>{f.dateEcheance}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(f.lignes[0].prixUnitaire)}</td>
                    </tr>))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {plan.errors.length > 0 && (
            <div style={{ fontSize: 11.5, color: '#ef4444' }}>
              <div style={{ fontWeight: 700, marginBottom: 3 }}>{T.errors}</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>{plan.errors.slice(0, 20).map((e, i) => <li key={i}>{T.row(e.row)} : {T.err[e.error] || e.error}{e.numero ? ` (${e.numero})` : ''}</li>)}</ul>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={doImport} disabled={busy || !plan.invoices.length} style={{ ...primary, opacity: plan.invoices.length ? 1 : 0.5 }}>{T.import}</button>
            <button type="button" onClick={onClose} style={btn}>{T.cancel}</button>
          </div>
        </>)}
      </div>
    </div>
  );
}
