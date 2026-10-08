'use strict';
/**
 * Bauaufträge: Wird ein Gebäude repariert oder instand gesetzt, sucht das Spiel automatisch eine Baufirma in der Stadt
 * (Betriebe von Spielern und Bots aus dem Baugewerbe). Die Rechnung landet in deren Firmenkasse; gibt es keine,
 * übernimmt ein städtischer Handwerksbetrieb (das Geld verlässt den Kreislauf).
 */
let LIST = [];
const set = (rows) => { LIST = rows || []; };

function pick(cityId, excludeUserId, r = Math.random) {
  const c = LIST.filter((x) => x.city_id === cityId && x.user_id !== excludeUserId);
  if (!c.length) return null;
  const x = c[Math.floor(r() * c.length)];
  return { userId: x.user_id, companyId: x.company_id, name: x.name };
}

/** Auftrag vormerken (der Spielstand wird danach gespeichert, `flush` verteilt das Geld). */
function order(state, user, world, cityId, cents, what) {
  const idx = Math.max(0.0001, world.idx(require('./calendar').yearOf(state.day, state.startYear)));
  const c = pick(cityId, user && user.id);
  state.pending.jobs = state.pending.jobs || [];
  state.pending.jobs.push({ to: c, real: cents / idx, what });
  return c;
}

async function flush(conn, state) {
  const jobs = state.pending && state.pending.jobs; if (!jobs || !jobs.length) return;
  state.pending.jobs = [];
  for (const j of jobs) {
    if (!j.to) continue;
    await conn.query("INSERT INTO pending_credits (user_id, real_amount, reason, text, company_id) VALUES (?,?,'job',?,?)", [j.to.userId, Math.round(j.real), `Bauauftrag: ${j.what}.`, j.to.companyId]);
  }
}

module.exports = { set, pick, order, flush };
