# 🧠 NAIJADROPS — OPS-TERMINAL MASTER BLUEPRINT (FINAL SYSTEM)

## “CONTROL TOWER ARCHITECTURE FOR LOGISTICS MVP”

---

# 0. SYSTEM DEFINITION
This system is NOT an app UI.
It is a **controlled dispatch + workforce + financial + fraud enforcement system.**
Everything revolves around:
* riders
* orders
* money flow
* admin enforcement

---

# 1. CORE DATA FOUNDATION (OPERATIONAL TRUTH LAYER)

## 1.1 ADMIN SYSTEM TABLES
```sql
admin_users (
  id uuid PRIMARY KEY,
  email text,
  role text CHECK ('admin','super_admin'),
  is_active boolean
)

admin_action_logs (
  id bigserial,
  admin_id uuid,
  action text,
  target_id text,
  timestamp timestamp
)
```

## 1.2 RIDER TABLE (UPGRADED)
Add to `riders`:
* acceptance_rate
* fraud_score (0–100)
* total_deliveries
* orders_completed_today
* last_seen
* current_lat
* current_lng

## 1.3 ORDER TABLE (STATE MACHINE LOCKED)
`pending` → `matched` → `authorized` → `picked_up` → `delivered`
**CRITICAL RULE**: NO skipping states allowed.

---

# 2. SECURITY ARCHITECTURE — “TRIPLE LOCK FIREWALL”

## LAYER 1 — MIDDLEWARE (ROUTE LOCK)
* **ROUTE**: `/ops-terminal/*`
* **RULES**: If user not in `admin_users` OR `is_active = false` ➡ RETURN `404 NOT FOUND`.
* **WHY**: Prevents route discovery + admin targeting.

## LAYER 2 — SERVER RBAC (ACTION VALIDATION)
Every admin action MUST run server-side validation against `admin_users`.
**RULE**: Frontend is NEVER trusted. EVER.

## LAYER 3 — DATABASE RLS (FINAL AUTHORITY)
ONLY active admins can modify riders via RLS policies.

---

# 3. DISPATCH ENGINE (CORE MARKETPLACE LOGIC)

## 3.1 DISPATCH FLOW
Order created → Filter eligible riders → Rank riders → Send request → First accept locks order → Move to authorized

## 3.2 RIDER ELIGIBILITY FILTER
Rider MUST:
* status = approved
* operational_status = online
* last_seen < 3 minutes
* correct vehicle type
* not in active delivery

## 3.3 RANKING ALGORITHM (FAIRNESS ENGINE)
`Score = (acceptance_rate * 0.4) + (rating * 0.3) + (proximity * 0.3) + (1 / orders_completed_today)`

## 3.4 ORDER LOCKING RULE
Once accepted: `order.status = "matched"`, `order.locked = true`. Prevents duplicate assignment.

---

# 4. MARKETPLACE ENGINE (EDGE FUNCTION)
* **FUNCTION**: `getBestRider()`
* **AUTO-OFFLINE RULE**: `IF last_seen > 3 minutes → set operational_status = offline`

---

# 5. FRAUD PREVENTION SYSTEM
* **SCORE**: 0–100 scale (0-70 normal, 70-85 monitor, 85-95 restrict, 95+ suspend)
* **DETECTIONS**: GPS spoofing (impossible speed), Collusion (swapping), Device farming.

---

# 6. ADMIN MODULES (OPS-TERMINAL)
* `/drivers`: Approve/reject/pause, fraud score highlight, document review.
* `/orders`: Live tracking feed, manual override reassignment.
* `/payouts`: Manual payout marking, ledger tracking.
* `/admins` (SUPER ADMIN ONLY): Create/deactivate admins.

---

# 7. KANO PILOT GUARD (GEOFENCE SYSTEM)
`IF location NOT in Kano polygon: disable request`

---

# 8. PAYMENT FLOW (PAYSTACK AUTHORIZE SYSTEM)
1. User pays → 2. Paystack AUTHORIZES → 3. Driver assigned → 4. Delivery starts → 5. ONLY then CAPTURE funds

---

# 9. DRIVER UX SAFETY SYSTEM
* **SLIDE ACTIONS ONLY**: `Slide to Accept`, `Slide to Complete`. Prevents accidental taps.

---

# 10. SYSTEM EVENT FLOW (FULL LOOP)
User creates order ↓ Geofence validation ↓ Dispatch engine filters riders ↓ Fraud checks ↓ Ranking engine ↓ Request sent ↓ Accepted/Locked ↓ Payment authorized ↓ Pickup ↓ Delivery ↓ Capture payment ↓ Finance updated ↓ Admin logs.

---

# 11. AUDIT SYSTEM (NON-NEGOTIABLE)
Every admin action MUST log: who, what, when, target, reason.

---

# 12. SYSTEM DESIGN PHILOSOPHY
**ZERO TRUST MODEL**: frontend = untrusted, backend = verified, database = final authority.
