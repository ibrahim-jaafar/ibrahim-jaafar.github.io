// Simulated ad spend (real spend only exists when real ads run). Clearly labelled simulated.
import { CAMPAIGNS } from './leads.js';

const roundCents = n => Math.round(n * 100) / 100;

export function simulateSpend(client, leads, problems, rng) {
  const unknown = leads.filter(l => l.source === null).length;
  const campaigns = CAMPAIGNS[client].map((name, i) => {
    const paidLeads = leads.filter(l => l.source === name).length;
    // leads with a lost source still came from some ad: spread them over the campaigns
    const billed = paidLeads + Math.floor(unknown / 3) + (i < unknown % 3 ? 1 : 0);
    const spend = roundCents(Math.max(1, billed) * (15 + rng() * 15));
    return { name, spend, paidLeads };
  });
  const total = roundCents(campaigns.reduce((a, c) => a + c.spend, 0));
  let reportedTotal = total;
  if (problems.includes('bad_totals')) {
    const off = 0.05 + rng() * 0.15;
    reportedTotal = roundCents(total * (rng() < 0.5 ? 1 - off : 1 + off));
  }
  return { campaigns, reportedTotal, simulated: true };
}
