// Data checks: plain code, never AI. Each warning's message is written for a client.
import { normalisePhone, normaliseEmail, inPeriod } from './leads.js';

const OUTLIER_FACTOR = 5;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const usd = n => `$${n.toFixed(2)}`;

export function runChecks({ client, leads, spend, meta, weekStart }) {
  const inWeek = leads.filter(l => inPeriod(l, weekStart));
  const conv = inWeek.filter(l => l.outcome === 'converted');
  const what = client === 'clinic' ? ['booking', 'bookings'] : ['order', 'orders'];
  const out = [];

  if (meta && meta.accepted !== conv.length) {
    out.push({ code: 'meta_mismatch', count: Math.abs(conv.length - meta.accepted),
      message: `Meta recorded ${plural(meta.accepted, ...what)} but the CRM shows ${conv.length}, so results in Meta's ad reports may be off.` });
  }

  const noSource = inWeek.filter(l => l.source === null).length;
  if (noSource) {
    out.push({ code: 'missing_source', count: noSource,
      message: `${plural(noSource, 'lead has', 'leads have')} no recorded source, so we can't tell which ad brought ${noSource === 1 ? 'it' : 'them'}.` });
  }

  const emails = new Set(), phones = new Set();
  let dupes = 0;
  for (const l of inWeek) {
    const e = normaliseEmail(l.email), p = normalisePhone(l.phone);
    if ((e && emails.has(e)) || (p && phones.has(p))) dupes++;
    if (e) emails.add(e);
    if (p) phones.add(p);
  }
  if (dupes) {
    out.push({ code: 'duplicates', count: dupes,
      message: `${plural(dupes, 'lead appears', 'leads appear')} twice (the same person written differently), which makes results look better than they are.` });
  }

  const sum = Math.round(spend.campaigns.reduce((a, c) => a + c.spend, 0) * 100) / 100;
  if (Math.abs(spend.reportedTotal - sum) > 0.01) {
    out.push({ code: 'bad_totals', count: 1,
      message: `The ad account's total spend (${usd(spend.reportedTotal)}) doesn't match the sum of its campaigns (${usd(sum)}), so some data may be missing.` });
  }

  if (client === 'store' && conv.length >= 3) {
    const vals = conv.map(l => l.value).sort((a, b) => a - b);
    const median = vals[Math.floor(vals.length / 2)];
    const big = conv.filter(l => l.value > OUTLIER_FACTOR * median);
    if (big.length) {
      out.push({ code: 'outlier', count: big.length,
        message: `${plural(big.length, 'order is', 'orders are')} unusually large (over ${OUTLIER_FACTOR}× a typical order). Worth confirming before it's counted in results.` });
    }
  }

  if (meta && meta.rejected > 0) {
    out.push({ code: 'meta_rejected', count: meta.rejected,
      message: `Meta rejected ${plural(meta.rejected, 'conversion event', 'conversion events')}, so ${meta.rejected === 1 ? 'it' : 'they'} won't count in ad reporting.` });
  }
  return out;
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
