'use strict';
const { yearOf } = require('./calendar');
const { scale } = require('./economy');
const { clamp, notice, residenceProperty } = require('./core');
const biz = require('./business');

/** Gebäude einer Stadt: öffentliche Orte + alles, was dem Spieler dort gehört oder dient. */
function buildingsFor(world, state, cityId) {
  const city = world.city(cityId);
  if (!city) return [];
  const year = yearOf(state.day, state.startYear);
  const g = world.econ.gambling;
  const list = [
    { key: 'rathaus', type: 'rathaus', name: `Rathaus ${city.name}`, icon: 'landmark' },
    { key: 'bahnhof', type: 'bahnhof', name: 'Bahnhof', icon: 'truck' },
    { key: 'markt', type: 'markt', name: 'Markthalle', icon: 'shopping-basket' },
    { key: 'arzt', type: 'arzt', name: 'Arztpraxis', icon: 'stethoscope' },
    { key: 'schule', type: 'schule', name: 'Schule', icon: 'school' },
    { key: 'zeitung', type: 'zeitung', name: year >= 2002 ? 'Medienhaus' : 'Zeitungsverlag', icon: 'newspaper' },
    { key: 'lotto', type: 'lotto', name: 'Lotto-Annahmestelle', icon: 'ticket' },
    { key: 'pension', type: 'pension', name: 'Pension', icon: 'hotel' },
  ];
  if (year >= g.casinoFromYear && city.size_tier >= 3) list.push({ key: 'spielbank', type: 'spielbank', name: 'Spielbank', icon: 'dices' });
  const h = state.housing;
  if (state.cityId === cityId && ['rent', 'pension', 'workplace'].includes(h.type)) {
    const idx = list.findIndex((b) => b.key === 'pension');
    if (h.type === 'pension' && idx >= 0) { list[idx] = { ...list[idx], own: true, name: h.name || 'Deine Pension', home: true }; } else if (h.type === 'rent') list.push({ key: 'home', type: 'home', name: h.name || 'Deine Wohnung', icon: 'house', own: true, home: true, rooms: h.rooms || 1 });
  }
  for (const p of state.properties.filter((x) => x.cityId === cityId)) {
    list.push({ key: `prop:${p.id}`, type: 'home', name: p.name, icon: p.kind === 'villa' ? 'castle' : 'house', own: true, ref: p.id, rooms: p.rooms, villa: p.kind === 'villa', residence: state.housing.propertyId === p.id, condition: Math.round(p.condition) });
  }
  for (const c of (state.companies || []).filter((x) => x.cityId === cityId)) {
    list.push({ key: `biz:${c.id}`, type: 'biz', name: c.name, icon: 'store', own: true, ref: c.id, pkey: c.pkey, tier: c.tier, rooms: c.rooms, abandoned: !!c.abandoned });
  }
  const o = state.occupation;
  if (o && o.cityId === cityId && o.kind !== 'study' && !o.ownCompanyId) {
    const p = world.prof(o.pkey);
    list.push({ key: 'work', type: 'work', name: o.employer, icon: (p && p.icon) || 'briefcase', own: true, pkey: o.pkey, lodging: !!o.lodging, kind: o.kind });
  }
  return list;
}

/* ---------------- Aufgaben ---------------- */
const taskCfg = (world) => world.econ.tasks;
function tasksOf(world, b) {
  const t = taskCfg(world);
  const key = b.type === 'home' ? 'home' : b.type;
  return (t[key] || []).map((x) => ({ ...x }));
}

function taskStatus(world, state, b, t, now) {
  const cdUntil = (state.taskCd || {})[`${b.key}:${t.id}`] || 0;
  const left = Math.max(0, Math.ceil((cdUntil - now) / 60000));
  let blocked = null;
  if (t.requires === 'children' && !state.children.some((c) => c.status === 'home')) blocked = 'Dafür brauchst du Kinder.';
  if (b.abandoned) blocked = 'Der Betrieb steht leer.';
  return { ...t, cooldownLeft: left, ready: left === 0 && !blocked, blocked };
}

function berlinDay(ms) { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date(ms)); }

function install(A, fail, { yr, pay, settings }) {
  const find = (world, state, key) => {
    const b = buildingsFor(world, state, state.cityId).find((x) => x.key === key);
    if (!b) fail('Dieses Gebäude gibt es hier nicht (oder du bist nicht in dieser Stadt).');
    return b;
  };
  A.taskStart = ({ world, state, input, now }) => {
    const b = find(world, state, String(input.building));
    const t = tasksOf(world, b).find((x) => x.id === input.task);
    if (!t) fail('Unbekannte Aufgabe.');
    const st = taskStatus(world, state, b, t, now);
    if (!st.ready) fail(st.blocked || `Das geht erst wieder in ${st.cooldownLeft} Min.`);
    state.pending.taskStart = state.pending.taskStart || {};
    state.pending.taskStart[`${b.key}:${t.id}`] = now;
    return { msg: '' };
  };
  A.taskFinish = ({ world, state, input, user, now }) => {
    const b = find(world, state, String(input.building));
    const t = tasksOf(world, b).find((x) => x.id === input.task);
    if (!t) fail('Unbekannte Aufgabe.');
    const k = `${b.key}:${t.id}`;
    const st = taskStatus(world, state, b, t, now);
    if (!st.ready) fail(st.blocked || `Das geht erst wieder in ${st.cooldownLeft} Min.`);
    if (t.minSeconds) {
      const started = (state.pending.taskStart || {})[k];
      if (!started || now - started < t.minSeconds * 1000 - 800) fail('Die Aufgabe wurde nicht abgeschlossen.');
    }
    delete (state.pending.taskStart || {})[k];
    state.taskCd = state.taskCd || {};
    state.taskCd[k] = now + t.cooldownMin * 60000;
    const r = t.reward || {}; const m = state.meters; const parts = [];
    const idx = world.idx(yr(state));
    if (r.efs) {
      const today = berlinDay(now);
      const am = user.meta.activeEfs && user.meta.activeEfs.date === today ? user.meta.activeEfs : { date: today, amount: 0 };
      const cap = settings.get('efs.active_daily_cap');
      const gain = Math.max(0, Math.min(r.efs, cap - am.amount));
      if (gain > 0) { am.amount += gain; user.meta.activeEfs = am; state.fx.efs += gain; parts.push(`+${gain} EFS`); } else parts.push('EFS-Tageslimit erreicht');
    }
    if (r.rest) { m.rest = clamp(m.rest + r.rest, 0, 100); parts.push(`${r.rest > 0 ? '+' : ''}${r.rest} Erholung`); }
    if (r.wellbeing) { m.wellbeing = clamp(m.wellbeing + r.wellbeing, 0, 100); parts.push(`+${r.wellbeing} Wohlbefinden`); }
    if (r.health) { m.health = clamp(m.health + r.health, 0, 100); parts.push(`+${r.health} Gesundheit`); }
    if (r.money) { const v = scale(r.money, idx); state.money += v; state.stats.earned += v; parts.push('Trinkgeld'); }
    if (r.influence) { state.fx.influence = (state.fx.influence || 0) + r.influence; parts.push(`+${r.influence} Einfluss`); }
    if (r.childSat) { for (const c of state.children.filter((x) => x.status === 'home')) c.sat = clamp(c.sat + r.childSat, 0, 100); parts.push('Kinder freuen sich'); }
    if (r.bizCash && b.type === 'biz') {
      const c = state.companies.find((x) => x.id === b.ref);
      if (c) { const f = biz.companyFlows(world, state, c, yr(state)); const bonus = Math.max(0, Math.round(f.income * r.bizCash)); c.cash += bonus; parts.push('Extra-Umsatz'); }
    }
    return { msg: `${t.name}: ${parts.join(' · ')}`, level: 'good' };
  };
}

module.exports = { buildingsFor, tasksOf, taskStatus, install };
