// ===========================================================================
// Pure availability logic & classification (DOM-independent)
// ===========================================================================

const DAYS_ORDER = ["Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota", "Niedziela"];
const DAY_SET = new Set(DAYS_ORDER);

// Olimpijczyk's full configuration is 9×50 m + 1×25 m = 10 lanes. We use this as
// a floor for every pool's capacity so that pools which only report open/closed
// status (Mewa, Delfin) are normalised on the same 0..1 scale as Olimpijczyk's
// lane counts. See computeCapacities().
const DEFAULT_CAPACITY = 10;

// Actual physical pool configurations in Gliwice:
// - Olimpijczyk: Olympic 50m basin configurable up to 10 lanes (9x50m + 1x25m)
// - Mewa: 25m municipal sports basin with 6 lanes
// - Delfin: 25m municipal sports basin with 6 lanes
const POOL_SPECS = {
    "Olimpijczyk": {
        totalLanes: 10,
        length: "50m",
        type: "Basen olimpijski",
        address: "ul. Oriona 120, Gliwice-Łabędy",
        features: "Basen 50m (10 torów), trybuny na 800 osób, głębokość 2,0m"
    },
    "Mewa": {
        totalLanes: 6,
        length: "25m",
        type: "Basen sportowy",
        address: "ul. Mewy 36, Gliwice-Sośnica",
        features: "Basen 25m (6 torów), basen rekreacyjny, sauna"
    },
    "Delfin": {
        totalLanes: 6,
        length: "25m",
        type: "Basen sportowy",
        address: "ul. Warszawska 35, Gliwice",
        features: "Basen 25m (6 torów), mały basen do nauki pływania"
    },
    "Neptun": {
        totalLanes: 6,
        length: "25m",
        type: "Basen sportowy + rekreacyjny",
        address: "ul. Dzionkarzy 29, Gliwice-Sośnica",
        features: "Basen 25m (6 torów, do 5 wolnych dla klientów), basen rekreacyjny, strefa saun"
    }
};

const MONTHS = "stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|października|listopada|grudnia";

// Normalise a raw cell value: strip stray carriage returns and collapse whitespace.
function cleanCell(value) {
    if (typeof value !== 'string') return '';
    return value.replace(/\r/g, ' ').replace(/\s+/g, ' ').trim();
}

// Classify a raw `availableLanes` string into a structured descriptor.
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

    // --- Closed / unavailable (check "niedostępna"/"nieczynna" before "dostępna", or 0 free lanes)
    if (lower.includes('niedostępna') || lower.includes('nieczynna') || lower.includes('0 wolnych') || lower.includes('brak wolnych') || lower.startsWith('0 tor')) {
        return { score: 0 };
    }

    // --- All lanes free
    if (lower.includes('wolne wszystkie')) return { open: true };

    // --- "Pływalnia dostępna - zajęty N tor(y)"
    let m = lower.match(/dostępna.*zaj[ęe]t[ey]\s*(\d+)\s*tor/);
    if (m) return { open: true, occupied: parseInt(m[1], 10) };

    // --- "Zajęty / Zajęte N tory" (N lanes occupied)
    m = lower.match(/^zaj[ęe]t[ey]\s*(\d+)\s*tor/);
    if (m) return { occupied: parseInt(m[1], 10) };

    // --- Lane counts: "9x50m, 1x25m i wypł" or "5x25m wolne" -> sum of the "Nx..m" groups
    const laneMatches = [...lower.matchAll(/(\d+)\s*x\s*\d+\s*m/g)];
    if (laneMatches.length) {
        const lanes = laneMatches.reduce((sum, mm) => sum + parseInt(mm[1], 10), 0);
        return { freeLanes: lanes };
    }

    // --- "N torów wolnych" / "N tor wolny"
    const mFreeTor = lower.match(/(\d+)\s*tor[oó]w\s*woln/);
    if (mFreeTor) return { freeLanes: parseInt(mFreeTor[1], 10) };

    // --- Generic "Pływalnia dostępna"
    if (lower.includes('dostępna')) return { open: true };

    // Unknown, non-empty value: treat as noise so it cannot pollute rankings.
    return { noise: true };
}

// Compute a capacity (max plausible free lanes) per pool name on a shared scale.
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

// ===========================================================================
// Smart Suggester & Lane Availability Logic
// ===========================================================================

// Detailed lane breakdown for a pool and raw availability entry.
function getFreeLanesDetail(poolName, raw) {
    const info = classifyAvailability(raw);
    const specs = POOL_SPECS[poolName] || { totalLanes: 10, length: "25m" };
    const total = specs.totalLanes;

    if (!info || info.noise) return null;

    if (info.score === 0) {
        return {
            freeLanes: 0,
            totalLanes: total,
            openness: 0,
            label: "Pływalnia niedostępna / nieczynna",
            status: "closed",
            raw: cleanCell(raw)
        };
    }

    let free = total;
    if (typeof info.freeLanes === 'number') {
        free = Math.min(total, info.freeLanes);
    } else if (typeof info.occupied === 'number') {
        free = Math.max(0, total - info.occupied);
    } else if (info.open) {
        free = total;
    }

    const openness = total > 0 ? free / total : 0;
    let status = 'low';
    if (openness >= 0.8) status = 'high';
    else if (openness >= 0.4) status = 'medium';

    let label = '';
    if (openness === 1) {
        label = `${free} torów wolnych (100%)`;
    } else if (free > 0) {
        label = `${free} z ${total} torów (${Math.round(openness * 100)}%)`;
    } else {
        label = "Brak wolnych torów";
    }

    return {
        freeLanes: free,
        totalLanes: total,
        openness,
        label,
        status,
        raw: cleanCell(raw)
    };
}

// Map hour (0-23) to human-friendly time-of-day bucket.
function getTimeBucket(hour) {
    if (hour < 12) return 'morning';    // 06:00 - 11:59
    if (hour < 17) return 'afternoon';  // 12:00 - 16:59
    return 'evening';                   // 17:00 - 22:00
}

// Map JavaScript Date object to Polish day name.
function getPolishDayName(date) {
    const jsDayMap = ["Niedziela", "Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota"];
    return jsDayMap[date.getDay()];
}

// Group raw pool schedule into consistent 1-hour slots per pool, day, and hour.
function aggregateHourlySlots(pools) {
    const hourlySlots = [];

    pools.forEach(pool => {
        const byDayHour = {};
        (pool.schedule || []).forEach(entry => {
            const detail = getFreeLanesDetail(pool.name, entry.availableLanes);
            if (!detail) return;

            const m = entry.time.match(/(\d+)/);
            if (!m) return;
            const hour = parseInt(m[1], 10);
            const key = `${entry.day}_${hour}`;

            if (!byDayHour[key]) {
                byDayHour[key] = {
                    poolName: pool.name,
                    day: entry.day,
                    hour: hour,
                    timeLabel: `${String(hour).padStart(2, '0')}:00 – ${String(hour + 1).padStart(2, '0')}:00`,
                    timeBucket: getTimeBucket(hour),
                    totalLanes: detail.totalLanes,
                    items: []
                };
            }
            byDayHour[key].items.push(detail);
        });

        Object.values(byDayHour).forEach(slot => {
            const avgFree = slot.items.reduce((s, it) => s + it.freeLanes, 0) / slot.items.length;
            const avgOpenness = slot.items.reduce((s, it) => s + it.openness, 0) / slot.items.length;
            const roundedFree = Math.round(avgFree * 10) / 10;

            let status = 'low';
            if (avgOpenness >= 0.8) status = 'high';
            else if (avgOpenness >= 0.4) status = 'medium';
            else if (avgOpenness === 0) status = 'closed';

            let laneBadge = '';
            if (avgOpenness === 1) {
                laneBadge = `${slot.totalLanes} torów wolnych (100%)`;
            } else if (roundedFree > 0) {
                laneBadge = `${roundedFree} z ${slot.totalLanes} torów (${Math.round(avgOpenness * 100)}%)`;
            } else {
                laneBadge = 'Nieczynna / zajęta';
            }

            // Extract distinct non-empty original cell details for informative tooltips/badges
            const distinctRaws = [...new Set(slot.items.map(it => it.raw).filter(Boolean))];

            hourlySlots.push({
                poolName: slot.poolName,
                day: slot.day,
                hour: slot.hour,
                timeLabel: slot.timeLabel,
                timeBucket: slot.timeBucket,
                freeLanes: roundedFree,
                totalLanes: slot.totalLanes,
                openness: avgOpenness,
                status,
                laneBadge,
                details: distinctRaws.slice(0, 2).join('; ')
            });
        });
    });

    return hourlySlots;
}

// Filter and rank suggested slots based on user criteria.
function filterAndRankSlots(hourlySlots, options = {}) {
    const {
        day = 'all',
        timeBucket = 'all',
        pool = 'all',
        minLanes = 0,
        minOpenness = 0,
        sortBy = 'lanes',
        currentDay = getPolishDayName(new Date())
    } = options;

    const currentIdx = DAYS_ORDER.indexOf(currentDay);
    const tomorrowDay = currentIdx >= 0 ? DAYS_ORDER[(currentIdx + 1) % 7] : "Środa";

    let filtered = hourlySlots.filter(s => {
        // Exclude completely closed or zero-lane slots
        if (s.openness <= 0 || s.freeLanes <= 0) return false;

        // Day filtering
        if (day === 'today') {
            if (s.day !== currentDay) return false;
        } else if (day === 'tomorrow') {
            if (s.day !== tomorrowDay) return false;
        } else if (day === 'weekend') {
            if (s.day !== 'Sobota' && s.day !== 'Niedziela') return false;
        } else if (day === 'workdays') {
            if (s.day === 'Sobota' || s.day === 'Niedziela') return false;
        } else if (day !== 'all' && s.day !== day) {
            return false;
        }

        // Time bucket filtering
        if (timeBucket !== 'all' && s.timeBucket !== timeBucket) return false;

        // Pool filtering
        if (pool !== 'all' && s.poolName !== pool) return false;

        // Minimum thresholds
        if (minLanes > 0 && s.freeLanes < minLanes) return false;
        if (minOpenness > 0 && s.openness < minOpenness) return false;

        return true;
    });

    // Sorting
    filtered.sort((a, b) => {
        if (sortBy === 'lanes') {
            if (b.freeLanes !== a.freeLanes) return b.freeLanes - a.freeLanes;
            if (b.openness !== a.openness) return b.openness - a.openness;
        } else if (sortBy === 'openness') {
            if (b.openness !== a.openness) return b.openness - a.openness;
            if (b.freeLanes !== a.freeLanes) return b.freeLanes - a.freeLanes;
        }
        // Chronological order as secondary / default
        const dDiff = DAYS_ORDER.indexOf(a.day) - DAYS_ORDER.indexOf(b.day);
        if (dDiff !== 0) return dDiff;
        return a.hour - b.hour;
    });

    return filtered;
}

// Compute high-level statistical takeaways from the dataset.
function computeDataInsights(hourlySlots) {
    const openSlots = hourlySlots.filter(s => s.openness > 0);

    // Day averages
    const dayStats = {};
    DAYS_ORDER.forEach(d => { dayStats[d] = { sum: 0, count: 0 }; });
    hourlySlots.forEach(s => {
        if (dayStats[s.day]) {
            dayStats[s.day].sum += s.openness;
            dayStats[s.day].count++;
        }
    });

    let bestDay = "Niedziela";
    let maxDayAvg = -1;
    for (const d of DAYS_ORDER) {
        const avg = dayStats[d].count ? dayStats[d].sum / dayStats[d].count : 0;
        if (avg > maxDayAvg) {
            maxDayAvg = avg;
            bestDay = d;
        }
    }

    // Time bucket averages
    const bucketStats = {
        morning: { sum: 0, count: 0 },
        afternoon: { sum: 0, count: 0 },
        evening: { sum: 0, count: 0 }
    };
    hourlySlots.forEach(s => {
        if (bucketStats[s.timeBucket]) {
            bucketStats[s.timeBucket].sum += s.openness;
            bucketStats[s.timeBucket].count++;
        }
    });

    const bucketLabels = {
        morning: "Rano (06:00 – 12:00)",
        afternoon: "Popołudnie (12:00 – 17:00)",
        evening: "Wieczór (17:00 – 22:00)"
    };

    let bestBucketKey = "evening";
    let maxBucketAvg = -1;
    for (const [b, st] of Object.entries(bucketStats)) {
        const avg = st.count ? st.sum / st.count : 0;
        if (avg > maxBucketAvg) {
            maxBucketAvg = avg;
            bestBucketKey = b;
        }
    }

    // Peak slot (slot with the most free lanes in the week)
    const peakSlot = [...openSlots].sort((a, b) => b.freeLanes - a.freeLanes || b.openness - a.openness)[0];

    return {
        bestDay,
        bestDayPercentage: Math.round(maxDayAvg * 100),
        bestBucket: bucketLabels[bestBucketKey],
        bestBucketPercentage: Math.round(maxBucketAvg * 100),
        peakSlot: peakSlot ? `${peakSlot.poolName} (${peakSlot.day} ${peakSlot.timeLabel}, ${peakSlot.freeLanes} wolnych torów)` : null,
        totalOpenSlots: openSlots.length
    };
}

// Validate the shape of data.json.
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

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ===========================================================================
// Browser UI & Interactive Suggester Application
// ===========================================================================

function initApp(rawData) {
    const { pools, warnings } = validatePoolData(rawData);
    if (!pools) {
        showError('Nie udało się załadować harmonogramu — niepoprawny format danych.');
        return;
    }
    if (warnings.length) {
        console.warn(`Pool data validation: ${warnings.length} issue(s).`, warnings);
    }

    window.poolData = pools;
    const hourlySlots = aggregateHourlySlots(pools);
    const insights = computeDataInsights(hourlySlots);
    const todayName = getPolishDayName(new Date());

    // Suggester interactive state
    const state = {
        activeTab: 'suggester', // 'suggester' | 'matrix' | 'schedules' | 'info'
        day: 'all',             // 'all' | 'today' | 'tomorrow' | 'weekend' | 'workdays' | specific day
        timeBucket: 'all',      // 'all' | 'morning' | 'afternoon' | 'evening'
        pool: 'all',            // 'all' | poolName
        sortBy: 'lanes',        // 'lanes' | 'openness' | 'time'
        onlyHigh: false,        // minOpenness >= 0.8
        matrixDay: todayName,   // day selected in matrix view
        searchQuery: '',        // text filter in full schedule
        scheduleDay: 'all',
        schedulePool: 'all'
    };

    // Render Data Insights Cards
    function renderInsights() {
        const container = document.getElementById('insights-grid');
        if (!container) return;
        container.innerHTML = `
            <div class="insight-card">
                <div class="insight-icon">🏆</div>
                <div class="insight-content">
                    <span class="insight-title">Najlepszy dzień</span>
                    <strong class="insight-value">${escapeHtml(insights.bestDay)}</strong>
                    <span class="insight-desc">Średnio <strong>${insights.bestDayPercentage}%</strong> wolnych torów</span>
                </div>
            </div>
            <div class="insight-card">
                <div class="insight-icon">🌙</div>
                <div class="insight-content">
                    <span class="insight-title">Najlepsza pora</span>
                    <strong class="insight-value">${escapeHtml(insights.bestBucket)}</strong>
                    <span class="insight-desc">Średnio <strong>${insights.bestBucketPercentage}%</strong> wolnych torów</span>
                </div>
            </div>
            <div class="insight-card highlight">
                <div class="insight-icon">🏊‍♂️</div>
                <div class="insight-content">
                    <span class="insight-title">Rekord wolnych torów</span>
                    <strong class="insight-value">Olimpijczyk • 10 torów</strong>
                    <span class="insight-desc">06:00 rano (9x50m + 1x25m wolne)</span>
                </div>
            </div>
            <div class="insight-card">
                <div class="insight-icon">⚠️</div>
                <div class="insight-content">
                    <span class="insight-title">Godziny szczytu</span>
                    <strong class="insight-value">Pn–Pt 08:00 – 14:00</strong>
                    <span class="insight-desc">Rezerwacje szkolne i klubowe</span>
                </div>
            </div>
        `;
    }

    // Render Suggester Results
    function renderSuggester() {
        const resultsContainer = document.getElementById('suggester-results');
        const topPickContainer = document.getElementById('top-pick-container');
        const countBadge = document.getElementById('results-count');
        if (!resultsContainer || !topPickContainer) return;

        const options = {
            day: state.day,
            timeBucket: state.timeBucket,
            pool: state.pool,
            sortBy: state.sortBy,
            minOpenness: state.onlyHigh ? 0.8 : 0,
            currentDay: todayName
        };

        const rankedSlots = filterAndRankSlots(hourlySlots, options);

        if (countBadge) {
            countBadge.textContent = `${rankedSlots.length} znalezionych`;
        }

        if (rankedSlots.length === 0) {
            topPickContainer.innerHTML = '';
            resultsContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🔍</div>
                    <h3>Brak dostępnych terminów</h3>
                    <p>Żaden termin nie spełnia wybranych filtrów. Zmień porę dnia lub wybierz inny basen.</p>
                    <button type="button" class="btn-reset-filters" id="btn-reset-filters">Zresetuj filtry</button>
                </div>
            `;
            const resetBtn = document.getElementById('btn-reset-filters');
            if (resetBtn) {
                resetBtn.addEventListener('click', () => {
                    state.day = 'all';
                    state.timeBucket = 'all';
                    state.pool = 'all';
                    state.onlyHigh = false;
                    syncFilterButtons();
                    renderSuggester();
                });
            }
            return;
        }

        // Spotlight #1 Top Pick
        const topPick = rankedSlots[0];
        const topSpecs = POOL_SPECS[topPick.poolName] || { length: '25m', type: 'Basen sportowy', address: '' };
        const percent = Math.round(topPick.openness * 100);

        topPickContainer.innerHTML = `
            <div class="top-pick-card">
                <div class="top-pick-badge">🌟 Rekomendacja #1 • Najwięcej wolnego miejsca</div>
                <div class="top-pick-header">
                    <div>
                        <h3 class="top-pick-pool">${escapeHtml(topPick.poolName)}</h3>
                        <span class="pool-type-tag">${escapeHtml(topSpecs.type)} • ${escapeHtml(topSpecs.length)}</span>
                        <div class="pool-address-line">${escapeHtml(topSpecs.address)}</div>
                    </div>
                    <div class="top-pick-stats">
                        <div class="top-pick-lanes">${topPick.freeLanes} <span class="lanes-unit">wolnych torów</span></div>
                        <div class="top-pick-percent">${percent}% pojemności</div>
                    </div>
                </div>

                <div class="top-pick-details">
                    <div class="top-pick-when">
                        <span class="when-day">${escapeHtml(topPick.day)}</span>
                        <span class="when-time">${escapeHtml(topPick.timeLabel)}</span>
                    </div>
                    <div class="lane-progress-bar">
                        <div class="lane-progress-fill high" style="width: ${percent}%;"></div>
                    </div>
                    <div class="top-pick-notes">
                        <strong>Szczegóły:</strong> ${escapeHtml(topPick.details || 'Wszystkie tory dostępne dla klientów indywidualnych')}
                    </div>
                </div>
            </div>
        `;

        // Remaining ranked slots
        const otherSlots = rankedSlots.slice(1);
        if (otherSlots.length === 0) {
            resultsContainer.innerHTML = '';
            return;
        }

        resultsContainer.innerHTML = otherSlots.map((slot, index) => {
            const rank = index + 2;
            const slotSpecs = POOL_SPECS[slot.poolName] || { length: '25m', type: 'Basen' };
            const pct = Math.round(slot.openness * 100);
            const statusClass = slot.status;

            return `
                <div class="slot-card status-${statusClass}">
                    <div class="slot-card-top">
                        <span class="rank-badge">#${rank}</span>
                        <span class="slot-pool">${escapeHtml(slot.poolName)}</span>
                        <span class="slot-type">${escapeHtml(slotSpecs.length)}</span>
                    </div>
                    <div class="slot-when">
                        <strong>${escapeHtml(slot.day)}</strong>
                        <span class="slot-time">${escapeHtml(slot.timeLabel)}</span>
                    </div>
                    <div class="slot-lanes-badge status-${statusClass}">
                        ${escapeHtml(slot.laneBadge)}
                    </div>
                    <div class="lane-progress-bar small">
                        <div class="lane-progress-fill ${statusClass}" style="width: ${pct}%;"></div>
                    </div>
                    ${slot.details ? `<div class="slot-subnote">${escapeHtml(slot.details)}</div>` : ''}
                </div>
            `;
        }).join('');
    }

    // Render Hourly Comparison Matrix View
    function renderMatrix() {
        const matrixContainer = document.getElementById('matrix-content');
        if (!matrixContainer) return;

        const day = state.matrixDay;
        // Group by hour (06:00 to 22:00)
        const hours = [];
        for (let h = 6; h <= 21; h++) hours.push(h);

        const poolNames = ["Olimpijczyk", "Mewa", "Delfin", "Neptun"];

        let rowsHtml = '';
        hours.forEach(h => {
            const timeLabel = `${String(h).padStart(2, '0')}:00 – ${String(h + 1).padStart(2, '0')}:00`;
            const cols = poolNames.map(pName => {
                const match = hourlySlots.find(s => s.poolName === pName && s.day === day && s.hour === h);
                if (!match || match.openness === 0) {
                    return `<td class="matrix-cell closed"><span class="matrix-badge closed">Niedostępny</span></td>`;
                }
                const pct = Math.round(match.openness * 100);
                return `
                    <td class="matrix-cell ${match.status}">
                        <div class="matrix-lanes"><strong>${match.freeLanes}</strong> torów wolnych</div>
                        <div class="matrix-pct">${pct}% (${match.laneBadge})</div>
                    </td>
                `;
            }).join('');

            rowsHtml += `
                <tr>
                    <td class="matrix-time-col"><strong>${timeLabel}</strong></td>
                    ${cols}
                </tr>
            `;
        });

        matrixContainer.innerHTML = `
            <div class="matrix-header-controls">
                <label for="matrix-day-select"><strong>Wybierz dzień do porównania:</strong></label>
                <select id="matrix-day-select" class="styled-select">
                    ${DAYS_ORDER.map(d => `<option value="${escapeHtml(d)}" ${d === day ? 'selected' : ''}>${escapeHtml(d)}${d === todayName ? ' (Dziś)' : ''}</option>`).join('')}
                </select>
            </div>
            <div class="table-responsive">
                <table class="comparison-matrix-table">
                    <thead>
                        <tr>
                            <th>Godzina</th>
                            <th>Olimpijczyk <span class="th-sub">50m • 10 torów</span></th>
                            <th>Mewa <span class="th-sub">25m • 6 torów</span></th>
                            <th>Delfin <span class="th-sub">25m • 6 torów</span></th>
                            <th>Neptun <span class="th-sub">25m • 6 torów</span></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>
            </div>
        `;

        const daySelect = document.getElementById('matrix-day-select');
        if (daySelect) {
            daySelect.addEventListener('change', (e) => {
                state.matrixDay = e.target.value;
                renderMatrix();
            });
        }
    }

    // Render Full Raw Timetables View
    function renderFullSchedules() {
        const container = document.getElementById('schedules-container');
        if (!container) return;

        container.innerHTML = '';
        pools.forEach(pool => {
            if (state.schedulePool !== 'all' && pool.name !== state.schedulePool) return;

            const poolSchedule = pool.schedule
                .filter(entry => !classifyAvailability(entry.availableLanes).noise)
                .filter(entry => state.scheduleDay === 'all' || entry.day === state.scheduleDay)
                .filter(entry => {
                    if (!state.searchQuery) return true;
                    const q = state.searchQuery.toLowerCase();
                    return entry.day.toLowerCase().includes(q) ||
                           entry.time.toLowerCase().includes(q) ||
                           entry.availableLanes.toLowerCase().includes(q);
                });

            if (poolSchedule.length === 0) return;

            const specs = POOL_SPECS[pool.name] || { length: '25m', address: '' };
            const card = document.createElement('div');
            card.classList.add('pool-schedule-card');
            card.innerHTML = `
                <div class="schedule-card-header">
                    <div>
                        <h2>${escapeHtml(pool.name)}</h2>
                        <span class="pool-address-line">${escapeHtml(specs.address)} • ${escapeHtml(specs.length)}</span>
                    </div>
                    <span class="count-tag">${poolSchedule.length} wpisów</span>
                </div>
                <div class="table-responsive">
                    <table class="schedule-table">
                        <thead>
                            <tr>
                                <th>Dzień</th>
                                <th>Godzina</th>
                                <th>Dostępność</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${poolSchedule.map(e => {
                                const detail = getFreeLanesDetail(pool.name, e.availableLanes);
                                const statusClass = detail ? detail.status : 'low';
                                const badgeText = detail ? detail.label : cleanCell(e.availableLanes);
                                return `
                                    <tr>
                                        <td><strong>${escapeHtml(cleanCell(e.day))}</strong></td>
                                        <td>${escapeHtml(cleanCell(e.time))}</td>
                                        <td>${escapeHtml(cleanCell(e.availableLanes))}</td>
                                        <td><span class="status-pill status-${statusClass}">${escapeHtml(badgeText)}</span></td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            `;
            container.appendChild(card);
        });

        if (container.children.length === 0) {
            container.innerHTML = `<p class="empty-state">Brak wyników wyszukiwania dla "${escapeHtml(state.searchQuery)}".</p>`;
        }
    }

    // Synchronize UI active filter button states
    function syncFilterButtons() {
        // Day pills
        document.querySelectorAll('.filter-day-pill').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.day === state.day);
        });
        // Time pills
        document.querySelectorAll('.filter-time-pill').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.time === state.timeBucket);
        });
        // Pool pills
        document.querySelectorAll('.filter-pool-pill').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.pool === state.pool);
        });
        // Sort buttons
        document.querySelectorAll('.filter-sort-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.sort === state.sortBy);
        });
        // High availability toggle
        const toggle = document.getElementById('toggle-only-high');
        if (toggle) toggle.checked = state.onlyHigh;
    }

    // Set up interactive filter click listeners
    function setupEventListeners() {
        // Tab switching
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const targetView = tab.dataset.tab;
                state.activeTab = targetView;
                document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                document.querySelectorAll('.view-panel').forEach(panel => {
                    panel.classList.toggle('active', panel.id === `view-${targetView}`);
                });

                if (targetView === 'suggester') renderSuggester();
                else if (targetView === 'matrix') renderMatrix();
                else if (targetView === 'schedules') renderFullSchedules();
            });
        });

        // Day filters
        document.querySelectorAll('.filter-day-pill').forEach(btn => {
            btn.addEventListener('click', () => {
                state.day = btn.dataset.day;
                syncFilterButtons();
                renderSuggester();
            });
        });

        // Time filters
        document.querySelectorAll('.filter-time-pill').forEach(btn => {
            btn.addEventListener('click', () => {
                state.timeBucket = btn.dataset.time;
                syncFilterButtons();
                renderSuggester();
            });
        });

        // Pool filters
        document.querySelectorAll('.filter-pool-pill').forEach(btn => {
            btn.addEventListener('click', () => {
                state.pool = btn.dataset.pool;
                syncFilterButtons();
                renderSuggester();
            });
        });

        // Sort buttons
        document.querySelectorAll('.filter-sort-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                state.sortBy = btn.dataset.sort;
                syncFilterButtons();
                renderSuggester();
            });
        });

        // High availability checkbox toggle
        const toggleHigh = document.getElementById('toggle-only-high');
        if (toggleHigh) {
            toggleHigh.addEventListener('change', (e) => {
                state.onlyHigh = e.target.checked;
                renderSuggester();
            });
        }

        // Full schedule search & filters
        const searchInput = document.getElementById('schedule-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                state.searchQuery = e.target.value.trim();
                renderFullSchedules();
            });
        }

        const scheduleDaySelect = document.getElementById('schedule-day-select');
        if (scheduleDaySelect) {
            scheduleDaySelect.addEventListener('change', (e) => {
                state.scheduleDay = e.target.value;
                renderFullSchedules();
            });
        }

        const schedulePoolSelect = document.getElementById('schedule-pool-select');
        if (schedulePoolSelect) {
            schedulePoolSelect.addEventListener('change', (e) => {
                state.schedulePool = e.target.value;
                renderFullSchedules();
            });
        }
    }

    // Set today's name label on the today pill
    const todayPill = document.querySelector('.filter-day-pill[data-day="today"]');
    if (todayPill) {
        todayPill.innerHTML = `Dziś <span class="pill-day-sub">(${todayName})</span>`;
    }

    renderInsights();
    syncFilterButtons();
    setupEventListeners();
    renderSuggester();
}

function showError(message) {
    const errorContainer = document.getElementById('error-banner');
    if (errorContainer) {
        errorContainer.textContent = message;
        errorContainer.style.display = 'block';
    }
}

// Initialise on DOM ready
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
                showError('Nie udało się załadować harmonogramu basenów. Upewnij się, że plik data.json jest dostępny.');
            });
    });
}

// Exposed for Node-based unit tests
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        cleanCell,
        classifyAvailability,
        computeCapacities,
        opennessScore,
        validatePoolData,
        DEFAULT_CAPACITY,
        DAYS_ORDER,
        POOL_SPECS,
        getFreeLanesDetail,
        getTimeBucket,
        getPolishDayName,
        aggregateHourlySlots,
        filterAndRankSlots,
        computeDataInsights
    };
}
