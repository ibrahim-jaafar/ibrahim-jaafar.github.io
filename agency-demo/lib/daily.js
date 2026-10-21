// Daily totals: the run's week split by day, made-up history for the other days, totals for any period,
// and a live "today so far" feed. Month and year are added up from days; ratios come from the sums, never averaged.
import { makeRng } from './rng.js';
import { inPeriod } from './leads.js';

const D_MS = 864e5;
const dMoney = n => Math.round(n * 100) / 100;
const dPer = (a, b, round) => (b ? round(a / b) : null);
const dSum = (xs, f) => xs.reduce((a, x) => a + f(x), 0);
const FIELDS = ['leads', 'paidLeads', 'conversions', 'cancelled', 'revenue', 'spend', 'impressions', 'clicks'];

export const dayKey = d => new Date(d).toISOString().slice(0, 10);
export const addDays = (key, n) => dayKey(Date.parse(`${key}T00:00:00Z`) + n * D_MS);

// FNV-1a: a stable number from a text, so the same client and day always get the same made-up data
export function seedOf(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

// Share `total` out by `weights` in whole units (cents when scale is 100), so the parts add up exactly.
function splitUnits(total, weights, scale) {
  const units = Math.round(total * scale), sw = dSum(weights, w => w);
  const raw = weights.map(w => (units * w) / sw), parts = raw.map(Math.floor);
  const order = raw.map((r, i) => [r - parts[i], i]).sort((a, b) => b[0] - a[0]);
  const left = units - dSum(parts, p => p);
  for (let k = 0; k < left; k++) parts[order[k][1]]++;
  return parts.map(p => p / scale);
}

// The run's 7 days. Leads, conversions and revenue come from the CRM leads by the day they came in;
// the week's simulated spend, impressions and clicks are spread over the days and still add up to the week.
export function runDays(client, leads, spend, weekStart) {
  const start = dayKey(weekStart);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const rng = makeRng(seedOf(`${client}:${start}`));
  const w = days.map(() => 0.7 + rng() * 0.6);
  // clicks and impressions get their own day-to-day swing, so cost per click isn't flat
  const wc = w.map(x => x * (0.8 + rng() * 0.4)), wi = wc.map(x => x * (0.9 + rng() * 0.2));
  const camps = spend.campaigns;
  const daySpend = splitUnits(dMoney(dSum(camps, c => c.spend)), w, 100);
  const dayImpr = splitUnits(dSum(camps, c => c.impressions || 0), wi, 1);
  const dayClicks = splitUnits(dSum(camps, c => c.clicks || 0), wc, 1);
  const inWeek = leads.filter(l => inPeriod(l, weekStart));
  return days.map((day, i) => {
    const ls = inWeek.filter(l => dayKey(l.createdAt) === day);
    const conv = ls.filter(l => l.outcome === 'converted');
    return {
      day,
      leads: ls.length,
      paidLeads: ls.filter(l => l.source !== 'organic').length,
      conversions: conv.length,
      cancelled: ls.filter(l => l.outcome === 'cancelled').length,
      revenue: dMoney(dSum(conv, l => l.value)),
      spend: daySpend[i],
      impressions: dayImpr[i],
      clicks: dayClicks[i],
    };
  });
}

const HIST = {
  clinic: { lead: 1.3, conv: 0.3, value: () => 150 },
  store: { lead: 1.4, conv: 0.25, value: r => 80 + Math.floor(r() * 221) },
};
function poisson(lambda, r) {
  const limit = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= r(); } while (p > limit);
  return k - 1;
}

// A made-up day for the history (simulated: true): slow growth, a seasonal swing, quieter weekends.
export function historyDay(client, day) {
  const h = HIST[client], r = makeRng(seedOf(`${client}:${day}`));
  const t = Date.parse(`${day}T00:00:00Z`), dow = new Date(t).getUTCDay();
  const trend = 1 + 0.2 * ((t - Date.UTC(2025, 0, 1)) / (365 * D_MS));
  const season = 1 + 0.1 * Math.sin((2 * Math.PI * (t / D_MS)) / 365);
  const lambda = Math.max(0.2, h.lead * trend * season * (dow === 0 || dow === 6 ? 0.7 : 1.08));
  const row = { day, leads: poisson(lambda, r), paidLeads: 0, conversions: 0, cancelled: 0, revenue: 0, spend: 0, impressions: 0, clicks: 0, simulated: true };
  for (let i = 0; i < row.leads; i++) {
    if (r() < 0.85) row.paidLeads++;
    const u = r();
    if (u < h.conv) { row.conversions++; row.revenue += h.value(r); } else if (u < h.conv + 0.04) row.cancelled++;
  }
  row.spend = dMoney(lambda * 0.85 * (17 + r() * 9) + 12);
  row.clicks = Math.max(1, Math.round(row.spend / (0.6 + r() * 0.9)));
  row.impressions = Math.round(row.clicks / (0.01 + r() * 0.02));
  return row;
}

// Every day from `from` to `to`: the run's real days where there are some, made-up history for the rest.
export function daySeries(client, from, to, runRows = []) {
  const byDay = new Map(runRows.map(d => [d.day, d]));
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(byDay.get(d) ?? historyDay(client, d));
  return out;
}

export function sumDays(rows) {
  const t = Object.fromEntries(FIELDS.map(f => [f, dSum(rows, r => r[f] || 0)]));
  t.spend = dMoney(t.spend);
  t.revenue = dMoney(t.revenue);
  t.days = rows.length;
  return t;
}

// The same KPIs as the weekly report, from added-up totals.
export function kpisFromTotals(client, t) {
  const base = {
    spend: t.spend, leads: t.leads, paidLeads: t.paidLeads, costPerLead: dPer(t.spend, t.paidLeads, dMoney), cancelled: t.cancelled,
    impressions: t.impressions, clicks: t.clicks, costPerClick: dPer(t.spend, t.clicks, dMoney),
  };
  if (client === 'clinic') {
    return { ...base, bookings: t.conversions, costPerBooking: dPer(t.spend, t.conversions, dMoney), bookingRate: dPer(t.conversions, t.leads, n => Math.round(n * 10000) / 10000) };
  }
  return { ...base, orders: t.conversions, revenue: t.revenue, roas: dPer(t.revenue, t.spend, dMoney), costPerOrder: dPer(t.spend, t.conversions, dMoney), avgOrderValue: dPer(t.revenue, t.conversions, dMoney) };
}

// The same calendar date `n` months earlier, clamped to that month's last day (31 Mar → 28 Feb).
function monthsBack(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 - n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return dayKey(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, last)));
}

// Which days a period covers, and the days it is compared with. Periods end yesterday (the last closed day);
// the week is the run's week.
export function periodRange(period, today, weekStart) {
  const y = addDays(today, -1);
  if (period === 'day') return { from: y, to: y, cmp: { from: addDays(y, -7), to: addDays(y, -7) } };
  if (period === 'week') return { from: weekStart, to: addDays(weekStart, 6), cmp: { from: addDays(weekStart, -7), to: addDays(weekStart, -1) } };
  if (period === 'month') {
    const from = `${y.slice(0, 8)}01`;
    return { from, to: y, cmp: { from: monthsBack(from, 1), to: monthsBack(y, 1) } };
  }
  const from = `${y.slice(0, 4)}-01-01`;
  return { from, to: y, cmp: { from: monthsBack(from, 12), to: monthsBack(y, 12) } };
}

// How the day's activity builds up hour by hour (UTC): quiet at night, busy late morning and evening.
const HOUR_W = [1, 0.6, 0.4, 0.3, 0.3, 0.5, 1, 2, 3.5, 5, 6, 6.5, 6, 6, 5.5, 5.5, 6, 6.5, 7, 7, 6, 4.5, 3, 2];
const HOUR_SUM = dSum(HOUR_W, w => w);
function shareBy(hours) {
  const h = Math.min(24, Math.max(0, hours)), whole = Math.floor(h);
  return (dSum(HOUR_W.slice(0, whole), w => w) + (whole < 24 ? HOUR_W[whole] * (h - whole) : 0)) / HOUR_SUM;
}
function upTo(full, share) {
  const t = Object.fromEntries(FIELDS.map(f => [f, Math.round(full[f] * share)]));
  t.spend = dMoney(full.spend * share);
  t.revenue = full.conversions ? dMoney((full.revenue * t.conversions) / full.conversions) : 0;
  return t;
}

// Today so far (provisional: the day isn't over), plus the same time a week ago to compare with.
export function liveToday(client, now) {
  const day = dayKey(now), full = historyDay(client, day);
  const hoursNow = (now - Date.parse(`${day}T00:00:00Z`)) / 36e5;
  const totals = upTo(full, shareBy(hoursNow));
  const hours = [];
  for (let hr = 0; hr <= Math.min(23, Math.floor(hoursNow)); hr++) {
    const a = upTo(full, shareBy(hr)), b = upTo(full, shareBy(Math.min(hoursNow, hr + 1)));
    hours.push({ hour: hr, ...Object.fromEntries(FIELDS.map(f => [f, f === 'spend' || f === 'revenue' ? dMoney(b[f] - a[f]) : b[f] - a[f]])) });
  }
  const weekAgo = addDays(day, -7);
  return { day, asOf: new Date(now).toISOString(), totals, hours, lastWeek: { day: weekAgo, totals: upTo(historyDay(client, weekAgo), shareBy(hoursNow)) } };
}
