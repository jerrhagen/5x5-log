import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  suggest, manualDeload, mergeSettings, nextWorkout, cycleReps, platesPerSide, parseDelimited, importRows,
  toCsv, mergeSessions, buildSession, normalizeDate, parseReps, DEFAULT_SETTINGS,
} from '../js/logic.js';

const sess = (date, workout, exs) => ({
  id: date + workout, date, workout, comment: '', bodyweight: null, updatedAt: 1,
  exercises: exs.map(([key, weight, sets]) => ({ key, name: key, weight, targetReps: 5, sets })),
});
const ok = [5, 5, 5, 5, 5];
// Förslag dagen efter sista testpasset (utan att uppehållsregeln slår till)
const sug = (s, k) => suggest(s, k, DEFAULT_SETTINGS, '2026-01-07');
const miss = [5, 5, 4, 3, 3];

test('startvikt utan historik', () => {
  assert.deepEqual(suggest([], 'squat').weight, 20);
  assert.equal(suggest([], 'deadlift').weight, 40);
});

test('ökar efter lyckat pass', () => {
  const s = [sess('2026-01-01', 'A', [['squat', 100, ok]])];
  assert.equal(sug(s, 'squat').weight, 102.5);
  const d = [sess('2026-01-01', 'B', [['deadlift', 120, [5]]])];
  assert.equal(sug(d, 'deadlift').weight, 125);
});

test('samma vikt efter miss, deload efter tre missar', () => {
  const s1 = [sess('2026-01-01', 'A', [['squat', 100, miss]])];
  assert.equal(sug(s1, 'squat').weight, 100);
  assert.equal(sug(s1, 'squat').kind, 'same');
  const s3 = [
    sess('2026-01-01', 'A', [['squat', 100, miss]]),
    sess('2026-01-03', 'B', [['squat', 100, miss]]),
    sess('2026-01-05', 'A', [['squat', 100, miss]]),
  ];
  const r = sug(s3, 'squat');
  assert.equal(r.kind, 'deload');
  assert.equal(r.weight, 90);
});

test('miss på ny vikt räknas inte ihop med gamla vikten', () => {
  const s = [
    sess('2026-01-01', 'A', [['squat', 97.5, miss]]),
    sess('2026-01-03', 'B', [['squat', 97.5, miss]]),
    sess('2026-01-05', 'A', [['squat', 100, miss]]),
  ];
  assert.equal(sug(s, 'squat').kind, 'same');
});

test('suggest ignorerar pass på eller efter angivet datum', () => {
  const s = [sess('2026-01-01', 'A', [['squat', 100, ok]]), sess('2026-01-03', 'B', [['squat', 102.5, ok]])];
  assert.equal(suggest(s, 'squat', DEFAULT_SETTINGS, '2026-01-03').weight, 102.5);
});

test('växlar A/B', () => {
  assert.equal(nextWorkout([]), 'A');
  assert.equal(nextWorkout([sess('2026-01-01', 'A', [])]), 'B');
  assert.equal(nextWorkout([sess('2026-01-01', 'A', []), sess('2026-01-03', 'B', [])]), 'A');
});

test('buildSession använder programmet', () => {
  const b = buildSession([], 'B', DEFAULT_SETTINGS, '2026-01-01');
  assert.deepEqual(b.exercises.map((e) => e.key), ['squat', 'ohp', 'deadlift']);
  assert.equal(b.exercises[2].sets.length, 1);
});

test('cykla reps', () => {
  assert.equal(cycleReps(null, 5), 5);
  assert.equal(cycleReps(5, 5), 4);
  assert.equal(cycleReps(0, 5), null);
});

test('skivor per sida', () => {
  assert.deepEqual(platesPerSide(100), [25, 15]);
  assert.deepEqual(platesPerSide(62.5), [20, 1.25]);
  assert.deepEqual(platesPerSide(20), []);
});

test('datum och reps', () => {
  assert.equal(normalizeDate('2026-3-7'), '2026-03-07');
  assert.equal(normalizeDate('7/3/2026'), '2026-03-07');
  assert.deepEqual(parseReps('5/5/4/-/3'), [5, 5, 4, null, 3]);
  assert.deepEqual(parseReps('5x5'), [5, 5, 5, 5, 5]);
  assert.deepEqual(parseReps('1x5'), [5]);
});

test('import lång form (tab, decimal-komma) och export tillbaka', () => {
  const text = 'Datum\tÖvning\tVikt\tReps\tKommentar\n2026-01-01\tKnäböj\t102,5\t5/5/5/5/5\tTungt\n2026-01-01\tBänkpress\t60\t5/5/5/4/4\t\n';
  const s = importRows(parseDelimited(text));
  assert.equal(s.length, 1);
  assert.equal(s[0].workout, 'A');
  assert.equal(s[0].comment, 'Tungt');
  assert.equal(s[0].exercises[0].key, 'squat');
  assert.equal(s[0].exercises[0].weight, 102.5);
  const again = importRows(parseDelimited(toCsv(s)));
  assert.deepEqual(again[0].exercises.map((e) => e.sets), s[0].exercises.map((e) => e.sets));
  assert.equal(again[0].id, s[0].id);
});

test('import bred form', () => {
  const text = 'Datum;Knäböj;Bänk;Marklyft\n2026-01-01;100;60;\n2026-01-03;102,5;;120\n';
  const s = importRows(parseDelimited(text));
  assert.equal(s.length, 2);
  assert.deepEqual(s[1].exercises.map((e) => [e.key, e.weight]), [['squat', 102.5], ['deadlift', 120]]);
  assert.equal(s[1].workout, 'B');
});

test('merge – senast uppdaterad vinner', () => {
  const a = { id: 'x', updatedAt: 1, v: 'a' };
  const b = { id: 'x', updatedAt: 2, v: 'b' };
  assert.equal(mergeSessions([a], [b])[0].v, 'b');
  assert.equal(mergeSessions([b], [a])[0].v, 'b');
});

test('deload efter uppehåll', () => {
  const s = [sess('2026-01-01', 'A', [['squat', 100, ok]])];
  assert.equal(suggest(s, 'squat', DEFAULT_SETTINGS, '2026-01-10').kind, 'up');
  const r2 = suggest(s, 'squat', DEFAULT_SETTINGS, '2026-01-20'); // 19 dagar
  assert.equal(r2.kind, 'deload');
  assert.equal(r2.weight, 90);
  assert.equal(suggest(s, 'squat', DEFAULT_SETTINGS, '2026-02-05').weight, 80); // 35 dagar → −20 %
  assert.equal(suggest(s, 'squat', { ...DEFAULT_SETTINGS, breakDays: 0 }, '2026-06-01').kind, 'up');
});

test('manuell deload utgår från senaste vikten', () => {
  const s = [sess('2026-01-01', 'A', [['squat', 100, ok]])];
  assert.equal(manualDeload(s, 'squat', DEFAULT_SETTINGS, '2026-01-03'), 90);
  assert.equal(manualDeload([], 'squat', DEFAULT_SETTINGS, '2026-01-03'), 20);
});

test('inställningar från arket får rätt typ', () => {
  const m = mergeSettings(DEFAULT_SETTINGS, {
    deloadPct: '15', bodyweight: '84,5', sound: 'false', goalNote: 'Mål', exercises: { squat: { inc: '5' } },
    goalFactors: { squat: 1.75 }, plates: ['20', '10'], restSuccess: 'abc',
  });
  assert.equal(m.deloadPct, 15);
  assert.equal(m.bodyweight, 84.5);
  assert.equal(m.sound, false);
  assert.equal(m.exercises.squat.inc, 5);
  assert.equal(m.exercises.bench.inc, 2.5);
  assert.equal(m.goalFactors.squat, 1.75);
  assert.deepEqual(m.plates, [20, 10]);
  assert.equal(m.restSuccess, 180);
});
