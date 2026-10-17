"use client";

/**
 * Prominent in-app disclosure shown BEFORE the system location prompt
 * (required by Google Play's User Data policy for apps that collect
 * location). Resolves true if the person agrees, false if they decline.
 * The agreement is remembered on this device. Anyone who had already
 * granted location permission before this shipped is treated as agreed
 * so existing users are not interrupted.
 */
const STORAGE_KEY = "nd_location_disclosure_v1";
let pending = null;

function readAccepted() {
  try { return localStorage.getItem(STORAGE_KEY) === "accepted"; } catch { return false; }
}
function writeAccepted() {
  try { localStorage.setItem(STORAGE_KEY, "accepted"); } catch { /* storage unavailable */ }
}

function showDisclosure() {
  return new Promise((resolve) => {
    const previouslyFocused = document.activeElement;
    const overlay = document.createElement("div");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "nd-loc-title");
    overlay.className = "fixed inset-0 z-[3000] flex items-end sm:items-center justify-center bg-black/70 p-4";
    overlay.innerHTML = `
      <div class="w-full max-w-md rounded-3xl border border-white/10 bg-[#0f1412] p-6 text-white shadow-2xl">
        <div class="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-2xl">&#128205;</div>
        <h2 id="nd-loc-title" class="mb-3 text-xl font-black tracking-tight">NaijaDrops uses your location</h2>
        <p class="mb-3 text-sm leading-relaxed text-gray-300">
          We collect your device&rsquo;s location to set pickup and drop-off points, show nearby riders,
          match riders with nearby orders, and let customers and vendors follow a delivery live on the map.
        </p>
        <p class="mb-3 text-sm leading-relaxed text-gray-300">
          For riders, your location is collected while you are online or on a delivery and the app is open,
          and is shown to the vendor and customer on your order. We do not collect location when the app is closed.
        </p>
        <p class="mb-5 text-xs leading-relaxed text-gray-500">
          Location is shared with our map provider (Mapbox) to draw maps and routes.
          See our <a href="/privacy" target="_blank" rel="noopener" class="text-emerald-400 underline">Privacy Policy</a>.
        </p>
        <div class="flex flex-col gap-2">
          <button type="button" data-nd="accept" class="w-full rounded-2xl bg-emerald-500 py-4 text-sm font-black uppercase tracking-widest text-black">Agree and continue</button>
          <button type="button" data-nd="decline" class="w-full rounded-2xl border border-white/10 bg-white/5 py-3 text-xs font-black uppercase tracking-widest text-gray-300">Not now</button>
        </div>
      </div>`;

    const finish = (accepted) => {
      document.removeEventListener("keydown", onKey);
      overlay.remove();
      try { previouslyFocused?.focus?.(); } catch { /* element gone */ }
      if (accepted) writeAccepted();
      resolve(accepted);
    };
    const onKey = (e) => { if (e.key === "Escape") finish(false); };

    overlay.querySelector('[data-nd="accept"]').addEventListener("click", () => finish(true));
    overlay.querySelector('[data-nd="decline"]').addEventListener("click", () => finish(false));
    document.addEventListener("keydown", onKey);
    document.body.appendChild(overlay);
    overlay.querySelector('[data-nd="accept"]').focus();
  });
}

export async function ensureLocationDisclosure() {
  if (typeof window === "undefined" || typeof document === "undefined") return true;
  if (readAccepted()) return true;

  try {
    if (navigator.permissions?.query) {
      const status = await navigator.permissions.query({ name: "geolocation" });
      if (status.state === "granted") {
        writeAccepted();
        return true;
      }
    }
  } catch {
    // Permissions API unavailable - fall through and show the disclosure.
  }

  if (!pending) {
    pending = showDisclosure().finally(() => { pending = null; });
  }
  return pending;
}
