'use strict';
/**
 * Spieler als Mieter bei Spielern. Der Eigentümer schreibt eine vermietete Immobilie für Spieler aus (letPlayers); ein Spieler in derselben
 * Stadt zieht ein. Die Miete wird bei Einzug in „Wert von 1945“ festgeschrieben: Der Mieter zahlt sie als Wohnkosten (housing.type = 'rent'),
 * der Eigentümer bekommt sie als Mieteinnahme (inc.rent) – beide Spielstände rechnen unabhängig, `player_leases` hält sie zusammen.
 */
const db = require('../db');
const service = require('../game/service');
const social = require('./social');
const anticheat = require('./anticheat');
const landlord = require('../game/landlord');
const { yearOf } = require('../game/calendar');
const { notice, chronicle } = require('../game/core');
const { ActionError } = require('../game/actions');
const settings = require('../settings');

const fail = (m) => { throw new ActionError(m); };
const idxOf = (world, s) => Math.max(0.0001, world.idx(yearOf(s.day, s.startYear)));
const worldP = () => require('../game/world').get();
const name = (s) => `${s.person.first} ${s.person.last}`;

async function take(tenantId, ownerId, propId) {
  const M = settings.get('market'); if (!M.enabled) fail('Der Spielermarkt ist gerade geschlossen.');
  if (tenantId === ownerId) fail('Du kannst nicht bei dir selbst mieten.');
  const world = await worldP();
  const rel = await social.relation(tenantId, ownerId); if (rel === 'blocked' || rel === 'blocked_by') fail('Dieser Spieler ist nicht erreichbar.');
  if (await social.sameIp(tenantId, ownerId)) { anticheat.flag(tenantId, 'gift_ring', `Mietversuch bei Konto gleicher IP (Nutzer ${ownerId})`); fail('Zwischen Konten mit derselben Internetverbindung ist das nicht erlaubt.'); }
  return db.tx(async (conn) => {
    const { rowA, sA, rowB, sB } = await social.lockPair(conn, ownerId, tenantId);
    if (sA.status !== 'alive' || sB.status !== 'alive') fail('Beide Seiten brauchen einen lebenden Charakter.');
    const p = sA.properties.find((x) => x.id === propId); const L = p && p.lease;
    if (!p || !L || !L.on || !L.players || L.tenant) fail('Diese Wohnung ist nicht mehr zu haben.');
    if (landlord.isResidence(sA, p) || p.closedUntil > sA.day) fail('Diese Wohnung ist nicht bezugsfertig.');
    if (sB.cityId !== p.cityId) fail('Du kannst nur in der Stadt einziehen, in der du lebst.');
    if (sB.day < M.minGameDays) fail(`Dein Charakter muss mindestens ${M.minGameDays} Spieltage alt sein.`);
    if (sB.housing && sB.housing.lessor) fail('Du wohnst schon zur Miete bei einem Spieler. Ziehe zuerst aus.');
    const rentOwner = landlord.rentPerDay(world, sA, p, yearOf(sA.day, sA.startYear));
    const contract = Math.round(rentOwner / idxOf(world, sA));
    const rentTenant = Math.round(contract * idxOf(world, sB));
    if (sB.money < rentTenant * 30) fail('Du brauchst Rücklagen für mindestens 30 Tage Miete.');
    await conn.query('INSERT INTO player_leases (owner_id, prop_id, tenant_id, rent_real) VALUES (?,?,?,?)', [ownerId, propId, tenantId, contract]);
    L.tenant = { name: name(sB), since: sA.day, until: sA.day + 100000, arrears: 0, userId: tenantId, contractReal: contract };
    sB.housing = { type: 'rent', cityId: p.cityId, base: contract, rooms: p.rooms, name: p.name, lessor: { ownerId, propId } };
    notice(sA, { level: 'good', title: `${p.name}: ${name(sB)} zieht ein`, text: 'Die Miete fließt ab sofort täglich.', tab: 'housing', interrupt: true });
    notice(sB, { level: 'good', title: `Neue Wohnung: ${p.name}`, text: `Du wohnst jetzt zur Miete bei ${name(sA)}.`, tab: 'housing', interrupt: true });
    chronicle(sB, `${sB.person.first} zieht in ${p.name}.`, 'life');
    await service.saveCharacter(conn, rowA, sA); await service.saveCharacter(conn, rowB, sB);
    await social.upsertStats(conn, await service.loadUser(conn, ownerId), rowA, sA, world); await social.upsertStats(conn, await service.loadUser(conn, tenantId), rowB, sB, world);
    return { rent: rentTenant };
  });
}

/** Mieter zieht aus. */
async function leave(tenantId) {
  return service.withCharacter(tenantId, async (ctx) => {
    const { state: s, conn } = ctx; if (!s || !s.housing || !s.housing.lessor) fail('Du wohnst nicht zur Miete bei einem Spieler.');
    await conn.query("UPDATE player_leases SET status = 'ended', ended_by = 'tenant' WHERE tenant_id = ? AND status = 'active'", [tenantId]);
    s.housing = { type: 'street', cityId: s.cityId };
    notice(s, { level: 'info', title: 'Ausgezogen', text: 'Du hast dein Mietverhältnis beendet und wohnst jetzt auf der Straße. Such dir bald eine neue Bleibe.', tab: 'housing' });
    return {};
  });
}

/** Eigentümer kündigt dem Spieler-Mieter. */
async function evict(ownerId, propId) {
  return service.withCharacter(ownerId, async (ctx) => {
    const { state: s, conn } = ctx; const p = s.properties.find((x) => x.id === propId);
    if (!p || !p.lease || !p.lease.tenant || !p.lease.tenant.userId) fail('Hier wohnt kein Spieler zur Miete.');
    await conn.query("UPDATE player_leases SET status = 'ended', ended_by = 'owner' WHERE owner_id = ? AND prop_id = ? AND status = 'active'", [ownerId, propId]);
    p.lease.tenant = null; p.lease.vacantSince = s.day;
    return {};
  });
}

/** Abgleich beim Laden eines Spielstands (Eigentümer- und Mieterseite), im Rahmen der Transaktion des Nutzers. */
async function reconcile(conn, user, state, world) {
  void world;
  const rows = await conn.query("SELECT * FROM player_leases WHERE (owner_id = ? OR tenant_id = ?) AND status = 'active'", [user.id, user.id]);
  for (const r of rows) {
    if (r.owner_id === user.id) {
      const p = (state.properties || []).find((x) => x.id === r.prop_id); const T = p && p.lease && p.lease.tenant;
      const ok = state.status === 'alive' && p && p.lease.on && T && T.userId === r.tenant_id;
      if (!ok) { await conn.query("UPDATE player_leases SET status = 'ended', ended_by = COALESCE(ended_by, 'owner') WHERE id = ?", [r.id]); }
    }
    if (r.tenant_id === user.id) {
      const h = state.housing; const ok = state.status === 'alive' && h && h.lessor && h.lessor.ownerId === r.owner_id && h.lessor.propId === r.prop_id;
      if (!ok) await conn.query("UPDATE player_leases SET status = 'ended', ended_by = COALESCE(ended_by, 'tenant') WHERE id = ?", [r.id]);
    }
  }
  if (state.status !== 'alive') return;
  // Eigentümerseite: Mieter, deren Vertrag beendet wurde, werden ausgetragen
  for (const p of state.properties || []) {
    const T = p.lease && p.lease.tenant; if (!T || !T.userId) continue;
    const a = await conn.one("SELECT id FROM player_leases WHERE owner_id = ? AND prop_id = ? AND tenant_id = ? AND status = 'active'", [user.id, p.id, T.userId]);
    if (!a) { p.lease.tenant = null; p.lease.vacantSince = state.day; notice(state, { level: 'info', title: `${p.name}: Mieter ausgezogen`, text: `${T.name} wohnt nicht mehr hier. Die Wohnung ist wieder frei.`, tab: 'housing' }); }
  }
  // Mieterseite: Vertrag beendet (Kündigung, Verkauf, Tod des Eigentümers) → Wohnung verloren
  const h = state.housing;
  if (h && h.lessor) {
    const a = await conn.one("SELECT id FROM player_leases WHERE owner_id = ? AND prop_id = ? AND tenant_id = ? AND status = 'active'", [h.lessor.ownerId, h.lessor.propId, user.id]);
    if (!a) { state.housing = { type: 'street', cityId: state.cityId }; notice(state, { level: 'bad', title: 'Mietvertrag beendet', text: 'Dein Vermieter hat dir gekündigt oder die Wohnung ist nicht mehr verfügbar. Du wohnst jetzt auf der Straße.', tab: 'housing', interrupt: true }); }
  }
}

module.exports = require('./live').announce({ take, leave, evict, reconcile }, ['take', 'leave', 'evict'], 'directory');
