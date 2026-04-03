/**
 * Reliable Geolocation Utility
 * Tiered fetching: GPS -> Wifi/Cell -> IP-API Fallback
 */

const DEMO_LOCATION = {
    lat: 12.0022,
    lng: 8.5167,
    accuracy: 10,
    source: 'demo'
};

export async function getReliableLocation(onProgress) {
    // Check if we are in demo mode (no map key)
    return new Promise(async (resolve) => {
        const hasMapbox = typeof process !== 'undefined' && !!process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
        
        if (!hasMapbox) {
            if (onProgress) onProgress("✨ Demo Localize: BUK Kano");
            // Default to BUK Kano for demo if no mapbox token is present
            setTimeout(() => resolve({ lat: 11.9746, lng: 8.4357, accuracy: 10, source: 'demo' }), 1000);
            return;
        }

        let locationFound = false;
        // ... rest of the function
        let bestReading = null;
        let pingsReceived = 0;

        const updateStatus = (msg) => {
            if (onProgress) onProgress(msg);
        };

        const ipFallbackPromise = fetch('https://ipapi.co/json/')
            .then(res => res.json())
            .then(data => {
                if (data.latitude && data.longitude) {
                    return {
                        lat: data.latitude,
                        lng: data.longitude,
                        accuracy: 5000,
                        source: 'ip'
                    };
                }
                throw new Error("IP location failed");
            })
            .catch(() => null);

        if ("geolocation" in navigator) {
            updateStatus("🛰️ Stabilizing GPS...");

            // Accuracy Buffering logic: Catch multiple pings and keep the most accurate one
            const watchId = navigator.geolocation.watchPosition(
                (pos) => {
                    pingsReceived++;
                    if (!bestReading || pos.coords.accuracy < bestReading.accuracy) {
                        bestReading = {
                            lat: pos.coords.latitude,
                            lng: pos.coords.longitude,
                            accuracy: pos.coords.accuracy,
                            source: 'gps'
                        };
                        updateStatus(`🎯 Lock focus: ±${Math.round(pos.coords.accuracy)}m`);
                    }

                    // If we get an extremely good lock (<30m), we can resolve faster
                    if (pos.coords.accuracy < 30 && pingsReceived > 1) {
                        cleanup();
                        resolve(bestReading);
                    }
                },
                (err) => {
                    console.warn("GPS Watch failed:", err.message);
                },
                { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
            );

            const cleanup = () => {
                locationFound = true;
                navigator.geolocation.clearWatch(watchId);
            };

            // Force resolve after 3 seconds of stabilization (FIX #9: reduced from 6 seconds for faster UX)
            setTimeout(async () => {
                if (locationFound) return;
                cleanup();

                if (bestReading) {
                    resolve(bestReading);
                } else {
                    updateStatus("🌍 Using regional estimate...");
                    const ipLoc = await ipFallbackPromise;
                    resolve(ipLoc || { lat: 12.0022, lng: 8.5920, accuracy: 5000, source: 'demo' });
                }
            }, 3000);  // ← REDUCED FROM 6 SECONDS

        } else {
            const ipLoc = await ipFallbackPromise;
            resolve(ipLoc);
        }
    });
}
