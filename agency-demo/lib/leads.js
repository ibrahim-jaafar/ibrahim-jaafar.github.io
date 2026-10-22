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
const pickWeighted = (rng, ws) => {
  let u = rng() * ws.reduce((a, w) => a + w, 0), i = 0;
  while (u > ws[i] && i < ws.length - 1) u -= ws[i++];
  return i;
};
const CONSULT_FEE = 150;
// How enquiries spread over the day (UTC hours): quiet at night, busy late morning and evening.
export const HOUR_CURVE = [1, 0.6, 0.4, 0.3, 0.3, 0.5, 1, 2, 3.5, 5, 6, 6.5, 6, 6, 5.5, 5.5, 6, 6.5, 7, 7, 6, 4.5, 3, 2];
// A moment in the week: a day (weekends quieter), an hour picked by the daily curve, any minute.
function leadTime(rng, weekStart) {
  const day = pickWeighted(rng, WEEKDAY_WEIGHT);
  const hour = pickWeighted(rng, HOUR_CURVE);
  return new Date(+weekStart + day * DAY_MS + hour * 36e5 + Math.floor(rng() * 3600) * 1000).toISOString();
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

export function generateLeads(client, problems, rng, weekStart) {
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
      createdAt: leadTime(rng, weekStart),
      outcome: converted ? 'converted' : cancelled ? 'cancelled' : 'open',
      value: converted || cancelled ? orderValue() : 0,
      flags: [],
    };
  };

  // edge cases bring their own leads (5 for the clinic, 9 for the store, in the week): fewer ordinary ones,
  // so the week stays about as busy as any other
  const leads = Array.from({ length: Math.max(2, between(6, 12) - (edge ? (client === 'store' ? 9 : 5) : 0)) }, (_, i) => make(i));

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
        // the same person fills in the form again a few hours to two days later, still inside the week
        createdAt: new Date(Math.max(Date.parse(orig.createdAt) + 1, Math.min(Date.parse(orig.createdAt) + (1 + rng() * 47) * 36e5, +weekStart + 7 * DAY_MS - 1))).toISOString(),
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
    // a pair either side of the week's end
    const end = +weekStart + 7 * DAY_MS;
    for (const t of [end - 1, end]) {
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
