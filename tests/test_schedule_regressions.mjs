import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { aggregateHourlySlots, filterAndRankSlots, getFreeLanesDetail, getLiveSummary,
    getPoolClock, getSlotCalendarDates, buildGoogleCalendarUrl } = require('../script.js');
const now = new Date('2026-11-09T00:00:00+01:00');
const dates = { 'Poniedziałek': '09.11.2026', 'Czwartek': '12.11.2026', 'Piątek': '13.11.2026' };
const row = (time, availableLanes = 'dostępna', day = 'Poniedziałek', extra = {}) => ({ time, availableLanes, day, ...extra });
const pool = schedule => ({ name: 'Mewa', dates, schedule });
const rank = (pools, options = {}) => filterAndRankSlots(aggregateHourlySlots(pools), { now, ...options });

test('a closure inside an hour blocks 1h, 2h and 3h sessions', () => {
    const pools = [pool([row('10:00 – 10:30'), row('10:30 – 11:00', 'niedostępna'), row('11:00 – 13:00')])];
    for (const duration of [1, 2, 3]) assert.equal(rank(pools, { duration }).some(s => s.hour === 10), false);
});

test('missing and unrecognised quarter-hours never count as free', () => {
    const partial = [row('10:00'), row('10:15'), row('10:45')];
    assert.equal(rank([pool(partial)]).length, 0);
    assert.equal(rank([pool([...partial, row('10:30', 'unknown booking format')])]).length, 0);
});

test('minute coverage handles half-hour starts and overlapping reports conservatively', () => {
    const slots = rank([pool([row('10:30 – 12:30')])]);
    assert.deepEqual(slots.map(s => s.hour), [11]);
    assert.equal(rank([pool([row('10:00 – 11:00'), row('10:15', 'niedostępna')])]).length, 0);
});

test('minimum lanes and openness must hold throughout a visit', () => {
    const pools = [pool([row('10:00 – 10:45'), row('10:45', 'Zajęte 5 tory'), row('11:00 – 12:00')])];
    const slot = rank(pools, { duration: 2 })[0];
    assert.equal(slot.freeLanes, 1);
    assert.equal(slot.minFreeLanes, 1);
    assert.equal(rank(pools, { duration: 2, minLanes: 2 }).length, 0);
    assert.equal(rank(pools, { duration: 2, minOpenness: .8 }).length, 0);
});

test('each pool keeps its own dates and short labels; unknown dates stay unknown', () => {
    const pools = [
        { name: 'Mewa', dates: { 'Poniedziałek': '02.11.2026' }, schedule: [row('08:00 – 09:00')] },
        { name: 'Neptun', dates, schedule: [row('08:00 – 09:00')] },
        { name: 'Delfin', schedule: [row('08:00 – 09:00')] }
    ];
    const slots = aggregateHourlySlots(pools);
    assert.deepEqual(slots.map(s => [s.date, s.shortDate]), [['02.11.2026', '02.11'], ['09.11.2026', '09.11'], ['', '']]);
    assert.deepEqual(filterAndRankSlots(slots, { now, day: 'today' }).map(s => s.poolName), ['Neptun']);
});

test('Sunday tomorrow selects next Monday, never the previous Monday', () => {
    const pools = [pool([
        row('08:00 – 09:00'), row('08:00 – 09:00', 'dostępna', 'Poniedziałek', { date: '16.11.2026' })
    ])];
    const options = { now: new Date('2026-11-15T12:00:00+01:00'), day: 'tomorrow' };
    assert.deepEqual(rank(pools, options).map(s => s.date), ['16.11.2026']);
    assert.equal(rank([pool([row('08:00 – 09:00')])], options).length, 0);
});

test('multi-hour sessions cannot join matching weekdays from different weeks', () => {
    const pools = [pool([row('10:00 – 11:00'), row('11:00 – 12:00', 'dostępna', 'Poniedziałek', { date: '16.11.2026' })])];
    assert.equal(rank(pools, { duration: 2 }).length, 0);
});

test('Warsaw dates and midnight apply regardless of the visitor timezone', () => {
    assert.equal(getPoolClock(new Date('2026-11-12T23:30:00Z')).date, '13.11.2026');
    assert.equal(getPoolClock(new Date('2026-07-01T22:30:00Z')).date, '02.07.2026');
    const pools = [pool([row('06:00 – 07:00', 'dostępna', 'Piątek')])];
    assert.equal(rank(pools, { now: new Date('2026-11-12T23:30:00Z'), day: 'today' }).length, 1);
    assert.equal(rank(pools, { now: new Date('2026-11-12T23:30:00Z'), day: 'tomorrow' }).length, 0);
});

test('the live status stays open at 20:45 and 21:00 when the source is open', () => {
    const pools = [pool([row('20:00 – 21:45', 'dostępna', 'Czwartek'), row('21:45 – 22:00', 'Czas wyjścia z wody', 'Czwartek')])];
    for (const time of ['20:45', '21:00']) {
        const live = getLiveSummary(pools, aggregateHourlySlots(pools), new Date(`2026-11-12T${time}:00+01:00`));
        assert.equal(live.statuses[0].freeLanes, 6);
        assert.equal(live.statuses[0].status, 'high');
    }
    const closed = getLiveSummary(pools, aggregateHourlySlots(pools), new Date('2026-11-12T21:45:00+01:00'));
    assert.equal(closed.statuses[0].freeLanes, 0);
});

test('before dawn the next confirmed opening is this morning, not tomorrow', () => {
    const pools = [pool([row('07:00 – 08:00', 'dostępna', 'Czwartek'), row('06:00 – 07:00', 'dostępna', 'Piątek')])];
    const live = getLiveSummary(pools, aggregateHourlySlots(pools), new Date('2026-11-12T02:00:00+01:00'));
    assert.equal(live.nextSlot.date, '12.11.2026');
    assert.equal(live.nextSlot.hour, 7); // actual source opening, not a fixed 06:00
    assert.equal(live.statuses[0].status, 'unknown');
});

test('live status rejects stale data instead of claiming the pool is closed', () => {
    const pools = [pool([row('08:00 – 09:00')])];
    const live = getLiveSummary(pools, aggregateHourlySlots(pools), new Date('2026-11-16T08:00:00+01:00'));
    assert.equal(live.statuses[0].status, 'unknown');
    assert.equal(live.nextSlot, null);
});

test('split lanes retain 17/20 capacity, including less busy split sessions', () => {
    const inferred = getFreeLanesDetail('Olimpijczyk', '17x25m i wypł');
    assert.equal(inferred.freeLanes, 17);
    assert.equal(inferred.totalLanes, 20);
    assert.equal(inferred.openness, .85);
    const configured = getFreeLanesDetail('Olimpijczyk', '8x25m', { totalLanes: 20, laneLength: '25m' });
    assert.equal(configured.openness, .4);
    assert.equal(configured.laneLength, '25m');
    const pools = [{ name: 'Olimpijczyk', dates, schedule: [row('10:00 – 11:00', '17x25m', 'Poniedziałek', { totalLanes: 20, laneLength: '25m' })] }];
    assert.equal(rank(pools)[0].freeLanes, 17);
    assert.equal(rank(pools)[0].laneLength, '25m');
});

test('calendar exports require a confirmed date and pin the pool timezone', () => {
    assert.throws(() => getSlotCalendarDates({ hour: 8 }), /confirmed date/);
    assert.throws(() => getSlotCalendarDates({ hour: 8, date: '31.02.2026' }), /confirmed date/);
    const url = new URL(buildGoogleCalendarUrl({ poolName: 'Mewa', date: '13.11.2026', hour: 8 }));
    assert.equal(url.searchParams.get('ctz'), 'Europe/Warsaw');
    assert.equal(url.searchParams.get('dates'), '20261113T080000/20261113T090000');
});

test('a dated weekday pill cannot select the same weekday in another week', () => {
    const pools = [pool([row('08:00 – 09:00'), row('08:00 – 09:00', 'dostępna', 'Poniedziałek', { date: '16.11.2026' })])];
    assert.deepEqual(rank(pools, { day: 'Poniedziałek', date: '09.11.2026' }).map(s => s.date), ['09.11.2026']);
});
