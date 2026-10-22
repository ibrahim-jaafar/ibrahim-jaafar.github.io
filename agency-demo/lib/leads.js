// Made-up demo leads for the two fictional clients, with optional deliberate flaws.
const DAY_MS = 864e5;
export const FIRST = ['Sara', 'Omar', 'Lina', 'Karim', 'Maya', 'Rami', 'Nour', 'Hadi', 'Yara', 'Fadi', 'Dana', 'Ziad', 'Rita', 'Joe', 'Lea'];
export const LAST = ['Haddad', 'Khoury', 'Saleh', 'Nassar', 'Aoun', 'Fares', 'Daher', 'Chami', 'Mansour', 'Rizk', 'Karam', 'Tannous'];
export const CAMPAIGNS = {
  clinic: ['Botox Spring', 'Laser Hair Removal', 'Skin Consultation'],
  store: ['Living Room Sale', 'New Arrivals', 'Retargeting'],
};
// how the paid leads split over the campaigns (the made-up history uses the same shares)
export const CAMPAIGN_SHARE = { clinic: [0.45, 0.33, 0.22], store: [0.4, 0.25, 0.35] };
export const CONVERT_RATE = { clinic: 0.3, store: 0.25 };
export const CANCEL_RATE = 0.04;
// the week starts on Monday; weekends are quieter
export const WEEKDAY_WEIGHT = [1.08, 1.08, 1.08, 1.08, 1.08, 0.7, 0.7];
export const pickWeighted = (rng, ws) => {
  let u = rng() * ws.reduce((a, w) => a + w, 0), i = 0;
  while (u > ws[i] && i < ws.length - 1) u -= ws[i++];
  return i;
};
const CONSULT_FEE = 150;
// How enquiries spread over the day (UTC hours): quiet at night, busy late morning and evening.
export const HOUR_CURVE = [1, 0.6, 0.4, 0.3, 0.3, 0.5, 1, 2, 3.5, 5, 6, 6.5, 6, 6, 5.5, 5.5, 6, 6.5, 7, 7, 6, 4.5, 3, 2];
const CURVE_TOTAL = HOUR_CURVE.reduce((a, w) => a + w, 0);
// The share of a usual day's activity that has happened `hours` into it, on HOUR_CURVE.
export function shareBy(hours) {
  const h = Math.min(24, Math.max(0, hours)), whole = Math.floor(h);
  return (HOUR_CURVE.slice(0, whole).reduce((a, w) => a + w, 0) + (whole < 24 ? HOUR_CURVE[whole] * (h - whole) : 0)) / CURVE_TOTAL;
}
// the weekday weight of day d of a period that starts at `start` (weekends quieter)
const dayWeight = (start, d) => WEEKDAY_WEIGHT[(new Date(+start + d * DAY_MS).getUTCDay() + 6) % 7];
// A moment in the 7 days from `start`, before `now`: a day by its weekday, an hour by the daily curve, any minute.
// A moment that hasn't happened yet is drawn again.
function leadTime(rng, start, now) {
  const ws = Array.from({ length: 7 }, (_, d) => dayWeight(start, d));
  for (let i = 0; ; i++) {
    const t = +start + pickWeighted(rng, ws) * DAY_MS + pickWeighted(rng, HOUR_CURVE) * 36e5 + Math.floor(rng() * 3600) * 1000;
    if (t < now || i >= 50) return new Date(Math.min(t, now - 1)).toISOString();
  }
}

const SHARED = { firstName: 'Jad', lastName: 'Sfeir', email: 'jad.sfeir@example.com', phone: '+961 71 555 010' };

export function normalisePhone(s) {
  let d = String(s ?? '').replace(/\D/g, '');
  if (d.startsWith('00961')) d = d.slice(5);
  else if (d.startsWith('961')) d = d.slice(3);
  if (d.startsWith('0')) d = d.slice(1);
  return d;
}

export function normaliseEmail(s) {
  return String(s ?? '').trim().toLowerCase();
}

export function inPeriod(lead, weekStart) {
  const t = Date.parse(lead.createdAt);
  return t >= +weekStart && t < +weekStart + 7 * DAY_MS;
}

// GoHighLevel sends a long list one page per reply. Join the pages; null if any page failed.
// `more`: we stopped at maxPages while the last page was still full, so the list may go on.
export function joinPages(pages, key, maxPages, pageSize) {
  if (!pages?.length || pages.some(p => p.statusCode !== 200)) return null;
  const rows = pages.flatMap(p => p.body?.[key] || []);
  // a record added while we read can push another onto the next page twice; keep one of each
  const one = [...new Map(rows.map(r => [r.id, r])).values()];
  return { rows: one, more: pages.length >= maxPages && (pages.at(-1).body?.[key] || []).length >= pageSize };
}

// The leads of the 7 days from weekStart that have come in by `now` (the whole 7 days unless now falls inside them).
export function generateLeads(client, problems, rng, weekStart, now = +weekStart + 7 * DAY_MS) {
  const pick = arr => arr[Math.floor(rng() * arr.length)];
  const between = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  const uid = () => `${client}-${Math.floor(rng() * 2 ** 32).toString(36)}-${Math.floor(rng() * 2 ** 32).toString(36)}`;
  const edge = problems.includes('edge_cases');

  // edge case: an empty week for the clinic (zero leads, nothing to divide by)
  if (edge && client === 'clinic' && rng() < 0.5) return [];

  const orderValue = () => (client === 'clinic' ? CONSULT_FEE : between(80, 300));
  const make = (n) => {
    const first = pick(FIRST), last = pick(LAST);
    const u = rng(), converted = u < CONVERT_RATE[client], cancelled = !converted && u < CONVERT_RATE[client] + CANCEL_RATE;
    const national = `7${between(0, 9)}${String(between(0, 999999)).padStart(6, '0')}`;
    return {
      id: uid(),
      firstName: first,
      lastName: last,
      email: `${first}.${last}.${n}${between(10, 99)}@example.com`.toLowerCase(),
      phone: `+961 ${national.slice(0, 2)} ${national.slice(2, 5)} ${national.slice(5)}`,
      source: rng() < 0.15 ? 'organic' : CAMPAIGNS[client][pickWeighted(rng, CAMPAIGN_SHARE[client])],
      createdAt: leadTime(rng, weekStart, now),
      outcome: converted ? 'converted' : cancelled ? 'cancelled' : 'open',
      value: converted || cancelled ? orderValue() : 0,
      flags: [],
    };
  };

  // edge cases bring their own leads (5 for the clinic, 9 for the store, in the week): fewer ordinary ones,
  // so the week stays about as busy as any other. A week still under way has had only part of its usual leads.
  const sofar = Array.from({ length: 7 }, (_, d) => dayWeight(weekStart, d) * shareBy((now - weekStart - d * DAY_MS) / 36e5)).reduce((a, b) => a + b, 0)
    / Array.from({ length: 7 }, (_, d) => dayWeight(weekStart, d)).reduce((a, b) => a + b, 0);
  const leads = Array.from({ length: Math.max(2, Math.round(between(6, 12) * sofar) - (edge ? (client === 'store' ? 9 : 5) : 0)) }, (_, i) => make(i));

  if (problems.includes('missing_source')) {
    const k = between(1, 3);
    for (const l of leads.slice(0, k)) { l.source = null; l.flags.push('missing_source'); }
  }

  if (problems.includes('duplicates')) {
    const k = between(1, 2);
    for (const orig of leads.slice(-k)) {
      const d = normalisePhone(orig.phone);
      leads.push({
        ...orig,
        id: uid(),
        email: orig.email.toUpperCase(),
        phone: `0${d.slice(0, 2)}${d.slice(2)}`,
        // the same person fills in the form again a few hours to two days later, still inside the week and not after now
        createdAt: new Date(Math.max(Date.parse(orig.createdAt) + 1, Math.min(Date.parse(orig.createdAt) + (1 + rng() * 47) * 36e5, Math.min(+weekStart + 7 * DAY_MS, now) - 1))).toISOString(),
        outcome: 'open',
        value: 0,
        flags: ['duplicates'],
      });
    }
  }

  if (edge) {
    // edge cases get their own leads, so they never depend on how many clean leads exist
    const add = (extra) => { const l = { ...make(leads.length), ...extra }; leads.push(l); return l; };
    add({ outcome: 'cancelled', value: orderValue() });          // a cancelled booking / refunded order
    add({ firstName: 'سارة', lastName: 'حداد' });                 // names that must survive hashing and display
    add({ firstName: 'Zoë', lastName: 'Bloom 🌸' });
    add({ ...SHARED, flags: ['shared'] });                        // same person is a lead at the other client too
    // a pair either side of the period's start (its end may not have come yet)
    for (const t of [+weekStart - 1, +weekStart]) {
      leads.push({ ...make(leads.length), createdAt: new Date(t).toISOString(), outcome: 'open', value: 0, flags: ['boundary'] });
    }
    if (client === 'store') {
      // enough normal orders to have a median, then one 10x outlier
      for (let i = 0; i < 3; i++) add({ outcome: 'converted', value: between(80, 300) });
      const vals = leads.filter(l => l.outcome === 'converted').map(l => l.value).sort((a, b) => a - b);
      const median = vals[Math.floor(vals.length / 2)];
      leads.push({ ...make(leads.length), outcome: 'converted', value: median * 10, flags: ['outlier'] });
    }
  }

  return leads;
}

// One made-up customer arriving right now: the dashboard's "Send a test lead".
export function testLead(client, rng, now) {
  const [l] = generateLeads(client, [], rng, new Date(now - 7 * DAY_MS), now);
  return { ...l, createdAt: new Date(now).toISOString() };
}
