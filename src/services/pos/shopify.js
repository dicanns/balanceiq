// ── SHOPIFY POS INTEGRATION ───────────────────────────────────────────────
// URL builders and response parsers for Shopify Admin API.
// HTTP calls are made in main.js via Electron net module.

import { POS_CONFIG } from '../../config/posConfig.js';

const cfg = POS_CONFIG.shopify;

// Build Shopify OAuth authorization URL (requires shop domain)
export function buildShopifyAuthUrl(shopDomain) {
  const shop = shopDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const params = new URLSearchParams({
    client_id:    cfg.clientId,
    scope:        cfg.scopes.join(','),
    redirect_uri: cfg.redirectUri,
    state:        Math.random().toString(36).slice(2),
  });
  return `https://${shop}/admin/oauth/authorize?${params}`;
}

// Parse Shopify orders response into BalanceIQ register format
// Filters for POS orders only (source_name = "pos")
export function parseShopifyOrders(ordersResponse, shopName = 'Shopify POS') {
  const orders = (ordersResponse?.orders ?? [])
    .filter(o => o.source_name === 'pos' && o.financial_status === 'paid');

  let totalNet      = 0;
  let cashNet       = 0;
  let deliveryCents = 0;

  for (const o of orders) {
    const net = parseFloat(o.subtotal_price ?? 0);
    totalNet += net;
    const isCash = (o.payment_gateway_names ?? []).some(g =>
      g.toLowerCase().includes('cash')
    );
    if (isCash) cashNet += net;
  }

  const posVentes     = Math.round(totalNet * 100) / 100;
  const posTPS        = Math.round(posVentes * 0.05 * 100) / 100;
  const posTVQ        = Math.round(posVentes * 0.09975 * 100) / 100;
  const posLivraisons = deliveryCents / 100;

  return { name: shopName, posVentes, posTPS, posTVQ, posLivraisons };
}

// Build Shopify date range params
export function buildShopifyDateRange(dateStr) {
  return {
    created_at_min: `${dateStr}T00:00:00-05:00`,
    created_at_max: `${dateStr}T23:59:59-05:00`,
  };
}
