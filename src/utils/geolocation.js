/**
 * Reliable Geolocation Utility
 *
 * Deterministic accuracy rules used across the app (both the one-time
 * "Use My Location" flow below AND the rider's live-tracking heartbeat in
 * DriverHeartbeat.jsx), tuned for Nigerian mobile networks specifically:
 *
 * 1. IP-based location has been removed entirely from the interactive
 *    "Use My Location" flow. It was kept as a last-resort fallback before,
 *    but repeated real-world testing showed it is simply not reliable
 *    enough to ever hand back as a real answer here: it resolves to the
 *    mobile carrier's gateway city, not the device, and on Nigerian mobile
 *    networks that can be a different part of the state entirely - this
 *    was the single biggest source of "location is completely wrong."
 *    GPS-only now. If GPS genuinely can't get a fix, this returns null and
 *    the caller shows a clear "couldn't get your location" message asking
 *    the person to retry or check location permissions, rather than
 *    silently handing back a guess that might be tens of kilometers off.
 * 2. A reading is only trusted immediately if it's excellent (<25m). A
 *    "good enough" reading (25-60m - the common case on budget Android
 *    phones here, indoors or under cloud cover) needs a second confirming
 *    ping ONLY if the first ping came back suspiciously fast (<2s) - that's
 *    the actual signature of a phone's low-quality "quick fix" right after
 *    a cold start still reporting a deceptively reasonable accuracy number.
 *    A first ping that took its time to arrive (the normal case on budget
 *    hardware here) is trusted as soon as it clears 60m, rather than always
 *    forcing a second wait regardless of how the first one behaved.
 * 3. Give it real time - 15 seconds normally - for a genuine device fix to
 *    come back, since there's no fallback to fall through to anymore if it
 *    gives up too early. On a detected slow connection this window is
 *    extended (see isSlowConnection/isConstrainedConnection below): most
 *    phones use Assisted GPS, which downloads a small ephemeris/almanac
 *    file over the network to speed up the very first fix. On a weak
 *    Kano mobile signal that download itself can take 15-20+ seconds
 *    before the GPS radio has even started really narrowing things down,
 *    which is exactly what made this feel "broken" on a slow connection -
 *    it wasn't that GPS failed, it was that assistance data hadn't
 *    finished downloading before the old fixed timeout gave up.
 * 4. For CONTINUOUS tracking (not just a one-time button press - see
 *    isPlausibleMove below), a single wildly-off reading is rejected by a
 *    speed sanity check rather than blindly overwriting the last known-good
 *    position. A rider/vendor physically cannot teleport 10km in 20
 *    seconds; a reading that implies that is noise, not movement.
 * 5. A separate low-accuracy, short-timeout getCurrentPosition call runs
 *    alongside the watch below purely to paint an approximate pin fast
 *    (~1-3s on most hardware). This is still real device location - GPS,
 *    WiFi, or cell-tower positioning depending on what the device has a
 *    fix on - never the removed IP fallback, which resolved to the mobile
 *    carrier's gateway city rather than the device. It only ever feeds the
 *    onProgress callback for an early "approximate, locking..." paint; it
 *    is never used as the resolved answer.
 * 6. onProgress(message, reading) now receives a second argument: the best
 *    reading known at that moment (approximate or GPS-watch), or null
 *    before anything has come back yet. Callers that want a live-updating
 *    pin (paint approximate immediately, refine as better fixes arrive)
 *    can use it; callers that only want the status text can ignore it.
 * 7. Every reading also carries a `usable` boolean - true once its accuracy
 *    is <=150m, OR once 8 seconds have passed with nothing better (so a
 *    genuinely poor-signal device doesn't hang forever). This exists
 *    because a caller that wants to act immediately on the FIRST reading
 *    (e.g. reverse-geocode it and let someone move on to the next screen -
 *    see send-package/step-1) needs a floor on how bad that first reading
 *    is allowed to be. The coarse approximate fetch above (point 5) has no
 *    accuracy ceiling of its own - on sparse cell-tower coverage it can be
 *    off by hundreds of meters to a few kilometers - so committing to it
 *    unconditionally as soon as it arrives risks reverse-geocoding, and
 *    locking in, the wrong neighborhood entirely. `usable` is the signal
 *    for "safe to act on now"; readings that aren't yet usable are still
 *    passed through (so a caller can move a live pin around for visual
 *    feedback) but callers should not commit to them as a final answer.
 */

const USABLE_ACCURACY_M = 150;
const MAX_WAIT_FOR_USABLE_MS = 8000;

// Shared connection-quality helpers (used here and by DriverHeartbeat) so
// "slow connection" means the same thing everywhere in the app.
export function isSlowConnection() {
    if (typeof navigator === "undefined") return false;
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!conn) return false;
    return conn.effectiveType === "slow-2g" || conn.effectiveType === "2g" || conn.saveData === true;
}

// A wider net than isSlowConnection - also catches 3G, which is common
// enough in Kano to matter for "how long should we wait for a GPS fix",
// even though it isn't slow enough to need the heartbeat's push-interval
// backoff.
export function isConstrainedConnection() {
    if (typeof navigator === "undefined") return false;
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!conn) return false;
    if (isSlowConnection()) return true;
    return conn.effectiveType === "3g";
}

export async function getReliableLocation(onProgress) {
    return new Promise((resolve) => {
        let locationFound = false;
        let bestReading = null;
        let pingsReceived = 0;
        let requireConfirmingPing = false;
        const startTime = Date.now();

        // Second arg is optional - existing callers that only read the
        // status string are unaffected.
        const updateStatus = (msg, reading = null) => {
            if (onProgress) onProgress(msg, reading || bestReading);
        };

        if (!("geolocation" in navigator)) {
            updateStatus("❌ This device/browser doesn't support location.");
            resolve(null);
            return;
        }

        const constrained = isConstrainedConnection();
        const overallTimeoutMs = constrained ? 32000 : 15000;
        const perFixTimeoutMs = constrained ? 40000 : 20000;

        updateStatus(
            constrained
                ? "🐢 Slow connection detected - locking your GPS may take a little longer..."
                : "🛰️ Getting your GPS location..."
        );

        // FIX: fires alongside the high-accuracy watch below purely to get
        // something paintable on screen fast. enableHighAccuracy:false lets
        // the device answer from whatever it already has a cheap fix on
        // (often WiFi/cell positioning, sometimes a very recent GPS fix)
        // instead of waiting on a fresh high-accuracy GPS lock. A short
        // timeout means it either helps within a few seconds or gets out of
        // the way - it never delays or replaces the real answer, and it
        // never touches bestReading, so it can't be resolved as the final
        // result even if the high-accuracy watch is still running.
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                if (locationFound) return;
                const approx = {
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                    accuracy: pos.coords.accuracy,
                    source: 'approx',
                    usable: pos.coords.accuracy <= USABLE_ACCURACY_M || (Date.now() - startTime) >= MAX_WAIT_FOR_USABLE_MS
                };
                updateStatus("📍 Approximate location found - locking precise GPS...", approx);
            },
            () => { /* not fatal - the high-accuracy watch below is the real attempt */ },
            { enableHighAccuracy: false, maximumAge: 10000, timeout: 3000 }
        );

        const cleanup = () => {
            locationFound = true;
            navigator.geolocation.clearWatch(watchId);
        };

        const watchId = navigator.geolocation.watchPosition(
            (pos) => {
                pingsReceived++;
                const elapsedMs = Date.now() - startTime;

                if (!bestReading || pos.coords.accuracy < bestReading.accuracy) {
                    bestReading = {
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude,
                        accuracy: pos.coords.accuracy,
                        source: 'gps',
                        usable: pos.coords.accuracy <= USABLE_ACCURACY_M || elapsedMs >= MAX_WAIT_FOR_USABLE_MS
                    };
                    updateStatus(`🎯 Precision Lock: ±${Math.round(pos.coords.accuracy)}m`, bestReading);
                }

                // FIX: previously always demanded a second ping for any
                // 25-60m reading, even on hardware where the first fix
                // genuinely took its time (the normal case here, not the
                // "quick fix" failure mode this guard exists for). Now the
                // confirming-ping requirement only switches on when the
                // first ping itself was suspiciously fast (<2s) - that
                // timing, not just the accuracy number, is the real
                // fingerprint of a cold-start "quick fix."
                if (pingsReceived === 1 && elapsedMs < 2000) {
                    requireConfirmingPing = true;
                }

                const isExcellent = pos.coords.accuracy < 25;
                const isGoodEnough =
                    pos.coords.accuracy < 60 && (!requireConfirmingPing || pingsReceived >= 2);

                if (isExcellent || isGoodEnough) {
                    cleanup();
                    resolve(bestReading);
                }
            },
            (err) => {
                console.warn("GPS Watch failed:", err.message);
            },
            { enableHighAccuracy: true, maximumAge: 0, timeout: perFixTimeoutMs }
        );

        // Normally 15 seconds to get a real device fix, extended on a
        // detected slow/constrained connection so a legitimately-working
        // GPS isn't cut off mid-acquisition. If nothing usable came back
        // by then, resolve with whatever the best reading so far was
        // (even a so-so one is still real GPS, not a random guess) - or
        // null if we truly got nothing at all, so the caller can show a
        // clear retry prompt instead of silently using a bad location.
        setTimeout(() => {
            if (locationFound) return;
            cleanup();

            if (bestReading) {
                resolve(bestReading);
            } else {
                updateStatus("❌ Couldn't get a GPS lock. Check location permissions and try again.");
                resolve(null);
            }
        }, overallTimeoutMs);
    });
}

/**
 * Haversine distance between two lat/lng points, in meters.
 */
export function distanceMeters(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Deterministic jump-rejection for continuous tracking (the rider
 * heartbeat). Returns false if the implied speed between two readings is
 * physically impossible for a bike/car courier, meaning the NEW reading is
 * almost certainly noise (a bad single-shot GPS fix, or a network-position
 * fallback landing far away) and should be discarded in favor of keeping
 * the last known-good position.
 *
 * maxSpeedKph defaults to 100 - generous enough to never reject genuine
 * motorbike/car movement in city traffic, but tight enough to catch the
 * multi-kilometer "teleports" that show up as a rider's dot jumping across
 * the map on a bad reading.
 */
export function isPlausibleMove(prev, next, maxSpeedKph = 100) {
    if (!prev || !next) return true; // nothing to compare against yet - accept it
    const elapsedHours = (next.timestamp - prev.timestamp) / 3600000;
    if (elapsedHours <= 0) return true;
    const meters = distanceMeters(prev.lat, prev.lng, next.lat, next.lng);
    const impliedKph = (meters / 1000) / elapsedHours;
    return impliedKph <= maxSpeedKph;
}