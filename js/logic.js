// Ren logik utan DOM – går att testa med `node --test`.

export const EXERCISES = {
  squat: { name: 'Knäböj', inc: 2.5, start: 20 },
  bench: { name: 'Bänkpress', inc: 2.5, start: 20 },
  row: { name: 'Stångrodd', inc: 2.5, start: 30 },
  ohp: { name: 'Axelpress', inc: 2.5, start: 20 },
  deadlift: { name: 'Marklyft', inc: 5, start: 40 },
};

export const PROGRAM = {
  A: [
    { key: 'squat', sets: 5, reps: 5 },
    { key: 'bench', sets: 5, reps: 5 },
    { key: 'row', sets: 5, reps: 5 },
  ],
  B: [
    { key: 'squat', sets: 5, reps: 5 },
    { key: 'ohp', sets: 5, reps: 5 },
    { key: 'deadlift', sets: 1, reps: 5 },
  ],
};

// Fast ordning = fast färg per övning (färgen följer övningen, aldrig rangordningen).
export const EXERCISE_ORDER = ['squat', 'bench', 'row', 'ohp', 'deadlift'];

export const DEFAULT_SETTINGS = {
  exercises: Object.fromEntries(
    Object.entries(EXERCISES).map(([k, v]) => [k, { inc: v.inc, start: v.start }]),
  ),
  deloadPct: 10,
  failsBeforeDeload: 3,
  restSuccess: 180,
  restFail: 300,
  barWeight: 20,
  plates: [25, 20, 15, 10, 5, 2.5, 1.25],
  sound: true,
  vibrate: true,
  syncUrl: '',
  syncToken: '',
  // Mål = kroppsvikt × faktor (som i målsektionen i "Biff").
  bodyweight: 86,
  goalFactors: { squat: 1.5, bench: 1, row: 1, ohp: 0.7, deadlift: 2 },
  goalNote: 'Mål innan 40 (gärna innan 38)',
};

const ALIASES = {
  squat: ['knäböj', 'knaboj', 'knäböjning', 'squat', 'squats', 'böj', 'kb'],
  bench: ['bänkpress', 'bankpress', 'bänk', 'bench', 'bench press', 'bp'],
  row: ['skivstångsrodd', 'rodd', 'row', 'rows', 'barbell row', 'pendlay row', 'stångrodd'],
  ohp: ['axelpress', 'militärpress', 'militarpress', 'press', 'ohp', 'overhead press', 'stående press', 'mp'],
  deadlift: ['marklyft', 'mark', 'deadlift', 'deadlifts', 'dl', 'ml'],
};

export function exerciseKey(name) {
  const n = String(name || '').replace(/\(.*?\)/g, '').trim().toLowerCase();
  for (const [key, list] of Object.entries(ALIASES)) {
    if (list.includes(n)) return key;
  }
  return n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function exerciseName(key, fallback) {
  return EXERCISES[key]?.name || fallback || key;
}

export function roundTo(w, step = 2.5) {
  return Math.round(w / step) * step;
}

export function parseNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const m = String(v ?? '').match(/^\s*(-?\d+(?:[.,]\d+)?)\s*(?:kg)?\s*$/i);
  return m ? Number(m[1].replace(',', '.')) : null;
}

export function isSuccess(ex) {
  return ex.sets.length > 0 && ex.sets.every((r) => r != null && r >= ex.targetReps);
}

export function liveSessions(sessions) {
  return sessions.filter((s) => !s.deleted);
}

export function sortByDateDesc(sessions) {
  return [...sessions].sort((a, b) =>
    a.date === b.date ? (b.updatedAt || 0) - (a.updatedAt || 0) : a.date < b.date ? 1 : -1,
  );
}

export function nextWorkout(sessions) {
  const last = sortByDateDesc(liveSessions(sessions)).find((s) => s.workout === 'A' || s.workout === 'B');
  return last?.workout === 'A' ? 'B' : 'A';
}

function exSettings(settings, key) {
  return settings.exercises?.[key] || { inc: EXERCISES[key]?.inc ?? 2.5, start: EXERCISES[key]?.start ?? 20 };
}

// Föreslagen vikt enligt StrongLifts-logik:
// klarade alla set → öka, missade → samma vikt, N missar i rad på samma vikt → deload.
export function suggest(sessions, key, settings = DEFAULT_SETTINGS, beforeDate = null) {
  const { inc, start } = exSettings(settings, key);
  const history = sortByDateDesc(liveSessions(sessions))
    .filter((s) => !beforeDate || s.date < beforeDate)
    .map((s) => s.exercises.find((e) => e.key === key && e.sets.some((r) => r != null)))
    .filter(Boolean);

  if (!history.length) return { weight: start, reason: 'Startvikt', kind: 'start' };

  const last = history[0];
  if (isSuccess(last)) {
    return { weight: last.weight + inc, reason: `+${fmtKg(inc)} kg – klarade alla set förra gången`, kind: 'up' };
  }

  let fails = 0;
  for (const e of history) {
    if (e.weight !== last.weight || isSuccess(e)) break;
    fails++;
  }
  const limit = settings.failsBeforeDeload ?? 3;
  if (fails >= limit) {
    const pct = settings.deloadPct ?? 10;
    const w = Math.max(settings.barWeight ?? 20, roundTo(last.weight * (1 - pct / 100), 2.5));
    return { weight: w, reason: `Deload −${pct} % efter ${fails} missade pass i rad`, kind: 'deload' };
  }
  return { weight: last.weight, reason: `Samma vikt – försök ${fails + 1} av ${limit}`, kind: 'same' };
}

export function buildSession(sessions, workout, settings = DEFAULT_SETTINGS, date = todayISO()) {
  return {
    id: uid(),
    date,
    workout,
    comment: '',
    bodyweight: null,
    exercises: PROGRAM[workout].map((p) => {
      const s = suggest(sessions, p.key, settings, date);
      return {
        key: p.key,
        name: exerciseName(p.key),
        weight: s.weight,
        targetReps: p.reps,
        sets: Array(p.sets).fill(null),
        suggestion: s,
      };
    }),
  };
}

// Tryck på en set-ring: tom → 5 → 4 → … → 0 → tom.
export function cycleReps(current, target) {
  if (current == null) return target;
  if (current <= 0) return null;
  return current - 1;
}

export function platesPerSide(weight, bar = 20, plates = DEFAULT_SETTINGS.plates) {
  let rest = (weight - bar) / 2;
  if (rest <= 0) return [];
  const out = [];
  for (const p of [...plates].sort((a, b) => b - a)) {
    while (rest + 1e-9 >= p) {
      out.push(p);
      rest -= p;
    }
  }
  return rest > 1e-6 ? null : out;
}

export function e1rm(weight, reps) {
  if (!reps) return null;
  return reps === 1 ? weight : weight * (1 + reps / 30);
}

export function exerciseVolume(ex) {
  return ex.sets.reduce((sum, r) => sum + (r || 0) * ex.weight, 0);
}

// Tidsserie per övning: [{date, weight, e1rm, volume, success}]
export function seriesByExercise(sessions) {
  const map = new Map();
  for (const s of [...liveSessions(sessions)].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))) {
    for (const ex of s.exercises) {
      if (!ex.sets.some((r) => r != null)) continue;
      const best = Math.max(...ex.sets.map((r) => (r ? e1rm(ex.weight, r) : 0)));
      if (!map.has(ex.key)) map.set(ex.key, { key: ex.key, name: ex.name || exerciseName(ex.key), points: [] });
      map.get(ex.key).points.push({
        date: s.date,
        weight: ex.weight,
        e1rm: Math.round(best * 10) / 10,
        volume: exerciseVolume(ex),
        success: isSuccess(ex),
        sets: ex.sets,
      });
    }
  }
  return [...map.values()];
}

export function personalRecords(sessions) {
  return seriesByExercise(sessions).map((s) => {
    const done = s.points.filter((p) => p.success);
    const best = (done.length ? done : s.points).reduce((a, b) => (b.weight > a.weight ? b : a));
    return { key: s.key, name: s.name, weight: best.weight, date: best.date, success: best.success };
  });
}

// ---------- Import/Export ----------

export function detectDelimiter(line) {
  const counts = { '\t': 0, ';': 0, ',': 0 };
  let q = false;
  for (const c of line) {
    if (c === '"') q = !q;
    else if (!q && c in counts) counts[c]++;
  }
  const [best, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return n ? best : ',';
}

export function parseDelimited(text) {
  text = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const firstLine = text.split('\n').find((l) => l.trim()) || '';
  const d = detectDelimiter(firstLine);
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === d) { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export function normalizeDate(v) {
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/); // dd/mm/yyyy (svensk/europeisk)
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  if (/^\d{5}$/.test(s)) { // serienummer från kalkylark
    const d = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  return null;
}

export function parseReps(v, targetSets = 5) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  if (/^\d+\s*[x×*]\s*\d+$/i.test(s)) { // "5x5"
    const [a, b] = s.split(/\s*[x×*]\s*/i).map(Number);
    return Array(a).fill(b);
  }
  const parts = s.split(s.includes('/') ? /\s*\/\s*/ : /[\s,;-]+/).filter(Boolean);
  if (parts.length > 1) return parts.map((p) => (/^\d+$/.test(p) ? Number(p) : null));
  if (/^\d+$/.test(s)) return Array(targetSets).fill(Number(s));
  return null;
}

const COL = {
  date: ['datum', 'date', 'dag'],
  workout: ['pass', 'workout', 'typ'],
  exercise: ['övning', 'ovning', 'exercise', 'lyft', 'lift'],
  weight: ['vikt', 'weight', 'kg', 'vikt (kg)'],
  reps: ['reps', 'repetitioner', 'resultat'],
  comment: ['kommentar', 'kommentarer', 'comment', 'anteckning', 'anteckningar', 'övrigt', 'notes', 'note'],
  bodyweight: ['kroppsvikt', 'bodyweight', 'bw'],
  id: ['id'],
};

// "Knäböj (5x5)" → {sets: 5, reps: 5}, "Marklyft (1 x 5)" → {sets: 1, reps: 5}
function schemeFromHeader(h, key) {
  const m = String(h).match(/\((\d+)\s*[x×]\s*(\d+)\)/i);
  if (m) return { sets: Number(m[1]), reps: Number(m[2]) };
  return { sets: key === 'deadlift' ? 1 : 5, reps: 5 };
}

function inferWorkout(s) {
  const keys = s.exercises.map((e) => e.key);
  const a = keys.includes('bench') || keys.includes('row');
  const b = keys.includes('ohp') || keys.includes('deadlift');
  return a && !b ? 'A' : b && !a ? 'B' : a ? 'A' : '';
}

// Tolkar rader från ett kalkylark eller en CSV. Klarar:
//  • lång form: en rad per övning (Datum, Övning, Vikt, Reps …)
//  • bred form: en rad per dag/pass med en kolumn per övning (som "Biff")
//  • flera rubrikrader i samma flik (t.ex. ett äldre 4x7-program ovanför 5x5-loggen)
// Returnerar sessioner; `sectionStart` = första datumet i flikens sista avsnitt.
export function importRows(rows, { maxDate = todayISO() } = {}) {
  const sessions = new Map();
  let map = null;
  let sectionFirst = null;
  let lastSectionFirst = null;

  const readHeader = (r) => {
    const header = r.map((h) => String(h ?? '').trim().toLowerCase());
    const idx = (names) => header.findIndex((h) => names.includes(h.replace(/\s+$/, '')));
    const ci = Object.fromEntries(Object.entries(COL).map(([k, v]) => [k, idx(v)]));
    if (ci.date < 0) return null;
    const setCols = header.map((h, i) => (/^set\s*\d+$/.test(h) ? i : -1)).filter((i) => i >= 0);
    const exCols = r
      .map((h, i) => ({ i, h: String(h ?? ''), key: exerciseKey(h) }))
      .filter((c) => c.i !== ci.date && EXERCISES[c.key])
      .map((c) => ({ ...c, ...schemeFromHeader(c.h, c.key) }));
    const long = ci.exercise >= 0 && ci.weight >= 0;
    if (!long && !exCols.length) return null;
    return { ci, setCols, exCols, long };
  };

  const getSession = (date, workout, id, r, ci) => {
    const k = id || `${date}|${workout || ''}`;
    if (!sessions.has(k)) {
      sessions.set(k, {
        id: id || `imp-${date}${workout ? `-${workout}` : ''}`,
        date, workout: workout || '', comment: '', bodyweight: null, exercises: [], updatedAt: 1,
      });
    }
    const s = sessions.get(k);
    const c = ci.comment >= 0 ? String(r[ci.comment] ?? '').trim() : '';
    if (c && !s.comment) s.comment = c;
    if (ci.bodyweight >= 0 && s.bodyweight == null) s.bodyweight = parseNum(r[ci.bodyweight]);
    return s;
  };

  for (const r of rows) {
    const h = readHeader(r);
    if (h) {
      map = h;
      sectionFirst = null;
      continue;
    }
    if (!map) continue;
    const { ci, setCols, exCols, long } = map;
    const date = normalizeDate(r[ci.date]);
    if (!date || date > maxDate) continue;
    const workout = ci.workout >= 0 ? String(r[ci.workout] ?? '').trim().toUpperCase() : '';
    let added = false;

    if (long) {
      const weight = parseNum(r[ci.weight]);
      const name = String(r[ci.exercise] ?? '').trim();
      if (weight == null || !name) continue;
      const key = exerciseKey(name);
      const tSets = key === 'deadlift' ? 1 : 5;
      let sets = null;
      if (setCols.length) {
        sets = setCols.map((i) => parseNum(r[i]));
        while (sets.length > tSets && sets.at(-1) == null) sets.pop();
      } else if (ci.reps >= 0) {
        sets = parseReps(r[ci.reps], tSets);
      }
      const s = getSession(date, workout, ci.id >= 0 ? String(r[ci.id] ?? '').trim() : '', r, ci);
      s.exercises.push({ key, name: exerciseName(key, name), weight, targetReps: 5, sets: sets || Array(tSets).fill(5) });
      added = true;
    } else {
      const found = exCols
        .map((c) => ({ c, weight: parseNum(r[c.i]) }))
        .filter((x) => x.weight != null && x.weight > 0);
      if (!found.length) continue;
      const s = getSession(date, workout, '', r, ci);
      for (const { c, weight } of found) {
        s.exercises.push({ key: c.key, name: exerciseName(c.key), weight, targetReps: c.reps, sets: Array(c.sets).fill(c.reps) });
      }
      added = true;
    }
    if (added) {
      if (!sectionFirst || date < sectionFirst) sectionFirst = date;
      lastSectionFirst = sectionFirst;
    }
  }

  const out = [...sessions.values()].filter((s) => s.exercises.length);
  for (const s of out) if (!s.workout) s.workout = inferWorkout(s);
  out.sectionStart = lastSectionFirst;
  return out;
}

// Flera flikar (t.ex. "2024-2025", "2025-2026", "2026") som delvis överlappar.
// Nyare flik vinner: en äldre flik bidrar bara med pass före den nyare flikens loggstart.
export function importWorkbook(tabs, opts) {
  const parsed = tabs
    .map((t) => {
      try { return { name: t.name, sessions: importRows(t.rows, opts) }; } catch { return null; }
    })
    .filter((t) => t && t.sessions.length)
    .sort((a, b) => (a.sessions.sectionStart < b.sessions.sectionStart ? 1 : -1));
  const byId = new Map();
  let cutoff = null;
  for (const t of parsed) {
    for (const s of t.sessions) {
      if (cutoff && s.date >= cutoff) continue;
      if (!byId.has(s.id)) byId.set(s.id, s);
    }
    if (t.sessions.sectionStart && (!cutoff || t.sessions.sectionStart < cutoff)) cutoff = t.sessions.sectionStart;
  }
  return [...byId.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function toCsv(sessions) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [['id', 'datum', 'pass', 'övning', 'vikt', 'reps', 'kommentar', 'kroppsvikt'].join(',')];
  for (const s of sortByDateDesc(liveSessions(sessions)).reverse()) {
    s.exercises.forEach((e, i) => {
      lines.push([
        s.id, s.date, s.workout, e.name, e.weight,
        e.sets.map((r) => (r == null ? '-' : r)).join('/'),
        i === 0 ? s.comment : '', i === 0 ? s.bodyweight ?? '' : '',
      ].map(esc).join(','));
    });
  }
  return lines.join('\n');
}

// Slår ihop två listor med sessioner, senast uppdaterad vinner.
export function mergeSessions(local, incoming) {
  const map = new Map(local.map((s) => [s.id, s]));
  for (const s of incoming) {
    const cur = map.get(s.id);
    if (!cur || (s.updatedAt || 0) >= (cur.updatedAt || 0)) map.set(s.id, s);
  }
  return [...map.values()];
}

// ---------- Hjälpare ----------

export function fmtKg(n) {
  if (n == null) return '';
  return Number(n).toLocaleString('sv-SE', { maximumFractionDigits: 2 });
}

export function todayISO(d = new Date()) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
