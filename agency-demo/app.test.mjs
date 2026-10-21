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
  assert.deepEqual(f.map(s => s.rate), [null, '1.7%', '6.7%', '30%']);
  assert.equal(dashboardView(store()).funnel[3].label, 'Orders');
});

test('campaign bars are shares of the biggest campaign', () => {
  assert.deepEqual(dashboardView(clinic()).campaigns, [
    { name: 'Botox Spring', spend: '$100.00', leads: '4', spendPct: 100, leadsPct: 100 },
    { name: 'Laser', spend: '$50.00', leads: '2', spendPct: 50, leadsPct: 50 }]);
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
import { runDays, daySeries, sumDays, kpisFromTotals, periodRange, historyDay } from './lib/daily.js';

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

test('the week view is the run report itself', () => {
  const v = periodView(rep, storeC(), 'week', '2026-10-21');
  assert.equal(v.kpis.spend, 70);
  assert.deepEqual(v.changes, { spend: 5 });
  assert.equal(v.report, true);
  assert.equal(v.rows.length, 7);
  assert.equal(v.rows[0].day, week);
  assert.match(v.note, /Week of 12 Oct 2026 · compared with the previous report/);
});

test('day, month and year are added up from daily totals and compared fairly', () => {
  for (const period of ['day', 'month', 'year']) {
    const v = periodView(rep, storeC(), period, '2026-10-21');
    const r = periodRange(period, '2026-10-21', week);
    const want = kpisFromTotals('store', sumDays(daySeries('store', r.from, r.to, runRows)));
    assert.deepEqual(v.kpis, want, period);
    assert.equal(v.report, false);
    assert.ok(v.changes && 'spend' in v.changes, period);
  }
  assert.match(periodView(rep, storeC(), 'month', '2026-10-21').note, /^1–20 Oct 2026 · compared with 1–20 Sep 2026/);
  // the month includes the run's real days
  const m = periodView(rep, storeC(), 'month', '2026-10-21');
  assert.equal(m.rows.find(d => d.day === week).spend, runRows[0].spend);
  assert.match(m.note, /made-up history/);
});

test('the day view charts the two weeks up to that day', () => {
  const v = periodView(rep, storeC(), 'day', '2026-10-21');
  assert.equal(v.rows.length, 14);
  assert.equal(v.rows.at(-1).day, '2026-10-20');
  assert.equal(v.highlight, '2026-10-20');
});

test('live is today so far, against the same time last week', () => {
  const now = new Date(Date.UTC(2026, 9, 21, 15, 0));
  const v = periodView(rep, storeC(), 'live', '2026-10-21', now);
  assert.equal(v.live.day, '2026-10-21');
  assert.equal(v.kpis.leads, v.live.totals.leads);
  assert.match(v.note, /Today so far.*15:00 UTC.*compared with the same time last Wednesday/);
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
