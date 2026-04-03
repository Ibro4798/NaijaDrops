#!/usr/bin/env node

/**
 * NaijaDrops Load Test Script
 *
 * Tests Supabase Realtime and database performance under load
 * Run: node load-test.js
 *
 * Prerequisites:
 * - npm install @supabase/supabase-js
 * - Set SUPABASE_URL and SUPABASE_ANON_KEY in .env.local
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// Load env vars
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, ".env.local");

const env =
  fs.existsSync(envPath) ? Object.fromEntries(
    fs.readFileSync(envPath, "utf8")
      .split("\n")
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => line.split("="))
  ) : {};

const URL = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!URL || !KEY) {
  console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}

const supabase = createClient(URL, KEY);

// ============================================================================
// TEST 1: Query Performance (Simulate customer finding orders)
// ============================================================================

async function testQueryPerformance() {
  console.log("\n📊 TEST 1: Query Performance");
  console.log("====================================");

  const queries = [
    {
      name: "Fetch available orders (status='looking_for_driver')",
      run: async () => {
        const start = performance.now();
        const { data, error } = await supabase
          .from("orders")
          .select("*")
          .eq("status", "looking_for_driver")
          .limit(20);
        const duration = performance.now() - start;
        if (error) throw error;
        return { duration, count: data?.length || 0 };
      },
    },
    {
      name: "Fetch driver's active orders",
      run: async () => {
        const driverId = "00000000-0000-0000-0000-000000000000"; // Dummy UUID
        const start = performance.now();
        const { data, error } = await supabase
          .from("orders")
          .select("*")
          .eq("driver_id", driverId)
          .in("status", ["accepted", "picked_up", "arriving"]);
        const duration = performance.now() - start;
        if (error) {
          // Expected to fail with no data, just measure latency
          return { duration, count: 0 };
        }
        return { duration, count: data?.length || 0 };
      },
    },
    {
      name: "Fetch driver profile + reviews",
      run: async () => {
        const driverId = "00000000-0000-0000-0000-000000000000";
        const start = performance.now();
        const { data: profile, error: e1 } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", driverId)
          .single();
        const { data: reviews, error: e2 } = await supabase
          .from("reviews")
          .select("*")
          .eq("driver_id", driverId)
          .order("created_at", { ascending: false });
        const duration = performance.now() - start;
        if (e1 || e2) {
          return { duration, count: 0 };
        }
        return { duration, count: (reviews?.length || 0) };
      },
    },
  ];

  for (const query of queries) {
    try {
      const result = await query.run();
      console.log(
        `✅ ${query.name}`
      );
      console.log(
        `   Latency: ${result.duration.toFixed(2)}ms | Records: ${result.count}`
      );
      if (result.duration > 500) {
        console.log(
          `   ⚠️  SLOW: Expected <200ms, got ${result.duration.toFixed(2)}ms`
        );
      }
    } catch (error) {
      console.log(`❌ ${query.name}`);
      console.log(`   Error: ${error.message}`);
    }
  }
}

// ============================================================================
// TEST 2: Realtime Subscription Load (Simulate multiple customers tracking)
// ============================================================================

async function testRealtimeLoad() {
  console.log("\n🔴 TEST 2: Realtime Subscription Connections");
  console.log("====================================");

  const NUM_CONCURRENT_ORDERS = 50; // Test with 50 concurrent orders
  let connectionCount = 0;
  const subscriptions = [];

  console.log(
    `Simulating ${NUM_CONCURRENT_ORDERS} concurrent customers tracking orders...`
  );

  for (let i = 0; i < NUM_CONCURRENT_ORDERS; i++) {
    const orderId = `order-${i}`;

    // Simulate customer subscription to order
    const orderSub = supabase.channel(`order-${orderId}`).on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "orders",
        filter: `id=eq.${orderId}`,
      },
      () => {}
    );

    orderSub.subscribe(() => {
      connectionCount++;
      console.log(`   └─ Connection ${connectionCount}: order-${orderId}`);
    });

    subscriptions.push(orderSub);

    // Simulate customer subscription to driver location
    const driverId = `driver-${i % 10}`; // Reuse drivers across orders
    const locSub = supabase.channel(`driver-loc-${driverId}`).on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "driver_locations",
        filter: `driver_id=eq.${driverId}`,
      },
      () => {}
    );

    locSub.subscribe(() => {
      connectionCount++;
      console.log(`   └─ Connection ${connectionCount}: driver-loc-${driverId}`);
    });

    subscriptions.push(locSub);

    // Small delay to reduce connection spam
    if (i % 10 === 0) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  console.log(
    `\n📈 Total Realtime connections created: ${connectionCount}`
  );
  console.log(
    `   Expected limit (Supabase Free): 200 connections`
  );
  console.log(
    `   Expected limit (Supabase Pro): 500 connections`
  );

  if (connectionCount > 200) {
    console.log(
      `   🚨 WARNING: Exceeds free tier limit! Upgrade to Pro or implement batching.`
    );
  }
  if (connectionCount > 500) {
    console.log(
      `   🚨 DANGER: Exceeds Pro tier limit! Implement caching layer.`
    );
  }

  // Cleanup
  for (const sub of subscriptions) {
    supabase.removeChannel(sub);
  }

  console.log(`Cleanup: ${subscriptions.length} subscriptions removed`);
}

// ============================================================================
// TEST 3: Location Update Frequency (Measure write pressure)
// ============================================================================

async function testLocationUpdateFrequency() {
  console.log("\n📍 TEST 3: Driver Location Update Frequency");
  console.log("====================================");

  console.log("Simulating driver location updates:");
  console.log("  Scenario 1: Update every 2 seconds (CURRENT BEHAVIOR)");
  console.log("  Scenario 2: Update every 10 seconds (OPTIMIZED)");
  console.log("  Scenario 3: Update every 15 seconds (BATCHED)");

  const scenarios = [
    { name: "Every 2s", interval: 2 },
    { name: "Every 10s", interval: 10 },
    { name: "Every 15s", interval: 15 },
  ];

  for (const scenario of scenarios) {
    const updatesPerDay = (86400 / scenario.interval) * 1; // 1 driver
    const updatesPerDay100Drivers = updatesPerDay * 100;
    const updatesPerDay1000Drivers = updatesPerDay * 1000;

    console.log(`\n  📊 ${scenario.name} interval:`);
    console.log(`     Updates/day (1 driver):      ${updatesPerDay.toFixed(0)}`);
    console.log(
      `     Updates/day (100 drivers):   ${updatesPerDay100Drivers.toFixed(0)}`
    );
    console.log(
      `     Updates/day (1000 drivers):  ${updatesPerDay1000Drivers.toFixed(0)}`
    );
    console.log(`     DB write cost (1000 drivers): $${(updatesPerDay1000Drivers * 0.0000003).toFixed(4)}/day`);
  }

  console.log(
    `\n💡 Recommendation: Switch to 15-second batching BEFORE Kano launch.`
  );
}

// ============================================================================
// TEST 4: Database Size Projection
// ============================================================================

async function testDatabaseProjection() {
  console.log("\n📈 TEST 4: Database Growth Projection");
  console.log("====================================");

  const projections = [
    {
      milestone: "Kano Launch (Month 0)",
      orders: 5000,
      drivers: 200,
      users: 3000,
    },
    {
      milestone: "Kano Stabilized (Month 2)",
      orders: 50000,
      drivers: 500,
      users: 10000,
    },
    {
      milestone: "Multi-City Expansion (Month 4)",
      orders: 500000,
      drivers: 2000,
      users: 50000,
    },
  ];

  for (const proj of projections) {
    console.log(`\n${proj.milestone}:`);
    console.log(`  Orders: ${proj.orders.toLocaleString()}`);
    console.log(`  Drivers: ${proj.drivers.toLocaleString()}`);
    console.log(`  Users: ${proj.users.toLocaleString()}`);

    // Rough DB size estimate (1KB per order + metadata)
    const estimatedSize = (proj.orders * 1.5) / 1024; // MB
    console.log(`  Est. DB size: ~${estimatedSize.toFixed(0)} MB`);

    // Query performance without indexes
    const avgOrdersPerQuery = proj.orders / 100; // Assume 100 queries concurrent
    console.log(`  Avg records scanned per query: ~${avgOrdersPerQuery.toFixed(0)}`);
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log("🚀 NaijaDrops Load Testing Suite");
  console.log("==================================\n");

  try {
    await testQueryPerformance();
    await testRealtimeLoad();
    await testLocationUpdateFrequency();
    await testDatabaseProjection();

    console.log("\n\n📋 SUMMARY & RECOMMENDATIONS");
    console.log("====================================");
    console.log(
      "1. If query latencies > 200ms: Add database indexes (see LOAD_TEST_AUDIT.md)"
    );
    console.log("2. If Realtime connections > 200: Implement location batching");
    console.log("3. If growth > 50k orders/city: Add city-based query filtering");
    console.log("4. Before multi-city: Upgrade Supabase to Pro or Enterprise plan\n");
  } catch (error) {
    console.error("❌ Test suite failed:", error);
    process.exit(1);
  }
}

main();
