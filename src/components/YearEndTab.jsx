import React, { useState, useEffect, useCallback } from 'react';

// Books > Year end. Three things, in the order a year end happens:
//   1. when the company's fiscal year ends;
//   2. each fiscal year, its profit, what stands in the way of closing it, and
//      Close / Reopen (closing locks every month of it);
//   3. the bookkeeper's figures at a changeover date, typed per account, and
//      the one adjustment that makes BalanceIQ's balance sheet equal his.

const UI = {
  fr: {
    fyeTitle: "Fin d'exercice",
    fyeHint: "La date où se termine l'exercice financier de l'entreprise. Elle décide où commence le « résultat de l'exercice » au bilan.",
    fyeNotSet: "Pas encore définie : le 31 décembre est utilisé.",
    fyeSave: 'Enregistrer',
    fyeSaved: 'Enregistré.',
    yearsTitle: 'Exercices',
    yearsHint: "Fermer un exercice verrouille chacun de ses mois : plus rien ne peut y être ajouté, annulé ou recatégorisé. Son bénéfice devient alors des bénéfices non répartis au bilan.",
    colYear: 'Exercice', colProfit: 'Bénéfice', colStatus: 'État',
    stClosed: 'Fermé', stCurrent: 'En cours', stEnded: 'Terminé, ouvert',
    closeBtn: "Fermer l'exercice", reopenBtn: 'Rouvrir',
    closeConfirm: (a, b) => `Fermer l'exercice du ${a} au ${b}? Chacun de ses mois sera verrouillé.`,
    closeAnyway: (list) => `Il reste à régler : ${list}. Fermer quand même?`,
    reopenAsk: "Pourquoi rouvrir cet exercice? (la raison est conservée au journal d'audit)",
    blDrafts: (n) => `${n} écriture(s) en brouillon`,
    blStatements: (items) => `relevé(s) non rapproché(s) : ${items.join(', ')}`,
    blLines: (n) => `${n} ligne(s) bancaire(s) à catégoriser`,
    nothingBlocks: 'Rien ne bloque',
    openTitle: "Soldes d'ouverture du comptable",
    openHint: "Pour passer aux livres officiels dans BalanceIQ : entrez, compte par compte, les soldes des états financiers de votre comptable à la date de fin d'exercice. Une seule écriture ajuste chaque compte de la différence; le reste va aux bénéfices non répartis. Le compte « Solde d'ouverture » est vidé du même coup. Laissez vide un compte que vous ne voulez pas toucher.",
    openDate: 'Au',
    openLoad: 'Afficher les comptes',
    colAccount: 'Compte', colBiq: 'BalanceIQ', colTheirs: 'États financiers', colDiff: 'Ajustement',
    reRow: 'Bénéfices non répartis après ajustement',
    controlNote: "Compte de contrôle : il doit correspondre à la liste des factures (clients) ou des factures fournisseurs ouvertes. Mieux vaut entrer les factures manquantes que l'ajuster ici.",
    postBtn: "Comptabiliser l'ajustement",
    postConfirm: (n, d) => `Comptabiliser une écriture qui ajuste ${n} compte(s) au ${d}?`,
    posted: 'Ajustement comptabilisé.',
    nothing: 'Aucun écart : rien à comptabiliser.',
  },
  en: {
    fyeTitle: 'Fiscal year end',
    fyeHint: "The date the company's fiscal year ends. It decides where \"this year's profit\" starts on the balance sheet.",
    fyeNotSet: 'Not set yet: December 31 is used.',
    fyeSave: 'Save',
    fyeSaved: 'Saved.',
    yearsTitle: 'Fiscal years',
    yearsHint: "Closing a year locks every month in it: nothing can be added, reversed or re-categorized there any more. Its profit then becomes retained earnings on the balance sheet.",
    colYear: 'Fiscal year', colProfit: 'Profit', colStatus: 'Status',
    stClosed: 'Closed', stCurrent: 'In progress', stEnded: 'Ended, open',
    closeBtn: 'Close the year', reopenBtn: 'Reopen',
    closeConfirm: (a, b) => `Close the fiscal year ${a} to ${b}? Every month in it will be locked.`,
    closeAnyway: (list) => `Still to settle: ${list}. Close anyway?`,
    reopenAsk: 'Why reopen this year? (the reason is kept in the audit log)',
    blDrafts: (n) => `${n} draft entr${n > 1 ? 'ies' : 'y'}`,
    blStatements: (items) => `statement(s) not reconciled: ${items.join(', ')}`,
    blLines: (n) => `${n} bank line${n > 1 ? 's' : ''} to categorize`,
    nothingBlocks: 'Nothing in the way',
    openTitle: "Your bookkeeper's opening balances",
    openHint: "To make BalanceIQ the official books: enter, account by account, the balances from your bookkeeper's financial statements at the year-end date. One entry moves each account by the difference; what is left goes to retained earnings. Opening balance equity is cleared at the same time. Leave an account blank to leave it as it is.",
    openDate: 'As of',
    openLoad: 'Show the accounts',
    colAccount: 'Account', colBiq: 'BalanceIQ', colTheirs: 'Financial statements', colDiff: 'Adjustment',
    reRow: 'Retained earnings after the adjustment',
    controlNote: 'Control account: it should match the list of open customer invoices or supplier bills. Better to enter the missing invoices than to adjust it here.',
    postBtn: 'Post the adjustment',
    postConfirm: (n, d) => `Post one entry adjusting ${n} account(s) as of ${d}?`,
    posted: 'Adjustment posted.',
    nothing: 'No differences: nothing to post.',
  },
};

const MONTHS = {
  fr: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};

const card = { background: '#11131c', border: '1px solid #2d3148', borderRadius: 10, padding: '14px 16px', marginBottom: 16 };
const h = { fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 };
const hint = { fontSize: 11.5, color: '#94a3b8', lineHeight: 1.5, marginBottom: 10 };
const inputS = { background: '#161822', border: '1px solid #2d3148', borderRadius: 5, color: '#e2e8f0', fontSize: 13, padding: '5px 8px', outline: 'none' };
const btn = (bg) => ({ padding: '5px 12px', borderRadius: 6, border: 'none', background: bg, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' });
const th = { textAlign: 'left', fontSize: 11, color: '#64748b', fontWeight: 600, padding: '6px 8px', textTransform: 'uppercase', letterSpacing: '.4px' };
const td = { padding: '6px 8px', fontSize: 13, color: '#cbd5e1', borderBottom: '1px solid #1e2131' };
const num = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

export default function YearEndTab({ lang = 'fr', errors = {} }) {
  const t = UI[lang] || UI.fr;
  const months = MONTHS[lang] || MONTHS.fr;
  const money = (c) => ((Number(c) || 0) / 100).toLocaleString(lang === 'en' ? 'en-CA' : 'fr-CA', { style: 'currency', currency: 'CAD' });
  const api = window.api?.ledger;
  // Main-process errors arrive as codes; say them in words.
  const say = (e) => {
    const raw = String(e?.message || e || '');
    const code = Object.keys(errors).find(k => raw.includes(k));
    const v = code ? errors[code] : null;
    return typeof v === 'function' ? v() : (v || raw);
  };

  const [fye, setFye] = useState({ month: 12, day: 31, set: false });
  const [fyeMsg, setFyeMsg] = useState('');
  const [years, setYears] = useState([]);
  const [error, setError] = useState('');
  const [asOf, setAsOf] = useState('');
  const [targets, setTargets] = useState({});
  const [preview, setPreview] = useState(null);
  const [openMsg, setOpenMsg] = useState('');

  const loadYears = useCallback(async () => {
    if (!api?.fiscalYear) return;
    try {
      const r = await api.fiscalYear.list();
      setYears(r?.years || []);
      if (r?.fiscalYearEnd) setFye(r.fiscalYearEnd);
      // The changeover date defaults to the last year that has ended.
      const ended = (r?.years || []).find(y => y.ended);
      setAsOf(a => a || (ended ? ended.end : ''));
    } catch (e) { setError(say(e)); }
  }, [api]);
  useEffect(() => { loadYears(); }, [loadYears]);

  const saveFye = async () => {
    setFyeMsg(''); setError('');
    try { setFye(await api.fiscalYear.set({ month: fye.month, day: fye.day })); setFyeMsg(t.fyeSaved); loadYears(); }
    catch (e) { setError(say(e)); }
  };

  const blockerText = (b) => b.code === 'drafts' ? t.blDrafts(b.count) : b.code === 'statements_open' ? t.blStatements(b.items) : t.blLines(b.count);

  const close = async (y) => {
    if (!window.confirm(t.closeConfirm(y.start, y.end))) return;
    try {
      let r = await api.fiscalYear.close(y.end, {});
      if (!r?.ok && r?.blockers?.length) {
        if (r.blockers.some(b => b.code === 'drafts')) { setError(r.blockers.map(blockerText).join(' · ')); return; }
        if (!window.confirm(t.closeAnyway(r.blockers.map(blockerText).join(' · ')))) return;
        r = await api.fiscalYear.close(y.end, { force: true });
      }
      loadYears();
    } catch (e) { setError(say(e)); }
  };

  const reopen = async (y) => {
    const reason = window.prompt(t.reopenAsk);
    if (!reason || !reason.trim()) return;
    try { await api.fiscalYear.reopen(y.end, reason.trim()); loadYears(); }
    catch (e) { setError(say(e)); }
  };

  const loadPreview = async (tg = targets) => {
    if (!asOf) return;
    setOpenMsg(''); setError('');
    try { setPreview(await api.openingBalances.preview(asOf, tg)); }
    catch (e) { setError(say(e)); }
  };
  const setTarget = (acct, v) => {
    const next = { ...targets, [acct]: v };
    setTargets(next);
    loadPreview(next);
  };
  const post = async () => {
    if (!preview?.changes) { setOpenMsg(t.nothing); return; }
    if (!window.confirm(t.postConfirm(preview.changes, asOf))) return;
    try {
      const r = await api.openingBalances.post(asOf, targets);
      setOpenMsg(r?.nothingToDo ? t.nothing : t.posted);
      setTargets({});
      setPreview(r?.preview || null);
      loadYears();
    } catch (e) { setError(say(e)); }
  };

  const name = (r) => lang === 'en' ? (r.nameEn || r.nameFr) : (r.nameFr || r.nameEn);

  return (
    <div>
      {error && <div style={{ ...card, borderColor: '#7f1d1d', color: '#fca5a5', fontSize: 12.5 }}>{error}</div>}

      <div style={card}>
        <div style={h}>{t.fyeTitle}</div>
        <div style={hint}>{t.fyeHint}{!fye.set ? ` ${t.fyeNotSet}` : ''}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="number" min="1" max="31" value={fye.day} onChange={e => setFye(f => ({ ...f, day: e.target.value }))} style={{ ...inputS, width: 64 }} />
          <select value={fye.month} onChange={e => setFye(f => ({ ...f, month: Number(e.target.value) }))} style={inputS}>
            {months.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <button onClick={saveFye} style={btn('#f97316')}>{t.fyeSave}</button>
          {fyeMsg && <span style={{ fontSize: 12, color: '#22c55e' }}>{fyeMsg}</span>}
        </div>
      </div>

      <div style={card}>
        <div style={h}>{t.yearsTitle}</div>
        <div style={hint}>{t.yearsHint}</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>{t.colYear}</th><th style={{ ...th, textAlign: 'right' }}>{t.colProfit}</th><th style={th}>{t.colStatus}</th><th style={th} /></tr></thead>
          <tbody>
            {years.map(y => (
              <tr key={y.end}>
                <td style={td}>{y.start} {'→'} {y.end}</td>
                <td style={{ ...num, color: y.netIncomeCents < 0 ? '#ef4444' : '#e2e8f0' }}>{money(y.netIncomeCents)}</td>
                <td style={td}>
                  <span style={{ fontWeight: 700, color: y.status === 'closed' ? '#22c55e' : y.ended ? '#f59e0b' : '#94a3b8' }}>
                    {y.status === 'closed' ? `✓ ${t.stClosed}` : y.ended ? t.stEnded : t.stCurrent}
                  </span>
                  {y.status !== 'closed' && y.ended && (
                    <div style={{ fontSize: 11, color: y.blockers.length ? '#f59e0b' : '#64748b', marginTop: 2 }}>
                      {y.blockers.length ? y.blockers.map(blockerText).join(' · ') : t.nothingBlocks}
                    </div>
                  )}
                </td>
                <td style={{ ...td, textAlign: 'right' }}>
                  {y.status === 'closed'
                    ? <button onClick={() => reopen(y)} style={btn('#374151')}>{t.reopenBtn}</button>
                    : y.ended && <button onClick={() => close(y)} style={btn('#16a34a')}>{t.closeBtn}</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={card}>
        <div style={h}>{t.openTitle}</div>
        <div style={hint}>{t.openHint}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 13, color: '#94a3b8' }}>{t.openDate}</span>
          <input type="date" value={asOf} onChange={e => { setAsOf(e.target.value); setPreview(null); }} style={inputS} />
          <button onClick={() => loadPreview()} disabled={!asOf} style={btn('#2563eb')}>{t.openLoad}</button>
        </div>
        {preview && (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={th}>{t.colAccount}</th>
                <th style={{ ...th, textAlign: 'right' }}>{t.colBiq}</th>
                <th style={{ ...th, textAlign: 'right' }}>{t.colTheirs}</th>
                <th style={{ ...th, textAlign: 'right' }}>{t.colDiff}</th>
              </tr></thead>
              <tbody>
                {preview.rows.filter(r => r.accountNumber !== '3100').map(r => (
                  <tr key={r.accountNumber}>
                    <td style={td}>
                      <span style={{ color: '#64748b', marginRight: 8 }}>{r.accountNumber}</span>{name(r)}
                      {r.control && <div style={{ fontSize: 10.5, color: '#a1791f', marginTop: 2 }}>{t.controlNote}</div>}
                    </td>
                    <td style={num}>{money(r.haveCents)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <input type="number" step="0.01" value={targets[r.accountNumber] ?? ''} placeholder={(r.haveCents / 100).toFixed(2)}
                        onChange={e => setTarget(r.accountNumber, e.target.value)} style={{ ...inputS, width: 120, textAlign: 'right' }} />
                    </td>
                    <td style={{ ...num, color: r.adjustDrCents ? '#fbbf24' : '#475569' }}>{r.wantCents !== r.haveCents ? money(r.wantCents - r.haveCents) : '-'}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ ...td, fontWeight: 700, color: '#e2e8f0', borderTop: '2px solid #2d3148' }}>3100 {t.reRow}</td>
                  <td style={{ ...num, borderTop: '2px solid #2d3148' }}>{money(preview.retainedEarningsBeforeCents)}</td>
                  <td style={{ ...num, fontWeight: 700, color: '#e2e8f0', borderTop: '2px solid #2d3148' }}>{money(preview.retainedEarningsAfterCents)}</td>
                  <td style={{ ...num, borderTop: '2px solid #2d3148' }} />
                </tr>
              </tbody>
            </table>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12 }}>
              <button onClick={post} style={btn('#f97316')}>{t.postBtn}</button>
              {openMsg && <span style={{ fontSize: 12, color: '#22c55e' }}>{openMsg}</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
