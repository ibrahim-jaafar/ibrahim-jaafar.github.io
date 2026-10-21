// Agency report demo page: starts a run on the live n8n server and shows the report.
// Pure helpers (fmt, stepView, noticeText) are exported for the tests; boot() wires the DOM.
import { makeRng } from './lib/rng.js';
import { PROBLEMS } from './lib/scenario.js';
import { generateLeads } from './lib/leads.js';
import { buildMetaEvents } from './lib/meta.js';
import { buildAiInput } from './lib/ai.js';
import { alertText } from './lib/report.js';

const API = 'https://agency-report-demo.onrender.com/webhook/demo';
const FIRST_CALL_MS = 8000, WAKE_RETRY_MS = 5000, WAKE_MAX_MS = 120000, POLL_MS = 1500, RUN_MAX_MS = 180000;

const CLIENTS = [
  { client: 'clinic', name: 'Lumière Skin Clinic', kind: 'Medical aesthetics clinic' },
  { client: 'store', name: 'Northwind Home', kind: 'Online home-goods store' },
];
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

const usd = n => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fmt = (v, type) => typeof v !== 'number' || !Number.isFinite(v) ? '—'
  : type === 'usd' ? usd(v) : type === 'pct' ? `${Math.round(v * 1000) / 10}%` : type === 'x' ? `${v}×` : type === 'n' ? v.toLocaleString('en-US') : String(v);

const sum = (xs, f) => xs.reduce((a, x) => a + (f(x) || 0), 0);

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
    const change = ch === null ? null : `${ch > 0 ? '▲ ' : ch < 0 ? '▼ ' : ''}${Math.abs(ch)}%`;
    return { key, label, value: fmt(k[key], type), change, tone, simulated: SIMULATED.includes(key) };
  });
  const steps = [['impressions', 'Impressions'], ['clicks', 'Clicks'], ['leads', 'Leads'], d.last];
  const funnel = steps.map(([key, label], i) => {
    const prev = i ? k[steps[i - 1][0]] : null;
    const ok = typeof k[key] === 'number' && typeof prev === 'number' && prev > 0;
    return { label, value: fmt(k[key], 'n'), rate: i === 0 ? null : ok ? fmt(k[key] / prev, 'pct') : '—', simulated: i < 2 };
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
    campaigns: camps.map(x => ({ name: x.name, spend: fmt(x.spend, 'usd'), leads: fmt(x.paidLeads, 'n'), spendPct: share(x.spend, maxSpend), leadsPct: share(x.paidLeads, maxLeads) })),
    ai: { headline: c.summary?.headline ?? '', summary: c.summary?.summary ?? '', nextSteps: c.summary?.next_steps ?? [] },
    light: c.light,
    warnings: c.warnings ?? [],
  };
}

// What each step chip shows. A failed run never finishes its open steps, so they read "Stopped".
export function stepView(steps = [], runStatus, report) {
  const byKey = Object.fromEntries(steps.map(s => [s.key, s]));
  const clients = report?.clients ?? [];
  const nWarn = sum(clients, c => c.warnings?.length);
  const doneNote = {
    ghl: clients.length ? `${sum(clients, c => c.kpis?.leads)} leads saved in 2 sub-accounts` : 'Done',
    spend: clients.length ? `${usd(sum(clients, c => c.kpis?.spend))} (simulated)` : 'Done',
    meta: 'Conversions sent',
    checks: !report ? 'Done' : nWarn ? `${nWarn} warning${nWarn > 1 ? 's' : ''}` : 'All checks passed',
    ai: report?.aiSource === 'template' ? 'Template used' : 'Written by Gemini, numbers filled in by code',
  };
  return STEPS.map(([key, label]) => {
    const s = byKey[key] ?? { status: 'pending' };
    const open = s.status === 'running' || s.status === 'pending';
    if (open && runStatus === 'failed') return { key, label, cls: 'stopped', note: 'Stopped: the run hit an error' };
    if (s.status === 'running') return { key, label, cls: 'running', note: 'Working…' };
    if (s.status === 'pending') return { key, label, cls: '', note: 'Waiting' };
    if (s.status === 'failed') return { key, label, cls: 'failed', note: s.reason || 'Failed' };
    if (s.status === 'warning') return { key, label, cls: 'warn', note: s.reason || 'Done with a warning' };
    return { key, label, cls: key === 'checks' && nWarn ? 'warn' : 'done', note: doneNote[key] };
  });
}

export function noticeText(kind, info = {}) {
  if (kind === 'waking') return 'Waking up the demo server. It sleeps when nobody uses it, so this can take up to a minute…';
  if (kind === 'unavailable') return 'The demo server isn’t answering right now. Please try again later.' + (info.hasReport ? ' The last report is shown below.' : '');
  if (kind === 'joined') return 'Someone else’s run was already going, so you’re watching that one. Its test data was their choice.';
  if (kind === 'failed') return info.timeout ? 'The run is taking much longer than usual, so the page stopped waiting. Please try again later.'
    : 'The run hit an error and stopped. The workflow above shows where. Please try again in a minute.';
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

function notice(kind, info) {
  const el = $('#notice');
  el.textContent = kind ? noticeText(kind, info) : '';
  el.hidden = !kind;
}

function showSteps(steps, runStatus, report) {
  const items = stepView(steps, runStatus, report).map(v =>
    h('li', { class: `chip ${v.cls}` }, h('b', {}, h('i', { class: 'dot' }), v.label), h('small', {}, v.note)));
  $('#steps').replaceChildren(...items);
}

const LIGHT_TEXT = { green: 'All checks passed', orange: 'Check the warnings', red: 'A step failed' };

// One client's dashboard body: cards, funnel, campaigns, AI box, data health.
function dashBody(c, problems) {
  const v = dashboardView(c);
  const sim = h('small', { class: 'sim' }, 'simulated');
  return [
    h('div', { class: 'dcards' }, v.cards.map((x, i) => h('div', { class: `dcard c${i}` },
      h('span', {}, x.label), h('b', {}, x.value),
      h('div', { class: 'dmeta' }, h('em', { class: x.tone }, x.change ?? 'no earlier figure'), x.simulated ? sim.cloneNode(true) : null)))),
    h('p', { class: 'extras' }, v.extras.map(e => h('span', {}, `${e.label}: `, h('b', {}, e.value)))),
    h('div', { class: 'drow' },
      h('div', { class: 'dbox' }, h('h4', {}, 'Funnel'),
        h('ol', { class: 'funnel' }, v.funnel.map((f, i) => h('li', { style: `--w:${100 - i * 16}%` },
          f.rate && f.rate !== '—' ? h('small', {}, `${f.rate} of the step above`) : null,
          h('div', {}, h('b', {}, f.value), ` ${f.label}`, f.simulated ? sim.cloneNode(true) : null))))),
      h('div', { class: 'dbox' }, h('h4', {}, 'Campaigns: spend and paid leads', h('small', { class: 'sim' }, 'spend simulated')),
        v.campaigns.length ? h('ul', { class: 'camps' }, v.campaigns.map(x => h('li', {},
          h('span', { class: 'cname' }, x.name),
          h('div', { class: 'cbar spend' }, h('i', { style: `width:${x.spendPct * 0.7}%` }), h('small', {}, x.spend)),
          h('div', { class: 'cbar leads' }, h('i', { style: `width:${x.leadsPct * 0.7}%` }), h('small', {}, `${x.leads} ${x.leads === '1' ? 'lead' : 'leads'}`)))))
          : h('p', { class: 'hint' }, 'This older report has no campaign breakdown. Run the report to see it.'),
        v.unsourced ? h('p', { class: 'hint' }, `${v.unsourced} paid ${v.unsourced === 1 ? 'lead has' : 'leads have'} no recorded source, so ${v.unsourced === 1 ? 'it isn’t' : 'they aren’t'} in any campaign.`) : null)),
    h('div', { class: 'drow' },
      h('div', { class: 'dbox ai' }, h('h4', {}, 'What happened this week'),
        v.ai.headline ? h('p', { class: 'headline' }, v.ai.headline) : null,
        v.ai.summary ? h('p', {}, v.ai.summary) : null,
        v.ai.nextSteps.length ? [h('h4', {}, 'Next steps'), h('ul', {}, v.ai.nextSteps.map(n => h('li', {}, n)))] : null),
      h('div', { class: 'dbox' }, h('h4', {}, 'Data health'),
        h('span', { class: `light ${v.light}` }, h('i'), LIGHT_TEXT[v.light] ?? ''),
        v.warnings.length ? h('ul', {}, v.warnings.map(w => h('li', {}, w.message,
          problems.includes(WARNING_FROM[w.code]) ? [' ', h('small', {}, `← ${PROBLEM_TEXT[WARNING_FROM[w.code]][0]}`)] : null))) : null)),
  ];
}

function dashboard(report, problems) {
  const body = h('div', { class: 'dbody' });
  const tabs = report.clients.map((c, i) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(i === 0) },
    h('i', { class: `ldot ${c.light}` }), c.name));
  const show = i => {
    tabs.forEach((t, j) => t.setAttribute('aria-selected', String(i === j)));
    const c = report.clients[i];
    const kind = CLIENTS.find(x => x.client === c.client)?.kind ?? '';
    body.replaceChildren(h('p', { class: 'kind' }, `${kind} · arrows compare with the previous report`), ...dashBody(c, problems));
  };
  tabs.forEach((t, i) => t.addEventListener('click', () => show(i)));
  show(0);
  return h('div', { class: 'dash' }, h('div', { class: 'dhead' }, h('h3', {}, 'Client dashboard'), h('div', { role: 'tablist', class: 'dtabs' }, tabs)), body);
}

function render(report) {
  const problems = report.injected.map(i => i.problem);
  const week = new Date(report.weekStart).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const head = h('div', { class: 'panel' }, h('h2', {}, `3. The report · week of ${week}`), h('p', { class: 'overview' }, report.overview));
  if (report.aiSource === 'template') head.append(h('p', { class: 'partial' }, 'This summary was written by the template: the AI’s answer failed the checks, or the AI didn’t answer.'));
  if (report.partial) head.append(h('p', { class: 'partial' }, 'Partial report: a step failed, so part of it was built without that step. See the workflow above.'));
  const out = [head];

  if (report.injected.length) {
    const list = h('ul', { class: 'caught' }, report.injected.map(i => h('li', {}, h('span', {}, PROBLEM_TEXT[i.problem]?.[0] ?? i.problem),
      i.caught === null ? h('span', { class: 'tag na' }, 'Not applicable: no conversions to hold back')
        : h('span', { class: `tag ${i.caught ? 'yes' : 'no'}` }, i.caught ? 'Caught' : 'Missed'))));
    out.push(h('div', { class: 'panel' }, h('h2', {}, 'Did the checks catch the mistakes?'), list));
  } else {
    out.push(h('p', { class: 'note' }, 'No mistakes were put in the data this run, so every light should be green.'));
  }

  out.push(dashboard(report, problems));

  // the same code and link the server uses for the Slack message, so this is the text that was posted
  const alert = alertText(report, 'https://ibrahim-jaafar.github.io/agency-demo/');
  out.push(h('div', { class: 'panel' }, h('h2', {}, 'Slack alert'),
    alert ? [h('p', { class: 'hint' }, 'Posted to the agency’s Slack channel when the report was saved, so a person knows to look:'),
      h('div', { class: 'slack-msg' }, h('b', {}, 'Agency report alerts'), h('span', { class: 'app' }, 'APP'), h('p', {}, alert.replace(':warning:', '⚠️')))]
      : h('p', { class: 'hint' }, 'No alert this time: nothing needed a person, so Slack stayed quiet.')));
  $('#result').replaceChildren(...out);
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
  const mode = document.querySelector('input[name=mode]:checked').value;
  return { mode, problems: mode === 'custom' ? [...$('#problems').querySelectorAll('input:checked')].map(i => i.value) : [] };
}

// Follow a run until it ends, redrawing the steps on every poll.
async function follow(runId) {
  const t0 = Date.now();
  while (Date.now() - t0 < RUN_MAX_MS) {
    const s = await call(`/status?run=${encodeURIComponent(runId)}`).then(r => r.body, () => null);
    if (s?.runId === runId) {
      showSteps(s.steps, s.status, s.report);
      if (s.status === 'failed') return notice('failed');
      if (s.status !== 'running') { if (s.report) render(s.report); return; }
    }
    await sleep(POLL_MS);
  }
  notice('failed', { timeout: true });
}

export async function boot() {
  const btn = $('#run'), box = $('#problems');
  for (const p of PROBLEMS) {
    box.append(h('label', {}, h('input', { type: 'checkbox', value: p }), h('span', {}, PROBLEM_TEXT[p][0], h('small', {}, PROBLEM_TEXT[p][1]))));
  }
  document.querySelectorAll('input[name=mode]').forEach(r => r.addEventListener('change', () => { box.hidden = !$('#m-custom').checked; }));
  showSteps([], null, null);
  showMetaExample().catch(console.error);

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Running…';
    notice(null);
    try {
      const body = JSON.stringify(scenario());
      // the server is already awake (the page woke it on load), so one call with a long timeout, never a retry that could start a second run
      const r = await call('/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body }, 60000);
      if (r.status === 429) {
        notice('limit', r.body ?? {});
      } else if (r.status !== 200 || !r.body?.runId) {
        notice('unavailable', { hasReport: !!$('#result').children.length });
      } else {
        if (r.body.joined) notice('joined');
        showSteps([{ key: 'ghl', status: 'running' }], 'running', null);
        $('#t-steps').scrollIntoView({ behavior: 'smooth', block: 'start' });
        await follow(r.body.runId);
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
  btn.disabled = true;
  btn.textContent = 'Connecting…';
  const t0 = Date.now();
  for (;;) {
    const r = await call('/status').catch(() => null);
    if (r?.status === 200) {
      notice(null);
      if (r.body?.report) { showSteps(r.body.steps, r.body.status, r.body.report); render(r.body.report); }
      btn.disabled = false;
      btn.textContent = 'Run the report';
      return;
    }
    if (Date.now() - t0 > WAKE_MAX_MS) { notice('unavailable', {}); btn.textContent = 'Demo unavailable'; return; }
    notice('waking');
    await sleep(WAKE_RETRY_MS);
  }
}

if (typeof document !== 'undefined') boot();
