import * as L from './logic.js';
import { store, sync, ping, fetchTabs } from './data.js';
import { lineChart } from './chart.js';
import { editorHtml, editorAction, editorChange, exerciseOptions, addExercise } from './editor.js';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const kg = L.fmtKg;

// Färg följer övningen: de åtta första övningarna man loggat (i den ordning de först
// användes) får var sin fast färg ur den validerade paletten. En övning byter aldrig färg
// när nya tillkommer; fler än åtta blir neutrala hellre än att färgerna upprepas.
let libIndex = new Map();
let colorIndex = new Map();
function refreshLib() {
  const lib = L.getLibrary(store.settings);
  libIndex = new Map(lib.map((e, i) => [e.key, i]));
  const order = [];
  const seen = new Set();
  const byDate = [...store.sessions].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  for (const s of byDate) {
    for (const e of s.exercises) if (!seen.has(e.key)) { seen.add(e.key); order.push(e.key); }
  }
  for (const e of lib) if (!seen.has(e.key)) { seen.add(e.key); order.push(e.key); }
  colorIndex = new Map(order.map((k, i) => [k, i]));
}
const colorOf = (key) => {
  const i = colorIndex.get(key);
  return i != null && i < 8 ? `var(--s${i + 1})` : 'var(--ink-3)';
};
const cfgOf = (e) => L.exConfig(store.settings, e.key, e.item, e.name);
const passLabel = (name) => (!name ? 'Pass –' : name.length <= 2 ? `Pass ${name}` : name);

const fmtDate = (iso, opts = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('sv-SE', opts);

let tab = ['log', 'history', 'progress', 'settings'].includes(store.ui.tab) ? store.ui.tab : 'log';
let draft = store.getDraft();
let historyLimit = 30;
let syncState = { busy: false, error: null };
let pickerOpen = false;

// ---------------------------------------------------------------- utkast

function freshDraft(workoutId) {
  const id = workoutId || L.nextWorkout(store.sessions, store.settings);
  return { ...L.buildSession(store.sessions, id, store.settings), touched: false };
}

function ensureDraft() {
  // Ett orört utkast byggs om så att förslagen alltid utgår från senaste data och dagens datum.
  if (!draft || (!draft.touched && !draft.editing)) {
    draft = freshDraft();
    pickerOpen = draft.exercises.length === 0;
  }
}

function currentProgramId(d) {
  if (d.programId) return d.programId;
  if (d.workout === L.FREE_NAME) return L.FREE;
  return L.getPrograms(store.settings).find((p) => p.name === d.workout)?.id || '';
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

// ---------------------------------------------------------------- installera som app

let installPrompt = null;
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); // vi visar en egen knapp i stället för Chromes lilla banner
  installPrompt = e;
  if (tab === 'log' || tab === 'settings') render();
});

window.addEventListener('appinstalled', () => {
  installPrompt = null;
  toast('Appen är installerad ✓ Öppna den från hemskärmen.', 4000);
  render();
});

async function installApp() {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice.catch(() => null);
  installPrompt = null;
  render();
}

function installBanner() {
  if (!installPrompt || isStandalone() || store.ui.installDismissed) return '';
  return `<div class="card install-banner">
    <img src="icons/icon-192.png" alt="" width="40" height="40">
    <div><b>Installera som app</b><span class="sub">Ikon på hemskärmen, fullskärm, offline</span></div>
    <button class="btn primary small" data-act="install">Installera</button>
    <button class="link" data-act="install-dismiss" aria-label="Dölj">✕</button>
  </div>`;
}

function installCard() {
  if (isStandalone()) return '<section class="card"><h2>App</h2><p class="sub">✓ Du kör 5x5 som installerad app.</p></section>';
  const how = installPrompt
    ? '<div class="actions wrap"><button class="btn primary" data-act="install">Installera som app</button></div>'
    : isIOS
      ? '<p class="sub">Öppna sidan i <b>Safari</b> → Dela-knappen → <b>Lägg till på hemskärmen</b>.</p>'
      : `<p class="sub">Öppna Chrome-menyn <b>⋮</b> → <b>Installera app</b> (eller <i>Lägg till på startskärmen → Installera</i>).</p>
         <p class="sub">Säger Chrome att appen redan är installerad men den inte går att öppna: ta bort den gamla ikonen (håll inne → Avinstallera) och installera igen.</p>`;
  return `<section class="card"><h2>Installera som app</h2>${how}</section>`;
}

// ---------------------------------------------------------------- vy: pass

function schemeText(cfg, n) {
  const u = L.unitOf(cfg);
  return `${n} × ${cfg.repsMin === cfg.repsMax ? kg(cfg.repsMax) : `${kg(cfg.repsMin)}–${kg(cfg.repsMax)}`}${u}`;
}

// "5×5" när alla set är lika, annars de faktiska repsen, t.ex. "10/9/8".
function setsLabel(e) {
  const u = L.unitOf(cfgOf(e));
  const first = e.sets[0];
  if (first != null && e.sets.every((r) => r === first)) return `${e.sets.length}×${first}${u}`;
  return e.sets.map((r) => (r == null ? '–' : `${r}${u}`)).join('/');
}

function weightText(e) {
  const cfg = cfgOf(e);
  if (cfg.type === 'bodyweight') return e.weight > 0 ? `+${kg(e.weight)} kg` : 'Kroppsvikt';
  if (cfg.type === 'time') return e.weight > 0 ? `+${kg(e.weight)} kg` : '';
  return `${kg(e.weight)} kg`;
}

function workoutPicker(d) {
  const programs = L.getPrograms(store.settings);
  const current = currentProgramId(d);
  const opts = [...programs.map((p) => ({ id: p.id, name: p.name })), { id: L.FREE, name: 'Fritt' }];
  if (opts.length <= 4 && opts.every((o) => o.name.length <= 8)) {
    return `<div class="seg" role="group" aria-label="Välj pass">
      ${opts.map((o) => `<button data-act="workout" data-w="${esc(o.id)}" aria-pressed="${current === o.id}">${esc(o.name)}</button>`).join('')}
    </div>`;
  }
  return `<select class="workout-select" data-field="workout" aria-label="Välj pass">
    ${opts.map((o) => `<option value="${esc(o.id)}" ${current === o.id ? 'selected' : ''}>${esc(o.id === L.FREE ? L.FREE_NAME : o.name)}</option>`).join('')}
  </select>`;
}

function exerciseCard(e, i, d) {
  const cfg = cfgOf(e);
  const unit = L.unitOf(cfg);
  const sug = L.suggest(otherSessions(), e.key, store.settings, d.date, e.item);
  const last = lastFor(e.key, d.date);
  const showWeight = cfg.type !== 'time';
  const icon = { up: '↑', same: '→', deload: '↓', start: '•', top: '★', nudge: '↑' }[sug.kind] || '•';
  const links = [];
  if (showWeight && e.weight !== sug.weight) links.push(`<button class="link" data-act="use-sug" data-i="${i}">Använd ${kg(sug.weight)} kg</button>`);
  if (sug.alt != null && e.weight !== sug.alt) links.push(`<button class="link" data-act="use-alt" data-i="${i}">Öka till ${kg(sug.alt)} kg</button>`);
  const hint = d.deload && e.weight > 0 && L.isWeighted(cfg)
    ? `<p class="hint deload">↓ Lättare pass – ${store.settings.deloadPct} % under senaste vikten</p>`
    : `<p class="hint ${sug.kind}">${icon} ${esc(sug.reason)} ${links.join(' ')}</p>`;
  const subs = [];
  subs.push(last ? `Förra: ${[weightText(last.e), setsLabel(last.e)].filter(Boolean).join(' · ')} · ${fmtDate(last.s.date, { day: 'numeric', month: 'short' })}` : 'Inga tidigare pass');
  if (cfg.type === 'barbell') {
    const plates = L.platesPerSide(e.weight, store.settings.barWeight, store.settings.plates);
    subs.push(`Per sida: ${plates == null ? 'går inte jämnt med dina skivor' : plates.length ? plates.map(kg).join(' + ') : 'bara stången'}`);
  }
  const sets = e.sets.map((r, j) => {
    const state = r == null ? 'todo' : r >= e.targetReps ? 'ok' : 'miss';
    const label = r == null ? `Set ${j + 1}: ej gjort` : `Set ${j + 1}: ${r} ${unit || 'reps'}`;
    return `<button class="set ${state}" data-act="set" data-i="${i}" data-j="${j}" aria-label="${label}">${r ?? `<small>${e.targetReps}</small>`}</button>`;
  }).join('');
  const stepper = showWeight ? `<div class="stepper">
      <button class="step" data-act="w-" data-i="${i}" aria-label="Minska vikt">−</button>
      <label class="w"><input data-field="weight" data-i="${i}" inputmode="decimal" enterkeyhint="done" value="${kg(e.weight)}" aria-label="${cfg.type === 'bodyweight' ? 'Extra vikt' : 'Vikt'} ${esc(e.name)} i kg"><span>${cfg.type === 'bodyweight' ? '+kg' : 'kg'}</span></label>
      <button class="step" data-act="w+" data-i="${i}" aria-label="Öka vikt">+</button>
    </div>` : '';
  return `
    <article class="card ex" style="--c:${colorOf(e.key)}">
      <div class="ex-head">
        <h2><span class="swatch"></span><span><span class="nm">${esc(e.name)}</span><span class="scheme">${schemeText(cfg, e.sets.length)} · mål ${e.targetReps}${unit || ' reps'}</span></span></h2>
        ${stepper}
      </div>
      ${hint}
      <p class="sub">${subs.join(' · ')}</p>
      <div class="sets" role="group" aria-label="Set för ${esc(e.name)}">${sets}</div>
      <div class="ex-foot">
        <button class="link" data-act="set-add" data-i="${i}">+ Set</button>
        ${e.sets.length > 1 ? `<button class="link" data-act="set-del" data-i="${i}">− Set</button>` : ''}
        <button class="link muted" data-act="ex-remove" data-i="${i}">Ta bort övningen</button>
      </div>
    </article>`;
}

function pickerCard() {
  if (!pickerOpen) return '<button class="btn ghost add-ex" data-act="picker-open">+ Lägg till övning</button>';
  const exclude = draft.exercises.map((e) => e.key);
  return `<section class="card picker">
    <h2>Lägg till övning</h2>
    <label class="field"><span>Ur övningsbanken</span>
      <select data-field="pick-ex">${exerciseOptions(store.settings, { placeholder: 'Välj övning …', exclude })}</select></label>
    <p class="sub">Finns den inte? Skapa en ny (sparas i banken):</p>
    <div class="new-ex">
      <input id="new-ex-name" placeholder="t.ex. Kabelrodd" aria-label="Namn på ny övning">
      <select id="new-ex-type" aria-label="Typ">${Object.entries(L.TYPES).map(([t, l]) => `<option value="${t}" ${t === 'dumbbell' ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <button class="btn small" data-act="ex-create">Skapa</button>
    </div>
    ${draft.exercises.length ? '<button class="link" data-act="picker-close">Stäng</button>' : ''}
  </section>`;
}

function renderLog() {
  ensureDraft();
  const d = draft;
  const view = $('#view-log');
  const isFree = currentProgramId(d) === L.FREE;
  const title = d.editing ? passLabel(d.workout) : isFree ? L.FREE_NAME : passLabel(d.workout);
  const anyWeighted = d.exercises.some((e) => L.isWeighted(cfgOf(e)));

  view.innerHTML = `
    <header class="page-head">
      <div>
        <p class="eyebrow">${d.editing ? 'Redigerar pass' : 'Dagens pass'}</p>
        <h1>${esc(title)}</h1>
      </div>
      ${d.editing ? '' : workoutPicker(d)}
    </header>
    <div class="meta-row">
      <label class="date-field"><span class="sr">Datum</span><input type="date" data-field="date" value="${d.date}"></label>
      ${syncPill()}
    </div>
    ${installBanner()}
    ${anyWeighted ? `<button class="deload-toggle" data-act="deload" aria-pressed="${Boolean(d.deload)}">
      <span class="dt-text"><b>Lättare pass</b><small>Deload −${kg(store.settings.deloadPct)} % på övningar med vikt – för en lugnare period</small></span>
      <span class="switch" aria-hidden="true"></span>
    </button>` : ''}
    ${d.exercises.map((e, i) => exerciseCard(e, i, d)).join('')}
    ${pickerCard()}
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
    <p class="tip">Tryck på en ring när setet är klart. Tryck igen för att minska antalet, eller håll inne för att skriva in exakt antal. Vilotimern startar automatiskt.</p>`;
}

function pendingCount() {
  return store.sessions.filter((s) => !s.synced).length + store.pending.deletes.length + (store.settingsMeta.dirty ? 1 : 0);
}

function pendingText() {
  const n = store.sessions.filter((s) => !s.synced).length + store.pending.deletes.length;
  const parts = [];
  if (n) parts.push(`${n} pass osynkade`);
  if (store.settingsMeta.dirty) parts.push(n ? 'inställningar' : 'Inställningar osynkade');
  return parts.join(' + ');
}

function syncPill() {
  if (!store.syncEnabled) return '<button class="pill" data-act="goto-settings">Bara lokalt – koppla Google-arket</button>';
  if (syncState.busy) return '<span class="pill">Synkar …</span>';
  if (syncState.error) return `<button class="pill warn" data-act="sync-now" title="${esc(syncState.error)}">⚠ Synkfel – försök igen</button>`;
  if (pendingCount()) return `<button class="pill" data-act="sync-now">${esc(pendingText())} – synka</button>`;
  return '<span class="pill ok">✓ Synkat med arket</span>';
}

function changeWeight(i, dir) {
  const e = draft.exercises[i];
  const cfg = cfgOf(e);
  const inc = cfg.inc > 0 ? cfg.inc : cfg.type === 'barbell' ? 2.5 : 1;
  e.weight = Math.max(0, Math.round((e.weight + dir * inc) * 100) / 100);
  touch();
  renderLog();
}

function setReps(i, j, next) {
  const e = draft.exercises[i];
  const prev = e.sets[j];
  e.sets[j] = next;
  touch();
  renderLog();
  if (navigator.vibrate && store.settings.vibrate) navigator.vibrate(15);
  if (next == null) return;
  const rest = cfgOf(e).rest;
  const allDone = draft.exercises.every((x) => x.sets.every((r) => r != null));
  if (prev == null) {
    if (allDone) stopTimer();
    else startTimer(next >= e.targetReps, rest);
  } else {
    adjustTimer(next >= e.targetReps, rest);
  }
}

function tapSet(i, j) {
  const e = draft.exercises[i];
  setReps(i, j, L.cycleReps(e.sets[j], e.targetReps));
}

// Håll inne en ring för att skriva in exakt antal (t.ex. fler reps än målet).
function promptSet(i, j) {
  const e = draft.exercises[i];
  const unit = L.unitOf(cfgOf(e)) ? 'sekunder' : 'reps';
  const v = prompt(`${e.name} – set ${j + 1}: antal ${unit}`, e.sets[j] ?? e.targetReps);
  if (v == null) return;
  if (v.trim() === '') return setReps(i, j, null);
  const n = L.parseNum(v);
  if (n == null || n < 0) return toast('Ange ett tal.');
  setReps(i, j, Math.round(n));
}

function addToDraft(key) {
  if (draft.exercises.some((e) => e.key === key)) return toast('Övningen finns redan i passet.');
  draft.exercises.push(L.makeEntry(otherSessions(), key, store.settings, draft.date));
  pickerOpen = false;
  touch();
  renderLog();
  const cards = document.querySelectorAll('#view-log .card.ex');
  cards[cards.length - 1]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function removeFromDraft(i) {
  const e = draft.exercises[i];
  if (e.sets.some((r) => r != null) && !confirm(`Ta bort ${e.name} ur passet? Loggade set försvinner.`)) return;
  draft.exercises.splice(i, 1);
  if (!draft.exercises.length) pickerOpen = true;
  touch();
  renderLog();
}

function switchWorkout(id) {
  if (id === currentProgramId(draft)) return;
  const logged = draft.exercises.some((e) => e.sets.some((r) => r != null));
  const name = id === L.FREE ? L.FREE_NAME : L.getPrograms(store.settings).find((p) => p.id === id)?.name;
  if (logged && !confirm(`Byta till ${passLabel(name)}? Loggade set i det här passet försvinner.`)) return renderLog();
  const keep = { id: draft.id, date: draft.date, comment: draft.comment, bodyweight: draft.bodyweight, editing: draft.editing };
  draft = { ...L.buildSession(otherSessions(), id, store.settings, draft.date), ...keep, touched: true };
  pickerOpen = draft.exercises.length === 0;
  store.setDraft(draft);
  renderLog();
}

function withDeloadNote(comment, deload) {
  if (!deload || /deload/i.test(comment)) return comment;
  return comment ? `Deload-pass · ${comment}` : 'Deload-pass';
}

function toggleDeload() {
  draft.deload = !draft.deload;
  for (const e of draft.exercises) {
    if (!L.isWeighted(cfgOf(e))) continue;
    e.weight = draft.deload
      ? L.manualDeload(otherSessions(), e.key, store.settings, draft.date, e.item)
      : L.suggest(otherSessions(), e.key, store.settings, draft.date, e.item).weight;
  }
  touch();
  renderLog();
  toast(draft.deload ? 'Lättare pass – vikterna är sänkta' : 'Tillbaka till föreslagna vikter');
}

// Nytt datum ger nya förslag (t.ex. deload efter uppehåll). Vikter man själv ändrat lämnas orörda.
function changeDate(date) {
  const target = (e, d) => (draft.deload && L.isWeighted(cfgOf(e))
    ? L.manualDeload(otherSessions(), e.key, store.settings, d, e.item)
    : L.suggest(otherSessions(), e.key, store.settings, d, e.item).weight);
  const untouched = draft.exercises.map((e) => e.weight === target(e, draft.date));
  draft.date = date;
  draft.exercises.forEach((e, i) => { if (untouched[i]) e.weight = target(e, date); });
}

function saveSession() {
  const exercises = draft.exercises
    .filter((e) => e.sets.some((r) => r != null))
    .map(({ suggestion, item, ...e }) => ({ ...e, sets: [...e.sets] }));
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

// rest = övningens egen vilotid (sek), annars standard för klarat/missat set.
function startTimer(success, rest = null) {
  const target = rest > 0 ? rest : success ? store.settings.restSuccess : store.settings.restFail;
  store.setTimer({ start: Date.now(), target, success, alerted: false });
  runTimer();
  holdWakeLock();
}

function adjustTimer(success, rest = null) {
  const t = store.getTimer();
  if (!t) return;
  t.target = rest > 0 ? rest : success ? store.settings.restSuccess : store.settings.restFail;
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
        <b>${weightText(e)}</b><span class="reps ${ok ? 'ok' : 'miss'}">${ok ? '✓' : '✗'} ${setsLabel(e)}</span></li>`;
    }).join('');
    return `${head}
      <article class="card hist">
        <header>
          <div><b>${fmtDate(s.date)}</b> <span class="tag">${esc(passLabel(s.workout))}</span>${s.synced === false && store.syncEnabled ? ' <span class="tag muted">ej synkad</span>' : ''}</div>
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
  if (!confirm(`Ta bort passet ${fmtDate(s.date)} (${passLabel(s.workout)})?`)) return;
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

// Vilka övningar som visas i viktgrafen: eget val, annars de fem första i banken (max 8 åt gången).
function shownLiftKeys(weightSeries) {
  if (Array.isArray(store.ui.shownLifts)) return new Set(store.ui.shownLifts);
  const hidden = new Set(store.ui.hiddenLifts || []);
  return new Set(weightSeries.filter((x) => !hidden.has(x.key)).slice(0, 5).map((x) => x.key));
}

function progressSeries(sessions) {
  const order = (k) => (libIndex.has(k) ? libIndex.get(k) : 999);
  const all = L.seriesByExercise(sessions).sort((a, b) => order(a.key) - order(b.key));
  const weighted = (x) => L.isWeighted(L.exConfig(store.settings, x.key, null, x.name));
  return { weightSeries: all.filter(weighted), repsSeries: all.filter((x) => !weighted(x)) };
}

function renderProgress() {
  const view = $('#view-progress');
  const range = store.ui.range || '1y';
  const from = rangeStart(range);
  const inRange = store.sessions.filter((s) => s.date >= from);
  const { weightSeries: series, repsSeries } = progressSeries(inRange);
  const shown = shownLiftKeys(series);

  const legend = series.map((s) => `
    <button class="chip" data-act="toggle-lift" data-key="${esc(s.key)}" aria-pressed="${shown.has(s.key)}" style="--c:${colorOf(s.key)}">
      <span class="swatch"></span>${esc(s.name)}</button>`).join('');

  // Mål (kroppsvikt × faktor). Bästa i vald period + (om inte "Allt") bästa totalt, skuggat bakom.
  const bw = currentBodyweight();
  const showTotal = range !== 'all';
  const total = liftStats(store.sessions);
  const period = showTotal ? liftStats(inRange) : total;
  const pctOf = (w, goal) => Math.min(100, Math.round((w / goal) * 100));
  const rm = (x) => (x?.e1rm ? ` · 1RM ≈ ${Math.round(x.e1rm)} kg` : '');
  const goals = L.getLibrary(store.settings).map(({ key, name }) => {
    const factor = store.settings.goalFactors?.[key];
    if (!(factor > 0) || !(bw > 0)) return '';
    const goal = Math.round(bw * factor * 10) / 10;
    const p = period[key];
    const t = total[key];
    const pct = pctOf(p?.best ?? 0, goal);
    const tPct = pctOf(t?.best ?? 0, goal);
    return `<div class="goal" style="--c:${colorOf(key)}">
      <div class="goal-top"><span><span class="swatch"></span>${esc(name)}</span><span><b>${p ? kg(p.best) : '–'}</b> / ${kg(goal)} kg</span></div>
      <div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(name)} ${pct} % av målet${showTotal ? `, bästa totalt ${tPct} %` : ''}">
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

  const repsKey = repsSeries.some((x) => x.key === store.ui.repsLift) ? store.ui.repsLift : repsSeries[0]?.key;
  const repsSel = repsSeries.find((x) => x.key === repsKey);
  const repsUnit = repsSel ? L.unitOf(L.exConfig(store.settings, repsSel.key, null, repsSel.name)) : '';

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
      ${series.length > 5 ? '<p class="sub">Välj vilka övningar som visas (högst 8 åt gången).</p>' : ''}
      <div class="legend" role="group" aria-label="Visa/dölj övningar">${legend}</div>
      <div id="chart-weight"></div>
      <p class="chart-note">Ofylld punkt = missade reps. Streckad linje = uppehåll längre än 5 veckor. Tryck/hovra i grafen för detaljer.</p>
      <details class="table-view"><summary>Visa som tabell</summary>${progressTable(series.filter((x) => shown.has(x.key)))}</details>
    </section>
    ${repsSeries.length ? `<section class="card">
      <h2>Kroppsvikts- och tidsövningar</h2>
      <label class="field"><span class="sr">Övning</span><select data-field="reps-lift">
        ${repsSeries.map((x) => `<option value="${esc(x.key)}" ${x.key === repsKey ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}
      </select></label>
      <div id="chart-reps"></div>
      <p class="chart-note">Bästa set per pass i ${repsUnit ? 'sekunder' : 'reps'}. Ofylld punkt = under målet.</p>
    </section>` : ''}
    <section class="card">
      <h2>Mål</h2>
      <p class="sub">${esc(store.settings.goalNote || '')}${store.settings.goalNote ? ' · ' : ''}${bw > 0 ? `Kroppsvikt ${kg(bw)} kg · ` : ''}bästa vikt där alla set klarades ${range === 'all' ? 'totalt' : `senaste ${RANGES.find((r) => r.id === range).label}`}${range === 'all' ? '' : ' – skuggat = bästa totalt'}. 1RM är uppskattat från dina set (Epleys formel).</p>
      ${goals || '<p class="sub">Inga mål än. Ange kroppsvikt (nedan eller i ett pass) och "Mål × kroppsvikt" på övningar i övningsbanken under Inställningar.</p>'}
    </section>
    <section class="card">
      <h2>Kroppsvikt</h2>
      ${bwSummary(bwPoints, bw)}
      ${bwPoints.length >= 2 ? '<div id="chart-bw"></div>' : ''}
      <p class="chart-note">Fyll i kroppsvikt längst ner i passvyn när du loggar ett pass, så växer grafen. Senaste värdet används även för målen.</p>
    </section>`;

  const byDate = new Map(inRange.map((s) => [s.date, s]));
  const visible = series.filter((s) => shown.has(s.key)).map((s) => ({
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

  if (repsSel) {
    lineChart($('#chart-reps'), [{
      key: repsSel.key,
      name: repsSel.name,
      color: colorOf(repsSel.key),
      points: repsSel.points.map((p) => ({ date: p.date, y: p.best, hollow: !p.success })),
    }], { label: `${repsSel.name} över tid`, height: 220, unit: repsUnit || 'reps' });
  }

  if (bwPoints.length >= 2) {
    lineChart($('#chart-bw'), [{ key: 'bw', name: 'Kroppsvikt', color: 'var(--ink-2)', points: bwPoints }], {
      label: 'Kroppsvikt över tid', height: 200, zero: false,
    });
  }
}

function bwSummary(points, current) {
  if (!points.length) {
    return `<p class="sub">Ingen kroppsvikt loggad i intervallet.${current > 0 ? ` Nuvarande värde för målen: <b>${kg(current)} kg</b>.` : ''}</p>`;
  }
  const first = points[0];
  const last = points.at(-1);
  const diff = Math.round((last.y - first.y) * 10) / 10;
  const change = points.length >= 2
    ? ` · ${diff > 0 ? '+' : diff < 0 ? '−' : '±'}${kg(Math.abs(diff))} kg sedan ${fmtDate(first.date, { day: 'numeric', month: 'short', year: 'numeric' })}`
    : '';
  return `<p class="sub">Senast <b>${kg(last.y)} kg</b> (${fmtDate(last.date, { day: 'numeric', month: 'short' })})${change}</p>`;
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
  $('#view-settings').innerHTML = `
    <header class="page-head"><h1>Inställningar</h1></header>
    ${installCard()}

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

    ${editorHtml(store.settings, colorOf)}

    <section class="card">
      <h2>Deload och mål</h2>
      ${numInput('deloadPct', 'Deload', 1, '%')}
      ${numInput('failsBeforeDeload', 'Missade pass i rad innan deload', 1)}
      ${numInput('breakDays', 'Deload efter uppehåll på', 1, 'dagar')}
      <p class="sub">Efter ett uppehåll sänks vikten med deload-procenten per hel period (t.ex. 14 dagar → −10 %, 28 dagar → −20 %, max −50 %). 0 = av.</p>
      ${numInput('bodyweight', 'Kroppsvikt för mål', 'any', 'kg')}
      <label class="field"><span>Måltext</span><input data-setting="goalNote" value="${esc(s.goalNote || '')}" placeholder="t.ex. Mål innan sommaren"></label>
      <p class="sub">Målen ställs in per övning i övningsbanken (Mål × kroppsvikt). Senast loggade kroppsvikt i ett pass används före värdet ovan.</p>
    </section>

    <section class="card">
      <h2>Vilotimer</h2>
      ${numInput('restSuccess', 'Vila efter klarat set', 1, 'sek')}
      ${numInput('restFail', 'Vila efter missat set', 1, 'sek')}
      <p class="sub">En övning kan ha egen vilotid i övningsbanken.</p>
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
  const old = store.settingsUnsupported
    ? ' · ⚠ Inställningarna synkas inte – uppdatera Code.gs i arket (se README)'
    : store.backendVersion && store.backendVersion < 3
      ? ' · ⚠ Skriptet i arket är gammalt – uppdatera Code.gs (se README), annars sparas inte rep-intervall och egna övningar korrekt'
      : '';
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

// Programmet/banken har ändrats: spara, synka och bygg om ett orört utkast.
function programChanged() {
  store.saveSettings();
  settingsChanged();
  refreshLib();
  if (!draft?.touched) draft = null;
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

let syncAgain = false;

async function runSync() {
  if (!store.syncEnabled) return;
  // Pågår redan en synk: kör en till direkt efteråt så att nya ändringar inte blir liggande.
  if (syncState.busy) { syncAgain = true; return; }
  syncState = { busy: true, error: null };
  refreshSyncUi();
  try {
    await sync();
    syncState = { busy: false, error: null };
  } catch (err) {
    syncState = { busy: false, error: navigator.onLine ? err.message : 'Offline – synkar när du är online igen' };
  }
  if (syncAgain && !syncState.error) {
    syncAgain = false;
    return runSync();
  }
  syncAgain = false;
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
  refreshLib();
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
    case 'set':
      if (longPressed) { longPressed = false; return; }
      return tapSet(i, Number(b.dataset.j));
    case 'set-add': draft.exercises[i].sets.push(null); touch(); return renderLog();
    case 'set-del': {
      const sets = draft.exercises[i].sets;
      if (sets.at(-1) != null && !confirm('Ta bort sista setet? Det är redan loggat.')) return;
      sets.pop();
      touch();
      return renderLog();
    }
    case 'ex-remove': return removeFromDraft(i);
    case 'picker-open': pickerOpen = true; renderLog(); return $('#view-log .picker select')?.focus();
    case 'picker-close': pickerOpen = false; return renderLog();
    case 'ex-create': {
      const name = $('#new-ex-name')?.value.trim();
      if (!name) return toast('Skriv ett namn på övningen.');
      const ex = addExercise(store.settings, name, $('#new-ex-type').value);
      programChanged();
      toast(`${ex.name} finns nu i övningsbanken`);
      return addToDraft(ex.key);
    }
    case 'use-alt': {
      const e = draft.exercises[i];
      const alt = L.suggest(otherSessions(), e.key, store.settings, draft.date, e.item).alt;
      if (alt != null) e.weight = alt;
      touch();
      return renderLog();
    }
    case 'w-': return changeWeight(i, -1);
    case 'w+': return changeWeight(i, 1);
    case 'deload': return toggleDeload();
    case 'install': return installApp();
    case 'install-dismiss': store.ui.installDismissed = true; store.saveUi(); return renderLog();
    case 'use-sug': {
      const e = draft.exercises[i];
      e.weight = L.suggest(otherSessions(), e.key, store.settings, draft.date, e.item).weight;
      touch();
      return renderLog();
    }
    case 'workout': return switchWorkout(b.dataset.w);
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
      const shown = shownLiftKeys(progressSeries(store.sessions.filter((x) => x.date >= rangeStart(store.ui.range || '1y'))).weightSeries);
      if (shown.has(b.dataset.key)) shown.delete(b.dataset.key);
      else if (shown.size >= 8) return toast('Högst 8 övningar åt gången – dölj någon först.');
      else shown.add(b.dataset.key);
      store.ui.shownLifts = [...shown];
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
      if (b.dataset.act.startsWith('ed-')) {
        if (editorAction(b.dataset.act, b.dataset, store.settings)) programChanged();
        return renderSettings();
      }
  }
});

// Håll inne en set-ring → skriv in exakt antal.
let longPressed = false;
let pressTimer = null;
document.addEventListener('pointerdown', (ev) => {
  const ring = ev.target.closest('.set[data-act="set"]');
  if (!ring) return;
  longPressed = false;
  clearTimeout(pressTimer);
  pressTimer = setTimeout(() => {
    longPressed = true;
    promptSet(Number(ring.dataset.i), Number(ring.dataset.j));
  }, 550);
});
for (const t of ['pointerup', 'pointercancel', 'pointerleave']) {
  document.addEventListener(t, () => clearTimeout(pressTimer), true);
}
document.addEventListener('contextmenu', (ev) => {
  if (ev.target.closest('.set')) ev.preventDefault();
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
  if (el.dataset.ed) {
    if (editorChange(el, store.settings)) programChanged();
    return renderSettings();
  }
  const f = el.dataset.field;
  if (f === 'workout') return switchWorkout(el.value);
  if (f === 'pick-ex') { if (el.value) addToDraft(el.value); return; }
  if (f === 'reps-lift') {
    store.ui.repsLift = el.value;
    store.saveUi();
    settingsChanged();
    return renderProgress();
  }
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
