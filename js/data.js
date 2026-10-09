// Lokal lagring (localStorage) + synk mot Google Apps Script.
import { DEFAULT_SETTINGS } from './logic.js';

const K = {
  sessions: '5x5.sessions',
  settings: '5x5.settings',
  draft: '5x5.draft',
  timer: '5x5.timer',
  pending: '5x5.pending',
  lastSync: '5x5.lastSync',
  ui: '5x5.ui',
};

function read(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* privat läge / full lagring – appen fungerar ändå under sessionen */
  }
}

function mergeDeep(base, over) {
  const out = structuredClone(base);
  for (const [k, v] of Object.entries(over || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof out[k] === 'object' && !Array.isArray(out[k])) {
      out[k] = mergeDeep(out[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export const store = {
  sessions: read(K.sessions, []),
  settings: mergeDeep(DEFAULT_SETTINGS, read(K.settings, {})),
  pending: read(K.pending, { deletes: [] }),
  lastSync: read(K.lastSync, null),
  ui: read(K.ui, {}),

  saveSessions() { write(K.sessions, this.sessions); },
  saveSettings() { write(K.settings, this.settings); },
  savePending() { write(K.pending, this.pending); },
  saveUi() { write(K.ui, this.ui); },

  getDraft() { return read(K.draft, null); },
  setDraft(d) { write(K.draft, d); },
  getTimer() { return read(K.timer, null); },
  setTimer(t) { write(K.timer, t); },

  upsert(session) {
    session.updatedAt = Date.now();
    session.synced = false;
    const i = this.sessions.findIndex((s) => s.id === session.id);
    if (i >= 0) this.sessions[i] = session;
    else this.sessions.push(session);
    this.saveSessions();
  },

  remove(id) {
    const s = this.sessions.find((x) => x.id === id);
    this.sessions = this.sessions.filter((x) => x.id !== id);
    if (s?.synced) {
      this.pending.deletes.push(id);
      this.savePending();
    }
    this.saveSessions();
  },

  addImported(list) {
    const ids = new Set(this.sessions.map((s) => s.id));
    const dates = new Set(this.sessions.filter((s) => !s.id.startsWith('imp-')).map((s) => s.date));
    let added = 0;
    for (const s of list) {
      if (ids.has(s.id) || dates.has(s.date)) continue;
      this.sessions.push({ ...s, updatedAt: s.updatedAt || 1, synced: false });
      added++;
    }
    this.saveSessions();
    return added;
  },

  clearAll() {
    for (const k of Object.values(K)) write(k, null);
    this.sessions = [];
    this.pending = { deletes: [] };
    this.lastSync = null;
  },

  get syncEnabled() {
    return Boolean(this.settings.syncUrl && this.settings.syncToken);
  },
};

// ---------- Synk ----------

async function call(payload) {
  const { syncUrl, syncToken } = store.settings;
  // text/plain undviker CORS-preflight som Apps Script inte stödjer.
  const res = await fetch(syncUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...payload, token: syncToken }),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error('Oväntat svar – kontrollera att webbappen är publicerad med åtkomst "Alla".');
  }
  if (!data.ok) throw new Error(data.error || 'Okänt fel');
  return data;
}

const strip = ({ synced, suggestion, ...s }) => ({
  ...s,
  exercises: s.exercises.map(({ suggestion: _s, ...e }) => e),
});

let running = null;

export function sync() {
  if (!store.syncEnabled) return Promise.resolve({ skipped: true });
  if (!running) running = doSync().finally(() => { running = null; });
  return running;
}

async function doSync() {
  if (store.pending.deletes.length) {
    await call({ action: 'delete', ids: store.pending.deletes });
    store.pending.deletes = [];
    store.savePending();
  }

  const remote = (await call({ action: 'list' })).sessions || [];
  const remoteById = new Map(remote.map((s) => [s.id, s]));
  const next = [];
  const toPush = [];

  for (const local of store.sessions) {
    const r = remoteById.get(local.id);
    if (r) {
      remoteById.delete(local.id);
      if (!local.synced && (local.updatedAt || 0) >= (r.updatedAt || 0)) {
        toPush.push(local);
        next.push(local);
      } else {
        next.push({ ...r, synced: true });
      }
    } else if (local.synced) {
      // Fanns i arket förut men är borttagen där → ta bort lokalt.
    } else {
      toPush.push(local);
      next.push(local);
    }
  }
  for (const r of remoteById.values()) next.push({ ...r, synced: true });

  const imported = toPush.filter((s) => s.id.startsWith('imp-'));
  const logged = toPush.filter((s) => !s.id.startsWith('imp-'));
  if (imported.length) await call({ action: 'upsert', sessions: imported.map(strip), writeBack: false });
  if (logged.length) await call({ action: 'upsert', sessions: logged.map(strip) });
  for (const s of toPush) s.synced = true;

  store.sessions = next;
  store.saveSessions();
  store.lastSync = Date.now();
  write(K.lastSync, store.lastSync);
  return { pushed: toPush.length, total: next.length };
}

export async function ping() {
  return call({ action: 'ping' });
}

export async function fetchTabs() {
  return (await call({ action: 'tabs' })).tabs || [];
}
