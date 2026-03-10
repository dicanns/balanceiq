// ── POS INTERFACE ─────────────────────────────────────────────────────────
// Standard interface that all POS integrations implement via IPC.
// Actual HTTP calls happen in main.js (main process) for security.
//
// All methods are called via window.api.pos.* IPC channels.
//
// Interface contract:
//
//   pos:startOAuth(posType, shopDomain?)
//     → Opens system browser with OAuth authorization URL
//     → Callback arrives via app deep link: balanceiq://oauth/{posType}?code=xxx
//     → main.js exchanges code for token, fires pos:oauth-result event
//
//   pos:saveManualToken(posType, accessToken, shopDomain?)
//     → Saves a manually-entered access token (sandbox testing / direct API keys)
//     → Returns: { success: boolean, credentials: object, error?: string }
//
//   pos:getCredentials()
//     → Returns all stored POS credentials (without exposing raw tokens to UI)
//     → Returns: { square: {...meta}, clover: {...meta}, shopify: {...meta} }
//
//   pos:disconnect(posType)
//     → Clears stored credentials for that POS system
//     → Returns: { success: boolean }
//
//   pos:fetchDailySales(posType, date)
//     → Fetches sales data for the given date from the POS API
//     → date format: 'YYYY-MM-DD'
//     → Returns: {
//         registers: [{
//           name: string,        // register/location name
//           posVentes: number,   // pre-tax sales total ($)
//           posTPS: number,      // TPS amount ($)
//           posTVQ: number,      // TVQ amount ($)
//           posLivraisons: number // delivery platform orders ($)
//         }],
//         error?: string
//       }
//
//   pos:testConnection(posType)
//     → Verifies the stored token is still valid
//     → Returns: { connected: boolean, merchantName?: string, error?: string }
//
// Credential metadata stored in SQLite under 'pos-credentials' key:
//   {
//     square:  { merchantName, locationCount, connectedAt, hasToken: true },
//     clover:  { merchantName, connectedAt, hasToken: true },
//     shopify: { shopDomain, shopName, connectedAt, hasToken: true }
//   }
