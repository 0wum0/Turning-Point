import { html, icon, money, moneyShort, signed, infoBtn, bar, on, num, yearsText } from '../ui.js';
import { cityScene } from '../scene.js';

const LEVEL_ICON = { good: 'circle-check', warn: 'triangle-alert', bad: 'circle-alert', info: 'info' };

export function sceneFor(ctx, cityId, owned) {
  const v = ctx.view;
  const c = ctx.world.cityById.get(cityId) || { id: cityId, name: '', tier: 3 };
  if (c.image) return html`<img class="scene" src="/media/${c.image}" alt="${c.name}">`;
  return cityScene({ id: c.id, name: c.name, tier: c.tier, era: v.date.eraKey, owned: owned || [] });
}

function noticeRow(n, cur) {
  return html`<li class="notice ${n.level} ${n.seen ? 'seen' : ''}" data-id="${n.id}">
    <span class="nic">${icon(LEVEL_ICON[n.level] || 'info')}</span>
    <div class="grow"><b>${n.title}</b><div class="dim small">${n.text}</div></div>
    <div class="row nowrap">${n.tab ? html`<button class="btn sm ghost" data-go="${n.tab}">Ansehen</button>` : ''}${infoBtn(n.info, n.title)}</div>
  </li>`;
}

export default {
  id: 'overview', label: 'Übersicht', icon: 'home',
  render(ctx) {
    const v = ctx.view; const cur = v.currency; const f = v.flows;
    const here = v.properties.filter((p) => p.cityId === v.city.id);
    const runway = f.net < 0 ? Math.floor(v.money / -f.net) : null;
    const pool = v.efs.pool;
    const unseen = v.notices.filter((n) => !n.seen).length;
    return html`
    <section class="card scene-card">
      ${sceneFor(ctx, v.city.id, here)}
      <div class="scene-overlay">
        <div>
          <span class="chip accent">${icon('clock')} ${v.date.era}</span>
          <h2 class="scene-title">${v.city.name}</h2>
          <div class="dim">${v.city.state} · ${v.housing.label}${v.housing.name && v.housing.name !== v.housing.label ? ' – ' + v.housing.name : ''}</div>
        </div>
        <div class="scene-date"><b>${v.date.label}</b><span>${v.person.age} Jahre · Generation ${v.generation}</span></div>
      </div>
      ${v.hints.length ? html`<div class="hint-row">${v.hints.map((h) => html`<button class="chip ${h.level}" data-go="${h.target}">${icon(h.level === 'bad' ? 'circle-alert' : 'lightbulb')} ${h.text}</button>`)}</div>` : ''}
    </section>
    ${ctx.social && ctx.social.rank ? html`<div class="soc-strip mt"><button class="chip accent" data-go="social">${icon('crown')} Platz ${ctx.social.rank.wealth} von ${ctx.social.rank.total} · Vermögen</button><button class="chip" data-go="social">${icon('users')} ${ctx.social.rank.onlineHere} Spieler online in ${v.city.name}</button>${ctx.social.unread ? html`<button class="chip bad" data-go="social">${icon('mail')} ${ctx.social.unread} neue${ctx.social.unread === 1 ? 'r Brief' : ' Briefe'}</button>` : ''}${ctx.social.requests ? html`<button class="chip warn" data-go="social">${icon('users')} ${ctx.social.requests} Freundschaftsanfrage${ctx.social.requests === 1 ? '' : 'n'}</button>` : ''}</div>` : ''}

    <div class="grid c3 mt" style="--gap:1rem">
      <section class="card">
        <div class="card-title">${icon('wallet')} Finanzen ${infoBtn(['Hier siehst du, was täglich hereinkommt und was abgeht.', 'Fällt dein Konto unter null, endet das Spiel sofort (Insolvenz).', 'Halte Einnahmen über den Ausgaben, spare für Notfälle und prüfe Versicherungen.'], 'Finanzen')}</div>
        <div class="big-money">${money(v.money, cur)}</div>
        <div class="dim small">Vermögen gesamt: <b>${moneyShort(v.worth, cur)}</b></div>
        <hr>
        <dl class="kv small">
          <dt>Einnahmen / Tag</dt><dd class="pos">${money(f.income, cur)}</dd>
          <dt>Ausgaben / Tag</dt><dd class="neg">${money(f.expense, cur)}</dd>
          <dt>Essen / Tag (~)</dt><dd class="neg">${money(v.food.tiers[1].perDay, cur)}</dd>
          <dt><b>Bilanz / Tag</b></dt><dd class="${f.net - v.food.tiers[1].perDay >= 0 ? 'pos' : 'neg'}">${signed(f.net - v.food.tiers[1].perDay, cur)}</dd>
        </dl>
        ${runway !== null && runway < 40 ? html`<div class="alert warn mt small">${icon('triangle-alert')}<div>Bei diesem Tempo reicht dein Geld nur noch ca. ${runway} Tage.</div></div>` : ''}
      </section>

      <section class="card">
        <div class="card-title">${icon('briefcase')} Beruf &amp; Zuhause</div>
        ${v.occupation ? html`<div class="stack" style="--gap:.2rem"><b class="serif" style="font-size:1.2rem">${v.occupation.name}</b>
            <div class="dim small">${v.occupation.kind === 'training' ? 'Auszubildender' : v.occupation.kind === 'study' ? 'Student' : v.occupation.level} bei ${v.occupation.employer}</div>
            ${v.occupation.kind !== 'work' ? html`<div class="small">noch ${yearsText(v.occupation.daysLeft)}</div>` : ''}</div>`
          : html`<div class="empty-note">${icon('search')} <span>Kein Beruf – in der Zeitung nach Arbeit suchen.</span> <button class="btn sm" data-go="newspaper">Zeitung</button></div>`}
        <hr>
        <div class="stack" style="--gap:.2rem"><div class="row nowrap">${icon(v.housing.icon, 'lg')}<div><b>${v.housing.label}</b><div class="dim small">${v.housing.type === 'street' ? 'Kein Dach – Gesundheit sinkt täglich' : v.housing.perDay ? money(v.housing.perDay, cur) + ' / Tag' : 'Keine Miete'}</div></div></div>
        <div class="dim small">Zimmer: ${v.rooms.have} vorhanden · ${v.rooms.need} benötigt</div></div>
      </section>

      <section class="card time-card">
        <div class="card-title">${icon('zap')} EFS – deine Zeit ${infoBtn(['EFS sind Erfahrung, Fortschritt und Zeit in einem: 1 EFS = 1 Spieltag, 365 EFS = 1 Jahr.', `Pro Tag kommen ${v.efs.daily} EFS automatisch, ${v.efs.login} weitere beim ersten Login. Auch offline läuft das Leben weiter.`, 'Spule die Zeit vor, wenn du bereit bist – oder sammle auf der Karte mehr EFS.'], 'EFS')}</div>
        <div class="big-money" style="color:var(--accent-2)">${num(pool)} <small>EFS</small></div>
        <div class="dim small">entspricht ${yearsText(pool)} Lebenszeit</div>
        <div class="adv-grid mt">
          ${[1, 7, 30, 365].map((d) => html`<button class="btn" data-advance="${d}" ${pool < d ? 'disabled' : ''}>${icon('fast-forward')} ${d === 365 ? '1 Jahr' : d === 1 ? '1 Tag' : d + ' Tage'}</button>`)}
        </div>
        <button class="btn primary block mt" data-advance="max" ${pool < 1 ? 'disabled' : ''}>${icon('play')} Alles vorspulen</button>
        ${pool < 1 ? html`<div class="dim small mt">Nächstes EFS in ca. ${Math.max(1, Math.round(86400 / v.efs.daily / 60))} Min. · <a href="#/map" data-go="map">Karte</a> · <a href="#/shop" data-go="shop">Werbung ansehen</a></div>` : ''}
      </section>
    </div>

    <section class="card mt">
      <div class="row spread wrap"><div class="card-title" style="margin:0">${icon('users')} Mitspieler</div>
        <div class="row wrap"><a class="btn sm" href="#/social" data-social="rank">${icon('crown')} Rangliste</a><a class="btn sm" href="#/social" data-social="plaza">${icon('landmark')} Stadtplatz-Chat</a><a class="btn sm ghost" href="#/social" data-social="friends">${icon('users')} Freunde</a></div></div>
    </section>
    <section class="card mt">
      <div class="panel-head" style="margin-bottom:.6rem"><div class="card-title" style="margin:0">${icon('bell')} Postfach ${unseen ? html`<span class="badge">${unseen}</span>` : ''}</div>
        ${unseen ? html`<button class="btn sm ghost" id="readAll">Alle gelesen</button>` : ''}</div>
      ${v.notices.length ? html`<ul class="notices">${v.notices.slice(0, 12).map((n) => noticeRow(n, cur))}</ul>` : html`<div class="dim">Keine Meldungen.</div>`}
    </section>

    <section class="card mt legacy-strip">
      <div class="row spread"><div class="card-title" style="margin:0">${icon('flag')} Weg ins ${Math.floor(v.legacy.target / 100) + 1}. Jahrhundert</div><span class="dim small">${v.date.year} → ${v.legacy.target}</span></div>
      ${bar(v.legacy.progress * 100)}
    </section>`;
  },
  bind(root, ctx) {
    root.querySelectorAll('[data-social]').forEach((a) => a.addEventListener('click', () => { const so = ctx.ui.soc = ctx.ui.soc || { cat: 'wealth', scope: 'all', box: 'in', page: 1 }; so.tab = a.dataset.social; }));
    on(root, 'click', '[data-go]', (e, t) => { e.preventDefault(); ctx.go(t.dataset.go); });
    on(root, 'click', '[data-advance]', (e, t) => ctx.advance(t.dataset.advance === 'max' ? 'max' : Number(t.dataset.advance), t));
    const ra = root.querySelector('#readAll'); if (ra) ra.addEventListener('click', () => ctx.act('readNotices', {}, { silent: true }));
  },
};
