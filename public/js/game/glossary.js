/* Glossar: kurze Erklärungen für Fachwörter. term('EFS') im Text → antippbares Wort; „Glossar“ im Hilfe-Menü listet alles. */
import { html, icon, modal, on } from './ui.js';
import { GLOSSARY_GOODS } from './glossary-goods.js';
import { GLOSSARY_CITY } from './glossary-city.js';
import { GLOSSARY_REP } from './glossary-rep.js';
import { GLOSSARY_COURT } from './glossary-court.js';

/* key = Anzeigewort; text = ein bis zwei Sätze in einfacher Sprache */
export const GLOSSARY = [
  ['EFS', 'Spieltage auf Vorrat', 'Ein EFS ist ein Spieltag auf Vorrat (1 EFS = 1 Tag). Die Zeit läuft von selbst; mit EFS kannst du sie zusätzlich vorspulen. Das ist freiwillig.'],
  ['Spieltag', 'Spieltag', 'Das Spiel läuft schneller als das echte Leben: 24 echte Stunden sind ein Spieljahr, ein Spieltag dauert etwa 4 Minuten.'],
  ['Coins', 'Coins', 'Eine besondere Währung für Umzüge und Extras. Du bekommst sie für Kinder und freiwillige Werbung. Sie bleiben dir über Generationen erhalten.'],
  ['Kühlschrank', 'Kühlschrank', 'Dein Essensvorrat. Ist er leer, hast du Hunger, und Stimmung und Gesundheit sinken. Du füllst ihn unter „Haushalt“ auf.'],
  ['Wohlbefinden', 'Wohlbefinden', 'Deine Stimmung. Gutes Essen, Arbeit, ein Zuhause und Zeit mit der Familie heben sie.'],
  ['Erholung', 'Erholung', 'Wie ausgeruht du bist. Eine richtige Wohnung erholt besser als die Straße; Arbeit und Kinder kosten Kraft.'],
  ['Gesundheit', 'Gesundheit', 'Fällt sie auf null, stirbt dein Charakter. Essen, Schlaf und gute Stimmung stärken sie.'],
  ['Vermögen', 'Vermögen', 'Alles, was du besitzt, abzüglich Schulden: Bargeld, Häuser und Firmen.'],
  ['Wert 1945', 'Wert von 1945 (Kaufkraft)', 'Preise steigen im Lauf der Jahre. Damit man 1960 und 2040 fair vergleichen kann, rechnen Ranglisten Beträge auf die Kaufkraft von 1945 um. Das nennt man inflationsbereinigt.'],
  ['Einfluss', 'Einfluss', 'Dein Ansehen in der Politik. Er steigt mit Ämtern und erhöht deine Wahlchancen. Er bleibt dir über alle Leben erhalten.'],
  ['Qualifikation', 'Qualifikation', 'Ein erlernter Beruf. Er bestimmt, welche Firmen du führen darfst und welche Stellen du bekommst.'],
  ['Instandhaltung', 'Instandhaltung', 'Reparaturen und Pflege eines Hauses. Ein guter Zustand hält den Wert hoch und bringt mehr Miete.'],
  ['Versicherung', 'Versicherung', 'Sie ersetzt Schäden durch Feuer, Sturm oder Einbruch. Die Ausfallzeit des Gebäudes ersetzt sie nicht.'],
  ['Rendite', 'Rendite', 'Wie viel Prozent vom Wert du pro Jahr einnimmst, zum Beispiel durch Miete.'],
  ['Kredit', 'Kredit', 'Geliehenes Geld von der Bank. Du zahlst täglich eine Rate mit Zinsen zurück. Wer nicht zahlen kann, droht in die Insolvenz zu rutschen.'],
  ['Erbe', 'Erbe und Pflichtanteil', 'Stirbt dein Charakter, übernimmt ein volljähriges Kind. Der Besitz wird gerecht auf alle Kinder verteilt (Pflichtanteil). Ohne volljähriges Kind endet die Linie.'],
  ['Konkurrenz', 'Konkurrenz', 'Andere Betriebe derselben Art in der Stadt teilen sich die Kundschaft. Je mehr es gibt, desto weniger bleibt für jeden.'],
  ['Wettbewerb', 'Wettbewerb und Sabotage', 'Spieler, die mitmachen, können Betriebe anderer ausspionieren, unterbieten, Mitarbeiter abwerben oder sabotieren – mit Risiko und Strafe.'],
  ['Markt', 'Markt', 'Hier machst du anderen Spielern Angebote für Häuser und Firmen oder bietest bei Versteigerungen mit.'],
  ['Gebot', 'Gebot', 'Der Preis, den du bei einer Versteigerung oder einem Angebot zahlen würdest.'],
  ['Börse', 'Börse', 'Hier handelst du Anteile (Aktien) an Betrieben anderer Spieler. Gewinne kommen durch Kursanstieg und Ausschüttungen.'],
  ['Anteil', 'Anteil (Aktie)', 'Ein kleines Stück eines Betriebs. Wer Anteile hält, bekommt einen Teil des Gewinns.'],
  ['Order', 'Order (Auftrag)', 'Dein Auftrag, Anteile zu kaufen oder zu verkaufen. Wird er nicht sofort ausgeführt, bleibt er offen, bis jemand passt.'],
  ['Limit', 'Limit (Höchst- oder Mindestpreis)', 'Der Preis, den du bei einem Kauf höchstens oder bei einem Verkauf mindestens akzeptierst.'],
  ['Börsengang', 'Börsengang (IPO)', 'Dein Betrieb wird in 1.000 Anteile geteilt und ein Teil davon zum Kauf angeboten. So holst du Geld herein, behältst aber die Mehrheit.'],
  ['Ausschüttung', 'Ausschüttung (Dividende)', 'Der Teil des Gewinns, den ein Betrieb täglich an alle Anteilseigner auszahlt.'],
  ['Streubesitz', 'Streubesitz', 'Der Teil der Anteile, der an andere Spieler verkauft wird.'],
  ['Treuhand', 'Treuhand (Escrow)', 'Das Geld wird sicher verwahrt, bis ein Handel abgeschlossen ist. So kann niemand betrügen.'],
  ['Vermächtnis', 'Vermächtnis', 'Das, was deine Familie über viele Generationen aufbaut. Ziel des Spiels ist ein starkes Vermächtnis bis zum Jahr 2100.'],
].concat(GLOSSARY_GOODS, GLOSSARY_CITY, GLOSSARY_REP, GLOSSARY_COURT);
const byKey = new Map(GLOSSARY.map((g) => [g[0], g]));

const entry = (g) => html`<div class="gl-entry" id="gl-${encodeURIComponent(g[0])}"><b>${g[1]}</b><div class="dim">${g[2]}</div></div>`;

/** Kleines Erklärfenster zu einem Wort. */
export function openTerm(key) {
  const g = byKey.get(key); if (!g) return;
  const m = modal(html`<h3>${icon('book-open')} ${g[1]}</h3><p>${g[2]}</p>
    <div class="row spread mt"><button class="btn ghost" data-gl-all="1">Alle Begriffe</button><button class="btn primary" data-close="x">Verstanden</button></div>`);
  m.el.addEventListener('click', (e) => { if (e.target.closest('[data-gl-all]')) { m.close(); openGlossary(key); } });
}

/** Das ganze Glossar mit Suchfeld. */
export function openGlossary(focus) {
  const m = modal(html`<h3>${icon('book-open')} Glossar</h3>
    <p class="dim small">Wichtige Wörter in einfachen Worten. Tippe in den Texten auf unterstrichene Wörter, um sie direkt zu erklären.</p>
    <div class="field"><label class="sr" for="glq">Suchen</label><input id="glq" type="search" placeholder="Wort suchen …" autocomplete="off"></div>
    <div class="gl-list" id="glList">${GLOSSARY.map(entry)}</div>
    <div class="row end mt"><button class="btn primary" data-close="x">Schließen</button></div>`, { wide: true });
  const list = m.el.querySelector('#glList'); const q = m.el.querySelector('#glq');
  q.addEventListener('input', () => { const t = q.value.trim().toLowerCase(); list.querySelectorAll('.gl-entry').forEach((e) => { e.hidden = !!t && !e.textContent.toLowerCase().includes(t); }); });
  if (focus) { const el = m.el.querySelector(`#gl-${CSS.escape(encodeURIComponent(focus))}`); if (el) { el.classList.add('hit'); setTimeout(() => el.scrollIntoView({ block: 'center' }), 60); } }
  return m;
}
