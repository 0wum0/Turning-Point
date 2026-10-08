/* Wettbewerb: Aktionen gegen Betriebe anderer Teilnehmer (freiwillig; Admin kann für alle aktivieren). */
import { html, icon, api, on, modal, toast, money, mount } from './ui.js';

const INFO = {
  spy: ['Industriespionage', 'search', 'Du erfährst Wert, Gewinn, Kasse und Personal des Betriebs. Kein Schaden, aber du kannst dabei auffallen.'],
  price: ['Preiskampf', 'trending-down', 'Du unterbietest die Preise: Der Umsatz des Betriebs sinkt für einige Tage.'],
  poach: ['Mitarbeiter abwerben', 'users', 'Ein Mitarbeiter wechselt die Seite – der Betrieb arbeitet weniger effizient.'],
  sabotage: ['Sabotage', 'flame', 'Ein Anschlag legt den Betrieb für einige Tage lahm und verursacht Reparaturkosten. Hohes Risiko: wirst du erwischt, zahlst du eine hohe Strafe.'],
};

export async function openRival(ctx, targetId, companyId, name, onDone) {
  let st; try { st = await api('GET', '/api/social/rivalry'); } catch (e) { toast(e.message, 'warn'); return; }
  const k = ctx.view.idx || 1; const cur = ctx.view.currency;
  if (!st.participating) { toast(st.mode === 'optin' ? 'Du nimmst nicht am Wettbewerb teil. Du kannst das unter Spieler → Mein Profil einschalten.' : 'Der Wettbewerb ist gerade abgeschaltet.', 'warn'); return; }
  if (st.banUntil) { toast('Du bist wegen Verstößen vorübergehend vom Wettbewerb ausgeschlossen.', 'warn'); return; }
  const dlg = modal(html`<h3>${icon('swords')} Wettbewerb: ${name}</h3>
    <p class="dim small">Du musst in der Stadt des Betriebs wohnen. Jede Aktion kostet Geld; mit Risiko von ca. ${Math.round(st.caughtBase * 100)} % (je nach Aktion) wirst du erwischt – dann zahlst du das ${Math.round(st.finePct / 100)}-Fache der Kosten als Strafe und der Gegner erfährt deinen Namen. ${st.strikes}/${st.strikeLimit} Verstößen im Fenster; bei ${st.strikeLimit} wirst du gesperrt.</p>
    <div class="stack" style="--gap:.5rem">${st.actions.map((a) => { const i = INFO[a.key] || [a.label, 'swords', '']; return html`<div class="firm"><span class="dir-ic">${icon(i[1])}</span><div class="grow"><b>${i[0]}</b><div class="dim small">${i[2]}${a.hitPct ? ` (−${a.hitPct} % Umsatz, ${a.days} Tage)` : a.days ? ` (${a.days} Tage Ausfall)` : ''}</div></div><button class="btn sm ${a.key === 'sabotage' ? 'danger' : ''}" data-act="${a.key}">${money(Math.round(a.cost * k), cur)}</button></div>`; })}</div>
    <p class="dim small mt">Schutz für Betriebe: Sicherheitsdienst (wehrt Angriffe oft ab, erhöht die Entdeckungschance) und Gebäudeversicherung (zahlt Reparaturen).</p>
    <div class="row end"><button class="btn ghost" data-close="x">Schließen</button></div>`);
  on(dlg.el, 'click', '[data-act]', async (e, t) => {
    const key = t.dataset.act;
    if (key === 'sabotage' && !(await ctx.confirm({ title: 'Sabotage wirklich versuchen?', text: 'Ein Anschlag schadet dem Betrieb. Wirst du erwischt, zahlst du eine hohe Strafe, der Gegner erfährt deinen Namen und es erscheint in der Zeitung.', ok: 'Anschlag ausführen', danger: true }))) return;
    t.disabled = true;
    try {
      const r = await api('POST', '/api/social/rivalry/act', { targetId, companyId, action: key });
      if (r.view) { ctx.setView(r.view); ctx.hud(); }
      dlg.close();
      if (key === 'spy' && r.info) {
        const i = r.info; modal(html`<h3>${icon('search')} ${i.name}</h3><dl class="kv"><dt>Wert</dt><dd>${money(Math.round(i.value * k), cur)}</dd><dt>Umsatz / Tag</dt><dd>${money(Math.round(i.income * k), cur)}</dd><dt>Gewinn / Tag</dt><dd>${money(Math.round(i.profit * k), cur)}</dd><dt>Kasse</dt><dd>${money(Math.round(i.cash * k), cur)}</dd><dt>Räume · Personal</dt><dd>${i.rooms} · ${i.staff}</dd><dt>Sicherheitsdienst</dt><dd>${i.security ? 'ja' : 'nein'}</dd></dl>${r.caught ? html`<div class="alert warn mt">${icon('triangle-alert')}<div>Du bist aufgefallen und zahlst eine Strafe.</div></div>` : ''}<div class="row end mt"><button class="btn primary" data-close="x">OK</button></div>`);
      } else toast(r.success ? (r.caught ? 'Erfolgreich – aber du wurdest erwischt!' : 'Erfolgreich, unbemerkt.') : 'Abgewehrt – und du wurdest erwischt.', r.caught ? 'warn' : 'good');
      if (r.banned) toast('Du wurdest wegen wiederholter Verstöße vorübergehend vom Wettbewerb ausgeschlossen.', 'bad');
      if (onDone) onDone();
    } catch (er) { toast(er.message, 'warn'); t.disabled = false; }
  });
}
