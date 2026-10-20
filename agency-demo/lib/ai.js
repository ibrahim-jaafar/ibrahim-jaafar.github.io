// What the AI sees, the strict shape its answer must have, checks on that answer, and a template fallback.
// The AI only writes text. It never sees personal data and never types a number: it writes {placeholders}
// and code fills in the real values, so a number in the summary can't be wrong.

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
      const out = {
        client: c.client,
        name: c.name,
        kpis,
        previousKpis,
        changes: pctChanges(kpis, previousKpis),
        warnings: (c.warnings || []).map(w => ({ code: w.code, count: w.count, message: w.message })),
      };
      // what the writer may use, and what the reader will see in its place
      return { ...out, placeholders: placeholderValues(out) };
    }),
  };
}

function checkSchema(value, schema, path, errors, lengths = true) {
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return errors.push(`${path} must be an object`);
    for (const k of schema.required) if (!(k in value)) errors.push(`${path}.${k} is missing`);
    for (const k of Object.keys(value)) {
      if (!schema.properties[k]) errors.push(`${path}.${k} is not allowed`);
      else checkSchema(value[k], schema.properties[k], `${path}.${k}`, errors, lengths);
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value)) return errors.push(`${path} must be a list`);
    if (schema.minItems != null && value.length < schema.minItems) errors.push(`${path} needs at least ${schema.minItems} items`);
    if (schema.maxItems != null && value.length > schema.maxItems) errors.push(`${path} allows at most ${schema.maxItems} items`);
    value.forEach((v, i) => checkSchema(v, schema.items, `${path}[${i}]`, errors, lengths));
  } else if (schema.type === 'string') {
    if (typeof value !== 'string') return errors.push(`${path} must be text`);
    if (lengths && schema.maxLength != null && value.length > schema.maxLength) errors.push(`${path} is too long`);
    if (schema.enum && !schema.enum.includes(value)) errors.push(`${path} must be one of ${schema.enum.join(', ')}`);
  }
}

const roundTo = (n, d) => Math.round(n * 10 ** d) / 10 ** d;
const money = n => `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
const pct = n => `${roundTo(n * 100, 1)}%`;
const MONEY = new Set(['spend', 'costPerLead', 'costPerBooking', 'revenue', 'costPerOrder', 'avgOrderValue']);
const show = (key, v) => (MONEY.has(key) ? money(v) : key === 'bookingRate' ? pct(v) : String(v));
const direction = ch => (ch > 0 ? `up ${ch}%` : ch < 0 ? `down ${-ch}%` : 'unchanged');

// What each {placeholder} becomes for one client. A number with no value (nothing to divide by, no previous report) has none.
export function placeholderValues(c) {
  const out = {};
  for (const [k, v] of Object.entries(c.kpis || {})) if (typeof v === 'number' && Number.isFinite(v)) out[k] = show(k, v);
  for (const [k, v] of Object.entries(c.changes || {})) if (v != null) out[`${k}_change`] = direction(v);
  for (const w of c.warnings || []) { out[`${w.code}_count`] = String(w.count); out[`${w.code}_message`] = w.message; }
  return out;
}

const PLACEHOLDER = /\{(\w+)\}/g;
// "rose {leads_change}" would read "rose down 33%": the change already says which way
const DIRECTION_WORD = /\b(?:rose|rise|risen|rising|fell|fall|fallen|falling|increased?|increasing|decreased?|decreasing|grew|grow|grown|dropped|drop|declined?|up|down|higher|lower|gained?|lost)\s+(?:by\s+)?\{\w+_change\}/i;

// The writer never types a number: it writes {placeholders} and code puts the real values in.
function fill(text, values, path, errors) {
  if (/\d/.test(text.replace(PLACEHOLDER, ''))) errors.push(`${path} types a number instead of using a placeholder`);
  if (DIRECTION_WORD.test(text)) errors.push(`${path} says up or down next to a change that already says it`);
  return text.replace(PLACEHOLDER, (m, name) => {
    if (!(name in values)) { errors.push(`${path} uses {${name}}, which has no value`); return m; }
    return values[name];
  });
}

export function validateAiOutput(raw, input) {
  let value = raw;
  if (typeof raw === 'string') {
    try { value = JSON.parse(raw); } catch { return { ok: false, errors: ['answer is not valid JSON'] }; }
  }
  const errors = [];
  checkSchema(value, AI_SCHEMA, 'answer', errors, false); // lengths are checked after filling: {costPerBooking_change} is longer than "up 58%"
  if (errors.length) return { ok: false, errors };
  if (new Set(value.clients.map(c => c.client)).size !== 2) return { ok: false, errors: ['answer must cover the clinic and the store once each'] };

  const values = Object.fromEntries(input.clients.map(c => [c.client, placeholderValues(c)]));
  const filled = {
    overview: fill(value.overview, {}, 'overview', errors), // the overview spans both clients, so it has no numbers
    clients: value.clients.map((c, i) => {
      const v = values[c.client] || {}, p = `clients[${i}]`;
      return {
        ...c,
        headline: fill(c.headline, v, `${p}.headline`, errors),
        summary: fill(c.summary, v, `${p}.summary`, errors),
        warnings_explained: c.warnings_explained.map((t, j) => fill(t, v, `${p}.warnings_explained[${j}]`, errors)),
        next_steps: c.next_steps.map((t, j) => fill(t, v, `${p}.next_steps[${j}]`, errors)),
      };
    }),
  };
  if (!errors.length) checkSchema(filled, AI_SCHEMA, 'answer', errors); // now the lengths, as the reader will see them
  return errors.length ? { ok: false, errors } : { ok: true, value: filled };
}

const count = (n, key, one, many) => `{${key}} ${n === 1 ? one : many}`;
const change = (ch, key) => (ch && ch[key] != null ? ` ({${key}_change} compared with the last run)` : '');

// The fallback summary, written with the same placeholders as the AI and checked by the same code.
export function templateDraft(input) {
  const clients = input.clients.map(c => {
    const k = c.kpis;
    let headline, summary;
    if (!k.leads) {
      headline = 'No leads yet this week';
      summary = 'No leads yet this week, with {spend} of ad spend so far.';
    } else if (c.client === 'clinic') {
      headline = `${count(k.leads, 'leads', 'lead', 'leads')} and ${count(k.bookings, 'bookings', 'booked consultation', 'booked consultations')}`;
      summary = `${count(k.leads, 'leads', 'lead', 'leads')}${change(c.changes, 'leads')}, ${count(k.bookings, 'bookings', 'booked consultation', 'booked consultations')}`
        + (k.bookingRate != null ? ' ({bookingRate} of leads)' : '')
        + '. Ad spend {spend}'
        + (k.costPerLead != null ? ', {costPerLead} per paid lead' : '')
        + (k.costPerBooking != null ? ', {costPerBooking} per booking' : '') + '.';
    } else {
      headline = `{revenue} revenue from ${count(k.orders, 'orders', 'order', 'orders')}`;
      summary = `${count(k.orders, 'orders', 'order', 'orders')} and {revenue} revenue${change(c.changes, 'revenue')}. Ad spend {spend}`
        + (k.roas != null ? ', return on ad spend {roas}' : '')
        + (k.costPerOrder != null ? ', {costPerOrder} per order' : '') + '.';
    }
    if (k.cancelled) summary += ` ${c.client === 'clinic' ? count(k.cancelled, 'cancelled', 'cancelled booking', 'cancelled bookings') : count(k.cancelled, 'cancelled', 'refunded order', 'refunded orders')} not counted.`;
    return {
      client: c.client,
      headline,
      summary,
      warnings_explained: c.warnings.slice(0, 6).map(w => `{${w.code}_message}`),
      next_steps: c.warnings.length ? ['Review the data warnings before this report goes to the client.'] : ['No action needed this week.'],
    };
  });
  const flagged = input.clients.filter(c => c.warnings.length).map(c => c.name);
  const overview = flagged.length ? `Data warnings to review for ${flagged.join(' and ')}.` : 'All data checks passed for both clients.';
  return { overview, clients };
}

export function templateSummary(input) {
  const r = validateAiOutput(templateDraft(input), input);
  if (!r.ok) throw new Error(`template summary is broken: ${r.errors[0]}`); // a bug in this file, never the data
  return r.value;
}
