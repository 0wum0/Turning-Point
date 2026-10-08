'use strict';
/**
 * Einsteiger-Erlebnis: Willkommensdialog, Aufgabenreihe „Deine ersten Schritte“, „Was jetzt?“-Berater und
 * schrittweises Freischalten fortgeschrittener Bereiche. Alles hier ist reine Anzeige-Logik: Der Server sperrt nichts.
 * Fortschritt liegt im Spielstand (state.flags.quests); „gesehen“-Marken für Dialoge liegen am Konto (users.meta).
 */

/** Marken, die die Oberfläche melden darf (Seitenbesuche und Aktionen, die nicht im Spielstand sichtbar sind). */
const SEEN_KEYS = ['newspaper', 'map', 'household', 'housing', 'work', 'family', 'business', 'society', 'friend', 'marketOffer', 'vote', 'glossary', 'tour'];

function ensure(state) {
  if (!state.flags) state.flags = {};
  const q = state.flags.quests;
  if (!q || typeof q !== 'object') state.flags.quests = { done: {}, seen: {}, acts: {}, legacy: true };
  const k = state.flags.quests;
  if (!k.done) k.done = {};
  if (!k.seen) k.seen = {};
  if (!k.acts) k.acts = {};
  return k;
}

/** Wird der Willkommensdialog gezeigt? Nur für Konten, die ihn noch nicht gesehen haben und deren Leben gerade erst begann. */
const showWelcome = (state, user) => !(user && user.meta && user.meta.welcomed) && state.day < 400 && state.status === 'alive';

/** Aktion „seen“: die Oberfläche meldet, dass etwas gesehen/erledigt wurde. */
function markSeen(state, user, key) {
  if (key === 'welcome') { user.meta.welcomed = true; return; }
  if (!SEEN_KEYS.includes(key)) return;
  ensure(state).seen[key] = true;
}

/** Anzeigedaten für die Oberfläche (view = fertige Spielansicht). */
function view(world, state, user, v) {
  return { welcome: showWelcome(state, user) };
}

module.exports = { view, SEEN_KEYS, ensure, showWelcome, markSeen };
