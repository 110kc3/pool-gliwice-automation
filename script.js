// ---------------------------------------------------------------------------
// Pure availability logic (no DOM access) — see tests/test_availability.mjs
// ---------------------------------------------------------------------------

const DAYS_ORDER = ["Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota", "Niedziela"];
const DAY_SET = new Set(DAYS_ORDER);

// Olimpijczyk's full configuration is 9×50 m + 1×25 m = 10 lanes. We use this as
// a floor for every pool's capacity so that pools which only report open/closed
// status (Mewa, Delfin) are normalised on the same 0..1 scale as Olimpijczyk's
// lane counts. See computeCapacities().
const DEFAULT_CAPACITY = 10;

const MONTHS = "stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|października|listopada|grudnia";

// Normalise a raw cell value: strip the stray carriage returns that the PDF
// parser leaves behind and collapse whitespace.
function cleanCell(value) {
    if (typeof value !== 'string') return '';
    return value.replace(/\r/g, ' ').replace(/\s+/g, ' ').trim();
}

// Classify a raw `availableLanes` string into a structured descriptor.
// Returns one of:
//   { noise: true }                         -> header / date / parsing artifact, ignore
//   { score: 0 }                            -> pool unavailable or closed
//   { open: true }                          -> fully open, no occupancy detail
//   { open: true, occupied: N }             -> open but N lanes occupied
//   { occupied: N }                         -> N lanes occupied
//   { freeLanes: N }                        -> N lanes free (Olimpijczyk lane counts)
function classifyAvailability(raw) {
    const s = cleanCell(raw);
    if (!s) return { noise: true };
    const lower = s.toLowerCase();

    // --- Noise: day-name header rows, date rows, column headers, stray letters
    if (DAY_SET.has(s)) return { noise: true };
    if (new RegExp(`^\\d{1,2}\\s+(${MONTHS})`, 'i').test(lower)) return { noise: true };
    if (/(ilość wolnych torów|godzina|dzień|tygodnia|harmonogram|^data$)/.test(lower)) return { noise: true };
    // Stray single/short letter artifacts ("n", "a", "l", "Pływ" mangled) with no digit
    if (!/\d/.test(s) && s.replace(/[^a-zA-Ząćęłńóśźż]/gi, '').length < 5 && !/wolne/.test(lower)) {
        return { noise: true };
    }

    // --- Closed / unavailable (check "niedostępna"/"nieczynna" before "dostępna")
    if (lower.includes('niedostępna') || lower.includes('nieczynna')) return { score: 0 };

    // --- All lanes free
    if (lower.includes('wolne wszystkie')) return { open: true };

    // --- "Pływalnia dostępna - zajęty N tor(y)"
    let m = lower.match(/dostępna.*zaj[ęe]t[ey]\s*(\d+)\s*tor/);
    if (m) return { open: true, occupied: parseInt(m[1], 10) };

    // --- "Zajęty / Zajęte N tory" (N lanes occupied)
    m = lower.match(/^zaj[ęe]t[ey]\s*(\d+)\s*tor/);
    if (m) return { occupied: parseInt(m[1], 10) };

    // --- Lane counts: "9x50m, 1x25m i wypł" -> sum of the "Nx..m" groups
    const laneMatches = [...lower.matchAll(/(\d+)\s*x\s*\d+\s*m/g)];
    if (laneMatches.length) {
        const lanes = laneMatches.reduce((sum, mm) => sum + parseInt(mm[1], 10), 0);
        return { freeLanes: lanes };
    }

    // --- Generic "Pływalnia dostępna"
    if (lower.includes('dostępna')) return { open: true };

    // Unknown, non-empty value: treat as noise so it cannot pollute rankings.
    return { noise: true };
}

// Compute a capacity (max plausible free lanes) per pool name, so lane counts
// and open/closed status can be compared on a shared 0..1 scale.
function computeCapacities(pools) {
    const capacities = {};
    pools.forEach(pool => {
        let maxFree = 0;
        (pool.schedule || []).forEach(entry => {
            const info = classifyAvailability(entry.availableLanes);
            if (typeof info.freeLanes === 'number') maxFree = Math.max(maxFree, info.freeLanes);
        });
        capacities[pool.name] = Math.max(maxFree, DEFAULT_CAPACITY);
    });
    return capacities;
}

// Map a classified descriptor to an openness score in [0, 1] given pool capacity.
// Returns null for noise (caller should skip the entry entirely).
function opennessScore(info, capacity) {
    if (info.noise) return null;
    if (info.score === 0) return 0;
    const cap = capacity || DEFAULT_CAPACITY;
    if (typeof info.freeLanes === 'number') return Math.min(1, info.freeLanes / cap);
    let occupied = typeof info.occupied === 'number' ? info.occupied : 0;
    if (info.open) return Math.max(0, (cap - occupied) / cap);
    if (typeof info.occupied === 'number') return Math.max(0, (cap - occupied) / cap);
    return null;
}

// ---------------------------------------------------------------------------
// Data validation
// ---------------------------------------------------------------------------

// Validate the shape of data.json and return only the records that conform to
// the contract: { name: string, schedule: [{ day, time, availableLanes }] }.
// Malformed records/entries are dropped (and counted) rather than crashing.
function validatePoolData(data) {
    const warnings = [];
    if (!Array.isArray(data)) {
        return { pools: null, warnings: ['data.json is not an array — expected a list of pools.'] };
    }
    const pools = [];
    data.forEach((pool, i) => {
        if (!pool || typeof pool !== 'object' || typeof pool.name !== 'string' || !Array.isArray(pool.schedule)) {
            warnings.push(`Skipping malformed pool record at index ${i}.`);
            return;
        }
        const schedule = pool.schedule.filter((entry, j) => {
            const ok = entry && typeof entry === 'object' &&
                typeof entry.day === 'string' &&
                typeof entry.time === 'string' &&
                typeof entry.availableLanes === 'string';
            if (!ok) warnings.push(`Skipping malformed entry ${j} in pool "${pool.name}".`);
            return ok;
        });
        pools.push({ name: pool.name, schedule });
    });
    return { pools, warnings };
}

// ---------------------------------------------------------------------------
// Rendering (browser only)
// ---------------------------------------------------------------------------

function initApp(rawData) {
    const { pools, warnings } = validatePoolData(rawData);
    const poolAvailabilityDiv = document.getElementById('pool-availability');

    if (!pools) {
        showError('Could not load pool data — the data file is in an unexpected format.');
        return;
    }
    if (warnings.length) {
        console.warn(`Pool data validation: ${warnings.length} issue(s).`, warnings);
    }

    window.poolData = pools;
    const capacities = computeCapacities(pools);

    function render() {
        const dayFilter = document.getElementById('day-filter').value;
        const highlightsContainer = document.getElementById('highlights-container');
        poolAvailabilityDiv.innerHTML = '';

        const hourlyBuckets = [];

        pools.forEach(pool => {
            const cap = capacities[pool.name];
            const groups = {};
            pool.schedule
                .filter(entry => dayFilter === 'all' || entry.day === dayFilter)
                .forEach(entry => {
                    const info = classifyAvailability(entry.availableLanes);
                    const score = opennessScore(info, cap);
                    if (score === null) return; // noise / unrecognised -> skip
                    const timeMatch = entry.time.match(/(\d+)/);
                    if (!timeMatch) return;
                    const startHour = parseInt(timeMatch[1], 10);
                    const key = `${entry.day}-${startHour}`;
                    if (!groups[key]) {
                        groups[key] = {
                            poolName: pool.name,
                            day: entry.day,
                            time: `${startHour}:00 - ${startHour + 1}:00`,
                            totalScore: 0,
                            count: 0
                        };
                    }
                    groups[key].totalScore += score;
                    groups[key].count++;
                });

            Object.values(groups).forEach(g => {
                hourlyBuckets.push({ ...g, openness: g.totalScore / g.count });
            });
        });

        // Best pool per (day, hour)
        const bestSlotsByHour = {};
        hourlyBuckets.forEach(slot => {
            const key = `${slot.day}-${slot.time}`;
            if (!bestSlotsByHour[key] || slot.openness > bestSlotsByHour[key].openness) {
                bestSlotsByHour[key] = slot;
            }
        });

        const sortedSlots = Object.values(bestSlotsByHour)
            .filter(slot => slot.openness > 0)
            .sort((a, b) => {
                const dayCompare = DAYS_ORDER.indexOf(a.day) - DAYS_ORDER.indexOf(b.day);
                if (dayCompare !== 0) return dayCompare;
                return parseInt(a.time, 10) - parseInt(b.time, 10);
            });

        highlightsContainer.innerHTML = sortedSlots.length
            ? sortedSlots.map(slot => `
                <div class="highlight-card">
                    <strong>${escapeHtml(slot.poolName)}</strong><br>
                    ${escapeHtml(slot.day)}<br>
                    ${escapeHtml(slot.time)}<br>
                    ${Math.round(slot.openness * 100)}% wolne
                </div>
            `).join('')
            : '<p>Brak dostępnych terminów dla wybranego dnia.</p>';

        // Per-pool schedule tables
        pools.forEach(pool => {
            const poolSchedule = pool.schedule
                .filter(entry => !classifyAvailability(entry.availableLanes).noise)
                .filter(entry => dayFilter === 'all' || entry.day === dayFilter);
            if (poolSchedule.length === 0) return;
            const poolCard = document.createElement('div');
            poolCard.classList.add('pool-card');
            poolCard.innerHTML = `
                <h2>${escapeHtml(pool.name)}</h2>
                <table class="schedule-table">
                    <thead><tr><th>Dzień</th><th>Godzina</th><th>Dostępność</th></tr></thead>
                    <tbody>
                        ${poolSchedule.map(e => `<tr><td>${escapeHtml(cleanCell(e.day))}</td><td>${escapeHtml(cleanCell(e.time))}</td><td>${escapeHtml(cleanCell(e.availableLanes))}</td></tr>`).join('')}
                    </tbody>
                </table>`;
            poolAvailabilityDiv.appendChild(poolCard);
        });
    }

    document.getElementById('day-filter').addEventListener('change', render);
    render();
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function showError(message) {
    const container = document.getElementById('pool-availability');
    if (container) container.innerHTML = `<p class="error">${escapeHtml(message)}</p>`;
    const highlights = document.getElementById('highlights-container');
    if (highlights) highlights.innerHTML = '';
}

if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        fetch('data.json')
            .then(response => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.json();
            })
            .then(initApp)
            .catch(err => {
                console.error('Failed to load or process data:', err);
                showError('Could not load pool data. Please try again later.');
            });
    });
}

// Exposed for Node-based unit tests; ignored in the browser.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        cleanCell,
        classifyAvailability,
        computeCapacities,
        opennessScore,
        validatePoolData,
        DEFAULT_CAPACITY,
        DAYS_ORDER
    };
}
