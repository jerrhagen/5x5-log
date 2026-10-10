/**
 * 5x5-logg – synk mot Google Sheets.
 *
 * Installeras i ditt kalkylark ("Biff"): Tillägg → Apps Script, klistra in hela filen,
 * byt TOKEN nedan och publicera som webbapp (se README.md).
 *
 * Appen sparar sina pass i fliken "Logg" (en rad per övning) och mål/inställningar i fliken
 * "Inställningar", så att alla enheter ser exakt samma sak. Om SKRIV_TILL_ARSFLIK
 * är true skrivs vikterna dessutom in på rätt datumrad i din årsflik (t.ex. "2026"),
 * så att dina befintliga grafer i arket fortsätter att uppdateras.
 */

const TOKEN = 'BYT-TILL-EN-EGEN-HEMLIG-NYCKEL';
const SKRIV_TILL_ARSFLIK = true;

const LOGG = 'Logg';
const INST = 'Inställningar';
const UPPDATERAD = '_uppdaterad';
const HEADERS = ['id', 'datum', 'pass', 'övning', 'vikt', 'reps', 'kommentar', 'kroppsvikt', 'uppdaterad'];

const ALIASES = {
  squat: ['knäböj', 'squat'],
  bench: ['bänkpress', 'bänk', 'bench'],
  row: ['stångrodd', 'skivstångsrodd', 'rodd', 'row'],
  ohp: ['axelpress', 'militärpress', 'press', 'ohp'],
  deadlift: ['marklyft', 'deadlift'],
};

function doGet(e) {
  return handle_(e.parameter || {});
}

function doPost(e) {
  let body = {};
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'Ogiltig JSON' });
  }
  return handle_(body);
}

function handle_(req) {
  if (!TOKEN || TOKEN.indexOf('BYT-TILL') === 0) return json_({ ok: false, error: 'Byt TOKEN i Code.gs först' });
  if (req.token !== TOKEN) return json_({ ok: false, error: 'Fel nyckel' });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    switch (req.action) {
      case 'ping':
        return json_({ ok: true, name: SpreadsheetApp.getActive().getName() });
      case 'list': {
        const st = readSettings_();
        return json_({ ok: true, sessions: readSessions_(), settings: st.settings, settingsUpdatedAt: st.updatedAt });
      }
      case 'saveSettings': {
        const cur = readSettings_();
        if (cur.settings && cur.updatedAt > (req.updatedAt || 0)) {
          return json_({ ok: true, saved: false, settings: cur.settings, updatedAt: cur.updatedAt });
        }
        writeSettings_(req.settings || {}, req.updatedAt || Date.now());
        return json_({ ok: true, saved: true });
      }
      case 'upsert': {
        const sessions = req.sessions || [];
        upsert_(sessions);
        if (SKRIV_TILL_ARSFLIK && req.writeBack !== false && sessions.length) {
          const sections = yearSections_();
          sessions.forEach(function (s) { writeToYearTab_(s, sections); });
        }
        return json_({ ok: true });
      }
      case 'delete':
        remove_(req.ids || []);
        return json_({ ok: true });
      case 'tabs':
        return json_({ ok: true, tabs: readTabs_() });
      default:
        return json_({ ok: false, error: 'Okänd action: ' + req.action });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- Fliken "Logg" ----------

function loggSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(LOGG);
  if (!sh) {
    sh = ss.insertSheet(LOGG);
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('A:B').setNumberFormat('@');
    sh.getRange('F:F').setNumberFormat('@');
    sh.getRange('I:I').setNumberFormat('@');
  }
  return sh;
}

function readRows_() {
  const sh = loggSheet_();
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, HEADERS.length).getDisplayValues();
}

function readSessions_() {
  const map = {};
  const order = [];
  readRows_().forEach(function (r) {
    const id = r[0];
    if (!id) return;
    if (!map[id]) {
      map[id] = { id: id, date: r[1], workout: r[2], comment: '', bodyweight: null, exercises: [], updatedAt: Number(r[8]) || 0 };
      order.push(id);
    }
    const s = map[id];
    if (r[6] && !s.comment) s.comment = r[6];
    if (r[7] && s.bodyweight == null) s.bodyweight = num_(r[7]);
    const reps = String(r[5]).split('/').map(function (x) {
      x = x.trim();
      return x === '' || x === '-' ? null : Number(x);
    });
    s.exercises.push({ key: keyOf_(r[3]), name: r[3], weight: num_(r[4]), targetReps: 5, sets: reps });
  });
  return order.map(function (id) { return map[id]; });
}

function sessionRows_(s) {
  return s.exercises.map(function (e, i) {
    return [
      s.id, s.date, s.workout || '', e.name, e.weight,
      e.sets.map(function (r) { return r == null ? '-' : r; }).join('/'),
      i === 0 ? s.comment || '' : '',
      i === 0 && s.bodyweight != null ? s.bodyweight : '',
      String(s.updatedAt || Date.now()),
    ];
  });
}

function writeAll_(rows) {
  const sh = loggSheet_();
  const last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, HEADERS.length).clearContent();
  rows.sort(function (a, b) { return a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0; });
  if (rows.length) sh.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
}

function upsert_(sessions) {
  const ids = {};
  sessions.forEach(function (s) { ids[s.id] = true; });
  const keep = readRows_().filter(function (r) { return r[0] && !ids[r[0]]; }).map(function (r) {
    r[4] = num_(r[4]);
    return r;
  });
  sessions.forEach(function (s) { keep.push.apply(keep, sessionRows_(s)); });
  writeAll_(keep);
}

function remove_(ids) {
  const del = {};
  ids.forEach(function (id) { del[id] = true; });
  writeAll_(readRows_().filter(function (r) { return r[0] && !del[r[0]]; }).map(function (r) {
    r[4] = num_(r[4]);
    return r;
  }));
}

// ---------- Fliken "Inställningar" ----------
// En rad per inställning: nyckel (t.ex. "goalFactors.squat") och värde som JSON (t.ex. 1.5).

function settingsSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(INST);
  if (!sh) {
    sh = ss.insertSheet(INST);
    sh.getRange('A:B').setNumberFormat('@');
    sh.getRange(1, 1, 1, 2).setValues([['nyckel', 'värde']]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function readSettings_() {
  const sh = settingsSheet_();
  const n = sh.getLastRow() - 1;
  const out = { settings: null, updatedAt: 0 };
  if (n < 1) return out;
  const obj = {};
  sh.getRange(2, 1, n, 2).getDisplayValues().forEach(function (r) {
    const key = String(r[0]).trim();
    if (!key) return;
    if (key === UPPDATERAD) { out.updatedAt = Number(r[1]) || 0; return; }
    let v = r[1];
    try { v = JSON.parse(v); } catch (err) { /* vanlig text, t.ex. inskriven för hand */ }
    const parts = key.split('.');
    let o = obj;
    for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]] = o[parts[i]] || {};
    o[parts[parts.length - 1]] = v;
  });
  if (Object.keys(obj).length) out.settings = obj;
  return out;
}

function writeSettings_(settings, updatedAt) {
  const rows = [];
  (function flat(o, prefix) {
    Object.keys(o).sort().forEach(function (k) {
      const v = o[k];
      if (v && typeof v === 'object' && !Array.isArray(v)) flat(v, prefix + k + '.');
      else rows.push([prefix + k, JSON.stringify(v)]);
    });
  })(settings, '');
  rows.push([UPPDATERAD, String(updatedAt)]);
  const sh = settingsSheet_();
  const last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, 2).clearContent();
  sh.getRange(2, 1, rows.length, 2).setValues(rows);
}

// Ändrar du en inställning direkt i arket markeras den som ny, så att apparna hämtar den.
function onEdit(e) {
  const sh = e && e.range && e.range.getSheet();
  if (!sh || sh.getName() !== INST || e.range.getRow() < 2) return;
  const keys = sh.getRange(2, 1, Math.max(1, sh.getLastRow() - 1), 1).getDisplayValues();
  for (let i = 0; i < keys.length; i++) {
    if (keys[i][0] === UPPDATERAD) {
      sh.getRange(i + 2, 2).setValue(String(Date.now()));
      return;
    }
  }
}

// ---------- Övriga flikar (import + årsflik) ----------

function readTabs_() {
  return SpreadsheetApp.getActive().getSheets()
    .filter(function (sh) { return sh.getName() !== LOGG && sh.getName() !== INST && sh.getLastRow() > 0; })
    .map(function (sh) {
      return { name: sh.getName(), rows: sh.getRange(1, 1, sh.getLastRow(), Math.max(1, sh.getLastColumn())).getDisplayValues() };
    });
}

// Hittar flikens sista rubrikrad (den som har "Datum" + övningskolumner).
function yearSection_(sh) {
  const values = sh.getDataRange().getDisplayValues();
  let header = -1;
  let cols = null;
  values.forEach(function (r, i) {
    const lower = r.map(function (c) { return String(c).trim().toLowerCase(); });
    const d = lower.indexOf('datum');
    if (d < 0) return;
    const ex = {};
    let comment = -1;
    lower.forEach(function (h, j) {
      const k = keyOf_(h);
      if (ALIASES[k] && ex[k] == null) ex[k] = j;
      if (h.indexOf('kommentar') === 0) comment = j;
    });
    if (Object.keys(ex).length) {
      header = i;
      cols = { date: d, ex: ex, comment: comment };
    }
  });
  if (header < 0) return null;
  let first = null;
  for (let i = header + 1; i < values.length; i++) {
    const v = values[i][cols.date];
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) { first = v; break; }
  }
  return { sheet: sh, values: values, header: header, cols: cols, first: first };
}

function yearSections_() {
  return SpreadsheetApp.getActive().getSheets()
    .filter(function (sh) { return sh.getName() !== LOGG && sh.getName() !== INST; })
    .map(yearSection_)
    .filter(function (x) { return x && x.first; })
    .sort(function (a, b) { return a.first < b.first ? 1 : -1; });
}

// Skriver passet på datumraden i den nyaste flik vars logg har börjat före passets datum.
function writeToYearTab_(s, all) {
  const sections = all.filter(function (x) { return x.first <= s.date; });
  for (let t = 0; t < sections.length; t++) {
    const sec = sections[t];
    for (let i = sec.header + 1; i < sec.values.length; i++) {
      if (sec.values[i][sec.cols.date] !== s.date) continue;
      const row = i + 1;
      const notes = [];
      if (s.comment) notes.push(s.comment);
      s.exercises.forEach(function (e) {
        const col = sec.cols.ex[e.key];
        if (col != null) sec.sheet.getRange(row, col + 1).setValue(e.weight);
        const ok = e.sets.length && e.sets.every(function (r) { return r != null && r >= (e.targetReps || 5); });
        if (!ok) notes.push(e.name + ' ' + e.sets.map(function (r) { return r == null ? '-' : r; }).join('/'));
      });
      if (sec.cols.comment >= 0 && notes.length) sec.sheet.getRange(row, sec.cols.comment + 1).setValue(notes.join(' · '));
      return;
    }
  }
}

// ---------- Hjälpare ----------

function keyOf_(name) {
  const n = String(name || '').replace(/\(.*?\)/g, '').trim().toLowerCase();
  for (const k in ALIASES) if (ALIASES[k].indexOf(n) >= 0) return k;
  return n;
}

function num_(v) {
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(/\s/g, '').replace(',', '.'));
  return isNaN(n) ? null : n;
}
