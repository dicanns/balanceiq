-- Stripe webhook event deduplication
-- Prevents double-processing if Stripe retries an event.
CREATE TABLE IF NOT EXISTS pad_webhook_events (
  event_id   TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-purge events older than 7 days (keeps table lean)
CREATE INDEX IF NOT EXISTS idx_pad_webhook_events_ts ON pad_webhook_events (processed_at);
