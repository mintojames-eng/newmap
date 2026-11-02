/**
 * MapFlow — Focused Destination & Route Assistant
 * JavaScript: Search, Selection, Route Planning, Validation & Feedback
 *
 * This script implements the improved UX workflow:
 *   Search → Filter → Select Destination → Confirm → Get Directions → Plan Route → View Summary
 *
 * Events demonstrated:
 *   1. input  — live search filtering
 *   2. click  — select destination, get directions, change, reset, retry
 *   3. submit — route form validation
 *   4. change — travel mode update
 */

// ==================== STATE ====================

const state = {
    places: [],              // fetched from JSON
    filteredPlaces: [],      // current search results
    selectedPlace: null,     // chosen destination
    travelMode: null,        // 'walking' | 'driving' | 'cycling'
    routeReady: false,
    currentStep: 'search',   // 'search' | 'confirmed' | 'directions' | 'route'
    fromCoords: null,        // { lat, lng } from geocoding or GPS
};

// OSRM travel mode → profile mapping
const OSRM_PROFILES = {
    walking: 'foot',
    driving: 'car',
    cycling: 'bike',
};

// ==================== DOM REFERENCES ====================

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const dom = {
    // Search
    searchInput: $('#search-input'),
    searchResults: $('#search-results'),
    loadingIndicator: $('#loading-indicator'),
    errorIndicator: $('#error-indicator'),
    retryBtn: $('#retry-btn'),
    emptyState: $('#empty-state'),

    // Confirmation
    confirmPanel: $('#confirm-panel'),
    confirmName: $('#confirm-name'),
    confirmAddress: $('#confirm-address'),
    confirmCategory: $('#confirm-category'),
    changeDstBtn: $('#change-destination-btn'),
    getDirBtn: $('#get-directions-btn'),

    // Route Form
    routePanel: $('#route-panel'),
    routeForm: $('#route-form'),
    fromInput: $('#from-input'),
    toInput: $('#to-input'),
    fromError: $('#from-error'),
    toError: $('#to-error'),
    modeError: $('#mode-error'),
    modeBtns: $$('.mode-btn'),
    planRouteBtn: $('#plan-route-btn'),

    // Route Summary
    summaryPanel: $('#summary-panel'),
    summaryDest: $('#summary-dest'),
    summaryFrom: $('#summary-from'),
    summaryMode: $('#summary-mode'),
    summaryDist: $('#summary-dist'),
    summaryTime: $('#summary-time'),
    startNavBtn: $('#start-nav-btn'),
    newSearchBtn: $('#new-search-btn'),

    // Steps
    stepDots: $$('.step-dot'),

    // Map
    mapContainer: $('#map'),

    // Toast
    toastContainer: $('#toast-container'),
};

// ==================== MAP ====================

let map, marker, routeLine, originMarker;
let routeLayerGroup = null;  // group for all route-related map layers

function initMap() {
    // Center on Bengaluru
    map = L.map('map', {
        zoomControl: false,
    }).setView([12.9346, 77.6057], 13);

    L.control.zoom({ position: 'topright' }).addTo(map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
    }).addTo(map);
}

function setMarker(lat, lng, name) {
    if (marker) map.removeLayer(marker);
    marker = L.marker([lat, lng])
        .addTo(map)
        .bindPopup(`<strong>${name}</strong>`)
        .openPopup();
    map.setView([lat, lng], 15, { animate: true });
}

/**
 * Draw a road-following route on the map.
 * @param {Array} coords - Array of [lat, lng] pairs from OSRM
 * @param {number} fromLat
 * @param {number} fromLng
 * @param {number} toLat
 * @param {number} toLng
 */
function drawRoute(coords, fromLat, fromLng, toLat, toLng) {
    // Clear previous route layers
    if (routeLayerGroup) {
        map.removeLayer(routeLayerGroup);
    }
    routeLayerGroup = L.layerGroup().addTo(map);

    // Draw the route polyline (Google Maps–style blue)
    routeLine = L.polyline(coords, {
        color: '#4285F4',
        weight: 5,
        opacity: 0.85,
        lineJoin: 'round',
        lineCap: 'round',
    }).addTo(routeLayerGroup);

    // Route outline for depth effect
    L.polyline(coords, {
        color: '#1a53c0',
        weight: 8,
        opacity: 0.3,
        lineJoin: 'round',
        lineCap: 'round',
    }).addTo(routeLayerGroup);

    // Origin marker (green pulsing dot)
    originMarker = L.circleMarker([fromLat, fromLng], {
        radius: 8, color: '#fff', fillColor: '#059669',
        fillOpacity: 1, weight: 3,
    }).addTo(routeLayerGroup).bindPopup('<strong>Starting Point</strong>');

    // Destination marker (red dot)
    L.circleMarker([toLat, toLng], {
        radius: 8, color: '#fff', fillColor: '#dc2626',
        fillOpacity: 1, weight: 3,
    }).addTo(routeLayerGroup).bindPopup('<strong>Destination</strong>');

    map.fitBounds(routeLine.getBounds(), { padding: [60, 60], animate: true });
}

function resetMap() {
    if (marker) { map.removeLayer(marker); marker = null; }
    if (routeLayerGroup) { map.removeLayer(routeLayerGroup); routeLayerGroup = null; }
    routeLine = null;
    originMarker = null;
    map.setView([12.9346, 77.6057], 13, { animate: true });
}

// ==================== ROUTING UTILITIES ====================

/**
 * Decode an encoded polyline string into an array of [lat, lng] pairs.
 * Uses the Google Encoded Polyline Algorithm.
 */
function decodePolyline(encoded) {
    const coords = [];
    let index = 0, lat = 0, lng = 0;

    while (index < encoded.length) {
        let shift = 0, result = 0, byte;
        do {
            byte = encoded.charCodeAt(index++) - 63;
            result |= (byte & 0x1f) << shift;
            shift += 5;
        } while (byte >= 0x20);
        lat += (result & 1) ? ~(result >> 1) : (result >> 1);

        shift = 0; result = 0;
        do {
            byte = encoded.charCodeAt(index++) - 63;
            result |= (byte & 0x1f) << shift;
            shift += 5;
        } while (byte >= 0x20);
        lng += (result & 1) ? ~(result >> 1) : (result >> 1);

        coords.push([lat / 1e5, lng / 1e5]);
    }
    return coords;
}

/**
 * Geocode a location string using Nominatim (biased to Bengaluru).
 * Returns { lat, lng } or null.
 */
async function geocodeLocation(query) {
    const url = `https://nominatim.openstreetmap.org/search?` +
        `q=${encodeURIComponent(query + ', Bengaluru, Karnataka, India')}` +
        `&format=json&limit=1&addressdetails=0`;

    const res = await fetch(url, {
        headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) throw new Error(`Geocoding failed: HTTP ${res.status}`);
    const data = await res.json();
    if (data.length === 0) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}

/**
 * Search for location suggestions using Nominatim (for autocomplete).
 * Returns array of { display_name, lat, lng }.
 */
async function searchLocationSuggestions(query) {
    const url = `https://nominatim.openstreetmap.org/search?` +
        `q=${encodeURIComponent(query + ', Bengaluru, Karnataka, India')}` +
        `&format=json&limit=5&addressdetails=1`;

    const res = await fetch(url, {
        headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.map(item => ({
        display_name: item.display_name,
        short_name: item.display_name.split(',').slice(0, 2).join(',').trim(),
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
        type: item.type || 'place',
    }));
}

// Average speeds for realistic time estimates (km/h)
const AVG_SPEEDS = {
    walking: 5,     // 5 km/h average walking speed
    cycling: 15,    // 15 km/h average cycling speed in city
    driving: null,  // use OSRM duration directly (it's car-based)
};

/**
 * Fetch a road-following route from OSRM.
 * OSRM public server only has the 'car' profile, so we always query car
 * and then compute realistic durations for walking/cycling from distance.
 * Returns { coords, distanceKm, durationMin }.
 */
async function fetchOSRMRoute(fromLat, fromLng, toLat, toLng, mode) {
    // Always use 'car' profile since the public OSRM server only serves car routes
    const url = `https://router.project-osrm.org/route/v1/car/` +
        `${fromLng},${fromLat};${toLng},${toLat}` +
        `?overview=full&geometries=polyline`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`OSRM request failed: HTTP ${res.status}`);
    const data = await res.json();

    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
        throw new Error('No route found by OSRM');
    }

    const route = data.routes[0];
    const distanceKm = route.distance / 1000;

    // Calculate realistic duration based on travel mode
    let durationMin;
    if (mode === 'driving') {
        // Use OSRM car duration + 10% buffer for Bengaluru traffic
        durationMin = Math.round((route.duration / 60) * 1.1);
    } else {
        // Walking/cycling: distance ÷ average speed, multiply by 1.15 for stops/signals
        const avgSpeed = AVG_SPEEDS[mode] || 5;
        durationMin = Math.round((distanceKm / avgSpeed) * 60 * 1.15);
    }

    return {
        coords: decodePolyline(route.geometry),
        distanceKm: distanceKm.toFixed(1),
        durationMin: durationMin,
    };
}

/**
 * Use browser Geolocation API to get user's current position.
 */
function useMyLocation() {
    if (!navigator.geolocation) {
        showToast('Geolocation is not supported by your browser.', 'error');
        return;
    }

    const btn = document.getElementById('use-location-btn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Locating…';
    }

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude } = position.coords;
            state.fromCoords = { lat: latitude, lng: longitude };
            dom.fromInput.value = `My Location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`;
            showToast('📍 Location detected!', 'success');
            if (btn) { btn.disabled = false; btn.textContent = '📍 Use My Location'; }
        },
        (err) => {
            console.error('Geolocation error:', err);
            showToast('Unable to get your location. Please type it manually.', 'error');
            if (btn) { btn.disabled = false; btn.textContent = '📍 Use My Location'; }
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
}

// ==================== AUTOCOMPLETE ====================

let acDebounceTimer = null;
const AC_DEBOUNCE_MS = 400;

/**
 * Handle input on the From field: debounce and fetch suggestions.
 */
function handleFromInput(e) {
    const query = e.target.value.trim();
    state.fromCoords = null; // clear previously selected coords

    // Clear previous timer
    if (acDebounceTimer) clearTimeout(acDebounceTimer);

    const dropdown = document.getElementById('from-suggestions');
    if (!dropdown) return;

    // If too short, hide dropdown
    if (query.length < 2) {
        dropdown.classList.add('hidden');
        dropdown.innerHTML = '';
        return;
    }

    // Show loading state
    dropdown.classList.remove('hidden');
    dropdown.innerHTML = '<div class="autocomplete-loading">Searching places…</div>';

    // Debounce the API call
    acDebounceTimer = setTimeout(async () => {
        try {
            const suggestions = await searchLocationSuggestions(query);
            renderSuggestions(dropdown, suggestions);
        } catch (err) {
            console.error('Autocomplete error:', err);
            dropdown.classList.add('hidden');
        }
    }, AC_DEBOUNCE_MS);
}

/**
 * Render autocomplete suggestion items in the dropdown.
 */
function renderSuggestions(dropdown, suggestions) {
    if (suggestions.length === 0) {
        dropdown.innerHTML = '<div class="autocomplete-loading">No places found</div>';
        return;
    }

    dropdown.innerHTML = '';
    suggestions.forEach((place) => {
        const item = document.createElement('div');
        item.className = 'autocomplete-item';
        item.innerHTML = `
            <span class="ac-icon">
                <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                </svg>
            </span>
            <div>
                <div class="ac-name">${place.short_name}</div>
                <div class="ac-address">${place.display_name}</div>
            </div>
        `;

        item.addEventListener('click', () => {
            // Set the input value and store coords
            dom.fromInput.value = place.short_name;
            state.fromCoords = { lat: place.lat, lng: place.lng };
            dropdown.classList.add('hidden');
            dropdown.innerHTML = '';
            showToast(`📍 Starting point: ${place.short_name}`, 'info');
        });

        dropdown.appendChild(item);
    });
}

/**
 * Close the autocomplete dropdown when clicking outside.
 */
function closeAutocompleteOnClickOutside(e) {
    const dropdown = document.getElementById('from-suggestions');
    if (!dropdown) return;
    if (!dom.fromInput.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.add('hidden');
    }
}

// ==================== TOAST ====================

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    dom.toastContainer.appendChild(toast);

    // Trigger show
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    // Auto-remove after 3.5s
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 3500);
}

// ==================== STEP INDICATOR ====================

function updateSteps(stepIndex) {
    dom.stepDots.forEach((dot, i) => {
        dot.classList.remove('active', 'completed');
        if (i < stepIndex) dot.classList.add('completed');
        else if (i === stepIndex) dot.classList.add('active');
    });
}

// ==================== FETCH DATA ====================

async function fetchPlaces() {
    dom.loadingIndicator.classList.remove('hidden');
    dom.errorIndicator.classList.add('hidden');
    dom.searchResults.innerHTML = '';
    dom.emptyState.classList.add('hidden');

    try {
        const response = await fetch('data/places.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        state.places = await response.json();
        dom.loadingIndicator.classList.add('hidden');
        // Show all results initially
        filterAndRender('');
    } catch (err) {
        console.error('Fetch error:', err);
        dom.loadingIndicator.classList.add('hidden');
        dom.errorIndicator.classList.remove('hidden');
    }
}

// ==================== SEARCH & FILTER ====================

/**
 * EVENT 1 — INPUT EVENT
 * Purpose: Dynamically filter destinations as the user types,
 * reducing the effort of identifying the correct destination.
 */
function filterAndRender(query) {
    const q = query.trim().toLowerCase();

    if (q === '') {
        state.filteredPlaces = [...state.places];
    } else {
        state.filteredPlaces = state.places.filter((p) =>
            p.name.toLowerCase().includes(q) ||
            p.category.toLowerCase().includes(q) ||
            p.address.toLowerCase().includes(q)
        );
    }

    renderResults(state.filteredPlaces, q);
}

function renderResults(places, query) {
    dom.searchResults.innerHTML = '';
    dom.emptyState.classList.add('hidden');

    if (places.length === 0) {
        dom.emptyState.classList.remove('hidden');
        return;
    }

    // Separate primary from related/other
    const primary = places.filter((p) => p.type === 'primary');
    const related = places.filter((p) => p.type === 'related');
    const other = places.filter((p) => p.type === 'other');

    // Smart sort: if query matches name more closely, move to top
    const sortByRelevance = (arr) => {
        if (!query) return arr;
        return [...arr].sort((a, b) => {
            const aIdx = a.name.toLowerCase().indexOf(query);
            const bIdx = b.name.toLowerCase().indexOf(query);
            return aIdx - bIdx;
        });
    };

    if (primary.length > 0) {
        const heading = document.createElement('p');
        heading.className = 'text-xs font-semibold text-blue-600 uppercase tracking-wider mb-2 mt-1 px-1';
        heading.textContent = 'Best Match';
        dom.searchResults.appendChild(heading);
        sortByRelevance(primary).forEach((p) => dom.searchResults.appendChild(createResultCard(p, true)));
    }

    if (related.length > 0) {
        const heading = document.createElement('p');
        heading.className = 'text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 mt-4 px-1';
        heading.textContent = 'Other Related Places';
        dom.searchResults.appendChild(heading);
        sortByRelevance(related).forEach((p) => dom.searchResults.appendChild(createResultCard(p, false)));
    }

    if (other.length > 0) {
        const heading = document.createElement('p');
        heading.className = 'text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 mt-4 px-1';
        heading.textContent = 'Nearby Landmarks';
        dom.searchResults.appendChild(heading);
        sortByRelevance(other).forEach((p) => dom.searchResults.appendChild(createResultCard(p, false)));
    }
}

function createResultCard(place, isPrimary) {
    const card = document.createElement('div');
    card.className = `result-card rounded-lg p-4 mb-2 cursor-pointer bg-white border ${isPrimary ? 'primary-result border-blue-200' : 'related-result border-gray-200'
        }`;
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `Select ${place.name}`);

    card.innerHTML = `
    <div class="flex items-start justify-between gap-3">
      <div class="flex-1 min-w-0">
        <h3 class="font-semibold ${isPrimary ? 'text-base text-gray-900' : 'text-sm text-gray-700'}">
          ${highlightMatch(place.name, dom.searchInput.value)}
        </h3>
        <p class="text-xs ${isPrimary ? 'text-blue-600' : 'text-gray-500'} mt-0.5">${place.category}</p>
        <p class="text-xs text-gray-500 mt-0.5">${place.address}</p>
        ${isPrimary ? `<p class="text-xs text-gray-400 mt-1">${place.description}</p>` : ''}
      </div>
      <button
        class="select-place-btn flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg
               ${isPrimary
            ? 'bg-blue-600 text-white hover:bg-blue-700'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
        } transition"
        data-id="${place.id}"
        aria-label="Select ${place.name} as destination"
      >
        Select
      </button>
    </div>
  `;

    // Clicking the whole card also selects
    card.addEventListener('click', (e) => {
        if (!e.target.classList.contains('select-place-btn')) {
            selectDestination(place.id);
        }
    });

    // Keyboard support
    card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            selectDestination(place.id);
        }
    });

    return card;
}

function highlightMatch(text, query) {
    if (!query || !query.trim()) return text;
    const regex = new RegExp(`(${escapeRegex(query.trim())})`, 'gi');
    return text.replace(regex, '<mark class="bg-yellow-200 rounded px-0.5">$1</mark>');
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ==================== DESTINATION SELECTION ====================

/**
 * EVENT 2 — CLICK EVENT
 * Purpose: Make destination selection and next-action explicit,
 * directly addressing the benchmark's lack of clear CTAs.
 */
function selectDestination(id) {
    const place = state.places.find((p) => p.id === id);
    if (!place) return;

    state.selectedPlace = place;
    state.currentStep = 'confirmed';

    // Update confirmation panel
    dom.confirmName.textContent = place.name;
    dom.confirmAddress.textContent = place.address;
    dom.confirmCategory.textContent = place.category;

    // Show confirm panel, hide search results
    dom.searchResults.classList.add('hidden');
    dom.emptyState.classList.add('hidden');
    dom.confirmPanel.classList.remove('hidden');
    dom.confirmPanel.classList.add('fade-in');

    // Hide route panels
    dom.routePanel.classList.add('hidden');
    dom.summaryPanel.classList.add('hidden');

    // Update map
    setMarker(place.lat, place.lng, place.name);

    // Update steps
    updateSteps(1);

    // Toast
    showToast(`✓ ${place.name} selected.`, 'success');
}

function changeDestination() {
    state.selectedPlace = null;
    state.travelMode = null;
    state.routeReady = false;
    state.currentStep = 'search';

    // Reset UI
    dom.confirmPanel.classList.add('hidden');
    dom.routePanel.classList.add('hidden');
    dom.summaryPanel.classList.add('hidden');
    dom.searchResults.classList.remove('hidden');

    // Clear mode buttons
    dom.modeBtns.forEach((b) => b.classList.remove('active'));

    // Clear validation errors
    clearErrors();

    // Reset map
    resetMap();

    // Re-render results
    filterAndRender(dom.searchInput.value);

    updateSteps(0);
    showToast('Destination selection cleared.', 'info');
}

function showRouteForm() {
    if (!state.selectedPlace) return;

    state.currentStep = 'directions';

    // Pre-fill "To"
    dom.toInput.value = state.selectedPlace.name;

    // Show route panel
    dom.routePanel.classList.remove('hidden');
    dom.routePanel.classList.add('fade-in');
    dom.summaryPanel.classList.add('hidden');

    // Hide confirm's "Get Directions" — keep confirmation visible
    updateSteps(2);
    showToast('Set your starting location and travel mode.', 'info');
}

// ==================== ROUTE FORM ====================

/**
 * EVENT 3 — SUBMIT EVENT
 * Purpose: Validate route inputs and provide inline error feedback,
 * preventing incomplete route requests.
 */
function handleRouteSubmit(e) {
    e.preventDefault();
    clearErrors();

    let valid = true;

    // Validate From
    if (!dom.fromInput.value.trim()) {
        showFieldError(dom.fromError, 'Please enter a starting location.');
        valid = false;
    }

    // Validate To
    if (!dom.toInput.value.trim()) {
        showFieldError(dom.toError, 'Please select a destination first.');
        valid = false;
    }

    // Validate Mode
    if (!state.travelMode) {
        showFieldError(dom.modeError, 'Please select a travel mode.');
        valid = false;
    }

    if (!valid) {
        showToast('⚠ Please fill in all required fields.', 'error');
        return;
    }

    // Generate route summary with mock data
    generateRoute();
}

function showFieldError(el, msg) {
    el.textContent = '⚠ ' + msg;
    el.classList.add('visible');
}

function clearErrors() {
    [dom.fromError, dom.toError, dom.modeError].forEach((el) => {
        el.textContent = '';
        el.classList.remove('visible');
    });
}

async function generateRoute() {
    const place = state.selectedPlace;
    if (!place) return;

    // Show loading state on button
    dom.planRouteBtn.disabled = true;
    dom.planRouteBtn.innerHTML = '<span class="inline-flex items-center gap-2"><span class="btn-spinner"></span> Finding best route…</span>';

    try {
        // Step 1: Resolve "From" coordinates
        let fromLat, fromLng;

        if (state.fromCoords) {
            // User used "Use My Location" — coords already available
            fromLat = state.fromCoords.lat;
            fromLng = state.fromCoords.lng;
        } else {
            // Geocode the typed "From" location
            const fromText = dom.fromInput.value.trim();
            const geo = await geocodeLocation(fromText);
            if (!geo) {
                showToast(`⚠ Could not find "${fromText}". Try a more specific location.`, 'error');
                return;
            }
            fromLat = geo.lat;
            fromLng = geo.lng;
        }

        // Step 2: Fetch road-following route from OSRM
        const routeData = await fetchOSRMRoute(
            fromLat, fromLng, place.lat, place.lng, state.travelMode
        );

        state.routeReady = true;
        state.currentStep = 'route';

        // Fill summary with real OSRM data
        dom.summaryDest.textContent = place.name;
        dom.summaryFrom.textContent = dom.fromInput.value.trim();
        dom.summaryMode.textContent = capitalize(state.travelMode);
        dom.summaryDist.textContent = `${routeData.distanceKm} km`;
        dom.summaryTime.textContent = `${routeData.durationMin} min`;

        // Show summary
        dom.summaryPanel.classList.remove('hidden');
        dom.summaryPanel.classList.add('fade-in');

        // Draw road-following route on map
        drawRoute(routeData.coords, fromLat, fromLng, place.lat, place.lng);

        updateSteps(3);
        showToast('✓ Route prepared successfully!', 'success');

    } catch (err) {
        console.error('Route generation error:', err);
        showToast('⚠ Could not fetch route. Showing approximate path.', 'error');

        // Fallback: straight-line route with mock data
        const modeData = getModeData(place, state.travelMode);
        const fromLat = place.lat + 0.015;
        const fromLng = place.lng - 0.01;

        state.routeReady = true;
        state.currentStep = 'route';

        dom.summaryDest.textContent = place.name;
        dom.summaryFrom.textContent = dom.fromInput.value.trim();
        dom.summaryMode.textContent = capitalize(state.travelMode);
        dom.summaryDist.textContent = `${modeData.distance} km`;
        dom.summaryTime.textContent = `${modeData.time} min`;

        dom.summaryPanel.classList.remove('hidden');
        dom.summaryPanel.classList.add('fade-in');

        drawRoute(
            [[fromLat, fromLng], [place.lat, place.lng]],
            fromLat, fromLng, place.lat, place.lng
        );
        updateSteps(3);
    } finally {
        // Reset button state
        dom.planRouteBtn.disabled = false;
        dom.planRouteBtn.textContent = 'Plan Route';
    }
}

function getModeData(place, mode) {
    switch (mode) {
        case 'walking':
            return { distance: place.distance_walk, time: place.time_walk };
        case 'driving':
            return { distance: place.distance_drive, time: place.time_drive };
        case 'cycling':
            return { distance: place.distance_cycle, time: place.time_cycle };
        default:
            return { distance: place.distance_walk, time: place.time_walk };
    }
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// ==================== TRAVEL MODE ====================

/**
 * EVENT 4 — CHANGE EVENT (via click on mode buttons)
 * Purpose: Update route estimates dynamically when the user
 * switches between Walking, Driving, and Cycling.
 */
function handleModeChange(mode) {
    state.travelMode = mode;

    // Update active button
    dom.modeBtns.forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    // Clear mode error if present
    dom.modeError.textContent = '';
    dom.modeError.classList.remove('visible');

    // If route summary is visible, update it
    if (state.routeReady && state.selectedPlace) {
        const modeData = getModeData(state.selectedPlace, mode);
        dom.summaryMode.textContent = capitalize(mode);
        dom.summaryDist.textContent = `${modeData.distance} km`;
        dom.summaryTime.textContent = `${modeData.time} min`;
        showToast(`Updated to ${capitalize(mode)} mode.`, 'info');
    }
}

// ==================== FULL RESET ====================

function resetWorkflow() {
    state.selectedPlace = null;
    state.travelMode = null;
    state.routeReady = false;
    state.currentStep = 'search';
    state.fromCoords = null;

    // Clear input
    dom.searchInput.value = '';

    // Reset all panels
    dom.confirmPanel.classList.add('hidden');
    dom.routePanel.classList.add('hidden');
    dom.summaryPanel.classList.add('hidden');
    dom.searchResults.classList.remove('hidden');

    // Clear mode
    dom.modeBtns.forEach((b) => b.classList.remove('active'));

    // Clear form
    dom.fromInput.value = '';
    dom.toInput.value = '';
    clearErrors();

    // Reset map
    resetMap();

    // Re-render all places
    filterAndRender('');

    updateSteps(0);
    showToast('Workflow reset. Start a new search.', 'info');
}

// ==================== EVENT LISTENERS ====================

function bindEvents() {
    // EVENT 1: input — live search
    dom.searchInput.addEventListener('input', (e) => {
        filterAndRender(e.target.value);
    });

    // EVENT 2: click — select buttons (delegated)
    dom.searchResults.addEventListener('click', (e) => {
        const btn = e.target.closest('.select-place-btn');
        if (btn) {
            selectDestination(Number(btn.dataset.id));
        }
    });

    // Click — Change Destination
    dom.changeDstBtn.addEventListener('click', changeDestination);

    // Click — Get Directions
    dom.getDirBtn.addEventListener('click', showRouteForm);

    // Click — Retry fetch
    dom.retryBtn.addEventListener('click', fetchPlaces);

    // Click — Start Navigation (prototype acknowledgment)
    dom.startNavBtn.addEventListener('click', () => {
        showToast('Navigation started (prototype simulation).', 'success');
    });

    // Click — New Search
    dom.newSearchBtn.addEventListener('click', resetWorkflow);

    // EVENT 3: submit — route form
    dom.routeForm.addEventListener('submit', handleRouteSubmit);

    // EVENT 4: change — travel mode buttons
    dom.modeBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
            handleModeChange(btn.dataset.mode);
        });
    });

    // EVENT 5: click — Use My Location button
    const locBtn = document.getElementById('use-location-btn');
    if (locBtn) {
        locBtn.addEventListener('click', () => {
            useMyLocation();
            // Close autocomplete dropdown on location use
            const dd = document.getElementById('from-suggestions');
            if (dd) { dd.classList.add('hidden'); dd.innerHTML = ''; }
        });
    }

    // EVENT 6: input — From field autocomplete suggestions
    dom.fromInput.addEventListener('input', handleFromInput);

    // Close autocomplete dropdown on outside click
    document.addEventListener('click', closeAutocompleteOnClickOutside);
}

// ==================== INIT ====================

document.addEventListener('DOMContentLoaded', () => {
    initMap();
    bindEvents();
    fetchPlaces();
    updateSteps(0);
});
