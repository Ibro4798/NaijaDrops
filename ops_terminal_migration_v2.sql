-- NAIJADROPS MASTER BLUEPRINT V2 - MIGRATION 1
-- Upgrading the 'riders' table for the Dispatch and Fraud Engines

-- 1. Add Telemetry, Fraud, and Ops Fields
ALTER TABLE public.riders
  ADD COLUMN IF NOT EXISTS acceptance_rate DECIMAL(5,2) DEFAULT 100.00,
  ADD COLUMN IF NOT EXISTS fraud_score INTEGER DEFAULT 0 CHECK (fraud_score >= 0 AND fraud_score <= 100),
  ADD COLUMN IF NOT EXISTS total_deliveries INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS orders_completed_today INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS current_lat DECIMAL(10,8),
  ADD COLUMN IF NOT EXISTS current_lng DECIMAL(11,8);

-- 2. Create index on last_seen and operational_status for ultra-fast Dispatch Engine queries
-- (The dispatch engine will constantly query for riders seen in the last 3 minutes)
CREATE INDEX IF NOT EXISTS idx_riders_dispatch_ready 
  ON public.riders(operational_status, last_seen);

-- 3. Create basic index for geospatial proximity ranking
CREATE INDEX IF NOT EXISTS idx_riders_location 
  ON public.riders(current_lat, current_lng);
