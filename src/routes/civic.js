'use strict';
/** Gesellschaft: Übersicht, Vereine (Gründung, Beitritt, Kasse, Vorstand, Wahlempfehlung), Gemeinde, Stiftung, Titel. Alle Eingaben werden hier begrenzt, die Regeln prüft der Server in src/lib/civic*.js. */
const express = require('express');
const actions = require('../game/actions');
const civic = require('../lib/civic');
const { userLimit } = require('../lib/limits');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch((e) => {
  if (e instanceof actions.ActionError) return res.status(400).json({ ok: false, error: e.message });
  return next(e);
});
const int = (v, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const uid = (req) => req.user.id;
const body = (req) => (req.body && typeof req.body === 'object' ? req.body : {});
router.use((req, res, next) => (req.method === 'POST' ? userLimit(30, 'Zu viele Aktionen – bitte kurz warten.') : userLimit(120))(req, res, next));

const done = (r) => ({ ok: true, message: r.msg, level: r.level, id: r.id, view: r.view });
/** Betrag als Zahl oder Zeichenkette; alles andere wird verworfen. */
const amount = (v) => (typeof v === 'number' || typeof v === 'string' ? (typeof v === 'string' ? v.slice(0, 16) : v) : '');

router.get('/', wrap(async (req, res) => res.json(await civic.overview(uid(req)))));

router.post('/titles/check', wrap(async (req, res) => { const r = await civic.checkTitles(uid(req)); res.json({ ok: true, message: r.msg, level: r.level, changed: !!r.changed, view: r.view }); }));

/* ---- Vereine ---- */
const C = civic.Clubs;
router.get('/club/:id(\\d+)', wrap(async (req, res) => res.json(await civic.clubDetail(uid(req), int(req.params.id)))));
router.post('/club/found', wrap(async (req, res) => { const b = body(req); res.json(done(await C.found(uid(req), { kind: str(b.kind, 12), name: str(b.name, 80), fee: amount(b.fee), descr: str(b.descr, 300) }))); }));
router.post('/club/:id(\\d+)/join', wrap(async (req, res) => res.json(done(await C.join(uid(req), int(req.params.id))))));
router.post('/club/:id(\\d+)/leave', wrap(async (req, res) => res.json(done(await C.leave(uid(req), int(req.params.id))))));
router.post('/club/:id(\\d+)/dissolve', wrap(async (req, res) => res.json(done(await C.dissolve(uid(req), int(req.params.id))))));
router.post('/club/:id(\\d+)/fee', wrap(async (req, res) => res.json(done(await C.setFee(uid(req), int(req.params.id), { fee: amount(body(req).fee) })))));
router.post('/club/:id(\\d+)/donate', wrap(async (req, res) => res.json(done(await C.donate(uid(req), int(req.params.id), { amount: amount(body(req).amount) })))));
router.post('/club/:id(\\d+)/event', wrap(async (req, res) => res.json(done(await C.event(uid(req), int(req.params.id))))));
router.post('/club/:id(\\d+)/role', wrap(async (req, res) => { const b = body(req); const role = ['president', 'board', 'member'].includes(b.role) ? b.role : 'member'; res.json(done(await C.setRole(uid(req), int(req.params.id), int(b.user), role))); }));
router.post('/club/:id(\\d+)/kick', wrap(async (req, res) => res.json(done(await C.kick(uid(req), int(req.params.id), int(body(req).user))))));
router.post('/club/:id(\\d+)/mistrust', wrap(async (req, res) => res.json(done(await C.mistrust(uid(req), int(req.params.id), body(req).on !== false)))));
router.post('/club/:id(\\d+)/withdraw', wrap(async (req, res) => { const b = body(req); res.json(done(await C.withdraw(uid(req), int(req.params.id), { amount: amount(b.amount), confirm: b.confirm === true }))); }));
router.post('/club/:id(\\d+)/endorse', wrap(async (req, res) => { const b = body(req); res.json(done(await C.endorse(uid(req), int(req.params.id), { election: int(b.election), candidate: int(b.candidate), funded: b.funded === true }))); }));

/* ---- Gemeinde ---- */
const P = civic.Parish;
router.post('/parish/join', wrap(async (req, res) => res.json(done(await P.join(uid(req), str(body(req).faith, 16))))));
router.post('/parish/leave', wrap(async (req, res) => res.json(done(await P.leave(uid(req))))));
router.post('/parish/donate', wrap(async (req, res) => res.json(done(await P.donate(uid(req), { amount: amount(body(req).amount) })))));
router.post('/parish/aid', wrap(async (req, res) => res.json(done(await P.aid(uid(req))))));
router.post('/parish/ceremony', wrap(async (req, res) => { const b = body(req); res.json(done(await P.ceremony(uid(req), str(b.kind, 10), { child: int(b.child), id: int(b.id) }))); }));

/* ---- Stiftung ---- */
const F = civic.Found;
router.post('/foundation/found', wrap(async (req, res) => { const b = body(req); res.json(done(await F.found(uid(req), { name: str(b.name, 80), purpose: str(b.purpose, 12), amount: amount(b.amount), payoutPct: b.payoutPct }))); }));
router.post('/foundation/give', wrap(async (req, res) => res.json(done(await F.give(uid(req), { amount: amount(body(req).amount) })))));
router.post('/foundation/set', wrap(async (req, res) => { const b = body(req); res.json(done(await F.set(uid(req), { payoutPct: b.payoutPct, name: str(b.name, 80) }))); }));
router.post('/foundation/will', wrap(async (req, res) => res.json(done(await F.will(uid(req), { pct: body(req).pct })))));
router.post('/foundation/dissolve', wrap(async (req, res) => res.json(done(await F.dissolve(uid(req))))));

module.exports = router;
