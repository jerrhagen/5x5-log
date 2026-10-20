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

// ---------- Övningsbank och program ----------

export const TYPES = {
  barbell: 'Skivstång',
  dumbbell: 'Hantlar/kettlebell',
  machine: 'Maskin/kabel',
  bodyweight: 'Kroppsvikt',
  time: 'Tid',
};

export const PROGRESSIONS = {
  linear: 'Linjär – öka när alla set klaras (5x5)',
  double: 'Dubbel – öka reps upp till max, sedan vikten',
  manual: 'Manuell – påminn när det är dags',
};

// Rimliga utgångsvärden när man lägger till en ny övning av en viss typ.
export const TYPE_DEFAULTS = {
  barbell: { sets: 3, repsMin: 6, repsMax: 10, progression: 'double', inc: 2.5, start: 20 },
  dumbbell: { sets: 3, repsMin: 8, repsMax: 12, progression: 'double', inc: 2, start: 6 },
  machine: { sets: 3, repsMin: 10, repsMax: 15, progression: 'double', inc: 2.5, start: 10 },
  bodyweight: { sets: 3, repsMin: 8, repsMax: 15, progression: 'double', inc: 0, start: 0 },
  time: { sets: 3, repsMin: 30, repsMax: 60, progression: 'double', inc: 0, start: 0 },
};

const lib = (key, name, type, sets, repsMin, repsMax, progression, inc, start) =>
  ({ key, name, type, sets, repsMin, repsMax, progression, inc, start, rest: null });

export const DEFAULT_LIBRARY = [
  lib('squat', 'Knäböj', 'barbell', 5, 5, 5, 'linear', 2.5, 20),
  lib('bench', 'Bänkpress', 'barbell', 5, 5, 5, 'linear', 2.5, 20),
  lib('row', 'Stångrodd', 'barbell', 5, 5, 5, 'linear', 2.5, 30),
  lib('ohp', 'Axelpress', 'barbell', 5, 5, 5, 'linear', 2.5, 20),
  lib('deadlift', 'Marklyft', 'barbell', 1, 5, 5, 'linear', 5, 40),
  lib('hip-thrust', 'Hip thrust', 'barbell', 3, 8, 12, 'double', 5, 40),
  lib('rumansk-marklyft', 'Rumänsk marklyft', 'barbell', 3, 8, 12, 'double', 2.5, 30),
  lib('goblet-squat', 'Goblet squat', 'dumbbell', 3, 8, 12, 'double', 2, 10),
  lib('utfall', 'Utfall', 'dumbbell', 3, 8, 12, 'double', 2, 6),
  lib('hantelpress', 'Hantelpress', 'dumbbell', 3, 8, 12, 'double', 2, 8),
  lib('hantelrodd', 'Hantelrodd', 'dumbbell', 3, 8, 12, 'double', 2, 10),
  lib('axelpress-hantlar', 'Axelpress hantlar', 'dumbbell', 3, 8, 12, 'double', 2, 6),
  lib('sidolyft', 'Sidolyft', 'dumbbell', 3, 10, 15, 'double', 1, 4),
  lib('bicepscurl', 'Bicepscurl', 'dumbbell', 3, 8, 12, 'double', 1, 6),
  lib('benpress', 'Benpress', 'machine', 3, 10, 15, 'double', 5, 40),
  lib('latsdrag', 'Latsdrag', 'machine', 3, 8, 12, 'double', 2.5, 25),
  lib('sittande-rodd', 'Sittande rodd', 'machine', 3, 8, 12, 'double', 2.5, 25),
  lib('bencurl', 'Bencurl', 'machine', 3, 10, 15, 'double', 2.5, 15),
  lib('benspark', 'Benspark', 'machine', 3, 10, 15, 'double', 2.5, 15),
  lib('triceps-pushdown', 'Triceps pushdown', 'machine', 3, 10, 15, 'double', 2.5, 15),
  lib('armhavningar', 'Armhävningar', 'bodyweight', 3, 8, 15, 'double', 0, 0),
  lib('chins', 'Chins', 'bodyweight', 3, 5, 10, 'double', 2.5, 0),
  lib('dips', 'Dips', 'bodyweight', 3, 6, 12, 'double', 2.5, 0),
  lib('planka', 'Planka', 'time', 3, 30, 60, 'double', 0, 0),
];

const item = (key, sets, repsMin, repsMax = repsMin) => ({ key, sets, repsMin, repsMax });

export const DEFAULT_PROGRAMS = [
  { id: 'A', name: 'A', items: [item('squat', 5, 5), item('bench', 5, 5), item('row', 5, 5)] },
  { id: 'B', name: 'B', items: [item('squat', 5, 5), item('ohp', 5, 5), item('deadlift', 1, 5)] },
];

export const FREE = 'free';
export const FREE_NAME = 'Fritt pass';

function normalizeExercise(e) {
  const t = TYPES[e.type] ? e.type : 'barbell';
  const d = TYPE_DEFAULTS[t];
  const n = (v, def) => { const x = parseNum(v); return x == null ? def : x; };
  const repsMin = n(e.repsMin, d.repsMin);
  return {
    key: String(e.key || exerciseKey(e.name)),
    name: String(e.name || e.key || 'Övning'),
    type: t,
    sets: Math.max(1, Math.round(n(e.sets, d.sets))),
    repsMin,
    repsMax: Math.max(repsMin, n(e.repsMax, d.repsMax)),
    progression: PROGRESSIONS[e.progression] ? e.progression : d.progression,
    inc: Math.max(0, n(e.inc, d.inc)),
    start: Math.max(0, n(e.start, d.start)),
    rest: e.rest == null || e.rest === '' ? null : n(e.rest, null),
  };
}

// Övningsbanken. Innan banken fanns låg ökning/startvikt under settings.exercises – de följer med.
export function getLibrary(settings = DEFAULT_SETTINGS) {
  if (Array.isArray(settings?.library) && settings.library.length) return settings.library.map(normalizeExercise);
  return DEFAULT_LIBRARY.map((e) => {
    const legacy = settings?.exercises?.[e.key] || {};
    return normalizeExercise({ ...e, ...(legacy.inc != null ? { inc: legacy.inc } : {}), ...(legacy.start != null ? { start: legacy.start } : {}) });
  });
}

export function getPrograms(settings = DEFAULT_SETTINGS) {
  const p = Array.isArray(settings?.programs) && settings.programs.length ? settings.programs : DEFAULT_PROGRAMS;
  return p.map((x, i) => ({
    id: String(x.id ?? x.name ?? i),
    name: String(x.name ?? x.id ?? `Pass ${i + 1}`),
    items: (x.items || []).map((it) => ({ key: it.key, sets: parseNum(it.sets), repsMin: parseNum(it.repsMin), repsMax: parseNum(it.repsMax) })),
  }));
}

export function findExercise(settings, key) {
  return getLibrary(settings).find((e) => e.key === key) || null;
}

// Inställningar för en övning, ev. med passmallens set/reps ovanpå.
export function exConfig(settings, key, it = null, fallbackName = null) {
  const base = findExercise(settings, key)
    || normalizeExercise({ key, name: fallbackName || exerciseName(key), type: 'barbell', sets: 3, repsMin: 5, repsMax: 5, progression: 'manual', inc: 2.5, start: 20 });
  const cfg = { ...base };
  if (it?.sets) cfg.sets = Math.max(1, Math.round(it.sets));
  if (it?.repsMin) cfg.repsMin = it.repsMin;
  if (it?.repsMax) cfg.repsMax = Math.max(cfg.repsMin, it.repsMax);
  return cfg;
}

export const unitOf = (cfg) => (cfg?.type === 'time' ? 's' : '');
export const isWeighted = (cfg) => cfg.type !== 'bodyweight' && cfg.type !== 'time';

export const DEFAULT_SETTINGS = {
  library: null, // null = standardbanken (se getLibrary)
  programs: null, // null = 5x5 A/B (se getPrograms)
  deloadPct: 10,
  failsBeforeDeload: 3,
  breakDays: 14,
  restSuccess: 180,
  restFail: 300,
  barWeight: 20,
  plates: [25, 20, 15, 10, 5, 2.5, 1.25],
  sound: true,
  vibrate: true,
  syncUrl: '',
  syncToken: '',
  // Mål = kroppsvikt × faktor. Fylls i per person (synkas via arket).
  bodyweight: 0,
  goalFactors: {},
  goalNote: '',
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

// Lägger sparade/synkade inställningar ovanpå standardvärdena och tvingar rätt typ
// (värden från arket kan vara text, t.ex. "2,5").
export function mergeSettings(base, over) {
  const out = structuredClone(base);
  for (const [k, v] of Object.entries(over || {})) {
    const b = base[k];
    if (b && typeof b === 'object' && !Array.isArray(b)) {
      out[k] = mergeSettings(b, v && typeof v === 'object' ? v : {});
    } else if (typeof b === 'number') {
      const n = parseNum(v);
      if (n != null) out[k] = n;
    } else if (typeof b === 'boolean') {
      out[k] = v === true || v === 'true';
    } else if (Array.isArray(b)) {
      if (Array.isArray(v)) out[k] = v.map(parseNum).filter((x) => x != null);
    } else if (typeof b === 'string') {
      out[k] = v == null ? '' : String(v);
    } else {
      out[k] = v;
    }
  }
  return out;
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

// Passen roteras i programordning; fria pass påverkar inte rotationen.
export function nextWorkout(sessions, settings = DEFAULT_SETTINGS) {
  const programs = getPrograms(settings);
  if (!programs.length) return FREE;
  const names = programs.map((p) => p.name);
  const last = sortByDateDesc(liveSessions(sessions)).find((s) => names.includes(s.workout));
  if (!last) return programs[0].id;
  return programs[(names.indexOf(last.workout) + 1) % programs.length].id;
}

// Lägsta vikt efter deload: tom stång för skivstång, annars noll.
export function deloadWeight(weight, settings = DEFAULT_SETTINGS, pct = settings.deloadPct ?? 10, cfg = null) {
  const type = cfg?.type ?? 'barbell';
  const step = type === 'barbell' ? 2.5 : cfg?.inc || 0.5;
  const min = type === 'barbell' ? settings.barWeight ?? 20 : 0;
  return Math.max(min, roundTo(weight * (1 - pct / 100), step));
}

const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const repsText = (sets, unit) => sets.map((r) => (r == null ? '–' : `${r}${unit}`)).join('/');

function historyFor(sessions, key, beforeDate) {
  return sortByDateDesc(liveSessions(sessions))
    .filter((s) => !beforeDate || s.date < beforeDate)
    .map((s) => ({ date: s.date, e: s.exercises.find((e) => e.key === key && e.sets.some((r) => r != null)) }))
    .filter((x) => x.e);
}

// Förslag för nästa gång: { weight, reps (mål per set), reason, kind, alt? }
//  • linjär (5x5): klarade alla set → öka, missar → samma vikt, N missar i rad → deload
//  • dubbel: öka reps till max i alla set, sedan vikten (och börja om på min)
//  • manuell: samma vikt, men påminn när samma vikt klarats flera gånger i rad
//  • långt uppehåll → deload (deloadPct per hel period om breakDays dagar, max 50 %)
export function suggest(sessions, key, settings = DEFAULT_SETTINGS, beforeDate = null, it = null) {
  const cfg = exConfig(settings, key, it);
  const unit = unitOf(cfg);
  const startReps = cfg.progression === 'linear' ? cfg.repsMax : cfg.repsMin;
  const history = historyFor(sessions, key, beforeDate);

  if (!history.length) {
    const reason = isWeighted(cfg) ? 'Startvikt – välj en vikt du klarar med god teknik' : 'Första gången';
    return { weight: cfg.start, reps: startReps, reason, kind: 'start' };
  }

  const last = history[0].e;
  const loaded = last.weight > 0;
  const pct = settings.deloadPct ?? 10;
  const limit = settings.failsBeforeDeload ?? 3;
  const breakDays = settings.breakDays ?? 14;
  const gap = daysBetween(history[0].date, beforeDate || todayISO());
  if (loaded && breakDays > 0 && gap >= breakDays) {
    const p = Math.min(50, pct * Math.floor(gap / breakDays));
    return {
      weight: deloadWeight(last.weight, settings, p, cfg),
      reps: startReps,
      reason: `Deload −${p} % efter ${Math.round(gap / 7)} veckors uppehåll`,
      kind: 'deload',
    };
  }

  const atLeast = (e, n) => e.sets.length > 0 && e.sets.every((r) => r != null && r >= n);
  const sameWeightStreak = (test) => {
    let n = 0;
    for (const { e } of history) {
      if (e.weight !== last.weight || !test(e)) break;
      n++;
    }
    return n;
  };
  const inc = cfg.inc;

  if (cfg.progression === 'linear') {
    const reps = cfg.repsMax;
    if (atLeast(last, reps)) {
      return { weight: last.weight + inc, reps, reason: `+${fmtKg(inc)} kg – klarade alla set förra gången`, kind: 'up' };
    }
    const fails = sameWeightStreak((e) => !atLeast(e, reps));
    if (loaded && fails >= limit) {
      return { weight: deloadWeight(last.weight, settings, pct, cfg), reps, reason: `Deload −${pct} % efter ${fails} missade pass i rad`, kind: 'deload' };
    }
    return { weight: last.weight, reps, reason: `Samma vikt – försök ${fails + 1} av ${limit}`, kind: 'same' };
  }

  if (cfg.progression === 'double') {
    const { repsMin: min, repsMax: max } = cfg;
    if (atLeast(last, max)) {
      if (isWeighted(cfg) && inc > 0) {
        return { weight: last.weight + inc, reps: min, reason: `Alla set nådde ${max} → +${fmtKg(inc)} kg, börja om på ${min} reps`, kind: 'up' };
      }
      if (cfg.type === 'time') {
        return { weight: last.weight, reps: max, reason: `Du klarar ${max} s i alla set – gör övningen svårare eller höj maxtiden`, kind: 'top' };
      }
      return {
        weight: last.weight,
        reps: max,
        reason: `Du klarar ${cfg.sets} × ${max} – lägg på vikt${inc > 0 ? ` (+${fmtKg(inc)} kg)` : ''} eller välj en svårare variant`,
        kind: 'top',
        ...(inc > 0 ? { alt: last.weight + inc } : {}),
      };
    }
    const fails = sameWeightStreak((e) => e.sets.some((r) => r == null || r < min));
    if (loaded && isWeighted(cfg) && fails >= limit) {
      return { weight: deloadWeight(last.weight, settings, pct, cfg), reps: min, reason: `Deload −${pct} % efter ${fails} pass under ${min} reps`, kind: 'deload' };
    }
    const worst = Math.min(...last.sets.map((r) => r ?? 0));
    const aim = Math.min(max, Math.max(min, worst + (cfg.type === 'time' ? 5 : 1)));
    const prefix = isWeighted(cfg) || loaded ? 'Samma vikt – sikta' : 'Sikta';
    return { weight: last.weight, reps: aim, reason: `${prefix} på ${aim}${unit || ' reps'} i alla set (förra: ${repsText(last.sets, unit)})`, kind: 'same' };
  }

  // manuell: målet är intervallets min; påminn när det börjar gå lätt
  const reps = cfg.repsMin;
  const streak = sameWeightStreak((e) => atLeast(e, reps));
  const easy = cfg.repsMax > cfg.repsMin && atLeast(last, cfg.repsMax);
  if ((streak >= 3 || easy) && inc > 0 && (isWeighted(cfg) || loaded)) {
    return {
      weight: last.weight,
      reps,
      reason: easy
        ? `Du klarade ${cfg.repsMax} reps i alla set – dags att öka?`
        : `Du har klarat ${fmtKg(last.weight)} kg ${streak} gånger i rad – dags att öka?`,
      kind: 'nudge',
      alt: last.weight + inc,
    };
  }
  return { weight: last.weight, reps, reason: 'Samma vikt som förra gången – öka när det känns lätt', kind: 'same' };
}

// Manuell deload ("lugnare period"): utgå från senast lyfta vikt, men aldrig högre än förslaget.
export function manualDeload(sessions, key, settings = DEFAULT_SETTINGS, beforeDate = null, it = null) {
  const cfg = exConfig(settings, key, it);
  const sug = suggest(sessions, key, settings, beforeDate, it);
  const last = historyFor(sessions, key, beforeDate)[0]?.e;
  const base = last ? last.weight : sug.weight;
  if (!(base > 0)) return sug.weight;
  return Math.min(sug.weight, deloadWeight(base, settings, settings.deloadPct ?? 10, cfg));
}

// En rad i ett pass, med förslag på vikt och reps.
export function makeEntry(sessions, key, settings = DEFAULT_SETTINGS, date = todayISO(), it = null) {
  const cfg = exConfig(settings, key, it);
  const s = suggest(sessions, key, settings, date, it);
  return {
    key,
    name: cfg.name,
    weight: s.weight,
    targetReps: s.reps,
    sets: Array(cfg.sets).fill(null),
    ...(it ? { item: { sets: it.sets, repsMin: it.repsMin, repsMax: it.repsMax } } : {}),
  };
}

export function buildSession(sessions, workoutId, settings = DEFAULT_SETTINGS, date = todayISO()) {
  const programs = getPrograms(settings);
  const prog = workoutId === FREE ? null : programs.find((p) => p.id === workoutId) || programs[0] || null;
  return {
    id: uid(),
    date,
    workout: prog ? prog.name : FREE_NAME,
    programId: prog ? prog.id : FREE,
    comment: '',
    bodyweight: null,
    exercises: prog ? prog.items.map((it) => makeEntry(sessions, it.key, settings, date, it)) : [],
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

// Tidsserie per övning: [{date, weight, e1rm, volume, best, success}]
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
        best: Math.max(...ex.sets.map((r) => r || 0)), // bästa set (reps eller sekunder)
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
