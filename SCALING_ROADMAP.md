# NaijaDrops: Complete Scaling Roadmap (4-Month Multi-City Expansion)

**Timeline:** Month 0 (Kano Launch) → Month 4 (5-City Network)
**Goal:** Scale from 1 city (Kano, ~5k orders/month) → 5 cities (500k orders/month)

---

## 📅 PHASE 1: PRE-KANO LAUNCH (WEEK 0-3)

### Must-Do Before Going Live

**Goal:** Ensure Kano can handle 500+ concurrent users without crashing

#### Week 1: Database Foundation
- [ ] **Add 8 missing indexes** (see `LOAD_TEST_AUDIT.md` section "Missing Indexes")
  - Estimated time: 2 hours
  - Impact: Query latency 50-75% improvement

- [ ] **Add schema columns for scaling:**
  ```sql
  ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS city TEXT DEFAULT 'Kano';
  ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS city TEXT DEFAULT 'Kano';
  ALTER TABLE public.driver_locations ADD COLUMN IF NOT EXISTS city TEXT DEFAULT 'Kano';
  ```
  - Estimated time: 1 hour
  - No downtime (migrations are backward-compatible)

- [ ] **Create indexes on new columns:**
  ```sql
  CREATE INDEX idx_orders_city_status ON public.orders(city, status);
  CREATE INDEX idx_profiles_city ON public.profiles(city);
  ```
  - Estimated time: 1 hour

#### Week 2: Realtime Optimization
- [ ] **Implement location update batching** in driver dashboard
  - File to modify: `/src/app/driver/page.jsx` (or wherever driver is tracking)
  - Change: Batch GPS updates every 15 seconds instead of streaming
  - Estimated time: 4 hours
  - Expected improvement: 90% reduction in Realtime load

- [ ] **Set up Supabase monitoring:**
  - Enable Realtime insights in Supabase dashboard
  - Set alert: If connections > 400, notify ops
  - Set alert: If query latency > 500ms, notify ops
  - Estimated time: 1 hour

#### Week 3: Load Testing & Validation
- [ ] **Run load test** (use script in repo)
  ```bash
  npm install @supabase/supabase-js --save-dev
  node load-test.js
  ```
  - Expected results:
    - Query latency: 50-150ms ✅
    - Realtime connections at 50 concurrent orders: 150-200 ✅
    - No timeouts ✅

- [ ] **Stress test with staging clone**
  - Simulate 100 concurrent active orders
  - Monitor metrics for 2 hours
  - Measure peak Realtime connections, query latency, error rate
  - Target: >95% success rate, <200ms latency

- [ ] **Document capacity limits:**
  - Max concurrent active orders: _____ (based on test results)
  - Max Realtime connections: _____
  - Max QPS (queries per second): _____

---

## 📍 PHASE 2: KANO OPERATIONS (MONTH 0-1)

### Hit these metrics to be ready for expansion

**Success Criteria:**
- [ ] 500+ concurrent users without crashes
- [ ] 95%+ delivery success rate
- [ ] Query latency stable <150ms
- [ ] Realtime connections staying under 400
- [ ] Zero unplanned downtime

**Monitoring Dashboard** (set up in Supabase + your monitoring tool):
```
🟢 Realtime Connections:  150/400 [HEALTHY]
🟢 Query Latency (p99):    142ms [HEALTHY]
🟢 Active Orders:          78 [HEALTHY]
🟢 Error Rate:             0.2% [HEALTHY]
```

**Weekly Operations Checklist:**
- [ ] Review Supabase metrics dashboard
- [ ] Check for slow queries (log queries >200ms)
- [ ] Monitor database disk usage (alert if >70%)
- [ ] Verify backups are running (Supabase auto-backup: daily)
- [ ] Spot-check RLS policies don't have performance issues

---

## 🌍 PHASE 3: MULTI-CITY PREPARATION (MONTH 1-2)

### Get infrastructure ready for Lagos, Abuja, Port Harcourt, Ibadan, Benin City

#### Architecture Decision: Single Database vs Per-City Database

**Option A: Single Database (RECOMMENDED for <1M orders)**
- ✅ Simpler operations
- ✅ Unified user/driver accounts across cities
- ✅ Easier cross-city reporting
- ❌ Requires better indexing strategy
- ❌ All cities scale together (bottleneck: Lagos traffic affects Kano perf)

**Option B: Per-City Database (Enterprise Scale)**
- ✅ Complete isolation per city
- ✅ City can scale independently
- ✅ Easier failover (one city down ≠ all down)
- ❌ Complex user management (replicated across DBs)
- ❌ 5x infrastructure cost
- **Recommendation:** Adopt Option B at **Month 3** (only if bottlenecks emerge)

**For now: Proceed with Option A (Single Database) but architect for Option B migration**

#### Implementation Steps

1. **City Configuration System** (1 week)
   - Create `app.config.js`:
     ```javascript
     export const SUPPORTED_CITIES = ['Kano', 'Lagos', 'Abuja', 'PortHarcourt', 'Ibadan', 'BeninCity'];
     export const CITY_BOUNDS = {
       'Kano': { minLat: 11.8, maxLat: 12.2, minLng: 8.3, maxLng: 8.7 },
       'Lagos': { minLat: 6.3, maxLat: 6.7, minLng: 3.2, maxLng: 3.6 },
       // ...etc
     };
     ```
   - All queries automatically filter by user's city
   - Driver matching respects city boundaries

2. **Database Migration (City Partitioning)** (1-2 weeks)
   - Backfill `city` field on all existing records
   - Add check: `ALTER TABLE orders ADD CONSTRAINT city_not_empty CHECK (city IS NOT NULL);`
   - Create city-based indexes
   - Test query performance on each city

3. **Update RLS Policies** (1 week)
   - Add city filter to all RLS policies
   - Example:
     ```sql
     create policy "Users can view orders in their city" on orders for select using (
         auth.uid() = user_id AND city = (SELECT city FROM profiles WHERE id = auth.uid())
     );
     ```

4. **Multi-City Admin Dashboard** (1 week)
   - Breakdown metrics by city
   - Per-city driver verification queue
   - City-level performance alerts

#### Capacity Planning: Single Database with City Filtering

| Metric | Per City | 5 Cities | Supabase Plan |
|--------|----------|----------|-----------|
| **Concurrent Orders** | 100 | 500 | Pro |
| **Active Drivers** | 500 | 2,500 | Pro |
| **Est. DB Size** | 100-150 MB | 500 MB-1 GB | Pro (1 GB) |
| **Monthly API Calls** | 500K | 2.5M | Pro (unlimited) |
| **Cost/Month** | $25 | $85 (Pro+add-ons) | ~$100 |

---

## 🚀 PHASE 4: MULTI-CITY LAUNCH (MONTH 2-3)

### Rollout: Staggered Launch (1 city per week)

**Week 1:** Lagos (largest market)
- Same production checklist as Kano launch
- Run load test for Lagos-level traffic
- 24/7 ops team monitoring

**Week 2:** Abuja (federal capital)
- Copy operational playbook from Lagos
- Watch for cross-city data issues

**Weeks 3-4:** Port Harcourt, Ibadan, Benin City
- Reduced monitoring overhead (established patterns)
- Batch improvements together

#### Per-Launch Checklist

For each city, before going live:
```
✅ Database contains city-specific test data
✅ Maps/geocoding work for city bounds
✅ Driver documentation uploaded (for KYC)
✅ Admin verified test drivers & customers
✅ 1-week marketing preparation
✅ 24/7 ops team on standby
✅ Rollback plan documented
```

---

## 🎯 PHASE 5: SCALING CRISIS MANAGEMENT (MONTH 3-4)

### What to do when things break (they will)

#### Scenario 1: "Queries are timing out"
**Diagnosis:**
```sql
-- Check slow query log
SELECT query, mean_exec_time FROM pg_stat_statements
ORDER BY mean_exec_time DESC LIMIT 5;
```

**Quick Fixes (do immediately):**
1. Add missing index on slow query column
2. Add LIMIT clause if query returns 100k+ rows
3. Check RLS policy for subqueries (optimize to direct column comparison)

**Medium-term (1-2 days):**
- Implement query result caching (Redis layer)
- Consider database query optimization specialist

#### Scenario 2: "Realtime connections hitting limit"
**Diagnosis:**
```javascript
// Check Supabase dashboard:
// Realtime → Active Connections → If near limit
```

**Quick Fix:** Reduce subscription frequency or implement caching layer

**Medium-term:** Upgrade to Enterprise plan ($500-2000/month)

#### Scenario 3: "One city is slow, affecting others"
**Diagnosis:** City with surge traffic (e.g., promo day in Lagos increases query load)

**Quick Fix:**
1. Add query rate limiting per user
2. Reduce batch sizes (fetch 10 orders instead of 20)
3. Implement request queuing

**Long-term:** Migrate to per-city databases (Option B)

---

## 💾 INFRASTRUCTURE CHECKLIST

### Backups & Disaster Recovery

**Supabase (Built-in):**
- ✅ Automated daily backups (up to 7-day retention)
- ✅ Point-in-time recovery (Pro plan)
- ✅ Encrypted backups

**Additional Backup Strategy:**
```sql
-- Weekly full export to S3 (automated via Cloud Function)
CREATE TABLE public.backup_log (
    backup_id UUID PRIMARY KEY,
    created_at TIMESTAMP,
    s3_path TEXT,
    size_bytes BIGINT
);

-- Trigger export weekly to prove backups work
```

**Test Restoration Quarterly:**
- Download backup
- Restore to staging
- Verify data integrity

### Monitoring & Alerting

**Metrics to Monitor:**
1. **Database:**
   - Query latency (p50, p95, p99)
   - Connection count
   - Disk usage
   - Row count per table

2. **Realtime:**
   - Active connections
   - Message throughput (msg/sec)
   - Error rate

3. **Auth:**
   - Login success rate
   - Failed login attempts (brute force detection)
   - Session duration

4. **Business:**
   - Orders created/completed per hour
   - Driver acceptance rate
   - Payment success rate

**Alert Thresholds:**
```
🟡 Warning:  Query latency p99 > 300ms
🔴 Critical: Query latency p99 > 800ms

🟡 Warning:  Realtime connections > 450
🔴 Critical: Realtime connections > 500

🟡 Warning:  DB disk usage > 60%
🔴 Critical: DB disk usage > 80%

🔴 Critical: Error rate > 5%
```

### Security Hardening (Pre-Multi-City)

- [ ] Enable 2FA for admin accounts
- [ ] Rotate all API keys
- [ ] Review RLS policies for bypasses
- [ ] Implement rate limiting on API routes
- [ ] Set up DDoS protection (Cloudflare)
- [ ] Enable audit logging in Supabase
- [ ] Regular security audit (monthly)

---

## 📊 SUCCESS METRICS BY MILESTONE

### Month 0 (Kano Launch)
| Metric | Target | Actual |
|--------|--------|--------|
| Concurrent Users | 500 | ___ |
| Query Latency (p99) | <200ms | ___ |
| Realtime Connections | <300 | ___ |
| Uptime | 99.5% | ___ |
| Order Completion | 95% | ___ |

### Month 2 (Kano Stable + Lagos)
| Metric | Target | Actual |
|--------|--------|--------|
| Total Concurrent Users | 1,500 | ___ |
| Avg Query Latency | <150ms | ___ |
| Combined Realtime Connections | <500 | ___ |
| Uptime | 99.7% | ___ |
| Order Completion | 96% | ___ |

### Month 4 (5-City Network)
| Metric | Target | Actual |
|--------|--------|--------|
| Total Concurrent Users | 5,000 | ___ |
| Avg Query Latency | <200ms | ___ |
| Combined Realtime Connections | <800 | ___ |
| Uptime | 99.8% | ___ |
| Order Completion | 97% | ___ |
| Monthly Orders | 500k+ | ___ |

---

## 💰 BUDGET & INFRASTRUCTURE COSTS

### Supabase (Database + Auth + Realtime)
```
Month 0 (Kano):        $85/month  (Pro plan + add-ons)
Month 2 (2 cities):    $150/month (Pro + increased limits)
Month 4 (5 cities):    $500-1000+ (Enterprise or upgraded Pro)
```

### Additional Services
```
CDN (Mapbox/Leaflet tiles):      $50-100/month
Monitoring (Datadog/New Relic):  $100-200/month
Cloud Storage (backups, photos): $50-100/month
Custom domain/SSL:               $20/month
```

**Total estimate:** $300-400/month (Kano) → $700-1500/month (5 cities)

---

## 🎓 WHAT YOU NEED TO KNOW FOR SUCCESS

### 1. Database Indexing (Critical)
- Without indexes: Queries get slower by ~N log N as data grows
- With indexes: Queries stay fast regardless of data size
- **Action:** Implement all 8 indexes before Kano launch

### 2. Realtime Subscriptions (Critical)
- Each subscription = 1 connection. 2 subs/active order = 2x connections
- Supabase free tier: 200 connections (hard limit)
- Solution: Batch location updates, cache results
- **Action:** Implement batching, monitor realtime connections

### 3. RLS Performance (Important)
- Subqueries in RLS policies cause N+1 problem
- Query that reads 100 bids may trigger 100 subqueries
- Solution: Denormalize key fields for direct comparison
- **Action:** Review and optimize RLS policies before multi-city

### 4. Geographic Queries (Important)
- "Find drivers near me" requires spatial indexing
- Without `city` column: Must scan all drivers across all cities
- Solution: Add city-based partitioning now
- **Action:** Add city field to all location tables

### 5. Pagination & Limits (Important)
- UI showing 100+ orders at once = bad UX + slow queries
- Always use LIMIT, ORDER BY, OFFSET
- **Action:** Enforce pagination in all list views

---

## 📞 WHEN TO ESCALATE

**Call Supabase Support if:**
- Query latency > 1 second consistently
- Realtime connections unstable/dropping
- Suspect database corruption
- Need custom Enterprise features

**Call Your DevOps/DB Admin if:**
- Implementing per-city databases
- Setting up advanced monitoring
- Optimizing complex queries

**Budget for external help:**
- Database optimization consultant: $5-10k
- DevOps/infrastructure setup: $10-20k
- Security audit: $3-5k

---

## 🚀 FINAL CHECKLIST: Ready for Multi-City?

Before expanding beyond Kano, verify:

- [ ] Database indexes implemented & tested
- [ ] Location update batching live in driver app
- [ ] Realtime connections consistently <300
- [ ] Query latencies consistently <150ms
- [ ] RLS policies optimized (no subqueries)
- [ ] City field migrated to all tables
- [ ] Load test passes at 200+ concurrent orders
- [ ] Backup & recovery process tested
- [ ] Monitoring alerts configured
- [ ] Ops runbook documented
- [ ] Team trained on scaling procedures

---

**Next Step:** Run `node load-test.js` and share results. We'll identify specific bottlenecks to address before launch.

