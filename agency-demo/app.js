// Agency report demo page: starts a run on the live n8n server and shows the report.
// Pure helpers (fmt, stageText, caughtSummary, dashboardView, noticeText) are exported for the tests; boot() wires the DOM.
import { makeRng } from './lib/rng.js';
import { PROBLEMS } from './lib/scenario.js';
import { generateLeads } from './lib/leads.js';
import { buildMetaEvents } from './lib/meta.js';
import { buildAiInput, pctChanges } from './lib/ai.js';
import { alertText } from './lib/report.js';
import { chart } from './charts.js';
import { dayKey, addDays, daySeries, sumDays, sumCampaigns, kpisFromTotals, periodRange, liveToday, periodLeads } from './lib/daily.js';

const API = 'https://agency-report-demo.onrender.com/webhook/demo';
const FIRST_CALL_MS = 8000, WAKE_RETRY_MS = 5000, WAKE_MAX_MS = 120000, POLL_MS = 1500, RUN_MAX_MS = 180000;

export const PROBLEM_TEXT = {
  missing_source: ['Leads with no source', 'The CRM lost which ad brought them'],
  duplicates: ['Duplicate leads', 'Same person, phone or email written differently'],
  meta_mismatch: ['Meta and CRM don’t match', 'Some conversions never reach Meta'],
  bad_totals: ['Totals that don’t add up', 'Account total ≠ sum of its campaigns'],
  edge_cases: ['Edge cases', 'Empty week, cancelled booking, huge order, Arabic and emoji names, an event Meta rejects'],
  ai_broken: ['AI gives a broken answer', 'Refusal, typed number, missing field: the template takes over'],
};
const WARNING_FROM = { missing_source: 'missing_source', duplicates: 'duplicates', meta_mismatch: 'meta_mismatch', bad_totals: 'bad_totals', outlier: 'edge_cases', meta_rejected: 'edge_cases' };
const STEPS = [['ghl', 'GoHighLevel leads'], ['spend', 'Ad spend'], ['meta', 'Meta conversions'], ['checks', 'Data checks'], ['ai', 'AI summary']];
// for the "How it works" popup
const STEP_INFO = {
  ghl: 'The made-up leads and deals are saved in a GoHighLevel sandbox (one sub-account per client), then read back the way a real client’s report would read them.',
  spend: 'The week’s ad spend, impressions and clicks per campaign. Simulated: real numbers only exist when real ads run.',
  meta: 'Bookings and orders are sent to Meta’s Conversions API, with personal fields SHA-256 hashed.',
  checks: 'Plain code checks the data: duplicates, missing sources, totals that don’t add up, Meta and CRM not matching, unusual orders, events Meta rejects.',
  ai: 'Gemini writes the summary with placeholders instead of numbers; code fills in every figure. A broken answer is refused and a template is used.',
};

const usd = n => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fmt = (v, type) => typeof v !== 'number' || !Number.isFinite(v) ? '—'
  : type === 'usd' ? usd(v) : type === 'pct' ? `${Math.round(v * 1000) / 10}%` : type === 'x' ? `${v}×` : type === 'n' ? v.toLocaleString('en-US') : String(v);

const sum = (xs, f) => xs.reduce((a, x) => a + (f(x) || 0), 0);

// ---------- toolbar ----------
const RUNNING_TEXT = { ghl: 'Saving the leads in GoHighLevel', spend: 'Adding up the ad spend', meta: 'Sending conversions to Meta', checks: 'Checking the data', ai: 'Gemini is writing the summary' };
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// The toolbar's one-line status: only the current stage while running, a summary when done.
export function stageText(steps = [], runStatus, report, secs) {
  if (!runStatus) return { cls: '', text: 'Pick the test data and press Run' };
  const byKey = Object.fromEntries(steps.map(s => [s.key, s]));
  if (runStatus === 'running') {
    const found = STEPS.findIndex(([key]) => byKey[key]?.status === 'running' || !byKey[key] || byKey[key].status === 'pending');
    const i = found < 0 ? STEPS.length - 1 : found; // every step done: the report is being saved
    return { cls: 'running', text: `${RUNNING_TEXT[STEPS[i][0]]}… (${i + 1} of ${STEPS.length})${secs ? ` · ${secs} s` : ''}` };
  }
  if (runStatus === 'failed') {
    const at = STEPS.find(([key]) => ['running', 'pending', 'failed'].includes(byKey[key]?.status ?? 'pending'));
    return { cls: 'failed', text: `The run hit an error and stopped at: ${at ? at[1] : 'the end'}` };
  }
  const failed = STEPS.find(([key]) => byKey[key]?.status === 'failed');
  if (failed) return { cls: 'failed', text: `Done, but a step failed: ${failed[1]}${byKey[failed[0]].reason ? ` (${byKey[failed[0]].reason})` : ''}` };
  const took = secs ? ` in ${secs} s` : '';
  // when the visitor broke the data on purpose, say how much of it the checks caught
  const applied = (report?.injected ?? []).filter(i => i.caught !== null);
  if (applied.length) {
    const caught = applied.filter(i => i.caught).length;
    return { cls: caught === applied.length ? 'done' : 'failed', text: `✓ Done${took} · ${caught} of ${plural(applied.length, 'mistake')} caught` };
  }
  const n = sum(report?.clients ?? [], c => c.warnings?.length);
  return n ? { cls: 'warn', text: `✓ Done${took} · ${plural(n, 'warning')}` } : { cls: 'done', text: `✓ Done${took} · all checks passed` };
}

// The result strip: did the checks catch what the visitor broke? null when nothing was broken.
export function caughtSummary(injected = []) {
  if (!injected.length) return null;
  const caught = injected.filter(i => i.caught === true).length, missed = injected.filter(i => i.caught === false).length;
  const head = `You broke ${plural(injected.length, 'thing')}: `;
  if (missed) return { cls: 'no', text: `${head}${caught} caught, ${missed} missed` };
  if (!caught) return { cls: 'na', text: `${head}${injected.length === 1 ? 'it didn’t apply' : 'none of them applied'} this run` };
  if (caught < injected.length) return { cls: 'yes', text: `${head}all that applied were caught ✓` };
  return { cls: 'yes', text: `${head}${injected.length === 1 ? 'caught' : injected.length === 2 ? 'both caught' : 'all caught'} ✓` };
}

// ---------- dashboard ----------
// [kpi key, label, format]. Cards are the six big numbers; extras are every other number, so none disappear.
const DASH = {
  clinic: {
    cards: [['spend', 'Ad spend', 'usd'], ['costPerClick', 'Cost per click', 'usd'], ['leads', 'Leads', 'n'], ['costPerLead', 'Cost per paid lead', 'usd'], ['bookings', 'Booked consultations', 'n'], ['bookingRate', 'Lead-to-booking rate', 'pct']],
    extras: [['paidLeads', 'Paid leads', 'n'], ['costPerBooking', 'Cost per booking', 'usd'], ['cancelled', 'Cancelled', 'n']],
    last: ['bookings', 'Booked consultations'],
  },
  store: {
    cards: [['spend', 'Ad spend', 'usd'], ['costPerClick', 'Cost per click', 'usd'], ['leads', 'Leads', 'n'], ['costPerOrder', 'Cost per order', 'usd'], ['revenue', 'Revenue', 'usd'], ['roas', 'Return on ad spend', 'x']],
    extras: [['orders', 'Orders', 'n'], ['avgOrderValue', 'Average order', 'usd'], ['paidLeads', 'Paid leads', 'n'], ['cancelled', 'Refunded', 'n']],
    last: ['orders', 'Orders'],
  },
};
// +1: more is better, -1: less is better, 0: neither (spend)
const SENSE = { spend: 0, costPerClick: -1, costPerLead: -1, costPerBooking: -1, costPerOrder: -1, cancelled: -1 };
const SIMULATED = ['spend', 'costPerClick'];

export function dashboardView(c) {
  const d = DASH[c.client] ?? DASH.clinic;
  const k = c.kpis ?? {};
  const cards = d.cards.map(([key, label, type]) => {
    const ch = c.changes?.[key] ?? null;
    const sense = SENSE[key] ?? 1;
    const tone = !ch || !sense ? 'neutral' : (ch > 0) === (sense > 0) ? 'good' : 'bad';
    // a percentage can't be worked out from 0, but the earlier figure exists: say so
    const was = c.before?.[key];
    const change = ch !== null ? `${ch > 0 ? '▲ ' : ch < 0 ? '▼ ' : ''}${Math.abs(ch)}%` : typeof was === 'number' && Number.isFinite(was) ? `was ${fmt(was, type)}` : null;
    return { key, label, value: fmt(k[key], type), change, tone, simulated: SIMULATED.includes(key) };
  });
  const steps = [['impressions', 'Impressions'], ['clicks', 'Clicks'], ['leads', 'Leads'], d.last];
  const funnel = steps.map(([key, label], i) => {
    const prev = i ? k[steps[i - 1][0]] : null;
    // clicks → leads counts paid leads only: organic leads never clicked an ad
    const top = key === 'leads' ? k.paidLeads : k[key];
    const ok = typeof top === 'number' && typeof prev === 'number' && prev > 0;
    return { label, value: fmt(k[key], 'n'), rate: i === 0 ? null : ok ? fmt(top / prev, 'pct') : '—', simulated: i < 2 };
  });
  const camps = c.campaigns ?? [];
  const maxSpend = Math.max(0, ...camps.map(x => x.spend || 0)), maxLeads = Math.max(0, ...camps.map(x => x.paidLeads || 0));
  const share = (v, max) => (max ? Math.round(((v || 0) / max) * 100) : 0);
  // the paid-leads card counts leads whose source the CRM lost; no campaign bar can hold them
  const inBars = camps.reduce((a, x) => a + (x.paidLeads || 0), 0);
  const unsourced = camps.length && typeof k.paidLeads === 'number' ? Math.max(0, k.paidLeads - inBars) : 0;
  return {
    cards,
    extras: d.extras.map(([key, label, type]) => ({ label, value: fmt(k[key], type) })),
    funnel,
    unsourced,
    campaigns: camps.map(x => ({ name: x.name, spend: fmt(x.spend, 'usd'), leads: fmt(x.paidLeads, 'n'), spendPct: share(x.spend, maxSpend), leadsPct: share(x.paidLeads, maxLeads),
      cpl: x.paidLeads ? fmt(x.spend / x.paidLeads, 'usd') : '—' })),
    ai: { headline: c.summary?.headline ?? '', summary: c.summary?.summary ?? '', nextSteps: c.summary?.next_steps ?? [] },
    light: c.light,
    warnings: c.warnings ?? [],
  };
}

// ---------- periods ----------
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const parts = key => { const [y, m, d] = key.split('-').map(Number); return { y, m, d }; };

// "20 Oct 2026", "1–20 Oct 2026", "1 Jan – 20 Oct 2026", "29 Dec 2025 – 4 Jan 2026"
export function rangeText(from, to) {
  const a = parts(from), b = parts(to);
  if (from === to) return `${b.d} ${MONTHS[b.m - 1]} ${b.y}`;
  if (a.y === b.y && a.m === b.m) return `${a.d}–${b.d} ${MONTHS[b.m - 1]} ${b.y}`;
  if (a.y === b.y) return `${a.d} ${MONTHS[a.m - 1]} – ${b.d} ${MONTHS[b.m - 1]} ${b.y}`;
  return `${a.d} ${MONTHS[a.m - 1]} ${a.y} – ${b.d} ${MONTHS[b.m - 1]} ${b.y}`;
}

// What the dashboard shows for one client and one period. Week is the run's report; day, month and year
// are added up from daily totals (the run's real days plus made-up history); live is today so far.
export function periodView(report, c, period, today, now = new Date(), dayVs = 'week') {
  const weekStart = dayKey(report.weekStart);
  const runRows = c.days ?? [];
  const kpisOf = rows => kpisFromTotals(c.client, sumDays(rows));
  if (period === 'week') {
    // reports saved before the leads list existed were compared with the previous run, newer ones with the week before
    const vs = c.leadList ? 'the previous week (made-up history)' : 'the previous report';
    const odd = report.injected?.length ? ' · mistakes you chose are in this week’s data, so some changes look extreme' : '';
    const to = addDays(weekStart, 6);
    return { kpis: c.kpis, changes: c.changes, before: c.previousKpis ?? null, rows: runRows, campaigns: c.campaigns ?? [], report: true, to,
      leads: c.leadList ?? null, leadsTitle: 'Leads this week', budget: budgetFor(c.client, 'week', to),
      note: `Week of ${rangeText(weekStart, weekStart)} (last full Monday to Sunday) · compared with ${vs}${odd}` };
  }
  if (period === 'live') {
    const live = liveToday(c.client, now, runRows, c.leadList);
    const asOf = new Date(now).toISOString().slice(11, 16);
    const kpis = kpisFromTotals(c.client, { ...live.totals, days: 1 });
    const before = kpisFromTotals(c.client, { ...live.lastWeek.totals, days: 1 });
    const weekday = WEEKDAYS[new Date(`${live.day}T00:00:00Z`).getUTCDay()];
    return { kpis, changes: pctChanges(kpis, before), before, rows: [], campaigns: live.campaigns, report: false, live,
      leads: live.leads, leadsTitle: 'Leads today so far', budget: budgetFor(c.client, 'live', live.day, live.share),
      note: `Today so far, as of ${asOf} UTC · provisional until the day closes · compared with the same time last ${weekday} · made-up live feed` };
  }
  const r = periodRange(period, today, weekStart);
  // Day is compared with the same weekday a week before (weekends are quieter), or with the day before if asked
  let cmpText = rangeText(r.cmp.from, r.cmp.to);
  if (period === 'day') {
    if (dayVs === 'prev') r.cmp = { from: addDays(r.to, -1), to: addDays(r.to, -1) };
    const p = parts(r.cmp.from);
    cmpText = `${WEEKDAYS[new Date(`${r.cmp.from}T00:00:00Z`).getUTCDay()]} ${p.d} ${MONTHS[p.m - 1]} (${dayVs === 'prev' ? 'the day before' : 'same day last week'})`;
  }
  const rows = daySeries(c.client, period === 'day' ? addDays(r.to, -13) : r.from, r.to, runRows);
  const inPeriodRows = rows.filter(d => d.day >= r.from);
  const cmpRows = daySeries(c.client, r.cmp.from, r.cmp.to, runRows);
  const kpis = kpisOf(inPeriodRows), before = kpisOf(cmpRows);
  const madeUp = !c.days ? ' · all days are made-up history (this report has no daily figures)'
    : [...rows, ...cmpRows].some(d => d.simulated) ? ' · days outside the run’s week are made-up history' : '';
  return { kpis, changes: pctChanges(kpis, before), before, rows, campaigns: sumCampaigns(inPeriodRows, c.client), report: false, to: r.to, highlight: period === 'day' ? r.to : undefined,
    leads: periodLeads(c.client, r.from, r.to, runRows, c.leadList), budget: budgetFor(c.client, period, r.to),
    leadsTitle: period === 'day' ? `Leads on ${rangeText(r.from, r.to)}` : `Leads this ${period}`,
    note: `${rangeText(r.from, r.to)} · compared with ${cmpText}${madeUp}` };
}

const ordinal = n => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

// Chart points: one per day, or one per month for the year.
export function chartPoints(rows, period) {
  const groups = new Map();
  for (const d of rows) {
    const key = period === 'year' ? d.day.slice(0, 7) : d.day;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(d);
  }
  return [...groups].map(([key, ds]) => {
    const t = sumDays(ds), p = parts(period === 'year' ? `${key}-01` : key);
    // a month that isn't over yet says so, so its lower total doesn't read as a drop
    const lastDay = new Date(Date.UTC(p.y, p.m, 0)).getUTCDate(), upto = parts(ds.at(-1).day).d;
    const monthLabel = upto < lastDay ? `${MONTHS[p.m - 1]} (to ${ordinal(upto)})` : MONTHS[p.m - 1];
    return { key, label: period === 'year' ? monthLabel : `${p.d} ${MONTHS[p.m - 1]}`, spend: t.spend, revenue: t.revenue, leads: t.leads, clicks: t.clicks,
      cpc: t.clicks ? Math.round((t.spend / t.clicks) * 100) / 100 : null };
  });
}

// ---------- leads table, CSV, address ----------
const STATUS = { clinic: { converted: 'Booked', cancelled: 'Cancelled', open: 'Open' }, store: { converted: 'Ordered', cancelled: 'Refunded', open: 'Open' } };

// Lead times in UTC, like the week's days, so a lead never seems to fall outside its week.
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function utcTime(iso) {
  const d = new Date(iso), p = parts(dayKey(d));
  return `${DOW[d.getUTCDay()]} ${p.d} ${MONTHS[p.m - 1]}, ${d.toISOString().slice(11, 16)}`;
}

export function leadsView(list, client) {
  return (list ?? []).map(l => ({
    date: utcTime(l.createdAt),
    name: l.name,
    source: l.source === 'organic' ? 'Organic (not from an ad)' : l.source ?? 'No source recorded',
    status: STATUS[client]?.[l.outcome] ?? l.outcome,
    value: l.outcome === 'open' || !l.value ? '—' : fmt(l.value, 'usd'),
    counted: l.outcome !== 'cancelled', // a cancelled booking or refunded order isn't in the results
    duplicate: Boolean(l.duplicate), outcome: l.outcome,
  }));
}

// Budget pacing (made-up monthly budgets): how much is spent against how much should be by now.
// A day gets a 365th of the year's budget, a week seven days' worth, the year twelve months.
export const BUDGETS = { clinic: 800, store: 700 };
const BUDGET_WORD = { day: 'Daily', week: 'Weekly', month: 'Monthly', year: 'Yearly', live: 'Daily' };
export function budgetFor(client, period, to, liveShare = 1) {
  const month = BUDGETS[client], daily = (month * 12) / 365, p = parts(to);
  const cents = n => Math.round(n * 100) / 100, word = BUDGET_WORD[period];
  if (period === 'month') {
    const days = new Date(Date.UTC(p.y, p.m, 0)).getUTCDate();
    return { amount: month, word, expectedPct: Math.round((p.d / days) * 100), due: 'of the month gone' };
  }
  if (period === 'year') {
    const day = (Date.parse(`${to}T00:00:00Z`) - Date.UTC(p.y, 0, 1)) / 864e5 + 1, days = p.y % 4 ? 365 : 366;
    return { amount: month * 12, word, expectedPct: Math.round((day / days) * 100), due: 'of the year gone' };
  }
  // live: spend follows the day's usual hours, so "by now" is the share a usual day has spent by this time
  if (period === 'live') return { amount: cents(daily), word, expectedPct: Math.round(liveShare * 100), due: 'of a usual day’s spend due by now' };
  return { amount: cents(period === 'week' ? daily * 7 : daily), word, expectedPct: 100, due: null };
}
export function pacing(spend, b) {
  const pct = Math.round((spend / b.amount) * 100);
  const status = pct > b.expectedPct + 10 ? 'over' : pct < b.expectedPct - 10 ? 'under' : 'on track';
  const budget = fmt(b.amount, 'usd');
  return { spent: fmt(spend, 'usd'), budget, pct, expectedPct: b.expectedPct, status,
    text: `${pct}% of the ${budget} ${b.word.toLowerCase()} budget spent${b.due ? `, ${b.expectedPct}% ${b.due}` : ''}` };
}

const SLUGS = { clinic: 'lumiere-skin-clinic', store: 'northwind-home' };
export const csvName = (client, period, today) => period === 'day'
  ? `${SLUGS[client]}-last-14-days-to-${addDays(today, -1)}.csv` : `${SLUGS[client]}-${period}-${today}.csv`;

// One line per day (or per hour for Live). Plain numbers, so it opens cleanly in a spreadsheet.
export function csvFor(rows, client) {
  const conv = client === 'clinic' ? ['booked consultations', 'cancelled', 'booking value'] : ['orders', 'refunded', 'revenue'];
  const hourly = rows[0]?.hour !== undefined;
  const head = [hourly ? 'hour (UTC)' : 'date', 'leads', 'paid leads', ...conv, 'ad spend', 'impressions', 'clicks', 'cost per click', ...(hourly ? [] : ['made-up day'])];
  const lines = rows.map(r => [
    hourly ? `${String(r.hour).padStart(2, '0')}:00` : r.day, r.leads, r.paidLeads, r.conversions, r.cancelled, (r.revenue || 0).toFixed(2), (r.spend || 0).toFixed(2),
    r.impressions, r.clicks, r.clicks ? (r.spend / r.clicks).toFixed(2) : '', ...(hourly ? [] : [r.simulated ? 'yes' : 'no']),
  ].join(','));
  return [head.join(','), ...lines].join('\n') + '\n';
}

const HASH_CLIENTS = ['clinic', 'store'], HASH_PERIODS = ['day', 'week', 'month', 'year', 'live'];
export function parseHash(hash) {
  const q = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  const client = q.get('client'), period = q.get('period');
  return { client: HASH_CLIENTS.includes(client) ? client : null, period: HASH_PERIODS.includes(period) ? period : null };
}
export const hashFor = (client, period) => `#client=${client}&period=${period}`;

export function noticeText(kind, info = {}) {
  if (kind === 'waking') return 'Waking up the demo server. It sleeps when nobody uses it, so this can take up to a minute…';
  if (kind === 'unavailable') return 'The demo server isn’t answering right now. Please try again later.' + (info.hasReport ? ' The last report is shown below.' : '');
  if (kind === 'joined') return 'Someone else’s run was already going, so you’re watching that one. Its test data was their choice.';
  if (kind === 'failed') return 'The run is taking much longer than usual, so the page stopped waiting. Please try again later.';
  if (kind === 'limit') {
    if (info.reason === 'daily') return `The demo’s daily limit is reached. Please try again in about ${Math.max(1, Math.ceil((info.retryAfterSec || 0) / 3600))} hour(s).`;
    return `Someone ran the report less than a minute ago. Please try again in ${Math.max(1, info.retryAfterSec || 0)} seconds.`;
  }
  return '';
}

// ---------- DOM ----------
// ponytail: tiny element builder; text always goes in as textContent, never as HTML
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) k === 'class' ? (el.className = v) : el.setAttribute(k, v);
  el.append(...kids.flat().filter(k => k != null && k !== false));
  return el;
}
const $ = s => document.querySelector(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function call(path, opts = {}, ms = FIRST_CALL_MS) {
  const r = await fetch(API + path, { ...opts, signal: AbortSignal.timeout(ms) });
  return { status: r.status, body: await r.json().catch(() => null) };
}

// The toolbar's status line shows either the run's stage or a notice (waking, limit, error).
function setStage({ cls, text }) {
  const el = $('#stage');
  el.className = `stage ${cls}`;
  el.querySelector('span').textContent = text;
}
function notice(kind, info) {
  if (kind) setStage({ cls: kind === 'waking' || kind === 'joined' ? 'running' : 'failed', text: noticeText(kind, info) });
}
function showStage(steps, runStatus, report, secs) {
  setStage(stageText(steps, runStatus, report, secs));
}

const LIGHT_TEXT = { green: 'All checks passed', orange: 'Check the warnings', red: 'A step failed' };

// One client's dashboard body for one period: cards, funnel, campaigns or chart, more charts, AI box, data health.
const COLORS = { blue: '#2a78d6', orange: '#eb6834' }; // validated pair (dataviz reference palette, light)
const money0 = v => (v >= 1000 ? `$${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : v < 10 && v % 1 ? `$${v.toFixed(2)}` : `$${Math.round(v)}`);
const money2 = v => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function chartsFor(c, pv, period) {
  const valueLabel = c.client === 'clinic' ? 'Booking value' : 'Revenue';
  if (period === 'live') {
    // cumulative through the day, against the same hours a week ago
    const cumul = hrs => { let l = 0, s = 0, k = 0; return hrs.map(hr => ({ leads: (l += hr.leads), spend: Math.round((s += hr.spend) * 100) / 100, clicks: (k += hr.clicks) })); };
    const now = cumul(pv.live.hours), before = cumul(pv.live.lastWeek.hours);
    const pts = pv.live.hours.map((hr, i) => ({ key: String(hr.hour), label: `${String(hr.hour).padStart(2, '0')}:00`,
      leads: now[i].leads, spend: now[i].spend, clicks: now[i].clicks, leadsLw: before[i]?.leads, spendLw: before[i]?.spend, clicksLw: before[i]?.clicks }));
    const two = (key, label) => [{ key, label: `${label} today`, color: COLORS.blue }, { key: `${key}Lw`, label: 'Same time last week', color: COLORS.orange }];
    return [
      chart({ title: 'Leads so far today (UTC hours)', points: pts, whole: true, series: two('leads', 'Leads'), fmt: v => String(Math.round(v)) }),
      chart({ title: 'Ad spend so far today (simulated)', points: pts, series: two('spend', 'Ad spend'), fmt: money0, tipFmt: money2 }),
      chart({ title: 'Clicks so far today (simulated)', points: pts, whole: true, series: two('clicks', 'Clicks'), fmt: v => String(Math.round(v)) }),
    ];
  }
  const pts = chartPoints(pv.rows, period);
  const hl = pv.highlight;
  const by = period === 'year' ? 'per month' : 'per day';
  return [
    chart({ title: `Ad spend and ${valueLabel.toLowerCase()} ${by}`, points: pts, highlight: hl, fmt: money0, tipFmt: money2,
      series: [{ key: 'spend', label: 'Ad spend (simulated)', color: COLORS.blue }, { key: 'revenue', label: valueLabel, color: COLORS.orange }],
      empty: 'This older report has no daily figures. Run the report to see them.' }),
    chart({ title: `Leads ${by}`, points: pts, kind: 'bar', highlight: hl, whole: true, fmt: v => String(Math.round(v)),
      series: [{ key: 'leads', label: 'Leads', color: COLORS.blue }], empty: 'This older report has no daily figures. Run the report to see them.' }),
    chart({ title: `Cost per click ${by} (simulated)`, points: pts, highlight: hl, fmt: money2,
      series: [{ key: 'cpc', label: 'Cost per click', color: COLORS.blue }], empty: 'This older report has no daily figures. Run the report to see them.' }),
  ];
}

function dashBody(c, problems, pv, period) {
  // every period has cards, funnel, campaigns and charts; the week adds the AI summary, data checks and leads
  const v = dashboardView({ ...c, kpis: pv.kpis, changes: pv.changes, before: pv.before, campaigns: pv.campaigns });
  const sim = h('small', { class: 'sim' }, 'simulated');
  const rateText = [null, 'of impressions generated clicks', 'of clicks became paid leads', c.client === 'clinic' ? 'of leads booked a consultation' : 'of leads placed an order'];
  const funnel = h('div', { class: 'dbox' }, h('h4', {}, 'Funnel'),
    h('ol', { class: 'funnel' }, v.funnel.map((f, i) => h('li', { style: `--w:${100 - i * 16}%` },
      // with no rate (nothing to divide by) the line stays, empty, so the steps keep their spacing
      i ? h('small', f.rate && f.rate !== '—' ? {} : { 'aria-hidden': 'true' }, f.rate && f.rate !== '—' ? `${f.rate} ${rateText[i]}` : ' ') : null,
      h('div', {}, h('b', {}, f.value), ` ${f.label}`, f.simulated ? sim.cloneNode(true) : null)))));
  const campaigns = h('div', { class: 'dbox' }, h('h4', {}, 'Campaigns: spend and paid leads', h('small', { class: 'sim' }, 'spend simulated')),
    v.campaigns.length ? h('ul', { class: 'camps' }, v.campaigns.map(x => h('li', {},
      h('span', { class: 'cname' }, x.name),
      h('div', { class: 'cbar spend' }, h('i', { style: `width:${x.spendPct * 0.7}%` }), h('small', {}, x.spend)),
      h('div', { class: 'cbar leads' }, h('i', { style: `width:${x.leadsPct * 0.7}%` }), h('small', {}, `${x.leads} paid ${x.leads === '1' ? 'lead' : 'leads'} · ${x.cpl} each`)))))
      : h('p', { class: 'hint' }, 'This older report has no campaign breakdown. Run the report to see it.'),
    v.unsourced ? h('p', { class: 'hint' }, `${v.unsourced} paid ${v.unsourced === 1 ? 'lead has' : 'leads have'} no recorded source, so ${v.unsourced === 1 ? 'it isn’t' : 'they aren’t'} in any campaign.`) : null);

  // download what's on screen, one line per day (per hour for Live)
  const csvRows = period === 'live' ? pv.live.hours : pv.rows;
  const csvBtn = h('button', { type: 'button', class: 'csv' }, '⭳ Download CSV');
  csvBtn.disabled = !csvRows.length;
  csvBtn.addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([csvFor(csvRows, c.client)], { type: 'text/csv' }));
    const a = h('a', { href: url, download: csvName(c.client, period, dayKey(Date.now())) });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  const out = [
    h('div', { class: 'pbar' }, h('p', { class: 'pnote' }, pv.note), csvBtn),
    h('div', { class: 'dcards' }, v.cards.map((x, i) => h('div', { class: `dcard c${i}` },
      h('span', {}, x.label), h('b', {}, x.value),
      h('div', { class: 'dmeta' }, h('em', { class: x.tone }, x.change ?? 'no earlier figure'), x.simulated ? sim.cloneNode(true) : null)))),
    h('p', { class: 'extras' }, v.extras.map(e => h('span', {}, `${e.label}: `, h('b', {}, e.value)))),
    pacingBox(pv),
    h('div', { class: 'drow' }, funnel, campaigns),
    h('div', { class: 'charts' }, chartsFor(c, pv, period).map(ch => h('div', { class: 'dbox' }, ch))),
  ];
  if (pv.report) {
    out.push(h('div', { class: 'drow' },
      h('div', { class: 'dbox ai' }, h('h4', {}, 'What happened this week'),
        v.ai.headline ? h('p', { class: 'headline' }, v.ai.headline) : null,
        v.ai.summary ? h('p', {}, v.ai.summary) : null,
        v.ai.nextSteps.length ? [h('h4', {}, 'Next steps'), h('ul', {}, v.ai.nextSteps.map(n => h('li', {}, n)))] : null),
      h('div', { class: 'dbox' }, h('h4', {}, 'Data health'),
        h('span', { class: `light ${v.light}` }, h('i'), LIGHT_TEXT[v.light] ?? ''),
        v.warnings.length ? h('ul', {}, v.warnings.map(w => h('li', {}, w.message,
          problems.includes(WARNING_FROM[w.code]) ? [' ', h('small', {}, `← ${PROBLEM_TEXT[WARNING_FROM[w.code]][0]}`)] : null))) : null)));
  } else {
    out.push(h('p', { class: 'hint pfoot' }, 'The AI summary and the data checks cover the run’s week: switch to Week to see them.'));
  }
  out.push(leadsTable(c, pv));
  // replaceChildren would print a null as the text "null"
  return out.filter(Boolean);
}

// Spend against the client's budget for the period (made-up budgets), and where it should be by now.
function pacingBox(pv) {
  const p = pacing(pv.kpis.spend ?? 0, pv.budget);
  const word = { over: 'Spending faster than planned', under: 'Spending slower than planned', 'on track': 'On track' }[p.status];
  const by = pv.budget.due ? ` with ${p.expectedPct}% ${pv.budget.due}. The line marks where spend should be by now.` : '. The line marks the full budget.';
  return h('div', { class: `dbox pacing ${p.status.replace(' ', '-')}` },
    h('div', { class: 'pace-head' }, h('h4', {}, `${pv.budget.word} budget`, h('small', { class: 'sim' }, 'made-up budget')), h('span', { class: 'pace-tag' }, word)),
    h('div', { class: 'pace-bar', role: 'img', 'aria-label': p.text }, h('i', { style: `width:${Math.min(100, p.pct)}%` }), h('b', { style: `left:${Math.min(100, p.expectedPct)}%` })),
    h('p', { class: 'hint' }, `${p.spent} of ${p.budget} spent: ${p.pct}% of the budget${by}`));
}

// The period's leads: the 10 newest, with a button for the rest.
const LEADS_SHOWN = 10;
function leadsTable(c, pv) {
  const rows = leadsView(pv.leads, c.client);
  const box = h('div', { class: 'dbox leads-box' }, h('h4', {}, `${pv.leadsTitle} (${rows.length})`,
    h('small', { class: 'sim' }, 'made-up people')));
  if (!pv.leads) { box.append(h('p', { class: 'hint' }, 'This older report has no list of leads. Run the report to see it.')); return box; }
  if (!rows.length) { box.append(h('p', { class: 'hint' }, pv.live ? 'No leads yet today.' : 'No leads in this period.')); return box; }
  const tbody = h('tbody');
  const fill = all => tbody.replaceChildren(...rows.slice(0, all ? rows.length : LEADS_SHOWN).map(r => h('tr', {},
    h('td', {}, r.date), h('td', {}, r.name, r.duplicate ? h('small', { class: 'dupe', title: 'Same person, phone or email written differently' }, 'duplicate') : null),
    h('td', { class: r.source === 'No source recorded' ? 'nosrc' : '' }, r.source),
    h('td', {}, h('span', { class: `status ${r.outcome}` }, r.status)),
    h('td', r.counted ? { class: 'num' } : { class: 'num void', title: 'Cancelled or refunded: not counted in the results' }, r.value))));
  fill(false);
  box.append(h('div', { class: 'tablewrap' }, h('table', { class: 'leads' },
    h('thead', {}, h('tr', {}, ...['Date (UTC)', 'Name', 'Campaign', 'Status', 'Value'].map((t, i) => h('th', i === 4 ? { class: 'num' } : {}, t)))), tbody)));
  if (rows.length > LEADS_SHOWN) {
    const more = h('button', { type: 'button', class: 'csv more' }, `Show all ${rows.length}`);
    more.addEventListener('click', () => { fill(true); more.remove(); });
    box.append(more);
  }
  return box;
}

const PERIODS = [['day', 'Day'], ['week', 'Week'], ['month', 'Month'], ['year', 'Year'], ['live', 'Live']];
const LIVE_MS = 30000;
let liveTimer;

function dashboard(report, problems) {
  // aria-live off: the 30 s Live refresh must not make screen readers read the dashboard again
  const body = h('div', { class: 'dbody', 'aria-live': 'off' });
  // the address keeps the client and period, so a refresh or a shared link opens the same view
  const want = parseHash(location.hash);
  const state = { ci: Math.max(0, report.clients.findIndex(c => c.client === want.client)), period: want.period ?? 'week', dayVs: 'week' };
  const tabs = report.clients.map(c => h('button', { type: 'button', role: 'tab' }, h('i', { class: `ldot ${c.light}` }), c.name));
  const pbtns = PERIODS.map(([key, label]) => h('button', { type: 'button', 'data-p': key },
    key === 'live' ? h('i', { class: 'livedot' }) : null, label));
  const draw = () => {
    tabs.forEach((t, j) => t.setAttribute('aria-selected', String(state.ci === j)));
    pbtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.p === state.period)));
    const c = report.clients[state.ci];
    history.replaceState(null, '', hashFor(c.client, state.period));
    const pv = periodView(report, c, state.period, dayKey(Date.now()), new Date(), state.dayVs);
    const view = dashBody(c, problems, pv, state.period);
    // Day only: what yesterday is compared with
    if (state.period === 'day') {
      const pick = h('div', { class: 'vs', role: 'group', 'aria-label': 'Compare with' }, h('span', {}, 'Compare with'),
        [['week', 'Same day last week'], ['prev', 'Day before']].map(([key, label]) => {
          const b = h('button', { type: 'button', 'aria-pressed': String(state.dayVs === key) }, label);
          b.addEventListener('click', () => { state.dayVs = key; draw(); body.querySelector('.vs [aria-pressed="true"]')?.focus(); });
          return b;
        }));
      view[0].querySelector('.pnote').after(pick);
    }
    body.replaceChildren(...view);
    clearInterval(liveTimer);
    // live numbers refresh every 30 s while Live is open
    // (skipped while someone is reading a chart, so focus and tooltips aren't lost)
    if (state.period === 'live') liveTimer = setInterval(() => {
      if (!body.isConnected) return clearInterval(liveTimer);
      if (!body.contains(document.activeElement) && !body.querySelector('.chart-wrap:hover')) draw();
    }, LIVE_MS);
  };
  tabs.forEach((t, i) => t.addEventListener('click', () => { state.ci = i; draw(); }));
  pbtns.forEach(b => b.addEventListener('click', () => { state.period = b.dataset.p; draw(); }));
  // the address edited by hand, or back/forward, moves the dashboard too
  window.onhashchange = () => {
    const h2 = parseHash(location.hash);
    if (h2.client) state.ci = Math.max(0, report.clients.findIndex(c => c.client === h2.client));
    if (h2.period) state.period = h2.period;
    if (body.isConnected) draw();
  };
  draw();
  return h('div', { class: 'dash' }, h('div', { class: 'dhead' },
    h('div', { class: 'dleft' }, h('h3', {}, 'Client dashboard'), h('div', { class: 'periods', role: 'group', 'aria-label': 'Period' }, pbtns)),
    h('div', { role: 'tablist', class: 'dtabs' }, tabs)), body);
}

// The floating Slack button: a red dot and a ping when this run sent an alert, grey when Slack stayed quiet.
function showSlack(alert) {
  const btn = $('#slack');
  btn.hidden = false;
  btn.classList.toggle('quiet', !alert);
  btn.querySelector('.hlabel').textContent = alert ? 'Alert sent to Slack' : 'Slack stayed quiet';
  $('#slack-body').replaceChildren(h('div', {}, alert
    ? [h('p', { class: 'hint' }, 'Posted to the agency’s Slack channel when the report was saved, so a person knows to look:'),
      h('div', { class: 'slack-msg' }, h('b', {}, 'Agency report alerts'), h('span', { class: 'app' }, 'APP'), h('p', {}, alert.replace(':warning:', '⚠️')))]
    : h('p', {}, 'No alert this time: nothing needed a person, so Slack stayed quiet.')));
  if (alert) { btn.classList.add('ping'); setTimeout(() => btn.classList.remove('ping'), 6000); }
}
function slackBox() {
  const btn = $('#slack'), dlg = $('#slackbox');
  btn.addEventListener('click', () => { btn.classList.remove('ping'); dlg.showModal(); });
  dlg.querySelector('.close').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
}

function render(report) {
  const problems = report.injected.map(i => i.problem);
  const week = new Date(report.weekStart).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  // the run's notes live in the "How it works" popup, under "Latest run"
  const cs = caughtSummary(report.injected);
  const run = $('#how-run');
  run.querySelector('div').replaceChildren(h('div', {},
    h('p', {}, h('b', {}, `Week of ${week}`), ` · ${report.overview}`),
    report.aiSource === 'template' ? h('p', { class: 'partial' }, 'The summary was written by the template: the AI’s answer failed the checks, or the AI didn’t answer.') : null,
    report.partial ? h('p', { class: 'partial' }, 'Partial report: a step failed, so part of it was built without that step.') : null,
    cs ? [h('p', { class: `caughtline ${cs.cls}` }, cs.text),
      h('ul', { class: 'caught' }, report.injected.map(i => h('li', {}, h('span', {}, PROBLEM_TEXT[i.problem]?.[0] ?? i.problem),
        i.caught === null ? h('span', { class: 'tag na' }, 'Not applicable: no conversions to hold back')
          : h('span', { class: `tag ${i.caught ? 'yes' : 'no'}` }, i.caught ? 'Caught' : 'Missed'))))]
      : h('p', {}, 'No mistakes were put in the data this run, so every light should be green.')));
  run.hidden = false;

  $('#result').replaceChildren(dashboard(report, problems));
  // the same code and link the server uses for the Slack message, so this is the text that was posted
  showSlack(alertText(report, 'https://ibrahim-jaafar.github.io/agency-demo/'));
  // the server builds the AI input from these same report fields with the same code
  $('#ai-in').textContent = JSON.stringify(buildAiInput(report.clients), null, 2);
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
// One example Meta event from a made-up lead, built by the same code the server runs.
async function showMetaExample() {
  const leads = generateLeads('store', [], makeRng(7), new Date(Date.UTC(2026, 9, 12)));
  const nowSec = Math.floor(Date.now() / 1000);
  const values = new Set();
  buildMetaEvents('store', leads, [], nowSec, v => (values.add(v), ''));
  const hashed = new Map(await Promise.all([...values].map(async v => [v, await sha256Hex(v)])));
  const event = buildMetaEvents('store', leads, [], nowSec, v => hashed.get(v)).events[0];
  $('#meta-out').textContent = JSON.stringify({ data: [event], test_event_code: 'TEST…' }, null, 2);
}

function scenario() {
  const mode = $('#mode').value;
  return { mode, problems: mode === 'custom' ? [...$('#problems').querySelectorAll('input:checked')].map(i => i.value) : [] };
}

// Follow a run until it ends, updating the toolbar's stage on every poll.
async function follow(runId, t0 = Date.now()) {
  while (Date.now() - t0 < RUN_MAX_MS) {
    const s = await call(`/status?run=${encodeURIComponent(runId)}`).then(r => r.body, () => null);
    if (s?.runId === runId) {
      showStage(s.steps, s.status, s.report, Math.round((Date.now() - t0) / 1000));
      if (s.status === 'failed') return;
      if (s.status !== 'running') { if (s.report) render(s.report); return; }
    }
    await sleep(POLL_MS);
  }
  notice('failed');
}

// "How it works": opens by itself on the first visit; afterwards the floating ? button reopens it.
const SEEN_KEY = 'agency-demo-how-seen';
let runWhenReady = false;
function howItWorks() {
  const dlg = $('#how'), help = $('#help');
  $('#how-steps').replaceChildren(...STEPS.map(([key, label]) => h('li', {}, h('b', {}, label), ' ', STEP_INFO[key])));
  $('#how-problems').replaceChildren(...PROBLEMS.map(p => h('li', {}, h('b', {}, PROBLEM_TEXT[p][0]), `: ${PROBLEM_TEXT[p][1]}`)));
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // the ? pings with its label when it appears, then briefly every 25 s until it has been clicked once
  let pingTimer, repeat, clicked = false;
  const ping = ms => { help.classList.add('ping'); clearTimeout(pingTimer); pingTimer = setTimeout(() => help.classList.remove('ping'), ms); };
  const showHelp = () => {
    help.hidden = false;
    ping(6000);
    if (!clicked && !repeat) repeat = setInterval(() => ping(3000), 25000);
  };
  const close = () => {
    if (!dlg.open || dlg.classList.contains('leaving')) return;
    try { localStorage.setItem(SEEN_KEY, '1'); } catch {}
    const done = () => {
      dlg.classList.remove('leaving');
      dlg.close();
      showHelp();
    };
    if (calm) return done();
    dlg.classList.add('leaving'); // shrinks towards the ? button
    setTimeout(done, 350);
  };
  dlg.addEventListener('cancel', e => { e.preventDefault(); close(); });
  dlg.addEventListener('click', e => { if (e.target === dlg) close(); });
  dlg.querySelector('.close').addEventListener('click', close);
  // "Try it" starts a run: now if the server is ready, otherwise as soon as it answers
  $('#how-go').addEventListener('click', () => {
    close();
    const run = $('#run');
    if (!run.disabled) run.click(); else runWhenReady = true;
  });
  help.addEventListener('click', () => {
    clicked = true;
    clearInterval(repeat);
    help.classList.remove('ping');
    dlg.showModal();
    dlg.scrollTop = 0;
  });
  let seen = false;
  try { seen = localStorage.getItem(SEEN_KEY) === '1'; } catch {}
  if (seen) showHelp(); else dlg.showModal();
}

export async function boot() {
  const btn = $('#run'), box = $('#problems'), mode = $('#mode');
  for (const p of PROBLEMS) {
    box.append(h('label', {}, h('input', { type: 'checkbox', value: p }), h('span', {}, PROBLEM_TEXT[p][0], h('small', {}, PROBLEM_TEXT[p][1]))));
  }
  mode.addEventListener('change', () => { box.hidden = mode.value !== 'custom'; });
  showStage([], null, null);
  howItWorks();
  slackBox();
  showMetaExample().catch(console.error);

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Running…';
    try {
      const body = JSON.stringify(scenario());
      // the server is already awake (the page woke it on load), so one call with a long timeout, never a retry that could start a second run
      const r = await call('/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body }, 60000);
      if (r.status === 429) {
        notice('limit', r.body ?? {});
      } else if (r.status !== 200 || !r.body?.runId) {
        notice('unavailable', { hasReport: !!$('#result').children.length });
      } else {
        const t0 = Date.now();
        if (r.body.joined) { notice('joined'); await sleep(2500); }
        showStage([{ key: 'ghl', status: 'running' }], 'running', null);
        await follow(r.body.runId, t0);
      }
    } catch (err) {
      console.error(err);
      notice('unavailable', { hasReport: !!$('#result').children.length });
    } finally {
      btn.disabled = false;
      btn.textContent = 'Run the report';
    }
  });

  // Wake the server and show the latest report. The Run button waits until it answers.
  $('#result').replaceChildren(h('div', { class: 'dash loading' }, h('div', { class: 'spinner', 'aria-hidden': 'true' }),
    h('p', {}, 'Loading the latest report…'), h('p', { class: 'hint' }, 'The demo server sleeps when nobody uses it, so the first visit of the day can take up to a minute.')));
  btn.disabled = true;
  btn.textContent = 'Connecting…';
  const t0 = Date.now();
  for (;;) {
    const r = await call('/status').catch(() => null);
    if (r?.status === 200) {
      showStage(r.body?.steps ?? [], r.body?.report ? r.body.status : null, r.body?.report);
      if (r.body?.report) render(r.body.report);
      else $('#result').replaceChildren(h('div', { class: 'dash loading' }, h('p', {}, 'No report yet. Press Run the report to make the first one.')));
      btn.disabled = false;
      btn.textContent = 'Run the report';
      if (runWhenReady) { runWhenReady = false; btn.click(); }
      return;
    }
    if (Date.now() - t0 > WAKE_MAX_MS) {
      notice('unavailable', {});
      btn.textContent = 'Demo unavailable';
      $('#result').replaceChildren(h('div', { class: 'dash loading' }, h('p', {}, 'The demo server isn’t answering right now, so there is no report to show. Please try again later.')));
      return;
    }
    notice('waking');
    await sleep(WAKE_RETRY_MS);
  }
}

if (typeof document !== 'undefined') boot();
