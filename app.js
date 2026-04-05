document.addEventListener('DOMContentLoaded', () => {
    // --- SPA State ---
    let currentView = 'home';

    const appViews = {
        home: document.getElementById('homeContainer'),
        form: document.getElementById('unifiedFormContainer'),
        pricing: document.getElementById('pricingContainer'),
        matching: document.getElementById('matchingContainer'),
        summary: document.getElementById('finalSummaryContainer'),
        payment: document.getElementById('paymentContainer'),
        tracking: document.getElementById('trackingContainer'),
        driverOnboarding: document.getElementById('driverOnboardingContainer'),
        driverDashboard: document.getElementById('driverDashboardContainer')
    };

    // Wire the Send Package button properly for Android (avoids click ghost issues)
    const sendPackageBtn = document.getElementById('sendPackageBtn');
    if (sendPackageBtn) {
        // Use both click and touchend for reliable Android response
        let tapped = false;
        sendPackageBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            if (tapped) return;
            tapped = true;
            setTimeout(() => { tapped = false; }, 300);
            navigateSPA('form');
        }, { passive: false });
        sendPackageBtn.addEventListener('click', () => {
            navigateSPA('form');
        });
    }

    window.navigateSPA = function (viewKey) {
        // Hide all views
        Object.values(appViews).forEach(view => {
            if (view && typeof view.classList !== 'undefined') {
                view.classList.add('hidden');
                if (view.id === 'matchingContainer') view.style.display = 'none';
                if (view.id === 'finalSummaryContainer') view.style.display = 'none';
                if (view.id === 'driverDashboardContainer') view.style.display = 'none';
            }
        });

        // Show target view
        if (appViews[viewKey]) {
            appViews[viewKey].classList.remove('hidden');
            if (viewKey === 'matching' || viewKey === 'summary' || viewKey === 'driverDashboard') {
                appViews[viewKey].style.display = 'flex';
                if (viewKey === 'summary') appViews[viewKey].parentElement.classList.remove('hidden');
            }
            currentView = viewKey;
            window.scrollTo({ top: 0, behavior: 'smooth' });
            // Refresh saved locations when opening the form
            if (viewKey === 'form') renderSavedLocChips();
        }
    };

    // --- Data Store Abstraction (Firebase Ready) ---
    // This abstracts the data layer so Firebase can be dropped in easily later.
    const DataStore = {
        saveOrder: function (orderData) {
            console.log("Saving order to DB...", orderData);
            // Simulate network delay
            return new Promise((resolve) => setTimeout(() => {
                const orderId = 'ND-' + Math.random().toString(36).substr(2, 6).toUpperCase();
                // In a real app, this goes to localStorage or Firebase
                const orders = JSON.parse(localStorage.getItem('naijaDropsOrders') || '[]');
                orders.push({ id: orderId, ...orderData, status: 'active', createdAt: new Date() });
                localStorage.setItem('naijaDropsOrders', JSON.stringify(orders));
                resolve(orderId);
            }, 500));
        },
        getActiveOrders: function () {
            return JSON.parse(localStorage.getItem('naijaDropsOrders') || '[]').filter(o => o.status === 'active');
        }
    };

    // --- Data State ---
    let pickupData = { area: '', landmark: '', coords: null, voiceDuration: 0 };
    let dropoffData = { area: '', landmark: '', coords: null, voiceDuration: 0 };
    let selectedSize = null;
    let selectedCategory = null;
    let currentVoiceTarget = null; // 'Pickup' or 'Dropoff'
    let calculatedRawCost = 0;
    let selectedFinalCost = 0;

    // --- DOM Elements ---
    const unifiedFormContainer = document.getElementById('unifiedFormContainer');
    const homeContainer = document.getElementById('homeContainer');
    const calculateSaveBtn = document.getElementById('calculateSaveBtn');

    // Autocomplete UI
    const pickupSearchInput = document.getElementById('pickupSearchInput');
    const pickupSearchResults = document.getElementById('pickupSearchResults');
    const pickupSelectedState = document.getElementById('pickupSelectedState');

    const dropoffSearchInput = document.getElementById('dropoffSearchInput');
    const dropoffSearchResults = document.getElementById('dropoffSearchResults');
    const dropoffSelectedState = document.getElementById('dropoffSelectedState');

    // Receiver UI
    const receiverNameInput = document.getElementById('receiverNameInput');
    const receiverPhoneInput = document.getElementById('receiverPhoneInput');

    // Voice Note Modal UI
    const voiceNoteModal = document.getElementById('voiceNoteModal');
    const voiceNoteTitle = document.getElementById('voiceNoteTitle');
    const voiceNoteLandmarkContext = document.getElementById('voiceNoteLandmarkContext');
    const closeVoiceNoteBtn = document.getElementById('closeVoiceNoteBtn');

    const micButton = document.getElementById('micButton');
    const recordingWaveform = document.getElementById('recordingWaveform');
    const recordingTimer = document.getElementById('recordingTimer');
    const micInstructionLabel = document.getElementById('micInstructionLabel');
    const playbackContainer = document.getElementById('playbackContainer');
    const playbackDuration = document.getElementById('playbackDuration');
    const retakeBtn = document.getElementById('retakeBtn');
    const confirmVoiceNoteBtn = document.getElementById('confirmVoiceNoteBtn');

    // Final UI
    const matchingContainer = document.getElementById('matchingContainer');
    const driverOfferCard = document.getElementById('driverOfferCard');
    const waitingState = document.getElementById('waitingState');
    const driverOfferAmount = document.getElementById('driverOfferAmount');
    const rejectOfferBtn = document.getElementById('rejectOfferBtn');
    const acceptOfferBtn = document.getElementById('acceptOfferBtn');
    const finalSummaryContainer = document.getElementById('finalSummaryContainer');

    function showToast(message, type = 'error') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast-notification show ${type}`;
        setTimeout(() => toast.className = 'toast-notification', 4000);
    }

    // --- 1. Built-in Kano Location Database (No External API Required) ---
    const KANO_LOCATIONS = [
        { name: "Nassarawa GRA", area: "Nassarawa, Kano", lat: 12.0022, lng: 8.5167 },
        { name: "Sabon Gari", area: "Fagge, Kano", lat: 11.9644, lng: 8.5250 },
        { name: "Kwari Market", area: "Kwari, Fagge, Kano", lat: 11.9950, lng: 8.5178 },
        { name: "BUK Old Campus", area: "Bayero University, Kano", lat: 12.0489, lng: 8.4840 },
        { name: "BUK New Campus", area: "Bayero University, Kano", lat: 11.9753, lng: 8.4166 },
        { name: "Zoo Road", area: "Zoo Road, Kano", lat: 12.0063, lng: 8.4963 },
        { name: "Hotoro GRA", area: "Hotoro, Kano", lat: 12.0375, lng: 8.4762 },
        { name: "Court Road", area: "Court Road, Kano", lat: 12.0008, lng: 8.5131 },
        { name: "Kofar Mata", area: "Kano Municipal, Kano", lat: 12.0084, lng: 8.5262 },
        { name: "Bompai", area: "Bompai Industrial, Kano", lat: 12.0234, lng: 8.5369 },
        { name: "Audu Bako Secretariat", area: "Audu Bako Road, Kano", lat: 11.9978, lng: 8.5228 },
        { name: "Murtala Muhammed Way", area: "City Center, Kano", lat: 12.0003, lng: 8.5178 },
        { name: "Ibrahim Taiwo Road", area: "City Center, Kano", lat: 11.9967, lng: 8.5183 },
        { name: "Farm Center", area: "Farm Center, Kano", lat: 12.0128, lng: 8.5050 },
        { name: "Fagge", area: "Fagge LGA, Kano", lat: 11.9733, lng: 8.5289 },
        { name: "Sharada Industrial", area: "Sharada, Kano", lat: 11.9489, lng: 8.4750 },
        { name: "Tarauni", area: "Tarauni LGA, Kano", lat: 11.9625, lng: 8.4958 },
        { name: "Gyadi-Gyadi", area: "Gyadi-Gyadi, Kano", lat: 12.0342, lng: 8.5042 },
        { name: "Rijiyar Zaki", area: "Rijiyar Zaki, Kano", lat: 12.0425, lng: 8.5108 },
        { name: "Dorayi", area: "Dorayi, Gwale, Kano", lat: 11.9775, lng: 8.4775 },
        { name: "Yankaba", area: "Yankaba, Nassarawa, Kano", lat: 11.9817, lng: 8.5417 },
        { name: "Kurna", area: "Kurna, Kano", lat: 12.0158, lng: 8.5333 },
        { name: "Brigade", area: "Brigade, Kano", lat: 12.0492, lng: 8.5208 },
        { name: "Dakata", area: "Dakata, Kano", lat: 11.9533, lng: 8.5700 },
        { name: "Dan Agundi", area: "Dan Agundi, Kano", lat: 12.0267, lng: 8.5000 },
        { name: "Wapa", area: "Wapa, Kano", lat: 11.9928, lng: 8.4617 },
        { name: "Badawa", area: "Badawa, Kano", lat: 12.0189, lng: 8.5125 },
        { name: "Kano City Wall", area: "Old City, Kano", lat: 12.0000, lng: 8.5200 },
        { name: "Hausawa", area: "Nassarawa, Kano", lat: 11.9883, lng: 8.5333 },
        { name: "Dawanau", area: "Dawanau, Kano", lat: 12.0567, lng: 8.4583 },
    ];

    let activeMapType = null;

    // UI Elements for Map Modal
    const mapModal = document.getElementById('mapModal');
    const closeMapBtn = document.getElementById('closeMapBtn');
    const confirmMapPinBtn = document.getElementById('confirmMapPinBtn');
    const mapConfirmedName = document.getElementById('mapConfirmedName');
    const mapConfirmedAddress = document.getElementById('mapConfirmedAddress');
    const mapAddressLoading = document.getElementById('mapAddressLoading');
    const mapAddressContent = document.getElementById('mapAddressContent');
    const mapModalTitle = document.getElementById('mapModalTitle');

    // 1A. Custom Autocomplete (replaces Google Places)
    function searchLocations(query) {
        if (!query || query.length < 2) return [];
        const q = query.toLowerCase();
        return KANO_LOCATIONS.filter(loc =>
            loc.name.toLowerCase().includes(q) ||
            loc.area.toLowerCase().includes(q)
        ).slice(0, 6);
    }

    function renderSearchResults(results, containerEl, type) {
        if (results.length === 0) {
            containerEl.classList.add('hidden');
            return;
        }
        containerEl.innerHTML = results.map((loc, i) => `
            <div class="search-result-item px-4 py-3 hover:bg-emerald-50 cursor-pointer transition-colors border-b border-gray-50 last:border-0 flex items-center gap-3"
                 data-idx="${i}" data-type="${type}" data-name="${loc.name}" data-area="${loc.area}" data-lat="${loc.lat}" data-lng="${loc.lng}">
                <div class="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0">
                    <svg class="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                </div>
                <div>
                    <div class="font-bold text-charcoal-900 text-sm">${loc.name}</div>
                    <div class="text-charcoal-500 text-xs font-medium">${loc.area}</div>
                </div>
            </div>
        `).join('');
        containerEl.classList.remove('hidden');

        containerEl.querySelectorAll('.search-result-item').forEach(el => {
            el.addEventListener('click', () => {
                const name = el.dataset.name;
                const area = el.dataset.area;
                const lat = parseFloat(el.dataset.lat);
                const lng = parseFloat(el.dataset.lng);
                const t = el.dataset.type;
                openMapModal(lat, lng, t, name, area);
                if (t === 'pickup') {
                    pickupSearchInput.value = '';
                    pickupSearchResults.classList.add('hidden');
                } else {
                    dropoffSearchInput.value = '';
                    dropoffSearchResults.classList.add('hidden');
                }
            });
        });
    }

    // (Input listeners are set up via enhancedAutocomplete below)

    // Close results when clicking outside
    document.addEventListener('click', (e) => {
        if (!pickupSearchInput.contains(e.target) && !pickupSearchResults.contains(e.target)) {
            pickupSearchResults.classList.add('hidden');
        }
        if (!dropoffSearchInput.contains(e.target) && !dropoffSearchResults.contains(e.target)) {
            dropoffSearchResults.classList.add('hidden');
        }
    });

    // ============================================================
    // === LOCATION LINK PARSER (Google Maps, Apple Maps, raw coords) ===
    // ============================================================
    function parseLocationLink(input) {
        if (!input || typeof input !== 'string') return null;
        const text = input.trim();

        // 1. Raw coordinates: "12.001, 8.523" or "12.001 8.523" or "12.001,8.523"
        const rawCoordsMatch = text.match(/^(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)$/);
        if (rawCoordsMatch) {
            const lat = parseFloat(rawCoordsMatch[1]);
            const lng = parseFloat(rawCoordsMatch[2]);
            if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                return { lat, lng, source: 'coordinates' };
            }
        }

        // 2. Google Maps URL patterns
        // Pattern: /@lat,lng,zoom or /place/.../@lat,lng
        const atMatch = text.match(/@(-?\d+\.?\d+),(-?\d+\.?\d+)/);
        if (atMatch) {
            return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]), source: 'google_maps' };
        }

        // Pattern: ?q=lat,lng or &ll=lat,lng or &sll=lat,lng
        const qMatch = text.match(/[?&](?:q|ll|sll|center)=(-?\d+\.?\d+),(-?\d+\.?\d+)/);
        if (qMatch) {
            return { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]), source: 'google_maps' };
        }

        // Pattern: /maps/place/lat,lng
        const placeMatch = text.match(/maps\/place\/(-?\d+\.?\d+),(-?\d+\.?\d+)/);
        if (placeMatch) {
            return { lat: parseFloat(placeMatch[1]), lng: parseFloat(placeMatch[2]), source: 'google_maps' };
        }

        // Pattern: google.com/maps/dir/lat,lng/lat,lng (directions — grab destination)
        const dirMatch = text.match(/maps\/dir\/[^/]+\/(-?\d+\.?\d+),(-?\d+\.?\d+)/);
        if (dirMatch) {
            return { lat: parseFloat(dirMatch[1]), lng: parseFloat(dirMatch[2]), source: 'google_maps_directions' };
        }

        // Pattern: plus code in URL (e.g. maps/place/WXYZ+AB)
        // We'll handle plus codes separately below

        // 3. Apple Maps: maps.apple.com/?ll=lat,lng or maps.apple.com/?q=lat,lng
        const appleMatch = text.match(/maps\.apple\.com.*[?&](?:ll|q)=(-?\d+\.?\d+),(-?\d+\.?\d+)/);
        if (appleMatch) {
            return { lat: parseFloat(appleMatch[1]), lng: parseFloat(appleMatch[2]), source: 'apple_maps' };
        }

        // 4. Yandex Maps: yandex.com/maps/?ll=lng,lat (note: Yandex uses lng,lat order!)
        const yandexMatch = text.match(/yandex\.\w+\/maps.*[?&]ll=(-?\d+\.?\d+),(-?\d+\.?\d+)/);
        if (yandexMatch) {
            return { lat: parseFloat(yandexMatch[2]), lng: parseFloat(yandexMatch[1]), source: 'yandex_maps' };
        }

        // 5. OpenStreetMap: openstreetmap.org/#map=zoom/lat/lng
        const osmMatch = text.match(/openstreetmap\.org.*#map=\d+\/(-?\d+\.?\d+)\/(-?\d+\.?\d+)/);
        if (osmMatch) {
            return { lat: parseFloat(osmMatch[1]), lng: parseFloat(osmMatch[2]), source: 'openstreetmap' };
        }

        // 6. Here Maps: wego.here.com/?map=lat,lng
        const hereMatch = text.match(/here\.com.*[?&]map=(-?\d+\.?\d+),(-?\d+\.?\d+)/);
        if (hereMatch) {
            return { lat: parseFloat(hereMatch[1]), lng: parseFloat(hereMatch[2]), source: 'here_maps' };
        }

        // 7. Generic: any URL containing lat/lng-looking numbers after common location path segments
        const genericUrlMatch = text.match(/(?:maps|place|location|loc|geo|point|pin).*?(-?\d{1,3}\.\d{3,})[,/\s]+(-?\d{1,3}\.\d{3,})/i);
        if (genericUrlMatch) {
            const lat = parseFloat(genericUrlMatch[1]);
            const lng = parseFloat(genericUrlMatch[2]);
            if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                return { lat, lng, source: 'generic_url' };
            }
        }

        // 8. Short links (goo.gl, maps.app.goo.gl, bit.ly, tinyurl) — resolve via CORS proxy
        if (text.match(/goo\.gl|maps\.app\.goo\.gl|bit\.ly|tinyurl\.com|shorturl|is\.gd|t\.co/i)) {
            return { needs_resolve: true, url: text, source: 'short_link' };
        }

        return null;
    }

    // ============================================================
    // === SHORT LINK RESOLVER (via CORS proxy) ===
    // ============================================================
    async function resolveShortLink(shortUrl) {
        // Normalize: ensure it starts with https://
        let url = shortUrl.trim();
        if (!url.startsWith('http')) url = 'https://' + url;

        // Try multiple CORS proxies as fallbacks
        const proxies = [
            (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
            (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
        ];

        for (const makeProxyUrl of proxies) {
            try {
                const proxyUrl = makeProxyUrl(url);
                const response = await fetch(proxyUrl, {
                    method: 'GET',
                    redirect: 'follow',
                    headers: { 'Accept': 'text/html' }
                });

                // Check the final URL (after redirects) — some proxies expose it
                const finalUrl = response.url || '';
                const text = await response.text();

                // First try: parse the final URL for coordinates
                const fromFinalUrl = parseLocationLink(finalUrl);
                if (fromFinalUrl && fromFinalUrl.lat) return fromFinalUrl;

                // Second try: look for coordinates in the HTML content
                // Google Maps pages embed coordinates in various places
                const patterns = [
                    /@(-?\d+\.\d+),(-?\d+\.\d+)/,
                    /center=(-?\d+\.\d+)%2C(-?\d+\.\d+)/,
                    /center=(-?\d+\.\d+),(-?\d+\.\d+)/,
                    /\[(-?\d+\.\d{4,}),\s*(-?\d+\.\d{4,})\]/,
                    /"lat":(-?\d+\.\d+),"lng":(-?\d+\.\d+)/,
                    /ll=(-?\d+\.\d+),(-?\d+\.\d+)/,
                    /destination=(-?\d+\.\d+),(-?\d+\.\d+)/,
                ];

                for (const pattern of patterns) {
                    const match = text.match(pattern);
                    if (match) {
                        const lat = parseFloat(match[1]);
                        const lng = parseFloat(match[2]);
                        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                            return { lat, lng, source: 'resolved_short_link' };
                        }
                    }
                }

                // Third try: look for a canonical URL or redirect URL in meta tags
                const metaMatch = text.match(/content="https?:\/\/(?:www\.)?google\.\w+\/maps[^"]+"/i);
                if (metaMatch) {
                    const metaUrl = metaMatch[0].replace('content="', '').replace('"', '');
                    const fromMeta = parseLocationLink(metaUrl);
                    if (fromMeta && fromMeta.lat) return fromMeta;
                }
            } catch (e) {
                console.warn('CORS proxy failed:', e.message);
                continue; // Try next proxy
            }
        }

        return null; // All proxies failed
    }

    // Show link feedback (success or error)
    function showLinkFeedback(feedbackEl, message, type) {
        if (!feedbackEl) return;
        feedbackEl.textContent = message;
        feedbackEl.classList.remove('hidden', 'bg-emerald-50', 'text-emerald-700', 'bg-red-50', 'text-red-600', 'bg-amber-50', 'text-amber-700');
        if (type === 'success') {
            feedbackEl.classList.add('bg-emerald-50', 'text-emerald-700');
        } else if (type === 'warning') {
            feedbackEl.classList.add('bg-amber-50', 'text-amber-700');
        } else {
            feedbackEl.classList.add('bg-red-50', 'text-red-600');
        }
        feedbackEl.classList.remove('hidden');
        setTimeout(() => { feedbackEl.classList.add('hidden'); }, 6000);
    }

    // Wire Link Paste Inputs
    function setupLinkPasteInput(inputId, feedbackId, type) {
        const input = document.getElementById(inputId);
        const feedback = document.getElementById(feedbackId);
        if (!input) return;

        // Handle both paste and manual typing (with debounce)
        let linkDebounce = null;
        const processLink = async () => {
            const val = input.value.trim();
            if (!val || val.length < 5) return;

            const result = parseLocationLink(val);

            // Handle short links that need async resolution
            if (result && result.needs_resolve) {
                showLinkFeedback(feedback, '🔄 Resolving short link...', 'warning');
                input.value = '';
                try {
                    const resolved = await resolveShortLink(result.url);
                    if (resolved && resolved.lat && resolved.lng) {
                        showLinkFeedback(feedback, '✅ Short link resolved! Opening map...', 'success');
                        setTimeout(() => {
                            openMapModal(resolved.lat, resolved.lng, type, 'From shared link', 'Identifying address...');
                            setTimeout(() => reverseGeocode(resolved.lat, resolved.lng), 500);
                        }, 400);
                    } else {
                        showLinkFeedback(feedback, '⚠️ Could not resolve this link. If this is a "Live Location Sharing" link, please paste a standard pinned Google Maps link instead.', 'error');
                        input.value = val; // Restore original value so they can copy/edit
                    }
                } catch (e) {
                    showLinkFeedback(feedback, '⚠️ Network error while resolving link. Please try again or use the full url.', 'error');
                    console.error('Resolution error:', e);
                }
                return;
            }

            if (result && result.lat && result.lng) {
                showLinkFeedback(feedback, '✅ Location found! Opening map to confirm...', 'success');
                input.value = '';
                setTimeout(() => {
                    openMapModal(result.lat, result.lng, type, 'From pasted link', 'Identifying address...');
                    setTimeout(() => reverseGeocode(result.lat, result.lng), 500);
                }, 400);
            } else if (val.startsWith('http')) {
                showLinkFeedback(feedback, '❌ Could not extract location from this link. Try copying the full Google Maps URL.', 'error');
            }
        };

        input.addEventListener('paste', () => {
            setTimeout(processLink, 100); // Let the paste populate the field first
        });
        input.addEventListener('input', () => {
            if (linkDebounce) clearTimeout(linkDebounce);
            linkDebounce = setTimeout(processLink, 800);
        });
    }

    setupLinkPasteInput('pickupLinkInput', 'pickupLinkFeedback', 'pickup');
    setupLinkPasteInput('dropoffLinkInput', 'dropoffLinkFeedback', 'dropoff');

    // ============================================================
    // === NOMINATIM FORWARD SEARCH (Live web search for addresses) ===
    // ============================================================
    let nominatimTimeout = null;

    function nominatimForwardSearch(query, containerEl, type) {
        if (nominatimTimeout) clearTimeout(nominatimTimeout);
        nominatimTimeout = setTimeout(() => {
            // Show "Searching..." indicator
            containerEl.innerHTML = `
                <div class="px-4 py-3 text-center text-charcoal-500 font-medium text-sm">
                    <div class="animate-pulse">🔍 Searching Kano for "${query}"...</div>
                </div>
            `;
            containerEl.classList.remove('hidden');

            fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', Kano, Nigeria')}&limit=5&addressdetails=1&viewbox=8.35,12.10,8.65,11.85&bounded=1`, {
                headers: { 'Accept-Language': 'en' }
            })
            .then(res => res.json())
            .then(results => {
                if (results.length === 0) {
                    containerEl.innerHTML = `
                        <div class="px-4 py-3 text-center text-charcoal-500 font-medium text-sm">
                            No results found. Try a different search or paste a Google Maps link.
                        </div>
                    `;
                    return;
                }
                containerEl.innerHTML = results.map((r, i) => {
                    const parts = r.display_name.split(',');
                    const name = parts[0].trim();
                    const area = parts.slice(1, 3).join(',').trim();
                    return `
                        <div class="search-result-item px-4 py-3 hover:bg-emerald-50 cursor-pointer transition-colors border-b border-gray-50 last:border-0 flex items-center gap-3"
                             data-type="${type}" data-name="${name}" data-area="${area}" data-lat="${r.lat}" data-lng="${r.lon}">
                            <div class="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                                <svg class="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                            </div>
                            <div class="flex-1 min-w-0">
                                <div class="font-bold text-charcoal-900 text-sm truncate">${name}</div>
                                <div class="text-charcoal-500 text-xs font-medium truncate">${area}</div>
                            </div>
                            <span class="bg-blue-50 text-blue-600 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full flex-shrink-0">Web</span>
                        </div>
                    `;
                }).join('');
                containerEl.classList.remove('hidden');

                // Add click handlers
                containerEl.querySelectorAll('.search-result-item').forEach(el => {
                    el.addEventListener('click', () => {
                        const name = el.dataset.name;
                        const area = el.dataset.area;
                        const lat = parseFloat(el.dataset.lat);
                        const lng = parseFloat(el.dataset.lng);
                        const t = el.dataset.type;
                        openMapModal(lat, lng, t, name, area);
                        if (t === 'pickup') {
                            pickupSearchInput.value = '';
                            pickupSearchResults.classList.add('hidden');
                        } else {
                            dropoffSearchInput.value = '';
                            dropoffSearchResults.classList.add('hidden');
                        }
                    });
                });
            })
            .catch(err => {
                console.error('Nominatim search error:', err);
                containerEl.innerHTML = `
                    <div class="px-4 py-3 text-center text-charcoal-500 font-medium text-sm">
                        Search unavailable. Try pasting a Google Maps link instead.
                    </div>
                `;
            });
        }, 400); // Debounce to avoid hammering Nominatim
    }

    // Enhanced autocomplete: local KANO_LOCATIONS first, then fall back to Nominatim
    function enhancedAutocomplete(query, containerEl, type) {
        const localResults = searchLocations(query);
        if (localResults.length > 0) {
            renderSearchResults(localResults, containerEl, type);
            // Also add a "Search web for more" footer
            if (query.length >= 3) {
                const footer = document.createElement('div');
                footer.className = 'px-4 py-2 text-center border-t border-gray-100 cursor-pointer hover:bg-emerald-50 transition-colors';
                footer.innerHTML = `<span class="text-emerald-600 font-bold text-xs uppercase tracking-wide">🌐 Search web for "${query}"</span>`;
                footer.addEventListener('click', () => {
                    nominatimForwardSearch(query, containerEl, type);
                });
                containerEl.appendChild(footer);
            }
        } else if (query.length >= 3) {
            // No local results — search Nominatim directly
            nominatimForwardSearch(query, containerEl, type);
        } else {
            containerEl.classList.add('hidden');
        }
    }

    // Override the existing input listeners with enhanced autocomplete
    pickupSearchInput.removeEventListener('input', pickupSearchInput._inputHandler);
    dropoffSearchInput.removeEventListener('input', dropoffSearchInput._inputHandler);
    pickupSearchInput.addEventListener('input', (e) => {
        enhancedAutocomplete(e.target.value, pickupSearchResults, 'pickup');
    });
    dropoffSearchInput.addEventListener('input', (e) => {
        enhancedAutocomplete(e.target.value, dropoffSearchResults, 'dropoff');
    });

    // 1B. Map Modal (Leaflet + OpenStreetMap — Free, No API Key)
    let leafletMap = null;
    let geocodeTimeout = null;

    function openMapModal(lat, lng, type, initialName, initialAddress) {
        activeMapType = type;
        mapModalTitle.textContent = type === 'pickup' ? 'Confirm Pickup' : 'Confirm Destination';
        mapConfirmedName.textContent = initialName;
        mapConfirmedAddress.textContent = initialAddress;

        mapModal.dataset.lat = lat;
        mapModal.dataset.lng = lng;

        showMapContentState();
        mapModal.classList.remove('hidden');
        mapModal.classList.add('flex');

        // Initialize or update Leaflet map
        setTimeout(() => {
            if (!leafletMap) {
                leafletMap = L.map('confirmMap', {
                    center: [lat, lng],
                    zoom: 17,
                    zoomControl: false,
                    attributionControl: false
                });

                // Add zoom control to top-right
                L.control.zoom({ position: 'topleft' }).addTo(leafletMap);

                // Street map layer (default)
                const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    maxZoom: 19
                });

                // Satellite / Aerial imagery layer (Esri - free, no API key)
                const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                    maxZoom: 19
                });

                // Satellite with labels overlay
                const labelsLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', {
                    maxZoom: 19,
                    opacity: 0.7
                });

                // Start with street view
                streetLayer.addTo(leafletMap);
                let currentMode = 'street';

                // Create toggle button
                const toggleBtn = L.control({ position: 'topright' });
                toggleBtn.onAdd = function() {
                    const div = L.DomUtil.create('div', 'leaflet-bar');
                    div.innerHTML = `
                        <a href="#" id="mapLayerToggle" title="Switch to Satellite View" style="
                            display: flex; align-items: center; gap: 6px;
                            padding: 6px 12px; background: white; color: #1a1a1a;
                            font-weight: 700; font-size: 12px; text-decoration: none;
                            border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.15);
                            white-space: nowrap; cursor: pointer; font-family: inherit;
                        ">🛰️ Satellite</a>
                    `;
                    L.DomEvent.disableClickPropagation(div);
                    div.querySelector('#mapLayerToggle').addEventListener('click', (e) => {
                        e.preventDefault();
                        const btn = div.querySelector('#mapLayerToggle');
                        if (currentMode === 'street') {
                            leafletMap.removeLayer(streetLayer);
                            satelliteLayer.addTo(leafletMap);
                            labelsLayer.addTo(leafletMap);
                            btn.innerHTML = '🗺️ Map';
                            btn.title = 'Switch to Map View';
                            currentMode = 'satellite';
                        } else {
                            leafletMap.removeLayer(satelliteLayer);
                            leafletMap.removeLayer(labelsLayer);
                            streetLayer.addTo(leafletMap);
                            btn.innerHTML = '🛰️ Satellite';
                            btn.title = 'Switch to Satellite View';
                            currentMode = 'street';
                        }
                    });
                    return div;
                };
                toggleBtn.addTo(leafletMap);

                // When map is dragged, reverse geocode the new center
                leafletMap.on('movestart', () => {
                    showMapLoadingState();
                    if (geocodeTimeout) clearTimeout(geocodeTimeout);
                });
                leafletMap.on('moveend', () => {
                    const center = leafletMap.getCenter();
                    mapModal.dataset.lat = center.lat;
                    mapModal.dataset.lng = center.lng;
                    if (geocodeTimeout) clearTimeout(geocodeTimeout);
                    geocodeTimeout = setTimeout(() => {
                        reverseGeocode(center.lat, center.lng);
                    }, 600);
                });
            } else {
                leafletMap.setView([lat, lng], 17);
            }
            leafletMap.invalidateSize();
        }, 150);
    }

    // Nominatim Reverse Geocoding (free, no API key)
    function reverseGeocode(lat, lng) {
        fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, {
            headers: { 'Accept-Language': 'en' }
        })
        .then(res => res.json())
        .then(data => {
            showMapContentState();
            if (data && data.display_name) {
                const parts = data.display_name.split(',');
                mapConfirmedName.textContent = parts[0] ? parts[0].trim() : 'Pinned Location';
                mapConfirmedAddress.textContent = parts.slice(1, 4).join(',').trim() || data.display_name;
            } else {
                mapConfirmedName.textContent = 'Pinned Location';
                mapConfirmedAddress.textContent = lat.toFixed(4) + '°N, ' + lng.toFixed(4) + '°E';
            }
        })
        .catch(() => {
            showMapContentState();
            mapConfirmedName.textContent = 'Pinned Location';
            mapConfirmedAddress.textContent = lat.toFixed(4) + '°N, ' + lng.toFixed(4) + '°E';
        });
    }

    function showMapLoadingState() {
        if (mapAddressContent) mapAddressContent.classList.add('hidden');
        if (mapAddressLoading) { mapAddressLoading.classList.remove('hidden'); mapAddressLoading.classList.add('flex'); }
        if (confirmMapPinBtn) { confirmMapPinBtn.disabled = true; confirmMapPinBtn.classList.add('opacity-50', 'cursor-not-allowed'); }
    }

    function showMapContentState() {
        if (mapAddressLoading) { mapAddressLoading.classList.add('hidden'); mapAddressLoading.classList.remove('flex'); }
        if (mapAddressContent) mapAddressContent.classList.remove('hidden');
        if (confirmMapPinBtn) { confirmMapPinBtn.disabled = false; confirmMapPinBtn.classList.remove('opacity-50', 'cursor-not-allowed'); }
    }

    // Modal Events
    if (closeMapBtn) closeMapBtn.addEventListener('click', () => {
        mapModal.classList.add('hidden');
        mapModal.classList.remove('flex');
        activeMapType = null;
    });

    if (confirmMapPinBtn) confirmMapPinBtn.addEventListener('click', () => {
        if (!activeMapType) return;
        const lat = parseFloat(mapModal.dataset.lat);
        const lng = parseFloat(mapModal.dataset.lng);
        const match = {
            name: mapConfirmedName.textContent,
            area: mapConfirmedAddress.textContent,
            landmark: mapConfirmedName.textContent,
            coords: { lat, lng }
        };
        selectLocation(match, activeMapType);
        mapModal.classList.add('hidden');
        mapModal.classList.remove('flex');
        activeMapType = null;
    });

    // 1C. GPS "Use My Location" — Shows ACTUAL position on real map
    function findNearestLocation(lat, lng) {
        let nearest = KANO_LOCATIONS[0];
        let minDist = Infinity;
        KANO_LOCATIONS.forEach(loc => {
            const d = calculateDistance(lat, lng, loc.lat, loc.lng);
            if (d < minDist) { minDist = d; nearest = loc; }
        });
        return nearest;
    }

    const useLocationBtn = document.getElementById('useLocationBtn');
    if (useLocationBtn) {
        useLocationBtn.addEventListener('click', () => {
            if (!navigator.geolocation) {
                showToast("Geolocation is not supported by your browser.", "error");
                return;
            }
            const originalText = useLocationBtn.innerHTML;
            useLocationBtn.innerHTML = '<span class="animate-pulse">📍 Fetching GPS...</span>';
            useLocationBtn.style.opacity = "0.7";

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    useLocationBtn.innerHTML = originalText;
                    useLocationBtn.style.opacity = "1";
                    const userLat = position.coords.latitude;
                    const userLng = position.coords.longitude;
                    // Open real map at actual GPS coordinates
                    openMapModal(userLat, userLng, 'pickup', 'Your Location', 'Identifying address...');
                    // Reverse geocode to get real street name
                    setTimeout(() => reverseGeocode(userLat, userLng), 500);
                    showToast('GPS location found! Drag map to adjust if needed.', 'success');
                },
                (error) => {
                    useLocationBtn.innerHTML = originalText;
                    useLocationBtn.style.opacity = "1";
                    showToast("GPS unavailable. Showing default Kano location.", "error");
                    openMapModal(12.0022, 8.5167, 'pickup', 'Nassarawa GRA', 'Nassarawa, Kano');
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        });
    }

    // 1D. Selection Management UI
    function selectLocation(match, type) {
        if (type === 'pickup') {
            pickupData = { ...pickupData, ...match };
            document.getElementById('pickupSearchInput').parentElement.classList.add('hidden');
            document.getElementById('pickupSelectedPrimary').innerHTML = `${match.name}`;
            document.getElementById('pickupSelectedSecondary').textContent = match.area;
            document.getElementById('pickupSelectedState').classList.remove('hidden');
            
            const btn = document.getElementById('useLocationBtn');
            if(btn) btn.classList.add('hidden');
            const linkBox = document.getElementById('pickupLinkBox');
            if(linkBox) linkBox.classList.add('hidden');

            // Reset save checkbox state
            const chk = document.getElementById('pickupSaveCheck');
            if (chk) chk.checked = false;
            const nm = document.getElementById('pickupSaveName');
            if (nm) { nm.style.display = 'none'; nm.value = ''; }

            // DO NOT auto-open voice modal — let user opt in via the button
        } else {
            dropoffData = { ...dropoffData, ...match };
            document.getElementById('dropoffSearchInput').parentElement.classList.add('hidden');
            document.getElementById('dropoffSelectedPrimary').innerHTML = `${match.name}`;
            document.getElementById('dropoffSelectedSecondary').textContent = match.area;
            document.getElementById('dropoffSelectedState').classList.remove('hidden');
            
            const linkBox = document.getElementById('dropoffLinkBox');
            if(linkBox) linkBox.classList.add('hidden');

            // Reset save checkbox state
            const chk = document.getElementById('dropoffSaveCheck');
            if (chk) chk.checked = false;
            const nm = document.getElementById('dropoffSaveName');
            if (nm) { nm.style.display = 'none'; nm.value = ''; }

            if (typeof updateLivePriceEstimate === 'function') updateLivePriceEstimate();
            
            // DO NOT auto-open voice modal
        }
        checkFormCompleteness();
    }

    window.clearSelection = function (type) {
        if (type === 'pickup') {
            pickupData = { area: '', landmark: '', coords: null, voiceDuration: pickupData.voiceDuration };
            document.getElementById('pickupSearchInput').value = '';
            document.getElementById('pickupSearchInput').parentElement.classList.remove('hidden');
            document.getElementById('pickupSelectedState').classList.add('hidden');
            document.getElementById('pickupFinalDetails').value = '';
            const btn = document.getElementById('useLocationBtn');
            if(btn) btn.classList.remove('hidden');
            const linkBox = document.getElementById('pickupLinkBox');
            if(linkBox) linkBox.classList.remove('hidden');
            // Reset save state
            const chk = document.getElementById('pickupSaveCheck');
            if (chk) chk.checked = false;
            const nm = document.getElementById('pickupSaveName');
            if (nm) { nm.style.display = 'none'; nm.value = ''; }
        } else {
            dropoffData = { area: '', landmark: '', coords: null, voiceDuration: dropoffData.voiceDuration };
            document.getElementById('dropoffSearchInput').value = '';
            document.getElementById('dropoffSearchInput').parentElement.classList.remove('hidden');
            document.getElementById('dropoffSelectedState').classList.add('hidden');
            document.getElementById('dropoffFinalDetails').value = '';
            const est = document.getElementById('livePriceEstimate');
            if(est) est.classList.add('hidden');
            const linkBox = document.getElementById('dropoffLinkBox');
            if(linkBox) linkBox.classList.remove('hidden');
            // Reset save state
            const chk = document.getElementById('dropoffSaveCheck');
            if (chk) chk.checked = false;
            const nm = document.getElementById('dropoffSaveName');
            if (nm) { nm.style.display = 'none'; nm.value = ''; }
        }
        checkFormCompleteness();
    };

    // ============================================================
    // === SAVED LOCATIONS SYSTEM ===
    // ============================================================
    const SAVED_LOCS_KEY = 'naijaDropsSavedLocations';

    function getSavedLocations() {
        try { return JSON.parse(localStorage.getItem(SAVED_LOCS_KEY) || '[]'); }
        catch(e) { return []; }
    }

    function saveSavedLocations(locs) {
        localStorage.setItem(SAVED_LOCS_KEY, JSON.stringify(locs));
    }

    function addSavedLocation(loc) {
        const locs = getSavedLocations();
        // Avoid exact duplicates by name+area
        if (locs.find(l => l.name === loc.name && l.area === loc.area)) {
            showToast('This location is already saved!', 'error');
            return false;
        }
        locs.unshift({ ...loc, savedAt: Date.now() });
        saveSavedLocations(locs.slice(0, 20)); // max 20
        return true;
    }

    function removeSavedLocation(idx) {
        const locs = getSavedLocations();
        locs.splice(idx, 1);
        saveSavedLocations(locs);
        renderSavedLocChips();
        showToast('Location removed.', 'error');
    }

    function renderSavedLocChips() {
        const container = document.getElementById('savedLocChips');
        const section = document.getElementById('savedLocationsSection');
        if (!container) return;
        const locs = getSavedLocations();
        if (locs.length === 0) {
            container.innerHTML = '<span class="text-xs text-charcoal-400 font-medium py-2">No saved locations yet. Save a location below ⭐</span>';
            return;
        }
        container.innerHTML = locs.map((loc, i) => `
            <button class="saved-loc-chip" data-idx="${i}" title="${loc.label || loc.name}: ${loc.area}">
                <span class="chip-icon">${loc.label ? '⭐' : '📍'}</span>
                <span>${loc.label || loc.name}</span>
            </button>
        `).join('');

        container.querySelectorAll('.saved-loc-chip').forEach(chip => {
            chip.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(chip.dataset.idx);
                const loc = locs[idx];
                showSavedLocMenu(loc, idx, chip);
            });
        });
    }

    function showSavedLocMenu(loc, idx, anchorEl) {
        // Remove existing menu if any
        const existing = document.getElementById('savedLocMenu');
        if (existing) { existing.remove(); return; }

        const menuHtml = `
            <div id="savedLocMenu" class="absolute z-[200] bg-white rounded-2xl shadow-2xl border border-gray-100 p-3 min-w-[200px]" style="top: 100%; left: 0; margin-top: 6px;">
                <div class="text-xs font-bold text-charcoal-500 uppercase tracking-widest px-2 py-1 mb-2">${loc.label || loc.name}</div>
                <button class="w-full text-left px-3 py-2.5 rounded-xl hover:bg-emerald-50 text-sm font-bold text-charcoal-800 flex items-center gap-2 transition-colors" onclick="useSavedLoc(${idx}, 'pickup'); document.getElementById('savedLocMenu').remove();">
                    <span class="text-base">📦</span> Set as Pickup
                </button>
                <button class="w-full text-left px-3 py-2.5 rounded-xl hover:bg-emerald-50 text-sm font-bold text-charcoal-800 flex items-center gap-2 transition-colors" onclick="useSavedLoc(${idx}, 'dropoff'); document.getElementById('savedLocMenu').remove();">
                    <span class="text-base">📍</span> Set as Dropoff
                </button>
                <div class="border-t border-gray-100 my-1"></div>
                <button class="w-full text-left px-3 py-2.5 rounded-xl hover:bg-red-50 text-sm font-bold text-red-500 flex items-center gap-2 transition-colors" onclick="removeSavedLocation(${idx}); document.getElementById('savedLocMenu').remove();">
                    <span class="text-base">🗑️</span> Remove
                </button>
            </div>
        `;
        
        const wrapper = document.createElement('div');
        wrapper.className = 'relative';
        anchorEl.parentNode.insertBefore(wrapper, anchorEl);
        wrapper.appendChild(anchorEl);
        wrapper.insertAdjacentHTML('beforeend', menuHtml);

        // Close on outside click
        setTimeout(() => {
            document.addEventListener('click', function closeMenu() {
                const menu = document.getElementById('savedLocMenu');
                if (menu) {
                    menu.closest('.relative').insertBefore(anchorEl, menu.closest('.relative').querySelector('#savedLocMenu'));
                    menu.remove();
                }
                document.removeEventListener('click', closeMenu);
            }, { once: true });
        }, 10);
    }

    window.useSavedLoc = function(idx, type) {
        const locs = getSavedLocations();
        const loc = locs[idx];
        if (!loc) return;
        const match = {
            name: loc.name,
            area: loc.area,
            landmark: loc.name,
            coords: loc.coords
        };
        selectLocation(match, type);
        showToast(`⭐ ${loc.label || loc.name} set as ${type}!`, 'success');
    };

    window.toggleSaveLocation = function(type) {
        const chk = document.getElementById(type + 'SaveCheck');
        const nm = document.getElementById(type + 'SaveName');
        if (!chk || !nm) return;

        // Toggle checkbox
        chk.checked = !chk.checked;
        
        if (chk.checked) {
            nm.style.display = 'block';
            nm.focus();
            nm.addEventListener('blur', () => {
                if (!chk.checked) return;
                const data = type === 'pickup' ? pickupData : dropoffData;
                if (!data.coords) {
                    showToast('Please select a location first.', 'error');
                    chk.checked = false;
                    nm.style.display = 'none';
                    return;
                }
                const label = nm.value.trim();
                const saved = addSavedLocation({
                    name: data.name || data.landmark || data.area,
                    area: data.area,
                    coords: data.coords,
                    label: label || null
                });
                if (saved) {
                    showToast(`⭐ Location saved${label ? ' as \"' + label + '\"' : ''}!`, 'success');
                    renderSavedLocChips();
                }
            }, { once: true });
        } else {
            nm.style.display = 'none';
            nm.value = '';
        }
    };

    window.manageSavedLocations = function() {
        const locs = getSavedLocations();
        if (locs.length === 0) {
            showToast('No saved locations yet. Save a location after selecting it.', 'error');
            return;
        }
        const listHtml = locs.map((loc, i) => `
            <div class="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors">
                <div class="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center text-sm flex-shrink-0">⭐</div>
                <div class="flex-1 min-w-0">
                    <div class="font-bold text-charcoal-900 text-sm truncate">${loc.label || loc.name}</div>
                    <div class="text-xs text-charcoal-500 font-medium truncate">${loc.area}</div>
                </div>
                <button onclick="removeSavedLocation(${i}); document.getElementById('manageSavedModal').remove();" class="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center text-red-500 hover:bg-red-100 transition-colors flex-shrink-0 text-sm">✕</button>
            </div>
        `).join('');

        const modalHtml = `
            <div id="manageSavedModal" class="fixed inset-0 z-[150] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
                <div class="bg-white rounded-[1.5rem] shadow-2xl w-full max-w-md max-h-[70dvh] flex flex-col overflow-hidden">
                    <div class="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                        <h3 class="font-extrabold text-charcoal-900 text-lg">⭐ Saved Locations</h3>
                        <button onclick="document.getElementById('manageSavedModal').remove()" class="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-charcoal-600 hover:bg-gray-200 transition-colors">✕</button>
                    </div>
                    <div class="overflow-y-auto flex-1 p-3">${listHtml}</div>
                    <div class="px-5 py-3 border-t border-gray-100">
                        <button onclick="if(confirm('Clear all saved locations?')){localStorage.removeItem('naijaDropsSavedLocations');document.getElementById('manageSavedModal').remove();renderSavedLocChips();showToast('All saved locations cleared.','error');}" class="w-full text-center text-sm font-bold text-red-500 py-2 hover:bg-red-50 rounded-xl transition-colors">Clear All</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    };

    // Initial render of saved location chips
    renderSavedLocChips();

    // --- Photo Upload ---
    const photoInput = document.getElementById('photoInput');
    const photoUploadArea = document.getElementById('photoUploadArea');
    const photoPreview = document.getElementById('photoPreview');
    const photoPreviewImg = document.getElementById('photoPreviewImg');
    const photoFileName = document.getElementById('photoFileName');

    if (photoInput) {
        photoInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;

            // Validate file is an image
            if (!file.type.startsWith('image/')) {
                showToast('Please select an image file.', 'error');
                photoInput.value = '';
                return;
            }

            // Validate size (max 10MB)
            if (file.size > 10 * 1024 * 1024) {
                showToast('Image is too large. Max 10MB.', 'error');
                photoInput.value = '';
                return;
            }

            // Create preview
            const reader = new FileReader();
            reader.onload = function(evt) {
                if (photoPreviewImg) photoPreviewImg.src = evt.target.result;
                if (photoFileName) photoFileName.textContent = file.name;
                if (photoUploadArea) photoUploadArea.classList.add('hidden');
                if (photoPreview) photoPreview.classList.remove('hidden');
                showToast('📸 Photo attached!', 'success');
            };
            reader.readAsDataURL(file);
        });
    }

    window.removePhoto = function() {
        if (photoInput) photoInput.value = '';
        if (photoPreviewImg) photoPreviewImg.src = '';
        if (photoPreview) photoPreview.classList.add('hidden');
        if (photoUploadArea) photoUploadArea.classList.remove('hidden');
        showToast('Photo removed.', 'error');
    };

    // --- 2. Voice Note System ---
    let recordingInterval;
    let secondsRecorded = 0;
    let isRecording = false;

    window.openVoiceModal = function (target) {
        currentVoiceTarget = target;
        voiceNoteTitle.textContent = `${target} Instructions`;

        let contextText = "your location";
        if (target === 'Pickup' && pickupData.landmark) contextText = pickupData.landmark;
        if (target === 'Dropoff' && dropoffData.landmark) contextText = dropoffData.landmark;

        voiceNoteLandmarkContext.textContent = contextText;

        resetVoiceNoteUI();
        unifiedFormContainer.style.filter = 'blur(4px)';
        voiceNoteModal.style.display = 'flex';
    };

    closeVoiceNoteBtn.addEventListener('click', () => {
        voiceNoteModal.style.display = 'none';
        unifiedFormContainer.style.filter = 'none';
    });

    micButton.addEventListener('mousedown', startRecording);
    micButton.addEventListener('touchstart', startRecording);
    micButton.addEventListener('mouseup', stopRecording);
    micButton.addEventListener('mouseleave', stopRecording);
    micButton.addEventListener('touchend', stopRecording);

    function startRecording(e) {
        e.preventDefault();
        if (secondsRecorded > 0) return;
        isRecording = true;
        micButton.classList.add('recording');
        recordingWaveform.style.display = 'flex';
        recordingTimer.style.display = 'block';
        micInstructionLabel.textContent = 'Recording... Release to stop';
        secondsRecorded = 0;
        updateTimerDisplay(0);

        recordingInterval = setInterval(() => {
            secondsRecorded++;
            updateTimerDisplay(secondsRecorded);
            if (secondsRecorded >= 30) stopRecording(e);
        }, 1000);
    }

    function stopRecording(e) {
        if (e) e.preventDefault();
        if (!isRecording) return;
        isRecording = false;
        clearInterval(recordingInterval);
        micButton.classList.remove('recording');

        if (secondsRecorded < 2) {
            showToast('Voice note too short.', 'error');
            resetVoiceNoteUI();
            return;
        }
        micButton.style.display = 'none';
        recordingWaveform.style.display = 'none';
        recordingTimer.style.display = 'none';
        micInstructionLabel.style.display = 'none';
        playbackContainer.style.display = 'flex';
        playbackDuration.textContent = formatTime(secondsRecorded);
    }

    function updateTimerDisplay(s) { recordingTimer.textContent = `00:${s.toString().padStart(2, '0')}`; }
    function formatTime(s) { return `00:${s.toString().padStart(2, '0')}`; }

    function resetVoiceNoteUI() {
        clearInterval(recordingInterval);
        secondsRecorded = 0;
        isRecording = false;
        micButton.style.display = 'flex';
        micButton.classList.remove('recording');
        recordingWaveform.style.display = 'none';
        recordingTimer.style.display = 'none';
        micInstructionLabel.style.display = 'block';
        micInstructionLabel.textContent = 'Hold to Record (Max 30s)';
        playbackContainer.style.display = 'none';
    }

    retakeBtn.addEventListener('click', resetVoiceNoteUI);

    confirmVoiceNoteBtn.addEventListener('click', () => {
        if (currentVoiceTarget === 'Pickup') {
            pickupData.voiceDuration = secondsRecorded;
            showToast(`Pickup voice note saved (${secondsRecorded}s).`, 'success');
        } else {
            dropoffData.voiceDuration = secondsRecorded;
            showToast(`Dropoff voice note saved (${secondsRecorded}s).`, 'success');
        }
        voiceNoteModal.style.display = 'none';
        unifiedFormContainer.style.filter = 'none';
        checkFormCompleteness();
    });

    // --- 3. Category Selection ---
    const categoryBtns = document.querySelectorAll('.category-btn');
    categoryBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            categoryBtns.forEach(b => {
                b.classList.remove('border-emerald-500', 'bg-emerald-50', 'text-emerald-700');
                b.classList.add('border-gray-200', 'text-charcoal-700', 'bg-white');
            });
            btn.classList.add('border-emerald-500', 'bg-emerald-50', 'text-emerald-700');
            btn.classList.remove('border-gray-200', 'text-charcoal-700', 'bg-white');
            selectedCategory = btn.getAttribute('data-category');
            checkFormCompleteness();
        });
    });

    // --- 4. Size Selection ---
    const sizeBtns = document.querySelectorAll('.size-btn');
    sizeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            sizeBtns.forEach(b => {
                b.classList.remove('border-emerald-500', 'bg-emerald-50');
                b.classList.add('border-gray-200');
            });
            btn.classList.add('border-emerald-500', 'bg-emerald-50');
            btn.classList.remove('border-gray-200');
            selectedSize = btn.getAttribute('data-size');
            checkFormCompleteness();
            if (typeof updateLivePriceEstimate === 'function') updateLivePriceEstimate();
        });
    });

    // --- Receiver Inputs Event Listeners ---
    if (receiverNameInput) receiverNameInput.addEventListener('input', checkFormCompleteness);
    if (receiverPhoneInput) receiverPhoneInput.addEventListener('input', checkFormCompleteness);

    // --- 5. Form Validation & Submission ---
    function checkFormCompleteness() {
        const receiverName = receiverNameInput ? receiverNameInput.value.trim() : '';
        const receiverPhone = receiverPhoneInput ? receiverPhoneInput.value.trim() : '';
        
        pickupData.finalDetails = document.getElementById('pickupFinalDetails') ? document.getElementById('pickupFinalDetails').value.trim() : '';
        dropoffData.finalDetails = document.getElementById('dropoffFinalDetails') ? document.getElementById('dropoffFinalDetails').value.trim() : '';

        if (pickupData.coords && dropoffData.coords && selectedSize && selectedCategory && receiverName && receiverPhone.length >= 10) {
            calculateSaveBtn.disabled = false;
            calculateSaveBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        } else {
            calculateSaveBtn.disabled = true;
            calculateSaveBtn.classList.add('opacity-50', 'cursor-not-allowed');
        }
    }

    function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth's radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    const formatNaira = (amount) => '₦' + amount.toLocaleString('en-US');
    
    // Engine specific functions
    function getDetailedPricing() {
        if (!pickupData.coords || !dropoffData.coords) return null;
        
        const distanceKm = calculateDistance(pickupData.coords.lat, pickupData.coords.lng, dropoffData.coords.lat, dropoffData.coords.lng);
        
        let sizeSurcharge = 0;
        if (selectedSize === 'Small') sizeSurcharge = 200;
        if (selectedSize === 'Medium') sizeSurcharge = 500;
        if (selectedSize === 'Large') sizeSurcharge = 1000;
        
        // Base 800 + (KM * 180) + Size_Surcharge
        const rawCost = Math.round(800 + (Math.max(1, distanceKm) * 180) + sizeSurcharge);
        
        return { distanceKm, rawCost };
    }

    window.updateLivePriceEstimate = function() {
        const p = getDetailedPricing();
        const estDiv = document.getElementById('livePriceEstimate');
        if (p && estDiv) {
            document.getElementById('liveDistanceAmount').textContent = p.distanceKm.toFixed(1) + ' km';
            document.getElementById('livePriceAmount').textContent = formatNaira(p.rawCost); 
            estDiv.classList.remove('hidden');
        } else if (estDiv) {
            estDiv.classList.add('hidden');
        }
    };

    // --- 6. Pricing & Bidding Logic ---
    const radioInputs = document.querySelectorAll('input[name="fareType"]');
    const userOfferInput = document.getElementById('userOfferPrice');
    const findDriverBtn = document.getElementById('findDriverBtn');

    radioInputs.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.value === 'offer') {
                userOfferInput.disabled = false;
                userOfferInput.focus();
            } else {
                userOfferInput.disabled = true;
            }
        });
    });

    calculateSaveBtn.addEventListener('click', () => {
        // Go to pricing
        const pricing = getDetailedPricing();
        calculatedRawCost = pricing.rawCost;

        const standardCost = calculatedRawCost * 0.85; // Slight internal discount logic
        document.getElementById('priceStandard').textContent = formatNaira(Math.round(standardCost));
        document.getElementById('priceExpress').textContent = formatNaira(Math.round(calculatedRawCost));

        userOfferInput.placeholder = `Suggest ~${formatNaira(Math.round(standardCost))}`;

        navigateSPA('pricing');
    });

    findDriverBtn.addEventListener('click', () => {
        const fareType = document.querySelector('input[name="fareType"]:checked').value;
        if (fareType === 'offer' && !userOfferInput.value) {
            showToast('Please enter your offer amount', 'error');
            return;
        }

        if (fareType === 'offer') {
            selectedFinalCost = Number(userOfferInput.value);
        } else if (fareType === 'standard') {
            selectedFinalCost = calculatedRawCost * 0.75;
        } else {
            selectedFinalCost = calculatedRawCost;
        }

        startBiddingSimulation();
    });

    function startBiddingSimulation() {
        navigateSPA('matching');

        // Reset state
        driverOfferCard.classList.remove('translate-y-0', 'opacity-100');
        driverOfferCard.classList.add('translate-y-20', 'opacity-0');
        waitingState.style.display = 'block';

        // Simulate driver bidding after 3 seconds
        setTimeout(() => {
            waitingState.style.display = 'none';
            // Simulate a counter offer slightly higher if they offered too low, or just accept
            const fareType = document.querySelector('input[name="fareType"]:checked').value;
            let driverCounter = selectedFinalCost;

            if (fareType === 'offer' && selectedFinalCost < (calculatedRawCost * 0.6)) {
                // If they lowballed hard, driver counters higher
                driverCounter = Math.round(selectedFinalCost * 1.3);
            }

            selectedFinalCost = driverCounter; // Assume final
            driverOfferAmount.textContent = formatNaira(driverCounter);

            driverOfferCard.classList.remove('translate-y-20', 'opacity-0');
            driverOfferCard.classList.add('translate-y-0', 'opacity-100');
        }, 3000);
    }

    rejectOfferBtn.addEventListener('click', () => {
        showToast('Offer declined. Searching for another driver...', 'error');
        driverOfferCard.classList.remove('translate-y-0', 'opacity-100');
        driverOfferCard.classList.add('translate-y-20', 'opacity-0');
        waitingState.style.display = 'block';

        setTimeout(() => {
            // Second driver accepts the exact price
            selectedFinalCost = calculatedRawCost * 0.8;
            driverOfferAmount.textContent = formatNaira(selectedFinalCost);
            document.querySelector('#driverOfferCard .font-bold.text-lg').textContent = "Musa Kabiru";
            driverOfferCard.classList.remove('translate-y-20', 'opacity-0');
            driverOfferCard.classList.add('translate-y-0', 'opacity-100');
            waitingState.style.display = 'none';
        }, 3500);
    });

    acceptOfferBtn.addEventListener('click', () => {
        showFinalSummary();
    });

    function showFinalSummary() {
        navigateSPA('summary');

        const distanceKm = calculateDistance(pickupData.coords.lat, pickupData.coords.lng, dropoffData.coords.lat, dropoffData.coords.lng);
        let etaMins = Math.round((Math.max(1, distanceKm) * 4) + 15);

        // Render Summary
        const pickupVoiceStr = pickupData.voiceDuration > 0 ? `<div class="text-sm font-bold text-emerald-600 mt-2 flex items-center gap-1">🎤 ${pickupData.voiceDuration}s Voice Note attached</div>` : '';
        const dropoffVoiceStr = dropoffData.voiceDuration > 0 ? `<div class="text-sm font-bold text-emerald-600 mt-2 flex items-center gap-1">🎤 ${dropoffData.voiceDuration}s Voice Note attached</div>` : '';

        const pickupDetailsStr = pickupData.finalDetails ? `<div class="text-emerald-700 text-sm mt-1">↳ Details: ${pickupData.finalDetails}</div>` : '';
        const dropoffDetailsStr = dropoffData.finalDetails ? `<div class="text-emerald-700 text-sm mt-1">↳ Details: ${dropoffData.finalDetails}</div>` : '';

        document.getElementById('summaryPickupLabel').innerHTML = `<div class="font-bold text-lg leading-tight text-charcoal-900">${pickupData.landmark}</div><div class="text-charcoal-500 text-sm font-medium mt-0.5">${pickupData.area}</div>${pickupDetailsStr}${pickupVoiceStr}`;
        document.getElementById('summaryDropoffLabel').innerHTML = `<div class="font-bold text-lg leading-tight text-charcoal-900">${dropoffData.landmark}</div><div class="text-charcoal-500 text-sm font-medium mt-0.5">${dropoffData.area}</div>${dropoffDetailsStr}${dropoffVoiceStr}`;

        document.getElementById('finalDistanceLabel').textContent = `${distanceKm.toFixed(1)} km Routing Distance (${selectedSize} Item)`;

        // Show selectedFinalCost
        document.getElementById('finalPriceLabel').innerHTML = `${formatNaira(Math.round(selectedFinalCost))} <span class="text-2xl text-gray-400 line-through font-medium ml-2">${formatNaira(Math.round(calculatedRawCost))}</span>`;
        document.getElementById('finalEtaLabel').textContent = `${etaMins} mins`;

        showToast('Driver confirmed! Please proceed to payment.', 'success');
    }

    // --- 7. Payment Flow ---
    const paymentProcessingOverlay = document.getElementById('paymentProcessingOverlay');
    
    window.goToPayment = function() {
        navigateSPA('payment');
        document.getElementById('paymentTotalLabel').textContent = formatNaira(Math.round(selectedFinalCost));
    };

    window.processMockPayment = function(method) {
        if (!paymentProcessingOverlay) return;
        
        // Show loading state
        paymentProcessingOverlay.classList.remove('hidden');
        paymentProcessingOverlay.classList.add('flex');
        
        let waitTime = method === 'cash' ? 1000 : 2500;
        let successMsg = method === 'cash' ? 'Cash payment selected!' : 
                        (method === 'paystack' ? 'Paystack test payment successful!' : 'OPay test payment successful!');
        
        setTimeout(() => {
            paymentProcessingOverlay.classList.add('hidden');
            paymentProcessingOverlay.classList.remove('flex');
            showToast(successMsg, 'success');
            
            // Proceed to tracking
            if (typeof startLiveTracking === 'function') {
                startLiveTracking();
            } else {
                showToast("Tracking view not implemented yet.", "error");
            }
        }, waitTime);
    };

    // --- 8. Live Tracking Logic ---
    let trackingStateStep = 1; // 1: Picked Up, 2: Arriving, 3: Delivered
    let trackingInterval;

    window.startLiveTracking = function () {
        navigateSPA('tracking');

        // Compile finalized order data
        const orderPayload = {
            pickup: pickupData,
            dropoff: dropoffData,
            item: { size: selectedSize, category: selectedCategory },
            receiver: {
                name: document.getElementById('receiverNameInput')?.value,
                phone: document.getElementById('receiverPhoneInput')?.value
            },
            pricing: {
                rawCost: calculatedRawCost,
                finalAgreedCost: selectedFinalCost,
                type: document.querySelector('input[name="fareType"]:checked').value
            },
            driver: { name: "Salisu Ibrahim", id: "DRV-1337" }
        };

        // Persist to abstracted DataStore
        DataStore.saveOrder(orderPayload).then(orderId => {
            console.log(`Order ${orderId} saved successfully.`);
        });

        // Setup initial Map Marker position (start of path)
        const liveDriverMarker = document.getElementById('liveDriverMarker');
        if (liveDriverMarker) {
            liveDriverMarker.style.left = '200px';
            liveDriverMarker.style.top = '180px';
        }

        // Start timeline progress bar at ~30%
        const timelineProgress = document.getElementById('timelineProgress');
        if (timelineProgress) timelineProgress.style.height = '30%';

        // Setup the Home UI to show active order widget
        const homeEmptyState = document.getElementById('homeEmptyState');
        const homeActiveOrderState = document.getElementById('homeActiveOrderState');
        if (homeEmptyState && homeActiveOrderState) {
            homeEmptyState.classList.add('hidden');
            homeActiveOrderState.classList.remove('hidden');
            document.getElementById('homeActiveDropoff').textContent = dropoffData.landmark || "Destination";
            document.getElementById('homeActiveEta').textContent = document.getElementById('finalEtaLabel').textContent;
        }

        // Auto move marker (Simulated movement)
        setTimeout(() => {
            if (liveDriverMarker) {
                liveDriverMarker.style.left = '300px';
                liveDriverMarker.style.top = '100px';
            }
        }, 1000);
        
        // Start automatic progression
        trackingStateStep = 1;
        if(trackingInterval) clearInterval(trackingInterval);
        trackingInterval = setInterval(() => {
            if(trackingStateStep < 3) {
                advanceTrackingState();
            } else {
                clearInterval(trackingInterval);
            }
        }, 5000); // Progress every 5 seconds for demo
    };

    window.advanceTrackingState = function () {
        trackingStateStep++;
        const liveDriverMarker = document.getElementById('liveDriverMarker');
        const timelineProgress = document.getElementById('timelineProgress');

        if (trackingStateStep === 2) {
            // Move to step 2: Arriving
            timelineProgress.style.height = '70%';

            // Move marker closer
            liveDriverMarker.style.left = '400px';
            liveDriverMarker.style.top = '110px';

            const stepPickedUp = document.getElementById('stepPickedUp');
            stepPickedUp.classList.add('opacity-50');
            stepPickedUp.querySelector('.ring-1').classList.remove('ring-emerald-200');
            stepPickedUp.querySelector('.bg-emerald-500').classList.remove('animate-pulse');

            const stepArriving = document.getElementById('stepArriving');
            stepArriving.classList.remove('opacity-50');
            stepArriving.querySelector('.w-4').classList.replace('bg-gray-100', 'bg-emerald-50');
            stepArriving.querySelector('.w-4').classList.replace('border-gray-300', 'border-emerald-500');
            stepArriving.querySelector('.w-4').innerHTML = '<div class="w-1.5 h-1.5 bg-emerald-500 rounded-full mx-auto mt-[3px] animate-pulse"></div>';

            document.getElementById('trackingEtaText').textContent = "Arriving in 2 mins";

        } else if (trackingStateStep === 3) {
            // Move to step 3: Delivered
            timelineProgress.style.height = '100%';

            // Move marker exactly to dropoff
            liveDriverMarker.style.left = '450px';
            liveDriverMarker.style.top = '120px';

            const stepArriving = document.getElementById('stepArriving');
            stepArriving.classList.add('opacity-50');
            stepArriving.querySelector('.bg-emerald-500')?.classList.remove('animate-pulse');

            const stepDelivered = document.getElementById('stepDelivered');
            stepDelivered.classList.remove('opacity-50');
            stepDelivered.querySelector('.w-4').classList.replace('bg-gray-100', 'bg-emerald-500');
            stepDelivered.querySelector('.w-4').classList.replace('border-gray-300', 'border-white');
            stepDelivered.querySelector('.w-4').innerHTML = '<svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';

            document.getElementById('trackingEtaText').textContent = "Delivered!";

            // Clean up Home Widget
            document.getElementById('homeActiveOrderState').classList.add('hidden');
            document.getElementById('homeEmptyState').classList.remove('hidden');

            showToast('Package Delivered Successfully!', 'success');
            
            // Show end of trip dialogue
            setTimeout(() => {
                showDeliveryCompleteDialog();
            }, 1500);
        }
    };
    
    function showDeliveryCompleteDialog() {
        const dialogHtml = `
            <div id="deliveryCompleteModal" class="fixed inset-0 z-[100] bg-charcoal-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-6 opacity-0 transition-opacity duration-300">
                <div class="bg-white w-full sm:max-w-md rounded-t-[2rem] sm:rounded-[2rem] p-8 shadow-2xl relative transform translate-y-full sm:translate-y-10 transition-transform duration-500 ease-out">
                    <div class="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-6 sm:hidden"></div>
                    
                    <div class="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6 relative">
                        <div class="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/40">
                            <span class="text-3xl">🎉</span>
                        </div>
                    </div>
                    
                    <h2 class="text-2xl font-extrabold text-charcoal-900 text-center mb-2">Delivery Complete!</h2>
                    <p class="text-charcoal-500 text-center font-medium mb-8">Salisu Ibrahim has successfully delivered your package to ${dropoffData.landmark || 'the destination'}.</p>
                    
                    <div class="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 flex items-center justify-between mb-8">
                        <div>
                            <div class="text-xs font-bold text-emerald-700 uppercase tracking-widest mb-1">Total Paid</div>
                            <div class="text-2xl font-black text-emerald-900">${formatNaira(Math.round(selectedFinalCost))}</div>
                        </div>
                        <div class="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm text-emerald-600">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        </div>
                    </div>
                    
                    <button onclick="document.getElementById('deliveryCompleteModal').remove(); navigateSPA('home');" class="w-full py-4 bg-charcoal-900 hover:bg-black text-white font-bold rounded-xl shadow-lg transition-transform focus:outline-none flex items-center justify-center gap-2">
                        Back to Home
                    </button>
                    <button onclick="document.getElementById('deliveryCompleteModal').remove(); showToast('Tipping flow coming later', 'error');" class="w-full py-3 mt-3 text-emerald-600 font-bold hover:bg-emerald-50 rounded-xl transition-colors">
                        Add a Tip
                    </button>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', dialogHtml);
        
        // Trigger animations
        setTimeout(() => {
            const modal = document.getElementById('deliveryCompleteModal');
            if(modal) {
                modal.classList.remove('opacity-0');
                modal.firstElementChild.classList.remove('translate-y-full', 'sm:translate-y-10');
            }
        }, 50);
    }

    // --- 9. Driver Dashboard Logic ---
    let driverStatusInterval;
    
    window.toggleDriverStatus = function(isOnline) {
        const offlineBtn = document.getElementById('driverOfflineBtn');
        const onlineBtn = document.getElementById('driverOnlineBtn');
        const offlineState = document.getElementById('driverOfflineState');
        const onlineState = document.getElementById('driverOnlineState');
        const incomingModal = document.getElementById('incomingOrderModal');
        const incomingContent = document.getElementById('incomingOrderContent');
        
        if (isOnline) {
            // Style toggles
            onlineBtn.classList.remove('text-gray-400');
            onlineBtn.classList.add('bg-emerald-600', 'text-white', 'shadow-sm');
            offlineBtn.classList.remove('bg-gray-600', 'text-white', 'shadow-sm');
            offlineBtn.classList.add('text-gray-400');
            
            // Switch states
            offlineState.classList.add('opacity-0', 'pointer-events-none');
            onlineState.classList.remove('opacity-0', 'pointer-events-none');
            
            showToast('You are now online and visible to customers', 'success');
            
            // Simulate incoming request after 5-8 seconds
            if(driverStatusInterval) clearTimeout(driverStatusInterval);
            driverStatusInterval = setTimeout(() => {
                showIncomingRequest();
            }, 4000 + Math.random() * 3000); // 4-7s random
            
        } else {
            // Style toggles
            offlineBtn.classList.remove('text-gray-400');
            offlineBtn.classList.add('bg-gray-600', 'text-white', 'shadow-sm');
            onlineBtn.classList.remove('bg-emerald-600', 'text-white', 'shadow-sm');
            onlineBtn.classList.add('text-gray-400');
            
            // Switch states
            onlineState.classList.add('opacity-0', 'pointer-events-none');
            offlineState.classList.remove('opacity-0', 'pointer-events-none');
            
            if(driverStatusInterval) clearTimeout(driverStatusInterval);
            
            // Hide modal if it was showing
            if (incomingModal && !incomingModal.classList.contains('hidden')) {
                incomingContent.classList.add('translate-y-full');
                setTimeout(() => incomingModal.classList.add('hidden'), 300);
            }
        }
    };
    
    window.showIncomingRequest = function() {
        const modal = document.getElementById('incomingOrderModal');
        const content = document.getElementById('incomingOrderContent');
        
        // Populate fake order data based on user's recent input if available
        if (pickupData && pickupData.landmark) {
            document.getElementById('driverBidPickup').textContent = pickupData.landmark;
        }
        if (dropoffData && dropoffData.landmark) {
            document.getElementById('driverBidDropoff').textContent = dropoffData.landmark;
        }
        if (calculatedRawCost) {
            const customerOffer = Math.round(calculatedRawCost * 0.85);
            document.getElementById('driverSuggestedFare').textContent = formatNaira(customerOffer);
            document.getElementById('driverBidInput').value = customerOffer;
        }
        
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        
        // Slide up animation
        setTimeout(() => {
            content.classList.remove('translate-y-full');
        }, 50);
        
        // Start 60s countdown
        let timeLeft = 60;
        const timerText = document.getElementById('bidTimerText');
        timerText.textContent = '60s';
        timerText.classList.remove('text-red-500');
        
        const timerInt = setInterval(() => {
            timeLeft--;
            timerText.textContent = `${timeLeft}s`;
            if (timeLeft <= 10) timerText.classList.add('text-red-500');
            
            if (timeLeft <= 0 || modal.classList.contains('hidden')) {
                clearInterval(timerInt);
                if (!modal.classList.contains('hidden')) {
                    rejectOrder();
                }
            }
        }, 1000);
    };
    
    window.rejectOrder = function() {
        const modal = document.getElementById('incomingOrderModal');
        const content = document.getElementById('incomingOrderContent');
        
        content.classList.add('translate-y-full');
        setTimeout(() => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            
            // Simulate another request later if still online
            if (!document.getElementById('driverOnlineState').classList.contains('opacity-0')) {
                driverStatusInterval = setTimeout(() => {
                    showIncomingRequest();
                }, 6000);
            }
        }, 300);
    };
    
    window.submitDriverBid = function() {
        const bidValue = document.getElementById('driverBidInput').value;
        showToast('Bid of ₦' + bidValue + ' submitted! Waiting for user...', 'success');
        
        const modal = document.getElementById('incomingOrderModal');
        const content = document.getElementById('incomingOrderContent');
        
        // Prevent multiple clicks
        const submitBtn = document.querySelector('#incomingOrderContent button:last-child');
        const originalText = submitBtn.textContent;
        submitBtn.innerHTML = '<span class="animate-pulse">Waiting for user...</span>';
        submitBtn.classList.add('opacity-80', 'cursor-wait');
        
        setTimeout(() => {
            submitBtn.innerHTML = originalText;
            submitBtn.classList.remove('opacity-80', 'cursor-wait');
            
            content.classList.add('translate-y-full');
            setTimeout(() => {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
                
                showToast('Customer Accepted your Bid! Proceed to Pickup.', 'success');
                
                // For demo loop, take them back to home after reading the toast
                setTimeout(() => {
                    navigateSPA('home');
                    // ensure driver is toggled offline for safety
                    toggleDriverStatus(false);
                }, 3000);
                
            }, 300);
            
        }, 3500); // 3.5 seconds wait
    };
});
