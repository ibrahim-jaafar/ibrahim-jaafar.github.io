// Daily totals: the run's week split by day, made-up history for the other days, totals for any period,
// and a live "today so far" feed. Month and year are added up from days; ratios come from the sums, never averaged.
import { makeRng } from './rng.js';
import { periodChecks } from './checks.js';
import { pctChanges } from './ai.js';
import { inPeriod, CAMPAIGNS, CAMPAIGN_SHARE, CONVERT_RATE, CANCEL_RATE, WEEKDAY_WEIGHT, FIRST, LAST, normalisePhone, normaliseEmail, HOUR_CURVE, shareBy } from './leads.js';

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
  // mixed (murmur3's finaliser): days of one month differ only in their last digits, and unmixed seeds let
  // whole made-up months swing together (the clinic's monthly leads spread twice as wide as chance)
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
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
// meta: what Meta accepted and rejected. The account-total gap and Meta's misses are known for the whole run only,
// so they go on its last day, the day the report read them (the dashboard's checks add them up per period).
// A day still under way keeps its whole day's share: the dashboard's "so far" takes the part up to the moment it shows.
export function runDays(client, leads, spend, weekStart, meta = null) {
  const start = dayKey(weekStart);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const rng = makeRng(seedOf(`${client}:${start}`));
  const w = days.map(() => 0.7 + rng() * 0.6);
  // clicks and impressions get their own day-to-day swing, so cost per click isn't flat
  const wc = w.map(x => x * (0.8 + rng() * 0.4)), wi = wc.map(x => x * (0.9 + rng() * 0.2));
  // each campaign's week is shared out over the days; a day's totals are the sum of its campaigns
  const camps = spend.campaigns.map(c => ({ name: c.name, spend: splitUnits(c.spend, w, 100), impressions: splitUnits(c.impressions || 0, wi, 1), clicks: splitUnits(c.clicks || 0, wc, 1) }));
  const inWeek = leads.filter(l => inPeriod(l, weekStart));
  const allConv = inWeek.filter(l => l.outcome === 'converted').length;
  const last = {
    spendGap: dMoney(spend.reportedTotal - dSum(spend.campaigns, c => c.spend)),
    metaMissed: meta ? allConv - meta.accepted : 0, metaRejected: meta ? meta.rejected : 0,
  };
  return days.map((day, i) => {
    const ls = inWeek.filter(l => dayKey(l.createdAt) === day);
    const conv = ls.filter(l => l.outcome === 'converted');
    const campaigns = camps.map(c => ({ name: c.name, spend: c.spend[i], impressions: c.impressions[i], clicks: c.clicks[i], paidLeads: ls.filter(l => l.source === c.name).length }));
    return {
      ...(i === 6 ? last : { spendGap: 0, metaMissed: 0, metaRejected: 0 }),
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

// lead: leads a day before the weekday swing; conversion and cancel rates, values and campaign shares are the run's own
const HIST = {
  clinic: { lead: 1.09, value: () => 150 },
  store: { lead: 0.96, value: r => 80 + Math.floor(r() * 221) },
};
function poisson(lambda, r) {
  const limit = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= r(); } while (p > limit);
  return k - 1;
}

// A made-up day for the history (simulated: true): slow growth, a seasonal swing, quieter weekends.
export const historyDay = (client, day) => historyDraw(client, day).row;
function historyDraw(client, day) {
  const h = HIST[client], r = makeRng(seedOf(`${client}:${day}`)), conv = CONVERT_RATE[client];
  const t = Date.parse(`${day}T00:00:00Z`), dow = (new Date(t).getUTCDay() + 6) % 7; // 0 = Monday
  const trend = 1 + 0.2 * ((t - Date.UTC(2025, 0, 1)) / (365 * D_MS));
  const season = 1 + 0.1 * Math.sin((2 * Math.PI * (t / D_MS)) / 365);
  const lambda = Math.max(0.2, h.lead * trend * season * WEEKDAY_WEIGHT[dow]);
  const row = { day, leads: poisson(lambda, r), paidLeads: 0, conversions: 0, cancelled: 0, revenue: 0, spend: 0, impressions: 0, clicks: 0, simulated: true };
  // each lead's draw is kept, so historyLeads can show the people behind the day
  const picks = [];
  for (let i = 0; i < row.leads; i++) {
    const p = { paid: r() < 0.85, outcome: 'open', value: 0 };
    if (p.paid) row.paidLeads++;
    const u = r();
    if (u < conv) { row.conversions++; p.outcome = 'converted'; p.value = h.value(r); row.revenue += p.value; } else if (u < conv + CANCEL_RATE) { row.cancelled++; p.outcome = 'cancelled'; }
    picks.push(p);
  }
  // about the same spend per paid lead as a run week ($14-$28), so made-up and real weeks compare fairly
  row.spend = dMoney(lambda * 0.85 * (14 + r() * 14) + 3);
  row.clicks = Math.max(1, Math.round(row.spend / (0.6 + r() * 0.9)));
  row.impressions = Math.round(row.clicks / (0.01 + r() * 0.02));
  // split by campaign (drawn last, so the day's own numbers stay the same as before the split existed)
  const ws = CAMPAIGN_SHARE[client].map(x => x * (0.8 + r() * 0.4)), wk = ws.map(x => x * (0.85 + r() * 0.3));
  const parts = { spend: splitUnits(row.spend, ws, 100), clicks: splitUnits(row.clicks, wk, 1), impressions: splitUnits(row.impressions, wk.map(x => x * (0.9 + r() * 0.2)), 1), paidLeads: splitUnits(row.paidLeads, ws, 1) };
  row.campaigns = CAMPAIGNS[client].map((name, i) => ({ name, spend: parts.spend[i], impressions: parts.impressions[i], clicks: parts.clicks[i], paidLeads: parts.paidLeads[i] }));
  // Now and then, the problems a real account has, for the dashboard's checks to find: a lead whose source the CRM
  // lost, the same person enquiring twice, a huge store order, an account total that's off, conversions that never
  // reached Meta or that Meta refused. Their own random numbers, so the day's other figures stay as they were.
  const q = makeRng(seedOf(`${client}:${day}:issues`));
  const slots = row.campaigns.flatMap((c, k) => Array(c.paidLeads).fill(k));
  picks.filter(p => p.paid).forEach((p, j) => {
    p.camp = slots[j];
    if (q() < 0.03) { p.lost = true; row.campaigns[p.camp].paidLeads--; }
  });
  picks.forEach((p, i) => { if (i && p.outcome === 'open' && q() < 0.04) p.dupeOf = Math.floor(q() * i); });
  const won = picks.filter(p => p.outcome === 'converted');
  if (client === 'store') for (const p of won) if (q() < 0.015) { const big = 2000 + Math.floor(q() * 2000); row.revenue += big - p.value; p.value = big; }
  row.spendGap = q() < 1 / 60 ? dMoney((q() < 0.5 ? -1 : 1) * row.spend * (0.05 + q() * 0.15)) : 0;
  row.metaMissed = won.filter(() => q() < 0.04).length;
  row.metaRejected = q() < 1 / 90 ? 1 : 0;
  return { row, picks };
}

// The hour of the day (0-24) by which a share `q` of the day's activity has happened, on HOUR_CURVE.
function timeAt(q) {
  let left = q * HOUR_SUM;
  for (let hr = 0; hr < 24; hr++) {
    if (left <= HOUR_CURVE[hr]) return hr + left / HOUR_CURVE[hr];
    left -= HOUR_CURVE[hr];
  }
  return 24;
}

// The made-up people behind a made-up day, in the run's leadList shape and adding up to historyDay (same
// campaigns, outcomes and values). Each arrives at a random time on the hourly curve; Live counts who has
// come in by now, so its numbers, list and hours always agree.
export function historyLeads(client, day) {
  const { picks } = historyDraw(client, day);
  const r = makeRng(seedOf(`${client}:${day}:people`)), h = HIST[client];
  const start = Date.parse(`${day}T00:00:00Z`);
  const people = picks.map(p => ({
    name: `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)][0]}.`,
    source: !p.paid ? 'organic' : p.lost ? null : CAMPAIGNS[client][p.camp],
    outcome: p.outcome,
    value: p.outcome === 'cancelled' ? h.value(r) : p.value, // what the cancelled booking or refunded order was worth
    createdAt: new Date(start + Math.floor(timeAt(r()) * 3600) * 1000).toISOString(),
    duplicate: false,
  }));
  // a second enquiry from someone who already came in that day: same person, marked like the run's duplicates
  picks.forEach((p, i) => {
    if (p.dupeOf === undefined) return;
    const a = people[p.dupeOf], b = people[i];
    // the repeat comes second
    if (b.createdAt < a.createdAt) [a.createdAt, b.createdAt] = [b.createdAt, a.createdAt];
    b.name = a.name;
    b.duplicate = true;
  });
  return people.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// Everyone who came in from `from` to `to`, newest first: the run's leads on its days, made-up people on the others.
export function periodLeads(client, from, to, runRows = [], runLeads = []) {
  const run = new Set(runRows.map(d => d.day)), out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(...(run.has(d) ? (runLeads ?? []).filter(l => dayKey(l.createdAt) === d) : historyLeads(client, d)));
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

const countLeads = ls => {
  const conv = ls.filter(l => l.outcome === 'converted');
  return { leads: ls.length, paidLeads: ls.filter(l => l.source !== 'organic').length, conversions: conv.length,
    cancelled: ls.filter(l => l.outcome === 'cancelled').length, revenue: dMoney(dSum(conv, l => l.value)) };
};

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

// Which days a period covers, and the days it is compared with. `back` steps to earlier periods: 0 is the one
// running now (current: it ends today, so far), 1 the one before, and so on. Day and Week are compared with a
// week earlier (weekends are quieter); Month and Year with the same days of the month or year before.
export function periodRange(period, today, back = 0) {
  const months = { month: 1, year: 12 }[period];
  const at = months ? monthsBack(today, months * back) : addDays(today, -(period === 'week' ? 7 : 1) * back);
  let from = at, end = at;
  if (period === 'week') { from = addDays(at, -((new Date(`${at}T00:00:00Z`).getUTCDay() + 6) % 7)); end = addDays(from, 6); }
  if (period === 'month') { from = `${at.slice(0, 8)}01`; end = addDays(monthsBack(from, -1), -1); }
  if (period === 'year') { from = `${at.slice(0, 4)}-01-01`; end = `${at.slice(0, 4)}-12-31`; }
  const current = back === 0, to = current ? today : end;
  const cmp = months ? { from: monthsBack(from, months), to: current ? monthsBack(to, months) : addDays(from, -1) } : { from: addDays(from, -7), to: addDays(to, -7) };
  return { from, to, current, cmp };
}

// The live day builds up hour by hour on the same curve the made-up leads arrive by.
const HOUR_SUM = dSum(HOUR_CURVE, w => w);
function upTo(full, share) {
  const t = Object.fromEntries(FIELDS.map(f => [f, Math.round(full[f] * share)]));
  t.spend = dMoney(full.spend * share);
  t.revenue = full.conversions ? dMoney((full.revenue * t.conversions) / full.conversions) : 0;
  return t;
}

// The day's activity by hour `hrs`: spend, impressions and clicks on the hourly curve; leads and their
// results counted from the people who had come in by then (when the day's people are known).
function soFar(full, people, start, hrs) {
  const t = upTo(full, shareBy(hrs));
  return people ? { ...t, ...countLeads(people.filter(l => Date.parse(l.createdAt) < start + hrs * 36e5)) } : t;
}

// The day's activity up to `hoursNow`, hour by hour.
function hoursUpTo(full, people, start, hoursNow) {
  const hours = [];
  for (let hr = 0; hr <= Math.min(23, Math.floor(hoursNow)); hr++) {
    const a = soFar(full, people, start, hr), b = soFar(full, people, start, Math.min(hoursNow, hr + 1));
    hours.push({ hour: hr, ...Object.fromEntries(FIELDS.map(f => [f, f === 'spend' || f === 'revenue' ? dMoney(b[f] - a[f]) : b[f] - a[f]])) });
  }
  return hours;
}

// Today so far (provisional: the day isn't over), plus `cmpDay` (a week ago unless asked) up to the same time.
// runRows / runLeads: the run's real days and leads, used instead of made-up ones when either day is one of them.
export function liveToday(client, now, runRows = [], runLeads = null, cmpDay = null) {
  const fullOf = d => runRows.find(r => r.day === d) ?? historyDay(client, d);
  // a run day without its leads (an older report) falls back to the hourly curve
  const peopleOf = d => (runRows.some(r => r.day === d) ? runLeads && runLeads.filter(l => dayKey(l.createdAt) === d) : historyLeads(client, d));
  const day = dayKey(now), weekAgo = cmpDay ?? addDays(day, -7);
  const start = Date.parse(`${day}T00:00:00Z`), startBefore = Date.parse(`${weekAgo}T00:00:00Z`), hoursNow = (now - start) / 36e5;
  const full = fullOf(day), before = fullOf(weekAgo), people = peopleOf(day), peopleBefore = peopleOf(weekAgo);
  const totals = soFar(full, people, start, hoursNow);
  // campaigns: today's totals shared out like the full day's campaigns, so they add up exactly
  const fc = full.campaigns || [];
  const split = (f, scale) => (totals[f] && dSum(fc, c => c[f] || 0) ? splitUnits(totals[f], fc.map(c => c[f] || 0), scale) : fc.map(() => 0));
  const cs = Object.fromEntries(CAMP_FIELDS.map(f => [f, split(f, f === 'spend' ? 100 : 1)]));
  const arrived = people && people.filter(l => Date.parse(l.createdAt) < +now);
  if (arrived) cs.paidLeads = fc.map(c => arrived.filter(l => l.source === c.name).length);
  return {
    day, asOf: new Date(now).toISOString(), share: shareBy(hoursNow), leads: arrived ?? [],
    totals, hours: hoursUpTo(full, people, start, hoursNow),
    campaigns: fc.map((c, i) => ({ name: c.name, spend: cs.spend[i], impressions: cs.impressions[i], clicks: cs.clicks[i], paidLeads: cs.paidLeads[i] })),
    before: { day: weekAgo, totals: soFar(before, peopleBefore, startBefore, hoursNow), hours: hoursUpTo(before, peopleBefore, startBefore, hoursNow) },
  };
}

// What one client's period adds up to: the current one so far (back = 0) or a whole earlier one, and what it is
// compared with. Totals come from days (the run's real days plus made-up history). Today counts up to now, or on a
// run day up to the run's latest data (run.asOf): after a run nothing more arrives on its own.
// run: the report's { days, leadList, light, asOf }. The dashboard and the server's AI summary both use this.
export function periodFigures(client, run, period, now, back = 0, dayVs = 'week') {
  const runRows = run.days ?? [], today = dayKey(now);
  const r = periodRange(period, today, back);
  // Day is compared with the same weekday a week before (weekends are quieter), or with the day before if asked
  if (period === 'day' && dayVs === 'prev') r.cmp = { from: addDays(r.from, -1), to: addDays(r.from, -1) };
  const runToday = runRows.find(d => d.day === today);
  const asOf = new Date(runToday && run.asOf ? Math.min(+now, Date.parse(run.asOf)) : +now);
  const live = r.current ? liveToday(client, asOf, runRows, run.leadList, r.cmp.to) : null;
  // today's account and Meta problems count once the day is over, except on a run day: the run has already read them
  const todayRow = live && { day: today, ...live.totals, campaigns: live.campaigns, simulated: !runToday, partial: true,
    spendGap: runToday?.spendGap ?? 0, metaMissed: runToday?.metaMissed ?? 0, metaRejected: runToday?.metaRejected ?? 0 };
  const whole = (from, to) => daySeries(client, from, r.current ? addDays(to, -1) : to, runRows);
  const days = [...whole(r.from, r.to), ...(live ? [todayRow] : [])];
  const cmpDays = [...whole(r.cmp.from, r.cmp.to), ...(live ? [{ day: r.cmp.to, ...live.before.totals }] : [])];
  const kpis = kpisFromTotals(client, sumDays(days)), before = kpisFromTotals(client, sumDays(cmpDays));
  const leads = periodLeads(client, r.from, r.to, runRows, run.leadList).filter(l => Date.parse(l.createdAt) < +asOf);
  // data health: the run's own checks, run again on this period's leads and days
  const warnings = periodChecks(client, leads, days), fromRun = days.some(d => !d.simulated);
  return { ...r, asOf: asOf.toISOString(), cut: +asOf < +now, live, days, cmpDays, kpis, before, changes: pctChanges(kpis, before),
    campaigns: sumCampaigns(days, client), leads,
    health: { light: fromRun && run.light === 'red' ? 'red' : warnings.length ? 'orange' : 'green', warnings, fromRun } };
}
