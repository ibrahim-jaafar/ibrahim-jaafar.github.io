// node --test agency-demo/app.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { fmt, noticeText } from './app.js';

test('null and zero-division values render as a dash', () => {
  assert.equal(fmt(null, 'usd'), '—');
  assert.equal(fmt(Infinity, 'pct'), '—');
  assert.equal(fmt(NaN, ''), '—');
  assert.equal(fmt(159.4, 'usd'), '$159.40');
  assert.equal(fmt(0.5833, 'pct'), '58.3%');
});

test('notices', () => {
  assert.match(noticeText('waking'), /Waking up the demo server/);
  assert.match(noticeText('limit', { reason: 'gap', retryAfterSec: 42 }), /42 seconds/);
  assert.match(noticeText('limit', { reason: 'daily', retryAfterSec: 3 * 3600 + 5 }), /4 hour/);
  assert.match(noticeText('unavailable', { hasReport: true }), /last report/);
});

// ---------- dashboard ----------
import { dashboardView } from './app.js';

const camps = [
  { name: 'Botox Spring', spend: 100, paidLeads: 4, impressions: 6000, clicks: 100 },
  { name: 'Laser', spend: 50, paidLeads: 2, impressions: 3000, clicks: 50 },
];
const clinic = (o = {}) => ({
  client: 'clinic', name: 'Lumière Skin Clinic', light: 'green', warnings: [], campaigns: camps,
  kpis: { spend: 150, leads: 10, paidLeads: 6, costPerLead: 25, cancelled: 1, bookings: 3, costPerBooking: 50, bookingRate: 0.3, impressions: 9000, clicks: 150, costPerClick: 1 },
  changes: { spend: 50, costPerClick: 10, leads: 0, costPerLead: -5, bookings: 20, bookingRate: null },
  summary: { headline: 'h', summary: 's', next_steps: ['n1'] }, ...o,
});
const store = (o = {}) => ({
  client: 'store', name: 'Northwind Home', light: 'orange', warnings: [{ code: 'duplicates', count: 1, message: 'm' }], campaigns: camps,
  kpis: { spend: 150, leads: 8, paidLeads: 8, costPerLead: 18.75, cancelled: 1, orders: 2, revenue: 400, roas: 2.67, costPerOrder: 75, avgOrderValue: 200, impressions: 9000, clicks: 150, costPerClick: 1 },
  changes: { revenue: 20 }, summary: { headline: 'h', summary: 's', next_steps: [] }, ...o,
});

test('dashboard cards for each client, in order', () => {
  assert.deepEqual(dashboardView(clinic()).cards.map(c => [c.key, c.label]), [
    ['spend', 'Ad spend'], ['costPerClick', 'Cost per click'], ['leads', 'Leads'], ['costPerLead', 'Cost per paid lead'],
    ['bookings', 'Booked consultations'], ['bookingRate', 'Lead-to-booking rate']]);
  assert.deepEqual(dashboardView(store()).cards.map(c => [c.key, c.label]), [
    ['spend', 'Ad spend'], ['costPerClick', 'Cost per click'], ['leads', 'Leads'], ['costPerOrder', 'Cost per order'],
    ['revenue', 'Revenue'], ['roas', 'Return on ad spend']]);
  const v = dashboardView(clinic());
  assert.deepEqual(v.cards.filter(c => c.simulated).map(c => c.key), ['spend', 'costPerClick']);
  assert.equal(v.cards[0].value, '$150.00');
});

test('change arrows are coloured by meaning, not direction', () => {
  const tone = (v, key) => v.cards.find(c => c.key === key).tone;
  const v = dashboardView(clinic());
  assert.equal(tone(v, 'costPerClick'), 'bad');
  assert.equal(tone(v, 'costPerLead'), 'good');
  assert.equal(tone(v, 'spend'), 'neutral');
  assert.equal(tone(v, 'leads'), 'neutral');
  assert.equal(tone(v, 'bookingRate'), 'neutral');
  assert.equal(v.cards.find(c => c.key === 'costPerClick').change, '▲ 10%');
  assert.equal(v.cards.find(c => c.key === 'costPerLead').change, '▼ 5%');
  assert.equal(v.cards.find(c => c.key === 'bookingRate').change, null);
  assert.equal(tone(dashboardView(store()), 'revenue'), 'good');
});

test('funnel runs impressions to bookings or orders, with rates', () => {
  const f = dashboardView(clinic()).funnel;
  assert.deepEqual(f.map(s => s.label), ['Impressions', 'Clicks', 'Leads', 'Booked consultations']);
  assert.deepEqual(f.map(s => s.value), ['9,000', '150', '10', '3']);
  // clicks → leads uses paid leads (organic leads never clicked an ad): 6 of 150
  assert.deepEqual(f.map(s => s.rate), [null, '1.7%', '4%', '30%']);
  assert.equal(dashboardView(store()).funnel[3].label, 'Orders');
});

test('campaign bars are shares of the biggest campaign', () => {
  assert.deepEqual(dashboardView(clinic()).campaigns, [
    { name: 'Botox Spring', spend: '$100.00', leads: '4', spendPct: 100, leadsPct: 100, cpl: '$25.00' },
    { name: 'Laser', spend: '$50.00', leads: '2', spendPct: 50, leadsPct: 50, cpl: '$25.00' }]);
  const none = dashboardView(clinic({ campaigns: [{ name: 'A', spend: 0, paidLeads: 0, impressions: 0, clicks: 0 }] })).campaigns;
  assert.deepEqual(none.map(c => [c.spendPct, c.leadsPct]), [[0, 0]]);
});

test('an old report without clicks or campaigns still draws', () => {
  const k = { ...clinic().kpis };
  delete k.impressions; delete k.clicks; delete k.costPerClick;
  const old = { ...clinic({ kpis: k }) };
  delete old.campaigns;
  const v = dashboardView(old);
  assert.deepEqual(v.funnel.slice(0, 2).map(s => s.value), ['—', '—']);
  assert.equal(v.funnel[2].rate, '—');
  assert.deepEqual(v.campaigns, []);
  assert.equal(v.cards.find(c => c.key === 'costPerClick').value, '—');
});

test('an empty week shows dashes, not errors', () => {
  const v = dashboardView(clinic({ kpis: { spend: 20, leads: 0, paidLeads: 0, costPerLead: null, cancelled: 0, bookings: 0, costPerBooking: null, bookingRate: null, impressions: 500, clicks: 15, costPerClick: 1.33 }, changes: null }));
  assert.equal(v.funnel.length, 4);
  assert.equal(v.funnel[3].rate, '—');
  assert.equal(v.cards.find(c => c.key === 'costPerLead').value, '—');
  assert.ok(v.cards.every(c => c.change === null && c.tone === 'neutral'));
});

test('a missing AI summary gives empty text', () => {
  assert.deepEqual(dashboardView(clinic({ summary: undefined })).ai, { headline: '', summary: '', nextSteps: [] });
  assert.deepEqual(dashboardView(clinic()).ai, { headline: 'h', summary: 's', nextSteps: ['n1'] });
});

test('numbers without a card still show as extras', () => {
  assert.deepEqual(dashboardView(clinic()).extras.map(e => e.label), ['Paid leads', 'Cost per booking', 'Cancelled']);
  assert.deepEqual(dashboardView(store()).extras.map(e => e.label), ['Orders', 'Average order', 'Paid leads', 'Refunded']);
  assert.equal(dashboardView(store()).extras[1].value, '$200.00');
});

test('paid leads with no recorded source are counted outside the campaign bars', () => {
  // campaigns hold 6 paid leads; the card says 8, so 2 have no source
  assert.equal(dashboardView(clinic({ kpis: { ...clinic().kpis, paidLeads: 8 } })).unsourced, 2);
  assert.equal(dashboardView(clinic()).unsourced, 0);
  const old = clinic(); delete old.campaigns;
  assert.equal(dashboardView(old).unsourced, 0);
});

test('only impressions and clicks are marked simulated in the funnel', () => {
  assert.deepEqual(dashboardView(clinic()).funnel.map(s => s.simulated), [true, true, false, false]);
});

// ---------- toolbar ----------
import { stageText, caughtSummary } from './app.js';

const st = (pairs) => pairs.map(([key, status, reason]) => (reason ? { key, status, reason } : { key, status }));

test('toolbar shows only the current stage while running', () => {
  assert.deepEqual(stageText(st([['ghl', 'done'], ['spend', 'done'], ['meta', 'running']]), 'running', null),
    { cls: 'running', text: 'Sending conversions to Meta… (3 of 5)' });
  assert.deepEqual(stageText([], 'running', null), { cls: 'running', text: 'Saving the leads in GoHighLevel… (1 of 5)' });
});

test('toolbar sums up a finished run', () => {
  const rep = { clients: [{ warnings: [{}, {}] }, { warnings: [] }] };
  const all = st([['ghl', 'done'], ['spend', 'done'], ['meta', 'done'], ['checks', 'done'], ['ai', 'done']]);
  assert.deepEqual(stageText(all, 'done', rep, 34), { cls: 'warn', text: '✓ Done in 34 s · 2 warnings' });
  assert.deepEqual(stageText(all, 'done', { clients: [{ warnings: [] }] }), { cls: 'done', text: '✓ Done · all checks passed' });
  assert.deepEqual(stageText(all, 'done', { clients: [{ warnings: [{}] }] }), { cls: 'warn', text: '✓ Done · 1 warning' });
});

test('toolbar names the step that failed', () => {
  const s = st([['ghl', 'done'], ['spend', 'done'], ['meta', 'failed', "Meta didn't respond"]]);
  assert.deepEqual(stageText(s, 'partial', { clients: [] }), { cls: 'failed', text: "Done, but a step failed: Meta conversions (Meta didn't respond)" });
  assert.deepEqual(stageText(st([['ghl', 'running']]), 'failed', null), { cls: 'failed', text: 'The run hit an error and stopped at: GoHighLevel leads' });
});

test('toolbar before any run', () => {
  assert.deepEqual(stageText([], null, null), { cls: '', text: 'Pick the test data and press Run' });
});

test('result strip says whether the checks caught what the visitor broke', () => {
  assert.equal(caughtSummary([]), null);
  assert.deepEqual(caughtSummary([{ problem: 'duplicates', caught: true }, { problem: 'bad_totals', caught: true }]), { cls: 'yes', text: 'You broke 2 things: both caught ✓' });
  assert.deepEqual(caughtSummary([{ problem: 'duplicates', caught: true }]), { cls: 'yes', text: 'You broke 1 thing: caught ✓' });
  assert.deepEqual(caughtSummary([{ problem: 'duplicates', caught: true }, { problem: 'edge_cases', caught: false }, { problem: 'missing_source', caught: true }]), { cls: 'no', text: 'You broke 3 things: 2 caught, 1 missed' });
  // "not applicable" doesn't count as missed
  assert.deepEqual(caughtSummary([{ problem: 'meta_mismatch', caught: null }, { problem: 'duplicates', caught: true }]), { cls: 'yes', text: 'You broke 2 things: all that applied were caught ✓' });
});

test('toolbar shows how many of the visitor’s mistakes were caught', () => {
  const all = st([['ghl', 'done'], ['spend', 'done'], ['meta', 'done'], ['checks', 'done'], ['ai', 'done']]);
  const rep = inj => ({ clients: [{ warnings: [{}, {}, {}] }], injected: inj });
  assert.deepEqual(stageText(all, 'done', rep([{ problem: 'a', caught: true }, { problem: 'b', caught: true }, { problem: 'c', caught: true }]), 34),
    { cls: 'done', text: '✓ Done in 34 s · 3 of 3 mistakes caught' });
  assert.deepEqual(stageText(all, 'done', rep([{ problem: 'a', caught: true }, { problem: 'b', caught: false }])),
    { cls: 'failed', text: '✓ Done · 1 of 2 mistakes caught' });
  // not applicable is left out of the count
  assert.deepEqual(stageText(all, 'done', rep([{ problem: 'a', caught: null }, { problem: 'b', caught: true }])),
    { cls: 'done', text: '✓ Done · 1 of 1 mistake caught' });
  // no mistakes chosen: warnings as before
  assert.deepEqual(stageText(all, 'done', rep([])), { cls: 'warn', text: '✓ Done · 3 warnings' });
});

test('result strip says so when none of the chosen mistakes applied', () => {
  assert.deepEqual(caughtSummary([{ problem: 'meta_mismatch', caught: null }]), { cls: 'na', text: 'You broke 1 thing: it didn’t apply this run' });
  assert.deepEqual(caughtSummary([{ problem: 'meta_mismatch', caught: null }, { problem: 'x', caught: null }]), { cls: 'na', text: 'You broke 2 things: none of them applied this run' });
});

// ---------- periods and charts ----------
import { periodView, chartPoints, rangeText } from './app.js';
import { runDays, daySeries, sumDays, kpisFromTotals, periodRange, historyDay, liveToday, addDays } from './lib/daily.js';

const week = '2026-10-12';
const runRows = runDays('store', [], { campaigns: [{ name: 'A', spend: 70, paidLeads: 0, impressions: 7000, clicks: 70 }] }, new Date(`${week}T00:00:00Z`));
const rep = { weekStart: `${week}T00:00:00.000Z` };
const storeC = (o = {}) => ({ client: 'store', name: 'Northwind Home', kpis: { spend: 70, leads: 0 }, changes: { spend: 5 }, campaigns: [], days: runRows, summary: {}, light: 'green', warnings: [], ...o });

test('dates read like a person writes them', () => {
  assert.equal(rangeText('2026-10-20', '2026-10-20'), '20 Oct 2026');
  assert.equal(rangeText('2026-10-01', '2026-10-20'), '1–20 Oct 2026');
  assert.equal(rangeText('2026-01-01', '2026-10-20'), '1 Jan – 20 Oct 2026');
  assert.equal(rangeText('2025-12-29', '2026-01-04'), '29 Dec 2025 – 4 Jan 2026');
});

const NOW = new Date(Date.UTC(2026, 9, 22, 15)); // Thursday 22 Oct, 15:00 UTC
test('the run’s week (one step back on Week) is the run report itself', () => {
  const v = periodView(rep, storeC(), 'week', NOW, 1);
  assert.equal(v.kpis.spend, 70);
  assert.deepEqual(v.changes, { spend: 5 });
  assert.equal(v.report, true);
  assert.equal(v.rows.length, 7);
  assert.equal(v.rows[0].day, week);
  assert.match(v.note, /^12–18 Oct 2026 \(the run’s week\) · compared with the previous report/);
});

test('earlier periods are added up from daily totals and compared fairly', () => {
  for (const period of ['day', 'month', 'year']) {
    const v = periodView(rep, storeC(), period, NOW, 1);
    const r = periodRange(period, '2026-10-22', 1);
    const want = kpisFromTotals('store', sumDays(daySeries('store', r.from, r.to, runRows)));
    assert.deepEqual(v.kpis, want, period);
    assert.equal(v.report, false);
    assert.ok(v.changes && 'spend' in v.changes, period);
  }
  assert.match(periodView(rep, storeC(), 'month', NOW, 1).note, /^1–30 Sep 2026 · compared with 1–31 Aug 2026/);
  // the current month includes the run's real days
  const m = periodView(rep, storeC(), 'month', NOW);
  assert.equal(m.rows.find(d => d.day === week).spend, runRows[0].spend);
  assert.match(m.note, /made-up history/);
});

test('an earlier day charts the two weeks up to that day', () => {
  const v = periodView(rep, storeC(), 'day', NOW, 1);
  assert.equal(v.rows.length, 14);
  assert.equal(v.rows.at(-1).day, '2026-10-21');
  assert.equal(v.highlight, '2026-10-21');
  assert.equal(v.live, undefined);
});

test('Day opens on today so far, against the same time last week', () => {
  const v = periodView(rep, storeC(), 'day', NOW);
  assert.equal(v.live.day, '2026-10-22');
  assert.equal(v.title, 'Today');
  assert.equal(v.kpis.leads, v.live.totals.leads);
  assert.match(v.note, /^22 Oct 2026 so far, as of 15:00 UTC · provisional until the day ends · compared with Thursday 15 Oct up to the same time \(same day last week\)/);
});

test('the current week, month and year end with today so far, against the same stretch up to the same time', () => {
  for (const period of ['week', 'month', 'year']) {
    const v = periodView(rep, storeC(), period, NOW), r = periodRange(period, '2026-10-22');
    const live = liveToday('store', NOW, runRows, undefined, r.cmp.to);
    const want = sumDays([...daySeries('store', r.from, '2026-10-21', runRows), live.totals]);
    assert.deepEqual(v.kpis, kpisFromTotals('store', want), period);
    const before = sumDays([...daySeries('store', r.cmp.from, addDays(r.cmp.to, -1), runRows), live.before.totals]);
    assert.deepEqual(v.before, kpisFromTotals('store', before), period);
    assert.equal(v.rows.at(-1).partial, true, period);
    assert.ok(v.current && v.title.startsWith('This'), period);
  }
  assert.match(periodView(rep, storeC(), 'week', NOW).note, /^19–22 Oct 2026 so far, as of 15:00 UTC · provisional until the week ends · compared with 12–15 Oct 2026 up to the same time/);
  assert.equal(chartPoints(periodView(rep, storeC(), 'month', NOW).rows, 'month').at(-1).label, '22 Oct (so far)');
});

test('history has a start: the arrow stops there', () => {
  assert.equal(periodView(rep, storeC(), 'year', NOW, 1).earliest, true);
  assert.equal(periodView(rep, storeC(), 'year', NOW).earliest, false);
});

test('chart points: one per day, or one per month for the year', () => {
  const rows = daySeries('clinic', '2026-01-01', '2026-03-31');
  const byMonth = chartPoints(rows, 'year');
  assert.deepEqual(byMonth.map(p => p.label), ['Jan', 'Feb', 'Mar']);
  assert.equal(byMonth[0].leads, rows.filter(r => r.day < '2026-02-01').reduce((a, r) => a + r.leads, 0));
  const days = chartPoints(rows.slice(0, 3), 'month');
  assert.deepEqual(days.map(p => p.label), ['1 Jan', '2 Jan', '3 Jan']);
  const d = historyDay('clinic', '2026-01-01');
  assert.equal(days[0].cpc, Math.round((d.spend / d.clicks) * 100) / 100);
  assert.equal(chartPoints([{ day: '2026-01-01', leads: 0, spend: 5, clicks: 0, revenue: 0 }], 'month')[0].cpc, null);
});

// ---------- review fixes ----------
test('a change from 0 says "was 0", not "no earlier figure"', () => {
  const v = dashboardView(clinic({ kpis: { ...clinic().kpis, bookings: 2 }, changes: { bookings: null, leads: null }, before: { bookings: 0 } }));
  assert.equal(v.cards.find(c => c.key === 'bookings').change, 'was 0');
  assert.equal(v.cards.find(c => c.key === 'leads').change, null);
  const pv = periodView(rep, storeC(), 'day', NOW, 1);
  assert.ok(pv.before && typeof pv.before.spend === 'number');
});

test('the note is honest about made-up days', () => {
  const old = storeC({ days: undefined });
  assert.match(periodView(rep, old, 'month', NOW).note, /all days are made-up history \(this report has no daily figures\)/);
  // every day of the period is real, but the comparison is made up
  const june = { weekStart: '2026-06-01T00:00:00.000Z' };
  const realJune = runDays('store', [], { campaigns: [{ name: 'A', spend: 70, paidLeads: 0, impressions: 7000, clicks: 70 }] }, new Date('2026-06-01T00:00:00Z'));
  assert.match(periodView(june, storeC({ days: realJune }), 'month', new Date(Date.UTC(2026, 5, 8, 12))).note, /made-up history/);
});

test('toolbar shows the last step when every step is done but the run is still saving', () => {
  const all = ['ghl', 'spend', 'meta', 'checks', 'ai'].map(key => ({ key, status: 'done' }));
  assert.equal(stageText(all, 'running', null).text, 'Gemini is writing the summary… (5 of 5)');
});

// ---------- realism pass ----------
import { leadsView, csvFor, parseHash, hashFor } from './app.js';
import { sumCampaigns } from './lib/daily.js';

test('every period has campaign numbers', () => {
  const m = periodView(rep, storeC(), 'month', NOW, 1);
  const r = periodRange('month', '2026-10-22', 1);
  assert.deepEqual(m.campaigns, sumCampaigns(daySeries('store', r.from, r.to, runRows), 'store'));
  assert.equal(periodView(rep, storeC({ campaigns: [{ name: 'A', spend: 1, paidLeads: 0, impressions: 1, clicks: 1 }] }), 'week', NOW, 1).campaigns[0].name, 'A');
  const live = periodView(rep, storeC(), 'day', NOW);
  assert.equal(live.campaigns.length, 3);
});

test('the week says what it is compared with', () => {
  assert.match(periodView(rep, storeC({ leadList: [] }), 'week', NOW, 1).note, /compared with the previous week \(made-up history\)/);
  // reports saved before the leads list existed were compared with the previous run
  assert.match(periodView(rep, storeC(), 'week', NOW, 1).note, /compared with the previous report/);
});

test('the leads table: readable status per client, value only when it counts, newest first kept', () => {
  const list = [
    { name: 'Sara H.', source: 'Living Room Sale', outcome: 'converted', value: 240, createdAt: '2026-10-17T09:30:00.000Z', duplicate: false },
    { name: 'Omar K.', source: null, outcome: 'open', value: 0, createdAt: '2026-10-16T18:05:00.000Z', duplicate: true },
    { name: 'Lina S.', source: 'Retargeting', outcome: 'cancelled', value: 120, createdAt: '2026-10-15T08:00:00.000Z', duplicate: false },
  ];
  const s = leadsView(list, 'store');
  assert.deepEqual(s.map(r => r.status), ['Ordered', 'Open', 'Refunded']);
  assert.deepEqual(s.map(r => r.value), ['$240.00', '—', '$120.00']);
  assert.deepEqual(s.map(r => r.source), ['Living Room Sale', 'No source recorded', 'Retargeting']);
  assert.equal(s[0].date, 'Sat 17 Oct, 09:30'); // UTC, like the week's days
  assert.equal(s[1].duplicate, true);
  assert.deepEqual(leadsView(list, 'clinic').map(r => r.status), ['Booked', 'Open', 'Cancelled']);
  assert.deepEqual(leadsView(null, 'clinic'), []);
});

test('CSV export: a header and one line per day, numbers as plain values', () => {
  const rows = [{ day: '2026-10-12', leads: 2, paidLeads: 1, conversions: 1, cancelled: 0, revenue: 150, spend: 30.5, impressions: 1200, clicks: 25, simulated: true }];
  const csv = csvFor(rows, 'clinic');
  const lines = csv.trim().split('\n');
  assert.equal(lines[0], 'date,leads,paid leads,booked consultations,cancelled,booking value,ad spend,impressions,clicks,cost per click,made-up day');
  assert.equal(lines[1], '2026-10-12,2,1,1,0,150.00,30.50,1200,25,1.22,yes');
  assert.match(csvFor(rows, 'store').split('\n')[0], /orders,refunded,revenue/);
  // hourly live rows
  assert.equal(csvFor([{ hour: 9, leads: 1, paidLeads: 1, conversions: 0, cancelled: 0, revenue: 0, spend: 2, impressions: 80, clicks: 2 }], 'clinic').split('\n')[1].split(',')[0], '09:00');
});

test('the address keeps the client and period, and ignores anything odd', () => {
  assert.deepEqual(parseHash('#client=store&period=month&back=2'), { client: 'store', period: 'month', back: 2 });
  // older links to Live open today on Day
  assert.deepEqual(parseHash('#period=live'), { client: null, period: 'day', back: 0 });
  assert.deepEqual(parseHash('#client=<script>&period=decade&back=-3'), { client: null, period: null, back: 0 });
  assert.deepEqual(parseHash('#back=1.5'), { client: null, period: null, back: 0 });
  assert.deepEqual(parseHash(''), { client: null, period: null, back: 0 });
  assert.equal(hashFor('clinic', 'week'), '#client=clinic&period=week');
  assert.equal(hashFor('clinic', 'week', 1), '#client=clinic&period=week&back=1');
});

// ---------- user walkthrough fixes ----------
import { pacing, budgetFor, csvName } from './app.js';
import { smoothPath } from './charts.js';

test('when there is an earlier figure, the card says what it was', () => {
  const v = dashboardView(clinic({ kpis: { ...clinic().kpis, costPerLead: null }, changes: { costPerLead: null }, before: { costPerLead: 27.81, bookingRate: 0.1429 } }));
  assert.equal(v.cards.find(c => c.key === 'costPerLead').change, 'was $27.81');
  const r = dashboardView(clinic({ kpis: { ...clinic().kpis, bookingRate: null }, changes: { bookingRate: null }, before: { bookingRate: 0.1429 } }));
  assert.equal(r.cards.find(c => c.key === 'bookingRate').change, 'was 14.3%');
  assert.equal(dashboardView(clinic({ changes: { bookings: null }, before: { bookings: 0 } })).cards.find(c => c.key === 'bookings').change, 'was 0');
});

test('while running, the toolbar counts the seconds so a long step doesn’t look stuck', () => {
  assert.equal(stageText([{ key: 'ghl', status: 'running' }], 'running', null, 23).text, 'Saving the leads in GoHighLevel… (1 of 5) · 23 s');
});

test('the year chart says the last month is only part of a month', () => {
  const rows = daySeries('clinic', '2026-09-01', '2026-10-20');
  assert.deepEqual(chartPoints(rows, 'year').map(p => p.label), ['Sep', 'Oct (to 20th)']);
  assert.deepEqual(chartPoints(daySeries('clinic', '2026-09-01', '2026-09-30'), 'year').map(p => p.label), ['Sep']);
});

test('leads table: UTC time like the week, organic named, cancelled value not counted', () => {
  const s = leadsView([
    { name: 'A B.', source: 'organic', outcome: 'open', value: 0, createdAt: '2026-10-17T09:30:00.000Z', duplicate: false },
    { name: 'C D.', source: 'Ads', outcome: 'cancelled', value: 150, createdAt: '2026-12-17T09:30:00.000Z', duplicate: false },
  ], 'clinic');
  assert.equal(s[0].date, 'Sat 17 Oct, 09:30');
  assert.equal(s[1].date, 'Thu 17 Dec, 09:30');
  assert.equal(s[0].source, 'Organic (not from an ad)');
  assert.equal(s[1].counted, false);
  assert.equal(s[1].value, '$150.00');
});

test('each campaign shows its cost per paid lead', () => {
  const v = dashboardView(clinic());
  assert.deepEqual(v.campaigns.map(c => c.cpl), ['$25.00', '$25.00']);
  const none = dashboardView(clinic({ campaigns: [{ name: 'A', spend: 5, paidLeads: 0, impressions: 10, clicks: 1 }] }));
  assert.equal(none.campaigns[0].cpl, '—');
});

test('the run’s week says so, and warns when the data has chosen mistakes', () => {
  const plain = periodView(rep, storeC({ leadList: [] }), 'week', NOW, 1);
  assert.match(plain.note, /^12–18 Oct 2026 \(the run’s week\) · compared with the previous week/);
  const broken = periodView({ ...rep, injected: [{ problem: 'edge_cases', caught: true }] }, storeC({ leadList: [] }), 'week', NOW, 1);
  assert.match(broken.note, /mistakes you chose are in this week’s data, so some changes look extreme/);
});

test('monthly budget pacing: spent so far against where it should be by now', () => {
  // 19 whole days of October gone, plus half of today: 19.5 / 31 = 63%
  const b = budgetFor('clinic', 'month', periodRange('month', '2026-10-20'), 0.5);
  assert.deepEqual(pacing(400, b), { spent: '$400.00', budget: '$800.00', pct: 50, expectedPct: 63, status: 'under', text: '50% of the $800.00 monthly budget spent, 63% of the month gone' });
  assert.equal(pacing(700, b).status, 'over');
  assert.equal(pacing(520, b).status, 'on track');
});

test('every period has a budget: a day is a 365th of the year, a week seven days, the year twelve months', () => {
  const past = (period, back = 1) => periodRange(period, '2026-10-22', back);
  assert.deepEqual(budgetFor('clinic', 'day', past('day')), { amount: 26.3, word: 'Daily', expectedPct: 100, due: null });
  assert.equal(budgetFor('clinic', 'week', past('week')).amount, 184.11);
  assert.equal(budgetFor('store', 'year', past('year')).amount, 8400);
  // 21 Oct is day 294 of 365: 293 whole days gone plus the whole day
  assert.equal(budgetFor('store', 'year', periodRange('year', '2026-10-21'), 1).expectedPct, 81);
  assert.equal(budgetFor('store', 'day', past('day', 0), 0.25).expectedPct, 25);
  assert.equal(budgetFor('store', 'week', past('week', 0), 0.5).expectedPct, 50); // Thursday noon: 3.5 of 7 days
  assert.equal(pacing(26.3, budgetFor('clinic', 'day', past('day'))).text, '100% of the $26.30 daily budget spent');
  for (const period of ['day', 'week', 'month', 'year']) for (const back of [0, 1]) assert.ok(periodView(rep, storeC(), period, NOW, back).budget.amount > 0, period);
});

test('every period lists its leads, and the list matches the leads card', () => {
  for (const period of ['day', 'week', 'month', 'year']) for (const back of [0, 1, 2]) {
    const v = periodView(rep, storeC({ leadList: [] }), period, NOW, back);
    if (v.report) continue;
    assert.equal(v.leads.length, v.kpis.leads, `${period} ${back}`);
    assert.ok(v.leads.every(l => Date.parse(l.createdAt) < +NOW), `${period} ${back}: no lead from later today`);
  }
  assert.equal(periodView(rep, storeC({ leadList: [] }), 'month', NOW).leadsTitle, 'Leads this month so far');
  assert.equal(periodView(rep, storeC({ leadList: [] }), 'day', NOW).leadsTitle, 'Leads today so far');
  assert.equal(periodView(rep, storeC({ leadList: [] }), 'day', NOW, 1).leadsTitle, 'Leads on 21 Oct 2026');
  assert.equal(periodView(rep, storeC({ leadList: [] }), 'month', NOW, 1).leadsTitle, 'Leads in 1–30 Sep 2026');
});

test('smooth lines pass through every point and never overshoot them', () => {
  const pts = [[0, 50], [10, 10], [20, 10], [30, 80], [40, 60]];
  const d = smoothPath(pts);
  for (const [x, y] of pts.slice(1)) assert.ok(d.includes(`${x.toFixed(1)},${y.toFixed(1)}`));
  // every control point stays between its segment's two ends, so the curve can't leave them
  const nums = d.slice(1).split(/[MC ]/).filter(Boolean).map(p => p.split(',').map(Number));
  for (let i = 0; i < pts.length - 1; i++) {
    const [lo, hi] = [Math.min(pts[i][1], pts[i + 1][1]), Math.max(pts[i][1], pts[i + 1][1])];
    for (const c of nums.slice(1 + i * 3, 3 + i * 3)) assert.ok(c[1] >= lo - 1e-9 && c[1] <= hi + 1e-9, `segment ${i}: ${c}`);
  }
  assert.equal(smoothPath([[0, 1], [5, 2]]), 'M0.0,1.0L5.0,2.0');
});

test('CSV file names are plain and say what they hold', () => {
  assert.equal(csvName('clinic', 'day', periodView(rep, storeC(), 'day', NOW, 1)), 'lumiere-skin-clinic-14-days-to-2026-10-21.csv');
  assert.equal(csvName('clinic', 'day', periodView(rep, storeC(), 'day', NOW)), 'lumiere-skin-clinic-2026-10-22-by-hour.csv');
  assert.equal(csvName('store', 'month', periodView(rep, storeC(), 'month', NOW)), 'northwind-home-2026-10-01-to-2026-10-22.csv');
});

test('cost per click with no clicks shows a dash in the CSV, not a number', () => {
  assert.equal(csvFor([{ day: '2026-10-12', leads: 0, paidLeads: 0, conversions: 0, cancelled: 0, revenue: 0, spend: 3, impressions: 0, clicks: 0 }], 'clinic').split('\n')[1].split(',')[9], '');
});

test('Day says which day it is compared with, and can compare with the day before', () => {
  const week = periodView(rep, storeC(), 'day', NOW, 1);
  assert.match(week.note, /^21 Oct 2026 · compared with Wednesday 14 Oct \(same day last week\)/);
  const prev = periodView(rep, storeC(), 'day', NOW, 1, 'prev');
  assert.match(prev.note, /^21 Oct 2026 · compared with Tuesday 20 Oct \(the day before\)/);
  assert.deepEqual(prev.before, kpisFromTotals('store', sumDays(daySeries('store', '2026-10-20', '2026-10-20', runRows))));
  // today against yesterday up to the same time
  const today = periodView(rep, storeC(), 'day', NOW, 0, 'prev');
  assert.match(today.note, /compared with Wednesday 21 Oct up to the same time \(the day before\)/);
  assert.equal(today.live.before.day, '2026-10-21');
  assert.equal(today.vsLabel, 'Same time the day before');
  // the switch only changes Day
  assert.equal(periodView(rep, storeC(), 'month', NOW, 0, 'prev').note, periodView(rep, storeC(), 'month', NOW).note);
});

test('every view has data health: the run’s checks, run again on the period’s leads and days', () => {
  for (const period of ['day', 'week', 'month', 'year']) for (const back of [0, 1, 2]) {
    const v = periodView(rep, storeC({ leadList: [] }), period, NOW, back);
    assert.ok(['green', 'orange', 'red'].includes(v.health.light), `${period} ${back}`);
    assert.equal(v.health.light === 'green', !v.health.warnings.length, `${period} ${back}`);
  }
  // a made-up year has the odd planted problem; the run's week keeps the run's own warnings
  assert.ok(periodView(rep, storeC({ leadList: [] }), 'year', NOW, 1).health.warnings.length > 0);
  const w = [{ code: 'duplicates', count: 1, message: 'x' }];
  assert.deepEqual(periodView(rep, storeC({ warnings: w, light: 'orange' }), 'week', NOW, 1).health, { light: 'orange', warnings: w, fromRun: true });
  // a failed run step turns a period with run days red, but not one without them
  assert.equal(periodView(rep, storeC({ leadList: [], light: 'red' }), 'month', NOW).health.light, 'red');
  assert.notEqual(periodView(rep, storeC({ leadList: [], light: 'red' }), 'month', NOW, 2).health.light, 'red');
});
