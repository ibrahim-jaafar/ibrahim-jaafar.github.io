// Made-up demo leads for the two fictional clients, with optional deliberate flaws.
const DAY_MS = 864e5;
const FIRST = ['Sara', 'Omar', 'Lina', 'Karim', 'Maya', 'Rami', 'Nour', 'Hadi', 'Yara', 'Fadi', 'Dana', 'Ziad', 'Rita', 'Joe', 'Lea'];
const LAST = ['Haddad', 'Khoury', 'Saleh', 'Nassar', 'Aoun', 'Fares', 'Daher', 'Chami', 'Mansour', 'Rizk', 'Karam', 'Tannous'];
export const CAMPAIGNS = {
  clinic: ['Botox Spring', 'Laser Hair Removal', 'Skin Consultation'],
  store: ['Living Room Sale', 'New Arrivals', 'Retargeting'],
};
const CONVERT_RATE = { clinic: 0.3, store: 0.25 };
const CONSULT_FEE = 150;
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
    const converted = rng() < CONVERT_RATE[client];
    const national = `7${between(0, 9)}${String(between(0, 999999)).padStart(6, '0')}`;
    return {
      id: uid(),
      firstName: first,
      lastName: last,
      email: `${first}.${last}.${n}${between(10, 99)}@example.com`.toLowerCase(),
      phone: `+961 ${national.slice(0, 2)} ${national.slice(2, 5)} ${national.slice(5)}`,
      source: rng() < 0.15 ? 'organic' : pick(CAMPAIGNS[client]),
      createdAt: new Date(+weekStart + Math.floor(rng() * (7 * DAY_MS - 1))).toISOString(),
      outcome: converted ? 'converted' : 'open',
      value: converted ? orderValue() : 0,
      flags: [],
    };
  };

  const leads = Array.from({ length: between(6, 12) }, (_, i) => make(i));

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
