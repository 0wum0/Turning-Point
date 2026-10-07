import { html, icon, money, infoBtn, bar, on, api, num, yearsText, modal } from '../ui.js';
import { paginate } from '../paginate.js';
import { openProfile } from './social.js';

const LONG = 520;
const teaser = (t) => { const first = String(t).split(/\n{2,}/)[0].trim(); return first.length > 260 ? `${first.slice(0, 260).replace(/\s+\S*$/, '')} …` : `${first} …`; };

/** Leser mit Blätter-Funktion für lange Meldungen. */
function openReader(n, e) {
  const pages = paginate(n.text); let i = 0;
  const kicker = n.type === 'custom' ? (n.flash ? e.kickers.flash : e.kickers.custom) : '';
  const m = modal(html`<div class="reader paper ${e.medium === 'web' ? 'web' : ''}">
    <div class="reader-head"><span class="reader-mast">${e.masthead} · ${e.dateLabel}</span><button class="btn ghost sm" data-close="x" aria-label="Schließen">${icon('x')}</button></div>
    ${kicker ? html`<div class="kicker ${n.flash ? 'flash' : ''}">${kicker}</div>` : ''}
    <h3>${n.title}</h3>
    <div class="reader-body" id="rBody" tabindex="0"></div>
    <div class="reader-nav"><button class="btn" id="rPrev">${icon('chevron-left')} Zurück</button><div class="reader-dots" id="rDots"></div><button class="btn primary" id="rNext">Weiter ${icon('chevron-right')}</button></div>
  </div>`, { wide: true });
  const body = m.el.querySelector('#rBody'); const dots = m.el.querySelector('#rDots');
  const prev = m.el.querySelector('#rPrev'); const next = m.el.querySelector('#rNext');
  const show = (k) => {
    const back = k < i; i = Math.max(0, Math.min(pages.length - 1, k));
    body.classList.remove('turn', 'back'); void body.offsetWidth; body.classList.add('turn'); if (back) body.classList.add('back');
    body.innerHTML = pages[i].split(/\n{2,}/).map((p) => `<p>${p.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])}</p>`).join('');
    body.scrollTop = 0;
    dots.textContent = pages.length > 1 ? `Seite ${i + 1} von ${pages.length}` : '';
    prev.disabled = i === 0; next.disabled = i === pages.length - 1;
    prev.style.visibility = pages.length > 1 ? '' : 'hidden'; next.style.visibility = pages.length > 1 ? '' : 'hidden';
  };
  prev.onclick = () => show(i - 1); next.onclick = () => show(i + 1);
  const key = (ev) => { if (ev.key === 'ArrowRight' || ev.key === 'PageDown') show(i + 1); else if (ev.key === 'ArrowLeft' || ev.key === 'PageUp') show(i - 1); };
  document.addEventListener('keydown', key);
  const mo = new MutationObserver(() => { if (!document.body.contains(m.el)) { document.removeEventListener('keydown', key); mo.disconnect(); } });
  mo.observe(document.body, { childList: true });
  show(0);
}

const TABS = ['news', 'jobs', 'housing', 'partners', 'biz', 'guide'];

function jobCard(j, v, here) {
  const cur = v.currency;
  const isCurrent = v.occupation && v.occupation.pkey === j.pkey && v.occupation.employer === j.employer;
  return html`<article class="listing">
    <div class="lic">${icon(j.icon || 'briefcase', 'lg')}</div>
    <div class="grow">
      <div class="row nowrap spread"><h4>${j.profession}</h4><span class="chip ${j.kind === 'training' ? 'info' : 'good'}">${j.kind === 'training' ? 'Lehrstelle' : 'Stelle'}</span></div>
      <div class="dim small">${j.employer}</div>
      <div class="row small" style="margin-top:.4rem">
        <b class="mono">${money(j.wage, cur)} / Tag</b>
        ${j.kind === 'training' ? html`<span class="chip">${icon('graduation-cap')} ${yearsText(j.trainingDays)} · kostenlos</span>` : ''}
        ${j.lodging ? html`<span class="chip accent">${icon('bed')} Schlafplatz</span>` : ''}
      </div>
    </div>
    <button class="btn ${isCurrent ? '' : 'primary'} sm" data-act="apply" data-id="${j.id}" ${(!here || isCurrent) ? 'disabled' : ''}>${isCurrent ? 'Aktuell' : j.kind === 'training' ? 'Ausbildung starten' : 'Bewerben'}</button>
  </article>`;
}

function housingCard(h, v, here) {
  const cur = v.currency;
  if (h.type === 'sale') {
    const afford = v.money >= h.price;
    return html`<article class="listing">
      <div class="lic">${icon(h.kind === 'villa' ? 'castle' : 'house', 'lg')}</div>
      <div class="grow"><div class="row nowrap spread"><h4>${h.name}</h4><span class="chip accent">Kauf</span></div>
        <div class="dim small">${h.rooms} Zimmer · Zustand ${h.condition} %</div>${bar(h.condition, h.condition < 50 ? 'bad' : 'good')}
        <div class="row small" style="margin-top:.4rem"><b class="mono">${money(h.price, cur)}</b>${!afford ? html`<span class="chip bad">${money(h.price - v.money, cur)} fehlen</span>` : ''}</div></div>
      <button class="btn primary sm" data-act="buy" data-id="${h.id}" ${(!here || !afford) ? 'disabled' : ''}>Kaufen</button></article>`;
  }
  const cur2 = v.housing.name === h.name && v.housing.type === h.type;
  return html`<article class="listing">
    <div class="lic">${icon(h.type === 'pension' ? 'hotel' : 'house', 'lg')}</div>
    <div class="grow"><div class="row nowrap spread"><h4>${h.name}</h4><span class="chip">${h.type === 'pension' ? 'Pension' : 'Miete'}</span></div>
      <div class="dim small">${h.type === 'pension' ? '1 Zimmer · täglich' : h.rooms + ' Zimmer'}</div>
      <div class="row small" style="margin-top:.4rem"><b class="mono">${money(h.perDay, cur)} / Tag</b><span class="dim">≈ ${money(h.perDay * 30, cur)} / Monat</span></div></div>
    <button class="btn ${cur2 ? '' : 'primary'} sm" data-act="rent" data-id="${h.id}" ${(!here || cur2) ? 'disabled' : ''}>${cur2 ? 'Du wohnst hier' : 'Beziehen'}</button></article>`;
}

function bizCard(b, v, here) {
  const afford = v.money >= b.price;
  return html`<article class="listing"><div class="lic">${icon('store', 'lg')}</div>
    <div class="grow"><div class="row nowrap spread"><h4>${b.name}</h4><span class="chip accent">${b.tierName}</span></div>
      <div class="dim small">${b.rooms} Räume · benötigt: ${b.profession}${b.minLevel ? ' (Stufe ' + ['Anfänger', 'Geselle', 'Fachkraft', 'Meister', 'Altmeister'][b.minLevel] + ')' : ''}</div>
      <div class="row small" style="margin-top:.4rem"><b class="mono">${money(b.price, v.currency)}</b>${!b.qualified ? html`<span class="chip bad">Qualifikation fehlt</span>` : ''}${!afford ? html`<span class="chip bad">${money(b.price - v.money, v.currency)} fehlen</span>` : ''}</div></div>
    <button class="btn primary sm" data-act="buyBiz" data-id="${b.id}" ${(!here || !afford || !b.qualified) ? 'disabled' : ''}>Kaufen</button></article>`;
}

function partnerCard(p, v, here) {
  return html`<article class="listing">
    <div class="lic">${icon('heart', 'lg')}</div>
    <div class="grow"><div class="row nowrap spread"><h4>${p.name}, ${p.age}</h4><span class="chip">${p.profession}</span></div>
      <div class="dim small">„…${p.blurb}“</div></div>
    <button class="btn primary sm" data-act="meet" data-id="${p.id}" ${!here ? 'disabled' : ''}>Treffen</button></article>`;
}

export default {
  id: 'newspaper', label: 'Zeitung', icon: 'newspaper',
  async load(ctx) {
    const cityId = ctx.ui.newsCity || ctx.view.city.id;
    const r = await api('GET', `/api/newspaper?cityId=${cityId}`);
    return r;
  },
  render(ctx, data) {
    const v = ctx.view; const e = data.edition; const here = data.here;
    const tab = TABS.includes(ctx.ui.newsTab) ? ctx.ui.newsTab : 'news';
    const web = e.medium === 'web';
    const L = e.labels;
    const pn = (e.playerNews || []).map((n) => ({ type: 'player', section: n.section, title: n.title, text: n.text, ago: Math.max(0, Math.floor((Date.now() - new Date(n.at).getTime()) / 3600000)), userId: n.userId, username: n.username }));
    const list = [...e.news.filter((n) => n.type === 'custom'), ...pn, ...e.news.filter((n) => n.type !== 'custom')]; data._list = list;
    const tabs = [['news', L.news, 'newspaper'], ['jobs', L.jobs, 'briefcase'], ['housing', L.housing, 'house'], ['partners', L.partners, 'heart'], ['biz', L.biz, 'store'], ['guide', 'Ratgeber', 'lightbulb']];
    const body = {
      news: () => html`<div class="news-grid">${list.length ? list.map((n, i) => html`<article class="news-item ${n.type === 'forecast' ? 'warn' : ''} ${n.type === 'player' ? 'player' : ''} ${n.flash ? 'flash' : ''} ${i === 0 ? 'lead' : ''}">
          <div class="kicker">${n.type === 'player' ? `SPIELERWELT · ${String(n.section || 'Lokales').toUpperCase()} · ${n.ago < 1 ? 'GERADE EBEN' : n.ago < 24 ? 'VOR ' + n.ago + ' STD.' : 'VOR ' + Math.floor(n.ago / 24) + ' TAGEN'}` : n.type === 'press' ? `${String(n.section || 'Lokales').toUpperCase()} · ${n.ago === 0 ? 'HEUTE' : n.ago === 1 ? 'GESTERN' : 'VOR ' + n.ago + ' TAGEN'}` : n.type === 'custom' ? (n.flash ? e.kickers.flash : e.kickers.custom) : n.type === 'forecast' ? 'WARNUNG' : n.ago === 0 ? 'HEUTE' : n.ago === 1 ? 'GESTERN' : 'VOR ' + n.ago + ' TAGEN'}</div>
          <h3>${n.title}</h3>${n.type === 'player' ? html`<p>${n.text}</p><a href="#/newspaper" class="small plink" data-profile="${n.userId}">${icon('user')} Profil von @${n.username}</a>` : String(n.text).length > LONG ? html`<p>${teaser(n.text)}</p><button class="btn sm read-more" data-read="${i}">${icon('book-open')} Weiterlesen · ${paginate(n.text).length} Seiten</button>` : html`<p class="pl">${n.text}</p>`}</article>`) : html`<article class="news-item lead"><div class="kicker">${e.quiet.kicker}</div><h3>${e.quiet.title}</h3><p>${e.quiet.text}</p></article>`}</div>`,
      jobs: () => html`${(e.playerJobs || []).length ? html`<div class="card flat mt-s player-jobs"><div class="card-title">${icon('users')} Gesucht von Spielern <button class="btn sm ghost" data-gosoc="jobs" style="margin-left:auto">alle ansehen</button></div><div class="stack" style="--gap:.4rem">${e.playerJobs.map((o) => html`<div class="row spread small"><span><b>${o.title}</b> · ${o.firm} <span class="dim">(${o.owner})</span></span><span class="chip accent">${money(o.wage, v.currency)}/Tag</span></div>`)}</div></div>` : ''}<div class="listings">${e.jobs.map((j) => jobCard(j, v, here))}</div>`,
      housing: () => html`<h4 class="sec">Pensionen &amp; Zimmer</h4><div class="listings">${e.housing.pension.map((h) => housingCard(h, v, here))}</div>
        <h4 class="sec">Mietwohnungen</h4><div class="listings">${e.housing.rent.map((h) => housingCard(h, v, here))}</div>
        <h4 class="sec">Zu verkaufen</h4><div class="listings">${e.housing.sale.map((h) => housingCard(h, v, here))}</div>`,
      partners: () => v.partner ? html`<div class="empty-note">${icon('heart')}<span>Du bist mit ${v.partner.name} zusammen.</span></div>` : html`<p class="dim">Ein Treffen kostet eine kleine Aufmerksamkeit. Ob es funkt, hängt von deiner Stimmung, deiner Lage und etwas Glück ab.</p><div class="listings">${e.partners.map((p) => partnerCard(p, v, here))}</div>`,
      biz: () => e.biz.length ? html`<p class="dim">Betriebe darfst du nur mit passender Qualifikation führen. Die Angebote richten sich nach deinen Berufen (und dem deines Partners).</p><div class="listings">${e.biz.map((b) => bizCard(b, v, here))}</div>` : html`<div class="empty-note">${icon('store')}<span>Gerade keine passenden Betriebe. Mit einem erlernten Beruf (z. B. Wirt, Bäcker, Tischler) erscheinen hier Angebote.</span></div>`,
      guide: () => html`<div class="grid c2">${e.tutorial.length ? e.tutorial.map((t) => html`<article class="card flat"><h4>${t.title} ${infoBtn(t.info, t.title)}</h4><p class="dim small mb0">${t.text}</p></article>`) : html`<div class="dim">Der Ratgeber ist ausgeblendet.</div>`}</div>
        <div class="row mt"><button class="btn sm ghost" data-act="tutorial" data-on="${e.tutorial.length ? '0' : '1'}">${e.tutorial.length ? 'Ratgeber ausblenden' : 'Ratgeber wieder einblenden'}</button></div>`,
    }[tab]();
    return html`
    <div class="panel-head"><div><h2>${web ? 'Das Netz' : 'Die Zeitung'}</h2><p>${web ? 'Jobs, Immobilien, Kontakte und Nachrichten – seit 2002 online.' : 'Stellen, Wohnungen, Kontakte und Neuigkeiten aus deiner Stadt.'}</p></div>
      <div class="field mb0"><label class="sr" for="nCity">Stadt</label><select id="nCity">${ctx.world.cities.map((c) => html`<option value="${c.id}" ${c.id === e.city.id ? 'selected' : ''}>${c.name}${c.id === v.city.id ? ' (dein Wohnort)' : ''}</option>`)}</select></div></div>
    ${!here ? html`<div class="alert info">${icon('info')}<div>Du liest die Ausgabe aus <b>${e.city.name}</b>. Um dort zu arbeiten oder zu wohnen, musst du erst umziehen (Karte).</div></div>` : ''}
    <section class="paper ${web ? 'web' : ''}">
      ${web ? html`<div class="browser-bar"><i></i><i></i><i></i><span>www.${e.city.name.toLowerCase().replace(/[^a-zäöüß]+/g, '-')}-netz.de</span></div>` : ''}
      <header class="masthead"><div class="mast-small">${e.dateLabel} · ${e.edition}</div><h1>${e.masthead}</h1><div class="mast-small">${e.city.name}, ${e.city.state}</div></header>
      <nav class="paper-tabs">${tabs.map((t) => html`<button class="${t[0] === tab ? 'on' : ''}" data-tab="${t[0]}">${icon(t[2])} ${t[1]}</button>`)}</nav>
      <div class="paper-body">${body}</div>
    </section>`;
  },
  bind(root, ctx, data) {
    on(root, 'click', '[data-gosoc]', (ev, t) => { ctx.ui.soc = ctx.ui.soc || {}; ctx.ui.soc.tab = t.dataset.gosoc; ctx.go('social'); });
    on(root, 'click', '[data-profile]', (ev, t) => { ev.preventDefault(); openProfile(ctx, Number(t.dataset.profile)); });
    on(root, 'click', '[data-read]', (ev, t) => { const n = data._list[Number(t.dataset.read)]; if (n) openReader(n, data.edition); });
    on(root, 'click', '[data-tab]', (e, t) => { ctx.ui.newsTab = t.dataset.tab; ctx.rerender(); });
    root.querySelector('#nCity').addEventListener('change', (e) => { ctx.ui.newsCity = Number(e.target.value); ctx.rerender(); });
    on(root, 'click', '[data-act]', async (e, t) => {
      const name = t.dataset.act;
      const input = name === 'tutorial' ? { on: t.dataset.on === '1' } : { listingId: t.dataset.id };
      if (name === 'buyBiz') { const ok = await ctx.confirm({ title: 'Betrieb kaufen?', text: 'Der Kaufpreis wird sofort abgebucht. Du kannst zuerst selbst im Betrieb arbeiten und später Mitarbeiter und Manager einsetzen.', ok: 'Kaufen' }); if (!ok) return; }
      if (name === 'buy') { const ok = await ctx.confirm({ title: 'Immobilie kaufen?', text: 'Der Kaufpreis wird sofort vom Konto abgebucht. Ein Kauf gibt EFS-Bonus und gehört zu deinem vererbbaren Vermögen.', ok: 'Kaufen' }); if (!ok) return; }
      if (name === 'apply' && ctx.view.occupation && ctx.view.occupation.kind !== 'work') { const ok = await ctx.confirm({ title: 'Ausbildung/Studium abbrechen?', text: 'Du hast aktuell eine Ausbildung oder ein Studium. Ein Wechsel beendet es – Fortschritt geht verloren.', ok: 'Wechseln', danger: true }); if (!ok) return; }
      await ctx.act(name, input);
    });
  },
};
