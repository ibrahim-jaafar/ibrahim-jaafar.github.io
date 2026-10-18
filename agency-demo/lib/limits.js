// Who may start a run right now. A second visitor joins the running run instead of starting another.
export const GAP_SEC = 60;
export const DAILY_MAX = 50;
const STUCK_SEC = 600;

export function checkLimits(runs, now) {
  const ageSec = r => (+now - Date.parse(r.created_at)) / 1000;
  const active = runs.find(r => r.status === 'running' && ageSec(r) < STUCK_SEC);
  if (active) return { ok: false, reason: 'running', runId: active.id, retryAfterSec: 0 };

  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (runs.filter(r => Date.parse(r.created_at) >= dayStart).length >= DAILY_MAX) {
    return { ok: false, reason: 'daily', retryAfterSec: Math.ceil((dayStart + 864e5 - +now) / 1000) };
  }

  const newest = Math.min(...runs.map(ageSec));
  if (newest < GAP_SEC) return { ok: false, reason: 'gap', retryAfterSec: Math.ceil(GAP_SEC - newest) };
  return { ok: true };
}
