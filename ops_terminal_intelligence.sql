-- ============================================================================
-- NAIJADROPS OPS-TERMINAL INTELLIGENCE SCHEMA
-- ============================================================================

-- 1. RIDER METRICS: Tracks individual performance and risk
CREATE TABLE IF NOT EXISTS public.rider_metrics (
  rider_id UUID PRIMARY KEY REFERENCES public.riders(id) ON DELETE CASCADE,
  completed_deliveries INTEGER DEFAULT 0,
  cancelled_deliveries INTEGER DEFAULT 0,
  avg_rating NUMERIC(3,2) DEFAULT 5.0,
  fraud_score INTEGER DEFAULT 0, -- 0-100 scale
  acceptance_rate NUMERIC(5,2) DEFAULT 100.0,
  online_minutes INTEGER DEFAULT 0,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. ORDER METRICS: Performance data for logistics analysis
CREATE TABLE IF NOT EXISTS public.order_metrics (
  order_id UUID PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  match_time_seconds INTEGER,
  delivery_time_seconds INTEGER,
  failed_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. FINANCIAL METRICS: Aggregated platform performance
CREATE TABLE IF NOT EXISTS public.financial_metrics (
  id BIGSERIAL PRIMARY KEY,
  total_gmv NUMERIC(12,2) DEFAULT 0,
  platform_revenue NUMERIC(12,2) DEFAULT 0,
  refunds NUMERIC(12,2) DEFAULT 0,
  payout_total NUMERIC(12,2) DEFAULT 0,
  metric_date DATE DEFAULT CURRENT_DATE UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. FRAUD LOGS: Detailed audit trail for risk intelligence
CREATE TABLE IF NOT EXISTS public.fraud_logs (
  id BIGSERIAL PRIMARY KEY,
  entity_id UUID NOT NULL, -- Rider or User ID
  entity_type TEXT CHECK (entity_type IN ('rider', 'user')),
  severity TEXT CHECK (severity IN ('low', 'medium', 'high')),
  reason TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for all new tables
ALTER TABLE public.rider_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fraud_logs ENABLE ROW LEVEL SECURITY;

-- Allow only @naijadrops.tech admins to read/write these tables
CREATE POLICY "Admins manage rider_metrics" ON public.rider_metrics
FOR ALL USING ((auth.jwt()->>'email')::text LIKE '%@naijadrops.tech');

CREATE POLICY "Admins manage order_metrics" ON public.order_metrics
FOR ALL USING ((auth.jwt()->>'email')::text LIKE '%@naijadrops.tech');

CREATE POLICY "Admins manage financial_metrics" ON public.financial_metrics
FOR ALL USING ((auth.jwt()->>'email')::text LIKE '%@naijadrops.tech');

CREATE POLICY "Admins manage fraud_logs" ON public.fraud_logs
FOR ALL USING ((auth.jwt()->>'email')::text LIKE '%@naijadrops.tech');
