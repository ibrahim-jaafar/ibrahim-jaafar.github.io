// Data checks: plain code, never AI. Each warning's message is written for a client.
import { normalisePhone, normaliseEmail, inPeriod } from './leads.js';

const OUTLIER_FACTOR = 5;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const usd = n => `$${n.toFixed(2)}`;

// The warnings themselves, from counts. The run's checks and the dashboard's checks for any period both end here.
// f: conv (converted leads, with value), meta ({ accepted, rejected } or null), noSource, dupes, reported and sum (spend)
function warningsFrom(client, f) {
  const what = client === 'clinic' ? ['booking', 'bookings'] : ['order', 'orders'];
  const out = [];

  if (f.meta && f.meta.accepted !== f.conv.length) {
    out.push({ code: 'meta_mismatch', count: Math.abs(f.conv.length - f.meta.accepted),
      message: `Meta recorded ${plural(f.meta.accepted, ...what)} but the CRM shows ${f.conv.length}, so results in Meta's ad reports may be off.` });
  }
  if (f.noSource) {
    out.push({ code: 'missing_source', count: f.noSource,
      message: `${plural(f.noSource, 'lead has', 'leads have')} no recorded source, so we can't tell which ad brought ${f.noSource === 1 ? 'it' : 'them'}.` });
  }
  if (f.dupes) {
    out.push({ code: 'duplicates', count: f.dupes,
      message: `${plural(f.dupes, 'lead appears', 'leads appear')} twice (the same person written differently), which makes results look better than they are.` });
  }
  if (Math.abs(f.reported - f.sum) > 0.01) {
    out.push({ code: 'bad_totals', count: 1,
      message: `The ad account's total spend (${usd(f.reported)}) doesn't match the sum of its campaigns (${usd(f.sum)}), so some data may be missing.` });
  }
  if (client === 'store' && f.conv.length >= 3) {
    const vals = f.conv.map(l => l.value).sort((a, b) => a - b);
    const median = vals[Math.floor(vals.length / 2)];
    const big = f.conv.filter(l => l.value > OUTLIER_FACTOR * median);
    if (big.length) {
      out.push({ code: 'outlier', count: big.length,
        message: `${plural(big.length, 'order is', 'orders are')} unusually large (over ${OUTLIER_FACTOR}× a typical order). Worth confirming before it's counted in results.` });
    }
  }
  if (f.meta && f.meta.rejected > 0) {
    out.push({ code: 'meta_rejected', count: f.meta.rejected,
      message: `Meta rejected ${plural(f.meta.rejected, 'conversion event', 'conversion events')}, so ${f.meta.rejected === 1 ? 'it' : 'they'} won't count in ad reporting.` });
  }
  return out;
}

const sumOf = (xs, f) => Math.round(xs.reduce((a, x) => a + (f(x) || 0), 0) * 100) / 100;

export function runChecks({ client, leads, spend, meta, weekStart }) {
  const inWeek = leads.filter(l => inPeriod(l, weekStart));
  const emails = new Set(), phones = new Set();
  let dupes = 0;
  for (const l of inWeek) {
    const e = normaliseEmail(l.email), p = normalisePhone(l.phone);
    if ((e && emails.has(e)) || (p && phones.has(p))) dupes++;
    if (e) emails.add(e);
    if (p) phones.add(p);
  }
  return warningsFrom(client, { conv: inWeek.filter(l => l.outcome === 'converted'), meta, noSource: inWeek.filter(l => l.source === null).length, dupes,
    reported: spend.reportedTotal, sum: sumOf(spend.campaigns, c => c.spend) });
}

// The same checks for any stretch of days on the dashboard: leads from the leads list (duplicates already marked the
// way runChecks counts them), and each day's ad-account and Meta figures (spendGap, metaMissed, metaRejected).
export function periodChecks(client, leads, days) {
  const conv = leads.filter(l => l.outcome === 'converted'), sum = sumOf(days, d => d.spend);
  return warningsFrom(client, { conv, noSource: leads.filter(l => l.source === null).length, dupes: leads.filter(l => l.duplicate).length,
    meta: { accepted: conv.length - sumOf(days, d => d.metaMissed), rejected: sumOf(days, d => d.metaRejected) },
    reported: Math.round((sum + sumOf(days, d => d.spendGap)) * 100) / 100, sum });
}

const CAUGHT_BY = {
  missing_source: ['missing_source'],
  duplicates: ['duplicates'],
  meta_mismatch: ['meta_mismatch'],
  bad_totals: ['bad_totals'],
  edge_cases: ['outlier', 'meta_rejected'],
};

// warnings from both clients together; ai_broken is matched by the report
export function matchInjected(problems, warnings) {
  const have = new Set(warnings.map(w => w.code));
  return problems.filter(p => CAUGHT_BY[p]).map(p => ({ problem: p, caught: CAUGHT_BY[p].every(c => have.has(c)) }));
}
