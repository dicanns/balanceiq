import React, { useState, useEffect, useCallback } from 'react';

const fmt = (cents) =>
  new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format((cents ?? 0) / 100);

const fmtDate = (s) => s ? s.slice(0, 10) : '—';

function dk(d) { return d.toISOString().slice(0, 10); }

function periodRange(period, customFrom, customTo) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (period === 'today')     return [dk(today), dk(today)];
  if (period === 'yesterday') { const d = new Date(today); d.setDate(d.getDate() - 1); return [dk(d), dk(d)]; }
  if (period === 'week')      { const d = new Date(today); d.setDate(d.getDate() - 6); return [dk(d), dk(today)]; }
  if (period === 'month')     { const d = new Date(today); d.setDate(d.getDate() - 29); return [dk(d), dk(today)]; }
  if (period === 'custom')    return [customFrom || dk(today), customTo || dk(today)];
  return [dk(today), dk(today)];
}

function KpiCard({ label, value, sub, color, t }) {
  return (
    <div style={{ background: t.card, border: `1px solid ${t.cardBorder}`, borderRadius: 9, padding: '12px 14px', minWidth: 0 }}>
      <div style={{ fontSize: 9.5, color: t.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: color || t.text, fontFamily: "'Satoshi',-apple-system,BlinkMacSystemFont,sans-serif", fontVariantNumeric: 'tabular-nums' }}>
        {value ?? '—'}
      </div>
      {sub && <div style={{ fontSize: 10, color: t.textMuted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function ListSection({ title, items, renderRow, emptyMsg, t }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ background: t.card, border: `1px solid ${t.cardBorder}`, borderRadius: 9, overflow: 'hidden' }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', cursor: 'pointer', userSelect: 'none' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: t.text }}>{title}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {items.length > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(249,115,22,0.15)', color: '#f97316', borderRadius: 10, padding: '1px 7px' }}>{items.length}</span>
          )}
          <span style={{ fontSize: 12, color: t.textMuted }}>{open ? '▾' : '▸'}</span>
        </span>
      </div>
      {open && (
        <div style={{ borderTop: `1px solid ${t.cardBorder}` }}>
          {items.length === 0
            ? <div style={{ padding: '10px 14px', fontSize: 11.5, color: t.textMuted }}>{emptyMsg}</div>
            : items.map((item, i) => (
                <div key={i} style={{ padding: '8px 14px', borderBottom: i < items.length - 1 ? `1px solid ${t.divider}` : 'none', fontSize: 11.5 }}>
                  {renderRow(item)}
                </div>
              ))
          }
        </div>
      )}
    </div>
  );
}

function exportCsv(kpis, lists, fr) {
  const rows = [];
  rows.push(fr ? 'Indicateurs de performance' : 'KPI Report');
  rows.push(`${fr ? 'Période' : 'Period'},${kpis.dateFrom} → ${kpis.dateTo}`);
  rows.push('');
  rows.push(fr ? 'Indicateur,Valeur' : 'Metric,Value');
  rows.push(`${fr ? 'Sessions analysées' : 'Sessions analyzed'},${kpis.sessionCount ?? 0}`);
  rows.push(`${fr ? 'Délai moyen fermeture (min)' : 'Avg close time (min)'},${kpis.avgTimeToCloseMinutes ?? '—'}`);
  rows.push(`${fr ? 'Fermetures avec dérogation' : 'Closes with overrides'},${kpis.overrideCount}`);
  rows.push(`${fr ? 'Fermetures réouvertes' : 'Reopened closes'},${kpis.reopenCount}`);
  rows.push(`${fr ? 'Conformité liste (%)' : 'Checklist compliance (%)'},${kpis.checklistCompliancePct ?? '—'}`);
  rows.push(`${fr ? 'Dossiers complets (%)' : 'Evidence completeness (%)'},${kpis.evidenceCompletenessPct ?? '—'}`);
  rows.push(`${fr ? 'Délai vérif. dépôts (j)' : 'Deposit verif. lag (d)'},${kpis.depositVerifLagDays ?? '—'}`);
  rows.push('');

  if (lists.unapproved.length > 0) {
    rows.push(fr ? 'Non-approuvées (>1j)' : 'Unapproved (>1 day)');
    rows.push(`${fr ? 'Date' : 'Date'},${fr ? 'Quart' : 'Shift'},${fr ? 'Soumis le' : 'Submitted at'}`);
    lists.unapproved.forEach(s => rows.push(`${s.date_key},${s.shift_key || '—'},${s.submitted_at?.slice(0, 16) || '—'}`));
    rows.push('');
  }

  if (lists.topVarianceCashiers.length > 0) {
    rows.push(fr ? 'Caisses avec écarts fréquents' : 'Top variance cashiers');
    rows.push(`${fr ? 'Caissier' : 'Cashier'},${fr ? 'Total fermetures' : 'Total closes'},${fr ? 'Avec écart' : 'With variance'}`);
    lists.topVarianceCashiers.forEach(r => rows.push(`${r.cashier_name},${r.total_closures},${r.variance_count}`));
    rows.push('');
  }

  const blob = new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fermeture-conformite-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const PERIODS = ['today', 'yesterday', 'week', 'month', 'custom'];

export default function CloseComplianceTab({ t, lang, canUse, activePlan }) {
  const fr = lang !== 'en';
  const [period, setPeriod] = useState('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [kpis, setKpis] = useState(null);
  const [lists, setLists] = useState(null);
  const [loading, setLoading] = useState(false);

  const [dateFrom, dateTo] = periodRange(period, customFrom, customTo);

  const today = dk(new Date());
  const thirtyDaysAgo = dk(new Date(Date.now() - 30 * 86400000));
  const rangeExceeds30 = dateFrom < thirtyDaysAgo || dateTo < dateFrom;
  const isProGated = rangeExceeds30 && !canUse('reportingAdvanced');

  const load = useCallback(async () => {
    if (!window.api?.closeAssurance?.compliance) return;
    setLoading(true);
    try {
      const [k, l] = await Promise.all([
        window.api.closeAssurance.compliance.kpis({ dateFrom, dateTo }),
        window.api.closeAssurance.compliance.lists({ dateFrom, dateTo }),
      ]);
      setKpis(k);
      setLists(l);
    } catch (e) {
      console.error('compliance load failed', e);
    }
    setLoading(false);
  }, [dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const periodLabel = (p) => ({
    today:     fr ? "Aujourd'hui" : 'Today',
    yesterday: fr ? 'Hier'        : 'Yesterday',
    week:      fr ? 'Cette semaine' : 'This week',
    month:     fr ? 'Ce mois'     : 'This month',
    custom:    fr ? 'Personnalisé': 'Custom',
  }[p]);

  const varColor = (pct) => pct == null ? t.textMuted : pct >= 90 ? '#16a34a' : pct >= 70 ? '#f59e0b' : '#ef4444';

  const sessionRow = (s) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, color: t.text }}>
      <span style={{ fontWeight: 600 }}>{s.date_key}</span>
      {s.shift_key && <span style={{ color: '#a78bfa', fontSize: 10.5 }}>{s.shift_key}</span>}
      <span style={{ color: t.textMuted, fontSize: 10.5 }}>
        {s.submitted_at ? s.submitted_at.slice(0, 16).replace('T', ' ') : s.status}
      </span>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: t.text }}>
          {fr ? 'Conformité de fermeture' : 'Close Compliance'}
        </div>
        <button
          onClick={() => exportCsv(kpis || {}, lists || { unapproved:[], topVarianceCashiers:[], withWarnings:[], reopened:[], topVarianceRegisters:[], missingEvidence:[], missingDepositVerif:[] }, fr)}
          disabled={!kpis}
          style={{ padding: '5px 14px', borderRadius: 7, border: '1px solid rgba(249,115,22,0.3)', background: 'rgba(249,115,22,0.08)', color: '#f97316', fontSize: 11, fontWeight: 700, cursor: kpis ? 'pointer' : 'not-allowed', opacity: kpis ? 1 : 0.5 }}
        >
          {fr ? 'Exporter CSV' : 'Export CSV'}
        </button>
      </div>

      {/* Period selector */}
      <div style={{ background: t.card, border: `1px solid ${t.cardBorder}`, borderRadius: 9, padding: '10px 14px' }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: period === 'custom' ? 10 : 0 }}>
          {PERIODS.map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={{
              padding: '4px 12px', borderRadius: 20, fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
              border: `1px solid ${period === p ? '#f97316' : t.cardBorder}`,
              background: period === p ? 'rgba(249,115,22,0.12)' : t.section,
              color: period === p ? '#f97316' : t.textSub,
            }}>
              {periodLabel(p)}
            </button>
          ))}
        </div>
        {period === 'custom' && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} max={today}
              style={{ background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 5, color: t.text, fontSize: 12, padding: '4px 7px' }} />
            <span style={{ color: t.textMuted, fontSize: 11 }}>→</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} max={today}
              style={{ background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 5, color: t.text, fontSize: 12, padding: '4px 7px' }} />
          </div>
        )}
        {isProGated && (
          <div style={{ marginTop: 8, padding: '7px 10px', borderRadius: 7, background: 'rgba(249,115,22,0.07)', border: '1px solid rgba(249,115,22,0.25)', fontSize: 11.5, color: '#f97316', fontWeight: 600 }}>
            {fr ? 'Les plages de plus de 30 jours nécessitent le plan Pro.' : 'Date ranges over 30 days require the Pro plan.'}
          </div>
        )}
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: 24, fontSize: 12, color: t.textMuted }}>
          {fr ? 'Chargement...' : 'Loading...'}
        </div>
      )}

      {!loading && kpis && (
        <>
          {/* KPI grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
            <KpiCard t={t} label={fr ? 'Sessions analysées' : 'Sessions analyzed'} value={kpis.sessionCount} color={t.text} />
            <KpiCard t={t} label={fr ? 'Délai moyen fermeture' : 'Avg close time'}
              value={kpis.avgTimeToCloseMinutes != null ? kpis.avgTimeToCloseMinutes : '—'}
              sub={kpis.avgTimeToCloseMinutes != null ? (fr ? 'minutes' : 'minutes') : null}
              color={kpis.avgTimeToCloseMinutes == null ? t.textMuted : kpis.avgTimeToCloseMinutes > 60 ? '#f59e0b' : '#16a34a'} />
            <KpiCard t={t} label={fr ? 'Avec dérogation' : 'With overrides'} value={kpis.overrideCount}
              color={kpis.overrideCount > 0 ? '#f59e0b' : '#16a34a'} />
            <KpiCard t={t} label={fr ? 'Réouvertures' : 'Reopened closes'} value={kpis.reopenCount}
              color={kpis.reopenCount > 0 ? '#f59e0b' : '#16a34a'} />
            <KpiCard t={t} label={fr ? 'Conformité liste' : 'Checklist compliance'}
              value={kpis.checklistCompliancePct != null ? `${kpis.checklistCompliancePct}%` : '—'}
              color={varColor(kpis.checklistCompliancePct)} />
            <KpiCard t={t} label={fr ? 'Dossiers complets' : 'Evidence completeness'}
              value={kpis.evidenceCompletenessPct != null ? `${kpis.evidenceCompletenessPct}%` : '—'}
              color={varColor(kpis.evidenceCompletenessPct)} />
            <KpiCard t={t} label={fr ? 'Délai vérif. dépôts' : 'Deposit verif. lag'}
              value={kpis.depositVerifLagDays != null ? kpis.depositVerifLagDays : '—'}
              sub={kpis.depositVerifLagDays != null ? (fr ? 'jours' : 'days') : null}
              color={kpis.depositVerifLagDays == null ? t.textMuted : kpis.depositVerifLagDays > 3 ? '#ef4444' : '#16a34a'} />
          </div>

          {/* Variance by cashier inline summary */}
          {kpis.varianceByCashier.length > 0 && (
            <div style={{ background: t.card, border: `1px solid ${t.cardBorder}`, borderRadius: 9, padding: '10px 14px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: t.textSub, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                {fr ? 'Fréquence écart par caissier' : 'Variance frequency by cashier'}
              </div>
              {kpis.varianceByCashier.map((r, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, padding: '3px 0', borderBottom: i < kpis.varianceByCashier.length - 1 ? `1px solid ${t.divider}` : 'none' }}>
                  <span style={{ color: t.text, fontWeight: 600 }}>{r.cashier_name}</span>
                  <span style={{ color: r.with_variance > 0 ? '#f59e0b' : '#16a34a', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                    {r.with_variance}/{r.total}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Drill-down lists */}
      {!loading && lists && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <ListSection t={t}
            title={fr ? 'Non-approuvées (>1 jour)' : 'Unapproved closes (>1 day)'}
            items={lists.unapproved}
            emptyMsg={fr ? 'Aucune fermeture en attente.' : 'No pending closes.'}
            renderRow={sessionRow} />
          <ListSection t={t}
            title={fr ? 'Fermetures avec avertissements' : 'Closes with warnings'}
            items={lists.withWarnings}
            emptyMsg={fr ? 'Aucun avertissement.' : 'No warnings.'}
            renderRow={s => (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, color: t.text }}>
                <span style={{ fontWeight: 600 }}>{s.date_key}</span>
                {s.shift_key && <span style={{ color: '#a78bfa', fontSize: 10.5 }}>{s.shift_key}</span>}
                <span style={{ color: '#f59e0b', fontSize: 10.5, fontWeight: 600 }}>⚠ {s.warning_count} {fr ? 'avert.' : 'warn.'}</span>
              </div>
            )} />
          <ListSection t={t}
            title={fr ? 'Réouvertes après approbation' : 'Reopened after approval'}
            items={lists.reopened}
            emptyMsg={fr ? 'Aucune réouverture.' : 'No reopened closes.'}
            renderRow={s => (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, color: t.text }}>
                <span style={{ fontWeight: 600 }}>{s.date_key}</span>
                {s.shift_key && <span style={{ color: '#a78bfa', fontSize: 10.5 }}>{s.shift_key}</span>}
                <span style={{ color: '#ef4444', fontSize: 10.5, fontWeight: 600 }}>{fr ? 'Réouverte' : 'Reopened'}</span>
              </div>
            )} />
          <ListSection t={t}
            title={fr ? 'Caissiers — écarts fréquents' : 'Top variance cashiers'}
            items={lists.topVarianceCashiers}
            emptyMsg={fr ? 'Aucun écart répété.' : 'No repeated variances.'}
            renderRow={r => (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, color: t.text }}>
                <span style={{ fontWeight: 600 }}>{r.cashier_name}</span>
                <span style={{ color: t.textMuted, fontSize: 10.5 }}>
                  {r.variance_count}/{r.total_closures} {fr ? 'fermetures' : 'closes'} — {fr ? 'moy.' : 'avg'} {fmt(r.avg_abs_variance_cents)}
                </span>
              </div>
            )} />
          <ListSection t={t}
            title={fr ? 'Registres — écarts fréquents' : 'Top variance registers'}
            items={lists.topVarianceRegisters}
            emptyMsg={fr ? 'Aucun écart répété.' : 'No repeated variances.'}
            renderRow={r => (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, color: t.text }}>
                <span style={{ fontWeight: 600 }}>{r.register_key}</span>
                <span style={{ color: t.textMuted, fontSize: 10.5 }}>
                  {r.variance_count}/{r.total_closures} — {fr ? 'moy.' : 'avg'} {fmt(r.avg_abs_variance_cents)}
                </span>
              </div>
            )} />
          <ListSection t={t}
            title={fr ? 'Dossiers de fermeture manquants' : 'Missing close evidence'}
            items={lists.missingEvidence}
            emptyMsg={fr ? 'Tous les dossiers sont complets.' : 'All close packets complete.'}
            renderRow={sessionRow} />
          <ListSection t={t}
            title={fr ? 'Dépôts non vérifiés' : 'Missing deposit verification'}
            items={lists.missingDepositVerif}
            emptyMsg={fr ? 'Tous les dépôts vérifiés.' : 'All deposits verified.'}
            renderRow={r => (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, color: t.text }}>
                <span style={{ fontWeight: 600 }}>{r.date_key}</span>
                <span style={{ color: '#f59e0b', fontVariantNumeric: 'tabular-nums' }}>{fmt(r.total_drop_cents)}</span>
              </div>
            )} />
        </div>
      )}

      {!loading && !kpis && (
        <div style={{ textAlign: 'center', padding: 32, fontSize: 12, color: t.textMuted }}>
          {fr ? 'Aucune donnée pour cette période.' : 'No data for this period.'}
        </div>
      )}
    </div>
  );
}
