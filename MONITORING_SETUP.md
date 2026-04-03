# NaijaDrops: Supabase Monitoring & Alerting Setup

## Overview

This guide helps you monitor the critical metrics that indicate scaling problems. Set these up BEFORE Kano launch.

---

## 📊 SUPABASE DASHBOARD MONITORING

### Step 1: Enable Realtime Insights (5 minutes)

1. Go to **Supabase Dashboard** → Your Project → **Realtime** (left sidebar)
2. You'll see:
   - **Active Connections** graph (current, should stay <300 for Kano)
   - **Messages Per Second** graph
   - **Error Rate**

**What to watch:**
- If connections spike above 250: Location updates being sent too frequently
- If gradient is continuously rising: New users coming online faster than expected
- If error rate >1%: Database or Realtime service issues

---

### Step 2: Enable Query Performance Monitoring (5 minutes)

1. Go to **Supabase Dashboard** → **Logs** (left sidebar)
2. Select **Database Logs** tab
3. You'll see all database queries with:
   - Execution time
   - Rows affected
   - Error messages

**Set up automatic alerts:**
- Filter for queries > 200ms (slow)
- Filter for queries with errors
- Screenshot trends for weekly review

**What queries to watch:**
```sql
-- These should complete in <100ms:
SELECT * FROM orders WHERE status = 'looking_for_driver' LIMIT 20;
SELECT * FROM driver_locations WHERE driver_id = $1;

-- These might be slow (>500ms) if user is reading hundreds of messages:
SELECT * FROM messages WHERE order_id = $1 ORDER BY created_at DESC LIMIT 100;

-- These indicate scaling problems (>1000ms):
SELECT * FROM orders -- Full table scan (no WHERE clause)
SELECT COUNT(*) FROM orders -- Counting millions of rows
```

**Red flag queries to investigate:**
- Any query with execution time > 1 second
- Queries that scan >100k rows to return <100 rows
- Queries without LIMIT clause

---

### Step 3: Monitor Database Metrics (5 minutes)

1. Go to **Supabase Dashboard** → **Database** → **Database Health**
2. Watch these in real-time:
   - **Connections** (should stay <30 for application layer)
   - **Disk Usage** (alert if >60%)
   - **CPU Usage** (alert if >70%)
   - **RAM Usage** (alert if >85%)

**What thresholds indicate problems:**
```
🟢 GREEN:
  Connections: <20
  CPU: <40%
  RAM: <60%
  Disk: <40%

🟡 YELLOW (Warning):
  Connections: 20-30
  CPU: 40-70%
  RAM: 60-80%
  Disk: 40-70%

🔴 RED (Critical):
  Connections: >30
  CPU: >70%
  RAM: >80%
  Disk: >70%
```

---

## 📢 ALERTS TO SET UP

### Option A: Email Alerts (Built into Supabase)

1. Go to **Supabase Dashboard** → **Alerts** (left sidebar)
2. Create alerts for:

#### Alert 1: Realtime Connections
```
Condition: Active Realtime Connections > 350
Threshold Duration: 5 minutes
Action: Email notification
Recipient: Your email
```
**Why:** If you're consistently over 350, you're approaching the Pro tier limit of 500

#### Alert 2: Query Performance
```
Condition: Max Query Execution Time > 500ms
Threshold Duration: 1 minute
Action: Email notification
```
**Why:** Indicates missing indexes or N+1 queries

#### Alert 3: Database CPU
```
Condition: Database CPU > 70%
Threshold Duration: 2 minutes
Action: Email notification
```
**Why:** Database is struggling with query load

#### Alert 4: Disk Usage
```
Condition: Disk Usage > 60%
Threshold Duration: 1 hour
Action: Email notification
```
**Why:** Gives you time to delete old data or upgrade before hitting limit

---

### Option B: Programmatic Monitoring (Advanced)

Create a cron job that checks metrics every 5 minutes:

```javascript
// utils/monitoring/supabaseHealthCheck.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(URL, SERVICE_ROLE_KEY);

export async function checkSupabaseHealth() {
  const issues = [];

  // 1. Check Realtime connections
  try {
    const { data: realtimeMetrics } = await supabase.rpc('get_realtime_metrics');
    if (realtimeMetrics?.active_connections > 400) {
      issues.push({
        severity: 'WARNING',
        metric: 'Realtime Connections',
        value: realtimeMetrics.active_connections,
        threshold: 400,
        action: 'Reduce location update frequency or implement caching'
      });
    }
  } catch (err) {
    issues.push({
      severity: 'ERROR',
      metric: 'Realtime Check Failed',
      error: err.message
    });
  }

  // 2. Check slow queries
  try {
    const { data: slowQueries } = await supabase
      .from('pgbench_query_log')
      .select('query, duration')
      .gt('duration', 500)
      .limit(5)
      .order('duration', { ascending: false });

    if (slowQueries?.length > 0) {
      issues.push({
        severity: 'WARNING',
        metric: 'Slow Queries Detected',
        count: slowQueries.length,
        slowestQuery: slowQueries[0]?.query,
        duration: slowQueries[0]?.duration,
        action: 'Review slow query log and add indexes'
      });
    }
  } catch (err) {
    console.warn('Could not check slow queries:', err.message);
  }

  // 3. Check order growth rate
  try {
    const now = new Date();
    const fiveMinutesAgo = new Date(now - 5 * 60 * 1000);

    const { count: recentOrders } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .gt('created_at', fiveMinutesAgo.toISOString())
      .eq('city', 'Kano');

    if (recentOrders > 50) {
      // 50 orders in 5 minutes = 600 orders/hour (high volume)
      issues.push({
        severity: 'INFO',
        metric: 'High Order Volume',
        value: recentOrders,
        period: '5 minutes',
        ordersPerHour: recentOrders * 12,
        note: 'Monitor for sustained high volume'
      });
    }
  } catch (err) {
    console.warn('Could not check order volume:', err.message);
  }

  return {
    timestamp: new Date().toISOString(),
    healthy: issues.filter(i => i.severity === 'ERROR').length === 0,
    issues
  };
}

// Usage in API route:
// GET /api/health
import { checkSupabaseHealth } from '@/utils/monitoring/supabaseHealthCheck';

export async function GET() {
  const health = await checkSupabaseHealth();

  // Send to external monitoring (Datadog, New Relic, etc.)
  if (health.issues.length > 0) {
    // await sendToMonitoringService(health);
  }

  return Response.json(health);
}
```

---

## 📈 WEEKLY MONITORING CHECKLIST

Run this every Monday morning:

- [ ] **Review Realtime Insights**
  - Peak connection count last week: ______
  - Average messages/sec: ______
  - Error rate: ______%
  - Action: If peak > 300, implement location caching next week

- [ ] **Review Database Performance**
  - Slowest query: ______ (should be <500ms)
  - Queries > 200ms: ______ count
  - Active connections peak: ______
  - Disk usage: ______% (should be <60%)
  - Action:Add indexes if any query > 500ms

- [ ] **Review Order Metrics**
  - Total orders last week: ______
  - Daily average: ______
  - Peak concurrent orders: ______
  - Action: If trending up, plan scaling accordingly

- [ ] **Check Logs for Errors**
  - RLS policy errors: ______
  - Auth failures: ______
  - API route errors: ______
  - Action: Fix any recurring errors

---

## 🚨 CRISIS RESPONSE PLAYBOOK

### Crisis 1: "Realtime connections at 450 (near limit)"

**Immediate (5 minutes):**
1. Check Supabase Realtime logs for errors
2. Check which subscriptions are consuming most connections
3. If driver app is causing spike: Increase location batching interval from 15s to 30s

**Short-term (30 minutes):**
1. Implement connection pooling if not already done
2. Test with production data to quantify the issue
3. Document: "At X concurrent orders, we hit Y Realtime connections"

**Medium-term (today):**
1. Upgrade Supabase to Enterprise plan (if Pro not sufficient)
2. Implement location caching layer (Redis)
3. Reduce number of Realtime subscriptions per user

---

### Crisis 2: "Query taking 2+ seconds"

**Immediate (5 minutes):**
1. Identify the slow query from logs
2. Check if it has WHERE/ORDER BY clauses (might need index)
3. Check query complexity (is it reading 1M rows?)

**Short-term (1 hour):**
1. Add index if none exists on the column
2. Add LIMIT clause if missing
3. Rewrite query to use existing indexes

**Example:**
```sql
-- BEFORE (2.5 seconds, scans 500k rows)
SELECT * FROM orders WHERE created_at > now() - interval '1 day';

-- AFTER (50ms, uses index)
SELECT * FROM orders
WHERE created_at > now() - interval '1 day'
ORDER BY created_at DESC
LIMIT 100;

-- Add index:
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);
```

---

### Crisis 3: "Disk usage at 70%"

**Immediate (5 minutes):**
1. Check what's consuming disk space
   ```sql
   SELECT
     schemaname,
     tablename,
     pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
   FROM pg_tables
   ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
   LIMIT 10;
   ```

**Short-term (1 hour):**
- Option A: Delete old data (e.g., completed orders >30 days old)
  ```sql
  DELETE FROM public.orders WHERE status = 'delivered' AND completed_at < now() - interval '30 days';
  VACUUM ANALYZE; -- Reclaim space
  ```
- Option B: Archive data to cloud storage (S3)
- Option C: Upgrade Supabase disk space

---

## 📊 METRICS DASHBOARD TEMPLATE

Create this dashboard in your monitoring tool or as a Google Sheet:

```
┌─────────────────────────────────────────────────────────────┐
│ NaijaDrops - Scaling Metrics Dashboard - Week of 2026-03-27 │
├─────────────────────────────────────────────────────────────┤
│ REALTIME METRICS                                             │
│  Peak Connections:        [___] / 500 (Pro limit)           │
│  Avg Connections:         [___]                              │
│  Messages/sec Peak:       [___] / 1000                       │
│  Error Rate:              [___]% (target: <1%)              │
│                                                               │
│ DATABASE METRICS                                             │
│  Slowest Query:           [___]ms (target: <200ms)          │
│  Queries >200ms:          [___] count (target: 0)           │
│  Disk Usage:              [___]% (alert: >70%)              │
│  CPU Peak:                [___]% (alert: >70%)              │
│                                                               │
│ APPLICATION METRICS                                          │
│  Total Orders:            [___]                              │
│  Daily Avg:               [___]                              │
│  Peak Concurrent:         [___]                              │
│  Success Rate:            [___]% (target: >98%)             │
│                                                               │
│ STATUS:  ✅ HEALTHY / ⚠️ WARNING / 🔴 CRITICAL              │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎯 NEXT STEPS

1. **This week:** Set up 4 email alerts in Supabase (Realtime, Query, CPU, Disk)
2. **Before launch:** Configure weekly health check script
3. **After launch:** Review dashboard daily for first 2 weeks, then weekly

---

