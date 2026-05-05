import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { detectRoyaltyExceptions, exceptionSeverityColor, exceptionSeverityLabel } from '../../services/royaltyExceptions.js';

const UI = {
  fr: {
    title:       'File d\'exceptions — Redevances',
    subtitle:    'Exceptions de paiement détectées et en attente de traitement.',
    scan:        'Analyser',
    scanning:    'Analyse…',
    ack:         'Acquitter',
    resolve:     'Résoudre',
    resolved:    'Résolu',
    acked:       'Acquitté',
    showResolved:'Voir résolus',
    hideResolved:'Masquer résolus',
    empty:       'Aucune exception active.',
    emptyHint:   'Cliquez sur « Analyser » pour détecter les redevances en retard.',
    daysOver:    (n) => `${n} j en retard`,
    atRisk:      'À risque',
    type:        { overdue_payment: 'Paiement en retard', missing_data: 'Données manquantes' },
    summary:     (total, critical, warning) => `${total} exception${total !== 1 ? 's' : ''} — ${critical} critique${critical !== 1 ? 's' : ''}, ${warning} avertissement${warning !== 1 ? 's' : ''}`,
  },
  en: {
    title:       'Exception Queue — Royalties',
    subtitle:    'Detected payment exceptions awaiting action.',
    scan:        'Scan',
    scanning:    'Scanning…',
    ack:         'Acknowledge',
    resolve:     'Resolve',
    resolved:    'Resolved',
    acked:       'Acknowledged',
    showResolved:'Show resolved',
    hideResolved:'Hide resolved',
    empty:       'No active exceptions.',
    emptyHint:   'Click "Scan" to detect overdue royalties.',
    daysOver:    (n) => `${n}d overdue`,
    atRisk:      'At risk',
    type:        { overdue_payment: 'Overdue payment', missing_data: 'Missing data' },
    summary:     (total, critical, warning) => `${total} exception${total !== 1 ? 's' : ''} — ${critical} critical, ${warning} warning${warning !== 1 ? 's' : ''}`,
  },
};

const fmt2 = v => `$${Math.abs(parseFloat(v) || 0).toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function RoyaltyExceptionQueue({ t, lang, facFactures, facClients, locations, royaltyConfig }) {
  const fr = lang !== 'en';
  const T = UI[fr ? 'fr' : 'en'];
  const gracePeriod = royaltyConfig?.gracePeriod ?? 15;

  const [exceptions, setExceptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [actionPending, setActionPending] = useState({});

  const loadExceptions = useCallback(async () => {
    if (!window.api?.royaltyException?.list) { setLoading(false); return; }
    setLoading(true);
    const rows = await window.api.royaltyException.list({ includeResolved: showResolved });
    setExceptions(rows || []);
    setLoading(false);
  }, [showResolved]);

  useEffect(() => { loadExceptions(); }, [loadExceptions]);

  // Compute live overdue invoices (same logic as DelinquencyPanel)
  const overdueInvoices = useMemo(() => {
    const today = new Date();
    const ff = Array.isArray(facFactures) ? facFactures : [];
    const locs = Array.isArray(locations) ? locations : [];
    return ff
      .filter(f => f.tags?.includes('redevance') && (f.statut === 'Envoyée' || f.statut === 'Payée partiellement'))
      .map(f => {
        const invDate = new Date((f.date || new Date().toISOString().slice(0, 10)) + 'T12:00:00');
        const dueDate = new Date(invDate);
        dueDate.setDate(invDate.getDate() + gracePeriod);
        const daysOverdue = Math.max(0, Math.floor((today - dueDate) / 86400000));
        const loc = locs.find(l => l.clientId === f.clientId);
        const balance = (f.total || 0) - (f.paidAmount || 0);
        return {
          locationId: loc?.id ?? f.clientId,
          locName:    loc?.nom || `Client ${f.clientId}`,
          balance,
          daysOverdue,
          period:     f.date?.slice(0, 7) || '',
          invoiceRef: f.numero,
        };
      })
      .filter(inv => inv.daysOverdue > 0);
  }, [facFactures, locations, gracePeriod]);

  async function scan() {
    if (!window.api?.royaltyException?.save) return;
    setScanning(true);
    const detected = detectRoyaltyExceptions({ overdueInvoices, gracePeriod });
    for (const ex of detected) {
      await window.api.royaltyException.save({
        locationId:    ex.locationId,
        exceptionType: ex.exceptionType,
        period:        ex.period,
        severity:      ex.severity,
        descriptionFr: ex.descriptionFr,
        descriptionEn: ex.descriptionEn,
        amountAtRisk:  ex.amountAtRisk,
        daysOverdue:   ex.daysOverdue,
        invoiceRef:    ex.invoiceRef,
      });
    }
    setScanning(false);
    await loadExceptions();
  }

  async function acknowledge(id) {
    if (!window.api?.royaltyException?.acknowledge) return;
    setActionPending(p => ({ ...p, [id]: 'ack' }));
    await window.api.royaltyException.acknowledge(id, 'franchisor');
    setActionPending(p => ({ ...p, [id]: null }));
    await loadExceptions();
  }

  async function resolve(id) {
    if (!window.api?.royaltyException?.resolve) return;
    setActionPending(p => ({ ...p, [id]: 'resolve' }));
    await window.api.royaltyException.resolve(id);
    setActionPending(p => ({ ...p, [id]: null }));
    await loadExceptions();
  }

  const active = exceptions.filter(e => !e.resolved_at);
  const critical = active.filter(e => e.severity === 'critical').length;
  const warning  = active.filter(e => e.severity === 'warning').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{T.title}</div>
          <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>{T.subtitle}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowResolved(v => !v)}
            style={{ padding: '5px 12px', borderRadius: 6, border: `1px solid ${t.cardBorder}`, background: 'none', color: t.textSub, cursor: 'pointer', fontSize: 10, fontWeight: 600 }}
          >
            {showResolved ? T.hideResolved : T.showResolved}
          </button>
          <button
            onClick={scan}
            disabled={scanning}
            style={{ padding: '5px 14px', borderRadius: 6, border: '1px solid rgba(167,139,250,0.35)', background: 'rgba(167,139,250,0.1)', color: '#c4b5fd', cursor: scanning ? 'default' : 'pointer', fontSize: 11, fontWeight: 700, opacity: scanning ? 0.65 : 1 }}
          >
            {scanning ? T.scanning : T.scan}
          </button>
        </div>
      </div>

      {/* Summary bar */}
      {active.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { label: T.summary(active.length, critical, warning), color: critical > 0 ? '#ef4444' : '#f59e0b' },
          ].map((s, i) => (
            <div key={i} style={{ fontSize: 11, fontWeight: 600, color: s.color, padding: '5px 12px', borderRadius: 6, background: `${s.color}10`, border: `1px solid ${s.color}30` }}>
              {s.label}
            </div>
          ))}
        </div>
      )}

      {/* Exception list */}
      {loading ? (
        <div style={{ fontSize: 12, color: t.textMuted, padding: 12 }}>…</div>
      ) : exceptions.length === 0 ? (
        <div style={{ background: t.card, border: `1px solid ${t.cardBorder}`, borderRadius: 10, padding: 28, textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 6 }}>{T.empty}</div>
          <div style={{ fontSize: 11, color: t.textMuted }}>{T.emptyHint}</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {exceptions.map(ex => {
            const color = exceptionSeverityColor(ex.severity);
            const sevLabel = exceptionSeverityLabel(ex.severity, lang);
            const typeLabel = T.type[ex.exception_type] || ex.exception_type;
            const isResolved = !!ex.resolved_at;
            const isAcked    = !!ex.acknowledged_at;
            const pending    = actionPending[ex.id];
            const desc = fr ? ex.description_fr : ex.description_en;
            return (
              <div
                key={ex.id}
                style={{
                  background: isResolved ? t.section : t.card,
                  border: `1px solid ${isResolved ? t.divider : color + '40'}`,
                  borderRadius: 9,
                  padding: '10px 14px',
                  opacity: isResolved ? 0.65 : 1,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  {/* Severity badge */}
                  <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 8, background: `${color}15`, color, whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {sevLabel}
                  </span>

                  {/* Type */}
                  <span style={{ fontSize: 10, fontWeight: 600, color: t.textSub }}>{typeLabel}</span>

                  {/* Location */}
                  <span style={{ fontSize: 12, fontWeight: 700, color: t.text, flex: 1 }}>{ex.location_id}</span>

                  {/* Amount */}
                  {ex.amount_at_risk != null && (
                    <span style={{ fontSize: 11, fontFamily: 'monospace', color, fontWeight: 700 }}>{fmt2(ex.amount_at_risk)}</span>
                  )}

                  {/* Days overdue */}
                  {ex.days_overdue != null && (
                    <span style={{ fontSize: 10, color: t.textMuted, whiteSpace: 'nowrap' }}>{T.daysOver(ex.days_overdue)}</span>
                  )}

                  {/* Status badges */}
                  {isResolved && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 8, background: 'rgba(34,197,94,0.12)', color: '#22c55e' }}>{T.resolved}</span>}
                  {isAcked && !isResolved && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 8, background: 'rgba(99,102,241,0.12)', color: '#818cf8' }}>{T.acked}</span>}

                  {/* Action buttons */}
                  {!isResolved && (
                    <div style={{ display: 'flex', gap: 5 }}>
                      {!isAcked && (
                        <button
                          onClick={() => acknowledge(ex.id)}
                          disabled={!!pending}
                          style={{ padding: '3px 10px', borderRadius: 5, border: '1px solid rgba(99,102,241,0.3)', background: 'none', color: '#818cf8', cursor: pending ? 'default' : 'pointer', fontSize: 10, fontWeight: 600, opacity: pending ? 0.6 : 1 }}
                        >
                          {T.ack}
                        </button>
                      )}
                      <button
                        onClick={() => resolve(ex.id)}
                        disabled={!!pending}
                        style={{ padding: '3px 10px', borderRadius: 5, border: '1px solid rgba(34,197,94,0.3)', background: 'none', color: '#22c55e', cursor: pending ? 'default' : 'pointer', fontSize: 10, fontWeight: 600, opacity: pending ? 0.6 : 1 }}
                      >
                        {T.resolve}
                      </button>
                    </div>
                  )}
                </div>

                {/* Description */}
                {desc && (
                  <div style={{ fontSize: 10, color: t.textMuted, marginTop: 4 }}>{desc}</div>
                )}
                {ex.period && (
                  <div style={{ fontSize: 9, color: t.textDim, marginTop: 2 }}>{ex.period}{ex.invoice_ref ? ` · ${ex.invoice_ref}` : ''}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
