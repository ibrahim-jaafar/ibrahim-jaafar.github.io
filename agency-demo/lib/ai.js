// What the AI sees, the strict shape its answer must have, checks on that answer, and a template fallback.
// The AI only writes text. It never sees personal data and can't change a number or a warning.

const KPI_KEYS = {
  clinic: ['spend', 'leads', 'paidLeads', 'costPerLead', 'cancelled', 'bookings', 'costPerBooking', 'bookingRate'],
  store: ['spend', 'leads', 'paidLeads', 'costPerLead', 'cancelled', 'orders', 'revenue', 'roas', 'costPerOrder', 'avgOrderValue'],
};

export const AI_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['overview', 'clients'],
  properties: {
    overview: { type: 'string', maxLength: 200 },
    clients: {
      type: 'array', minItems: 2, maxItems: 2,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['client', 'headline', 'summary', 'warnings_explained', 'next_steps'],
        properties: {
          client: { type: 'string', enum: ['clinic', 'store'] },
          headline: { type: 'string', maxLength: 90 },
          summary: { type: 'string', maxLength: 600 },
          warnings_explained: { type: 'array', maxItems: 6, items: { type: 'string', maxLength: 300 } },
          next_steps: { type: 'array', maxItems: 3, items: { type: 'string', maxLength: 200 } },
        },
      },
    },
  },
};

const pickKpis = (client, k) => (k ? Object.fromEntries(KPI_KEYS[client].filter(key => key in k).map(key => [key, k[key]])) : null);

export function pctChanges(kpis, prev) {
  if (!prev) return null;
  return Object.fromEntries(Object.keys(kpis).map(key => {
    const a = kpis[key], b = prev[key];
    return [key, typeof a === 'number' && typeof b === 'number' && b !== 0 ? Math.round(((a - b) / b) * 100) : null];
  }));
}

export function buildAiInput(clients) {
  return {
    clients: clients.map(c => {
      const kpis = pickKpis(c.client, c.kpis);
      const previousKpis = pickKpis(c.client, c.previousKpis);
      return {
        client: c.client,
        name: c.name,
        kpis,
        previousKpis,
        changes: pctChanges(kpis, previousKpis),
        warnings: (c.warnings || []).map(w => ({ code: w.code, count: w.count, message: w.message })),
      };
    }),
  };
}

function checkSchema(value, schema, path, errors) {
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return errors.push(`${path} must be an object`);
    for (const k of schema.required) if (!(k in value)) errors.push(`${path}.${k} is missing`);
    for (const k of Object.keys(value)) {
      if (!schema.properties[k]) errors.push(`${path}.${k} is not allowed`);
      else checkSchema(value[k], schema.properties[k], `${path}.${k}`, errors);
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value)) return errors.push(`${path} must be a list`);
    if (schema.minItems != null && value.length < schema.minItems) errors.push(`${path} needs at least ${schema.minItems} items`);
    if (schema.maxItems != null && value.length > schema.maxItems) errors.push(`${path} allows at most ${schema.maxItems} items`);
    value.forEach((v, i) => checkSchema(v, schema.items, `${path}[${i}]`, errors));
  } else if (schema.type === 'string') {
    if (typeof value !== 'string') return errors.push(`${path} must be text`);
    if (schema.maxLength != null && value.length > schema.maxLength) errors.push(`${path} is too long`);
    if (schema.enum && !schema.enum.includes(value)) errors.push(`${path} must be one of ${schema.enum.join(', ')}`);
  }
}

function allowedNumbers(input) {
  const out = [];
  const walk = v => {
    if (typeof v === 'number' && Number.isFinite(v)) out.push(Math.abs(v), Math.abs(v) * 100);
    else if (typeof v === 'string') numbersIn(v).forEach(n => out.push(n));
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(input);
  return out;
}

function numbersIn(text) {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) || []).map(s => Number(s.replace(/,/g, '')));
}

const roundTo = (n, d) => Math.round(n * 10 ** d) / 10 ** d;
const matches = (n, a) => [0, 1, 2].some(d => Math.abs(n - roundTo(a, d)) < 1e-9);

export function validateAiOutput(raw, input) {
  let value = raw;
  if (typeof raw === 'string') {
    try { value = JSON.parse(raw); } catch { return { ok: false, errors: ['answer is not valid JSON'] }; }
  }
  const errors = [];
  checkSchema(value, AI_SCHEMA, 'answer', errors);
  if (errors.length) return { ok: false, errors };

  if (new Set(value.clients.map(c => c.client)).size !== 2) errors.push('answer must cover the clinic and the store once each');

  const allowed = allowedNumbers(input);
  const texts = [value.overview, ...value.clients.flatMap(c => [c.headline, c.summary, ...c.warnings_explained, ...c.next_steps])];
  for (const n of texts.flatMap(numbersIn)) {
    if (!allowed.some(a => matches(n, a))) errors.push(`the number ${n} is not in the data`);
  }
  return errors.length ? { ok: false, errors } : { ok: true, value };
}

const money = n => `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
const pct = n => `${roundTo(n * 100, 1)}%`;
const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const change = (ch, key) => (ch && ch[key] != null ? ` (${ch[key] >= 0 ? 'up' : 'down'} ${Math.abs(ch[key])}% on the last run)` : '');

export function templateSummary(input) {
  const clients = input.clients.map(c => {
    const k = c.kpis;
    let headline, summary;
    if (!k.leads) {
      headline = 'No leads yet this week';
      summary = `No leads yet this week, with ${money(k.spend)} of ad spend so far.`;
    } else if (c.client === 'clinic') {
      headline = `${count(k.leads, 'lead', 'leads')} and ${count(k.bookings, 'booked consultation', 'booked consultations')}`;
      summary = `${count(k.leads, 'lead', 'leads')}${change(c.changes, 'leads')}, ${count(k.bookings, 'booked consultation', 'booked consultations')}`
        + (k.bookingRate != null ? ` (${pct(k.bookingRate)} of leads)` : '')
        + `. Ad spend ${money(k.spend)}`
        + (k.costPerLead != null ? `, ${money(k.costPerLead)} per paid lead` : '')
        + (k.costPerBooking != null ? `, ${money(k.costPerBooking)} per booking` : '') + '.';
    } else {
      headline = `${money(k.revenue)} revenue from ${count(k.orders, 'order', 'orders')}`;
      summary = `${count(k.orders, 'order', 'orders')} and ${money(k.revenue)} revenue${change(c.changes, 'revenue')}. Ad spend ${money(k.spend)}`
        + (k.roas != null ? `, return on ad spend ${k.roas}` : '')
        + (k.costPerOrder != null ? `, ${money(k.costPerOrder)} per order` : '') + '.';
    }
    if (k.cancelled) summary += ` ${c.client === 'clinic' ? count(k.cancelled, 'cancelled booking', 'cancelled bookings') : count(k.cancelled, 'refunded order', 'refunded orders')} not counted.`;
    return {
      client: c.client,
      headline: headline.slice(0, 90),
      summary: summary.slice(0, 600),
      warnings_explained: c.warnings.slice(0, 6).map(w => w.message.slice(0, 300)),
      next_steps: c.warnings.length ? ['Review the data warnings before this report goes to the client.'] : ['No action needed this week.'],
    };
  });
  const flagged = input.clients.filter(c => c.warnings.length).map(c => c.name);
  const overview = flagged.length ? `Data warnings to review for ${flagged.join(' and ')}.` : 'All data checks passed for both clients.';
  return { overview: overview.slice(0, 200), clients };
}
