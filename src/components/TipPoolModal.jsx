import React, { useState, useEffect, useMemo, useCallback } from 'react';

// ─── helpers ────────────────────────────────────────────────────────────────
const fmt = (n) =>(n ?? 0).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' });
const round2 = (n) => Math.round(n * 100) / 100;

// ─── translations ────────────────────────────────────────────────────────────
const TR = {
  fr: {
    title:         'Répartition des pourboires',
    totalTips:     'Total des pourboires ($)',
    method:        'Méthode de répartition',
    methodEqual:   'Parts égales',
    methodHours:   'Proportionnel aux heures',
    methodPoints:  'Système de points',
    methodPct:     'Pourcentage manuel',
    employees:     'Employés',
    name:          'Nom',
    hours:         'Heures',
    points:        'Points',
    pct:           '%',
    share:         'Part',
    addEmp:        '+ Ajouter',
    remove:        '',
    calculate:     'Calculer',
    confirm:       'Confirmer & enregistrer',
    cancel:        'Annuler',
    print:         'Imprimer',
    finalized:     'Enregistré',
    history:       'Historique',
    noHistory:     'Aucun historique',
    date:          'Date',
    total:         'Total',
    loadEmp:       'Charger employés du jour',
    loadRoster:    'Charger la liste du personnel',
    managerIncl:   'Inclure gérant',
    notes:         'Notes',
    pctSum:        'Le total des % doit égaler 100.',
    distribution:  'Distribution',
    remainder:     'Reste (arrondi)',
    configTitle:   'Configuration par défaut',
    configSaved:   'Configuration sauvegardée',
  },
  en: {
    title:         'Tip Pool Distribution',
    totalTips:     'Total tips ($)',
    method:        'Distribution method',
    methodEqual:   'Equal shares',
    methodHours:   'Hours-weighted',
    methodPoints:  'Point system',
    methodPct:     'Manual percentages',
    employees:     'Employees',
    name:          'Name',
    hours:         'Hours',
    points:        'Points',
    pct:           '%',
    share:         'Share',
    addEmp:        '+ Add',
    remove:        '',
    calculate:     'Calculate',
    confirm:       'Confirm & save',
    cancel:        'Cancel',
    print:         'Print',
    finalized:     'Saved',
    history:       'History',
    noHistory:     'No history',
    date:          'Date',
    total:         'Total',
    loadEmp:       "Load today's employees",
    loadRoster:    'Load from staff roster',
    managerIncl:   'Include manager',
    notes:         'Notes',
    pctSum:        'Percentages must sum to 100.',
    distribution:  'Distribution',
    remainder:     'Remainder (rounding)',
    configTitle:   'Default configuration',
    configSaved:   'Configuration saved',
  },
};

// ─── calculation engine ───────────────────────────────────────────────────────
function calcDistributions(method, totalTips, employees) {
  if (!totalTips || totalTips<= 0 || employees.length === 0) return [];
  const total = parseFloat(totalTips) || 0;

  let shares = [];

  if (method === 'equal') {
    const each = round2(total / employees.length);
    shares = employees.map(() =>each);

  } else if (method === 'hours') {
    const totalHours = employees.reduce((s, e) => s + (parseFloat(e.hours) || 0), 0);
    if (totalHours === 0) return employees.map(e => ({ ...e, share: 0 }));
    shares = employees.map(e => round2((parseFloat(e.hours) || 0) / totalHours * total));

  } else if (method === 'points') {
    const totalPoints = employees.reduce((s, e) => s + (parseFloat(e.points) || 0), 0);
    if (totalPoints === 0) return employees.map(e => ({ ...e, share: 0 }));
    shares = employees.map(e => round2((parseFloat(e.points) || 0) / totalPoints * total));

  } else if (method === 'pct') {
    const totalPct = employees.reduce((s, e) => s + (parseFloat(e.pct) || 0), 0);
    shares = employees.map(e => round2((parseFloat(e.pct) || 0) / 100 * total));
  }

  // Fix rounding remainder on first employee
  const allocated = shares.reduce((s, v) => s + v, 0);
  const remainder = round2(total - allocated);
  if (shares.length > 0 && remainder !== 0) shares[0] = round2(shares[0] + remainder);

  return employees.map((e, i) => ({ ...e, share: shares[i] ?? 0 }));
}

// ─── mini theme ───────────────────────────────────────────────────────────────
function useTheme() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem('balanceiq-theme');
    setDark(saved === 'dark');
  }, []);
  return dark ? {
    bg: '#161920', card: '#1e2028', border: '#2a2d3a', text: '#e5e7eb',
    muted: '#9ca3af', input: '#252830', accent: '#f97316',
  } : {
    bg: '#FBF8F4', card: '#ffffff', border: '#e5e7eb', text: '#1f2937',
    muted: '#6b7280', input: '#f9fafb', accent: '#f97316',
  };
}

// ─── TipPoolModal ─────────────────────────────────────────────────────────────
export default function TipPoolModal({ lang = 'fr', date, dailyEmployees = [], staffRoster = [], onClose }) {
  const T = TR[lang] || TR.fr;
  const th = useTheme();

  const [method, setMethod] = useState('equal');
  const [totalTips, setTotalTips] = useState('');
  const [employees, setEmployees] = useState([]);
  const [results, setResults] = useState(null);
  const [saved, setSaved] = useState(false);
  const [notes, setNotes] = useState('');
  const [tab, setTab] = useState('calc'); // 'calc' | 'history' | 'config'
  const [history, setHistory] = useState([]);
  const [cfgSaved, setCfgSaved] = useState(false);
  const [pctError, setPctError] = useState(false);

  // Config state
  const [cfgMethod, setCfgMethod] = useState('equal');
  const [cfgManagerIncl, setCfgManagerIncl] = useState(false);
  const [cfgNotes, setCfgNotes] = useState('');

  // Load config + session + history on mount
  useEffect(() => {
    async function load() {
      try {
        const cfg = await window.api.tipPool.config.get();
        if (cfg) {
          setCfgMethod(cfg.method || 'equal');
          setCfgManagerIncl(!!cfg.manager_included);
          setCfgNotes(cfg.notes || '');
          setMethod(cfg.method || 'equal');
        }
      } catch (e) {}

      try {
        const existing = await window.api.tipPool.session.get(date);
        if (existing) {
          setTotalTips(String(existing.total_tips || ''));
          setMethod(existing.method_used || 'equal');
          const dists = JSON.parse(existing.distributions || '[]');
          setEmployees(dists.map(d => ({ name: d.name, hours: d.hours || 0, points: d.points || 0, pct: d.pct || 0, share: d.share || 0 })));
          setResults(dists);
          setSaved(!!existing.finalized);
          setNotes(existing.finalized_by || '');
        }
      } catch (e) {}

      try {
        const today = date;
        const from = today.slice(0, 7) + '-01';
        const recs = await window.api.tipPool.session.getRange(from, today);
        setHistory(recs || []);
      } catch (e) {}
    }
    load();
  }, [date]);

  // Load today's employees from daily data
  const loadDailyEmployees = useCallback(() => {
    if (!dailyEmployees || dailyEmployees.length === 0) return;
    setEmployees(dailyEmployees.map(e => ({
      name: e.name || '',
      hours: e.hours || 0,
      points: 1,
      pct: 0,
    })));
    setResults(null);
    setSaved(false);
  }, [dailyEmployees]);

  // Load from the Staff & Payroll roster, with hours pre-filled from today's labour entries
  const loadFromRoster = useCallback(() => {
    if (!staffRoster || staffRoster.length === 0) return;
    setEmployees(staffRoster.map(r => {
      const worked = dailyEmployees.find(e => e.empId === r.id || e.name === r.name);
      return {
        name: r.name || '',
        hours: worked ? (parseFloat(worked.hours) || 0) : 0,
        points: 1,
        pct: 0,
      };
    }));
    setResults(null);
    setSaved(false);
  }, [staffRoster, dailyEmployees]);

  // Redistribute pct evenly when employees change in pct mode
  useEffect(() => {
    if (method === 'pct' && employees.length > 0) {
      const each = round2(100 / employees.length);
      setEmployees(prev => prev.map((e, i) => ({
        ...e,
        pct: i< prev.length - 1 ? each : round2(100 - each * (prev.length - 1)),
      })));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method]);

  const pctSum = useMemo(() =>employees.reduce((s, e) => s + (parseFloat(e.pct) || 0), 0), [employees]);

  function calculate() {
    if (method === 'pct' && Math.abs(pctSum - 100) > 0.01) {
      setPctError(true);
      return;
    }
    setPctError(false);
    const dists = calcDistributions(method, totalTips, employees);
    setResults(dists);
    setEmployees(dists);
    setSaved(false);
  }

  async function confirmSave() {
    if (!results) return;
    const session = {
      date,
      total_tips: parseFloat(totalTips) || 0,
      method_used: method,
      distributions: JSON.stringify(results.map(r => ({
        name: r.name, hours: r.hours || 0, points: r.points || 0,
        pct: r.pct || 0, share: r.share || 0,
      }))),
      finalized: 1,
      finalized_by: notes,
    };
    await window.api.tipPool.session.save(session);
    setSaved(true);
    // refresh history
    try {
      const from = date.slice(0, 7) + '-01';
      const recs = await window.api.tipPool.session.getRange(from, date);
      setHistory(recs || []);
    } catch (e) {}
  }

  async function saveConfig() {
    await window.api.tipPool.config.save({
      method: cfgMethod,
      manager_included: cfgManagerIncl ? 1 : 0,
      roles: '[]',
      notes: cfgNotes,
    });
    setCfgSaved(true);
    setTimeout(() => setCfgSaved(false), 2000);
  }

  function addEmployee() {
    setEmployees(prev => [...prev, { name: '', hours: 0, points: 1, pct: 0 }]);
    setResults(null);
    setSaved(false);
  }

  function removeEmployee(i) {
    setEmployees(prev => prev.filter((_, idx) => idx !== i));
    setResults(null);
    setSaved(false);
  }

  function updateEmployee(i, field, val) {
    setEmployees(prev => prev.map((e, idx) => idx === i ? { ...e, [field]: val } : e));
    setResults(null);
    setSaved(false);
  }

  function doPrint() {
    const rows = (results || employees).map(e =>
      `<tr><td>${e.name}</td><td>${e.hours || '—'}</td><td>${fmt(e.share)}</td></tr>`
    ).join('');
    const html = `<html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;padding:20px;font-size:13px}
      h2{color:#f97316}table{width:100%;border-collapse:collapse;margin-top:12px}
      th,td{border:1px solid #ccc;padding:6px 10px;text-align:left}
      th{background:#f3f4f6}tfoot td{font-weight:bold;background:#f9fafb}</style></head><body><h2>${T.title}</h2><p><strong>${T.date}:</strong>${date} &nbsp;<strong>${T.totalTips}:</strong>${fmt(parseFloat(totalTips)||0)}</p><p><strong>${T.method}:</strong>${T['method'+method.charAt(0).toUpperCase()+method.slice(1)]||method}</p><table><thead><tr><th>${T.name}</th><th>${T.hours}</th><th>${T.share}</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="2">${T.total}</td><td>${fmt(parseFloat(totalTips)||0)}</td></tr></tfoot></table>${notes ? `<p><em>${notes}</em></p>` : ''}</body></html>`;
    if (window.api?.pdf?.print) window.api.pdf.print(html);
    else { const w = window.open('', '_blank'); w.document.write(html); w.print(); }
  }

  // ── styles ──────────────────────────────────────────────────────────────────
  const overlay = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
  };
  const modal = {
    background: th.card, border: `1px solid ${th.border}`, borderRadius: 12,
    width: '100%', maxWidth: 540, maxHeight: '90vh', overflowY: 'auto',
    boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
  };
  const header = {
    background: `linear-gradient(135deg, #f97316, #ea580c)`,
    borderRadius: '12px 12px 0 0', padding: '14px 20px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  };
  const inp = {
    background: th.input, border: `1px solid ${th.border}`, borderRadius: 6,
    color: th.text, fontSize: 13, padding: '6px 10px', outline: 'none', width: '100%',
  };
  const btn = (primary) => ({
    padding: '8px 18px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 13,
    background: primary ? '#f97316' : th.input, color: primary ? '#fff' : th.text,
    fontWeight: primary ? 600 : 400,
  });
  const tabBtn = (active) => ({
    padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12,
    background: active ? '#f97316' : th.input, color: active ? '#fff' : th.muted, fontWeight: active ? 600 : 400,
  });
  const methodBtns = ['equal', 'hours', 'points', 'pct'].map(m => ({
    key: m, label: T['method' + m.charAt(0).toUpperCase() + m.slice(1)],
    active: method === m,
  }));

  const needsHours   = method === 'hours';
  const needsPoints  = method === 'points';
  const needsPct     = method === 'pct';

  return (<div style={overlay} onClick={e =>{ if (e.target === e.currentTarget) onClose(); }}><div style={modal}>{/* Header */}<div style={header}><span style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>{T.title}</span><button onClick={onClose} style={{ background:'none', border: 'none', color: '#fff', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button></div>{/* Tabs */}<div style={{ display: 'flex', gap: 6, padding: '12px 20px 0', borderBottom: `1px solid ${th.border}` }}>{[['calc', T.distribution], ['history', T.history], ['config', T.configTitle]].map(([id, label]) => (<button key={id} style={tabBtn(tab === id)} onClick={() =>setTab(id)}>{label}</button>))}</div><div style={{ padding: 20 }}>{/* ── CALC TAB ── */}
          {tab === 'calc' && (<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>{/* Total tips input */}<div><label style={{ display: 'block', fontSize: 12, color: th.muted, marginBottom: 4 }}>{T.totalTips}</label><input type="number" min="0" step="0.01" style={{ ...inp, fontSize: 18, fontWeight: 700 }}
                  value={totalTips} onChange={e =>{ setTotalTips(e.target.value); setResults(null); setSaved(false); }}
                  placeholder="0.00" /></div>{/* Method selector */}<div><label style={{ display: 'block', fontSize: 12, color: th.muted, marginBottom: 6 }}>{T.method}</label><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{methodBtns.map(({ key, label, active }) => (<button key={key} style={tabBtn(active)} onClick={() =>{ setMethod(key); setResults(null); setSaved(false); }}>
                      {label}</button>))}</div></div>{/* Employees */}<div><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}><label style={{ fontSize: 12, color: th.muted }}>{T.employees}</label><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{staffRoster.length > 0 && (<button style={{ ...btn(false), fontSize: 11, padding: '4px 10px'}} onClick={loadFromRoster}>{T.loadRoster}</button>)}
 {dailyEmployees.length > 0 && (<button style={{ ...btn(false), fontSize: 11, padding:'4px 10px'}} onClick={loadDailyEmployees}>{T.loadEmp}</button>)}<button style={{ ...btn(false), fontSize: 11, padding:'4px 10px' }} onClick={addEmployee}>{T.addEmp}</button></div></div>{/* Grid header */}<div style={{ display: 'grid', gridTemplateColumns: `2fr ${needsHours||needsPoints||needsPct ? '80px' : ''} 80px 28px`.replace(/\s+/g, ' ').trim(), gap: 6, marginBottom: 4 }}><span style={{ fontSize: 11, color: th.muted }}>{T.name}</span>{needsHours  &&<span style={{ fontSize: 11, color: th.muted, textAlign: 'center' }}>{T.hours}</span>}
                  {needsPoints &&<span style={{ fontSize: 11, color: th.muted, textAlign: 'center' }}>{T.points}</span>}
                  {needsPct    &&<span style={{ fontSize: 11, color: th.muted, textAlign: 'center' }}>{T.pct}</span>}<span style={{ fontSize: 11, color: th.muted, textAlign: 'right' }}>{T.share}</span><span /></div>{employees.map((e, i) => (<div key={i} style={{ display: 'grid', gridTemplateColumns: `2fr ${needsHours||needsPoints||needsPct ? '80px' : ''} 80px 28px`.replace(/\s+/g, ' ').trim(), gap: 6, marginBottom: 5, alignItems: 'center' }}><input style={inp} value={e.name} placeholder={T.name}
                      onChange={ev =>updateEmployee(i, 'name', ev.target.value)} />
                    {needsHours && (<input type="number" min="0" step="0.5" style={{ ...inp, textAlign: 'center' }}
                        value={e.hours || ''} placeholder="0" onChange={ev =>updateEmployee(i, 'hours', ev.target.value)} />
                    )}
                    {needsPoints && (<input type="number" min="0" step="1" style={{ ...inp, textAlign: 'center' }}
                        value={e.points || ''} placeholder="1" onChange={ev =>updateEmployee(i, 'points', ev.target.value)} />
                    )}
                    {needsPct && (<input type="number" min="0" max="100" step="1" style={{ ...inp, textAlign: 'center' }}
                        value={e.pct || ''} placeholder="0" onChange={ev =>updateEmployee(i, 'pct', ev.target.value)} />
                    )}<span style={{ textAlign: 'right', fontSize: 13, fontWeight: 600, color: e.share >0 ? '#16a34a' : th.muted }}>
                      {results ? fmt(e.share) : '—'}</span><button onClick={() =>removeEmployee(i)} style={{ background: 'none', border: 'none', color: th.muted, cursor: 'pointer', fontSize: 14, padding: 0 }}>
                      {T.remove}</button></div>))}

                {needsPct && (<div style={{ fontSize: 11, color: Math.abs(pctSum - 100) < 0.01 ? '#16a34a' : '#ef4444', textAlign: 'right', marginTop: 2 }}>{T.pct} total: {round2(pctSum)}%
                    {pctError && ` — ${T.pctSum}`}</div>)}</div>{/* Notes */}<div><label style={{ display: 'block', fontSize: 12, color: th.muted, marginBottom: 4 }}>{T.notes}</label><input style={inp} value={notes} onChange={e =>setNotes(e.target.value)} placeholder="..." /></div>{/* Actions */}<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}><button style={btn(false)} onClick={onClose}>{T.cancel}</button>{results && !saved && (<button style={btn(false)} onClick={doPrint}>{T.print}</button>)}
                {results && saved && (<button style={{ ...btn(false), color: '#16a34a' }} onClick={doPrint}>{T.print}</button>)}
                {!results && (<button style={btn(true)} onClick={calculate}
                    disabled={!totalTips || employees.length === 0}>{T.calculate}</button>)}
                {results && !saved && (<button style={btn(true)} onClick={confirmSave}>{T.confirm}</button>)}
                {saved && (<span style={{ padding: '8px 14px', color: '#16a34a', fontWeight: 700, fontSize: 13 }}>{T.finalized}</span>)}</div></div>)}

 {/* ── HISTORY TAB ── */}
 {tab ==='history' && (<div>{history.length === 0
                ?<p style={{ color: th.muted, fontSize: 13 }}>{T.noHistory}</p>: history.map((h, i) => {
                  let dists = [];
                  try { dists = JSON.parse(h.distributions || '[]'); } catch (e) {}
                  return (<div key={i} style={{ border: `1px solid ${th.border}`, borderRadius: 8, padding: 12, marginBottom: 10 }}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}><span style={{ fontWeight: 600, fontSize: 13, color: th.text }}>{h.date}</span><span style={{ fontWeight: 700, color: '#f97316' }}>{fmt(h.total_tips)}</span></div>{dists.map((d, j) => (<div key={j} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: th.muted, padding: '2px 0' }}><span>{d.name || '—'}</span><span style={{ color: '#16a34a', fontWeight: 600 }}>{fmt(d.share)}</span></div>))}
                      {h.finalized_by && (<div style={{ fontSize: 11, color: th.muted, marginTop: 4, fontStyle: 'italic' }}>{h.finalized_by}</div>)}</div>);
                })
              }</div>)}

          {/* ── CONFIG TAB ── */}
          {tab === 'config' && (<div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}><div><label style={{ display: 'block', fontSize: 12, color: th.muted, marginBottom: 6 }}>{T.method}</label><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{['equal', 'hours', 'points', 'pct'].map(m => (<button key={m} style={tabBtn(cfgMethod === m)} onClick={() =>setCfgMethod(m)}>
                      {T['method' + m.charAt(0).toUpperCase() + m.slice(1)]}</button>))}</div></div><label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: th.text, cursor: 'pointer' }}><input type="checkbox" checked={cfgManagerIncl} onChange={e =>setCfgManagerIncl(e.target.checked)} />
                {T.managerIncl}</label><div><label style={{ display: 'block', fontSize: 12, color: th.muted, marginBottom: 4 }}>{T.notes}</label><input style={inp} value={cfgNotes} onChange={e =>setCfgNotes(e.target.value)} placeholder="..." /></div><div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button style={btn(true)} onClick={saveConfig}>{T.confirm}</button>{cfgSaved &&<span style={{ padding: '8px 0', color: '#16a34a', fontSize: 12 }}>{T.configSaved}</span>}</div></div>)}</div></div></div>
  );
}
