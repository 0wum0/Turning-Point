/* Read-only stage direction: the server remains the sole production clock. */
const clamp = n => Math.max(0, Math.min(1, Number(n) || 0));
export function businessLife(c) {
  if (!c) return null;
  const efficiency = clamp(c.flows?.efficiency);
  const supplied = c.supply?.on ? clamp(c.flows?.lager?.factor ?? c.supply.factor) : 1;
  const fire = Number(c.ops?.fire?.outage) || 0;
  const outage = Number(c.outage) || 0;
  const strike = Number(c.operation?.strikeDays) || 0;
  const stopped = c.abandoned || outage > 0 || fire > 0 || strike > 0;
  const active = !stopped && efficiency > 0 && supplied > 0;
  const missing = (c.supply?.needs || []).filter(n => n.missing > .005).map(n => n.name);
  let status = 'Betrieb läuft', tone = 'good', why = 'Zutaten, Arbeit und Verkauf bilden deinen täglichen Ertrag.';
  if (c.abandoned) { status = 'Stillgelegt'; tone = 'bad'; why = 'Prüfe die Qualifikation und reaktiviere den Betrieb in der Verwaltung.'; }
  else if (fire || outage) { status = fire ? 'Stillstand nach Brand' : 'Produktionsausfall'; tone = 'bad'; why = `Noch ${Math.max(fire, outage)} Spieltage ohne Produktion. Laufende Kosten bleiben bestehen.`; }
  else if (strike) { status = 'Das Team streikt'; tone = 'bad'; why = `Noch ${strike} Spieltage. Prüfe das Betriebsklima und deine laufenden Kosten.`; }
  else if (supplied < .98) { status = 'Zutaten fehlen'; tone = 'warn'; why = `${missing.length ? missing.join(', ') + ': ' : ''}${c.autoBuy ? 'Prüfe Lieferanten und Lager.' : 'Prüfe den automatischen Einkauf oder vereinbare eine Lieferung.'}`; }
  else if (c.ops?.stock?.window === 'cover') { status = 'Lager überbrückt Lieferlücke'; why = 'Dein Vorrat hält den Betrieb am Laufen. Sichere rechtzeitig die nächste Lieferung.'; }
  else if (efficiency < .98) { status = 'Betrieb nicht ausgelastet'; tone = 'warn'; why = c.operation?.managed || c.manager || c.owner ? 'Prüfe Personalbedarf und Gesundheit des Teams.' : 'Arbeite selbst mit oder setze einen Manager ein. Prüfe auch den Personalbedarf.'; }
  const workers = Math.max(0, Math.floor(Number(c.staff) || 0) + Math.floor(Number(c.operation?.playerStaff) || 0));
  return { status, tone, why, active, pace:active ? Math.max(.2, efficiency * supplied) : 0,
    workers, owner:!!c.owner, efficiency, supplied, missing,
    inputs:c.supply?.on ? c.supply.needs || [] : [], outputs:c.supply?.on ? c.supply.outputs || [] : [],
    profit:Number(c.profitAll ?? c.flows?.profitAll ?? c.flows?.profit) || 0 };
}
