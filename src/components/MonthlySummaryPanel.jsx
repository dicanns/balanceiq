import React, { useState, useEffect, useMemo } from 'react';
import { buildMonthlySummaryHtml } from '../utils/monthlySummaryHtml.mjs';

// Banking > Monthly summary: what each account paid for over a statement or a
// calendar month, grouped by category with the tax, printable as the sheet a
// bookkeeper would otherwise build by hand. The numbers come from
// bankMonthlySummary; this file only chooses the period and shows the result.

const UI = {
  fr: {
    intro: 'Un sommaire par compte, par relevé ou par mois civil : une ligne par catégorie avec le montant avant taxes, la TPS et la TVQ saisies, et le total. Les factures fournisseurs payées comptent sous leur propre catégorie, les chèques sous la leur. Imprimez-le pour votre comptable à la place d\'une feuille montée à la main.',
    account: 'Compte', allAccounts: 'Tous les comptes', periodKind: 'Période', byStatement: 'Par relevé', byMonth: 'Par mois civil',
    statement: 'Relevé', month: 'Mois', show: 'Afficher', print: 'Imprimer', printDetail: 'Imprimer avec le détail des lignes',
    expenses: 'Dépenses et paiements', inflows: 'Dépôts et crédits', transfers: (n, a) => `${n} virement${n > 1 ? 's' : ''} entre vos comptes : ${a} (pas des dépenses)`,
    uncategorized: (n) => `${n} ligne${n > 1 ? 's' : ''} non catégorisée${n > 1 ? 's' : ''} : absente${n > 1 ? 's' : ''} des totaux`,
    colAccount: 'Catégorie', colCount: 'Nb', colNet: 'Avant taxes', colTps: 'TPS', colTvq: 'TVQ', colTotal: 'Total', totals: 'Totaux',
    none: 'Aucune ligne dans cette période.', noStatements: 'Aucun relevé importé pour ce compte.', pick: 'Choisissez un compte et une période.',
    error: (c) => `Erreur : ${c}`,
  },
  en: {
    intro: 'One summary per account, by statement or by calendar month: a row per category with the amount before tax, the GST and QST entered, and the total. Supplier bills paid count under their own category, cheques under theirs. Print it for your accountant instead of a sheet built by hand.',
    account: 'Account', allAccounts: 'All accounts', periodKind: 'Period', byStatement: 'By statement', byMonth: 'By calendar month',
    statement: 'Statement', month: 'Month', show: 'Show', print: 'Print', printDetail: 'Print with line detail',
    expenses: 'Expenses and payments', inflows: 'Deposits and credits', transfers: (n, a) => `${n} transfer${n > 1 ? 's' : ''} between your accounts: ${a} (not expenses)`,
    uncategorized: (n) => `${n} uncategorized line${n > 1 ? 's' : ''}: left out of the totals`,
    colAccount: 'Category', colCount: 'No.', colNet: 'Before tax', colTps: 'GST', colTvq: 'QST', colTotal: 'Total', totals: 'Totals',
    none: 'No lines in this period.', noStatements: 'No statement imported for this account.', pick: 'Choose an account and a period.',
    error: (c) => `Error: ${c}`,
  },
};

const money = (cents) => { const v = Math.round(Number(cents) || 0) / 100; return (v < 0 ? '-' : '') + '$ ' + Math.abs(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); };
const thisMonth = () => new Date().toISOString().slice(0, 7);

export default function MonthlySummaryPanel({ lang = 'fr', C, accounts = [], companyName = '' }) {
  const T = UI[lang] || UI.fr;
  const live = useMemo(() => accounts.filter(a => !a.is_archived), [accounts]);
  const [accountId, setAccountId] = useState('');
  const [kind, setKind] = useState('statement');
  const [statements, setStatements] = useState([]);
  const [statementId, setStatementId] = useState('');
  const [monthKey, setMonthKey] = useState(thisMonth());
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!accountId && live[0]) setAccountId(String(live[0].id)); }, [live, accountId]);
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!accountId) { setStatements([]); return; }
      try {
        const rows = await window.api.bank.statement.list(Number(accountId));
        if (!alive) return;
        const sorted = (rows || []).slice().sort((a, b) => (b.period_end || '').localeCompare(a.period_end || ''));
        setStatements(sorted);
        setStatementId(sorted[0] ? String(sorted[0].id) : '');
      } catch (_) { if (alive) setStatements([]); }
    })();
    return () => { alive = false; };
  }, [accountId]);

  const load = async () => {
    setBusy(true); setError(''); setData(null);
    try {
      const opts = kind === 'statement'
        ? { statementId: Number(statementId) }
        : { monthKey, bankAccountId: accountId === 'all' ? null : Number(accountId) };
      if (kind === 'statement' && !statementId) { setError(T.noStatements); return; }
      const r = await window.api.bank.monthlySummary(opts);
      if (!r?.ok) { setError(T.error(r?.error || '')); return; }
      setData(r);
    } catch (e) { setError(T.error(String(e?.message || e))); }
    finally { setBusy(false); }
  };
  const print = (withDetail) => {
    if (!data) return;
    window.api.pdf.print(buildMonthlySummaryHtml(data, { lang, companyName, withDetail })).catch(() => {});
  };

  const input = { background: C.inputBg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px', fontSize: 12 };
  const btn = { background: C.panel, color: C.sub, border: 'none', borderRadius: 5, padding: '6px 12px', cursor: 'pointer', fontSize: 12 };
  const primary = { ...btn, background: '#0ea5e9', color: '#fff', fontWeight: 600 };
  const th = { textAlign: 'left', padding: '7px 10px', fontWeight: 600, fontSize: 11.5, color: C.sub, whiteSpace: 'nowrap' };
  const td = { padding: '6px 10px', color: C.text, fontSize: 12.5, verticalAlign: 'top' };
  const num = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };
  const name = (r) => r.account_number ? `${r.account_number} · ${lang === 'en' ? (r.name_en || r.name_fr) : (r.name_fr || r.name_en)}` : '-';
  const stLabel = (s) => `${s.period_start} → ${s.period_end}${s.reconciled ? ' ✓' : ''}`;

  const section = (title, sec) => (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>{title}</div>
      {sec.rows.length === 0 ? <div style={{ fontSize: 12, color: C.muted }}>{T.none}</div> : (
        <div style={{ overflowX: 'auto', border: `1px solid ${C.border}`, borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640, background: C.card }}>
            <thead><tr style={{ borderBottom: `1px solid ${C.border}` }}>
              <th style={th}>{T.colAccount}</th><th style={{ ...th, textAlign: 'right' }}>{T.colCount}</th><th style={{ ...th, textAlign: 'right' }}>{T.colNet}</th>
              <th style={{ ...th, textAlign: 'right' }}>{T.colTps}</th><th style={{ ...th, textAlign: 'right' }}>{T.colTvq}</th><th style={{ ...th, textAlign: 'right' }}>{T.colTotal}</th>
            </tr></thead>
            <tbody>{sec.rows.map(r => (
              <tr key={r.account_number} style={{ borderBottom: `1px solid ${C.divider}` }}>
                <td style={td}>{name(r)}{r.itc_pct != null && Number(r.itc_pct) !== 100 && <span style={{ color: C.muted, fontSize: 10.5, marginLeft: 6 }}>({r.itc_pct}%)</span>}</td>
                <td style={num}>{r.count}</td><td style={num}>{money(r.net_cents)}</td><td style={num}>{money(r.tps_cents)}</td><td style={num}>{money(r.tvq_cents)}</td><td style={{ ...num, fontWeight: 700 }}>{money(r.gross_cents)}</td>
              </tr>))}
            </tbody>
            <tfoot><tr style={{ borderTop: `2px solid ${C.border}` }}>
              <td style={{ ...td, fontWeight: 700 }}>{T.totals}</td><td style={{ ...num, fontWeight: 700 }}>{sec.totals.count}</td><td style={{ ...num, fontWeight: 700 }}>{money(sec.totals.net_cents)}</td>
              <td style={{ ...num, fontWeight: 700 }}>{money(sec.totals.tps_cents)}</td><td style={{ ...num, fontWeight: 700 }}>{money(sec.totals.tvq_cents)}</td><td style={{ ...num, fontWeight: 700 }}>{money(sec.totals.gross_cents)}</td>
            </tr></tfoot>
          </table>
        </div>
      )}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.55, maxWidth: 720 }}>{T.intro}</div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div><div style={{ fontSize: 11, color: C.muted, marginBottom: 3 }}>{T.account}</div>
          <select id="ms-account" style={input} value={accountId} onChange={e => setAccountId(e.target.value)}>
            {kind === 'month' && <option value="all">{T.allAccounts}</option>}
            {live.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select></div>
        <div><div style={{ fontSize: 11, color: C.muted, marginBottom: 3 }}>{T.periodKind}</div>
          <select id="ms-kind" style={input} value={kind} onChange={e => { setKind(e.target.value); if (e.target.value === 'statement' && accountId === 'all') setAccountId(live[0] ? String(live[0].id) : ''); }}>
            <option value="statement">{T.byStatement}</option><option value="month">{T.byMonth}</option>
          </select></div>
        {kind === 'statement' ? (
          <div><div style={{ fontSize: 11, color: C.muted, marginBottom: 3 }}>{T.statement}</div>
            <select id="ms-statement" style={input} value={statementId} onChange={e => setStatementId(e.target.value)}>
              {statements.length === 0 ? <option value="">{T.noStatements}</option> : statements.map(s => <option key={s.id} value={s.id}>{stLabel(s)}</option>)}
            </select></div>
        ) : (
          <div><div style={{ fontSize: 11, color: C.muted, marginBottom: 3 }}>{T.month}</div>
            <input id="ms-month" type="month" style={input} value={monthKey} onChange={e => setMonthKey(e.target.value)} /></div>
        )}
        <button type="button" onClick={load} disabled={busy} style={primary}>{T.show}</button>
        {data && <button type="button" onClick={() => print(false)} style={btn}>{T.print}</button>}
        {data && <button type="button" onClick={() => print(true)} style={btn}>{T.printDetail}</button>}
      </div>
      {error && <div style={{ fontSize: 12, color: '#ef4444' }}>{error}</div>}
      {!data && !error && <div style={{ fontSize: 12, color: C.muted }}>{T.pick}</div>}
      {data && data.accounts.length === 0 && <div style={{ fontSize: 12, color: C.muted }}>{T.none}</div>}
      {data && data.accounts.map(a => (
        <div key={a.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 14px' }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{a.name} <span style={{ fontWeight: 400, color: C.muted, fontSize: 12 }}>· {data.period.from} → {data.period.to}</span></div>
          {section(T.expenses, a.expenses)}
          {section(T.inflows, a.inflows)}
          {a.transfers.count > 0 && <div style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>{T.transfers(a.transfers.count, money(a.transfers.cents))}</div>}
          {a.uncategorized.length > 0 && (
            <div style={{ fontSize: 12, color: '#f59e0b', marginTop: 8 }}>{T.uncategorized(a.uncategorized.length)}
              <ul style={{ margin: '4px 0 0', paddingLeft: 18, color: C.sub }}>{a.uncategorized.map((u, i) => <li key={i}>{u.date} · {u.description} · {money(u.cents)}</li>)}</ul>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
