'use strict';
/**
 * Englische Texte (Spielserver): Betrieb 2.0 – Ausbaumodule, Betriebsklima, Führungsaktionen, Betriebsbrand, Betriebsversicherung:
 * Meldungen, Fehler, Ansehen, Aufgaben, Hinweise, Tagesblatt, Katalog der Module. Paare [deutsch, englisch]; ${…} sind Platzhalter (Namen und Zahlen).
 * Der Katalog (Namen und Texte der Module) steht in src/game/operations-defaults.js; die Paare für seine Standardtexte entstehen hier aus den Standardwerten.
 */
const D = require('../game/operations-defaults');

const MOD_EN = {
  lager: { name: 'Warehouse', what: 'A stock of ingredients bridges supply gaps and lets you buy when prices are low.',
    levels: [['Storeroom', 'Keeps ingredients for 3 days.'], ['Warehouse hall', 'Keeps ingredients for 7 days.'], ['Large cold-storage warehouse', 'Keeps ingredients for 14 days.']] },
  brand: { name: 'Fire protection', what: 'Lowers the chance and the damage of a business fire and makes the business insurance cheaper.',
    levels: [['Fire extinguishers and firewall', 'Fire extinguishers, sand buckets and a firewall.'], ['Fire alarm system', 'Smoke detectors that alert the fire brigade.'], ['Sprinkler system', 'Puts out a fire before it spreads.']] },
  schutz: { name: 'Security', what: 'Repels theft and break-ins, protects the warehouse and makes attacks in the rivalry harder.',
    levels: [['Lock and gatekeeper', 'A good lock and a gatekeeper in the evening.'], ['Alarm system', 'Alarm on break-in, linked to the police.'], ['Video surveillance and security staff', 'Cameras and a security service around the clock.']] },
  arbeit: { name: 'Workplaces', what: 'Social rooms and occupational safety: better mood, fewer sick days and room for extra positions.',
    levels: [['Break room', 'A room for meals and rest, one extra position.'], ['Canteen and occupational safety', 'Hot meals, occupational safety, two extra positions.'], ['Social rooms and company daycare', 'Social rooms, childcare, three extra positions.']] },
};
const catalog = [];
for (const k of Object.keys(MOD_EN)) {
  const m = D.modules[k]; const e = MOD_EN[k];
  catalog.push([m.name, e.name], [m.what, e.what]);
  m.levels.forEach((L, i) => { catalog.push([L.name, e.levels[i][0]], [L.text, e.levels[i][1]]); });
}

const pairs = [
  // ---- Katalog
  ...catalog,
  ['Keine Mitarbeiter', 'No employees'], ['Ausgezeichnet', 'Excellent'], ['Angespannt', 'Tense'], ['Schlecht', 'Poor'], ['Normal', 'Normal'], ['Gut', 'Good'],
  ['Betriebsversicherung', 'Business insurance'],
  // ---- Ansehen
  ['Fairer Arbeitgeber', 'Fair employer'],
  ['Die Mitarbeiter deines Betriebs fühlen sich wohl: faire Löhne, Anerkennung, gutes Klima. Solche Arbeitgeber sind ein Gewinn für die Stadt.', 'The employees of your business feel good: fair wages, recognition, a good atmosphere. Such employers are an asset to the town.'],
  ['Druck auf Mitarbeiter', 'Pressure on employees'],
  ['Du hast Mitarbeiter wiederholt abgemahnt und die Stimmung im Betrieb ist schlecht. Das spricht sich herum.', 'You have repeatedly given employees formal warnings and the mood in the business is poor. Word gets around.'],
  // ---- Aufgaben, Freischaltung, Hinweise
  ['Rüste deinen Betrieb aus', 'Equip your business'],
  ['Module machen einen Betrieb sicherer und leistungsfähiger: Brandschutz senkt das Risiko eines Feuers, ein Lager überbrückt Lieferausfälle, Schutz wehrt Diebe ab. Beginne mit der kleinsten Stufe.', 'Modules make a business safer and more productive: fire protection lowers the risk of a fire, a warehouse bridges supply gaps, security repels thieves. Start with the smallest level.'],
  ['Würdige dein Team mit einem Lob', 'Show your team some appreciation'],
  ['Zufriedene Mitarbeiter arbeiten besser und kündigen seltener. Ein Lob kostet nichts, eine Prämie oder ein Betriebsfest etwas Geld – nur Drohungen und Abmahnungen schaden dem Klima.', 'Happy employees work better and quit less often. Praise is free, a bonus or a party costs some money – only threats and formal warnings harm the atmosphere.'],
  ['Ausbau & Betriebsklima', 'Upgrades & work climate'],
  ['dein Betrieb Mitarbeiter hat', 'your business has employees'],
  ['${sad.name}: Das Team ist unzufrieden', '${sad.name}: The team is unhappy'],
  ['Schlechte Stimmung kostet Umsatz und treibt Mitarbeiter zur Kündigung. Prüfe die Löhne und danke deinem Team mit Lob, einer Prämie oder einem Betriebsfest.', 'A bad mood costs sales and drives employees to quit. Check the wages and thank your team with praise, a bonus or a party.'],
  ['Zum Betriebsklima', 'To the work climate'],
  ['Dein Betrieb ist ungeschützt', 'Your business is unprotected'],
  ['Ein Brand kann einen Betrieb tagelang stilllegen und teuer werden. Die Betriebsversicherung zahlt den größten Teil des Schadens und eine Entschädigung für den Ausfall.', 'A fire can shut a business down for days and become expensive. The business insurance pays most of the damage and compensation for the downtime.'],
  ['Betriebsversicherung abschließen (${dm(insB.perDay, cur)} / Tag)', 'Take out business insurance (${dm(insB.perDay, cur)} / day)'],
  // ---- Meldungen
  ['${m.name} denkt an Kündigung', '${m.name} is thinking of quitting'],
  ['${c.name}: ${m.name} denkt ans Kündigen. Du hast ${askDays} Tage, um die Stimmung zu heben – ein Lob, eine Prämie oder mehr Lohn helfen.', '${c.name}: ${m.name} is thinking of quitting. You have ${askDays} days to lift the mood – praise, a bonus or a raise will help.'],
  ['Die Stimmung im Team ist niedrig.', 'The mood in the team is low.'],
  ['Wer sich nicht wertgeschätzt fühlt, sucht sich eine neue Stelle.', 'Anyone who does not feel valued looks for a new job.'],
  ['Öffne das Team und wähle Lob, Prämie oder Lohnerhöhung.', 'Open the team and choose praise, a bonus or a raise.'],
  ['${m.name} bleibt', '${m.name} stays'],
  ['${c.name}: ${m.name} fühlt sich wieder wohl und denkt nicht mehr ans Kündigen.', '${c.name}: ${m.name} feels good again and is no longer thinking of quitting.'],
  ['Streik bei ${c.name}', 'Strike at ${c.name}'],
  ['Die Belegschaft legt die Arbeit nieder, weil die Stimmung am Boden ist. Während des Streiks gibt es keinen Umsatz.', 'The workforce has downed tools because the mood is at rock bottom. There is no revenue during the strike.'],
  ['Ein niedriges Betriebsklima kann zum Streik führen.', 'A poor work climate can lead to a strike.'],
  ['Löhne und Unterhalt laufen weiter.', 'Wages and upkeep keep running.'],
  ['Faire Löhne, Lob und eine Prämie heben die Stimmung wieder.', 'Fair wages, praise and a bonus lift the mood again.'],
  ['Die Belegschaft legt die Arbeit nieder. Während des Streiks gibt es keinen Umsatz.', 'The workforce has downed tools. There is no revenue during the strike.'],
  ['Streiks dauern wenige Tage.', 'Strikes last a few days.'],
  ['Ein Manager schlichtet; mehr Lohn beruhigt langfristig die Stimmung.', 'A manager mediates; higher wages calm things down in the long run.'],
  ['Brand in ${c.name}', 'Fire at ${c.name}'],
  ['Brand in ${c.name} (${cn}).', 'Fire at ${c.name} (${cn}).'],
  ['Die Betriebsversicherung übernimmt ${covTxt} des Schadens. Der Betrieb steht etwa ${out} Tage still.', 'The business insurance covers ${covTxt} of the damage. The business is shut down for about ${out} days.'],
  ['Der Schaden von ${dmgTxt} geht zu deinen Lasten. Der Betrieb steht etwa ${out} Tage still.', 'You bear the damage of ${dmgTxt}. The business is shut down for about ${out} days.'],
  ['In deinem Betrieb hat es gebrannt.', 'There was a fire in your business.'],
  ['Die Betriebsversicherung trägt den größten Teil, der Betrieb ruht trotzdem einige Tage.', 'The business insurance bears most of it, but the business still stands idle for a few days.'],
  ['Ohne Betriebsversicherung trägst du Schaden und Ausfall selbst.', 'Without business insurance you bear the damage and the downtime yourself.'],
  ['Brandschutz senkt Wahrscheinlichkeit und Schaden; die Betriebsversicherung schließt du im Haushalt ab.', 'Fire protection lowers the likelihood and the damage; you take out the business insurance under Household.'],
  ['Ein Teil des Lagers ist verbrannt.', 'Part of the warehouse stock burned.'],
  ['Für den Ausfall gibt es ${compTxt} Entschädigung.', 'You receive ${compTxt} compensation for the downtime.'],
  ['Einbruchsversuch bei ${c.name} abgewehrt', 'Break-in attempt at ${c.name} repelled'],
  ['Die Sicherung des Betriebs hat den Diebstahl verhindert. Es ist nichts abhandengekommen.', 'The security of the business prevented the theft. Nothing went missing.'],
  ['Diebstahl in ${c.name}', 'Theft at ${c.name}'],
  ['Aus dem Betrieb wurde Ware gestohlen; die Betriebsversicherung ersetzt den Schaden bis auf ${lossTxt}.', 'Goods were stolen from the business; the business insurance covers the damage except for ${lossTxt}.'],
  ['Aus dem Betrieb wurde Ware im Wert von ${lossTxt} gestohlen. Auch aus dem Lager fehlt etwas.', 'Goods worth ${lossTxt} were stolen from the business. Something is missing from the warehouse as well.'],
  ['Aus dem Betrieb wurde Ware im Wert von ${lossTxt} gestohlen.', 'Goods worth ${lossTxt} were stolen from the business.'],
  // ---- Chronik, Bauaufträge, Tagesblatt
  ['${c.name}: ${nm} ausgebaut (${ln}).', '${c.name}: ${nm} upgraded (${ln}).'],
  ['Ausbau ${c.name}: ${OPS.levelName(key, nl)}', 'Upgrade ${c.name}: ${OPS.levelName(key, nl)}'],
  ['Wiederaufbau ${c.name}', 'Rebuilding ${c.name}'],
  ['Betriebsbrand', 'Business fire'],
  ['${who} in ${where} ist abgebrannt. Die Feuerwehr war im Einsatz.', '${who} in ${where} has burned down. The fire brigade was on the scene.'],
  ['${who} in ${where} ist abgebrannt. Die Feuerwehr war im Einsatz – eine Versicherung gab es nicht.', '${who} in ${where} has burned down. The fire brigade was on the scene – there was no insurance.'],
  // ---- Aktionen: Fehler und Rückmeldungen
  ['Ausbau und Betriebsklima sind gerade ausgeschaltet.', 'Upgrades and work climate are switched off at the moment.'],
  ['Unbekanntes Modul.', 'Unknown module.'],
  ['Stufen werden nacheinander gebaut.', 'Levels are built one after the other.'],
  ['${ln} gibt es erst ab ${from}.', '${ln} is not available until ${from}.'],
  ['Dieser Betrieb braucht keine Zutaten und lagert nichts ein.', 'This business needs no ingredients and stores nothing.'],
  ['${nm} ausgebaut: ${ln} (${fm}).', '${nm} upgraded: ${ln} (${fm}).'],
  ['Dieses Modul ist nicht gebaut.', 'This module has not been built.'],
  ['${nm} zurückgebaut. Eine Erstattung gibt es nicht.', '${nm} dismantled. There is no refund.'],
  ['Der Betrieb hat bereits einen Sicherheitsdienst.', 'The business already has a security service.'],
  ['Es gibt niemanden, den du loben könntest.', 'There is nobody you could praise.'],
  ['${nm} ist bestens gelaunt – ein Lob wäre jetzt verschwendet.', '${nm} is in the best of moods – praise would be wasted now.'],
  ['${nm} wurde gerade erst gelobt.', '${nm} was only just praised.'],
  ['Dein Team wurde gerade erst gelobt oder ist bestens gelaunt.', 'Your team was only just praised or is in the best of moods.'],
  ['${nm1} freut sich über dein Lob.', '${nm1} is pleased about your praise.'],
  ['Das Team freut sich über dein Lob.', 'The team is pleased about your praise.'],
  ['Es gibt niemanden, dem du eine Prämie zahlen könntest.', 'There is nobody you could pay a bonus to.'],
  ['${nm} hat erst vor kurzem eine Prämie bekommen.', '${nm} only recently received a bonus.'],
  ['Dein Team hat erst vor kurzem eine Prämie bekommen.', 'Your team only recently received a bonus.'],
  ['Für die Prämie reicht dein Geld nicht.', 'You cannot afford the bonus.'],
  ['${nm1} bekommt eine Prämie (${fm}).', '${nm1} receives a bonus (${fm}).'],
  ['Das Team bekommt eine Prämie (${fm}).', 'The team receives a bonus (${fm}).'],
  ['Ohne Mitarbeiter gibt es nichts zu feiern.', 'Without employees there is nothing to celebrate.'],
  ['Das letzte Betriebsfest ist noch nicht lange her (noch ${left} Tage).', 'The last company party was not long ago (${left} more days).'],
  ['Für das Fest reicht dein Geld nicht.', 'You cannot afford the party.'],
  ['Weihnachtsfeier in ${cn}: Die Stimmung steigt (${fm}).', 'Christmas party at ${cn}: The mood rises (${fm}).'],
  ['Betriebsfest in ${cn}: Die Stimmung steigt (${fm}).', 'Company party at ${cn}: The mood rises (${fm}).'],
  ['${nm} hat erst vor kurzem ein Geschenk bekommen.', '${nm} only recently received a gift.'],
  ['Für das Geschenk reicht dein Geld nicht.', 'You cannot afford the gift.'],
  ['${nm} freut sich über das Geschenk (${fm}).', '${nm} is pleased about the gift (${fm}).'],
  ['${nm} hat bereits eine Abmahnung bekommen.', '${nm} has already received a formal warning.'],
  ['${nm} wurde abgemahnt. Kurzfristig steigt die Leistung, doch die Stimmung im Team sinkt.', '${nm} was given a formal warning. Performance rises briefly, but the mood in the team drops.'],
  ['${nm} wurde abgemahnt. Kurzfristig steigt die Leistung, doch die Stimmung im Team sinkt. Wer oft abmahnt, gilt als Chef, der Druck macht – das kostet Ansehen.', '${nm} was given a formal warning. Performance rises briefly, but the mood in the team drops. Anyone who warns often is seen as a boss who applies pressure – that costs standing.'],
];
module.exports = pairs;
