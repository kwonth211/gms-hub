-- Daily quota/status lookups only scan today's receipts, even as history grows.
CREATE INDEX IF NOT EXISTS market_batch_runs_received_at ON market_batch_runs(received_at);
