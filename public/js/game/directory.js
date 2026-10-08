/* Stadtverzeichnis: Einwohner, Häuser und Betriebe einer Stadt (nur sichtbare Spieler), mit Suche und Seiten. */
import { html, raw, icon, api, on, money, mount, esc, roleBadge } from './ui.js';
import { openProfile } from './views/social.js';

const TABS = [['people', 'Einwohner', 'users'], ['houses', 'Häuser', 'house'], ['firms', 'Betriebe', 'store']];

export function directorySkeleton(ctx, cityId) {
  const d = ctx.ui.dir = ctx.ui.dir && ctx.ui.dir.cityId === cityId ? ctx.ui.dir : { cityId, tab: 'people', q: '', page: 1 };
  return html`<section class="card dir-card mt" id="dir"><div class="row spread wrap"><div class="card-title" style="margin:0">${icon('book-open')} Stadtverzeichnis</div>
    <div class="seg">${TABS.map((t) => html`<a href="#/city" data-dtab="${t[0]}" class="${d.tab === t[0] ? 'on' : ''}">${icon(t[2])} ${t[1]}</a>`)}</div></div>
    <div class="field mt"><input id="dirq" type="search" placeholder="Suchen …" value="${d.q}" autocomplete="off"></div>
    <div id="dirBody"><div class="skel" style="height:120px"></div></div></section>`;
}

const kindIcon = (k) => (k === 'villa' ? 'castle' : k === 'flat' ? 'building-2' : 'house');
const KIND = { flat: 'Eigentumswohnung', house_small: 'Kleines Haus', house_large: 'Großes Haus', villa: 'Villa' };

export function bindDirectory(root, ctx, cityId) {
  const d = ctx.ui.dir; const v = ctx.view; const cur = v.currency; const k = v.idx || 1;
  const body = root.querySelector('#dirBody'); if (!body) return;
  const profName = (key) => { const p = (ctx.world.professions || []).find((x) => x.key === key); return p ? p.name : key; };
  const m = (real) => money(Math.round(real * k), cur);
  const owner = (i) => html`<a href="#/city" data-profile="${i.userId}">${i.owner}</a>${roleBadge(i.role)}`;
  const row = {
    people: (i) => html`<div class="dir-row"><button class="linkrow grow" data-profile="${i.userId}"><i class="odot ${i.online ? 'on' : ''}"></i><span class="grow"><b>${i.name}</b> ${roleBadge(i.role)} <span class="dim small">@${i.username}</span><div class="dim small">${i.occupation || 'ohne Beruf'} · ${i.year}${i.companies ? ' · ' + i.companies + ' Betrieb(e)' : ''}${i.properties ? ' · ' + i.properties + ' Immobilie(n)' : ''}</div></span></button><b class="mono">${m(i.wealth)}</b></div>`,
    houses: (i) => html`<div class="dir-row"><span class="dir-ic">${icon(kindIcon(i.kind))}</span><div class="grow"><b>${i.name}</b><div class="dim small">${i.rooms} Zimmer · Zustand ${i.cond} % · Eigentümer: ${owner(i)}</div>
      <div class="row small" style="margin-top:.25rem">${i.residence ? html`<span class="chip">Wohnsitz</span>` : ''}${i.rent != null ? html`<span class="chip ${i.tenant ? 'good' : 'warn'}">${i.tenant ? 'vermietet' : 'zu vermieten'} · ${m(i.rent)} / Tag</span>` : ''}${i.ask != null ? html`<span class="chip accent">Zu verkaufen · ${m(i.ask)}</span>` : ''}</div></div>
      <div class="right"><b class="mono">${m(i.value)}</b><div class="small dim">Wert</div>${i.mine ? '' : html`<button class="btn sm mt" data-offer="prop:${i.userId}:${i.propId}">Angebot</button>`}</div></div>`,
    firms: (i) => html`<div class="dir-row"><span class="dir-ic">${icon('store')}</span><div class="grow"><b>${i.name}</b><div class="dim small">${profName(i.pkey)} · ${i.rooms} Räume · ${i.staff} Mitarbeiter · Inhaber: ${owner(i)}</div>
      <div class="row small" style="margin-top:.25rem">${i.abandoned ? html`<span class="chip bad">verlassen</span>` : i.distress ? html`<span class="chip warn">in Schieflage</span>` : i.profit > 0 ? html`<span class="chip good">läuft gut</span>` : html`<span class="chip">ausgeglichen</span>`}${i.ask != null ? html`<span class="chip accent">Zu verkaufen · ${m(i.ask)}</span>` : ''}${roleBadge('')}</div></div>
      <div class="right"><b class="mono">${m(i.value)}</b><div class="small dim">Wert · Gewinn ${m(i.profit)} / Tag</div>${i.mine ? '' : html`<button class="btn sm mt" data-offer="firm:${i.userId}:${i.id}">Angebot</button>`}</div></div>`,
  };
  let seq = 0;
  async function load() {
    const my = ++seq;
    root.querySelectorAll('[data-dtab]').forEach((a) => a.classList.toggle('on', a.dataset.dtab === d.tab));
    let r;
    try { r = await api('GET', `/api/social/directory?cityId=${cityId}&tab=${d.tab}&q=${encodeURIComponent(d.q)}&page=${d.page}`); } catch (e) { mount(body, html`<div class="dim">${e.message}</div>`); return; }
    if (my !== seq) return;
    mount(body, html`<div class="dim small" style="margin:.2rem 0 .6rem">${r.total} ${d.tab === 'people' ? 'Einwohner' : d.tab === 'houses' ? 'Häuser' : 'Betriebe'}${d.q ? ' gefunden' : ''} · Beträge in heutigen Preisen</div>
      <div class="dir-list">${r.items.map(row[d.tab])}${r.items.length ? '' : html`<div class="dim small">Nichts gefunden. Nur Spieler mit sichtbarem Profil erscheinen hier.</div>`}</div>
      ${r.pages > 1 ? html`<div class="row center mt">${r.page > 1 ? html`<button class="btn sm" data-dpage="${r.page - 1}">←</button>` : ''}<span class="dim small">Seite ${r.page}/${r.pages}</span>${r.page < r.pages ? html`<button class="btn sm" data-dpage="${r.page + 1}">→</button>` : ''}</div>` : ''}`);
  }
  on(root, 'click', '[data-dtab]', (e, t) => { e.preventDefault(); d.tab = t.dataset.dtab; d.page = 1; load(); });
  on(root, 'click', '[data-dpage]', (e, t) => { d.page = Number(t.dataset.dpage); load(); });
  on(root, 'click', '#dirBody [data-profile]', (e, t) => { e.preventDefault(); openProfile(ctx, Number(t.dataset.profile)); });
  on(root, 'click', '[data-offer]', (e, t) => { import('./market.js').then((mod) => mod.openOffer(ctx, t.dataset.offer, () => load())); });
  const q = root.querySelector('#dirq'); let tm; q.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(() => { d.q = q.value.trim(); d.page = 1; load(); }, 280); });
  load();
}
