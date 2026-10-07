import { html, icon, infoBtn, api, on, bar, moneyShort } from '../ui.js';

function yearOfDay(v, day) { const start = v.date.year - Math.floor(v.date.day / 365); return start + Math.floor(day / 365); }

function treeHtml(v, ctx) {
  const persons = v.tree.persons; const byId = new Map(persons.map((p) => [p.id, p]));
  const seen = new Set();
  const cityName = (id) => (ctx.world.cityById.get(id) || {}).label;
  const card = (p) => {
    const by = yearOfDay(v, p.born); const dy = p.died != null && p.died >= 0 ? yearOfDay(v, p.died) : (p.died === -1 ? 1945 : null);
    const cls = [p.status, p.id === v.person.id ? 'me' : '', p.gender].join(' ');
    return html`<div class="tcard ${cls}"><div class="avatar ${p.gender}">${p.name.slice(0, 1)}</div><div><b>${p.name}</b>
      <div class="dim small">${by}${dy ? ' – ' + dy : ' –'}${p.bornCity ? ' · ' + cityName(p.bornCity) : ''}</div>
      ${p.jobs && p.jobs.length ? html`<div class="small">${p.jobs.join(', ')}</div>` : ''}${p.note ? html`<div class="small faint">${p.note}</div>` : ''}</div></div>`;
  };
  const kidsOf = (ids) => persons.filter((x) => x.parents && x.parents.some((id) => ids.includes(id)) && !seen.has(x.id));
  const node = (p) => {
    if (seen.has(p.id)) return '';
    seen.add(p.id);
    const q = p.partnerId ? byId.get(p.partnerId) : null;
    if (q) seen.add(q.id);
    const ids = [p.id].concat(q ? [q.id] : []);
    const kids = kidsOf(ids);
    return html`<li><div class="couple">${card(p)}${q ? html`<span class="heart">${icon('heart')}</span>${card(q)}` : ''}</div>${kids.length ? html`<ul>${kids.map((k) => node(k))}</ul>` : ''}</li>`;
  };
  const roots = persons.filter((p) => p.role === 'parent' && p.gender === 'm');
  return html`<ul class="tree">${roots.map((r) => node(r))}</ul>`;
}

export default {
  id: 'legacy', label: 'Vermächtnis', icon: 'git-fork',
  async load() { return api('GET', '/api/archive'); },
  render(ctx, data) {
    const v = ctx.view;
    const cycles = {};
    data.lives.forEach((l) => { (cycles[l.cycle] = cycles[l.cycle] || []).push(l); });
    return html`
    <div class="panel-head"><div><h2>Vermächtnis</h2><p>Der Stammbaum deiner Familie – ein historisches Archiv über alle Generationen.</p></div>
      ${infoBtn(['Der Stammbaum dokumentiert Geburten, Berufe, Ehen, Trennungen, Erbschaften und Todesfälle.', 'Coins, Abschlüsse und Familiengeschichte bleiben als Meta-Fortschritt erhalten – auch wenn eine Linie endet.', 'Spiele bis ins 22. Jahrhundert, um den großen Zyklus zu vollenden.'], 'Vermächtnis')}</div>
    <div class="grid c3" style="--gap:1rem">
      <section class="card flat"><div class="card-title">Generation</div><div class="big-money">${v.generation}</div><div class="dim small">Zyklus ${v.cycle}</div></section>
      <section class="card flat"><div class="card-title">Weg ins 22. Jahrhundert</div><div class="big-money">${Math.round(v.legacy.progress * 100)} %</div>${bar(v.legacy.progress * 100)}</section>
      <section class="card flat"><div class="card-title">Gesamtvermögen</div><div class="big-money">${moneyShort(v.worth, v.currency)}</div><div class="dim small">Höchststand Konto ${moneyShort(v.stats.peakWorth, v.currency)}</div></section>
    </div>
    <section class="card mt tree-card"><div class="card-title">${icon('git-fork')} Familienstammbaum</div><div class="tree-scroll">${treeHtml(v, ctx)}</div></section>
    <div class="grid c2 mt" style="--gap:1rem">
      <section class="card"><div class="card-title">${icon('scroll')} Chronik</div>
        <ol class="chron">${v.tree.events.map((e) => html`<li><span class="y">${yearOfDay(v, e.day)}</span><span>${e.text}</span></li>`)}</ol></section>
      <section class="card"><div class="card-title">${icon('layers')} Frühere Leben</div>
        ${Object.keys(cycles).length ? Object.keys(cycles).map((c) => html`<div class="cycle"><b>Zyklus ${c}</b>${cycles[c].map((l) => html`<div class="row spread small"><span>Gen. ${l.generation}: ${l.name}</span><span class="dim">${l.status === 'alive' ? 'lebt (' + l.year + ')' : (l.end_reason || 'beendet') + ' · ' + l.year}</span></div>`)}</div>`) : html`<div class="dim">Noch keine früheren Leben.</div>`}
      </section>
    </div>`;
  },
  bind() {},
};
