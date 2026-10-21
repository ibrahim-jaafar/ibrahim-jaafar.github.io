// Daily totals: the run's week split by day, made-up history for the other days, totals for any period,
// and a live "today so far" feed. Month and year are added up from days; ratios come from the sums, never averaged.
import { makeRng } from './rng.js';
import { inPeriod, CAMPAIGNS, normalisePhone, normaliseEmail, HOUR_CURVE } from './leads.js';

const D_MS = 864e5;
const dMoney = n => Math.round(n * 100) / 100;
const dPer = (a, b, round) => (b ? round(a / b) : null);
const dSum = (xs, f) => xs.reduce((a, x) => a + f(x), 0);
const FIELDS = ['leads', 'paidLeads', 'conversions', 'cancelled', 'revenue', 'spend', 'impressions', 'clicks'];
const CAMP_FIELDS = ['spend', 'impressions', 'clicks', 'paidLeads'];

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
  // each campaign's week is shared out over the days; a day's totals are the sum of its campaigns
  const camps = spend.campaigns.map(c => ({ name: c.name, spend: splitUnits(c.spend, w, 100), impressions: splitUnits(c.impressions || 0, wi, 1), clicks: splitUnits(c.clicks || 0, wc, 1) }));
  const inWeek = leads.filter(l => inPeriod(l, weekStart));
  return days.map((day, i) => {
    const ls = inWeek.filter(l => dayKey(l.createdAt) === day);
    const conv = ls.filter(l => l.outcome === 'converted');
    const campaigns = camps.map(c => ({ name: c.name, spend: c.spend[i], impressions: c.impressions[i], clicks: c.clicks[i], paidLeads: ls.filter(l => l.source === c.name).length }));
    return {
      day,
      leads: ls.length,
      paidLeads: ls.filter(l => l.source !== 'organic').length,
      conversions: conv.length,
      cancelled: ls.filter(l => l.outcome === 'cancelled').length,
      revenue: dMoney(dSum(conv, l => l.value)),
      spend: dMoney(dSum(campaigns, c => c.spend)),
      impressions: dSum(campaigns, c => c.impressions),
      clicks: dSum(campaigns, c => c.clicks),
      campaigns,
    };
  });
}

const HIST = {
  clinic: { lead: 1.09, conv: 0.3, value: () => 150, share: [0.45, 0.33, 0.22] },
  store: { lead: 0.96, conv: 0.25, value: r => 80 + Math.floor(r() * 221), share: [0.4, 0.25, 0.35] },
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
  // about the same spend per paid lead as a run week ($14-$28), so made-up and real weeks compare fairly
  row.spend = dMoney(lambda * 0.85 * (14 + r() * 14) + 3);
  row.clicks = Math.max(1, Math.round(row.spend / (0.6 + r() * 0.9)));
  row.impressions = Math.round(row.clicks / (0.01 + r() * 0.02));
  // split by campaign (drawn last, so the day's own numbers stay the same as before the split existed)
  const ws = h.share.map(x => x * (0.8 + r() * 0.4)), wk = ws.map(x => x * (0.85 + r() * 0.3));
  const parts = { spend: splitUnits(row.spend, ws, 100), clicks: splitUnits(row.clicks, wk, 1), impressions: splitUnits(row.impressions, wk.map(x => x * (0.9 + r() * 0.2)), 1), paidLeads: splitUnits(row.paidLeads, ws, 1) };
  row.campaigns = CAMPAIGNS[client].map((name, i) => ({ name, spend: parts.spend[i], impressions: parts.impressions[i], clicks: parts.clicks[i], paidLeads: parts.paidLeads[i] }));
  return row;
}

// Campaign totals over some days, in the client's campaign order (days without a split count as 0).
export function sumCampaigns(rows, client) {
  return CAMPAIGNS[client].map(name => {
    const cs = rows.map(r => (r.campaigns || []).find(c => c.name === name)).filter(Boolean);
    const t = Object.fromEntries(CAMP_FIELDS.map(f => [f, dSum(cs, c => c[f] || 0)]));
    return { name, ...t, spend: dMoney(t.spend) };
  });
}

// The week's leads for the dashboard table, newest first. Only a first name and an initial; duplicates
// are marked the same way the duplicates check counts them (same person, phone or email written differently).
export function leadList(leads, weekStart) {
  const emails = new Set(), phones = new Set();
  // oldest first, so the mark goes on the later copy whatever order the CRM returned the leads in
  const rows = leads.filter(l => inPeriod(l, weekStart)).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(l => {
    const e = normaliseEmail(l.email), p = normalisePhone(l.phone);
    const duplicate = Boolean((e && emails.has(e)) || (p && phones.has(p)));
    if (e) emails.add(e);
    if (p) phones.add(p);
    const initial = [...String(l.lastName || '')][0];
    return { name: `${l.firstName || ''}${initial ? ` ${initial}.` : ''}`.trim() || 'Unknown', source: l.source ?? null, outcome: l.outcome, value: l.value || 0, createdAt: l.createdAt, duplicate };
  });
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// The week before the run's week, from the same daily figures the dashboard's other views use.
export function previousWeekKpis(client, weekStart) {
  const start = dayKey(weekStart);
  return kpisFromTotals(client, sumDays(daySeries(client, addDays(start, -7), addDays(start, -1))));
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

// The live day builds up hour by hour on the same curve the made-up leads arrive by.
const HOUR_SUM = dSum(HOUR_CURVE, w => w);
function shareBy(hours) {
  const h = Math.min(24, Math.max(0, hours)), whole = Math.floor(h);
  return (dSum(HOUR_CURVE.slice(0, whole), w => w) + (whole < 24 ? HOUR_CURVE[whole] * (h - whole) : 0)) / HOUR_SUM;
}
function upTo(full, share) {
  const t = Object.fromEntries(FIELDS.map(f => [f, Math.round(full[f] * share)]));
  t.spend = dMoney(full.spend * share);
  t.revenue = full.conversions ? dMoney((full.revenue * t.conversions) / full.conversions) : 0;
  return t;
}

// The day's activity up to `hoursNow`, hour by hour.
function hoursUpTo(full, hoursNow) {
  const hours = [];
  for (let hr = 0; hr <= Math.min(23, Math.floor(hoursNow)); hr++) {
    const a = upTo(full, shareBy(hr)), b = upTo(full, shareBy(Math.min(hoursNow, hr + 1)));
    hours.push({ hour: hr, ...Object.fromEntries(FIELDS.map(f => [f, f === 'spend' || f === 'revenue' ? dMoney(b[f] - a[f]) : b[f] - a[f]])) });
  }
  return hours;
}

// Today so far (provisional: the day isn't over), plus the same time a week ago to compare with.
// runRows: the run's real days, used instead of made-up ones when "a week ago" is one of them.
export function liveToday(client, now, runRows = []) {
  const fullOf = d => runRows.find(r => r.day === d) ?? historyDay(client, d);
  const day = dayKey(now), weekAgo = addDays(day, -7);
  const hoursNow = (now - Date.parse(`${day}T00:00:00Z`)) / 36e5;
  const full = fullOf(day), before = fullOf(weekAgo);
  const totals = upTo(full, shareBy(hoursNow));
  // campaigns: today's totals shared out like the full day's campaigns, so they add up exactly
  const fc = full.campaigns || [];
  const split = (f, scale) => (totals[f] && dSum(fc, c => c[f] || 0) ? splitUnits(totals[f], fc.map(c => c[f] || 0), scale) : fc.map(() => 0));
  const cs = Object.fromEntries(CAMP_FIELDS.map(f => [f, split(f, f === 'spend' ? 100 : 1)]));
  return {
    day, asOf: new Date(now).toISOString(),
    totals, hours: hoursUpTo(full, hoursNow),
    campaigns: fc.map((c, i) => ({ name: c.name, spend: cs.spend[i], impressions: cs.impressions[i], clicks: cs.clicks[i], paidLeads: cs.paidLeads[i] })),
    lastWeek: { day: weekAgo, totals: upTo(before, shareBy(hoursNow)), hours: hoursUpTo(before, hoursNow) },
  };
}
