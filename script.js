
const DAYS_ORDER = ["Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota", "Niedziela"];
const DAY_SET = new Set(DAYS_ORDER);

const DEFAULT_CAPACITY = 10;

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

function cleanCell(value) {
    if (typeof value !== 'string') return '';
    return value.replace(/\r/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseRomanOrArabic(val) {
    if (!val) return null;
    const v = val.trim().toLowerCase();
    if (/^\d+$/.test(v)) return parseInt(v, 10);
    const romanMap = {
        'i': 1, 'ii': 2, 'iii': 3, 'iv': 4, 'v': 5,
        'vi': 6, 'vii': 7, 'viii': 8, 'ix': 9, 'x': 10
    };
    return romanMap[v] || null;
}

function classifyAvailability(raw) {
    const s = cleanCell(raw);
    if (!s) return { noise: true };
    const lower = s.toLowerCase();

    if (DAY_SET.has(s)) return { noise: true };
    if (new RegExp(`^\\d{1,2}\\s+(${MONTHS})`, 'i').test(lower)) return { noise: true };
    if (/^\d{1,2}[./]\d{1,2}[./]\d{2,4}$/.test(s)) return { noise: true };
    if (/(ilość wolnych torów|ilość zajętych torów|godzina|dzień|tygodnia|harmonogram|^data$)/.test(lower)) return { noise: true };
    if (!/\d/.test(s) && s.replace(/[^a-zA-Ząćęłńóśźż]/gi, '').length < 5 && !/wolne/.test(lower)) {
        return { noise: true };
    }

    if (
        lower === '0' ||
        lower.includes('niedostępn') ||
        lower.includes('nieczynn') ||
        lower.includes('czas wyjścia') ||
        lower.includes('koniec pracy') ||
        lower.includes('czynna od') ||
        lower.includes('0 wolnych') ||
        lower.includes('brak wolnych') ||
        lower.startsWith('0 tor')
    ) {
        return { score: 0 };
    }

    if (lower.includes('wolne wszystkie')) return { open: true };

    let m = lower.match(/dostępna.*zaj[ęe]t[a-ząćęłńóśźż]*\s*(?:jest\s*)?([ivx]+|\d+)\s*tor/i);
    if (m) {
        const num = parseRomanOrArabic(m[1]);
        if (num !== null) return { open: true, occupied: num };
    }

    m = lower.match(/(?:^|\b)([ivx]+|\d+)\s*tor[a-ząćęłńóśźż]*\s*zaj[ęe]t/i);
    if (m) {
        const num = parseRomanOrArabic(m[1]);
        if (num !== null) return { occupied: num };
    }

    m = lower.match(/^zaj[ęe]t[a-ząćęłńóśźż]*\s*(?:jest\s*)?([ivx]+|\d+)\s*tor/i);
    if (m) {
        const num = parseRomanOrArabic(m[1]);
        if (num !== null) return { occupied: num };
    }

    const laneMatches = [...lower.matchAll(/(\d+)\s*x\s*\d+\s*m/g)];
    if (laneMatches.length) {
        const lanes = laneMatches.reduce((sum, mm) => sum + parseInt(mm[1], 10), 0);
        return { freeLanes: lanes };
    }

    const mFreeTor = lower.match(/([ivx]+|\d+)\s*tor[a-ząćęłńóśźż]*\s*woln/i);
    if (mFreeTor) {
        const num = parseRomanOrArabic(mFreeTor[1]);
        if (num !== null) return { freeLanes: num };
    }

    if (lower.includes('dostępna')) return { open: true };

    return { noise: true };
}

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


function getFreeLanesDetail(poolName, raw, metadata = {}) {
    const info = classifyAvailability(raw);
    const specs = POOL_SPECS[poolName] || { totalLanes: 10, length: "25m" };
    const split = poolName === 'Olimpijczyk' && info.freeLanes > 10 && !/x\s*50\s*m/i.test(raw);
    const total = Number.isInteger(metadata.totalLanes) && metadata.totalLanes > 0
        ? metadata.totalLanes : (split ? 20 : specs.totalLanes);
    const laneLength = metadata.laneLength || (split ? '25m' : specs.length);

    if (!info || info.noise) return null;

    if (info.score === 0) {
        return {
            freeLanes: 0,
            laneLength,
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
        laneLength,
        totalLanes: total,
        openness,
        label,
        status,
        raw: cleanCell(raw)
    };
}

function getTimeBucket(hour) {
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    return 'evening';
}

function parseScheduleDate(value) {
    const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(value || '');
    if (!m) return null;
    const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
    if (d.getUTCFullYear() !== +m[3] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[1]) return null;
    return d.toISOString().slice(0, 10);
}

function polishDate(iso) {
    return iso.split('-').reverse().join('.');
}

function getPoolClock(now = new Date()) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(now).map(p => [p.type, p.value]));
    const iso = `${parts.year}-${parts.month}-${parts.day}`;
    const date = new Date(`${iso}T00:00:00Z`);
    const day = DAYS_ORDER[(date.getUTCDay() + 6) % 7];
    date.setUTCDate(date.getUTCDate() + 1);
    return { iso, date: polishDate(iso), tomorrow: polishDate(date.toISOString().slice(0, 10)),
        day, hour: +parts.hour, minute: +parts.minute, minutes: +parts.hour * 60 + +parts.minute };
}

function getPolishDayName(date) {
    return getPoolClock(date).day;
}

function getScheduleDates(pools, fallbackDate = new Date()) {
    const maps = pools.map(p => p.dates).filter(d => d && Object.keys(d).length);
    let fullDates;
    if (maps.length && maps.every(d => JSON.stringify(d) === JSON.stringify(maps[0]))) {
        fullDates = maps[0];
    } else {
        const monday = new Date(`${getPoolClock(fallbackDate).iso}T00:00:00Z`);
        monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
        fullDates = Object.fromEntries(DAYS_ORDER.map((day, i) => {
            const date = new Date(monday);
            date.setUTCDate(date.getUTCDate() + i);
            return [day, polishDate(date.toISOString().slice(0, 10))];
        }));
    }
    const shortDates = Object.fromEntries(Object.entries(fullDates).map(([d, v]) => [d, v.replace(/\.\d{4}$/, '')]));
    const values = Object.values(fullDates).filter(parseScheduleDate).sort((a, b) => parseScheduleDate(a).localeCompare(parseScheduleDate(b)));
    return { fullDates, shortDates, weekRange: values.length ? `${values[0]} – ${values.at(-1)}` : '' };
}

function parseTimeInterval(value) {
    const m = /^\s*(\d{1,2})[:.](\d{2})(?:\s*[-–—]\s*(\d{1,2})[:.](\d{2}))?\s*$/.exec(value || '');
    if (!m || +m[1] > 23 || +m[2] > 59 || (m[3] && (+m[3] > 24 || +m[4] > 59 || (+m[3] === 24 && +m[4] !== 0)))) return null;
    const start = +m[1] * 60 + +m[2];
    const end = m[3] ? +m[3] * 60 + +m[4] : start + 15;
    return end > start && end <= 1440 ? { start, end } : null;
}

function entryDate(pool, entry) {
    return entry.date || pool.dates?.[entry.day] || '';
}

function aggregateHourlySlots(pools) {
    const groups = new Map();
    pools.forEach(pool => (pool.schedule || []).forEach(entry => {
        const interval = parseTimeInterval(entry.time);
        if (!interval) return;
        const detail = getFreeLanesDetail(pool.name, entry.availableLanes, entry);
        const date = entryDate(pool, entry);
        for (let minute = interval.start; minute < interval.end; minute++) {
            const hour = Math.floor(minute / 60);
            const key = JSON.stringify([pool.name, date, entry.day, hour]);
            if (!groups.has(key)) groups.set(key, { poolName: pool.name, date, day: entry.day, hour,
                minutes: Array.from({ length: 60 }, () => []), raws: new Set() });
            const group = groups.get(key);
            group.minutes[minute % 60].push(detail);
            group.raws.add(cleanCell(entry.availableLanes));
        }
    }));
    return [...groups.values()].map(group => {
        const complete = group.minutes.every(items => items.length && items.every(Boolean));
        const details = group.minutes.flat().filter(Boolean);
        const total = Math.max(...details.map(d => d.totalLanes), POOL_SPECS[group.poolName]?.totalLanes || 0);
        const counts = group.minutes.map(items => items.length && items.every(Boolean) ? Math.min(...items.map(d => d.freeLanes)) : 0);
        const free = Math.min(...counts);
        const average = Math.round(counts.reduce((a, b) => a + b, 0) / 60 * 10) / 10;
        const openness = total ? free / total : 0;
        const status = !complete ? 'unknown' : free === 0 ? 'closed' : openness >= 0.8 ? 'high' : openness >= 0.4 ? 'medium' : 'low';
        return { poolName: group.poolName, day: group.day, date: group.date,
            shortDate: group.date.replace(/\.\d{4}$/, ''), hour: group.hour, endHour: group.hour + 1,
            timeLabel: `${String(group.hour).padStart(2, '0')}:00 – ${String(group.hour + 1).padStart(2, '0')}:00`,
            timeBucket: getTimeBucket(group.hour), freeLanes: free, minFreeLanes: free, averageFreeLanes: average,
            totalLanes: total, openness, status, complete,
            laneLength: [...new Set(details.map(d => d.laneLength))].join(' / '),
            laneBadge: !complete ? 'Brak pełnych danych' : free === 0 ? 'Brak ciągłej dostępności' : `min. ${free} z ${total} torów (${Math.round(openness * 100)}%)`,
            details: [...group.raws].filter(Boolean).join('; ') };
    });
}

function getMultiHourSlots(hourlySlots, duration = 1) {
    if (duration <= 1) return hourlySlots;
    const groups = new Map();
    hourlySlots.forEach(slot => {
        const key = JSON.stringify([slot.poolName, slot.date, slot.day]);
        if (!groups.has(key)) groups.set(key, new Map());
        groups.get(key).set(slot.hour, slot);
    });
    const result = [];
    for (const hours of groups.values()) {
        for (const start of hours.values()) {
            const block = Array.from({ length: duration }, (_, i) => hours.get(start.hour + i));
            if (block.some(s => !s)) continue;
            const complete = block.every(s => s.complete !== false);
            const free = complete ? Math.min(...block.map(s => s.minFreeLanes ?? s.freeLanes)) : 0;
            const total = Math.max(...block.map(s => s.totalLanes));
            const openness = free / total;
            const average = Math.round(block.reduce((sum, s) => sum + (s.averageFreeLanes ?? s.freeLanes), 0) / duration * 10) / 10;
            result.push({ ...start, duration, endHour: start.hour + duration, complete,
                timeLabel: `${String(start.hour).padStart(2, '0')}:00 – ${String(start.hour + duration).padStart(2, '0')}:00 (${duration}h)`,
                freeLanes: free, minFreeLanes: free, averageFreeLanes: average, totalLanes: total, openness,
                laneLength: [...new Set(block.map(s => s.laneLength).filter(Boolean))].join(' / '),
                status: !complete ? 'unknown' : free === 0 ? 'closed' : openness >= 0.8 ? 'high' : openness >= 0.4 ? 'medium' : 'low',
                laneBadge: free > 0 ? `min. ${free} z ${total} torów przez ${duration}h` : 'Brak ciągłej dostępności',
                details: block.map(s => `${String(s.hour).padStart(2, '0')}:00 (min. ${s.minFreeLanes ?? s.freeLanes} torów)`).join(' ➔ '), subSlots: block });
        }
    }
    return result;
}

function filterAndRankSlots(hourlySlots, options = {}) {
    const { day = 'all', timeBucket = 'all', pool = 'all', minLanes = 0, minOpenness = 0,
        sortBy = 'lanes', duration = 1, minHour = null, date = null, now = new Date() } = options;
    const clock = getPoolClock(now);
    const filtered = getMultiHourSlots(hourlySlots, duration).filter(s => {
        const iso = parseScheduleDate(s.date);
        if (!iso || iso < clock.iso || s.complete === false || s.openness <= 0 || (s.minFreeLanes ?? s.freeLanes) <= 0) return false;
        const weekday = DAYS_ORDER[(new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7];
        if (weekday !== s.day || (date && iso !== parseScheduleDate(date))) return false;
        if (iso === clock.iso && (s.hour * 60 < clock.minutes || (minHour !== null && s.hour < minHour))) return false;
        if (day === 'today' && iso !== clock.iso) return false;
        if (day === 'tomorrow' && iso !== parseScheduleDate(clock.tomorrow)) return false;
        if (day === 'weekend' && !['Sobota', 'Niedziela'].includes(s.day)) return false;
        if (day === 'workdays' && ['Sobota', 'Niedziela'].includes(s.day)) return false;
        if (!['all', 'today', 'tomorrow', 'weekend', 'workdays'].includes(day) && s.day !== day) return false;
        return (timeBucket === 'all' || s.timeBucket === timeBucket) && (pool === 'all' || s.poolName === pool)
            && (s.minFreeLanes ?? s.freeLanes) >= minLanes && s.openness >= minOpenness;
    });
    filtered.sort((a, b) => {
        if (sortBy === 'lanes' && a.freeLanes !== b.freeLanes) return b.freeLanes - a.freeLanes;
        if (sortBy !== 'time' && a.openness !== b.openness) return b.openness - a.openness;
        if (sortBy === 'openness' && a.freeLanes !== b.freeLanes) return b.freeLanes - a.freeLanes;
        return parseScheduleDate(a.date).localeCompare(parseScheduleDate(b.date)) || a.hour - b.hour;
    });
    return filtered;
}

function getLiveSummary(pools, hourlySlots, now = new Date()) {
    const clock = getPoolClock(now);
    const statuses = pools.map(pool => {
        const entries = pool.schedule.filter(entry => {
            const interval = parseTimeInterval(entry.time);
            return parseScheduleDate(entryDate(pool, entry)) === clock.iso && interval && interval.start <= clock.minutes && clock.minutes < interval.end;
        });
        const details = entries.map(entry => getFreeLanesDetail(pool.name, entry.availableLanes, entry));
        if (!details.length || details.some(d => !d)) return { poolName: pool.name, status: 'unknown' };
        const freeLanes = Math.min(...details.map(d => d.freeLanes));
        return { poolName: pool.name, freeLanes, totalLanes: Math.max(...details.map(d => d.totalLanes)),
            status: freeLanes > 0 ? 'high' : 'closed' };
    });
    const upcoming = filterAndRankSlots(hourlySlots, { now, sortBy: 'time' });
    return { clock, statuses, nextSlot: upcoming[0] || null };
}

function computeDataInsights(hourlySlots) {
    const openSlots = hourlySlots.filter(s => s.openness > 0);

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

    const peakSlot = [...openSlots].sort((a, b) => b.freeLanes - a.freeLanes || b.openness - a.openness)[0];

    const bestDayDate = openSlots.find(s => s.day === bestDay)?.date;
    const bestDayLabel = bestDayDate ? `${bestDay} (${bestDayDate})` : bestDay;

    return {
        bestDay,
        bestDayLabel,
        bestDayPercentage: Math.round(maxDayAvg * 100),
        bestBucket: bucketLabels[bestBucketKey],
        bestBucketPercentage: Math.round(maxBucketAvg * 100),
        peakSlot: peakSlot ? `${peakSlot.poolName} (${peakSlot.day}${peakSlot.date ? ' ' + peakSlot.date : ''} ${peakSlot.timeLabel}, ${peakSlot.freeLanes} wolnych torów)` : null,
        totalOpenSlots: openSlots.length
    };
}

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
        pools.push({
            name: pool.name,
            weekRange: pool.weekRange,
            dates: pool.dates,
            sourcePdf: pool.sourcePdf,
            lastUpdated: pool.lastUpdated,
            lastUpdatedPl: pool.lastUpdatedPl,
            schedule
        });
    });
    return { pools, warnings, lastUpdated: pools[0]?.lastUpdated, lastUpdatedPl: pools[0]?.lastUpdatedPl };
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}


function getSlotCalendarDates(slot) {
    const iso = parseScheduleDate(slot.date);
    if (!iso) throw new Error('Cannot export a slot without a confirmed date');
    const [year, month, day] = iso.split('-').map(Number);
    const startHour = slot.hour;
    const dur = slot.duration || 1;
    const endHour = slot.endHour || (startHour + dur);

    const pad = (n) => String(n).padStart(2, '0');
    const startIso = `${year}${pad(month)}${pad(day)}T${pad(startHour)}0000`;
    const endIso = `${year}${pad(month)}${pad(day)}T${pad(endHour)}0000`;

    return { startIso, endIso, year, month, day, startHour, endHour };
}

function buildGoogleCalendarUrl(slot) {
    const { startIso, endIso } = getSlotCalendarDates(slot);
    const specs = POOL_SPECS[slot.poolName] || { address: 'Gliwice' };
    const dur = slot.duration || 1;
    const minLanes = typeof slot.minFreeLanes === 'number' ? slot.minFreeLanes : slot.freeLanes;
    const title = `Pływanie — Kryta Pływalnia ${slot.poolName} (${minLanes} wolnych torów)`;
    const details = `Sesja pływania (${dur}h na basenie ${slot.poolName}).\nWolne tory: ${minLanes}/${slot.totalLanes} (śr. ${slot.averageFreeLanes ?? slot.freeLanes}).\nPrzebieg: ${slot.details || slot.timeLabel}\nAdres: ${specs.address}, Gliwice\nWygenerowano przez: https://110kc3.github.io/pool-gliwice-automation/`;
    const location = `${specs.address}, Gliwice`;

    const params = new URLSearchParams({
        action: 'TEMPLATE',
        text: title,
        dates: `${startIso}/${endIso}`,
        details: details,
        location: location,
        ctz: 'Europe/Warsaw'
    });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function generateIcsFile(slot) {
    const { startIso, endIso } = getSlotCalendarDates(slot);
    const specs = POOL_SPECS[slot.poolName] || { address: 'Gliwice' };
    const dur = slot.duration || 1;
    const minLanes = typeof slot.minFreeLanes === 'number' ? slot.minFreeLanes : slot.freeLanes;
    const title = `Pływanie — Kryta Pływalnia ${slot.poolName} (${minLanes} wolnych torów)`;
    const description = `Sesja pływania (${dur}h na basenie ${slot.poolName}). Wolne tory: ${minLanes}/${slot.totalLanes}. ${slot.details || ''} Adres: ${specs.address}, Gliwice`;
    const location = `${specs.address}, Gliwice`;
    const uid = `swim-${slot.poolName.toLowerCase()}-${startIso}-${Math.random().toString(36).slice(2, 8)}@gliwice-pools`;
    const nowIso = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    return [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Gliwice Pool Automation//PL',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${nowIso}`,
        `DTSTART;TZID=Europe/Warsaw:${startIso}`,
        `DTEND;TZID=Europe/Warsaw:${endIso}`,
        `SUMMARY:${title.replace(/[,\n]/g, ' ')}`,
        `DESCRIPTION:${description.replace(/\n/g, '\\n')}`,
        `LOCATION:${location.replace(/,/g, '\\,')}`,
        'STATUS:CONFIRMED',
        'BEGIN:VALARM',
        'TRIGGER:-PT1H',
        'ACTION:DISPLAY',
        'DESCRIPTION:Przypomnienie o wyjściu na basen',
        'END:VALARM',
        'END:VEVENT',
        'END:VCALENDAR'
    ].join('\r\n');
}

function triggerIcsDownload(slot) {
    const icsText = generateIcsFile(slot);
    const blob = new Blob([icsText], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeDate = (slot.date || slot.day).replace(/[^a-zA-Z0-9]/g, '_');
    a.download = `plywanie_${slot.poolName.toLowerCase()}_${safeDate}_${slot.hour}h.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}


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
    const weekDates = getScheduleDates([], new Date());
    const hourlySlots = aggregateHourlySlots(pools);
    const todayName = getPoolClock().day;

    const state = {
        activeTab: 'suggester', // 'suggester' | 'matrix' | 'schedules' | 'info'
        preset: 'now',  // 'now' | 'today_evening' | 'tomorrow_morning' | 'weekend' | 'all' | null
        day: 'today',        // specific day or 'all' | 'weekend' | 'workdays'
        minHour: null,// minimum hour filter for today
        timeBucket: 'all', // 'all' | 'morning' | 'afternoon' | 'evening'
        pool: 'all',            // 'all' | poolName
        duration: 1,            // 1 | 2 | 3 (hours to swim)
        matrixDuration: 1,      // 1 | 2 | 3 (hours for matrix comparison)
        sortBy: 'lanes',        // 'lanes' | 'openness' | 'time'
        onlyHigh: false,        // minOpenness >= 0.8
        matrixDay: todayName,   // day selected in matrix view
        searchQuery: '',        // text filter in full schedule
        scheduleDay: 'all',
        schedulePool: 'all'
    };

    function renderLiveNow() {
        const container = document.getElementById('live-now-container');
        if (!container) return;
        const { clock, statuses, nextSlot } = getLiveSummary(pools, hourlySlots);
        const anyOpen = statuses.some(s => s.freeLanes > 0);
        const cards = statuses.map(status => {
            const specs = POOL_SPECS[status.poolName] || {};
            const label = status.status === 'unknown' ? 'Brak aktualnych danych'
                : status.freeLanes > 0 ? `${status.freeLanes} z ${status.totalLanes} torów wolnych` : 'Brak wolnych torów';
            return `<div class="radar-card status-${status.status}">
                <div class="radar-card-header"><div><h4 class="radar-pool-title">${escapeHtml(status.poolName)}</h4>
                <span class="radar-pool-meta">${escapeHtml(specs.type || '')}</span></div></div>
                <div class="radar-current-hour"><span class="radar-hour-val">${escapeHtml(label)}</span></div>
                <button type="button" class="btn-radar-pool" data-pool="${escapeHtml(status.poolName)}">Pokaż terminy ➔</button>
            </div>`;
        }).join('');
        container.innerHTML = `<div class="live-hero-card">
            <div class="live-hero-top"><div class="live-title-group">
                <span class="live-pulse-badge"><span class="pulse-dot"></span> TERAZ W HARMONOGRAMIE</span>
                <h2>${anyOpen ? 'Wolne tory w tej chwili' : 'Brak potwierdzonych wolnych torów w tej chwili'}</h2>
            </div><div class="live-clock-badge">${escapeHtml(clock.day)} ${clock.date}, ${String(clock.hour).padStart(2, '0')}:${String(clock.minute).padStart(2, '0')} (Gliwice)</div></div>
            ${nextSlot ? `<div class="immediate-pick-banner"><div class="immediate-pick-content">
                <span class="immediate-pick-tag">Najbliższy potwierdzony termin na pełną godzinę:</span>
                <h3 class="immediate-pick-name">${escapeHtml(nextSlot.poolName)} • ${escapeHtml(nextSlot.date)} • ${escapeHtml(nextSlot.timeLabel)}</h3>
                <p class="immediate-pick-sub">Co najmniej <strong>${nextSlot.freeLanes} wolnych torów</strong> przez całą godzinę.</p>
                </div><div class="immediate-pick-btns"><a href="${buildGoogleCalendarUrl(nextSlot)}" target="_blank" rel="noopener noreferrer" class="btn-hero-action gcal">📅 Dodaj do kalendarza</a></div></div>`
                : '<p>Brak potwierdzonych nadchodzących terminów. Sprawdź daty harmonogramów poniżej.</p>'}
            <div class="radar-grid">${cards}</div></div>`;
        container.querySelectorAll('.btn-radar-pool').forEach(btn => {
            btn.addEventListener('click', () => {
                state.pool = btn.dataset.pool;
                state.day = 'all';
                state.preset = null;
                syncFilterButtons();
                renderSuggester();
            });
        });
    }

    function renderFreshness() {
        const banner = document.getElementById('data-freshness-banner');
        if (!banner) return;
        const clock = getPoolClock();
        banner.textContent = pools.map(pool => {
            const dates = Object.values(pool.dates || {}).map(parseScheduleDate).filter(Boolean).sort();
            const status = !dates.length ? 'brak potwierdzonych dat'
                : dates.at(-1) < clock.iso ? 'nieaktualny' : dates[0] > clock.iso ? 'na przyszły termin' : 'aktualny';
            return `${pool.name}: ${pool.weekRange || 'brak dat'} (${status})`;
        }).join(' • ');
    }

    function renderInsights() {
        const clock = getPoolClock();
        const insights = computeDataInsights(hourlySlots.filter(s => {
            const date = parseScheduleDate(s.date);
            return s.complete && date && date >= clock.iso && (date !== clock.iso || s.hour * 60 >= clock.minutes);
        }));
        const container = document.getElementById('insights-grid');
        if (!container) return;
        container.innerHTML = `
            <div class="insight-card">
                <div class="insight-icon">🏆</div>
                <div class="insight-content">
                    <span class="insight-title">Najlepszy dzień</span>
                    <strong class="insight-value">${escapeHtml(insights.bestDayLabel || insights.bestDay)}</strong>
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
                    <strong class="insight-value">${escapeHtml(insights.peakSlot || 'Brak potwierdzonych terminów')}</strong>
                    <span class="insight-desc">W nadchodzących potwierdzonych terminach</span>
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

    function renderSuggester() {
        const resultsContainer = document.getElementById('suggester-results');
        const topPickContainer = document.getElementById('top-pick-container');
        const countBadge = document.getElementById('results-count');
        if (!resultsContainer || !topPickContainer) return;

        const options = {
            day: state.day,
            date: DAYS_ORDER.includes(state.day) ? weekDates.fullDates[state.day] : null,
            timeBucket: state.timeBucket,
            pool: state.pool,
            duration: state.duration,
            minHour: state.minHour,
            sortBy: state.sortBy,
            minOpenness: state.onlyHigh ? 0.8 : 0,
            now: new Date()
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
                    <p>Brak wolnych torów dla wybranego filtru${state.minHour ? ' na resztę dzisiejszego dnia' : ''}. Wybierz inną porę, dzień lub zresetuj filtry.</p>
                    <button type="button" class="btn-reset-filters" id="btn-reset-filters">Pokaż cały tydzień</button>
                </div>
            `;
            const resetBtn = document.getElementById('btn-reset-filters');
            if (resetBtn) {
                resetBtn.addEventListener('click', () => {
                    state.day = 'all';
                    state.preset = 'all';
                    state.minHour = null;
                    state.timeBucket = 'all';
                    state.pool = 'all';
                    state.duration = 1;
                    state.onlyHigh = false;
                    syncFilterButtons();
                    renderSuggester();
                });
            }
            return;
        }

        const topPick = rankedSlots[0];
        const topSpecs = POOL_SPECS[topPick.poolName] || { length: '25m', type: 'Basen sportowy', address: '' };
        const percent = Math.round(topPick.openness * 100);
        const durationBadge = topPick.duration > 1 ? ` • ${topPick.duration}h ciągłego pływania` : '';
        const lanesDisplay = (topPick.duration > 1 && topPick.minFreeLanes !== topPick.freeLanes)
            ? `min. ${topPick.minFreeLanes} <span class="lanes-unit">torów (śr. ${topPick.freeLanes})</span>`
            : `${topPick.freeLanes} <span class="lanes-unit">wolnych torów</span>`;

        topPickContainer.innerHTML = `
            <div class="top-pick-card">
                <div class="top-pick-badge">🌟 Rekomendacja #1 • Najwięcej wolnego miejsca${durationBadge}</div>
                <div class="top-pick-header">
                    <div>
                        <h3 class="top-pick-pool">${escapeHtml(topPick.poolName)}</h3>
                        <span class="pool-type-tag">${escapeHtml(topSpecs.type)} • ${escapeHtml(topPick.laneLength || topSpecs.length)}</span>
                        <div class="pool-address-line">${escapeHtml(topSpecs.address)}</div>
                    </div>
                    <div class="top-pick-stats">
                        <div class="top-pick-lanes">${lanesDisplay}</div>
                        <div class="top-pick-percent">${percent}% pojemności</div>
                    </div>
                </div>

                <div class="top-pick-details">
                    <div class="top-pick-when">
                        <span class="when-date">📅 <strong>${escapeHtml(topPick.date || '')}</strong> (${escapeHtml(topPick.day)})</span>
                        <span class="when-time">⏰ ${escapeHtml(topPick.timeLabel)}</span>
                    </div>
                    <div class="lane-progress-bar">
                        <div class="lane-progress-fill high" style="width: ${percent}%;"></div>
                    </div>
                    <div class="top-pick-notes">
                        <strong>Szczegóły:</strong> ${escapeHtml(topPick.details || 'Wszystkie tory dostępne dla klientów indywidualnych')}
                    </div>
                    <div class="calendar-actions">
                        <a href="${buildGoogleCalendarUrl(topPick)}" target="_blank" rel="noopener noreferrer" class="btn-cal-action btn-cal-gcal">
                            <span>📅</span> Dodaj do Kalendarza Google
                        </a>
                        <button type="button" class="btn-cal-action btn-cal-ics" id="btn-top-pick-ics">
                            <span>📥</span> Pobierz .ics (Apple / Outlook)
                        </button>
                    </div>
                </div>
            </div>
        `;

        const topPickIcsBtn = document.getElementById('btn-top-pick-ics');
        if (topPickIcsBtn) {
            topPickIcsBtn.addEventListener('click', () => triggerIcsDownload(topPick));
        }

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
                        <span class="slot-type">${escapeHtml(slot.laneLength || slotSpecs.length)}</span>
                    </div>
                    <div class="slot-when">
                        <div class="slot-date-badge">📅 <strong>${escapeHtml(slot.date || '')}</strong> (${escapeHtml(slot.day)})</div>
                        <span class="slot-time">⏰ ${escapeHtml(slot.timeLabel)}</span>
                    </div>
                    <div class="slot-lanes-badge status-${statusClass}">
                        ${escapeHtml(slot.laneBadge)}
                    </div>
                    <div class="lane-progress-bar small">
                        <div class="lane-progress-fill ${statusClass}" style="width: ${pct}%;"></div>
                    </div>
                    ${slot.details ? `<div class="slot-subnote">⏱️ ${escapeHtml(slot.details)}</div>` : ''}
                    <div class="slot-card-actions">
                        <a href="${buildGoogleCalendarUrl(slot)}" target="_blank" rel="noopener noreferrer" class="slot-btn-cal gcal" title="Dodaj do Kalendarza Google">
                            📅 Google
                        </a>
                        <button type="button" class="slot-btn-cal ics btn-slot-ics" data-index="${index}" title="Pobierz plik .ics dla kalendarza">
                            📥 .ics
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        resultsContainer.querySelectorAll('.btn-slot-ics').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.index, 10);
                if (otherSlots[idx]) {
                    triggerIcsDownload(otherSlots[idx]);
                }
            });
        });
    }

    function renderMatrix() {
        const matrixContainer = document.getElementById('matrix-content');
        if (!matrixContainer) return;

        const day = state.matrixDay;
        const dur = state.matrixDuration || 1;
        const maxStartHour = 22 - dur;
        const hours = [];
        for (let h = 6; h <= maxStartHour; h++) hours.push(h);

        const comparisonSlots = getMultiHourSlots(hourlySlots, dur).filter(s =>
            s.date === weekDates.fullDates[day]);
        const poolNames = ["Olimpijczyk", "Mewa", "Delfin", "Neptun"];

        let rowsHtml = '';
        hours.forEach(h => {
            const timeLabel = dur === 1
                ? `${String(h).padStart(2, '0')}:00 – ${String(h + 1).padStart(2, '0')}:00`
                : `${String(h).padStart(2, '0')}:00 – ${String(h + dur).padStart(2, '0')}:00 (${dur}h)`;

            const cols = poolNames.map(pName => {
                const match = comparisonSlots.find(s => s.poolName === pName && s.day === day && s.hour === h);
                if (!match || match.openness === 0 || match.status === 'closed') {
                    return `<td class="matrix-cell closed"><span class="matrix-badge closed">${!match || match.status === 'unknown' ? 'Brak pełnych danych' : 'Brak ciągłej dostępności'}</span>${dur > 1 && match && match.details ? `<div class="matrix-subnote">${escapeHtml(match.details)}</div>` : ''}</td>`;
                }
                const pct = Math.round(match.openness * 100);
                const laneText = (dur > 1 && typeof match.minFreeLanes === 'number')
                    ? `<strong>min. ${match.minFreeLanes}</strong> torów (śr. ${match.averageFreeLanes ?? match.freeLanes})`
                    : `<strong>${match.freeLanes}</strong> torów wolnych`;

                return `
                    <td class="matrix-cell ${match.status}">
                        <div class="matrix-lanes">${laneText}</div>
                        <div class="matrix-pct">${pct}% (${match.laneBadge})</div>
                        ${dur > 1 && match.details ? `<div class="matrix-subnote">${escapeHtml(match.details)}</div>` : ''}
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
                <div class="matrix-controls-group">
                    <label for="matrix-day-select"><strong>Dzień:</strong></label>
                    <select id="matrix-day-select" class="styled-select">
                        ${DAYS_ORDER.map(d => `<option value="${escapeHtml(d)}" ${d === day ? 'selected' : ''}>${escapeHtml(d)} — ${escapeHtml(weekDates.fullDates[d] || '')}</option>`).join('')}
                    </select>
                </div>
                <div class="matrix-controls-group">
                    <strong>Czas wizyty:</strong>
                    <div class="matrix-duration-pills">
                        <button type="button" class="btn-matrix-duration ${dur === 1 ? 'active' : ''}" data-duration="1">1 godzina</button>
                        <button type="button" class="btn-matrix-duration ${dur === 2 ? 'active' : ''}" data-duration="2">2 godziny</button>
                        <button type="button" class="btn-matrix-duration ${dur === 3 ? 'active' : ''}" data-duration="3">3 godziny</button>
                    </div>
                </div>
                <span class="matrix-current-date-badge">📅 Obowiązuje: <strong>${escapeHtml(weekDates.fullDates[day] || '')}</strong></span>
            </div>
            <div class="table-responsive">
                <table class="comparison-matrix-table">
                    <thead>
                        <tr>
                            <th>Godzina</th>
                            <th>Olimpijczyk <span class="th-sub">25/50m • według konfiguracji</span></th>
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

        document.querySelectorAll('.btn-matrix-duration').forEach(btn => {
            btn.addEventListener('click', () => {
                state.matrixDuration = parseInt(btn.dataset.duration, 10) || 1;
                renderMatrix();
            });
        });
    }

    function renderFullSchedules() {
        const container = document.getElementById('schedules-container');
        if (!container) return;

        const scheduleDaySelect = document.getElementById('schedule-day-select');
        if (scheduleDaySelect && scheduleDaySelect.options.length <= 8) {
            scheduleDaySelect.innerHTML = `
                <option value="all" ${state.scheduleDay === 'all' ? 'selected' : ''}>Wszystkie dni źródłowych harmonogramów</option>
                ${DAYS_ORDER.map(d => `<option value="${escapeHtml(d)}" ${d === state.scheduleDay ? 'selected' : ''}>${escapeHtml(d)}</option>`).join('')}
            `;
        }

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
                        <span class="pool-address-line">${escapeHtml(specs.address)} • ${escapeHtml(specs.length)} • ${escapeHtml(pool.weekRange || 'Daty niepotwierdzone')}</span>
                    </div>
                    <span class="count-tag">${poolSchedule.length} wpisów</span>
                </div>
                <div class="table-responsive">
                    <table class="schedule-table">
                        <thead>
                            <tr>
                                <th>Dzień i Data</th>
                                <th>Godzina</th>
                                <th>Dostępność</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${poolSchedule.map(e => {
                                const detail = getFreeLanesDetail(pool.name, e.availableLanes, e);
                                const statusClass = detail ? detail.status : 'low';
                                const badgeText = detail ? detail.label : cleanCell(e.availableLanes);
                                const dateStr = entryDate(pool, e);
                                return `
                                    <tr>
                                        <td><strong>${escapeHtml(cleanCell(e.day))}</strong>${dateStr ? `<span class="cell-date">(${escapeHtml(dateStr)})</span>` : ''}</td>
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

    function syncFilterButtons() {
        document.querySelectorAll('.preset-pill').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.preset === state.preset);
        });
        document.querySelectorAll('.filter-day-pill').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.day === state.day);
        });
        document.querySelectorAll('.filter-duration-pill').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.duration, 10) === state.duration);
        });
        document.querySelectorAll('.filter-time-pill').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.time === state.timeBucket);
        });
        document.querySelectorAll('.filter-pool-pill').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.pool === state.pool);
        });
        document.querySelectorAll('.filter-sort-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.sort === state.sortBy);
        });
        const toggle = document.getElementById('toggle-only-high');
        if (toggle) toggle.checked = state.onlyHigh;
    }

    function setupEventListeners() {
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

        document.querySelectorAll('.preset-pill').forEach(btn => {
            btn.addEventListener('click', () => {
                const p = btn.dataset.preset;
                state.preset = p;
                if (p === 'now') {
                    state.day = 'today';
                    state.minHour = null;
                    state.timeBucket = 'all';
                } else if (p === 'today_evening') {
                    state.day = 'today';
                    state.minHour = 17;
                    state.timeBucket = 'evening';
                } else if (p === 'tomorrow_morning') {
                    state.day = 'tomorrow';
                    state.minHour = null;
                    state.timeBucket = 'morning';
                } else if (p === 'weekend') {
                    state.day = 'weekend';
                    state.minHour = null;
                    state.timeBucket = 'all';
                } else if (p === 'all') {
                    state.day = 'all';
                    state.minHour = null;
                    state.timeBucket = 'all';
                }
                syncFilterButtons();
                renderSuggester();
            });
        });

        document.querySelectorAll('.filter-day-pill').forEach(btn => {
            btn.addEventListener('click', () => {
                state.day = btn.dataset.day;
                if (state.day !== 'today') {
                    state.minHour = null;
                }
                state.preset = null;
                syncFilterButtons();
                renderSuggester();
            });
        });

        document.querySelectorAll('.filter-duration-pill').forEach(btn => {
            btn.addEventListener('click', () => {
                state.duration = parseInt(btn.dataset.duration, 10) || 1;
                syncFilterButtons();
                renderSuggester();
            });
        });

        document.querySelectorAll('.filter-time-pill').forEach(btn => {
            btn.addEventListener('click', () => {
                state.timeBucket = btn.dataset.time;
                syncFilterButtons();
                renderSuggester();
            });
        });

        document.querySelectorAll('.filter-pool-pill').forEach(btn => {
            btn.addEventListener('click', () => {
                state.pool = btn.dataset.pool;
                syncFilterButtons();
                renderSuggester();
            });
        });

        document.querySelectorAll('.filter-sort-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                state.sortBy = btn.dataset.sort;
                syncFilterButtons();
                renderSuggester();
            });
        });

        const toggleHigh = document.getElementById('toggle-only-high');
        if (toggleHigh) {
            toggleHigh.addEventListener('change', (e) => {
                state.onlyHigh = e.target.checked;
                renderSuggester();
            });
        }

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

    const updateText = document.getElementById('update-badge-text');
    const lastUpdatedPl = pools[0]?.lastUpdatedPl || rawData[0]?.lastUpdatedPl;
    if (updateText) {
        if (lastUpdatedPl) {
            updateText.textContent = `Zaktualizowano: ${lastUpdatedPl}`;
        } else {
            updateText.textContent = `Codzienna aktualizacja nocna`;
        }
    }

    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('PWA ServiceWorker registered with scope:', reg.scope))
            .catch(err => console.warn('PWA ServiceWorker registration failed:', err));
    }

    if (typeof window !== 'undefined') {
        const offlineBanner = document.getElementById('offline-banner');
        if (offlineBanner && typeof navigator !== 'undefined') offlineBanner.style.display = navigator.onLine ? 'none' : 'block';
        window.addEventListener('online', () => {
            const banner = document.getElementById('offline-banner');
            if (banner) banner.style.display = 'none';
        });
        window.addEventListener('offline', () => {
            const banner = document.getElementById('offline-banner');
            if (banner) banner.style.display = 'block';
        });

        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            window.deferredInstallPrompt = e;
            const installBtn = document.getElementById('btn-install-pwa');
            if (installBtn) {
                installBtn.style.display = 'inline-flex';
                installBtn.addEventListener('click', async () => {
                    if (window.deferredInstallPrompt) {
                        window.deferredInstallPrompt.prompt();
                        const choice = await window.deferredInstallPrompt.userChoice;
                        if (choice && choice.outcome === 'accepted') {
                            installBtn.style.display = 'none';
                        }
                        window.deferredInstallPrompt = null;
                    }
                });
            }
        });
    }

    function renderDateLabels() {
        const weekBadge = document.getElementById('schedule-week-badge');
        if (weekBadge) weekBadge.textContent = `📅 Ten tydzień: ${weekDates.weekRange}`;
        const allPill = document.querySelector('.filter-day-pill[data-day="all"]');
        if (allPill && weekDates.shortDates["Poniedziałek"]) {
            allPill.innerHTML = `Wszystkie nadchodzące dni`;
        }
        DAYS_ORDER.forEach(d => {
            const pill = document.querySelector(`.filter-day-pill[data-day="${d}"]`);
            if (pill) {
                const shortDt = weekDates.shortDates[d] || '';
                pill.innerHTML = `<strong>${shortDt}</strong> <span class="pill-day-sub">(${d})</span>`;
            }
        });
        const workdaysPill = document.querySelector('.filter-day-pill[data-day="workdays"]');
        if (workdaysPill && weekDates.shortDates["Poniedziałek"]) {
            workdaysPill.innerHTML = `Dni robocze`;
        }
        const weekendPill = document.querySelector('.filter-day-pill[data-day="weekend"]');
        if (weekendPill && weekDates.shortDates["Sobota"]) {
            weekendPill.innerHTML = `Weekendy`;
        }

    }
    renderDateLabels();

    renderLiveNow();
    renderFreshness();
    const refresh = () => {
        Object.assign(weekDates, getScheduleDates([], new Date()));
        renderDateLabels();
        renderLiveNow();
        renderFreshness();
        renderInsights();
        renderSuggester();
        if (state.activeTab === 'matrix') renderMatrix();
    };
    if (typeof window.setInterval === 'function') window.setInterval(refresh, 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
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
        getPoolClock,
        parseScheduleDate,
        parseTimeInterval,
        getLiveSummary,
        getTimeBucket,
        getPolishDayName,
        getScheduleDates,
        aggregateHourlySlots,
        getMultiHourSlots,
        filterAndRankSlots,
        computeDataInsights,
        getSlotCalendarDates,
        buildGoogleCalendarUrl,
        generateIcsFile
    };
}
