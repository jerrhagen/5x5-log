// Lokal lagring (localStorage) + synk mot Google Apps Script.
import { DEFAULT_SETTINGS, mergeSettings } from './logic.js';

const K = {
  sessions: '5x5.sessions',
  settings: '5x5.settings',
  draft: '5x5.draft',
  timer: '5x5.timer',
  pending: '5x5.pending',
  lastSync: '5x5.lastSync',
  ui: '5x5.ui',
  settingsMeta: '5x5.settingsMeta',
};

// Allt utom adress och nyckel synkas mellan enheter (fliken "Inställningar").
const LOCAL_ONLY = ['syncUrl', 'syncToken'];

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

export const store = {
  sessions: read(K.sessions, []),
  settings: mergeSettings(DEFAULT_SETTINGS, read(K.settings, {})),
  settingsMeta: read(K.settingsMeta, { updatedAt: 0, dirty: false }),
  pending: read(K.pending, { deletes: [] }),
  lastSync: read(K.lastSync, null),
  ui: read(K.ui, {}),

  saveSessions() { write(K.sessions, this.sessions); },
  saveSettings() { write(K.settings, this.settings); },
  savePending() { write(K.pending, this.pending); },
  saveUi() { write(K.ui, this.ui); },

  // Markera att inställningarna ändrats på den här enheten (synkas vid nästa synk).
  touchSettings() {
    this.settingsMeta = { updatedAt: Date.now(), dirty: true };
    write(K.settingsMeta, this.settingsMeta);
  },

  syncedSettings() {
    const out = structuredClone(this.settings);
    for (const k of LOCAL_ONLY) delete out[k];
    out.ui = { range: this.ui.range || '1y', hiddenLifts: this.ui.hiddenLifts || [] };
    return out;
  },

  applyRemoteSettings(remote, updatedAt) {
    const { ui, ...rest } = remote || {};
    const local = Object.fromEntries(LOCAL_ONLY.map((k) => [k, this.settings[k]]));
    this.settings = { ...mergeSettings(DEFAULT_SETTINGS, rest), ...local };
    if (ui && typeof ui === 'object') {
      if (typeof ui.range === 'string') this.ui.range = ui.range;
      if (Array.isArray(ui.hiddenLifts)) this.ui.hiddenLifts = ui.hiddenLifts;
      this.saveUi();
    }
    this.saveSettings();
    this.settingsMeta = { updatedAt, dirty: false };
    write(K.settingsMeta, this.settingsMeta);
  },

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
    this.settingsMeta = { updatedAt: 0, dirty: false };
  },

  get syncEnabled() {
    return Boolean(this.settings.syncUrl && this.settings.syncToken);
  },
};

// ---------- Synk ----------

async function call(payload) {
  const { syncUrl, syncToken } = store.settings;
  // text/plain undviker CORS-preflight som Apps Script inte stödjer.
  // Avbryt anrop som hänger (t.ex. när mobilen bytt nät) så att synken inte fastnar.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45000);
  let res;
  try {
    res = await fetch(syncUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...payload, token: syncToken }),
      redirect: 'follow',
      signal: ctrl.signal,
    });
  } catch (err) {
    throw new Error(err.name === 'AbortError' ? 'Arket svarade inte i tid' : err.message);
  } finally {
    clearTimeout(timer);
  }
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

// Anropen mot Apps Script tar några sekunder. Allt som ändras under tiden (nya/ändrade/borttagna
// pass, ändrade inställningar) ska överleva synken och skickas vid nästa.
async function doSync() {
  if (store.pending.deletes.length) {
    const ids = [...store.pending.deletes];
    await call({ action: 'delete', ids });
    store.pending.deletes = store.pending.deletes.filter((id) => !ids.includes(id));
    store.savePending();
  }

  const listed = await call({ action: 'list' });
  const remote = listed.sessions || [];
  await syncSettings(listed);

  const snapshot = store.sessions;
  const seen = new Set(snapshot);
  const remoteById = new Map(remote.map((s) => [s.id, s]));
  const next = [];
  const toPush = [];

  for (const local of snapshot) {
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

  // Ta hänsyn till det som hänt lokalt medan vi väntade på arket.
  const snapIds = new Set(snapshot.map((s) => s.id));
  const currentIds = new Set(store.sessions.map((s) => s.id));
  const merged = next.filter((s) => !snapIds.has(s.id) || currentIds.has(s.id)); // borttagna under synken
  const index = new Map(merged.map((s, i) => [s.id, i]));
  for (const s of store.sessions) {
    if (seen.has(s)) continue; // oförändrad sedan synken började
    if (index.has(s.id)) merged[index.get(s.id)] = s;
    else merged.push(s);
  }

  store.sessions = merged;
  store.saveSessions();
  store.lastSync = Date.now();
  write(K.lastSync, store.lastSync);
  return { pushed: toPush.length, total: merged.length };
}

// Senast ändrade vinner. Har arket inga inställningar än skickas den här enhetens.
async function syncSettings(listed) {
  if (!('settings' in listed)) {
    store.settingsUnsupported = true; // gammal Code.gs utan stöd för inställningar
    return;
  }
  store.settingsUnsupported = false;
  const meta = store.settingsMeta;
  const localAt = Number(meta.updatedAt) || 0;
  const remoteAt = Number(listed.settingsUpdatedAt) || 0;
  if (listed.settings && remoteAt > localAt) {
    store.applyRemoteSettings(listed.settings, remoteAt);
    return;
  }
  if (!listed.settings || meta.dirty) {
    const updatedAt = localAt || 1;
    const r = await call({ action: 'saveSettings', settings: store.syncedSettings(), updatedAt });
    // Ändrades inställningarna medan vi väntade? Då är de fortfarande osynkade och skickas nästa gång.
    if (store.settingsMeta !== meta) return;
    if (r.saved) {
      store.settingsMeta = { updatedAt, dirty: false };
      write(K.settingsMeta, store.settingsMeta);
    } else {
      store.applyRemoteSettings(r.settings, r.updatedAt);
    }
  }
}

export async function ping() {
  return call({ action: 'ping' });
}

export async function fetchTabs() {
  return (await call({ action: 'tabs' })).tabs || [];
}
