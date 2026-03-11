// ── POS CONFIGURATION ──────────────────────────────────────────────────────
// Public credentials only — app secrets stay in main.js (main process only).
// isDev switches URLs between sandbox and production automatically.

const isDev = import.meta.env?.DEV ?? true;

export const POS_ENV = isDev ? 'sandbox' : 'production';

export const POS_CONFIG = {
  square: {
    name: 'Square',
    appId: isDev ? 'sandbox-sq0idb-vKGF3m-aVqnfr2d9YPC9cA' : 'sq0idp-8_k0M7m_P8VYYIYZbbF_nA',
    baseUrl: isDev
      ? 'https://connect.squareupsandbox.com'
      : 'https://connect.squareup.com',
    authUrl: isDev
      ? 'https://connect.squareupsandbox.com/oauth2/authorize'
      : 'https://connect.squareup.com/oauth2/authorize',
    scopes: ['PAYMENTS_READ', 'ORDERS_READ', 'MERCHANT_PROFILE_READ'],
    redirectUri: 'balanceiq://oauth/square',
    apiVersion: '2024-02-28',
  },
  clover: {
    name: 'Clover',
    appId: isDev ? '5GTA1NCXTO5YY' : '5GTA1NCXTO5YY', // update production App ID when ready
    baseUrl: isDev
      ? 'https://sandbox.dev.clover.com'
      : 'https://api.clover.com',
    authUrl: isDev
      ? 'https://sandbox.dev.clover.com/oauth/authorize'
      : 'https://www.clover.com/oauth/authorize',
    redirectUri: 'balanceiq://oauth/clover',
  },
  shopify: {
    name: 'Shopify',
    clientId: 'a728cf71c0b64c5d7e0694567a085d0d',
    scopes: ['read_orders', 'read_products'],
    redirectUri: 'balanceiq://oauth/shopify',
    apiVersion: '2024-01',
  },
  maitred: {
    name: 'Maitre D\'',
    // API key + server URL — no OAuth. User provides their on-premises server URL.
    // Full API docs: https://docs.maitredpos.com
    authType: 'apikey',
    apiKeyOnly: true, // No OAuth flow
    requiresServerUrl: true,
  },
};

export const POS_COMING_SOON = [
  { id: 'toast',       name: 'Toast' },
  { id: 'lightspeed',  name: 'Lightspeed' },
  { id: 'auphan',      name: 'Auphan' },
  { id: 'touchbistro', name: 'TouchBistro' },
  { id: 'cluster',     name: 'Cluster' },
];
