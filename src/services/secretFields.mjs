// The fields of the API configuration that are credentials, and the storage
// keys that are credentials whole. One list, shared by the database layer
// (backups strip them), the main process (encrypts them at rest) and the
// renderer (never sends them to cloud sync).
// ESM, so the renderer can import it and the main process can require() it.
export const SECRET_CONFIG_FIELDS = ['stripeSecretKey', 'resendKey', 'padWebhookSecret'];
export const SECRET_KV_KEYS = ['pos-credentials'];
