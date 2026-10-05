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
    DEFAULT_CAPACITY
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
test('niedostępna and nieczynna classify as closed (score 0)', () => {
    assert.deepEqual(classifyAvailability('Pływalnia niedostępna'), { score: 0 });
    assert.deepEqual(classifyAvailability('Pływalnia nieczynna'), { score: 0 });
});

// --- classifyAvailability: open -------------------------------------------
test('dostępna and "wolne wszystkie tory" classify as open', () => {
    assert.deepEqual(classifyAvailability('Pływalnia dostępna'), { open: true });
    assert.deepEqual(classifyAvailability('wolne wszystkie tory'), { open: true });
});

// --- classifyAvailability: open but occupied ------------------------------
test('"dostępna-zajęty N tor" captures occupancy', () => {
    assert.deepEqual(classifyAvailability('Pływalnia dostępna-zajęty 1 tor'), { open: true, occupied: 1 });
    assert.deepEqual(classifyAvailability('Pływalnia dostępna-zajęte 2\rtory'), { open: true, occupied: 2 });
});

// --- classifyAvailability: occupied ---------------------------------------
test('"Zajęty/Zajęte N tory" captures occupancy', () => {
    assert.deepEqual(classifyAvailability('Zajęty 3 tory'), { occupied: 3 });
    assert.deepEqual(classifyAvailability('Zajęte 2 tory'), { occupied: 2 });
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
                         '5 kwietnia', '30 marca', 'P\rł\ry\rw', '']) {
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

console.log(`\n${passed} availability tests passed.`);
