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
    return new Promise(async (resolve) => {
        const hasMapbox = typeof process !== 'undefined' && !!process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
        
        let locationFound = false;
        let bestReading = null;
        let pingsReceived = 0;

        const updateStatus = (msg) => {
            if (onProgress) onProgress(msg);
        };

        // Real IP-based Geolocation Fallback
        const getIPLocation = async () => {
            try {
                updateStatus("🌍 Resolving city via IP...");
                const res = await fetch('https://ipapi.co/json/');
                const data = await res.json();
                if (data.latitude && data.longitude) {
                    return {
                        lat: data.latitude,
                        lng: data.longitude,
                        city: data.city,
                        accuracy: 5000,
                        source: 'ip-api'
                    };
                }
            } catch (e) {
                console.error("IP Geolocate failed:", e);
            }
            return null;
        };

        if ("geolocation" in navigator) {
            updateStatus("🛰️ Synchronizing GPS...");

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
                        updateStatus(`🎯 Precision Lock: ±${Math.round(pos.coords.accuracy)}m`);
                    }

                    // FIX: previously required accuracy < 20m AND a second ping
                    // before resolving early - on a phone that only ever reports
                    // ~30-40m accuracy (common indoors/under cloud cover in Kano)
                    // this condition never fired, so every single request paid
                    // the full 5-second forced wait below. 50m is still a solid,
                    // usable fix for picking a delivery address, and firing on
                    // the very first ping (not just the second) saves real time
                    // on a clean GPS lock.
                    if (pos.coords.accuracy < 50) {
                        cleanup();
                        resolve(bestReading);
                    }
                },
                (err) => {
                    console.warn("GPS Watch failed:", err.message);
                },
                { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
            );

            const cleanup = () => {
                locationFound = true;
                navigator.geolocation.clearWatch(watchId);
            };

            // FIX: reduced from 5000ms to 2500ms. This was a flat wait applied
            // on every call regardless of how good the reading already was -
            // the single biggest contributor to "the location button is slow."
            // Readings that don't stabilize to a usable accuracy in 2.5s are
            // unlikely to improve much by waiting longer anyway; the IP
            // fallback below still catches anything genuinely bad.
            setTimeout(async () => {
                if (locationFound) return;
                cleanup();

                if (bestReading && bestReading.accuracy < 200) {
                    resolve(bestReading);
                } else {
                    const ipLoc = await getIPLocation();
                    if (ipLoc) {
                        resolve(ipLoc);
                    } else if (bestReading) {
                        resolve(bestReading); // Use the poor GPS reading if IP fails too
                    } else {
                        // Ultimate fallback: Null or let user know
                        updateStatus("❌ Location failed.");
                        resolve(null);
                    }
                }
            }, 2500); 

        } else {
            const ipLoc = await getIPLocation();
            resolve(ipLoc);
        }
    });
}
/**
 * @deprecated No longer used anywhere in the app as of this fix. This was a
 * bare one-shot navigator.geolocation.getCurrentPosition() call with a flat
 * 10s timeout and zero fallback - on weak/indoor GPS signal it just failed
 * outright, which is what made "use my location" buttons feel unreliable.
 * Every location button in the app now calls getReliableLocation() above
 * instead. Left in place only in case anything outside this codebase still
 * imports it directly - safe to delete once confirmed unused.
 * Industry Standard Geolocation (One-shot)
 * Used for "Use Current Location" buttons
 */
export async function getCurrentPositionStandard() {
    return new Promise((resolve, reject) => {
        if (!("geolocation" in navigator)) {
            reject(new Error("Location services not supported."));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                resolve({
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                    accuracy: pos.coords.accuracy,
                    source: 'standard-gps'
                });
            },
            (err) => {
                reject(err);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    });
}