// Unit tests for the frontend availability logic in script.js.
// Run with:  node tests/test_availability.mjs
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const {
    cleanCell,
    classifyAvailability,
    computeCapacities,
    opennessScore,
    validatePoolData,
    DEFAULT_CAPACITY,
    POOL_SPECS,
    getFreeLanesDetail,
    getTimeBucket,
    getPolishDayName,
    getScheduleDates,
    aggregateHourlySlots,
    getMultiHourSlots,
    filterAndRankSlots,
    computeDataInsights
} = require(path.join(root, 'script.js'));

let passed = 0;
function test(name, fn) {
    fn();
    passed++;
    console.log(`  ok - ${name}`);
}

// --- cleanCell -------------------------------------------------------------
test('cleanCell strips carriage returns and collapses whitespace', () => {
    assert.equal(cleanCell('Pływalnia dostępna-zajęte 2\rtory'), 'Pływalnia dostępna-zajęte 2 tory');
    assert.equal(cleanCell(null), '');
});

// --- classifyAvailability: closed / unavailable ----------------------------
test('niedostępna, nieczynne, exit water and 0 classify as closed (score 0)', () => {
    assert.deepEqual(classifyAvailability('Pływalnia niedostępna'), { score: 0 });
    assert.deepEqual(classifyAvailability('niedostępna'), { score: 0 });
    assert.deepEqual(classifyAvailability('Pływalnia nieczynna'), { score: 0 });
    assert.deepEqual(classifyAvailability('Nieczynne'), { score: 0 });
    assert.deepEqual(classifyAvailability('Nieczynne/ nauka pływania'), { score: 0 });
    assert.deepEqual(classifyAvailability('Czas wyjścia z wody'), { score: 0 });
    assert.deepEqual(classifyAvailability('Czas wyjścia z wody i sauny'), { score: 0 });
    assert.deepEqual(classifyAvailability('Koniec pracy pływalni'), { score: 0 });
    assert.deepEqual(classifyAvailability('Pływalnia czynna od 7.00'), { score: 0 });
    assert.deepEqual(classifyAvailability('0'), { score: 0 });
    assert.deepEqual(classifyAvailability('0 wolnych torów'), { score: 0 });
});

// --- classifyAvailability: open -------------------------------------------
test('dostępna and "wolne wszystkie tory" classify as open', () => {
    assert.deepEqual(classifyAvailability('Pływalnia dostępna'), { open: true });
    assert.deepEqual(classifyAvailability('dostępna'), { open: true });
    assert.deepEqual(classifyAvailability('wolne wszystkie tory'), { open: true });
});

// --- classifyAvailability: open but occupied ------------------------------
test('"dostępna-zajęty N tor" captures occupancy', () => {
    assert.deepEqual(classifyAvailability('Pływalnia dostępna-zajęty 1 tor'), { open: true, occupied: 1 });
    assert.deepEqual(classifyAvailability('Pływalnia dostępna-zajęte 2\rtory'), { open: true, occupied: 2 });
});

// --- classifyAvailability: occupied (Arabic and Roman numerals) -----------
test('"Zajęty/Zajęte N tory" and Roman numerals capture occupancy', () => {
    assert.deepEqual(classifyAvailability('Zajęty 3 tory'), { occupied: 3 });
    assert.deepEqual(classifyAvailability('Zajęte 2 tory'), { occupied: 2 });
    assert.deepEqual(classifyAvailability('I tor zajęty'), { occupied: 1 });
    assert.deepEqual(classifyAvailability('I Tor zajęty'), { occupied: 1 });
    assert.deepEqual(classifyAvailability('II Tory zajęte'), { occupied: 2 });
    assert.deepEqual(classifyAvailability('II   tory zajęte'), { occupied: 2 });
    assert.deepEqual(classifyAvailability('III Tory zajęte'), { occupied: 3 });
});

// --- classifyAvailability: lane counts ------------------------------------
test('lane-count strings sum the Nx..m groups', () => {
    assert.deepEqual(classifyAvailability('9x50m, 1x25m i wypł'), { freeLanes: 10 });
    assert.deepEqual(classifyAvailability('4x50m'), { freeLanes: 4 });
    assert.deepEqual(classifyAvailability('8x50m i wypł'), { freeLanes: 8 });
});

// --- classifyAvailability: noise ------------------------------------------
test('headers, dates, day names and stray letters classify as noise', () => {
    for (const junk of ['n', 'a', 'l', 'e', 'i', 'Środa', 'Wtorek', 'Ilość wolnych torów',
                         'Ilość zajętych torów', '26.10.2026', '5 kwietnia', '30 marca', 'P\rł\ry\rw', '']) {
        assert.equal(classifyAvailability(junk).noise, true, `expected noise for "${junk}"`);
    }
});

// --- opennessScore + capacity ---------------------------------------------
test('opennessScore normalises to [0,1] on a shared scale', () => {
    const pools = [
        { name: 'Olimpijczyk', schedule: [{ day: 'Poniedziałek', time: '7', availableLanes: '9x50m, 1x25m i wypł' }] },
        { name: 'Mewa', schedule: [{ day: 'Poniedziałek', time: '7', availableLanes: 'Pływalnia dostępna' }] }
    ];
    const caps = computeCapacities(pools);
    assert.equal(caps.Olimpijczyk, 10);
    assert.equal(caps.Mewa, DEFAULT_CAPACITY); // floor applied for status-only pool

    assert.equal(opennessScore(classifyAvailability('Pływalnia dostępna'), caps.Mewa), 1);
    assert.equal(opennessScore(classifyAvailability('Pływalnia niedostępna'), caps.Mewa), 0);
    assert.equal(opennessScore(classifyAvailability('5x50m, 1x25m i wypł'), caps.Olimpijczyk), 0.6);
    assert.equal(opennessScore(classifyAvailability('Zajęty 3 tory'), caps.Olimpijczyk), 0.7);
    assert.equal(opennessScore(classifyAvailability('Pływalnia dostępna-zajęty 1 tor'), caps.Mewa), 0.9);
    assert.equal(opennessScore(classifyAvailability('n'), caps.Mewa), null);
});

// --- validatePoolData ------------------------------------------------------
test('validatePoolData rejects non-arrays', () => {
    const { pools, warnings } = validatePoolData({ not: 'an array' });
    assert.equal(pools, null);
    assert.equal(warnings.length, 1);
});

test('validatePoolData drops malformed records and entries', () => {
    const { pools, warnings } = validatePoolData([
        { name: 'Mewa', schedule: [
            { day: 'Poniedziałek', time: '7', availableLanes: '4x50m' },
            { day: 'Wtorek', time: 7, availableLanes: '4x50m' }, // bad time type
            null
        ]},
        { name: 123, schedule: [] }, // bad name
        'garbage'
    ]);
    assert.equal(pools.length, 1);
    assert.equal(pools[0].schedule.length, 1);
    assert.ok(warnings.length >= 3);
});

// --- getFreeLanesDetail ----------------------------------------------------
test('getFreeLanesDetail returns correct lane counts and labels', () => {
    // Olimpijczyk 10 lanes
    const oli10 = getFreeLanesDetail('Olimpijczyk', '9x50m, 1x25m i wypł');
    assert.equal(oli10.freeLanes, 10);
    assert.equal(oli10.totalLanes, 10);
    assert.equal(oli10.openness, 1.0);
    assert.equal(oli10.status, 'high');

    const oli4 = getFreeLanesDetail('Olimpijczyk', '4x50m');
    assert.equal(oli4.freeLanes, 4);
    assert.equal(oli4.totalLanes, 10);
    assert.equal(oli4.openness, 0.4);
    assert.equal(oli4.status, 'medium');

    // Mewa 6 lanes
    const mewaOpen = getFreeLanesDetail('Mewa', 'wolne wszystkie tory');
    assert.equal(mewaOpen.freeLanes, 6);
    assert.equal(mewaOpen.totalLanes, 6);
    assert.equal(mewaOpen.openness, 1.0);

    const mewaOcc2 = getFreeLanesDetail('Mewa', 'Zajęte 2 tory');
    assert.equal(mewaOcc2.freeLanes, 4);
    assert.equal(mewaOcc2.totalLanes, 6);
    assert.equal(mewaOcc2.openness, 4 / 6);

    // Delfin 6 lanes
    const delfinOcc1 = getFreeLanesDetail('Delfin', 'Pływalnia dostępna-zajęty 1 tor');
    assert.equal(delfinOcc1.freeLanes, 5);
    assert.equal(delfinOcc1.totalLanes, 6);
    assert.equal(delfinOcc1.openness, 5 / 6);

    const closed = getFreeLanesDetail('Delfin', 'Pływalnia niedostępna');
    assert.equal(closed.freeLanes, 0);
    assert.equal(closed.openness, 0);
    assert.equal(closed.status, 'closed');

    // Neptun 6 lanes
    const neptun5 = getFreeLanesDetail('Neptun', '5x25m wolne (rekreacyjny: wolny)');
    assert.equal(neptun5.freeLanes, 5);
    assert.equal(neptun5.totalLanes, 6);
    assert.equal(neptun5.openness, 5 / 6);
    assert.equal(neptun5.status, 'high');

    const neptun0 = getFreeLanesDetail('Neptun', '0 wolnych torów (rekreacyjny: zajęty)');
    assert.equal(neptun0.freeLanes, 0);
    assert.equal(neptun0.openness, 0);
    assert.equal(neptun0.status, 'closed');
});

test('POOL_SPECS includes all 4 municipal pools', () => {
    assert.ok(POOL_SPECS.Olimpijczyk);
    assert.ok(POOL_SPECS.Mewa);
    assert.ok(POOL_SPECS.Delfin);
    assert.ok(POOL_SPECS.Neptun);
    assert.equal(POOL_SPECS.Neptun.totalLanes, 6);
    assert.equal(POOL_SPECS.Neptun.length, '25m');
});

// --- getTimeBucket & getPolishDayName --------------------------------------
test('getTimeBucket partitions hours into morning, afternoon, evening', () => {
    assert.equal(getTimeBucket(6), 'morning');
    assert.equal(getTimeBucket(11), 'morning');
    assert.equal(getTimeBucket(12), 'afternoon');
    assert.equal(getTimeBucket(16), 'afternoon');
    assert.equal(getTimeBucket(17), 'evening');
    assert.equal(getTimeBucket(21), 'evening');
});

test('getPolishDayName maps Date to Polish day names', () => {
    // 2026-10-27 is Tuesday (Wtorek)
    const tuesday = new Date('2026-10-27T12:00:00Z');
    assert.equal(getPolishDayName(tuesday), 'Wtorek');
});

// --- aggregateHourlySlots & filterAndRankSlots -----------------------------
test('aggregateHourlySlots groups and computes averages correctly', () => {
    const mockPools = [
        {
            name: 'Olimpijczyk',
            schedule: [
                { day: 'Poniedziałek', time: '06:00', availableLanes: '9x50m, 1x25m i wypł' },
                { day: 'Poniedziałek', time: '06:15', availableLanes: '9x50m, 1x25m i wypł' },
                { day: 'Poniedziałek', time: '06:30', availableLanes: '9x50m, 1x25m i wypł' },
                { day: 'Poniedziałek', time: '06:45', availableLanes: '9x50m, 1x25m i wypł' }
            ]
        },
        {
            name: 'Mewa',
            schedule: [
                { day: 'Poniedziałek', time: '7.00- 8.00', availableLanes: 'Pływalnia dostępna' },
                { day: 'Niedziela', time: '12.00- 13.00', availableLanes: 'wolne wszystkie tory' }
            ]
        }
    ];

    const slots = aggregateHourlySlots(mockPools);
    assert.equal(slots.length, 3);

    const oli6 = slots.find(s => s.poolName === 'Olimpijczyk' && s.hour === 6);
    assert.ok(oli6);
    assert.equal(oli6.freeLanes, 10);
    assert.equal(oli6.openness, 1.0);
    assert.equal(oli6.timeBucket, 'morning');

    // Test filterAndRankSlots by lanes
    const rankedByLanes = filterAndRankSlots(slots, { sortBy: 'lanes' });
    assert.equal(rankedByLanes[0].poolName, 'Olimpijczyk');
    assert.equal(rankedByLanes[0].freeLanes, 10);

    // Test filter by day
    const sundayOnly = filterAndRankSlots(slots, { day: 'Niedziela' });
    assert.equal(sundayOnly.length, 1);
    assert.equal(sundayOnly[0].day, 'Niedziela');

    // Test filter by weekend
    const weekendOnly = filterAndRankSlots(slots, { day: 'weekend' });
    assert.equal(weekendOnly.length, 1);
    assert.equal(weekendOnly[0].day, 'Niedziela');

    // Test filter by workdays
    const workdaysOnly = filterAndRankSlots(slots, { day: 'workdays' });
    assert.equal(workdaysOnly.length, 2);

    // Test filter by time bucket
    const morningOnly = filterAndRankSlots(slots, { timeBucket: 'morning' });
    assert.equal(morningOnly.length, 2);

    // Test filter by pool
    const mewaOnly = filterAndRankSlots(slots, { pool: 'Mewa' });
    assert.equal(mewaOnly.length, 2);
});

// --- computeDataInsights ---------------------------------------------------
test('computeDataInsights accurately finds top days and buckets', () => {
    const slots = [
        { poolName: 'Mewa', day: 'Niedziela', hour: 10, timeBucket: 'morning', freeLanes: 6, openness: 1.0 },
        { poolName: 'Mewa', day: 'Niedziela', hour: 11, timeBucket: 'morning', freeLanes: 6, openness: 1.0 },
        { poolName: 'Delfin', day: 'Poniedziałek', hour: 8, timeBucket: 'morning', freeLanes: 0, openness: 0.0 },
        { poolName: 'Olimpijczyk', day: 'Poniedziałek', hour: 6, timeBucket: 'morning', freeLanes: 10, openness: 1.0 }
    ];

    const ins = computeDataInsights(slots);
    assert.equal(ins.bestDay, 'Niedziela');
    assert.ok(ins.bestDayPercentage >= 90);
    assert.ok(ins.peakSlot.includes('Olimpijczyk'));
});

// --- getScheduleDates & slot date population ------------------------------
test('getScheduleDates extracts dates and assigns them to aggregated slots', () => {
    const mockPools = [
        {
            name: 'Mewa',
            weekRange: '26.10.2026 – 01.11.2026',
            dates: {
                'Poniedziałek': '26.10.2026',
                'Wtorek': '27.10.2026',
                'Środa': '28.10.2026',
                'Czwartek': '29.10.2026',
                'Piątek': '30.10.2026',
                'Sobota': '31.10.2026',
                'Niedziela': '01.11.2026'
            },
            schedule: [
                { day: 'Poniedziałek', time: '07:00 – 08:00', availableLanes: 'Pływalnia dostępna' },
                { day: 'Środa', time: '14:00 – 15:00', availableLanes: 'Pływalnia dostępna' }
            ]
        }
    ];

    const datesInfo = getScheduleDates(mockPools);
    assert.equal(datesInfo.weekRange, '26.10.2026 – 01.11.2026');
    assert.equal(datesInfo.fullDates['Poniedziałek'], '26.10.2026');
    assert.equal(datesInfo.shortDates['Poniedziałek'], '26.10');
    assert.equal(datesInfo.shortDates['Środa'], '28.10');

    const slots = aggregateHourlySlots(mockPools);
    const monSlot = slots.find(s => s.day === 'Poniedziałek');
    assert.ok(monSlot);
    assert.equal(monSlot.date, '26.10.2026');
    assert.equal(monSlot.shortDate, '26.10');

    const wedSlot = slots.find(s => s.day === 'Środa');
    assert.ok(wedSlot);
    assert.equal(wedSlot.date, '28.10.2026');
    assert.equal(wedSlot.shortDate, '28.10');
});

// --- getMultiHourSlots & multi-hour filtering ------------------------------
test('getMultiHourSlots builds contiguous multi-hour windows and handles closures', () => {
    const slots = [
        { poolName: 'Mewa', day: 'Środa', hour: 10, freeLanes: 6, totalLanes: 6, openness: 1.0, timeBucket: 'morning' },
        { poolName: 'Mewa', day: 'Środa', hour: 11, freeLanes: 4, totalLanes: 6, openness: 0.67, timeBucket: 'morning' },
        { poolName: 'Mewa', day: 'Środa', hour: 12, freeLanes: 0, totalLanes: 6, openness: 0.0, timeBucket: 'afternoon' },
        { poolName: 'Mewa', day: 'Środa', hour: 13, freeLanes: 5, totalLanes: 6, openness: 0.83, timeBucket: 'afternoon' }
    ];

    // duration 1 returns slots as-is
    assert.equal(getMultiHourSlots(slots, 1).length, 4);

    // duration 2 produces 3 windows: 10-12, 11-13, 12-14
    const twoHourSlots = getMultiHourSlots(slots, 2);
    assert.equal(twoHourSlots.length, 3);

    const slot10_12 = twoHourSlots.find(s => s.hour === 10);
    assert.ok(slot10_12);
    assert.equal(slot10_12.duration, 2);
    assert.equal(slot10_12.timeLabel, '10:00 – 12:00 (2h)');
    assert.equal(slot10_12.minFreeLanes, 4);
    assert.equal(slot10_12.freeLanes, 5); // average of 6 and 4
    assert.equal(slot10_12.status, 'medium');

    // Slot 11-13 includes hour 12 which is closed (0 free lanes)
    const slot11_13 = twoHourSlots.find(s => s.hour === 11);
    assert.ok(slot11_13);
    assert.equal(slot11_13.minFreeLanes, 0);
    assert.equal(slot11_13.openness, 0);
    assert.equal(slot11_13.status, 'closed');

    // Slot 12-14 also includes hour 12 which is closed
    const slot12_14 = twoHourSlots.find(s => s.hour === 12);
    assert.ok(slot12_14);
    assert.equal(slot12_14.status, 'closed');
});

test('filterAndRankSlots filters and ranks multi-hour requests accurately', () => {
    const slots = [
        { poolName: 'Mewa', day: 'Środa', hour: 14, freeLanes: 6, totalLanes: 6, openness: 1.0, timeBucket: 'afternoon' },
        { poolName: 'Mewa', day: 'Środa', hour: 15, freeLanes: 5, totalLanes: 6, openness: 0.83, timeBucket: 'afternoon' },
        { poolName: 'Delfin', day: 'Środa', hour: 14, freeLanes: 3, totalLanes: 6, openness: 0.5, timeBucket: 'afternoon' },
        { poolName: 'Delfin', day: 'Środa', hour: 15, freeLanes: 0, totalLanes: 6, openness: 0.0, timeBucket: 'afternoon' },
        { poolName: 'Olimpijczyk', day: 'Środa', hour: 14, freeLanes: 8, totalLanes: 10, openness: 0.8, timeBucket: 'afternoon' },
        { poolName: 'Olimpijczyk', day: 'Środa', hour: 15, freeLanes: 8, totalLanes: 10, openness: 0.8, timeBucket: 'afternoon' }
    ];

    // Filter 2h slots: Delfin 14:00-16:00 should be excluded because 15:00 is closed
    const ranked2h = filterAndRankSlots(slots, { duration: 2 });
    assert.equal(ranked2h.length, 2);

    // Olimpijczyk (min 8 lanes) should rank above Mewa (min 5 lanes)
    assert.equal(ranked2h[0].poolName, 'Olimpijczyk');
    assert.equal(ranked2h[0].minFreeLanes, 8);
    assert.equal(ranked2h[0].freeLanes, 8);
    assert.equal(ranked2h[1].poolName, 'Mewa');
    assert.equal(ranked2h[1].minFreeLanes, 5);
    assert.equal(ranked2h[1].freeLanes, 5.5);
});

console.log(`\n${passed} availability tests passed.`);
