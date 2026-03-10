// ── SQUARE POS INTEGRATION ────────────────────────────────────────────────
// URL builders and response parsers for Square API.
// HTTP calls are made in main.js via Electron net module.

import { POS_CONFIG } from '../../config/posConfig.js';

const cfg = POS_CONFIG.square;

// Build Square OAuth authorization URL
export function buildSquareAuthUrl() {
  const params = new URLSearchParams({
    client_id:    cfg.appId,
    scope:        cfg.scopes.join(' '),
    redirect_uri: cfg.redirectUri,
    state:        Math.random().toString(36).slice(2),
  });
  return `${cfg.authUrl}?${params}`;
}

// Parse Square payments response into BalanceIQ register format
// Assumes Quebec tax rates: TPS 5%, TVQ 9.975%
export function parseSquarePayments(paymentsResponse, locationName = 'Caisse 1') {
  const payments = paymentsResponse?.payments ?? [];
  let totalAmountCents = 0;
  let cashAmountCents  = 0;
  let deliveryCents    = 0;

  for (const p of payments) {
    if (p.status !== 'COMPLETED') continue;
    const amount = p.amount_money?.amount ?? 0; // pre-tax in cents
    totalAmountCents += amount;
    if (p.source_type === 'CASH') cashAmountCents += amount;
    // Delivery orders: source = EXTERNAL with external_details.type = DELIVERY
    if (p.source_type === 'EXTERNAL' &&
        p.external_details?.type === 'DELIVERY') {
      deliveryCents += amount;
    }
  }

  const posVentes     = totalAmountCents / 100;
  const posTPS        = Math.round(posVentes * 0.05 * 100) / 100;
  const posTVQ        = Math.round(posVentes * 0.09975 * 100) / 100;
  const posLivraisons = deliveryCents / 100;

  return { name: locationName, posVentes, posTPS, posTVQ, posLivraisons };
}

// Build date range for Square API (full day in UTC-5 / Eastern)
export function buildSquareDateRange(dateStr) {
  // dateStr: 'YYYY-MM-DD'
  const begin = `${dateStr}T00:00:00-05:00`;
  const end   = `${dateStr}T23:59:59-05:00`;
  return { begin_time: begin, end_time: end };
}
