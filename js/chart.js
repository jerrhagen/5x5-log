// Liten SVG-linjegraf med hårkors + tooltip. Inga beroenden.

const NS = 'http://www.w3.org/2000/svg';
const DAY = 86400000;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

const el = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const toMs = (iso) => Date.parse(`${iso}T12:00:00`);
const fmt = (n) => Number(n).toLocaleString('sv-SE', { maximumFractionDigits: 1 });

function niceStep(range, count) {
  const raw = range / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
}

/**
 * series: [{ key, name, color, points: [{ date: 'YYYY-MM-DD', y, hollow?, note? }] }]
 * opts:   { unit: 'kg', height, gapDays, tooltipExtra(date) → string }
 */
export function lineChart(container, series, opts = {}) {
  container.innerHTML = '';
  container.classList.add('chart');
  const unit = opts.unit ?? 'kg';
  const all = series.flatMap((s) => s.points);
  if (!all.length) {
    container.innerHTML = '<p class="empty">Inga pass i valt intervall.</p>';
    return;
  }

  const W = Math.max(280, container.clientWidth);
  const H = opts.height ?? (W < 500 ? 260 : 320);
  const m = { l: 34, r: 44, t: 14, b: 26 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;

  let x0 = Math.min(...all.map((p) => toMs(p.date)));
  let x1 = Math.max(...all.map((p) => toMs(p.date)));
  if (x1 - x0 < 7 * DAY) { x0 -= 3 * DAY; x1 += 3 * DAY; }
  const yMaxRaw = Math.max(...all.map((p) => p.y));
  const yStep = niceStep(yMaxRaw || 1, H < 300 ? 4 : 5);
  const yMax = Math.ceil((yMaxRaw * 1.05) / yStep) * yStep;
  const X = (iso) => m.l + ((toMs(iso) - x0) / (x1 - x0)) * iw;
  const Y = (v) => m.t + ih - (v / yMax) * ih;

  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': opts.label || 'Graf' });
  container.appendChild(svg);

  // Rutnät + y-axel
  const grid = el('g', { class: 'grid' }, svg);
  for (let v = 0; v <= yMax + 1e-9; v += yStep) {
    el('line', { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), class: v === 0 ? 'baseline' : 'gridline' }, grid);
    const t = el('text', { x: m.l - 6, y: Y(v) + 4, 'text-anchor': 'end', class: 'tick' }, grid);
    t.textContent = fmt(v);
  }

  // x-axel: månader
  const spanDays = (x1 - x0) / DAY;
  const monthStep = spanDays > 900 ? 6 : spanDays > 400 ? 3 : spanDays > 160 ? 2 : 1;
  const maxTicks = Math.floor(iw / 48);
  const ticks = [];
  const d = new Date(x0);
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  while (d.getTime() <= x1) {
    if (d.getMonth() % monthStep === 0) ticks.push(new Date(d));
    d.setMonth(d.getMonth() + 1);
  }
  const every = Math.max(1, Math.ceil(ticks.length / maxTicks));
  ticks.filter((_, i) => i % every === 0).forEach((t) => {
    const x = m.l + ((t.getTime() - x0) / (x1 - x0)) * iw;
    const label = t.getMonth() === 0 || spanDays > 400 ? `${MONTHS[t.getMonth()]} ’${String(t.getFullYear()).slice(2)}` : MONTHS[t.getMonth()];
    const tx = el('text', { x, y: H - 8, 'text-anchor': 'middle', class: 'tick' }, grid);
    tx.textContent = label;
  });

  // Linjer: långa uppehåll ritas streckade
  const gap = (opts.gapDays ?? 35) * DAY;
  const marks = el('g', {}, svg);
  for (const s of series) {
    const pts = s.points;
    if (!pts.length) continue;
    const solid = [];
    const dashed = [];
    for (let i = 1; i < pts.length; i++) {
      const seg = `M${X(pts[i - 1].date)},${Y(pts[i - 1].y)}L${X(pts[i].date)},${Y(pts[i].y)}`;
      (toMs(pts[i].date) - toMs(pts[i - 1].date) > gap ? dashed : solid).push(seg);
    }
    el('path', { d: solid.join(''), class: 'series-line', style: `stroke:${s.color}` }, marks);
    if (dashed.length) el('path', { d: dashed.join(''), class: 'series-line gap', style: `stroke:${s.color}` }, marks);
  }
  const dense = all.length / series.length > iw / 9;
  for (const s of series) {
    for (const p of s.points) {
      if (dense && !p.hollow) continue;
      el('circle', {
        cx: X(p.date), cy: Y(p.y), r: p.hollow ? 4 : 3.5,
        class: p.hollow ? 'dot hollow' : 'dot',
        style: p.hollow ? `stroke:${s.color}` : `fill:${s.color}`,
      }, marks);
    }
  }

  // Direktetiketter vid sista punkten (knuffas isär så de inte krockar)
  const ends = series
    .filter((s) => s.points.length)
    .map((s) => ({ s, p: s.points.at(-1), y: Y(s.points.at(-1).y) }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 13) ends[i].y = ends[i - 1].y + 13;
  for (const e of ends) {
    const t = el('text', { x: X(e.p.date) + 7, y: e.y + 4, class: 'end-label' }, svg);
    t.textContent = fmt(e.p.y);
  }

  // Hover / touch: hårkors + tooltip
  const dates = [...new Set(all.map((p) => p.date))].sort();
  const cross = el('line', { y1: m.t, y2: m.t + ih, class: 'crosshair', visibility: 'hidden' }, svg);
  const hi = el('g', {}, svg);
  const tip = document.createElement('div');
  tip.className = 'tooltip';
  tip.hidden = true;
  container.appendChild(tip);
  const hit = el('rect', { x: m.l - 8, y: 0, width: iw + 16, height: H, class: 'hit' }, svg);

  const show = (clientX) => {
    const rect = svg.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * W;
    let best = dates[0];
    for (const dt of dates) if (Math.abs(X(dt) - px) < Math.abs(X(best) - px)) best = dt;
    const x = X(best);
    cross.setAttribute('x1', x);
    cross.setAttribute('x2', x);
    cross.setAttribute('visibility', 'visible');
    hi.innerHTML = '';
    const rows = [];
    for (const s of series) {
      const p = s.points.find((q) => q.date === best);
      if (!p) continue;
      el('circle', { cx: x, cy: Y(p.y), r: 5.5, class: 'dot active', style: `fill:${s.color}` }, hi);
      rows.push(`<div class="tt-row"><i style="background:${s.color}"></i><span>${esc(s.name)}</span><b>${fmt(p.y)} ${unit}</b>${p.hollow ? ' <em>miss</em>' : ''}</div>`);
    }
    const dt = new Date(toMs(best));
    const extra = opts.tooltipExtra ? opts.tooltipExtra(best) : '';
    tip.innerHTML = `<div class="tt-date">${dt.toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</div>${rows.join('')}${extra}`;
    tip.hidden = false;
    const cw = container.clientWidth;
    const left = (x / W) * rect.width;
    const tw = tip.offsetWidth;
    tip.style.left = `${Math.min(Math.max(4, left + 12 + tw > cw ? left - tw - 12 : left + 12), cw - tw - 4)}px`;
    tip.style.top = `${m.t}px`;
  };
  const hide = () => {
    cross.setAttribute('visibility', 'hidden');
    hi.innerHTML = '';
    tip.hidden = true;
  };
  hit.addEventListener('pointermove', (e) => show(e.clientX));
  hit.addEventListener('pointerdown', (e) => show(e.clientX));
  hit.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
  svg.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
}
