// The finished report: numbers, warnings, status lights, AI (or template) text, and what the test caught.
import { matchInjected } from './checks.js';
import { pctChanges } from './ai.js';

const DATA_STEPS = ['ghl', 'spend', 'meta', 'checks'];

export function buildReport({ runId, weekStart, clients, steps, ai, problems, metaSkipped }) {
  const failed = steps.filter(s => s.status === 'failed').map(s => s.key);
  const dataFailed = failed.some(k => DATA_STEPS.includes(k));
  const allWarnings = clients.flatMap(c => c.warnings);
  const injected = matchInjected(problems, allWarnings);
  // no conversions to hold back means the mismatch was never created: caught is null (not applicable)
  if (metaSkipped === 0) injected.forEach(i => { if (i.problem === 'meta_mismatch') i.caught = null; });
  if (problems.includes('ai_broken')) injected.push({ problem: 'ai_broken', caught: ai.source === 'template' });

  return {
    runId,
    weekStart: new Date(weekStart).toISOString(),
    partial: failed.length > 0,
    overview: ai.value.overview,
    aiSource: ai.source,
    injected,
    steps,
    clients: clients.map(c => ({
      client: c.client,
      name: c.name,
      kpis: c.kpis,
      campaigns: c.campaigns ?? null,
      days: c.days ?? null,
      leadList: c.leadList ?? null,
      previousKpis: c.previousKpis,
      changes: pctChanges(c.kpis, c.previousKpis),
      warnings: c.warnings,
      light: dataFailed ? 'red' : c.warnings.length ? 'orange' : 'green',
      summary: ai.value.clients.find(s => s.client === c.client),
    })),
  };
}

const STEP_NAMES = { ghl: 'Reading the CRM (GoHighLevel)', spend: 'Ad spend', meta: 'Sending conversions to Meta', checks: 'Data checks', ai: 'AI summary' };

// A short Slack message when a report needs a person: a step failed or a check fired. null when all is well.
export function alertText(report, link) {
  const lines = [
    ...report.steps.filter(s => s.status === 'failed').map(s => `• ${STEP_NAMES[s.key] ?? s.key} failed: ${s.reason ?? 'no reason given'}`),
    ...report.clients.flatMap(c => c.warnings.map(w => `• ${c.name}: ${w.message}`)),
  ];
  if (!lines.length) return null;
  const week = report.weekStart.slice(0, 10);
  const demo = report.injected.length ? ' (demo: the visitor chose some of these mistakes)' : '';
  return [`:warning: Weekly report, week of ${week}, needs a look${demo}`, ...lines, `Report: ${link}`].join('\n');
}
