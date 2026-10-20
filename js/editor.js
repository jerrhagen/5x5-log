// Program- och övningseditor (under Inställningar). Ändrar store.settings.programs/library.
import * as L from './logic.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const kg = L.fmtKg;

let openKey = null; // vilken övning i banken som är utfälld
let bankOpen = false;

// Banken och programmen sparas först när man ändrar något (null = standard).
function editable(settings) {
  if (!Array.isArray(settings.library) || !settings.library.length) settings.library = L.getLibrary(settings);
  if (!Array.isArray(settings.programs) || !settings.programs.length) settings.programs = L.getPrograms(settings);
  return { library: settings.library, programs: settings.programs };
}

const repsLabel = (min, max, unit) => `${min === max ? kg(max) : `${kg(min)}–${kg(max)}`}${unit}`;

export function exerciseOptions(settings, { placeholder = '', exclude = [] } = {}) {
  const lib = L.getLibrary(settings).filter((e) => !exclude.includes(e.key));
  const groups = Object.entries(L.TYPES).map(([type, label]) => {
    const opts = lib.filter((e) => e.type === type)
      .map((e) => `<option value="${esc(e.key)}">${esc(e.name)}</option>`).join('');
    return opts ? `<optgroup label="${esc(label)}">${opts}</optgroup>` : '';
  }).join('');
  return `${placeholder ? `<option value="">${esc(placeholder)}</option>` : ''}${groups}`;
}

// Ny övning i banken (används även från passvyn). Returnerar övningen.
export function addExercise(settings, name, type = 'dumbbell') {
  const { library } = editable(settings);
  const clean = String(name || '').trim();
  if (!clean) return null;
  const existing = library.find((e) => e.name.toLowerCase() === clean.toLowerCase());
  if (existing) return existing;
  let key = L.exerciseKey(clean) || 'ovning';
  const taken = new Set(library.map((e) => e.key));
  for (let n = 2; taken.has(key); n++) key = `${L.exerciseKey(clean)}-${n}`;
  const ex = { key, name: clean, ...L.TYPE_DEFAULTS[type] || L.TYPE_DEFAULTS.dumbbell, type, rest: null };
  library.push(ex);
  return ex;
}

export function editorHtml(settings, colorOf) {
  const programs = L.getPrograms(settings);
  const library = L.getLibrary(settings);
  const byKey = new Map(library.map((e) => [e.key, e]));

  const progHtml = programs.map((p, pi) => {
    const items = p.items.map((it, ii) => {
      const cfg = L.exConfig(settings, it.key, it);
      const unit = L.unitOf(cfg);
      return `<li style="--c:${colorOf(it.key)}">
        <span class="n"><span class="swatch"></span>${esc(byKey.get(it.key)?.name || it.key)}</span>
        <span class="item-scheme">
          <input data-ed="item-sets" data-p="${pi}" data-i="${ii}" inputmode="numeric" value="${cfg.sets}" aria-label="Antal set"> ×
          <input data-ed="item-min" data-p="${pi}" data-i="${ii}" inputmode="numeric" value="${kg(cfg.repsMin)}" aria-label="Minsta antal reps"> –
          <input data-ed="item-max" data-p="${pi}" data-i="${ii}" inputmode="numeric" value="${kg(cfg.repsMax)}" aria-label="Högsta antal reps">${unit ? ` ${unit}` : ''}
        </span>
        <span class="item-actions">
          <button class="icon-btn" data-act="ed-item-up" data-p="${pi}" data-i="${ii}" aria-label="Flytta upp" ${ii === 0 ? 'disabled' : ''}>↑</button>
          <button class="icon-btn" data-act="ed-item-del" data-p="${pi}" data-i="${ii}" aria-label="Ta bort ur passet">✕</button>
        </span>
      </li>`;
    }).join('');
    return `<div class="prog">
      <div class="prog-head">
        <input class="prog-name" data-ed="prog-name" data-p="${pi}" value="${esc(p.name)}" aria-label="Passets namn">
        <button class="icon-btn" data-act="ed-prog-up" data-p="${pi}" aria-label="Flytta passet upp" ${pi === 0 ? 'disabled' : ''}>↑</button>
        <button class="icon-btn danger" data-act="ed-prog-del" data-p="${pi}" aria-label="Ta bort passet">✕</button>
      </div>
      <ol class="prog-items">${items || '<li class="empty-item">Inga övningar än</li>'}</ol>
      <select class="add-select" data-ed="item-add" data-p="${pi}" aria-label="Lägg till övning i ${esc(p.name)}">
        ${exerciseOptions(settings, { placeholder: '+ Lägg till övning …', exclude: p.items.map((x) => x.key) })}
      </select>
    </div>`;
  }).join('');

  const bankHtml = library.map((e) => {
    const open = openKey === e.key;
    const unit = L.unitOf(e);
    const summary = `${L.TYPES[e.type]} · ${e.sets} × ${repsLabel(e.repsMin, e.repsMax, unit)} · ${{ linear: 'Linjär', double: 'Dubbel', manual: 'Manuell' }[e.progression]}`;
    const k = esc(e.key);
    const num = (field, label, value, suffix = '', placeholder = '') => `<label class="field inline"><span>${label}</span>
      <input data-ed="ex-${field}" data-key="${k}" inputmode="decimal" value="${value == null ? '' : kg(value)}" placeholder="${placeholder}">${suffix ? `<span class="unit">${suffix}</span>` : ''}</label>`;
    const form = open ? `<div class="bank-form">
      <label class="field"><span>Namn</span><input data-ed="ex-name" data-key="${k}" value="${esc(e.name)}"></label>
      <label class="field"><span>Typ</span><select data-ed="ex-type" data-key="${k}">
        ${Object.entries(L.TYPES).map(([t, l]) => `<option value="${t}" ${t === e.type ? 'selected' : ''}>${l}</option>`).join('')}
      </select></label>
      <label class="field"><span>Progression</span><select data-ed="ex-progression" data-key="${k}">
        ${Object.entries(L.PROGRESSIONS).map(([t, l]) => `<option value="${t}" ${t === e.progression ? 'selected' : ''}>${l}</option>`).join('')}
      </select></label>
      ${num('sets', 'Set', e.sets)}
      ${num('repsMin', e.type === 'time' ? 'Minsta tid' : 'Minsta reps', e.repsMin, unit)}
      ${num('repsMax', e.type === 'time' ? 'Längsta tid' : 'Högsta reps', e.repsMax, unit)}
      ${num('inc', e.type === 'bodyweight' ? 'Ökning när man lägger på vikt' : 'Ökning', e.inc, 'kg')}
      ${e.type === 'time' ? '' : num('start', e.type === 'bodyweight' ? 'Extra vikt från start' : 'Startvikt', e.start, 'kg')}
      ${num('rest', 'Vila mellan set', e.rest, 'sek', 'standard')}
      ${num('goal', 'Mål × kroppsvikt', settings.goalFactors?.[e.key] ?? null, '', 'inget')}
      <div class="actions wrap"><button class="btn ghost danger small" data-act="ed-ex-del" data-key="${k}">Ta bort övningen</button></div>
    </div>` : '';
    return `<li class="${open ? 'open' : ''}" style="--c:${colorOf(e.key)}">
      <button class="bank-row" data-act="ed-ex-open" data-key="${k}" aria-expanded="${open}">
        <span class="n"><span class="swatch"></span>${esc(e.name)}</span><span class="bank-sum">${esc(summary)}</span>
      </button>${form}
    </li>`;
  }).join('');

  return `
    <section class="card">
      <h2>Program</h2>
      <p class="sub">Passen föreslås i tur och ordning. <b>Fritt pass</b> finns alltid i passvyn för att plocka övningar ur banken medan du kör. Set × reps kan vara ett intervall, t.ex. 3 × 8–12.</p>
      ${progHtml}
      <div class="actions wrap">
        <button class="btn ghost" data-act="ed-prog-new">+ Nytt pass</button>
        <button class="btn ghost" data-act="ed-reset-5x5">Återställ till 5x5</button>
      </div>
    </section>

    <section class="card">
      <h2>Övningsbank</h2>
      <p class="sub"><b>Linjär</b>: öka vikten när alla set klaras (som 5x5). <b>Dubbel</b>: öka reps upp till max, sedan vikten och börja om på min. <b>Manuell</b>: samma vikt tills du själv ökar – appen påminner när du klarat vikten tre gånger i rad. Kroppsvikts- och tidsövningar ökar i reps/sekunder.</p>
      ${bankOpen || openKey ? `<ul class="bank">${bankHtml}</ul>` : ''}
      <div class="actions wrap">
        <button class="btn ghost" data-act="ed-bank-toggle">${bankOpen || openKey ? 'Dölj övningsbanken' : `Visa övningsbanken (${library.length} övningar)`}</button>
        <button class="btn ghost" data-act="ed-ex-new">+ Ny övning</button>
      </div>
    </section>`;
}

// Klick i editorn. Returnerar true om inställningarna ändrats (då sparas och synkas de).
export function editorAction(act, ds, settings) {
  if (act === 'ed-bank-toggle') {
    bankOpen = !(bankOpen || openKey);
    openKey = null;
    return false;
  }
  if (act === 'ed-ex-open') {
    openKey = openKey === ds.key ? null : ds.key;
    return false;
  }
  if (act === 'ed-reset-5x5') {
    if (!confirm('Ersätta passen med 5x5 (A och B)? Övningsbanken och historiken påverkas inte.')) return false;
    settings.programs = structuredClone(L.DEFAULT_PROGRAMS);
    editable(settings);
    return true;
  }
  const { library, programs } = editable(settings);
  const p = programs[Number(ds.p)];
  const i = Number(ds.i);
  switch (act) {
    case 'ed-prog-new': {
      const name = prompt('Namn på passet (t.ex. "Ben", "Överkropp", "C")', `Pass ${programs.length + 1}`);
      if (!name?.trim()) return false;
      let id = L.exerciseKey(name) || `pass-${programs.length + 1}`;
      while (programs.some((x) => x.id === id)) id += '-2';
      programs.push({ id, name: name.trim(), items: [] });
      return true;
    }
    case 'ed-prog-del':
      if (programs.length <= 1) { alert('Programmet måste ha minst ett pass.'); return false; }
      if (!confirm(`Ta bort passet "${p.name}"? Historiken påverkas inte.`)) return false;
      programs.splice(Number(ds.p), 1);
      return true;
    case 'ed-prog-up': {
      const k = Number(ds.p);
      if (k > 0) [programs[k - 1], programs[k]] = [programs[k], programs[k - 1]];
      return true;
    }
    case 'ed-item-up':
      if (i > 0) [p.items[i - 1], p.items[i]] = [p.items[i], p.items[i - 1]];
      return true;
    case 'ed-item-del':
      p.items.splice(i, 1);
      return true;
    case 'ed-ex-new': {
      const name = prompt('Namn på övningen');
      if (!name?.trim()) return false;
      const ex = addExercise(settings, name, 'dumbbell');
      openKey = ex.key;
      return true;
    }
    case 'ed-ex-del': {
      const ex = library.find((e) => e.key === ds.key);
      const used = programs.filter((x) => x.items.some((it) => it.key === ds.key)).map((x) => x.name);
      const msg = used.length ? `\n\nDen tas också bort ur: ${used.join(', ')}.` : '';
      if (!confirm(`Ta bort "${ex?.name}" ur övningsbanken? Historiken finns kvar.${msg}`)) return false;
      settings.library = library.filter((e) => e.key !== ds.key);
      for (const x of programs) x.items = x.items.filter((it) => it.key !== ds.key);
      openKey = null;
      return true;
    }
    default:
      return false;
  }
}

// Ändrade fält i editorn. Returnerar true om något sparats.
export function editorChange(el, settings) {
  const f = el.dataset.ed;
  if (!f) return false;
  const { library, programs } = editable(settings);
  const p = programs[Number(el.dataset.p)];
  const it = p?.items[Number(el.dataset.i)];
  const num = () => L.parseNum(el.value);
  switch (f) {
    case 'prog-name':
      if (!el.value.trim()) return false;
      p.name = el.value.trim();
      return true;
    case 'item-add': {
      if (!el.value) return false;
      const ex = library.find((e) => e.key === el.value);
      p.items.push({ key: el.value, sets: ex?.sets ?? 3, repsMin: ex?.repsMin ?? 8, repsMax: ex?.repsMax ?? 12 });
      return true;
    }
    case 'item-sets': if (num() > 0) { it.sets = Math.round(num()); return true; } return false;
    case 'item-min': if (num() > 0) { it.repsMin = num(); if ((it.repsMax ?? 0) < it.repsMin) it.repsMax = it.repsMin; return true; } return false;
    case 'item-max': if (num() > 0) { it.repsMax = Math.max(num(), it.repsMin ?? 0); return true; } return false;
    default:
  }
  if (!f.startsWith('ex-')) return false;
  const ex = library.find((e) => e.key === el.dataset.key);
  if (!ex) return false;
  const field = f.slice(3);
  if (field === 'name') {
    if (!el.value.trim()) return false;
    ex.name = el.value.trim();
    return true;
  }
  if (field === 'type' || field === 'progression') {
    ex[field] = el.value;
    return true;
  }
  if (field === 'goal') {
    settings.goalFactors = { ...(settings.goalFactors || {}) };
    const v = num();
    settings.goalFactors[ex.key] = v > 0 ? v : 0; // 0 = inget mål
    return true;
  }
  if (field === 'rest') {
    ex.rest = el.value.trim() === '' ? null : num();
    return true;
  }
  const v = num();
  if (v == null || v < 0) return false;
  ex[field] = field === 'sets' ? Math.max(1, Math.round(v)) : v;
  if (field === 'repsMin' && ex.repsMax < v) ex.repsMax = v;
  if (field === 'repsMax' && ex.repsMin > v) ex.repsMin = v;
  return true;
}
