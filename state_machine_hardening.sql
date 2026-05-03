-- NAIJADROPS MASTER BLUEPRINT V2 - MIGRATION 2
-- Stage 1: State Machine & Operation Lock

-- 1. Hardening the Order State Machine
-- This ensures financial and negotiation states are tracked independently of the logistics status.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'authorized', 'captured', 'voided')),
  ADD COLUMN IF NOT EXISTS negotiation_status TEXT DEFAULT 'active' CHECK (negotiation_status IN ('active', 'concluded', 'terminated')),
  ADD COLUMN IF NOT EXISTS is_assigned BOOLEAN DEFAULT false;

-- 2. Hardening the Rider Operational Lock
-- Adding 'awaiting_payment' to lock riders while a user is at checkout.
ALTER TABLE public.riders
  ADD COLUMN IF NOT EXISTS operational_status TEXT DEFAULT 'offline' CHECK (operational_status IN ('offline', 'online', 'busy', 'awaiting_payment'));

-- Syncing existing status to operational_status if needed
UPDATE public.riders SET operational_status = status WHERE operational_status = 'offline' AND status != 'offline';
