"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import {
  Phone, MessageCircle, ChevronDown, MapPin, Package,
  CheckCircle2, Truck, AlertCircle, ArrowLeft, RefreshCw
} from "lucide-react";
import OrderChat from "@/components/OrderChat";

const Map = dynamic(() => import("react-map-gl").then(m => m.default), { ssr: false });
const Marker = dynamic(() => import("react-map-gl").then(m => m.Marker), { ssr: false });
const Source = dynamic(() => import("react-map-gl").then(m => m.Source), { ssr: false });
const Layer = dynamic(() => import("react-map-gl").then(m => m.Layer), { ssr: false });

const STATUS_STEPS = [
  { key: "assigned", label: "Driver on the way", emoji: "🏍️" },
  { key: "picked_up", label: "Package picked up", emoji: "📦" },
  { key: "in_transit", label: "In transit", emoji: "🚀" },
  { key: "delivered", label: "Delivered", emoji: "✅" },
];

const STATUS_ORDER = ["pending", "assigned", "picked_up", "in_transit", "delivered"];

function getStepIndex(status) {
  const map = { assigned: 0, picked_up: 1, in_transit: 2, delivered: 3 };
  return map[status] ?? -1;
}

export default function TrackPage() {
  const { orderId } = useParams();
  const router = useRouter();
  const supabase = createClient();
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

  const [order, setOrder] = useState(null);
  const [rider, setRider] = useState(null);
  const [riderLocation, setRiderLocation] = useState(null);
  const [routeData, setRouteData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showChat, setShowChat] = useState(false);
  const [mapView, setMapView] = useState({ longitude: 8.52, latitude: 11.996, zoom: 13 });

  useEffect(() => {
    if (!orderId) return;
    fetchOrder();
    notifySMS();

    // Realtime order status updates
    const channel = supabase.channel(`track-${orderId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${orderId}` },
        async (payload) => {
          setOrder(prev => ({ ...prev, ...payload.new }));
          // If rider is now assigned, fetch their profile
          if (payload.new.rider_id && !rider) fetchRider(payload.new.rider_id);
        })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "riders" },
        (payload) => {
          if (rider && payload.new.user_id === rider.user_id) {
            if (payload.new.current_lat && payload.new.current_lng) {
              setRiderLocation({ lat: payload.new.current_lat, lng: payload.new.current_lng });
            }
          }
        })
      .subscribe();

    // Poll rider location every 10s
    const locationPoll = setInterval(fetchRiderLocation, 10000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(locationPoll);
    };
  }, [orderId]);

  async function fetchOrder() {
    const { data } = await supabase.from("orders").select("*").eq("id", orderId).single();
    if (data) {
      setOrder(data);
      if (data.rider_id) fetchRider(data.rider_id);
      // Center map on dropoff
      if (data.dropoff_lat && data.dropoff_lng) {
        setMapView(v => ({ ...v, longitude: data.dropoff_lng, latitude: data.dropoff_lat }));
      }
    }
    setLoading(false);
  }

  async function fetchRider(riderId) {
    const { data } = await supabase
      .from("riders")
      .select("*, users(full_name, email)")
      .eq("user_id", riderId)
      .single();
    if (data) {
      setRider(data);
      if (data.current_lat && data.current_lng) {
        setRiderLocation({ lat: data.current_lat, lng: data.current_lng });
      }
    }
  }

  async function fetchRiderLocation() {
    if (!order?.rider_id) return;
    const { data } = await supabase.from("riders").select("current_lat, current_lng, user_id").eq("user_id", order.rider_id).single();
    if (data?.current_lat && data?.current_lng) {
      setRiderLocation({ lat: data.current_lat, lng: data.current_lng });
    }
  }

  async function notifySMS() {
    try {
      await fetch("/api/notify-delivery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, trackingUrl: `${window.location.origin}/track/${orderId}` }),
      });
    } catch {}
  }

  // Fetch route when rider location changes
  useEffect(() => {
    if (!riderLocation || !order) return;
    const dest = order.status === "assigned"
      ? { lat: order.pickup_lat, lng: order.pickup_lng }
      : { lat: order.dropoff_lat, lng: order.dropoff_lng };

    fetch(`https://api.mapbox.com/directions/v5/mapbox/driving/${riderLocation.lng},${riderLocation.lat};${dest.lng},${dest.lat}?geometries=geojson&access_token=${mapboxToken}`)
      .then(r => r.json())
      .then(data => { if (data.routes?.[0]) setRouteData(data.routes[0].geometry); })
      .catch(() => {});
  }, [riderLocation, order?.status]);

  if (loading) return (
    <div className="min-h-screen bg-charcoal-950 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
    </div>
  );

  if (!order) return (
    <div className="min-h-screen bg-charcoal-950 flex items-center justify-center p-6 text-center">
      <div>
        <p className="text-charcoal-400 text-lg font-bold mb-4">Order not found</p>
        <button onClick={() => router.push("/dashboard")} className="text-emerald-500 font-black text-sm">← Back to dashboard</button>
      </div>
    </div>
  );

  const stepIndex = getStepIndex(order.status);
  const isCancelled = order.status === "cancelled";
  const isDelivered = order.status === "delivered";

  return (
    <div className="h-[100dvh] relative overflow-hidden bg-charcoal-950">
      {/* Full-screen map */}
      <div className="absolute inset-0 z-0">
        {mapboxToken ? (
          <Map
            mapboxAccessToken={mapboxToken}
            {...mapView}
            onMove={e => setMapView(e.viewState)}
            style={{ width: "100%", height: "100%" }}
            mapStyle="mapbox://styles/mapbox/dark-v11"
          >
            {routeData && (
              <Source id="route" type="geojson" data={{ type: "Feature", geometry: routeData }}>
                <Layer id="routeLine" type="line" layout={{ "line-join": "round", "line-cap": "round" }}
                  paint={{ "line-color": "#10b981", "line-width": 4, "line-opacity": 0.8 }} />
              </Source>
            )}

            {/* Rider marker */}
            {riderLocation && (
              <Marker longitude={riderLocation.lng} latitude={riderLocation.lat} anchor="center">
                <div className="relative">
                  <div className="w-10 h-10 bg-white rounded-full border-4 border-emerald-500 flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.6)] text-lg">
                    {order.vehicle_type === "car" ? "🚗" : "🏍️"}
                  </div>
                  <div className="absolute inset-0 w-10 h-10 bg-emerald-400/30 rounded-full animate-ping" />
                </div>
              </Marker>
            )}

            {/* Pickup pin */}
            {order.pickup_lat && (
              <Marker longitude={order.pickup_lng} latitude={order.pickup_lat} anchor="bottom">
                <div className="w-8 h-8 bg-white rounded-full border-4 border-charcoal-900 shadow-lg flex items-center justify-center">
                  <div className="w-2.5 h-2.5 bg-charcoal-900 rounded-full" />
                </div>
              </Marker>
            )}

            {/* Dropoff pin */}
            {order.dropoff_lat && (
              <Marker longitude={order.dropoff_lng} latitude={order.dropoff_lat} anchor="bottom">
                <MapPin size={36} className="text-emerald-400 drop-shadow-xl" fill="rgba(16,185,129,0.2)" />
              </Marker>
            )}
          </Map>
        ) : (
          <div className="w-full h-full bg-charcoal-900" />
        )}
      </div>

      {/* Top overlay */}
      <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-charcoal-950/80 to-transparent pointer-events-none z-10" />

      {/* Back button */}
      <div className="absolute top-14 left-5 z-20">
        <button onClick={() => router.push("/dashboard")} className="w-10 h-10 bg-charcoal-950/80 backdrop-blur-sm border border-white/10 rounded-2xl flex items-center justify-center text-white">
          <ArrowLeft size={18} />
        </button>
      </div>

      {/* Order ID badge */}
      <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20">
        <div className="bg-charcoal-950/80 backdrop-blur-sm border border-white/10 rounded-full px-4 py-2">
          <span className="text-charcoal-400 text-xs font-bold">#{orderId?.slice(0, 8)}</span>
        </div>
      </div>

      {/* Bottom sheet */}
      <div className="absolute bottom-0 inset-x-0 z-20">
        <div className="bg-charcoal-950/95 backdrop-blur-xl border-t border-white/[0.08] rounded-t-[2rem] px-5 pt-5 pb-8">

          {/* Cancelled state */}
          {isCancelled && (
            <div className="text-center py-4">
              <AlertCircle size={36} className="text-red-400 mx-auto mb-3" />
              <h2 className="text-white font-black text-xl mb-2">Delivery Cancelled</h2>
              <p className="text-charcoal-400 text-sm mb-4">Your driver cancelled this delivery.</p>
              <button onClick={() => router.push(`/send-package/step-3?orderId=${orderId}&retry=true`)}
                className="flex items-center gap-2 mx-auto bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 font-black px-5 py-3 rounded-2xl text-sm transition-all hover:bg-emerald-500/30">
                <RefreshCw size={16} /> Find New Driver
              </button>
            </div>
          )}

          {!isCancelled && (
            <>
              {/* Status progress */}
              <div className="mb-5">
                <div className="flex items-center justify-between mb-3">
                  {STATUS_STEPS.map((step, i) => (
                    <div key={step.key} className="flex flex-col items-center gap-1 flex-1">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all ${i <= stepIndex ? "bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)]" : "bg-charcoal-800 border border-white/10"}`}>
                        {i <= stepIndex ? <CheckCircle2 size={16} className="text-charcoal-950" strokeWidth={3} /> : <span className="text-charcoal-600 text-xs">{i + 1}</span>}
                      </div>
                      {i < STATUS_STEPS.length - 1 && (
                        <div className={`absolute h-0.5 w-full max-w-[60px] mt-4 ${i < stepIndex ? "bg-emerald-500" : "bg-charcoal-800"}`} />
                      )}
                    </div>
                  ))}
                </div>
                <div className="text-center">
                  <div className="text-sm font-black text-white">{STATUS_STEPS[stepIndex]?.emoji} {STATUS_STEPS[stepIndex]?.label || "Waiting for driver…"}</div>
                </div>
              </div>

              {/* Driver card */}
              {rider && (
                <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center text-2xl border border-emerald-500/20">
                    {order.vehicle_type === "car" ? "🚗" : "🏍️"}
                  </div>
                  <div className="flex-1">
                    <div className="text-white font-black">{rider.users?.full_name || "Your Driver"}</div>
                    <div className="text-charcoal-500 text-xs">{rider.plate_number || "Verified Rider"}</div>
                  </div>
                  <div className="flex gap-2">
                    {rider.users?.email && (
                      <a href={`tel:${rider.phone || ""}`}
                        className="w-10 h-10 bg-emerald-500/20 border border-emerald-500/40 rounded-xl flex items-center justify-center text-emerald-400 hover:bg-emerald-500/30 transition-all">
                        <Phone size={15} />
                      </a>
                    )}
                    <button onClick={() => setShowChat(!showChat)}
                      className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${showChat ? "bg-emerald-500 text-charcoal-950" : "bg-white/5 border border-white/10 text-charcoal-300 hover:bg-white/10"}`}>
                      <MessageCircle size={15} />
                    </button>
                  </div>
                </div>
              )}

              {/* Chat */}
              <AnimatePresence>
                {showChat && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "240px" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden mb-4">
                    <div className="h-60 rounded-2xl overflow-hidden border border-white/10">
                      <OrderChat orderId={orderId} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Route summary */}
              <div className="text-xs text-charcoal-500 font-medium">
                <span className="text-white">→</span> {order.dropoff_name?.split(",")[0]}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
