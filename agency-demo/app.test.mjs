// node --test agency-demo/app.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { fmt, stepView, noticeText } from './app.js';

test('null and zero-division values render as a dash', () => {
  assert.equal(fmt(null, 'usd'), '—');
  assert.equal(fmt(Infinity, 'pct'), '—');
  assert.equal(fmt(NaN, ''), '—');
  assert.equal(fmt(159.4, 'usd'), '$159.40');
  assert.equal(fmt(0.5833, 'pct'), '58.3%');
});

test('failed step shows its reason', () => {
  const meta = stepView([{ key: 'meta', status: 'failed', reason: "Meta didn't respond" }], 'partial', null).find(s => s.key === 'meta');
  assert.equal(meta.cls, 'failed');
  assert.equal(meta.note, "Meta didn't respond");
});

test('a failed run shows its unfinished steps as stopped', () => {
  const v = stepView([{ key: 'ghl', status: 'done' }, { key: 'spend', status: 'running' }, { key: 'meta', status: 'pending' }], 'failed', null);
  assert.deepEqual(v.map(s => s.cls), ['done', 'stopped', 'stopped', 'stopped', 'stopped']);
});

test('a running run keeps its open steps open', () => {
  const v = stepView([{ key: 'ghl', status: 'done' }, { key: 'spend', status: 'running' }], 'running', null);
  assert.deepEqual(v.map(s => s.cls), ['done', 'running', '', '', '']);
});

test('done steps describe the report, and warnings colour the checks step', () => {
  const report = { aiSource: 'template', clients: [{ kpis: { leads: 12, spend: 100 }, warnings: [{}] }, { kpis: { leads: 9, spend: 50.5 }, warnings: [] }] };
  const v = Object.fromEntries(stepView(['ghl', 'spend', 'meta', 'checks', 'ai'].map(key => ({ key, status: 'done' })), 'done', report).map(s => [s.key, s]));
  assert.equal(v.ghl.note, '21 leads saved in 2 sub-accounts');
  assert.equal(v.spend.note, '$150.50 (simulated)');
  assert.equal(v.checks.cls, 'warn');
  assert.match(v.ai.note, /template/i);
});

test('notices', () => {
  assert.match(noticeText('waking'), /Waking up the demo server/);
  assert.match(noticeText('limit', { reason: 'gap', retryAfterSec: 42 }), /42 seconds/);
  assert.match(noticeText('limit', { reason: 'daily', retryAfterSec: 3 * 3600 + 5 }), /4 hour/);
  assert.match(noticeText('unavailable', { hasReport: true }), /last report/);
});
