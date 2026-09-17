// The fields of the API configuration that are credentials, and the storage
// keys that are credentials whole. One list, shared by the database layer
// (backups strip them), the main process (encrypts them at rest) and the
// renderer (never sends them to cloud sync).
module.exports = {
  SECRET_CONFIG_FIELDS: ['stripeSecretKey', 'resendKey', 'padWebhookSecret'],
  SECRET_KV_KEYS: ['pos-credentials'],
};
