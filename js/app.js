import * as L from './logic.js';
import { store, sync, ping, fetchTabs } from './data.js';
import { lineChart } from './chart.js';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const kg = L.fmtKg;

// Färg följer övningen (validerad kategorisk palett, se css/style.css).
const COLOR = { squat: 'var(--s1)', bench: 'var(--s2)', row: 'var(--s3)', ohp: 'var(--s4)', deadlift: 'var(--s5)' };
const colorOf = (key) => COLOR[key] || 'var(--ink-3)';

const fmtDate = (iso, opts = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('sv-SE', opts);

let tab = ['log', 'history', 'progress', 'settings'].includes(store.ui.tab) ? store.ui.tab : 'log';
let draft = store.getDraft();
let historyLimit = 30;
let syncState = { busy: false, error: null };

// ---------------------------------------------------------------- utkast

function freshDraft(workout) {
  return { ...L.buildSession(store.sessions, workout || L.nextWorkout(store.sessions), store.settings), touched: false };
}

function ensureDraft() {
  // Ett orört utkast byggs om så att förslagen alltid utgår från senaste data och dagens datum.
  if (!draft || (!draft.touched && !draft.editing)) draft = freshDraft(draft?.touched ? draft.workout : undefined);
}

function touch() {
  draft.touched = true;
  store.setDraft(draft);
}

function otherSessions() {
  return store.sessions.filter((s) => s.id !== draft.id);
}

function lastFor(key, beforeDate) {
  return L.sortByDateDesc(otherSessions())
    .filter((s) => s.date <= beforeDate)
    .map((s) => ({ s, e: s.exercises.find((e) => e.key === key && e.sets.some((r) => r != null)) }))
    .find((x) => x.e);
}

// ---------------------------------------------------------------- vy: pass

function setsLabel(e) {
  if (L.isSuccess(e)) return `${e.sets.length}×${e.targetReps}`;
  return e.sets.map((r) => (r == null ? '–' : r)).join('/');
}

function renderLog() {
  ensureDraft();
  const d = draft;
  const view = $('#view-log');
  const cards = d.exercises.map((e, i) => {
    const sug = L.suggest(otherSessions(), e.key, store.settings, d.date);
    const last = lastFor(e.key, d.date);
    const plates = L.platesPerSide(e.weight, store.settings.barWeight, store.settings.plates);
    const plateText = plates == null ? 'går inte jämnt med dina skivor'
      : plates.length ? plates.map(kg).join(' + ') : 'bara stången';
    const icon = { up: '↑', same: '→', deload: '↓', start: '•' }[sug.kind];
    const differs = e.weight !== sug.weight;
    const sets = e.sets.map((r, j) => {
      const state = r == null ? 'todo' : r >= e.targetReps ? 'ok' : 'miss';
      const label = r == null ? `Set ${j + 1}: ej gjort` : `Set ${j + 1}: ${r} reps`;
      return `<button class="set ${state}" data-act="set" data-i="${i}" data-j="${j}" aria-label="${label}">${r ?? `<small>${e.targetReps}</small>`}</button>`;
    }).join('');
    return `
      <article class="card ex" style="--c:${colorOf(e.key)}">
        <div class="ex-head">
          <h2><span class="swatch"></span>${esc(e.name)} <span class="scheme">${e.sets.length}×${e.targetReps}</span></h2>
          <div class="stepper">
            <button class="step" data-act="w-" data-i="${i}" aria-label="Minska vikt">−</button>
            <label class="w"><input data-field="weight" data-i="${i}" inputmode="decimal" enterkeyhint="done" value="${kg(e.weight)}" aria-label="Vikt ${esc(e.name)} i kg"><span>kg</span></label>
            <button class="step" data-act="w+" data-i="${i}" aria-label="Öka vikt">+</button>
          </div>
        </div>
        ${d.deload
    ? `<p class="hint deload">↓ Lättare pass – ${store.settings.deloadPct} % under senaste vikten</p>`
    : `<p class="hint ${sug.kind}">${icon} ${esc(sug.reason)}${differs ? ` <button class="link" data-act="use-sug" data-i="${i}">Använd ${kg(sug.weight)} kg</button>` : ''}</p>`}
        <p class="sub">${last ? `Förra: ${kg(last.e.weight)} kg · ${setsLabel(last.e)} · ${fmtDate(last.s.date, { day: 'numeric', month: 'short' })}` : 'Inga tidigare pass'} · Per sida: ${plateText}</p>
        <div class="sets" role="group" aria-label="Set för ${esc(e.name)}">${sets}</div>
      </article>`;
  }).join('');

  view.innerHTML = `
    <header class="page-head">
      <div>
        <p class="eyebrow">${d.editing ? 'Redigerar pass' : 'Dagens pass'}</p>
        <h1>Pass ${esc(d.workout || '–')}</h1>
      </div>
      <div class="seg" role="group" aria-label="Välj pass">
        ${['A', 'B'].map((w) => `<button data-act="workout" data-w="${w}" aria-pressed="${d.workout === w}">${w}</button>`).join('')}
      </div>
    </header>
    <div class="meta-row">
      <label class="date-field"><span class="sr">Datum</span><input type="date" data-field="date" value="${d.date}"></label>
      ${syncPill()}
    </div>
    <button class="deload-toggle" data-act="deload" aria-pressed="${Boolean(d.deload)}">
      <span class="dt-text"><b>Lättare pass</b><small>Deload −${kg(store.settings.deloadPct)} % på alla övningar – för en lugnare period</small></span>
      <span class="switch" aria-hidden="true"></span>
    </button>
    ${cards}
    <section class="card">
      <label class="field"><span>Kommentar</span>
        <textarea data-field="comment" rows="2" placeholder="Hur kändes det? Form, sömn, ont någonstans …">${esc(d.comment)}</textarea>
      </label>
      <label class="field inline"><span>Kroppsvikt</span>
        <input data-field="bodyweight" inputmode="decimal" placeholder="valfritt" value="${d.bodyweight == null ? '' : kg(d.bodyweight)}"><span class="unit">kg</span>
      </label>
    </section>
    <div class="actions">
      <button class="btn primary" data-act="save">${d.editing ? 'Spara ändringar' : 'Spara pass'}</button>
      <button class="btn ghost" data-act="reset">${d.editing ? 'Avbryt' : 'Börja om'}</button>
    </div>
    <p class="tip">Tryck på en ring när setet är klart (5 reps). Tryck igen för att minska antalet reps. Vilotimern startar automatiskt.</p>`;
}

function pendingCount() {
  return store.sessions.filter((s) => !s.synced).length + store.pending.deletes.length + (store.settingsMeta.dirty ? 1 : 0);
}

function syncPill() {
  if (!store.syncEnabled) return '<button class="pill" data-act="goto-settings">Bara lokalt – koppla Google-arket</button>';
  if (syncState.busy) return '<span class="pill">Synkar …</span>';
  if (syncState.error) return `<button class="pill warn" data-act="sync-now" title="${esc(syncState.error)}">⚠ Synkfel – försök igen</button>`;
  const pending = pendingCount();
  if (pending) return `<button class="pill" data-act="sync-now">${pending} osynkade – synka</button>`;
  return '<span class="pill ok">✓ Synkat med arket</span>';
}

function changeWeight(i, dir) {
  const e = draft.exercises[i];
  const inc = store.settings.exercises[e.key]?.inc ?? 2.5;
  e.weight = Math.max(0, Math.round((e.weight + dir * inc) * 100) / 100);
  touch();
  renderLog();
}

function tapSet(i, j) {
  const e = draft.exercises[i];
  const prev = e.sets[j];
  const next = L.cycleReps(prev, e.targetReps);
  e.sets[j] = next;
  touch();
  renderLog();
  if (navigator.vibrate && store.settings.vibrate) navigator.vibrate(15);
  if (next == null) return;
  const allDone = draft.exercises.every((x) => x.sets.every((r) => r != null));
  if (prev == null) {
    if (allDone) stopTimer();
    else startTimer(next >= e.targetReps);
  } else {
    adjustTimer(next >= e.targetReps);
  }
}

function withDeloadNote(comment, deload) {
  if (!deload || /deload/i.test(comment)) return comment;
  return comment ? `Deload-pass · ${comment}` : 'Deload-pass';
}

function toggleDeload() {
  draft.deload = !draft.deload;
  for (const e of draft.exercises) {
    e.weight = draft.deload
      ? L.manualDeload(otherSessions(), e.key, store.settings, draft.date)
      : L.suggest(otherSessions(), e.key, store.settings, draft.date).weight;
  }
  touch();
  renderLog();
  toast(draft.deload ? 'Lättare pass – vikterna är sänkta' : 'Tillbaka till föreslagna vikter');
}

// Nytt datum ger nya förslag (t.ex. deload efter uppehåll). Vikter man själv ändrat lämnas orörda.
function changeDate(date) {
  const target = (e, d) => (draft.deload
    ? L.manualDeload(otherSessions(), e.key, store.settings, d)
    : L.suggest(otherSessions(), e.key, store.settings, d).weight);
  const untouched = draft.exercises.map((e) => e.weight === target(e, draft.date));
  draft.date = date;
  draft.exercises.forEach((e, i) => { if (untouched[i]) e.weight = target(e, date); });
}

function saveSession() {
  const exercises = draft.exercises
    .filter((e) => e.sets.some((r) => r != null))
    .map(({ suggestion, ...e }) => ({ ...e, sets: [...e.sets] }));
  if (!exercises.length) return toast('Logga minst ett set först.');
  const empty = exercises.some((e) => e.sets.some((r) => r == null));
  if (empty && !confirm('Några set är inte ifyllda. Spara ändå? Tomma set räknas som missade.')) return;
  const skipped = draft.exercises.length - exercises.length;
  const session = {
    id: draft.id,
    date: draft.date,
    workout: draft.workout,
    comment: withDeloadNote((draft.comment || '').trim(), draft.deload),
    bodyweight: draft.bodyweight ?? null,
    exercises,
  };
  store.upsert(session);
  const wasEditing = draft.editing;
  stopTimer();
  draft = null;
  store.setDraft(null);
  toast(wasEditing ? 'Ändringarna är sparade ✓' : `Passet är sparat ✓${skipped ? ` (${skipped} övning utan set hoppades över)` : ''}`);
  if (wasEditing) setTab('history');
  else render();
  runSync();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---------------------------------------------------------------- vilotimer

let timerInterval = null;
let audioCtx = null;
let wakeLock = null;

function unlockAudio() {
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch { /* inget ljud */ }
}

function beep() {
  if (!audioCtx || !store.settings.sound) return;
  const t0 = audioCtx.currentTime;
  [0, 0.25, 0.5].forEach((dt, k) => {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = k === 2 ? 1320 : 880;
    g.gain.setValueAtTime(0.0001, t0 + dt);
    g.gain.exponentialRampToValueAtTime(0.3, t0 + dt + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.18);
    o.connect(g).connect(audioCtx.destination);
    o.start(t0 + dt);
    o.stop(t0 + dt + 0.2);
  });
}

async function holdWakeLock() {
  try {
    if ('wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch { /* stöds inte */ }
}

function startTimer(success) {
  const target = success ? store.settings.restSuccess : store.settings.restFail;
  store.setTimer({ start: Date.now(), target, success, alerted: false });
  runTimer();
  holdWakeLock();
}

function adjustTimer(success) {
  const t = store.getTimer();
  if (!t) return;
  t.target = success ? store.settings.restSuccess : store.settings.restFail;
  t.success = success;
  t.alerted = (Date.now() - t.start) / 1000 >= t.target;
  store.setTimer(t);
  tickTimer();
}

function stopTimer() {
  store.setTimer(null);
  clearInterval(timerInterval);
  timerInterval = null;
  $('#timer').hidden = true;
  document.body.classList.remove('has-timer');
  wakeLock?.release?.();
}

function runTimer() {
  clearInterval(timerInterval);
  timerInterval = setInterval(tickTimer, 250);
  tickTimer();
}

const mmss = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

function tickTimer() {
  const t = store.getTimer();
  if (!t) return stopTimer();
  const elapsed = (Date.now() - t.start) / 1000;
  if (elapsed > t.target + 15 * 60) return stopTimer();
  const done = elapsed >= t.target;
  $('#timer').hidden = false;
  document.body.classList.add('has-timer');
  $('#timer').classList.toggle('done', done);
  $('#timer-label').textContent = done ? 'Dags för nästa set!' : t.success ? 'Vila' : 'Vila – missade reps';
  $('#timer-elapsed').textContent = mmss(elapsed);
  $('#timer-target').textContent = `/ ${mmss(t.target)}`;
  $('#timer-fill').style.width = `${Math.min(100, (elapsed / t.target) * 100)}%`;
  if (done && !t.alerted) {
    t.alerted = true;
    store.setTimer(t);
    beep();
    if (navigator.vibrate && store.settings.vibrate) navigator.vibrate([300, 150, 300, 150, 300]);
  }
}

// ---------------------------------------------------------------- vy: historik

function renderHistory() {
  const list = L.sortByDateDesc(store.sessions);
  const view = $('#view-history');
  if (!list.length) {
    view.innerHTML = `<header class="page-head"><h1>Historik</h1></header>
      <div class="card empty">Inga pass än. Logga ditt första pass, eller importera historiken från ditt Google-ark under Inställningar.</div>`;
    return;
  }
  let month = '';
  const items = list.slice(0, historyLimit).map((s) => {
    const m = fmtDate(s.date, { month: 'long', year: 'numeric' });
    const head = m !== month ? `<h3 class="month">${m}</h3>` : '';
    month = m;
    const exs = s.exercises.map((e) => {
      const ok = L.isSuccess(e);
      return `<li style="--c:${colorOf(e.key)}"><span class="swatch"></span><span class="n">${esc(e.name)}</span>
        <b>${kg(e.weight)} kg</b><span class="reps ${ok ? 'ok' : 'miss'}">${ok ? '✓' : '✗'} ${setsLabel(e)}</span></li>`;
    }).join('');
    return `${head}
      <article class="card hist">
        <header>
          <div><b>${fmtDate(s.date)}</b> <span class="tag">Pass ${esc(s.workout || '–')}</span>${s.synced === false && store.syncEnabled ? ' <span class="tag muted">ej synkad</span>' : ''}</div>
          <div class="row-actions">
            <button class="link" data-act="edit" data-id="${esc(s.id)}">Redigera</button>
            <button class="link danger" data-act="delete" data-id="${esc(s.id)}">Ta bort</button>
          </div>
        </header>
        <ul class="hist-ex">${exs}</ul>
        ${s.comment ? `<p class="comment">${esc(s.comment)}</p>` : ''}
        ${s.bodyweight != null ? `<p class="sub">Kroppsvikt ${kg(s.bodyweight)} kg</p>` : ''}
      </article>`;
  }).join('');
  view.innerHTML = `
    <header class="page-head"><div><h1>Historik</h1><p class="eyebrow">${list.length} pass</p></div></header>
    ${items}
    ${list.length > historyLimit ? '<div class="actions"><button class="btn ghost" data-act="more">Visa fler</button></div>' : ''}`;
}

function editSession(id) {
  const s = store.sessions.find((x) => x.id === id);
  if (!s) return;
  draft = { ...structuredClone(s), editing: true, touched: true };
  delete draft.synced;
  store.setDraft(draft);
  setTab('log');
}

function deleteSession(id) {
  const s = store.sessions.find((x) => x.id === id);
  if (!s) return;
  if (!confirm(`Ta bort passet ${fmtDate(s.date)} (pass ${s.workout})?`)) return;
  store.remove(id);
  if (draft?.id === id) { draft = null; store.setDraft(null); }
  renderHistory();
  toast('Passet är borttaget');
  runSync();
}

// ---------------------------------------------------------------- vy: progress

const RANGES = [
  { id: '3m', label: '3 mån', months: 3 },
  { id: '6m', label: '6 mån', months: 6 },
  { id: '1y', label: '1 år', months: 12 },
  { id: 'all', label: 'Allt', months: null },
];

function rangeStart(id) {
  const r = RANGES.find((x) => x.id === id) || RANGES[2];
  if (!r.months) return '0000';
  const d = new Date();
  d.setMonth(d.getMonth() - r.months);
  return L.todayISO(d);
}

function currentBodyweight() {
  const withBw = L.sortByDateDesc(store.sessions).find((s) => s.bodyweight != null);
  return withBw?.bodyweight ?? store.settings.bodyweight;
}

function renderProgress() {
  const view = $('#view-progress');
  const range = store.ui.range || '1y';
  const hidden = new Set(store.ui.hiddenLifts || []);
  const from = rangeStart(range);
  const inRange = store.sessions.filter((s) => s.date >= from);
  const series = L.seriesByExercise(inRange)
    .filter((s) => L.EXERCISES[s.key])
    .sort((a, b) => L.EXERCISE_ORDER.indexOf(a.key) - L.EXERCISE_ORDER.indexOf(b.key));

  const legend = series.map((s) => `
    <button class="chip" data-act="toggle-lift" data-key="${s.key}" aria-pressed="${!hidden.has(s.key)}" style="--c:${colorOf(s.key)}">
      <span class="swatch"></span>${esc(s.name)}</button>`).join('');

  // Mål (kroppsvikt × faktor) – som i målsektionen i arket
  const bw = currentBodyweight();
  // Bästa i vald period + (om inte "Allt") bästa totalt, skuggat bakom.
  const showTotal = range !== 'all';
  const total = liftStats(store.sessions);
  const period = showTotal ? liftStats(inRange) : total;
  const pctOf = (w, goal) => Math.min(100, Math.round((w / goal) * 100));
  const rm = (x) => (x?.e1rm ? ` · 1RM ≈ ${Math.round(x.e1rm)} kg` : '');
  const goals = L.EXERCISE_ORDER.map((key) => {
    const factor = store.settings.goalFactors?.[key];
    if (!factor || !bw) return '';
    const goal = Math.round(bw * factor * 10) / 10;
    const p = period[key];
    const t = total[key];
    const pct = pctOf(p?.best ?? 0, goal);
    const tPct = pctOf(t?.best ?? 0, goal);
    const name = L.EXERCISES[key].name;
    return `<div class="goal" style="--c:${colorOf(key)}">
      <div class="goal-top"><span><span class="swatch"></span>${name}</span><span><b>${p ? kg(p.best) : '–'}</b> / ${kg(goal)} kg</span></div>
      <div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${name} ${pct} % av målet${showTotal ? `, bästa totalt ${tPct} %` : ''}">
        ${showTotal ? `<span class="total" style="width:${tPct}%"></span>` : ''}<span style="width:${pct}%"></span>
      </div>
      <div class="goal-sub"><span>${kg(factor)} × kroppsvikt${rm(p)}</span><span>${pct} %</span></div>
      ${showTotal && t ? `<div class="goal-sub total"><span>Bästa totalt ${kg(t.best)} kg${rm(t)}</span><span>${tPct} %</span></div>` : ''}
    </div>`;
  }).join('');

  const recent = L.sortByDateDesc(store.sessions);
  const last = recent[0];
  const daysSince = last ? Math.round((Date.parse(L.todayISO()) - Date.parse(last.date)) / 86400000) : null;
  const fourWeeks = L.todayISO(new Date(Date.now() - 28 * 86400000));
  const perWeek = store.sessions.filter((s) => s.date >= fourWeeks).length / 4;

  const bwPoints = [...inRange]
    .filter((s) => s.bodyweight != null)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((s) => ({ date: s.date, y: s.bodyweight }));

  view.innerHTML = `
    <header class="page-head"><h1>Progress</h1>
      <div class="seg" role="group" aria-label="Tidsintervall">
        ${RANGES.map((r) => `<button data-act="range" data-range="${r.id}" aria-pressed="${range === r.id}">${r.label}</button>`).join('')}
      </div>
    </header>
    <div class="tiles">
      <div class="tile"><span class="tile-label">Pass i intervallet</span><span class="tile-value">${inRange.length}</span></div>
      <div class="tile"><span class="tile-label">Senaste pass</span><span class="tile-value">${daysSince == null ? '–' : daysSince === 0 ? 'Idag' : `${daysSince} d sedan`}</span></div>
      <div class="tile"><span class="tile-label">Pass/vecka (4 v)</span><span class="tile-value">${perWeek.toLocaleString('sv-SE', { maximumFractionDigits: 1 })}</span></div>
    </div>
    <section class="card">
      <h2>Arbetsvikt per övning</h2>
      <div class="legend" role="group" aria-label="Visa/dölj övningar">${legend}</div>
      <div id="chart-weight"></div>
      <p class="chart-note">Ofylld punkt = missade reps. Streckad linje = uppehåll längre än 5 veckor. Tryck/hovra i grafen för detaljer.</p>
      <details class="table-view"><summary>Visa som tabell</summary>${progressTable(series)}</details>
    </section>
    <section class="card">
      <h2>Mål</h2>
      <p class="sub">${esc(store.settings.goalNote || '')}${store.settings.goalNote ? ' · ' : ''}Kroppsvikt ${kg(bw)} kg · bästa klarade 5x5-vikt ${range === 'all' ? 'totalt' : `senaste ${RANGES.find((r) => r.id === range).label}`}${range === 'all' ? '' : ' – skuggat = bästa totalt'}. 1RM är uppskattat från dina set (Epleys formel).</p>
      ${goals || '<p class="sub">Ställ in kroppsvikt och faktorer under Inställningar.</p>'}
    </section>
    ${bwPoints.length >= 2 ? `<section class="card">
      <h2>Kroppsvikt</h2>
      <div id="chart-bw"></div>
    </section>` : ''}`;

  const byDate = new Map(inRange.map((s) => [s.date, s]));
  const visible = series.filter((s) => !hidden.has(s.key)).map((s) => ({
    key: s.key,
    name: s.name,
    color: colorOf(s.key),
    points: s.points.map((p) => ({ date: p.date, y: p.weight, hollow: !p.success })),
  }));
  lineChart($('#chart-weight'), visible, {
    label: 'Arbetsvikt per övning över tid',
    tooltipExtra: (date) => {
      const c = byDate.get(date)?.comment;
      return c ? `<div class="tt-note">${esc(c)}</div>` : '';
    },
  });

  if (bwPoints.length >= 2) {
    lineChart($('#chart-bw'), [{ key: 'bw', name: 'Kroppsvikt', color: 'var(--ink-2)', points: bwPoints }], {
      label: 'Kroppsvikt över tid', height: 200,
    });
  }
}

function liftStats(sessions) {
  const prs = L.personalRecords(sessions);
  return Object.fromEntries(L.seriesByExercise(sessions).map((x) => [x.key, {
    best: prs.find((p) => p.key === x.key)?.weight ?? 0,
    e1rm: Math.max(...x.points.map((p) => p.e1rm || 0)),
  }]));
}

function progressTable(series) {
  const dates = [...new Set(series.flatMap((s) => s.points.map((p) => p.date)))].sort().reverse();
  const rows = dates.map((d) => `<tr><td>${d}</td>${series.map((s) => {
    const p = s.points.find((q) => q.date === d);
    return `<td>${p ? `${kg(p.weight)}${p.success ? '' : '*'}` : ''}</td>`;
  }).join('')}</tr>`).join('');
  return `<div class="table-wrap"><table><thead><tr><th>Datum</th>${series.map((s) => `<th>${esc(s.name)}</th>`).join('')}</tr></thead>
    <tbody>${rows}</tbody></table></div><p class="sub">* = missade reps</p>`;
}

// ---------------------------------------------------------------- vy: inställningar

function numInput(path, label, step = 'any', unit = '') {
  const v = path.split('.').reduce((o, k) => o?.[k], store.settings);
  return `<label class="field inline"><span>${label}</span>
    <input data-setting="${path}" data-type="num" inputmode="decimal" step="${step}" value="${v == null ? '' : kg(v)}">${unit ? `<span class="unit">${unit}</span>` : ''}</label>`;
}

function renderSettings() {
  const s = store.settings;
  const pending = pendingCount();
  const lift = (key) => `<tr><th scope="row"><span class="swatch" style="--c:${colorOf(key)}"></span>${L.EXERCISES[key].name}</th>
    <td><input data-setting="exercises.${key}.inc" data-type="num" inputmode="decimal" value="${kg(s.exercises[key].inc)}" aria-label="Ökning ${L.EXERCISES[key].name}"></td>
    <td><input data-setting="exercises.${key}.start" data-type="num" inputmode="decimal" value="${kg(s.exercises[key].start)}" aria-label="Startvikt ${L.EXERCISES[key].name}"></td>
    <td><input data-setting="goalFactors.${key}" data-type="num" inputmode="decimal" value="${kg(s.goalFactors?.[key] ?? '')}" aria-label="Målfaktor ${L.EXERCISES[key].name}"></td></tr>`;

  $('#view-settings').innerHTML = `
    <header class="page-head"><h1>Inställningar</h1></header>

    <section class="card">
      <h2>Synk med Google-arket</h2>
      <p class="sub">Passen sparas alltid på enheten. Med synk sparas de också i fliken <b>Logg</b> i ditt kalkylark och syns på både dator och mobil. Mål och inställningar sparas i fliken <b>Inställningar</b>, så alla enheter blir likadana (adress och nyckel fylls i per enhet). Instruktioner finns i README.</p>
      <label class="field"><span>Webbapp-URL</span>
        <input data-setting="syncUrl" type="url" autocomplete="off" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(s.syncUrl)}"></label>
      <label class="field"><span>Nyckel (TOKEN i Code.gs)</span>
        <input data-setting="syncToken" type="password" autocomplete="off" value="${esc(s.syncToken)}"></label>
      <div class="actions wrap">
        <button class="btn primary" data-act="sync-test">Testa och synka</button>
        <button class="btn ghost" data-act="sheet-import">Importera historik från arket</button>
      </div>
      <p class="status" id="sync-status">${syncStatusText(pending)}</p>
    </section>

    <section class="card">
      <h2>Progression och mål</h2>
      <div class="table-wrap"><table class="settings-table">
        <thead><tr><th>Övning</th><th>Ökning</th><th>Start</th><th>Mål ×</th></tr></thead>
        <tbody>${L.EXERCISE_ORDER.map(lift).join('')}</tbody>
      </table></div>
      <p class="sub">Ökning och startvikt i kg. Mål × = målvikt som faktor av kroppsvikten.</p>
      ${numInput('deloadPct', 'Deload', 1, '%')}
      ${numInput('failsBeforeDeload', 'Missade pass i rad innan deload', 1)}
      ${numInput('breakDays', 'Deload efter uppehåll på', 1, 'dagar')}
      <p class="sub">Efter ett uppehåll sänks vikten med deload-procenten per hel period (t.ex. 14 dagar → −10 %, 28 dagar → −20 %, max −50 %). 0 = av.</p>
      ${numInput('bodyweight', 'Kroppsvikt för mål', 'any', 'kg')}
      <label class="field"><span>Måltext</span><input data-setting="goalNote" value="${esc(s.goalNote || '')}"></label>
      <p class="sub">Senast loggade kroppsvikt i ett pass används före värdet ovan.</p>
    </section>

    <section class="card">
      <h2>Vilotimer</h2>
      ${numInput('restSuccess', 'Vila efter klarat set', 1, 'sek')}
      ${numInput('restFail', 'Vila efter missat set', 1, 'sek')}
      <label class="field inline check"><input type="checkbox" data-setting="sound" ${s.sound ? 'checked' : ''}><span>Ljudsignal</span></label>
      <label class="field inline check"><input type="checkbox" data-setting="vibrate" ${s.vibrate ? 'checked' : ''}><span>Vibration (Android)</span></label>
      ${numInput('barWeight', 'Stångvikt', 'any', 'kg')}
    </section>

    <section class="card">
      <h2>Importera och exportera</h2>
      <p class="sub">Klistra in rader från ett kalkylark (markera inklusive rubrikraden, kopiera och klistra in). Både "en rad per dag med en kolumn per övning" (som i Biff) och "en rad per övning" fungerar.</p>
      <label class="field"><span>Klistra in</span><textarea id="paste" rows="4" placeholder="Datum&#9;Knäböj (5x5)&#9;Bänkpress (5x5) …"></textarea></label>
      <div class="actions wrap">
        <button class="btn ghost" data-act="paste-import">Importera inklistrat</button>
        <label class="btn ghost file">Importera fil (CSV/JSON)<input type="file" id="file" accept=".csv,.tsv,.txt,.json" hidden></label>
      </div>
      <div class="actions wrap">
        <button class="btn ghost" data-act="export-csv">Exportera CSV</button>
        <button class="btn ghost" data-act="export-json">Säkerhetskopia (JSON)</button>
        <button class="btn ghost danger" data-act="wipe">Radera lokal data</button>
      </div>
    </section>
    <p class="tip">5x5-logg · data sparas på den här enheten${store.syncEnabled ? ' och i ditt Google-ark' : ''}.</p>`;
}

function syncStatusText(pending) {
  if (!store.syncEnabled) return 'Synk är inte inställd.';
  const when = store.lastSync ? new Date(store.lastSync).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' }) : 'aldrig';
  const err = syncState.error ? ` · ⚠ ${esc(syncState.error)}` : '';
  const old = store.settingsUnsupported ? ' · ⚠ Inställningarna synkas inte – uppdatera Code.gs i arket (se README)' : '';
  return `Senast synkad: ${when}${pending ? ` · ${pending} ändringar väntar` : ''}${err}${old}`;
}

function setSetting(path, value) {
  const keys = path.split('.');
  let o = store.settings;
  for (const k of keys.slice(0, -1)) o = o[k] ||= {};
  o[keys.at(-1)] = value;
  store.saveSettings();
  // Adress och nyckel är per enhet och ska inte räknas som en synkad ändring.
  if (path !== 'syncUrl' && path !== 'syncToken') settingsChanged();
}

// Inställningar (även grafval) synkas till arket strax efter en ändring.
let settingsSyncTimer;
function settingsChanged() {
  store.touchSettings();
  clearTimeout(settingsSyncTimer);
  settingsSyncTimer = setTimeout(runSync, 1500);
}

// ---------------------------------------------------------------- import/export

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function importText(text, isJson) {
  let sessions;
  try {
    sessions = isJson ? JSON.parse(text) : L.importRows(L.parseDelimited(text));
    if (!Array.isArray(sessions)) throw new Error('Filen innehåller ingen lista med pass.');
  } catch (err) {
    return toast(`Kunde inte importera: ${err.message}`, 5000);
  }
  const n = store.addImported(sessions);
  toast(n ? `${n} pass importerade ✓` : 'Inga nya pass att importera (datumen finns redan).', 4000);
  draft = null;
  render();
  runSync();
}

async function importFromSheet() {
  if (!store.syncEnabled) return toast('Fyll i webbapp-URL och nyckel först.');
  toast('Läser flikarna i arket …');
  try {
    const tabs = await fetchTabs();
    const sessions = L.importWorkbook(tabs);
    const n = store.addImported(sessions);
    toast(`${n} pass importerade från ${tabs.length} flikar ✓`, 4000);
    draft = null;
    render();
    runSync();
  } catch (err) {
    toast(`Import misslyckades: ${err.message}`, 6000);
  }
}

// ---------------------------------------------------------------- synk

async function runSync() {
  if (!store.syncEnabled || syncState.busy) return;
  syncState = { busy: true, error: null };
  refreshSyncUi();
  try {
    await sync();
    syncState = { busy: false, error: null };
  } catch (err) {
    syncState = { busy: false, error: navigator.onLine ? err.message : 'Offline – synkar när du är online igen' };
  }
  // Rita inte om medan man skriver i ett fält.
  if (!document.activeElement?.matches('input, textarea')) render();
  else refreshSyncUi();
}

function refreshSyncUi() {
  const pill = $('#view-log .pill');
  if (pill) pill.outerHTML = syncPill();
  const st = $('#sync-status');
  if (st) st.innerHTML = syncStatusText(pendingCount());
}

// ---------------------------------------------------------------- navigering

function setTab(t) {
  tab = t;
  store.ui.tab = t;
  store.saveUi();
  render();
  window.scrollTo(0, 0);
}

function render() {
  for (const t of ['log', 'history', 'progress', 'settings']) {
    $(`#view-${t}`).hidden = t !== tab;
    const btn = $(`.tabs [data-tab="${t}"]`);
    if (t === tab) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  }
  ({ log: renderLog, history: renderHistory, progress: renderProgress, settings: renderSettings })[tab]();
}

let toastTimer;
function toast(msg, ms = 2500) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

// ---------------------------------------------------------------- händelser

document.addEventListener('click', async (ev) => {
  unlockAudio();
  const tabBtn = ev.target.closest('[data-tab]');
  if (tabBtn) return setTab(tabBtn.dataset.tab);
  const b = ev.target.closest('[data-act]');
  if (!b) return;
  const i = Number(b.dataset.i);
  switch (b.dataset.act) {
    case 'set': return tapSet(i, Number(b.dataset.j));
    case 'w-': return changeWeight(i, -1);
    case 'w+': return changeWeight(i, 1);
    case 'deload': return toggleDeload();
    case 'use-sug': {
      const e = draft.exercises[i];
      e.weight = L.suggest(otherSessions(), e.key, store.settings, draft.date).weight;
      touch();
      return renderLog();
    }
    case 'workout': {
      const w = b.dataset.w;
      if (w === draft.workout) return;
      const logged = draft.exercises.some((e) => e.sets.some((r) => r != null));
      if (logged && !confirm(`Byta till pass ${w}? Loggade set i det här passet försvinner.`)) return;
      const keep = { id: draft.id, date: draft.date, comment: draft.comment, bodyweight: draft.bodyweight, editing: draft.editing };
      draft = { ...L.buildSession(otherSessions(), w, store.settings, draft.date), ...keep, touched: true };
      store.setDraft(draft);
      return renderLog();
    }
    case 'save': return saveSession();
    case 'reset': {
      const logged = draft.exercises.some((e) => e.sets.some((r) => r != null));
      if (!draft.editing && logged && !confirm('Börja om? Loggade set i det här passet försvinner.')) return;
      const wasEditing = draft.editing;
      draft = null;
      store.setDraft(null);
      stopTimer();
      return wasEditing ? setTab('history') : renderLog();
    }
    case 'timer-add': {
      const t = store.getTimer();
      if (t) { t.target += 30; t.alerted = false; store.setTimer(t); tickTimer(); }
      return;
    }
    case 'timer-stop': return stopTimer();
    case 'edit': return editSession(b.dataset.id);
    case 'delete': return deleteSession(b.dataset.id);
    case 'more': historyLimit += 30; return renderHistory();
    case 'range': store.ui.range = b.dataset.range; store.saveUi(); settingsChanged(); return renderProgress();
    case 'toggle-lift': {
      const h = new Set(store.ui.hiddenLifts || []);
      if (h.has(b.dataset.key)) h.delete(b.dataset.key);
      else h.add(b.dataset.key);
      store.ui.hiddenLifts = [...h];
      store.saveUi();
      settingsChanged();
      return renderProgress();
    }
    case 'goto-settings': return setTab('settings');
    case 'sync-now': return runSync();
    case 'sync-test': {
      if (!store.syncEnabled) return toast('Fyll i både URL och nyckel.');
      try {
        const r = await ping();
        toast(`Ansluten till "${r.name}" ✓`);
        await runSync();
      } catch (err) {
        syncState.error = err.message;
        refreshSyncUi();
        toast(`Kunde inte ansluta: ${err.message}`, 6000);
      }
      return;
    }
    case 'sheet-import': return importFromSheet();
    case 'paste-import': {
      const text = $('#paste').value;
      if (!text.trim()) return toast('Klistra in något först.');
      return importText(text, false);
    }
    case 'export-csv': return download(`5x5-logg-${L.todayISO()}.csv`, `﻿${L.toCsv(store.sessions)}`, 'text/csv;charset=utf-8');
    case 'export-json': return download(`5x5-logg-${L.todayISO()}.json`, JSON.stringify(store.sessions, null, 2), 'application/json');
    case 'wipe': {
      if (!confirm('Radera alla pass och inställningar på den här enheten? (Google-arket påverkas inte.)')) return;
      store.clearAll();
      location.reload();
      return;
    }
    default:
  }
});

document.addEventListener('input', (ev) => {
  const f = ev.target.dataset.field;
  if (f === 'comment') { draft.comment = ev.target.value; touch(); }
});

document.addEventListener('change', (ev) => {
  const el = ev.target;
  if (el.id === 'file' && el.files?.[0]) {
    const file = el.files[0];
    file.text().then((text) => importText(text, /\.json$/i.test(file.name)));
    el.value = '';
    return;
  }
  const f = el.dataset.field;
  if (f) {
    if (f === 'weight') {
      const v = L.parseNum(el.value);
      if (v != null && v >= 0) draft.exercises[Number(el.dataset.i)].weight = v;
    } else if (f === 'date') {
      if (el.value) changeDate(el.value);
    } else if (f === 'bodyweight') {
      draft.bodyweight = L.parseNum(el.value);
    } else if (f === 'comment') {
      draft.comment = el.value;
    }
    touch();
    if (f !== 'comment') renderLog();
    return;
  }
  const path = el.dataset.setting;
  if (path) {
    let v = el.type === 'checkbox' ? el.checked : el.value.trim();
    if (el.dataset.type === 'num') {
      v = L.parseNum(v);
      if (v == null) return toast('Ange ett tal.');
    }
    setSetting(path, v);
    if (!draft?.touched) draft = null;
  }
});

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && ev.target.matches('input[data-field="weight"]')) ev.target.blur();
});

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (tab === 'progress') renderProgress(); }, 150);
});

window.addEventListener('online', runSync);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (store.getTimer()) { tickTimer(); holdWakeLock(); }
  runSync();
});

// ---------------------------------------------------------------- start

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
render();
if (store.getTimer()) runTimer();
runSync();
