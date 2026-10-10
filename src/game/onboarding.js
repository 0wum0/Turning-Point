'use strict';
/**
 * Einsteiger-Erlebnis: Willkommensdialog, Aufgabenreihe „Deine ersten Schritte“, „Was jetzt?“-Berater und
 * schrittweises Freischalten fortgeschrittener Bereiche. Alles hier ist reine Anzeige-Logik: Der Server sperrt nichts.
 * Fortschritt liegt im Spielstand (state.flags.quests); „gesehen“-Marken für Dialoge liegen am Konto (users.meta).
 * Die Prüfungen (QUESTS[].done, unlocks, advise) sind reine Funktionen und in test/onboarding.test.js getestet.
 */

/** Marken, die die Oberfläche melden darf (Seitenbesuche und Aktionen, die der Spielstand nicht selbst festhält). */
const SEEN_KEYS = ['newspaper', 'map', 'friend', 'marketOffer', 'vote', 'glossary', 'prices', 'court', 'season'];
/** Nach so vielen Spieljahren öffnet sich alles von selbst (wer so lange spielt, kennt das Spiel). */
const OPEN_AFTER_YEARS = 6;

const startMoney = () => { try { return require('../settings').get('game.start_money_cents') || 4000; } catch (_) { return 4000; } };

function ensure(state) {
  if (!state.flags) state.flags = {};
  if (!state.flags.quests || typeof state.flags.quests !== 'object') state.flags.quests = { legacy: true };
  const k = state.flags.quests;
  if (!k.done) k.done = {};
  if (!k.seen) k.seen = {};
  if (!k.acts) k.acts = {};
  return k;
}

/** Frischer Charakter: nichts ist erledigt, alles gilt als Neuanfang (keine stille Übernahme). */
function initFresh(state) {
  state.flags.quests = { done: {}, seen: {}, acts: {}, baseLearned: (state.skills && state.skills.learned ? state.skills.learned.length : 1) };
  return state.flags.quests;
}

/* ---------- Aufgaben „Deine ersten Schritte“ ----------
 * done(state, q, k): q = state.flags.quests, k = { startMoney }.  spot = Name der hervorzuhebenden Schaltfläche (Oberfläche). */
const OK_FRIDGE = 20;
const QUESTS = [
  { id: 'paper', title: 'Zeitung aufschlagen', why: 'In der Zeitung stehen Arbeit, Wohnungen und Neuigkeiten – dein Weg ins Leben beginnt dort.', tab: 'newspaper', spot: 'nav:newspaper', reward: { efs: 2 }, done: (s, q) => !!q.seen.newspaper },
  { id: 'food', title: 'Essen für den Kühlschrank kaufen', why: 'Ohne Essen im Haus bekommst du Hunger – das drückt Stimmung und Gesundheit.', tab: 'household', spot: 'food', reward: { efs: 2 }, done: (s, q) => !!q.acts.buyFood },
  { id: 'shelter', title: 'Einen Schlafplatz finden', why: 'Auf der Straße sinkt deine Gesundheit täglich. Schon eine Pension oder ein Schlafplatz beim Arbeitgeber hilft.', tab: 'newspaper', spot: 'listing:home', reward: { efs: 3 }, done: (s) => !!s.housing && s.housing.type !== 'street' },
  { id: 'job', title: 'Arbeit oder Lehrstelle annehmen', why: 'Ohne Einkommen schmilzt dein Startgeld. Wer arbeitet, bekommt jeden Tag Lohn.', tab: 'newspaper', spot: 'listing:job', reward: { efs: 3 }, done: (s) => !!s.occupation },
  { id: 'wage', title: 'Den ersten Lohn verdienen', why: 'Der Lohn kommt automatisch, sobald ein Spieltag vergeht. Die Uhr läuft von selbst – du musst nur etwas Zeit mitbringen.', tab: 'overview', spot: 'time', reward: { efs: 3 }, done: (s) => (s.stats ? s.stats.earned : 0) > 0 },
  { id: 'home', title: 'Eine Wohnung mieten oder kaufen', why: 'Eine richtige Wohnung bringt deutlich mehr Erholung und Gesundheit als jeder Notschlafplatz.', tab: 'newspaper', spot: 'listing:home', reward: { efs: 4 }, done: (s) => !!s.housing && (s.housing.type === 'rent' || s.housing.type === 'own') },
  { id: 'prices', title: 'Vergleiche die Preise deiner Stadt', why: 'Wohnen, Essen und Löhne kosten nicht überall gleich viel. Im Preisbarometer siehst du, ob deine Stadt teuer oder günstig ist – und wo es sich zu leben lohnt.', tab: 'city', spot: 'prices', reward: { efs: 3 }, done: (s, q) => !!q.seen.prices },
  { id: 'fridge7', title: 'Eine Woche lang den Kühlschrank gefüllt halten', why: 'Regelmäßig einkaufen ist die wichtigste Gewohnheit des Spiels: Es hält dich gesund und glücklich.', tab: 'household', spot: 'food', reward: { efs: 4 }, done: (s, q) => q.fridgeSince != null && s.day - q.fridgeSince >= 7 },
  { id: 'friend', title: 'Einen Partner oder Freund finden', why: 'Partner, Freunde und später Kinder machen glücklich – und Kinder sind die Erben deines Lebenswerks.', tab: 'newspaper', spot: 'listing:contact', reward: { efs: 4 }, done: (s, q) => !!s.partner || !!q.seen.friend },
  { id: 'save', title: 'Das Zehnfache deines Startgelds sparen', why: 'Rücklagen schützen dich bei Notfällen und sind die Grundlage für alles Größere: ein Haus, eine Firma, ein Amt.', tab: 'overview', spot: 'money', reward: { efs: 5 }, done: (s, q, k) => s.money >= 10 * (k.startMoney || 4000) },
  { id: 'standing', title: 'Erreiche Ansehen: Anständig', why: 'Wer Miete und Steuern pünktlich zahlt und fair handelt, genießt Vertrauen: Die Bank gibt bessere Zinsen, Mieter und Geschäftspartner kommen leichter, und Ämter stehen dir offen.', tab: 'overview', spot: 'standing', reward: { efs: 5 }, done: (s) => require('./reputation').stand(s).lv >= 1 },
  { id: 'skill2', title: 'Einen zweiten Beruf lernen', why: 'Jeder Beruf ist ein Schlüssel: Er bestimmt, welche Firmen du später führen darfst.', tab: 'work', spot: 'course', reward: { efs: 5 }, done: (s, q) => s.skills && s.skills.learned.length > (q.baseLearned == null ? 1 : q.baseLearned) },
  { id: 'business', title: 'Gründe dein erstes Unternehmen', why: 'Eine eigene Firma verdient auch dann Geld, wenn du gerade nicht arbeitest – der Weg zum Vermächtnis. Unter „Unternehmen“ gründest du sie mit einem Klick.', tab: 'business', spot: 'found', reward: { efs: 6 }, done: (s, q) => (s.companies || []).length > 0 || !!q.acts.buyBiz },
  { id: 'hire', title: 'Einen Mitarbeiter einstellen', why: 'Mitarbeiter lassen den Betrieb wachsen und bringen mehr Gewinn.', tab: 'business', spot: 'hire', reward: { efs: 6 }, done: (s, q) => !!q.acts.bizHire },
  { id: 'talent', title: 'Stelle jemanden mit passendem Talent ein', why: 'Jeder Mensch hat Talente. Wer zu deiner Betriebsart passt, bringt mehr Umsatz. Im Bewerberpool siehst du die Passung auf einen Blick.', tab: 'business', spot: 'talent', reward: { efs: 6 }, done: (s, q) => !!q.acts.bizHireApplicant },
  { id: 'contract', title: 'Schließe deinen ersten Liefervertrag', why: 'Ein Liefervertrag bringt dir Zutaten günstiger als der Großhandel – oder bessere Preise für deine Waren. So wächst dein Betrieb in die Lieferkette hinein.', tab: 'business', spot: 'supply', reward: { efs: 6 }, done: (s, q) => !!(s.contracts && ((s.contracts.buys || []).length || (s.contracts.sells || []).length)) || !!q.seen.contract },
  { id: 'let', title: 'Eine Immobilie vermieten', why: 'Mieter zahlen dir jeden Tag Miete – ein ruhiges Einkommen ohne Arbeit.', tab: 'housing', spot: 'lease', reward: { efs: 6 }, done: (s, q) => (s.properties || []).some((p) => p.lease && p.lease.on) || !!q.acts.letOn },
  { id: 'market', title: 'Ein erstes Angebot auf dem Markt einstellen', why: 'Auf dem Markt handelst du mit anderen echten Spielern – Häuser, Firmen, Gelegenheiten.', tab: 'social', spot: 'market', reward: { efs: 6 }, done: (s, q) => !!q.seen.marketOffer },
  { id: 'vote', title: 'Bei einer Wahl abstimmen oder kandidieren', why: 'Bürgermeister, Landrat, Kanzler: Ämter werden von den Spielern gewählt. Du kannst mitentscheiden.', tab: 'social', spot: 'elections', reward: { coins: 1 }, done: (s, q) => !!q.seen.vote || !!(s.politics && (s.politics.term || Object.values(s.politics.completed || {}).some((n) => n > 0))) },
  { id: 'winter', title: 'Bereite dich auf den Winter vor', why: 'Die Jahreszeiten bestimmen Heizkosten, Krankheiten und Geschäfte. Wirf einen Blick auf den Jahreszeiten-Check und halte ein Polster in Höhe deines Startgelds bereit – so überstehst du auch einen harten Winter oder eine Seuche.', tab: 'overview', spot: 'season', reward: { efs: 5 }, done: (s, q, k) => !!q.seen.season && s.money >= (k.startMoney || 4000) },
  { id: 'court', title: 'Lerne das Gericht kennen', why: 'Wer dir schadet, hinterlässt Spuren. Im Bereich „Recht & Gericht“ siehst du, wie Beweise, Anzeige, Vergleich und Strafen funktionieren – bevor du sie brauchst.', tab: 'society', spot: 'court', reward: { efs: 6 }, done: (s, q) => !!q.seen.court },
];
const QUEST_IDS = QUESTS.map((x) => x.id);

/** Welche Aufgaben sind (nach dem aktuellen Stand) erfüllt? Gibt eine Menge von ids zurück. */
function satisfied(state, k = {}) {
  const q = ensure(state);
  const out = new Set();
  for (const x of QUESTS) { try { if (x.done(state, q, k)) out.add(x.id); } catch (_) { /* unvollständiger Altstand: nicht erfüllt */ } }
  return out;
}

/** Notiert pro Tick, wie lange der Kühlschrank durchgehend gefüllt war. */
function trackFridge(state, q) {
  const ok = state.status === 'alive' && !state.hunger && state.meters.fridge >= OK_FRIDGE;
  if (ok) { if (q.fridgeSince == null) q.fridgeSince = q.legacy ? state.day - 7 : state.day; } else q.fridgeSince = null;
}

/**
 * Fortschritt nachführen (vor dem Speichern). Neu erfüllte Aufgaben werden festgehalten und belohnt – höchstens einmal pro Konto.
 * Altstände (flags.quests fehlt) übernehmen bereits Erfüllbares still, ohne Belohnung.
 * Rückgabe: Liste der neu erledigten Aufgaben-ids.
 */
function tick(state, user, k = {}) {
  if (!state || state.status !== 'alive') return [];
  if (k.startMoney == null) k = { ...k, startMoney: startMoney() };
  const q = ensure(state);
  const legacy = !!q.legacy;
  if (legacy && q.baseLearned == null) q.baseLearned = 1;
  trackFridge(state, q);
  const now = satisfied(state, k);
  const fresh = [];
  for (const id of QUEST_IDS) {
    if (q.done[id] != null || !now.has(id)) continue;
    q.done[id] = state.day;
    if (legacy) continue;
    fresh.push(id);
    const meta = user && user.meta ? user.meta : null;
    if (!meta) continue;
    meta.questRewarded = meta.questRewarded || {};
    if (meta.questRewarded[id]) continue;
    meta.questRewarded[id] = 1;
    const r = QUESTS.find((x) => x.id === id).reward || {};
    if (state.fx) { state.fx.efs = (state.fx.efs || 0) + (r.efs || 0); state.fx.coins = (state.fx.coins || 0) + (r.coins || 0); }
  }
  delete q.legacy;
  return fresh;
}

/** Aktion „seen“: die Oberfläche meldet, dass etwas gesehen/erledigt wurde. */
function markSeen(state, user, key) {
  if (key === 'welcome') { user.meta.welcomed = true; return; }
  if (!SEEN_KEYS.includes(key)) return;
  ensure(state).seen[key] = true;
}
/** Jede erfolgreich ausgeführte Spielaktion wird vermerkt (z. B. „Essen gekauft“) – daraus ergeben sich einige Aufgaben. */
function noteAct(state, name) {
  const q = ensure(state);
  if (q.acts[name]) return;
  if (Object.keys(q.acts).length < 80) q.acts[name] = 1;
}

/** Wird der Willkommensdialog gezeigt? Nur für Konten, die ihn noch nicht gesehen haben und deren Leben gerade erst begann. */
const showWelcome = (state, user) => !(user && user.meta && user.meta.welcomed) && state.day < 400 && state.status === 'alive';

/* ---------- Freischalten ----------
 * Nur Anzeige: gesperrte Bereiche werden mit „Wird freigeschaltet, wenn …“ gezeigt. Der Server blockiert nichts. */
const UNLOCKS = [
  { key: 'bank', label: 'Bank & Kredite', cond: 'du deinen ersten Lohn bekommen hast', ok: (d) => d.wage },
  { key: 'market', label: 'Markt', cond: 'du eine Wohnung gemietet oder gekauft hast', ok: (d, s) => d.home || (s.properties || []).length > 0 },
  { key: 'business', label: 'Unternehmen', cond: 'du das Zehnfache deines Startgelds gespart hast', ok: (d, s, x) => d.save || d.skill2 || (s.companies || []).length > 0 || !!(x && x.canFound) },
  { key: 'society', label: 'Gesellschaft', cond: 'du das Zehnfache deines Startgelds gespart hast', ok: (d, s) => d.save || d.skill2 || d.business || !!(s.politics && s.politics.term) || !!(s.court && (s.court.ev || s.court.p || s.court.d)) },
  { key: 'elections', label: 'Wahlen', cond: 'du das Zehnfache deines Startgelds gespart hast', ok: (d, s) => d.save || d.skill2 || d.business || !!(s.politics && s.politics.term) },
  { key: 'exchange', label: 'Börse', cond: 'du deinen ersten Betrieb führst', ok: (d, s) => d.business || (s.companies || []).length > 0 },
  { key: 'rivalry', label: 'Wettbewerb', cond: 'du einen Betrieb führst und Mitarbeiter eingestellt hast', ok: (d, s) => (d.business || (s.companies || []).length > 0) && d.hire },
];

function unlocks(state, doneIds, showAll, extra) {
  const d = {}; for (const id of QUEST_IDS) d[id] = doneIds.has ? doneIds.has(id) : !!doneIds[id];
  const years = Math.floor(state.day / 365);
  const timeOpen = years >= OPEN_AFTER_YEARS;
  const out = {};
  for (const u of UNLOCKS) {
    const open = !!showAll || timeOpen || !!u.ok(d, state, extra || {});
    out[u.key] = { open, label: u.label, hint: open ? '' : `Wird freigeschaltet, wenn ${u.cond}. Spätestens öffnet es sich nach ${OPEN_AFTER_YEARS} Spieljahren.` };
  }
  return out;
}

/* ---------- „Was jetzt?“ – die eine wichtigste nächste Handlung ---------- */
const dm = (cents, cur) => `${(Math.abs(cents) / 100).toLocaleString('de-DE', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })} ${cur === 'EUR' ? '€' : 'DM'}`;

/**
 * Wählt aus der fertigen Ansicht v die wichtigsten nächsten Schritte, geordnet nach Dringlichkeit.
 * Rückgabe: { top, more[] } mit je { id, level, icon, title, why, cta: { kind: 'go'|'act'|'bank'|'advance', label, tab?, spot?, name?, input? } }.
 */
function advise(v, nextQuest, opts) {
  const c = [];
  const cur = v.currency; const m = v.meters || {};
  const add = (prio, o) => c.push({ prio, ...o });
  const tier = v.food && v.food.tiers ? v.food.tiers[Math.min(1, v.food.tiers.length - 1)] : null;
  const fillCost = tier ? tier.cost : 0;
  if (v.hunger > 0 || m.fridge < 15) {
    const afford = tier && v.money >= fillCost && fillCost > 0;
    add(v.hunger > 0 ? 100 : 90, { id: 'food', level: v.hunger > 0 ? 'bad' : 'warn', icon: 'refrigerator',
      title: v.hunger > 0 ? 'Du hast Hunger – fülle den Kühlschrank' : 'Dein Kühlschrank ist fast leer',
      why: 'Ohne Essen sinken Stimmung und Gesundheit jeden Tag.',
      cta: afford ? { kind: 'act', label: `Essen kaufen (${dm(fillCost, cur)})`, name: 'buyFood', input: { tier: tier ? 1 : 0 } } : { kind: 'go', label: 'Zum Haushalt', tab: 'household', spot: 'food' } });
  }
  if (v.housing && v.housing.type === 'street') {
    add(95, { id: 'shelter', level: 'bad', icon: 'bed', title: 'Du schläfst auf der Straße', why: 'Dort sinkt deine Gesundheit täglich. Eine Pension oder ein Schlafplatz beim Arbeitgeber ist günstig.', cta: { kind: 'go', label: 'Unterkunft suchen', tab: 'newspaper', spot: 'listing:home' } });
  } else if (v.housing && v.housing.closed) {
    add(88, { id: 'housing-closed', level: 'bad', icon: 'triangle-alert', title: 'Dein Zuhause ist beschädigt', why: 'Solange es nicht repariert ist, kannst du dort nicht richtig wohnen.', cta: { kind: 'go', label: 'Zum Wohnen', tab: 'housing' } });
  }
  if (!v.occupation && v.status === 'alive') {
    add(v.housing && v.housing.type === 'street' ? 80 : 85, { id: 'job', level: 'warn', icon: 'briefcase', title: 'Du hast keine Arbeit', why: 'Ohne Lohn schmilzt dein Geld. Die Zeitung zeigt Stellen und Lehrstellen.', cta: { kind: 'go', label: 'Stellen ansehen', tab: 'newspaper', spot: 'listing:job' } });
  }
  if (m.health < 40) add(92, { id: 'health', level: 'bad', icon: 'heart-pulse', title: 'Deine Gesundheit ist schlecht', why: 'Bei null stirbst du. Gutes Essen, ein Dach über dem Kopf und Erholung helfen.', cta: { kind: 'go', label: 'Zum Haushalt', tab: 'household' } });
  const broken = (v.properties || []).filter((p) => p.closed > 0 && p.repairCost > 0).sort((a, b) => b.closed - a.closed)[0];
  if (broken) {
    const afford = v.money >= broken.repairCost && broken.closed > 10;
    add(70, { id: 'repair', level: 'warn', icon: 'hammer', title: `${broken.name} ist beschädigt`, why: `Das Gebäude ist noch ${broken.closed} Tage unbenutzbar und bringt keine Miete. Eine Reparatur beschleunigt das.`,
      cta: afford ? { kind: 'act', label: `Reparieren (${dm(broken.repairCost, cur)})`, name: 'repair', input: { propertyId: broken.id } } : { kind: 'go', label: 'Zum Wohnen', tab: 'housing' } });
  } else {
    const worn = (v.properties || []).filter((p) => p.condition < 50 && p.maintainCost > 0 && !p.closed).sort((a, b) => a.condition - b.condition)[0];
    if (worn && v.money > worn.maintainCost * 3) add(40, { id: 'maintain', level: 'info', icon: 'wrench', title: `${worn.name} braucht Pflege`, why: `Der Zustand liegt bei ${worn.condition} %. Je schlechter, desto weniger Miete und Wert.`, cta: { kind: 'act', label: `Instand setzen (${dm(worn.maintainCost, cur)})`, name: 'maintain', input: { propertyId: worn.id } } });
  }
  // Jahreszeiten und Seuchen
  const se = v.season;
  if (se && se.epi && se.epi.me && se.epi.me.sick && v.status === 'alive') add(74, { id: 'epi-sick', level: 'warn', icon: 'stethoscope', title: `Du bist krank: ${se.epi.me.sick.name}`, why: `Noch ${se.epi.me.sick.daysLeft} Tage. Iss gut und ruh dich aus – das Krankengeld deckt 75 % des Lohns.`, cta: { kind: 'go', label: 'Zum Haushalt', tab: 'household' } });
  else if (se && se.epi && se.epi.active && se.epi.wave && !se.epi.me.protected && v.status === 'alive') {
    const pr = se.epi.protect || {}; const hyg = pr.hygiene && !pr.hygiene.on && v.money >= pr.hygiene.cost * 3;
    const vac = pr.vaccine && pr.vaccine.available && !pr.vaccine.done && v.money >= pr.vaccine.cost * 2;
    if (hyg || vac) add(se.epi.wave.level === 'hoch' ? 77 : 66, { id: 'epi-alert', level: 'warn', icon: 'shield', title: `${se.epi.wave.name}: Schütze dich`, why: 'Die Seuche ist in deiner Region. Schutz kostet wenig und hält 45 Tage; Impfen ist noch besser, sobald es einen Impfstoff gibt.',
      cta: vac ? { kind: 'act', label: `Impfen (${dm(pr.vaccine.cost, cur)})`, name: 'epiProtect', input: { what: 'vaccine' } } : { kind: 'act', label: `Hygienepaket (${dm(pr.hygiene.cost, cur)})`, name: 'epiProtect', input: { what: 'hygiene' } } });
  }
  if (se && se.on && se.key === 'herbst' && v.status === 'alive' && v.housing && v.housing.type !== 'street' && v.flows && v.money < v.flows.expense * 30 && v.flows.expense > 0) add(48, { id: 'winter-prep', level: 'info', icon: 'cloud-hail', title: 'Der Winter naht – leg ein Polster an', why: 'Im Winter kostet Heizen mehr und Erkältungen häufen sich. Rücklagen für etwa 30 Tage Fixkosten machen dich sicher.', cta: { kind: 'go', label: 'Jahreszeiten-Check', tab: 'overview', spot: 'season' } });
  const kids = (v.children || []).filter((k) => k.pendingSchool || k.pendingPath || k.status === 'runaway');
  if (kids.length) add(75, { id: 'kids', level: 'warn', icon: 'baby', title: kids.length === 1 ? `Bei ${kids[0].name} steht eine Entscheidung an` : 'Bei deinen Kindern stehen Entscheidungen an', why: 'Schule und Ausbildung deiner Kinder entscheiden, was später aus ihnen wird.', cta: { kind: 'go', label: 'Zur Familie', tab: 'family' } });
  const short = (v.companies || []).filter((c) => !c.abandoned && c.supply && c.supply.status && c.supply.status !== 'ok' && c.supply.status !== 'none').sort((a, b) => a.supply.ratio - b.supply.ratio)[0];
  if (short) {
    const lack = (short.supply.needs || []).filter((n) => n.missing > 0).map((n) => n.name).slice(0, 2).join(' und ');
    const missing = short.supply.status === 'missing';
    add(missing ? 78 : 62, { id: 'supply', level: missing ? 'bad' : 'warn', icon: 'package', title: missing ? `${short.name}: Zutaten fehlen` : `${short.name}: Zutaten werden knapp`,
      why: `${lack ? `Es fehlt vor allem ${lack}. ` : ''}Ohne Zutaten sinkt die Leistung des Betriebs. Schalte „Automatisch einkaufen“ ein oder schließe einen Liefervertrag.`,
      cta: { kind: 'go', label: 'Zur Versorgung', tab: 'business', spot: 'supply' } });
  }
  const cr = v.credit;
  if (cr && cr.loans && cr.loans.length) {
    const small = cr.loans.slice().sort((a, b) => a.left - b.left)[0];
    if (v.flows && v.flows.net > 0 && v.money > small.left * 2) add(45, { id: 'loan', level: 'info', icon: 'landmark', title: 'Du kannst einen Kredit zurückzahlen', why: `Du hast ${dm(v.money, cur)} und schuldest nur noch ${dm(small.left, cur)}. Das spart Zinsen.`, cta: { kind: 'bank', label: 'Zur Bank' } });
  }
  // Gericht: Spuren sichern, angezeigt werden, Haft
  const cj = v.court;
  if (cj && cj.act > 0) add(87, { id: 'court-sued', level: 'bad', icon: 'gavel', title: 'Du wurdest verklagt – Anwalt oder Vergleich?', why: 'Gegen dich läuft ein Verfahren. Mit einem Rechtsanwalt, einem Vergleich oder einem Geständnis bestimmst du selbst, wie es ausgeht.', cta: { kind: 'go', label: 'Zum Gericht', tab: 'society', spot: 'court' } });
  if (cj && cj.ev > 0 && !cj.p) add(58, { id: 'court-evidence', level: 'warn', icon: 'search', title: 'Spuren am Tatort – Anzeige erstatten?', why: 'Jemand hat dir geschadet und Spuren hinterlassen. Sie verblassen: Stärke sie mit einem Detektiv oder erstatte Anzeige.', cta: { kind: 'go', label: 'Spuren ansehen', tab: 'society', spot: 'court' } });
  if (cj && (cj.r || []).some((x) => x.k === 'haft')) add(72, { id: 'court-haft', level: 'warn', icon: 'lock', title: 'Du bist in Haft', why: 'Wirtschaftliche Handlungen sind gesperrt, bis die Haft endet. Essen, Schlafen, Briefe und Chat gehen weiter; deine Spielzeit läuft geschützt.', cta: { kind: 'go', label: 'Details', tab: 'society', spot: 'court' } });
  // Ansehen: pünktlich zahlen schützt den Ruf; ein angeschlagener Ruf ist ein eigener Hinweis
  if (v.housing && v.housing.type === 'rent' && v.flows && v.flows.exp && v.flows.exp.lodging > 0 && v.money < v.flows.exp.lodging * 6) {
    add(83, { id: 'rentrisk', level: 'warn', icon: 'clock', title: 'Deine Miete ist in Gefahr', why: 'Reicht das Geld nicht für die Miete, verlierst du die Wohnung – und dein Ansehen leidet. Pünktlich zahlen dagegen stärkt es.', cta: { kind: 'go', label: 'Einnahmen verbessern', tab: 'work' } });
  }
  if (v.rep && v.rep.lv <= -1) {
    add(65, { id: 'repbad', level: 'warn', icon: 'badge-check', title: 'Dein Ruf ist angeschlagen', why: 'Banken, Vermieter und Wähler misstrauen dir. Zahle Rechnungen pünktlich und halte Verträge ein, dann erholt sich dein Ansehen mit der Zeit.', cta: { kind: 'go', label: 'Mein Ansehen', tab: 'overview', spot: 'standing' } });
  }
  if (v.flows && v.flows.net < 0 && v.money < -v.flows.net * 10) add(82, { id: 'cash', level: 'warn', icon: 'wallet', title: 'Dein Geld reicht nicht mehr lange', why: 'Du gibst pro Tag mehr aus, als du einnimmst. Bei null Geld endet das Spiel.', cta: { kind: 'go', label: 'Einnahmen verbessern', tab: 'work' } });
  if (v.partner && v.partner.sat < 45) add(55, { id: 'partner', level: 'warn', icon: 'heart', title: `${v.partner.name} ist unzufrieden`, why: 'Zeit zusammen und kleine Geschenke heben die Stimmung in der Beziehung.', cta: { kind: 'go', label: 'Zur Familie', tab: 'family' } });
  if ((v.children || []).some((k) => k.status === 'home' && k.sat < 40)) add(54, { id: 'kidsat', level: 'warn', icon: 'baby', title: 'Ein Kind ist unzufrieden', why: 'Zufriedene Kinder wachsen gesünder auf und bleiben der Familie treu.', cta: { kind: 'go', label: 'Zur Familie', tab: 'family' } });
  const bad = (v.notices || []).filter((n) => !n.seen && n.level === 'bad').length;
  if (bad) add(60, { id: 'notices', level: 'warn', icon: 'bell', title: `${bad} wichtige Meldung${bad === 1 ? '' : 'en'} im Postfach`, why: 'Etwas braucht deine Aufmerksamkeit.', cta: { kind: 'go', label: 'Postfach öffnen', tab: 'overview' } });
  if (m.fridge >= 15 && v.hunger <= 0 && v.occupation && v.housing && v.housing.type !== 'street') {
    const home = ['rent', 'workplace', 'pension'].includes(v.housing.type);
    const expense = Math.max(1, (v.flows && v.flows.expense) || 1);
    const start = (opts && opts.startMoney) || 4000;
    if (home && !(v.properties || []).length && v.money > expense * 120 && v.money > 20 * start) add(35, { id: 'idle-home', level: 'info', icon: 'house', title: 'Dein Geld liegt brach – kauf dir ein Zuhause', why: 'Eigentum verliert nicht an Wert und spart dir die Miete. Auch vermieten ist möglich.', cta: { kind: 'go', label: 'Immobilien ansehen', tab: 'housing' } });
    else if ((v.properties || []).length && !(v.companies || []).length && v.money > expense * 200 && v.money > 20 * start) add(30, { id: 'idle-biz', level: 'info', icon: 'store', title: 'Du hast Rücklagen – wie wäre es mit einer Firma?', why: 'Ein Betrieb verdient auch dann, wenn du nicht arbeitest.', cta: { kind: 'go', label: 'Unternehmen gründen', tab: 'business', spot: 'found' } });
  }
  if (v.found && v.found.canAfford && !(v.companies || []).length && v.status === 'alive' && v.occupation && (v.meters || {}).fridge >= 15) {
    add(34, { id: 'found', level: 'good', icon: 'store', title: 'Gründe dein erstes Unternehmen', why: `Du hast die Qualifikation und genug Geld (ab ${dm(v.found.cheapest, cur)}). Eine eigene Firma verdient auch, wenn du nicht arbeitest.`, cta: { kind: 'go', label: 'Unternehmen gründen', tab: 'business', spot: 'found' } });
  }
  const eco = v.econ; const rentTip = eco && (eco.tips || []).find((t) => t.kind === 'rent');
  if (rentTip && eco.rentShare >= 0.3 && rentTip.pct >= 12 && v.housing && ['rent', 'pension'].includes(v.housing.type)) {
    add(36, { id: 'cheaper-city', level: 'info', icon: 'house', title: `Wohnen ist in ${rentTip.city} günstiger`, why: `Deine Unterkunft kostet ${Math.round(eco.rentShare * 100)} % deines Einkommens. In ${rentTip.city} (${rentTip.km} km entfernt) wäre sie rund ${rentTip.pct} % billiger – etwa ${dm(rentTip.savePerDay, cur)} pro Tag. Ein Umzug kostet aber Geld und Coins, und Arbeit musst du dort neu suchen.`, cta: { kind: 'go', label: 'Preise vergleichen', tab: 'city', spot: 'prices' } });
  }
  const fostr = (v.children || []).find((k) => k.status === 'home' && k.tal && !k.tal.hidden && !k.tal.foster && (k.tal.options || []).some((o) => o.ok) && v.money > (k.tal.cost || 0) * 6 && k.age >= 6 && k.age <= 15);
  if (fostr && v.status === 'alive') add(33, { id: 'foster', level: 'info', icon: 'graduation-cap', title: `${fostr.name} fördern`, why: `${fostr.tal.rec} Ein Förderprogramm steigert ein Talent und kostet nur ${dm(fostr.tal.cost, cur)}.`, cta: { kind: 'go', label: 'Zur Familie', tab: 'family' } });
  const teamLow = (v.companies || []).find((c) => !c.abandoned && c.talent && c.staff < c.needed && c.talent.canHire && v.money > c.talent.pool.staff.reduce((m, x) => Math.max(m, x.wage), 0) * 40);
  if (teamLow && (v.occupation || (v.companies || []).length)) add(32, { id: 'team', level: 'info', icon: 'users', title: `${teamLow.name}: Stelle jemanden mit passendem Talent ein`, why: 'Dir fehlen Mitarbeiter. Im Bewerberpool siehst du, wer zu deinem Betrieb passt – gute Leute bringen mehr Umsatz.', cta: { kind: 'go', label: 'Bewerber ansehen', tab: 'business', spot: 'talent' } });
  if (nextQuest) add(20, { id: 'quest', level: 'info', icon: 'flag', title: `Nächster Schritt: ${nextQuest.title}`, why: nextQuest.why, cta: { kind: 'go', label: 'Zeig mir’s', tab: nextQuest.tab, spot: nextQuest.spot } });
  c.sort((a, b) => b.prio - a.prio);
  if (!c.length) {
    const pool = v.efs ? v.efs.pool : 0;
    return { top: { id: 'calm', level: 'good', icon: 'circle-check', title: 'Alles in Ordnung', why: 'Nichts drängt gerade. Du kannst die Zeit laufen lassen oder mit EFS ein paar Tage vorspulen.', cta: pool >= 7 ? { kind: 'advance', label: '7 Tage vorspulen', days: 7 } : { kind: 'go', label: 'Zur Übersicht', tab: 'overview' } }, more: [] };
  }
  const strip = ({ prio, ...o }) => o;
  return { top: strip(c[0]), more: c.slice(1, 3).map(strip) };
}

/** Anzeigedaten für die Oberfläche (v = fertige Spielansicht). */
function view(world, state, user, v) {
  const q = ensure(state);
  const showAll = !!(user && user.meta && user.meta.showAll);
  const done = new Set(QUEST_IDS.filter((id) => q.done[id] != null));
  const next = QUESTS.find((x) => !done.has(x.id));
  const rewarded = (user && user.meta && user.meta.questRewarded) || {};
  const adv = state.status === 'alive' ? advise(v, next, { startMoney: startMoney() }) : null;
  return {
    welcome: showWelcome(state, user),
    showAll,
    quests: QUESTS.map((x) => ({ id: x.id, title: x.title, why: x.why, tab: x.tab, spot: x.spot, reward: x.reward, done: done.has(x.id), current: !!next && next.id === x.id, paid: !!rewarded[x.id] })),
    doneCount: done.size, total: QUESTS.length,
    seen: q.seen,
    advisor: adv,
    unlocks: unlocks(state, done, showAll, { canFound: !!(v.found && v.found.canAfford) }),
    openAfterYears: OPEN_AFTER_YEARS,
  };
}

module.exports = { view, ensure, initFresh, tick, satisfied, advise, unlocks, markSeen, noteAct, showWelcome, QUESTS, UNLOCKS, SEEN_KEYS, OPEN_AFTER_YEARS };
