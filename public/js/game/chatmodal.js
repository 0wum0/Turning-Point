/* Chat-Bubble und Glocke in der Kopfzeile: Stadtplatz als Fenster, Benachrichtigungen mit Absender und Betreff. */
import { html, raw, icon, api, on, toast, modal, esc } from './ui.js';
import { openProfile } from './views/social.js';

const hhmm = (d) => new Date(d).toLocaleTimeString(document.documentElement.lang === 'en' ? 'en-GB' : 'de-DE', { hour: '2-digit', minute: '2-digit' });
const seenKey = (cityId) => `tp-chat-seen-${cityId}`;
export const chatSeen = (cityId) => { try { return Number(localStorage.getItem(seenKey(cityId))) || 0; } catch (_) { return 0; } };
const markSeen = (cityId, id) => { try { if (id > chatSeen(cityId)) localStorage.setItem(seenKey(cityId), String(id)); } catch (_) { /* privat */ } };

/** Gibt es neue Chat-Nachrichten von anderen? (aus /api/social/summary) */
export function chatUnread(social) {
  const c = social && social.chat; if (!c || !c.cityId) return false;
  return c.last > chatSeen(c.cityId) && c.last > (c.lastMine || 0);
}

const line = (m) => `<div class="cl ${m.mine ? 'mine' : ''}" data-id="${m.id}"><span class="t">${hhmm(m.at)}</span> <a href="#/social" class="who" data-profile="${m.userId}">${esc(m.name)}</a> <span class="msg">${esc(m.text)}</span></div>`;

export async function openChatModal(ctx) {
  let d;
  try { d = await api('GET', '/api/social/chat'); } catch (err) { toast(err.message, 'warn'); return; }
  const city = (ctx.world && ctx.world.cities || []).find((c) => c.id === d.cityId);
  const m = modal(html`<div class="row spread nowrap"><h3 style="margin:0">${icon('landmark')} Stadtplatz ${city ? city.name : ''}</h3><button class="btn ghost sm" data-close="x" aria-label="Schließen">${icon('x')}</button></div>
    <p class="dim small" style="margin:.2rem 0 .6rem"><span id="cm-online">${d.online.length}</span> online · <a href="#/social" data-open-plaza>Alle Funktionen (Betriebe, Besuche) …</a></p>
    <div class="chat"><div class="chatlog" id="cm-log" aria-live="polite">${raw(d.messages.map(line).join('') || '<div class="dim small">Noch ist es still auf dem Platz. Sag Hallo!</div>')}</div>
    <form class="row nowrap" id="cm-form"><input id="cm-in" type="text" maxlength="${d.chat.maxLen}" placeholder="Nachricht an die Stadt …" autocomplete="off"><button class="btn primary" aria-label="Senden">${icon('send')}</button></form></div>`, { wide: false });
  const log = m.el.querySelector('#cm-log'); const form = m.el.querySelector('#cm-form'); const input = m.el.querySelector('#cm-in');
  let last = d.messages.length ? d.messages[d.messages.length - 1].id : 0; log.scrollTop = log.scrollHeight; markSeen(d.cityId, last); refresh();
  function refresh() { if (ctx.social && ctx.social.chat) { ctx.social.chat.last = Math.max(ctx.social.chat.last || 0, last); } ctx.hud(); }
  async function poll() {
    if (!log.isConnected) return;
    try {
      const r = await api('GET', `/api/social/chat?after=${last}`);
      if (r.messages.length) {
        const note = log.querySelector('.dim.small'); if (note && !log.querySelector('.cl')) note.remove();
        const atEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
        log.insertAdjacentHTML('beforeend', r.messages.map(line).join('')); last = r.messages[r.messages.length - 1].id; markSeen(d.cityId, last);
        if (atEnd) log.scrollTop = log.scrollHeight;
      }
      const on_ = m.el.querySelector('#cm-online'); if (on_) on_.textContent = r.online.length;
    } catch (_) { /* nächster Versuch */ }
  }
  const iv = setInterval(() => { if (!log.isConnected) { clearInterval(iv); return; } if (!document.hidden) poll(); }, 4000);
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); const text = input.value.trim(); if (!text) return; input.disabled = true;
    try { await api('POST', '/api/social/chat', { cityId: d.cityId, text }); input.value = ''; await poll(); } catch (err) { toast(err.message, 'warn'); } finally { input.disabled = false; input.focus(); }
  });
  on(m.el, 'click', '[data-open-plaza]', (e) => { e.preventDefault(); const so = ctx.ui.soc = ctx.ui.soc || { cat: 'wealth', scope: 'all', box: 'in', page: 1 }; so.tab = 'plaza'; m.close(); ctx.go('social'); });
  on(m.el, 'click', '[data-profile]', (e, t) => { e.preventDefault(); openProfile(ctx, Number(t.dataset.profile)); });
  setTimeout(() => input.focus(), 60);
}

const KIND = { letter: ['mail', 'letters'], system: ['bell', 'letters'], friend: ['users', 'friends'], couple: ['heart', 'love'], job: ['briefcase', 'jobs'] };
const ago = (d) => { const s = Math.max(0, (Date.now() - new Date(d).getTime()) / 1000); const en = document.documentElement.lang === 'en'; if (s < 90) return en ? 'now' : 'jetzt'; if (s < 3600) return `${Math.round(s / 60)} min`; if (s < 86400) return `${Math.round(s / 3600)} h`; return `${Math.round(s / 86400)} ${en ? 'd' : 'Tg.'}`; };

export async function openBell(ctx) {
  let d;
  try { d = await api('GET', '/api/social/notifications'); } catch (err) { toast(err.message, 'warn'); return; }
  const m = modal(html`<div class="row spread nowrap"><h3 style="margin:0">${icon('bell')} Benachrichtigungen</h3><button class="btn ghost sm" data-close="x" aria-label="Schließen">${icon('x')}</button></div>
    <div class="stack mt" style="--gap:.4rem">${d.items.map((n, i) => { const k = KIND[n.kind] || KIND.letter; return html`<button class="notif" data-n="${i}"><span class="ni">${icon(k[0])}</span><span class="grow"><b>${n.from}</b><span class="subj">${n.subject}</span></span><span class="dim small">${ago(n.at)}</span></button>`; })}
    ${d.items.length ? '' : html`<div class="dim">Alles gelesen – keine neuen Nachrichten.</div>`}</div>
    <div class="row end mt"><button class="btn sm" data-all>${icon('mail')} Alle Briefe</button></div>`);
  const go = (tab) => { const so = ctx.ui.soc = ctx.ui.soc || { cat: 'wealth', scope: 'all', box: 'in', page: 1 }; so.tab = tab; m.close(); ctx.go('social'); };
  on(m.el, 'click', '[data-n]', (e, t) => { const n = d.items[Number(t.dataset.n)]; const k = KIND[n.kind] || KIND.letter; if (k[1] === 'letters') { const so = ctx.ui.soc = ctx.ui.soc || { cat: 'wealth', scope: 'all', box: 'in', page: 1 }; so.box = 'in'; so.openLetter = n.id; } go(k[1]); });
  on(m.el, 'click', '[data-all]', () => { const so = ctx.ui.soc = ctx.ui.soc || { cat: 'wealth', scope: 'all', box: 'in', page: 1 }; so.box = 'in'; go('letters'); });
}
