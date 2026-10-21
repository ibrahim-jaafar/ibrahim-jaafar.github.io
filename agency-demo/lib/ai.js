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

// What each {placeholder} becomes for one client. A number with no value (nothing to divide by, no earlier figure) has none.
export function placeholderValues(c) {
  const out = {};
  for (const [k, v] of Object.entries(c.kpis || {})) if (typeof v === 'number' && Number.isFinite(v)) out[k] = show(k, v);
  for (const [k, v] of Object.entries(c.changes || {})) if (v != null) out[`${k}_change`] = direction(v);
  for (const w of c.warnings || []) { out[`${w.code}_count`] = String(w.count); out[`${w.code}_message`] = w.message; }
  return out;
}

// What each number must be called near its placeholder (words), what it must not sit right after (not: another
// number's label), and how the AI is shown to use it (example). Words are matched in lower case, inside the sentence.
export const LABELS = {
  spend: { words: ['spend', 'spent', 'budget'], not: ['return on', 'per '], example: 'ad spend was {spend}' },
  leads: { words: ['lead', 'enquiry', 'enquiries'], not: ['per ', 'cost', 'rate'], example: '{leads} leads came in' },
  paidLeads: { words: ['paid lead', 'from ads', 'from paid'], not: ['per ', 'cost'], example: '{paidLeads} paid leads' },
  costPerLead: { words: ['per lead', 'per paid lead', 'each lead', 'each paid lead'], example: 'cost per paid lead was {costPerLead}' },
  cancelled: { words: ['cancel', 'refund'], example: '{cancelled} cancelled bookings' },
  bookings: { words: ['booking', 'booked', 'consultation', 'appointment'], not: ['per ', 'cost', 'rate'], example: '{bookings} booked consultations' },
  costPerBooking: { words: ['per booking', 'each booking', 'per consultation', 'per appointment'], example: 'cost per booking was {costPerBooking}' },
  bookingRate: { words: ['rate', 'of leads', 'of all leads'], example: 'a booking rate of {bookingRate}' },
  orders: { words: ['order', 'purchase'], not: ['per ', 'cost', 'average', 'value'], example: '{orders} orders' },
  revenue: { words: ['revenue', 'sales', 'income'], not: ['per ', 'average'], example: 'revenue was {revenue}' },
  roas: { words: ['return on ad spend', 'roas'], example: 'return on ad spend was {roas}' },
  costPerOrder: { words: ['per order', 'each order'], example: 'cost per order was {costPerOrder}' },
  avgOrderValue: { words: ['average order', 'order value'], example: 'the average order was {avgOrderValue}' },
};
// counts of the checks' warnings, by warning code
export const COUNT_LABELS = {
  meta_mismatch: { words: ['meta', 'facebook'], example: 'Meta is missing {meta_mismatch_count} bookings' },
  missing_source: { words: ['source', 'which ad', 'where they came', 'where it came'], example: '{missing_source_count} leads have no recorded source' },
  duplicates: { words: ['twice', 'duplicate', 'same person', 'more than once'], example: '{duplicates_count} leads appear twice' },
  bad_totals: { words: ['total'], example: '{bad_totals_count} total that does not add up' },
  outlier: { words: ['order', 'large', 'unusual'], example: '{outlier_count} unusually large order' },
  meta_rejected: { words: ['meta', 'facebook', 'reject', 'refuse', 'refused'], example: 'Meta rejected {meta_rejected_count} events' },
};
const labelOf = name => (name.endsWith('_message') ? null
  : name.endsWith('_count') ? COUNT_LABELS[name.slice(0, -6)]
  : LABELS[name.endsWith('_change') ? name.slice(0, -7) : name]);

// The guide the AI gets, made from the same list the check uses, so the two can't disagree.
export function placeholderGuide() {
  const line = (name, l) => `{${name}}: next to "${l.words.join('" or "')}", e.g. "${l.example}"`;
  return [
    'Every placeholder needs its own label within a few words of it, in the same sentence, like these examples. A placeholder without its label nearby, or right after another number\'s label, makes the answer invalid.',
    ...Object.entries(LABELS).map(([k, l]) => line(k, l)),
    'A {name_change} placeholder needs the same label as {name}, e.g. "leads were {leads_change} on the previous week" or "cost per lead was {costPerLead_change} on the previous week".',
    ...Object.entries(COUNT_LABELS).map(([k, l]) => line(`${k}_count`, l)),
    'A {code_message} placeholder is the check\'s own sentence: put it on its own, e.g. "{duplicates_message}".',
  ].join('\n');
}

const words = s => s.trim().split(/\s+/).filter(Boolean);
const metric = name => name.replace(/_change$/, ''); // {spend} and {spend_change} share a label
const has = (text, w) => new RegExp(`\\b${w}`).test(text); // whole words: "rate" is not in "generated" (label words are plain letters)
const ALL_WORDS = Object.values(LABELS).flatMap(l => l.words);
// Each placeholder looks at the words around it, back to the previous placeholder and on to the next one, within the sentence.
// If its label isn't there, it may borrow it from a placeholder of the same number beside it, unless another number's
// label sits right before it: "cost per lead was {costPerLead}, which is {costPerLead_change}" labels both, but
// "cost per lead was {costPerLead} and cost per booking was {costPerLead_change}" is refused.
function checkLabels(text, path, errors) {
  const marks = [...text.matchAll(PLACEHOLDER)];
  const strip = t => t.replace(PLACEHOLDER, ' ');
  const around = (k, a, b) => { // the words before marks[k] (back to marks[a-1]) and after it (on to marks[b+1])
    const m = marks[k], from = a ? marks[a - 1].index + marks[a - 1][0].length : 0, to = b < marks.length - 1 ? marks[b + 1].index : text.length;
    const before = words(strip(text.slice(from, m.index)).split(/[.!?;]/).pop()), after = words(strip(text.slice(m.index + m[0].length, to)).split(/[.!?;]/)[0]);
    return { near: [...before.slice(-10), ...after.slice(0, 8)].join(' ').toLowerCase(), right: before.slice(-5).join(' ').toLowerCase() };
  };
  marks.forEach((m, k) => {
    const label = labelOf(m[1]);
    if (!label) return; // unknown names are refused by fill()
    const own = around(k, k, k);
    let ok = label.words.some(w => has(own.near, w));
    if (!ok) {
      let a = k, b = k;
      while (a > 0 && metric(marks[a - 1][1]) === metric(m[1])) a--;
      while (b < marks.length - 1 && metric(marks[b + 1][1]) === metric(m[1])) b++;
      const other = ALL_WORDS.filter(w => !label.words.includes(w));
      ok = (a < k || b > k) && label.words.some(w => has(around(k, a, b).near, w)) && !other.some(w => has(own.right, w));
    }
    if (!ok) errors.push(`${path}: {${m[1]}} has no "${label.words[0]}" near it`);
    else if ((label.not || []).some(w => has(own.right, w))) errors.push(`${path}: {${m[1]}} comes right after another number's label`);
  });
}

const PLACEHOLDER = /\{(\w+)\}/g;
// "rose {leads_change}" would read "rose down 33%": the change already says which way
const DIRECTION_WORD = /\b(?:rose|rise|risen|rising|fell|fall|fallen|falling|increased?|increasing|decreased?|decreasing|grew|grow|grown|dropped|drop|declined?|up|down|higher|lower|gained?|lost)\s+(?:by\s+)?\{\w+_change\}/i;

// The writer never types a number: it writes {placeholders} and code puts the real values in.
function fill(text, values, path, errors) {
  if (/\d/.test(text.replace(PLACEHOLDER, ''))) errors.push(`${path} types a number instead of using a placeholder`);
  if (DIRECTION_WORD.test(text)) errors.push(`${path} says up or down next to a change that already says it`);
  checkLabels(text, path, errors);
  return text.replace(PLACEHOLDER, (m, name) => {
    if (!(name in values)) { errors.push(`${path} uses {${name}}, which has no value`); return m; }
    return values[name];
  });
}

// The first reply that passes the checks wins. `broken` is the demo's "AI gives a bad answer": every reply becomes a refusal.
export function pickAiAnswer(replies, input, broken = false) {
  const errors = [];
  let gotAnswer = false;
  for (const r of replies) {
    let raw = r?.statusCode === 200 ? r.body?.choices?.[0]?.message?.content : null;
    if (raw != null && broken) raw = "Sorry, I can't help with that.";
    if (raw == null) { errors.push(`AI service answered ${r?.statusCode ?? 'nothing'}`); continue; }
    gotAnswer = true;
    const v = validateAiOutput(raw, input);
    if (v.ok) return { value: v.value, gotAnswer, errors };
    errors.push(...v.errors);
  }
  return { value: null, gotAnswer, errors };
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
const change = (ch, key) => (ch && ch[key] != null ? ` ({${key}_change} compared with the previous week)` : '');

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
