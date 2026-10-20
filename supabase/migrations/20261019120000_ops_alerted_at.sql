-- Marks that ops has been alerted (Telegram) about an order. Set by the first caller only, so several
-- code paths that call /api/dispatch can never produce duplicate alerts.
alter table public.orders add column if not exists ops_alerted_at timestamptz;
