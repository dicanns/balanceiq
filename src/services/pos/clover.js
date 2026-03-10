// ── CLOVER POS INTEGRATION ────────────────────────────────────────────────
// URL builders and response parsers for Clover API.
// HTTP calls are made in main.js via Electron net module.

import { POS_CONFIG } from '../../config/posConfig.js';

const cfg = POS_CONFIG.clover;

// Build Clover OAuth authorization URL
export function buildCloverAuthUrl() {
  const params = new URLSearchParams({
    client_id:    cfg.appId,
    redirect_uri: cfg.redirectUri,
    state:        Math.random().toString(36).slice(2),
  });
  return `${cfg.authUrl}?${params}`;
}

// Build Clover date range filter (Unix timestamp in ms)
export function buildCloverDateRange(dateStr) {
  const start = new Date(`${dateStr}T00:00:00-05:00`).getTime();
  const end   = new Date(`${dateStr}T23:59:59-05:00`).getTime();
  return { createdTime: `>=${start}`, modifiedTime: `<=${end}` };
}

// Parse Clover orders response into BalanceIQ register format
export function parseCloverOrders(ordersResponse, merchantName = 'Caisse 1') {
  const orders = ordersResponse?.elements ?? [];
  let totalCents    = 0;
  let taxCents      = 0;
  let cashCents     = 0;
  let deliveryCents = 0;

  for (const o of orders) {
    if (o.state !== 'locked') continue; // only paid orders
    const total = o.total ?? 0;
    const tax   = o.taxAmount ?? 0;
    totalCents += (total - tax);
    taxCents   += tax;
    // Cash orders
    if (o.payments?.elements?.some(p => p.tender?.type === 'CASH')) {
      cashCents += (total - tax);
    }
    // Online/delivery orders
    if (o.orderType?.isHidden || o.isDefault === false) {
      deliveryCents += (total - tax);
    }
  }

  const posVentes     = totalCents / 100;
  const posTPS        = Math.round(posVentes * 0.05 * 100) / 100;
  const posTVQ        = Math.round(posVentes * 0.09975 * 100) / 100;
  const posLivraisons = deliveryCents / 100;

  return { name: merchantName, posVentes, posTPS, posTVQ, posLivraisons };
}
