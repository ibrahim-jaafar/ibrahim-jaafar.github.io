// The finished report: the run's days and leads, warnings, status lights, and what the test caught.
// The AI summary isn't part of it: the dashboard asks for one per period (the summary workflow).
import { matchInjected } from './checks.js';
import { leadList } from './daily.js';

const DATA_STEPS = ['ghl', 'spend', 'meta', 'checks'];

// asOf: when the run read the data; on its last day nothing more arrives after it.
export function buildReport({ runId, weekStart, asOf, clients, steps, problems, metaSkipped }) {
  const failed = steps.filter(s => s.status === 'failed').map(s => s.key);
  const dataFailed = failed.some(k => DATA_STEPS.includes(k));
  const allWarnings = clients.flatMap(c => c.warnings);
  const injected = matchInjected(problems, allWarnings);
  // no conversions to hold back means the mismatch was never created: caught is null (not applicable)
  if (metaSkipped === 0) injected.forEach(i => { if (i.problem === 'meta_mismatch') i.caught = null; });

  return {
    runId,
    weekStart: new Date(weekStart).toISOString(),
    // ranAt stays the run's moment; asOf moves on with each test lead
    ranAt: asOf ? new Date(asOf).toISOString() : null,
    asOf: asOf ? new Date(asOf).toISOString() : null,
    partial: failed.length > 0,
    injected,
    steps,
    clients: clients.map(c => ({
      client: c.client,
      name: c.name,
      kpis: c.kpis,
      campaigns: c.campaigns ?? null,
      days: c.days ?? null,
      leadList: c.leadList ?? null,
      warnings: c.warnings,
      light: dataFailed ? 'red' : c.warnings.length ? 'orange' : 'green',
    })),
  };
}

const STEP_NAMES = { ghl: 'Reading the CRM (GoHighLevel)', spend: 'Ad spend', meta: 'Sending conversions to Meta', checks: 'Data checks' };

// A short Slack message when a report needs a person: a step failed or a check fired. null when all is well.
export function alertText(report, link) {
  const lines = [
    ...report.steps.filter(s => s.status === 'failed').map(s => `• ${STEP_NAMES[s.key] ?? s.key} failed: ${s.reason ?? 'no reason given'}`),
    ...report.clients.flatMap(c => c.warnings.map(w => `• ${c.name}: ${w.message}`)),
  ];
  if (!lines.length) return null;
  const to = (report.asOf ?? new Date(Date.parse(report.weekStart) + 6 * 864e5).toISOString()).slice(0, 10);
  const demo = report.injected.length ? ' (demo: the visitor chose some of these mistakes)' : '';
  return [`:warning: Report for the 7 days to ${to} needs a look${demo}`, ...lines, `Report: ${link}`].join('\n');
}

// A test lead joins the latest run: on its list of leads and in today's figures (today is a run day: tests need a run
// from today). metaOk: Meta accepted the conversion (only asked when it converted). Today now runs up to this lead.
// ponytail: the run's own kpis stay as the run read them; the dashboard adds up from the days and the list.
export function addTestLead(report, client, lead, metaOk) {
  const at = lead.createdAt, day = at.slice(0, 10);
  // (a JSON copy: n8n's Code node has no structuredClone)
  const r = JSON.parse(JSON.stringify(report)), c = r.clients.find(x => x.client === client);
  const row = c.days?.find(d => d.day === day);
  if (!row) throw new Error(`the latest run has no ${day}`);
  const [entry] = leadList([lead], new Date(r.weekStart));
  c.leadList = [entry, ...(c.leadList ?? [])];
  const won = lead.outcome === 'converted';
  row.leads++;
  if (lead.source !== 'organic') row.paidLeads++;
  if (won) { row.conversions++; row.revenue = Math.round((row.revenue + lead.value) * 100) / 100; }
  if (lead.outcome === 'cancelled') row.cancelled++;
  const camp = row.campaigns?.find(x => x.name === lead.source);
  if (camp) camp.paidLeads++;
  if (won && !metaOk) row.metaMissed = (row.metaMissed || 0) + 1;
  r.asOf = new Date(Date.parse(at) + 1000).toISOString(); // today counts what came in before asOf: the lead, and a second to spare
  r.testLeads = (r.testLeads || 0) + 1;
  return r;
}
