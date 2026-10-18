// KPI maths. Any ratio with nothing to divide by is null, never Infinity or NaN.
import { inPeriod } from './leads.js';

const cents = n => Math.round(n * 100) / 100;
const ratio = (a, b, round) => (b ? round(a / b) : null);

export function computeKpis(client, leads, spend, weekStart) {
  const inWeek = leads.filter(l => inPeriod(l, weekStart));
  const total = cents(spend.campaigns.reduce((a, c) => a + c.spend, 0));
  const paidLeads = inWeek.filter(l => l.source !== 'organic').length;
  const conv = inWeek.filter(l => l.outcome === 'converted');
  const base = {
    spend: total,
    leads: inWeek.length,
    paidLeads,
    costPerLead: ratio(total, paidLeads, cents),
    cancelled: inWeek.filter(l => l.outcome === 'cancelled').length,
  };
  if (client === 'clinic') {
    return {
      ...base,
      bookings: conv.length,
      costPerBooking: ratio(total, conv.length, cents),
      bookingRate: ratio(conv.length, inWeek.length, n => Math.round(n * 10000) / 10000),
    };
  }
  const revenue = cents(conv.reduce((a, l) => a + l.value, 0));
  return {
    ...base,
    orders: conv.length,
    revenue,
    roas: ratio(revenue, total, cents),
    costPerOrder: ratio(total, conv.length, cents),
    avgOrderValue: ratio(revenue, conv.length, cents),
  };
}
