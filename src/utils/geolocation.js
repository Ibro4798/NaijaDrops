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
                updateStatus("ðŸŒ Resolving city via IP...");
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
            updateStatus("ðŸ›°ï¸ Synchronizing GPS...");

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
                        updateStatus(`ðŸŽ¯ Precision Lock: Â±${Math.round(pos.coords.accuracy)}m`);
                    }

                    // If we get an extremely good lock (<20m), resolve immediately
                    if (pos.coords.accuracy < 20 && pingsReceived > 1) {
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

            // Force resolve after 5 seconds of stabilization
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
                        updateStatus("âŒ Location failed.");
                        resolve(null);
                    }
                }
            }, 5000); 

        } else {
            const ipLoc = await getIPLocation();
            resolve(ipLoc);
        }
    });
}
/**
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
