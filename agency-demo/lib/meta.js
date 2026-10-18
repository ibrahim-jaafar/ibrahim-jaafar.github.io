// Meta Conversions API events. Personal fields are normalised and SHA-256 hashed, as Meta requires.
import { normalisePhone } from './leads.js';

export function hashField(value, sha256) {
  const v = String(value ?? '').trim().toLowerCase();
  return v ? sha256(v) : undefined;
}

export function buildMetaEvents(client, leads, problems, nowSec, sha256) {
  const conv = leads.filter(l => l.outcome === 'converted');
  const skipped = problems.includes('meta_mismatch') ? (conv.length >= 3 ? 2 : Math.min(1, conv.length)) : 0;

  const toEvent = (l, eventTime, eventId) => {
    const ud = {
      em: hashField(l.email, sha256),
      ph: hashField(`961${normalisePhone(l.phone)}`, sha256),
      fn: hashField(l.firstName, sha256),
      ln: hashField(l.lastName, sha256),
    };
    const user_data = Object.fromEntries(Object.entries(ud).filter(([, v]) => v).map(([k, v]) => [k, [v]]));
    const e = {
      event_name: client === 'clinic' ? 'Schedule' : 'Purchase',
      // ponytail: "now" rather than the lead's own time — Meta rejects future times and anything over 7 days old
      event_time: eventTime,
      action_source: 'system_generated',
      event_id: eventId,
      user_data,
    };
    if (client === 'store') e.custom_data = { value: l.value, currency: 'USD' };
    return e;
  };

  const events = conv.slice(skipped).map(l => toEvent(l, nowSec, l.id));
  // edge case: one extra, too-old event that Meta will reject; sent on its own so it can't sink the real batch
  const edgeEvents = problems.includes('edge_cases')
    ? [toEvent({ email: 'old.event@example.com', phone: '70000000', firstName: 'Old', lastName: 'Event', value: 100 }, nowSec - 10 * 86400, `${client}-edge-old-${nowSec}`)]
    : [];
  return { events, edgeEvents, skipped };
}
