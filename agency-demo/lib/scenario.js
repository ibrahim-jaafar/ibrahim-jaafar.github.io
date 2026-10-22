// The test scenario a visitor picks. Anything not on the whitelist is ignored.
// (a broken AI answer is tried on the dashboard's Generate button, not in the run)
export const PROBLEMS = ['missing_source', 'duplicates', 'meta_mismatch', 'bad_totals', 'edge_cases'];

export function parseScenario(body) {
  const fallback = { mode: 'random', problems: [] };
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fallback;
  if (body.mode === 'clean') return { mode: 'clean', problems: [] };
  if (body.mode !== 'custom' || !Array.isArray(body.problems)) return fallback;
  const picked = PROBLEMS.filter(p => body.problems.slice(0, 50).includes(p));
  return picked.length ? { mode: 'custom', problems: picked } : { mode: 'clean', problems: [] };
}

export function resolveProblems(scenario, rng) {
  if (scenario.mode === 'clean') return [];
  if (scenario.mode === 'custom') return [...scenario.problems];
  return PROBLEMS.filter(() => rng() < 0.35);
}
