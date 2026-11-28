-- Numeric settlement totals only. Wallets, supply lists and free-text notes are never public.
ALTER TABLE exp_runs ADD COLUMN net_per_hour INTEGER;
ALTER TABLE exp_runs ADD COLUMN elapsed INTEGER NOT NULL DEFAULT 0;
