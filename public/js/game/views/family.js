import { html, icon, money, infoBtn, bar, on, modal, yearsText } from '../ui.js';
import { childTalent, schoolFitMark, bindChildTalents, talentBars, fitChip } from '../talents.js';

const STATUS = { home: 'zu Hause', runaway: 'weggelaufen', care: 'Jugendhilfe', withPartner: 'beim Ex-Partner' };

function childCard(c, v) {
  const cur = v.currency;
  return html`<article class="card child ${c.status}">
    <div class="row nowrap spread"><div class="row nowrap"><div class="avatar ${c.gender}">${c.name.slice(0, 1)}</div><div><h4 class="mb0" data-i18n-skip>${c.name}</h4><div class="dim small">${c.age} Jahre · ${c.city || ''}</div></div></div>
      <span class="chip ${c.status === 'home' ? 'good' : 'bad'}">${STATUS[c.status] || c.status}</span></div>
    ${c.status === 'home' ? html`<div class="mt small">Zufriedenheit ${c.sat} %</div>${bar(c.sat, c.sat < 40 ? 'bad' : 'good')}
      <div class="small mt dim">${c.school ? html`${icon('school')} ${c.schoolName}` : c.path === 'training' ? html`${icon('hammer')} Ausbildung: ${c.profession} (noch ${yearsText(c.daysLeft)})` : c.path === 'study' ? html`${icon('graduation-cap')} Studium: ${c.profession} (noch ${yearsText(c.daysLeft)})` : c.path === 'done' ? html`${icon('badge-check')} ${c.profession}` : c.age < 6 ? 'noch zu klein für die Schule' : c.pendingSchool ? '' : c.path === 'none' ? 'ohne weitere Ausbildung' : ''}</div>
      ${c.pendingSchool ? html`<div class="alert warn mt small">${icon('lightbulb')}<div><b>Schulwahl:</b> Welche Schule soll ${c.name} besuchen?<div class="row mt">${[['haupt', 'Hauptschule'], ['real', 'Realschule'], ['gym', 'Gymnasium']].map((s) => html`<button class="btn sm" data-school="${c.id}" data-type="${s[0]}">${s[1]} ${schoolFitMark(c, s[0])}</button>`)}</div></div></div>` : ''}
      ${c.pendingPath ? html`<div class="alert warn mt small">${icon('lightbulb')}<div><b>Wie geht es weiter?</b><div class="row mt"><button class="btn sm primary" data-path="${c.id}">Ausbildung / Studium wählen</button><button class="btn sm" data-nopath="${c.id}">Nichts</button></div></div></div>` : ''}
      ${childTalent(c, v)}
      <div class="row mt"><button class="btn sm" data-gift="${c.id}">${icon('gift')} Geschenk</button></div>`
    : c.status === 'runaway' ? html`<div class="alert bad mt small">${icon('siren')}<div>Noch ${c.searchLeft} Tage, um ${c.name} zu finden. Sonst zieht das Kind dauerhaft in eine Jugendhilfeeinrichtung.<div class="row mt"><button class="btn sm primary" data-search="${c.id}">${icon('search')} Suchen</button></div></div></div>`
    : c.status === 'care' ? html`<div class="dim small mt">Bleibt im Stammbaum. Du zahlst weiter Unterhalt.</div>` : ''}
  </article>`;
}

export default {
  id: 'family', label: 'Familie', icon: 'users',
  render(ctx) {
    const v = ctx.view; const p = v.partner; const cur = v.currency;
    return html`
    <div class="panel-head"><div><h2>Familie</h2><p>Partner, Kinder und die Zukunft deines Vermächtnisses.</p></div>
      ${infoBtn(['Die Familie ist das Herz des Spiels. Partner und Kinder müssen regelmäßig zufrieden gestellt werden – aber nicht täglich.', 'Ist ein Partner dauerhaft sehr unzufrieden, geht er und nimmt die Hälfte des Vermögens und der Kinder mit. Ohne volljähriges Kind gibt es keinen Erben: Game Over.', 'Geschenke, gemeinsame Zeit, gutes Essen, genug Zimmer und ein schönes Zuhause helfen.'], 'Familie')}</div>

    <section class="card ${p && p.sat < 45 ? '' : 'glow'}">
      <div class="card-title">${icon('heart')} Partnerschaft</div>
      ${p ? html`<div class="row nowrap spread"><div class="row nowrap"><div class="avatar ${p.gender}">${p.name.slice(0, 1)}</div><div><h3 class="mb0" data-i18n-skip>${p.name}</h3><div class="dim small">${p.age} Jahre · ${p.profession} · ${p.married ? 'verheiratet' : 'Partner(in)'} · ${p.cohabit ? 'wohnt bei dir' : 'wohnt woanders'}</div></div></div></div>
        <div class="mt small">Zufriedenheit ${p.sat} %</div>${bar(p.sat, p.sat < 45 ? 'bad' : 'good')}
        ${p.tal ? html`<details class="mt small"><summary>${icon('sparkles')} <span>Talente von</span> <span data-i18n-skip>${p.name.split(' ')[0]}</span></summary>${talentBars(p.tal, { compact: true })}</details>` : ''}
        <div class="row mt">
          <button class="btn sm" data-p="gift">${icon('gift')} Geschenk · ${money(Math.round(400 * v.idx), cur)}</button>
          <button class="btn sm" data-p="together" ${p.canTogether ? '' : 'disabled'}>${icon('sparkles')} Gemeinsame Zeit</button>
          ${!p.married ? html`<button class="btn sm" data-p="marry">${icon('party-popper')} Heiraten · ${money(Math.round(2500 * v.idx), cur)}</button>` : ''}
          ${v.adoption && v.adoption.pending != null ? html`<button class="btn sm ghost" data-p="adoptCancel" title="Antrag zurückziehen">${icon('baby')} Adoption läuft · noch ca. ${Math.ceil(v.adoption.pending / 30)} Mon.</button>` : (p.married && p.cohabit && !p.linked ? html`<button class="btn sm" data-p="adopt" ${v.adoption && v.adoption.block ? 'disabled' : ''} title="${v.adoption && v.adoption.block ? v.adoption.block : 'Ein Kind adoptieren (Verfahren dauert etwa fünf Monate)'}">${icon('baby')} Kind adoptieren · ${money(v.adoption ? v.adoption.cost : 0, cur)}</button>` : '')}
          <label class="row nowrap" style="margin-left:auto;gap:.5rem">${infoBtn(['Hier legst du fest, wie viele Kinder ihr euch wünscht. Kinder kommen nur, solange diese Zahl nicht erreicht ist.', 'Jedes Kind kostet Lebensmittel, Zimmer, Schule und Lebenshaltung. Das Kindergeld deckt nur etwa die Hälfte. Dafür gibt es einmalig Coins und spätere Erben.', 'Stelle die Wunsch-Kinderzahl passend zu deinem Einkommen und deinem Wohnraum ein.'], 'Kinderwunsch')}<span class="dim small">Wunsch-Kinderzahl</span><select id="plan" style="width:auto;padding:.35rem 2rem .35rem .7rem">${Array.from({ length: v.maxChildren + 1 }, (_, i) => html`<option value="${i}" ${i === v.plan.target ? 'selected' : ''}>${i}</option>`)}</select></label>
        </div>`
      : html`<div class="empty-note">${icon('heart')}<span>Du lebst allein. In der Zeitung (Kontakte) findest du Menschen, die jemanden suchen.</span><button class="btn sm primary" data-go="newspaper">Kontakte ansehen</button></div>`}
    </section>

    <div class="panel-head mt2"><div><h3 style="font-size:1.5rem">Kinder (${v.children.length} / ${v.maxChildren})</h3><p>Zimmer: ${v.rooms.have} vorhanden, ${v.rooms.need} benötigt. Kindergeld deckt etwa die Hälfte der Kosten.</p></div></div>
    ${v.children.length ? html`<div class="grid auto" style="--gap:1rem">${v.children.map((c) => childCard(c, v))}</div>`
      : html`<div class="card flat empty-note">${icon('baby')}<span>Noch keine Kinder. Kinder bringen einmalig Coins, Kindergeld und später die Erben deiner Familie.</span></div>`}`;
  },
  bind(root, ctx) {
    bindChildTalents(root, ctx);
    on(root, 'click', '[data-go]', (e, t) => ctx.go(t.dataset.go));
    on(root, 'click', '[data-p]', (e, t) => ctx.act(t.dataset.p, {}));
    const plan = root.querySelector('#plan'); if (plan) plan.addEventListener('change', (e) => ctx.act('plan', { target: Number(e.target.value) }, { noRender: true }));
    on(root, 'click', '[data-school]', (e, t) => ctx.act('school', { childId: t.dataset.school, type: t.dataset.type }));
    on(root, 'click', '[data-nopath]', (e, t) => ctx.act('path', { childId: t.dataset.nopath, kind: 'none' }));
    on(root, 'click', '[data-gift]', (e, t) => ctx.act('giftChild', { childId: t.dataset.gift }));
    on(root, 'click', '[data-search]', (e, t) => ctx.act('search', { childId: t.dataset.search }));
    on(root, 'click', '[data-path]', (e, t) => {
      const id = t.dataset.path; const v = ctx.view; const c = v.children.find((x) => String(x.id) === id); const w = ctx.world;
      const fits = (c.tal && c.tal.fits) || {};
      const byFit = (a, b) => (fits[b.key] || 0) - (fits[a.key] || 0);
      const trainings = w.professions.filter((p) => !p.academic && p.key !== 'helfer' && p.from <= v.date.year && v.date.year <= p.to).sort(byFit);
      const top = new Set(trainings.slice(0, 3).filter((p) => (fits[p.key] || 0) >= 55).map((p) => p.key));
      const fitTag = (p) => (fits[p.key] != null ? html`<small class="${top.has(p.key) ? 'tal-pass' : 'dim'}">${top.has(p.key) ? html`${icon('sparkles')} <span>passt zu Begabung</span> ` : ''}${fits[p.key]} %</small>` : '');
      const m = modal(html`<h3>Weg für ${c.name}</h3><p class="dim small">Ausbildung kostet nichts. Ein Studium kostet täglich Gebühren und setzt das Gymnasium voraus${c.schoolDone === 'gym' ? '' : ' (nicht erfüllt)'}.</p>
        <h4>Ausbildung</h4><div class="grid c2" style="--gap:.5rem">${trainings.map((p) => html`<button class="btn" data-pick="training:${p.key}">${icon(p.icon)} ${p.name}<small class="dim">${yearsText(p.days)}</small>${fitTag(p)}</button>`)}</div>
        ${c.schoolDone === 'gym' ? html`<h4 class="mt">Studium</h4><div class="grid c3" style="--gap:.5rem">${w.academic.slice().sort(byFit).map((p) => html`<button class="btn" data-pick="study:${p.key}">${icon(p.icon)} ${p.name}${fitTag(p)}</button>`)}</div>` : ''}
        <div class="row end mt"><button class="btn ghost" data-close="x">Abbrechen</button></div>`, { wide: true });
      m.el.addEventListener('click', async (e) => { const b = e.target.closest('[data-pick]'); if (!b) return; const [kind, key] = b.dataset.pick.split(':'); m.close(); await ctx.act('path', { childId: id, kind, pkey: key }); });
    });
  },
};
