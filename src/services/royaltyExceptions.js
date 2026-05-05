// Pure functions for royalty exception detection.
// No DB calls, no Electron dependencies.

export const EXCEPTION_TYPES = {
  OVERDUE_PAYMENT: 'overdue_payment',
  MISSING_DATA:    'missing_data',
};

export const EXCEPTION_SEVERITY = {
  INFO:     'info',
  WARNING:  'warning',
  CRITICAL: 'critical',
};

/**
 * Detect royalty payment exceptions from pre-computed overdue invoices.
 *
 * @param {object} opts
 * @param {{ locationId, locName, balance, daysOverdue, period, invoiceRef }[]} opts.overdueInvoices
 * @param {number} [opts.gracePeriod=15] - days after billing date before considered overdue
 * @returns Exception objects ready to persist
 */
export function detectRoyaltyExceptions({ overdueInvoices = [], gracePeriod = 15 }) {
  return overdueInvoices
    .filter(inv => inv.daysOverdue > gracePeriod)
    .map(inv => {
      const extraDays = inv.daysOverdue - gracePeriod;
      const severity = extraDays > 30 ? EXCEPTION_SEVERITY.CRITICAL : EXCEPTION_SEVERITY.WARNING;
      const ref = inv.invoiceRef ? ` — ${inv.invoiceRef}` : '';
      return {
        locationId:    inv.locationId,
        locName:       inv.locName || `Location ${inv.locationId}`,
        exceptionType: EXCEPTION_TYPES.OVERDUE_PAYMENT,
        period:        inv.period || '',
        severity,
        amountAtRisk:  parseFloat(inv.balance) || 0,
        daysOverdue:   inv.daysOverdue,
        invoiceRef:    inv.invoiceRef || null,
        descriptionFr: `Redevance en retard de ${inv.daysOverdue} jour(s)${ref}`,
        descriptionEn: `Royalty overdue by ${inv.daysOverdue} day(s)${ref}`,
      };
    });
}

export function exceptionSeverityColor(severity) {
  if (severity === EXCEPTION_SEVERITY.CRITICAL) return '#ef4444';
  if (severity === EXCEPTION_SEVERITY.WARNING)  return '#f59e0b';
  return '#60a5fa';
}

export function exceptionSeverityLabel(severity, lang) {
  const fr = lang !== 'en';
  if (severity === EXCEPTION_SEVERITY.CRITICAL) return fr ? 'Critique' : 'Critical';
  if (severity === EXCEPTION_SEVERITY.WARNING)  return fr ? 'Avertissement' : 'Warning';
  return fr ? 'Info' : 'Info';
}
