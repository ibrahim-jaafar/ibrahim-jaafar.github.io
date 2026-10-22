// Small SVG charts for the dashboard: one y-scale per chart, thin marks, recessive grid,
// a crosshair and tooltip on hover (and keyboard focus). Text always goes in as textContent.
const NS = 'http://www.w3.org/2000/svg';
const PAD = { l: 52, r: 12, t: 10, b: 32 };
const W = 480, H = 180;

function el(tag, attrs = {}, ...kids) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  n.append(...kids.filter(Boolean));
  return n;
}
function div(cls, ...kids) {
  const n = document.createElement('div');
  n.className = cls;
  n.append(...kids.filter(Boolean));
  return n;
}

// the axis top: 4 round steps, so tick labels read cleanly; counts only get whole-number steps
const STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
function niceMax(v, whole) {
  if (!(v > 0)) return 4;
  const raw = v / 4, p = 10 ** Math.floor(Math.log10(raw));
  const step = STEPS.map(f => f * p).find(st => st >= raw - 1e-9 && (!whole || Number.isInteger(st))) ?? 10 * p;
  return 4 * Math.max(whole ? 1 : 0, step);
}

// A smooth line through the points that never overshoots them (monotone cubic, as in d3's curveMonotoneX),
// so a curve can't dip below zero or show a peak that isn't in the data.
export function smoothPath(pts) {
  const f = n => n.toFixed(1), n = pts.length;
  if (n < 3) return pts.map(([px, py], i) => `${i ? 'L' : 'M'}${f(px)},${f(py)}`).join('');
  const dx = [], m = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0]; m[i] = (pts[i + 1][1] - pts[i][1]) / dx[i]; }
  const t = pts.map((_, i) => (i === 0 ? m[0] : i === n - 1 ? m[n - 2]
    : m[i - 1] * m[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i])));
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], h = dx[i] / 3;
    d += `C${f(x0 + h)},${f(y0 + t[i] * h)} ${f(x1 - h)},${f(y1 - t[i + 1] * h)} ${f(x1)},${f(y1)}`;
  }
  return d;
}

// series: [{ key, label, color }]; kind 'line' or 'bar'; fmt(value) for axis and tooltip
// whole: counts, so the axis steps are whole numbers
// tipFmt: the tooltip's exact value (the axis can round, e.g. $3.4k)
export function chart({ title, points, series, kind = 'line', fmt = String, tipFmt = fmt, highlight, whole = false, empty = 'No data for this period yet.' }) {
  const box = div('chart');
  box.append(div('chart-title', title));
  if (series.length > 1) {
    box.append(div('chart-legend', ...series.map(s => {
      const k = document.createElement('span');
      k.append(el('svg', { width: 18, height: 8, 'aria-hidden': 'true' }, el('line', { x1: 1, y1: 4, x2: 17, y2: 4, stroke: s.color, 'stroke-width': 2, 'stroke-linecap': 'round' })));
      k.append(s.label);
      return k;
    })));
  }
  if (!points.length) { box.append(div('chart-empty', empty)); return box; }

  const vals = points.flatMap(p => series.map(s => p[s.key])).filter(v => typeof v === 'number');
  const top = Math.max(0, ...vals);
  const max = niceMax(top, whole);
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
  const step = iw / points.length;
  const x = i => PAD.l + step * (i + 0.5);
  const y = v => PAD.t + ih - (v / max) * ih;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', role: 'img', 'aria-label': `${title}: ${points.length} points` });

  for (let g = 0; g <= 4; g++) {
    const v = (max / 4) * g, yy = y(v);
    svg.append(el('line', { x1: PAD.l, x2: W - PAD.r, y1: yy, y2: yy, class: g ? 'grid' : 'axis' }));
    const t = el('text', { x: PAD.l - 8, y: yy + 4, class: 'tick', 'text-anchor': 'end' });
    t.textContent = fmt(v);
    svg.append(t);
  }
  // x labels: drawn for every point, then thinned to what fits the chart's width (see the resize below)
  const xLabels = points.map((p, i) => {
    const t = el('text', { x: x(i), y: H - 4, class: 'tick', 'text-anchor': 'middle' });
    t.textContent = p.label;
    svg.append(t);
    return t;
  });
  const thin = fit => {
    // every Nth label plus the last one, but never one squeezed against the last
    const every = Math.max(1, Math.ceil(points.length / fit)), last = points.length - 1;
    xLabels.forEach((t, i) => t.setAttribute('visibility', i === last || (i % every === 0 && last - i >= every) ? 'visible' : 'hidden'));
  };
  thin(7);

  if (kind === 'bar') {
    const s = series[0], bw = Math.max(3, Math.min(28, step - 4));
    points.forEach((p, i) => {
      const v = p[s.key] ?? 0, top = y(v), hgt = PAD.t + ih - top;
      // a zero still gets a thin mark on the baseline, so "none that day" is visible
      if (hgt <= 0) { if (typeof p[s.key] === 'number') svg.append(el('rect', { x: x(i) - bw / 2, y: PAD.t + ih - 2, width: bw, height: 2, rx: 1, fill: s.color, opacity: 0.5 })); return; }
      const r = Math.min(4, bw / 2, hgt);
      // rounded at the data end, square on the baseline
      const x0 = x(i) - bw / 2, x1 = x0 + bw, b = PAD.t + ih;
      svg.append(el('path', { d: `M${x0},${b}V${top + r}Q${x0},${top} ${x0 + r},${top}H${x1 - r}Q${x1},${top} ${x1},${top + r}V${b}Z`,
        fill: s.color, opacity: highlight && p.key !== highlight ? 0.45 : 1 }));
    });
  } else {
    for (const s of series) {
      // a gap (no figure) breaks the line; each unbroken run is drawn as one smooth curve
      const runs = [[]];
      points.forEach((p, i) => {
        const v = p[s.key];
        if (typeof v !== 'number') { if (runs.at(-1).length) runs.push([]); return; }
        runs.at(-1).push([x(i), y(v)]);
      });
      const d = runs.filter(r => r.length).map(smoothPath).join('');
      svg.append(el('path', { d, fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      if (points.length === 1 || highlight) points.forEach((p, i) => {
        if (typeof p[s.key] === 'number' && (points.length === 1 || p.key === highlight)) svg.append(el('circle', { cx: x(i), cy: y(p[s.key]), r: 4, fill: s.color, stroke: '#fff', 'stroke-width': 2 }));
      });
    }
  }

  // hover layer: crosshair snaps to the nearest point; one tooltip lists every series
  const hair = el('line', { y1: PAD.t, y2: PAD.t + ih, class: 'hair', visibility: 'hidden' });
  const dots = series.map(s => el('circle', { r: 4, fill: s.color, stroke: '#fff', 'stroke-width': 2, visibility: 'hidden' }));
  svg.append(hair, ...dots, el('rect', { x: PAD.l, y: PAD.t, width: iw, height: ih, fill: 'transparent', class: 'hit' }));
  const tip = div('chart-tip');
  tip.hidden = true;
  // screen readers hear the hovered or focused point through this
  const said = div('sr-only');
  said.setAttribute('aria-live', 'polite');
  const wrap = div('chart-wrap', svg, tip, said);
  wrap.tabIndex = 0;
  wrap.setAttribute('role', 'group');
  wrap.setAttribute('aria-label', `${title}. Use the left and right arrow keys to read each point.`);
  let at = -1;
  const show = i => {
    at = Math.max(0, Math.min(points.length - 1, i));
    const p = points[at];
    hair.setAttribute('x1', x(at)); hair.setAttribute('x2', x(at)); hair.setAttribute('visibility', 'visible');
    series.forEach((s, k) => {
      const v = p[s.key];
      dots[k].setAttribute('visibility', typeof v === 'number' && kind === 'line' ? 'visible' : 'hidden');
      if (typeof v === 'number') { dots[k].setAttribute('cx', x(at)); dots[k].setAttribute('cy', y(v)); }
    });
    tip.replaceChildren(div('tip-head', p.label), ...series.map(s => {
      const row = div('tip-row');
      const key = document.createElement('i');
      key.style.background = s.color;
      const b = document.createElement('b');
      b.textContent = typeof p[s.key] === 'number' ? tipFmt(p[s.key]) : '—';
      row.append(key, b, ` ${s.label}`);
      return row;
    }));
    tip.hidden = false;
    said.textContent = `${p.label}: ${series.map(s => `${s.label} ${typeof p[s.key] === 'number' ? tipFmt(p[s.key]) : 'no figure'}`).join(', ')}`;
    const left = (x(at) / W) * 100;
    tip.style.left = `${left}%`;
    tip.style.transform = `translateX(${left > 60 ? '-105%' : '5%'})`;
  };
  const hide = () => { hair.setAttribute('visibility', 'hidden'); dots.forEach(d => d.setAttribute('visibility', 'hidden')); tip.hidden = true; };
  wrap.addEventListener('pointermove', e => {
    const r = svg.getBoundingClientRect();
    show(Math.floor((((e.clientX - r.left) / r.width) * W - PAD.l) / step));
  });
  wrap.addEventListener('pointerleave', hide);
  wrap.addEventListener('focus', () => show(at < 0 ? points.length - 1 : at));
  wrap.addEventListener('blur', hide);
  wrap.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') { show(at - 1); e.preventDefault(); }
    if (e.key === 'ArrowRight') { show(at + 1); e.preventDefault(); }
  });
  box.append(wrap);
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(([e]) => {
      const w = e.contentRect.width;
      if (w > 0) {
        svg.style.setProperty('--tick', `${Math.max(11, (11 * W) / w)}px`);
        thin(Math.max(3, Math.min(7, Math.floor(w / 75))));
      }
    }).observe(svg);
  }
  return box;
}
