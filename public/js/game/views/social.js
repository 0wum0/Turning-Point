import { html, raw, icon, api, on, toast, modal, money, num, esc, infoBtn } from '../ui.js';

const TABS = [['rank', 'Rangliste', 'crown'], ['plaza', 'Stadtplatz', 'landmark'], ['letters', 'Briefe', 'mail'], ['friends', 'Freunde', 'users'], ['me', 'Mein Profil', 'user']];
const hhmm = (d) => new Date(d).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
const dt = (d) => new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
const cityName = (ctx, id) => { const c = (ctx.world && ctx.world.cities || []).find((x) => x.id === id); return c ? c.name : '–'; };
const dot = (on) => html`<i class="odot ${on ? 'on' : ''}" title="${on ? 'online' : 'offline'}"></i>`;
const medal = (r) => (r <= 3 ? html`<span class="medal m${r}">${icon('crown')}</span>` : html`<span class="rk">${r}</span>`);

function fmtScore(unit, r, ctx) {
  if (unit === 'money') return `${num(r.score / 100)} DM-Kaufkraft '45`;
  if (unit === 'pts') return `${num(r.score)} Einfluss${r.office ? ' · ' + r.office : ''}`;
  if (unit === 'gen') return `Generation ${Math.floor(r.score / 1000)}`;
  if (unit === 'kids') return `${Math.floor(r.score / 1000)} Kind${Math.floor(r.score / 1000) === 1 ? '' : 'er'}`;
  return `${num(r.score / 365)} Jahre · ${r.year}`;
}

/* ---------- Profil-Fenster (auch aus Zeitung/Chat/Rangliste erreichbar) ---------- */
export async function openProfile(ctx, userId) {
  let p; try { p = (await api('GET', `/api/social/profile/${userId}`)).profile; } catch (e) { toast(e.message, 'bad'); return; }
  const s = p.stats; const me = p.relation === 'self';
  const rel = { none: html`<button class="btn sm primary" data-f="request">${icon('plus')} Freund hinzufügen</button>`, pending_out: html`<span class="chip">Anfrage gesendet</span>`, pending_in: html`<button class="btn sm primary" data-f="accept">Anfrage annehmen</button>`, friend: html`<button class="btn sm ghost" data-f="remove">Freundschaft beenden</button>`, self: '', blocked: html`<span class="chip bad">blockiert</span>`, blocked_by: '' }[p.relation] || '';
  const m = modal(html`<div class="profile">
    <div class="row spread"><div><h3 class="serif" style="margin:0">${s ? s.name : p.username} ${dot(p.online)}</h3><div class="dim small">@${p.username}${s ? ` · ${cityName(ctx, s.cityId)} · ${s.year}` : ''}</div></div><button class="btn ghost sm" data-close="x" aria-label="Schließen">${icon('x')}</button></div>
    ${p.bio ? html`<p class="bio">${p.bio}</p>` : ''}
    ${!p.visible || !s ? html`<div class="alert info">${icon('lock')}<div>Dieses Profil ist privat.</div></div>` : html`
      <div class="pgrid">
        <div><small>Beruf</small><b>${s.occupation || '–'}</b></div><div><small>Generation</small><b>${s.generation}</b></div>
        <div><small>Vermögen</small><b>${num(s.wealth / 100)} <span class="dim small">'45</span></b></div><div><small>Kinder</small><b>${s.children}</b></div>
        <div><small>Betriebe</small><b>${s.companies}</b></div><div><small>Immobilien</small><b>${s.properties}</b></div>
        <div><small>Einfluss</small><b>${s.influence}${s.office ? ' · ' + s.office : ''}</b></div><div><small>Platz Vermögen</small><b>#${p.ranks.wealth}</b></div></div>
      ${p.firms.length ? html`<div class="card-title mt">${icon('store')} Betriebe</div><div class="stack" style="--gap:.4rem">${p.firms.map((f) => html`<div class="row spread small"><span>${icon('store')} ${f.name}</span><span class="dim">${cityName(ctx, f.cityId)}</span></div>`)}</div>` : ''}`}
    ${me ? '' : html`<div class="row wrap mt" style="gap:.5rem">${rel}<button class="btn sm" data-a="letter">${icon('mail')} Brief schreiben</button>${p.visible && s ? html`<button class="btn sm" data-a="gift">${icon('gift')} Geschenk</button>` : ''}<button class="btn sm ghost" data-a="report" title="Spieler melden">${icon('flag')}</button>${p.relation === 'friend' || p.relation === 'none' ? html`<button class="btn sm ghost" data-a="block" title="Blockieren">${icon('ban')}</button>` : ''}</div>`}
  </div>`, {});
  const act = async (fn) => { try { await fn(); m.close(); } catch (e) { toast(e.message, 'bad'); } };
  m.el.addEventListener('click', (e) => {
    const f = e.target.closest('[data-f]'); const a = e.target.closest('[data-a]');
    if (f) act(async () => { const k = f.dataset.f; if (k === 'request') { const r = await api('POST', '/api/social/friends/request', { userId }); toast(r.state === 'accepted' ? 'Ihr seid jetzt Freunde!' : 'Anfrage gesendet.'); } else if (k === 'accept') { await api('POST', '/api/social/friends/respond', { userId, accept: true }); toast('Ihr seid jetzt Freunde!'); } else if (k === 'remove') { await api('POST', '/api/social/friends/remove', { userId }); toast('Freundschaft beendet.', 'warn'); } ctx.rerender(); });
    if (a) { const k = a.dataset.a; m.close(); if (k === 'letter') composeLetter(ctx, userId, s ? s.name : p.username); else if (k === 'gift') giftDialog(ctx, userId, s ? s.name : p.username); else if (k === 'report') reportDialog(ctx, 'player', userId); else if (k === 'block') ctx.confirm({ title: 'Blockieren?', text: 'Ihr könnt euch dann keine Briefe oder Geschenke mehr schicken.', ok: 'Blockieren', danger: true }).then(async (ok) => { if (ok) { try { await api('POST', '/api/social/friends/remove', { userId, block: true }); toast('Blockiert.', 'warn'); ctx.rerender(); } catch (e) { toast(e.message, 'bad'); } } }); }
  });
}

function composeLetter(ctx, to, toName, subject = '') {
  const m = modal(html`<h3>${icon('mail')} Brief an ${toName}</h3>
    <div class="field"><label>Betreff</label><input id="lsub" type="text" maxlength="120" value="${subject}"></div>
    <div class="field"><label>Text</label><textarea id="lbody" maxlength="1500" style="min-height:150px" autofocus></textarea></div>
    <div class="row end"><button class="btn ghost" data-close="x">Abbrechen</button><button class="btn primary" id="lsend">${icon('send')} Abschicken</button></div>`);
  m.el.querySelector('#lsend').onclick = async () => {
    try { await api('POST', '/api/social/letter', { to, subject: m.el.querySelector('#lsub').value, body: m.el.querySelector('#lbody').value }); toast('Brief verschickt.'); m.close(); ctx.rerender(); } catch (e) { toast(e.message, 'bad'); }
  };
}
function giftDialog(ctx, to, toName) {
  const cur = ctx.view.currency === 'EUR' ? '€' : 'DM';
  const m = modal(html`<h3>${icon('gift')} Geschenk an ${toName}</h3>
    <p class="dim small">Du kannst Geld verschenken – zum Beispiel, um einem Neuling auf die Beine zu helfen. Es gelten Tageslimits, ein kleiner Anteil geht an den Staat, und nur Spielgeld ist erlaubt (keine Coins).</p>
    <div class="field"><label>Betrag in ${cur}</label><input id="gamt" type="number" min="1" step="1" value="50" autofocus></div>
    <div class="row end"><button class="btn ghost" data-close="x">Abbrechen</button><button class="btn primary" id="gsend">${icon('gift')} Verschenken</button></div>`);
  m.el.querySelector('#gsend').onclick = async () => {
    try { const r = await api('POST', '/api/social/gift', { to, amount: m.el.querySelector('#gamt').value }); ctx.setView(r.view); toast(`Geschenk verschickt – ${toName} erhält ${money(r.received, ctx.view.currency)}.`); m.close(); ctx.hud(); if (window.TPMotion) window.TPMotion.confetti(); } catch (e) { toast(e.message, 'bad'); }
  };
}
function reportDialog(ctx, kind, refId) {
  const m = modal(html`<h3>${icon('flag')} Melden</h3><p class="dim small">Was stimmt nicht? Das Team prüft die Meldung.</p>
    <div class="field"><textarea id="rr" maxlength="300" style="min-height:90px" placeholder="Beleidigung, Spam, Betrugsverdacht …" autofocus></textarea></div>
    <div class="row end"><button class="btn ghost" data-close="x">Abbrechen</button><button class="btn primary" id="rs">Melden</button></div>`);
  m.el.querySelector('#rs').onclick = async () => { try { await api('POST', '/api/social/report', { kind, refId, reason: m.el.querySelector('#rr').value }); toast('Danke, die Meldung ist angekommen.'); m.close(); } catch (e) { toast(e.message, 'bad'); } };
}

/* ---------- Seiten ---------- */
const views = {
  rank(ctx, d) {
    const me = d.me;
    return html`
    <div class="tabs">${d.cats.map((c) => html`<a href="#/social" data-cat="${c.key}" class="${c.key === d.cat ? 'on' : ''}">${c.label}</a>`)}</div>
    <div class="row spread wrap" style="margin-bottom:.8rem"><div class="seg">${[['all', 'Alle'], ['city', 'Meine Stadt'], ['friends', 'Freunde']].map((x) => html`<a href="#/social" data-scope="${x[0]}" class="${d.scope === x[0] ? 'on' : ''}">${x[1]}</a>`)}</div><span class="dim small">${d.total} Spieler · ${d.hint}</span></div>
    ${me ? html`<div class="card me-card ${me.hidden ? 'dim' : ''}"><div class="row spread"><div><div class="dim small">Dein Platz</div><b class="serif" style="font-size:2rem">#${me.rank}</b> <span class="dim small">von ${d.total}</span></div><div class="right"><div class="dim small">${d.label}</div><b>${fmtScore(d.unit, me, ctx)}</b></div></div>${me.hidden ? html`<div class="small dim mt">Dein Profil ist privat – du erscheinst nicht in der Liste. Ändern unter „Mein Profil“.</div>` : ''}</div>` : html`<div class="alert info">${icon('info')}<div>Starte ein Leben, um in der Rangliste zu erscheinen.</div></div>`}
    <div class="table-wrap mt"><table class="table rank"><tbody>${d.rows.map((r) => html`<tr class="${r.me ? 'me' : ''}" data-profile="${r.userId}" tabindex="0">
      <td class="rkc">${medal(r.rank)}</td><td><b>${r.name}</b> ${dot(r.online)}<div class="dim small">@${r.username} · ${r.occupation || 'ohne Beruf'}</div></td>
      <td class="dim small hide-sm">${cityName(ctx, r.cityId)} · ${r.year}</td><td class="num"><b>${fmtScore(d.unit, r, ctx)}</b></td></tr>`)}
      ${d.rows.length ? '' : html`<tr><td class="dim">Noch niemand hier – sei der Erste!</td></tr>`}</tbody></table></div>`;
  },
  plaza(ctx, d) {
    const v = d.visit || {}; const tierName = ['kleiner Betrieb', 'mittlerer Betrieb', 'großer Betrieb'];
    return html`<div class="plaza">
      <section class="card chat"><div class="card-title">${icon('landmark')} Stadtplatz ${cityName(ctx, d.cityId)} ${infoBtn(['Hier sprichst du mit den anderen Spielern deiner Stadt – so wie auf dem Marktplatz.', 'Bitte freundlich bleiben: Beleidigungen werden herausgefiltert, Spam führt zur Stummschaltung. Jede Nachricht lässt sich melden.', 'Neue Konten dürfen erst nach kurzer Zeit schreiben.'], 'Stadtplatz')}</div>
        <div class="chatlog" id="chatlog" aria-live="polite">${raw(d.messages.map(chatLine).join('') || '<div class="dim small">Noch ist es still auf dem Platz. Sag Hallo!</div>')}</div>
        <form class="row nowrap" id="chatform"><input id="chatin" type="text" maxlength="${d.chat.maxLen}" placeholder="Nachricht an die Stadt …" autocomplete="off"><button class="btn primary">${icon('send')}</button></form></section>
      <aside class="stack" style="--gap:1rem">
        <section class="card"><div class="card-title">${icon('users')} Gerade hier <span class="chip">${d.online.length}</span></div>
          <div class="stack" style="--gap:.3rem" id="onl">${d.online.map((o) => html`<button class="linkrow" data-profile="${o.userId}"><i class="odot on"></i><span class="grow">${o.name}</span><span class="dim small">${o.occupation || ''}</span></button>`)}${d.online.length ? '' : html`<div class="dim small">Niemand sonst online.</div>`}</div></section>
        <section class="card"><div class="card-title">${icon('store')} Betriebe anderer Spieler</div>
          ${(d.firms || []).length ? html`<div class="stack" style="--gap:.5rem">${d.firms.map((f) => html`<div class="firm"><div class="grow"><b>${f.name}</b><div class="dim small">${tierName[Math.min(2, f.tier)]} · <a href="#/social" data-profile="${f.userId}">${f.owner}</a></div></div>
            ${v.enabled ? html`<button class="btn sm primary" data-visit="${f.userId}:${f.id}" title="+${v.wellbeing[Math.min(2, f.tier)]} Wohlbefinden">${icon('utensils')} ${money(v.price[Math.min(2, f.tier)], ctx.view.currency)}</button>` : ''}</div>`)}</div><p class="dim small mt">Ein Besuch kostet etwas, hebt deine Stimmung – und der Umsatz landet in der Firmenkasse des Besitzers.</p>`
            : html`<div class="dim small">Noch keine Spielerbetriebe in ${cityName(ctx, d.cityId)}. Eröffne selbst eines – andere Spieler können dich dann besuchen!</div>`}</section>
      </aside></div>`;
  },
  letters(ctx, d) {
    return html`<div class="row spread wrap" style="margin-bottom:.8rem"><div class="seg">${[['in', 'Posteingang'], ['out', 'Gesendet']].map((x) => html`<a href="#/social" data-box="${x[0]}" class="${d.box === x[0] ? 'on' : ''}">${x[1]}</a>`)}</div><button class="btn primary sm" id="newletter">${icon('pencil')} Neuer Brief</button></div>
    <div class="table-wrap"><table class="table letters"><tbody>${d.items.map((m) => html`<tr data-letter="${m.id}" class="${m.unread ? 'unread' : ''}" tabindex="0"><td style="width:28px">${m.kind === 'system' ? icon('bell') : icon('mail')}</td><td><b>${m.other}</b> <span class="dim small">${m.kind === 'system' ? '· Mitteilung' : ''}</span><div class="subj">${m.subject}</div><div class="dim small ellip">${m.preview}</div></td><td class="num dim small">${dt(m.at)}</td></tr>`)}
      ${d.items.length ? '' : html`<tr><td class="dim">Keine Briefe.</td></tr>`}</tbody></table></div>
    ${d.pages > 1 ? html`<div class="row center mt">${d.page > 1 ? html`<button class="btn sm" data-pg="${d.page - 1}">←</button>` : ''}<span class="dim small">Seite ${d.page}/${d.pages}</span>${d.page < d.pages ? html`<button class="btn sm" data-pg="${d.page + 1}">→</button>` : ''}</div>` : ''}`;
  },
  friends(ctx, d) {
    const person = (p, extra) => html`<div class="friend"><button class="linkrow grow" data-profile="${p.userId}">${dot(p.online)}<span class="grow"><b>${p.name || p.username}</b><span class="dim small"> @${p.username}</span></span><span class="dim small">${p.cityId ? cityName(ctx, p.cityId) : ''}</span></button>${extra || ''}</div>`;
    return html`<div class="grid c2" style="--gap:1rem">
      <section class="card"><div class="card-title">${icon('users')} Freunde <span class="chip">${d.friends.length}</span></div>
        <div class="stack" style="--gap:.4rem">${d.friends.map((p) => person(p, html`<button class="btn sm ghost" data-letterto="${p.userId}|${esc(p.name || p.username)}" title="Brief">${icon('mail')}</button>`))}${d.friends.length ? '' : html`<div class="dim small">Noch keine Freunde. Suche rechts nach Spielern oder klicke in der Rangliste auf einen Namen.</div>`}</div>
        ${d.incoming.length ? html`<div class="card-title mt">${icon('bell')} Anfragen</div><div class="stack" style="--gap:.4rem">${d.incoming.map((p) => person(p, html`<button class="btn sm primary" data-fr="${p.userId}:1">Annehmen</button><button class="btn sm ghost" data-fr="${p.userId}:0">Ablehnen</button>`))}</div>` : ''}
        ${d.outgoing.length ? html`<div class="card-title mt">Gesendet</div><div class="stack" style="--gap:.4rem">${d.outgoing.map((p) => person(p, html`<span class="chip">wartet</span>`))}</div>` : ''}</section>
      <section class="card"><div class="card-title">${icon('search')} Spieler finden</div>
        <div class="row nowrap"><input id="psearch" type="search" placeholder="Name oder Spielername …" autocomplete="off"></div><div class="stack mt" style="--gap:.4rem" id="pres"><div class="dim small">Mindestens 2 Buchstaben.</div></div></section></div>`;
  },
  me(ctx, d) {
    const p = d.profile; const s = p.stats;
    return html`<div class="grid c2" style="--gap:1rem"><section class="card"><div class="card-title">${icon('user')} So sehen dich andere</div>
        <div class="field"><label>Über mich (max. 240 Zeichen)</label><textarea id="bio" maxlength="240" style="min-height:90px">${d.bio || ''}</textarea></div>
        <label class="check"><input type="checkbox" id="pub" ${d.public ? 'checked' : ''}> Öffentlich sichtbar (Rangliste, Profil, Stadtplatz, Zeitungsmeldungen)</label>
        <div class="hint">Privat heißt: Du erscheinst nirgends – andere können dir aber weiterhin Briefe schreiben.</div>
        <div class="row end mt"><button class="btn primary" id="savebio">Speichern</button></div></section>
      <section class="card"><div class="card-title">${icon('crown')} Deine Platzierungen</div>${s ? html`<div class="pgrid">${Object.entries({ wealth: 'Vermögen', business: 'Unternehmer', politics: 'Politik', dynasty: 'Dynastie', family: 'Familie', time: 'Zeitreise' }).map(([k, l]) => html`<div><small>${l}</small><b>#${p.ranks[k]}</b></div>`)}</div>` : html`<div class="dim">Noch keine Platzierung.</div>`}
        <p class="dim small mt">Die Rangliste vergleicht inflationsbereinigt: 1 DM von 1945 ist die Maßeinheit – so konkurrieren Spieler aus allen Epochen fair.</p></section></div>`;
  },
};

function chatLine(m) { return `<div class="cl ${m.mine ? 'mine' : ''}" data-id="${m.id}"><span class="t">${hhmm(m.at)}</span> <a href="#/social" class="who" data-profile="${m.userId}">${esc(m.name)}</a> <span class="msg">${esc(m.text)}</span>${m.mine ? '' : `<button class="rep" data-rep="${m.id}" title="Melden" aria-label="Melden">⚑</button>`}</div>`; }

export default {
  id: 'social', label: 'Spieler', icon: 'users',
  async load(ctx) {
    const s = ctx.ui.soc = ctx.ui.soc || { tab: 'rank', cat: 'wealth', scope: 'all', box: 'in', page: 1 };
    const tab = s.tab;
    if (tab === 'rank') return { tab, ...(await api('GET', `/api/social/leaderboard?cat=${s.cat}&scope=${s.scope}`)) };
    if (tab === 'plaza') return { tab, ...(await api('GET', '/api/social/chat')) };
    if (tab === 'letters') return { tab, ...(await api('GET', `/api/social/inbox?box=${s.box}&page=${s.page}`)) };
    if (tab === 'friends') return { tab, ...(await api('GET', '/api/social/friends')) };
    return { tab: 'me', ...(await api('GET', '/api/social/me')) };
  },
  render(ctx, d) {
    const tab = d.tab;
    return html`<div class="panel-head"><div><h2>Spieler</h2><p>Messe dich mit anderen, triff Menschen, handle und plaudere – die Welt ist nicht allein deine.</p></div>${infoBtn(['Alle Spieler leben in derselben Welt: Du siehst ihre Betriebe in deiner Stadt, liest über sie in der Zeitung und kannst mit ihnen schreiben, Geschenke tauschen und einander besuchen.', 'Die Rangliste ist inflationsbereinigt, damit 1960 und 2040 vergleichbar bleiben.', 'Du entscheidest selbst, ob du sichtbar bist (Mein Profil).'], 'Spieler')}</div>
    <div class="tabs soc-tabs">${TABS.map((t) => html`<a href="#/social" data-tab="${t[0]}" class="${tab === t[0] ? 'on' : ''}">${icon(t[2])} ${t[1]}${t[0] === 'letters' && ctx.social && ctx.social.unread ? html`<i class="dot">${ctx.social.unread}</i>` : ''}${t[0] === 'friends' && ctx.social && ctx.social.requests ? html`<i class="dot">${ctx.social.requests}</i>` : ''}</a>`)}</div>
    ${views[tab](ctx, d)}`;
  },
  bind(root, ctx, d) {
    const s = ctx.ui.soc;
    const go = () => ctx.rerender();
    on(root, 'click', '[data-tab]', (e, t) => { e.preventDefault(); s.tab = t.dataset.tab; s.page = 1; go(); });
    on(root, 'click', '[data-cat]', (e, t) => { e.preventDefault(); s.cat = t.dataset.cat; go(); });
    on(root, 'click', '[data-scope]', (e, t) => { e.preventDefault(); s.scope = t.dataset.scope; go(); });
    on(root, 'click', '[data-box]', (e, t) => { e.preventDefault(); s.box = t.dataset.box; s.page = 1; go(); });
    on(root, 'click', '[data-pg]', (e, t) => { s.page = Number(t.dataset.pg); go(); });
    on(root, 'click', '[data-profile]', (e, t) => { e.preventDefault(); openProfile(ctx, Number(t.dataset.profile)); });
    on(root, 'keydown', 'tr[data-profile], tr[data-letter]', (e, t) => { if (e.key === 'Enter') t.click(); });
    // Briefe
    const nl = root.querySelector('#newletter'); if (nl) nl.onclick = () => pickRecipient(ctx);
    on(root, 'click', '[data-letter]', async (e, t) => {
      try {
        const { letter } = await api('GET', `/api/social/letter/${t.dataset.letter}`);
        const m = modal(html`<h3>${icon('mail')} ${letter.subject}</h3><div class="dim small">${letter.mine ? 'An ' + letter.to : 'Von ' + letter.from} · ${new Date(letter.at).toLocaleString('de-DE')}</div><div class="letter-body">${letter.body}</div>
          <div class="row end mt">${letter.kind !== 'system' && !letter.mine ? html`<button class="btn ghost sm" data-x="report">${icon('flag')} Melden</button>` : ''}<button class="btn ghost sm" data-x="del">${icon('x')} Löschen</button>${letter.kind !== 'system' && !letter.mine && letter.fromId ? html`<button class="btn primary sm" data-x="reply">${icon('send')} Antworten</button>` : ''}<button class="btn sm" data-close="x">Schließen</button></div>`, { onClose: () => { refreshBadge(ctx); } });
        m.el.addEventListener('click', async (ev) => {
          const x = ev.target.closest('[data-x]'); if (!x) return;
          if (x.dataset.x === 'del') { await api('POST', `/api/social/letter/${letter.id}/delete`, {}); m.close(); go(); }
          else if (x.dataset.x === 'reply') { m.close(); composeLetter(ctx, letter.fromId, letter.from, `Re: ${letter.subject}`.slice(0, 120)); }
          else if (x.dataset.x === 'report') { m.close(); reportDialog(ctx, 'letter', letter.id); }
        });
      } catch (err) { toast(err.message, 'bad'); }
    });
    on(root, 'click', '[data-letterto]', (e, t) => { const [id, name] = t.dataset.letterto.split('|'); composeLetter(ctx, Number(id), name); });
    // Freunde
    on(root, 'click', '[data-fr]', async (e, t) => { const [id, a] = t.dataset.fr.split(':'); try { await api('POST', '/api/social/friends/respond', { userId: Number(id), accept: a === '1' }); toast(a === '1' ? 'Ihr seid jetzt Freunde!' : 'Anfrage abgelehnt.', a === '1' ? 'good' : 'warn'); refreshBadge(ctx); go(); } catch (err) { toast(err.message, 'bad'); } });
    const ps = root.querySelector('#psearch');
    if (ps) { let tm; ps.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(async () => { const q = ps.value.trim(); const box = root.querySelector('#pres'); if (q.length < 2) { box.innerHTML = '<div class="dim small">Mindestens 2 Buchstaben.</div>'; return; } try { const r = await api('GET', `/api/social/search?q=${encodeURIComponent(q)}`); box.innerHTML = r.players.length ? r.players.map((p) => `<button class="linkrow" data-profile="${p.userId}"><span class="grow"><b>${esc(p.name)}</b> <span class="dim small">@${esc(p.username)}</span></span><span class="dim small">${esc(cityName(ctx, p.cityId))}</span></button>`).join('') : '<div class="dim small">Niemand gefunden.</div>'; } catch (err) { box.textContent = err.message; } }, 280); }); }
    // Mein Profil
    const sb = root.querySelector('#savebio'); if (sb) sb.onclick = async () => { try { await api('POST', '/api/social/profile', { bio: root.querySelector('#bio').value, public: root.querySelector('#pub').checked }); toast('Profil gespeichert.'); } catch (err) { toast(err.message, 'bad'); } };
    // Stadtplatz
    const log = root.querySelector('#chatlog');
    if (log) {
      let last = d.messages.length ? d.messages[d.messages.length - 1].id : 0; log.scrollTop = log.scrollHeight;
      const form = root.querySelector('#chatform'); const input = root.querySelector('#chatin');
      form.addEventListener('submit', async (e) => { e.preventDefault(); const text = input.value.trim(); if (!text) return; input.disabled = true; try { await api('POST', '/api/social/chat', { cityId: d.cityId, text }); input.value = ''; await poll(); } catch (err) { toast(err.message, 'warn'); } finally { input.disabled = false; input.focus(); } });
      async function poll() {
        if (!log.isConnected) return;
        try {
          const r = await api('GET', `/api/social/chat?after=${last}`);
          if (r.messages.length) { const note = log.querySelector('.dim.small'); if (note && !log.querySelector('.cl')) note.remove(); const atEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 60; log.insertAdjacentHTML('beforeend', r.messages.map(chatLine).join('')); last = r.messages[r.messages.length - 1].id; if (atEnd) log.scrollTop = log.scrollHeight; while (log.children.length > 120) log.firstChild.remove(); }
          const onl = root.querySelector('#onl'); if (onl) onl.innerHTML = r.online.map((o) => `<button class="linkrow" data-profile="${o.userId}"><i class="odot on"></i><span class="grow">${esc(o.name)}</span><span class="dim small">${esc(o.occupation || '')}</span></button>`).join('') || '<div class="dim small">Niemand sonst online.</div>';
        } catch (_) { /* nächster Versuch */ }
      }
      const iv = setInterval(() => { if (!log.isConnected) { clearInterval(iv); return; } if (!document.hidden) poll(); }, 5000);
      on(root, 'click', '[data-rep]', (e, t) => reportDialog(ctx, 'chat', Number(t.dataset.rep)));
      on(root, 'click', '[data-visit]', async (e, t) => {
        const [owner, company] = t.dataset.visit.split(':').map(Number); t.disabled = true;
        try { const r = await api('POST', '/api/social/visit', { owner, company }); ctx.setView(r.view); toast(r.message); ctx.hud(); if (window.TPMotion) window.TPMotion.confetti(); } catch (err) { toast(err.message, 'bad'); } finally { t.disabled = false; }
      });
    }
  },
};

async function pickRecipient(ctx) {
  const m = modal(html`<h3>${icon('mail')} An wen?</h3><input id="rq" type="search" placeholder="Name oder Spielername …" autofocus><div class="stack mt" style="--gap:.4rem" id="rr"><div class="dim small">Mindestens 2 Buchstaben – oder wähle einen Freund unter „Freunde“.</div></div>`);
  const input = m.el.querySelector('#rq'); let tm;
  input.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(async () => { const q = input.value.trim(); const box = m.el.querySelector('#rr'); if (q.length < 2) return; try { const r = await api('GET', `/api/social/search?q=${encodeURIComponent(q)}`); box.innerHTML = r.players.map((p) => `<button class="linkrow" data-to="${p.userId}|${esc(p.name)}"><b>${esc(p.name)}</b> <span class="dim small">@${esc(p.username)}</span></button>`).join('') || '<div class="dim small">Niemand gefunden.</div>'; } catch (e) { box.textContent = e.message; } }, 280); });
  m.el.addEventListener('click', (e) => { const b = e.target.closest('[data-to]'); if (!b) return; const [id, name] = b.dataset.to.split('|'); m.close(); composeLetter(ctx, Number(id), name); });
}
async function refreshBadge(ctx) { try { const r = await api('GET', '/api/social/summary'); ctx.social = r; ctx.hud(); } catch (_) { /* egal */ } }
