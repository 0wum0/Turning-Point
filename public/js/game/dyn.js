/* Werben, Ehe und Familienunternehmen (Oberfläche): Bekanntschaften pflegen, Antrittsbesuch und Antrag, Hochzeit mit Ehevertrag und Eheringen, Scheidung,
 * Kinder im Familienbetrieb einarbeiten, Übergabe zu Lebzeiten, Traditionsbetrieb und Dynastie-Wertung.
 * Daten kommen fertig vom Server (view.fam). Die Seiten sind für Design V2 und das Standarddesign dieselben; die Knöpfe rufen ausschließlich Spielaktionen des
 * Servers auf (meet, wooAct, wooVisit, wooAsk, wooDrop, marry, divorce, divorceCancel, famGroom, famGroomEnd, famHandover). Zahlen stehen in eigenen Elementen. */
import { html, icon, money, infoBtn, bar, on, modal, confirmBox, term, yearsText } from './ui.js';
import { isOpen } from './onboarding.js';

const lang = () => document.documentElement.lang;
const dec = (x, d = 0) => (Math.round(x * 10 ** d) / 10 ** d).toLocaleString(lang() === 'en' ? 'en-US' : 'de-DE', { maximumFractionDigits: d });
const STAGE = { bekannt: ['Bekannt', ''], verabredet: ['Verabredet', 'accent'], nah: ['Bereit für den Antrag', 'good'] };
const BAND_TONE = { skeptisch: 'bad', aufgeschlossen: '', angetan: 'good', begeistert: 'gold' };
const DYN_TONE = ['', '', 'good', 'good', 'gold', 'gold'];

/* ------------------------------------------------------------------ Bekanntschaften ------------------------------------------------------------------ */
function actButton(e, a, cur) {
  const why = a.ok ? a.text : a.why;
  return html`<button class="btn sm ${a.best ? 'primary' : ''}" data-woo-act="${e.id}:${a.key}" ${a.ok ? '' : 'disabled'} title="${why}">${icon(a.icon)} <span>${a.label}</span>${a.cost ? html` <span class="mono">${money(a.cost, cur)}</span>` : ''}${a.wait ? html` <small class="dim mono">${a.wait} <span>T.</span></small>` : ''}</button>`;
}

function wooCard(e, v) {
  const cur = v.currency; const st = STAGE[e.stage] || STAGE.bekannt;
  return html`<article class="card woo" data-woo="${e.id}">
    <div class="row nowrap spread"><div class="row nowrap"><div class="avatar ${e.gender}" aria-hidden="true">${e.first.slice(0, 1)}</div><div><h4 class="mb0" data-i18n-skip>${e.name}</h4><div class="dim small"><span data-i18n-skip>${e.age}</span> <span>Jahre</span> · <span data-i18n-skip>${e.profession}</span></div></div></div>
      <span class="chip ${st[1]}" data-woo-stage="${e.stage}">${st[0]}</span></div>
    <div class="row spread small mt"><span>${term('Sympathie', 'Sympathie')}</span><b class="mono">${e.sym} %</b></div>${bar(e.sym, e.sym < 30 ? 'warn' : 'good')}
    <div class="row wrap small mt"><span class="dim"><span>Vorlieben:</span></span>${e.likes.map((l) => (l.known ? html`<span class="chip good">${l.label}</span>` : html`<span class="chip" title="Noch unbekannt – probiere verschiedene Aufmerksamkeiten aus">?</span>`))}
      <span class="chip ${BAND_TONE[e.opinionBand] || ''}" title="So denkt die Familie über dich">${icon('users')} ${term('Familienmeinung', 'Familienmeinung')}: <b>${e.opinionBand}</b></span>
      ${e.visited && e.className ? html`<span class="chip" title="Herkunftsfamilie">${icon('house')} ${e.className}</span>` : ''}</div>
    <div class="small dim mt"><span data-i18n-skip>${e.hits}</span> <span>gelungene Treffen · seit</span> ${yearsText(e.since)}${e.idleDays > 20 ? html` · <span>zuletzt gesehen vor</span> <span data-i18n-skip>${e.idleDays}</span> <span>Tagen</span>` : ''}</div>
    <div class="row wrap mt" role="group" aria-label="Aufmerksamkeiten">
      <button class="btn sm primary" data-woo-best="${e.id}" ${e.best ? '' : 'disabled'}>${icon('sparkles')} <span>Beste Wahl</span></button>
      ${e.acts.map((a) => actButton(e, a, cur))}
    </div>
    <div class="row wrap mt">
      <button class="btn sm" data-woo-visit="${e.id}" ${e.visit.ok ? '' : 'disabled'} title="${e.visit.why || 'Die Familie kennenlernen: sie lässt dich in die Herkunft blicken und stimmt freundlicher.'}">${icon('house')} <span>Antrittsbesuch</span> <span class="mono">${money(e.visit.cost, cur)}</span></button>
      <button class="btn sm ${e.askBlock ? '' : 'primary'}" data-woo-ask="${e.id}" ${e.askBlock ? 'disabled' : ''} title="${e.askBlock || 'Frag, ob ihr ein Paar werden wollt.'}">${icon('heart')} <span>Antrag stellen</span>${e.askBlock ? '' : html` <span class="mono">${e.askChance} %</span>`}</button>
      <button class="btn sm ghost" data-woo-drop="${e.id}">${icon('x')} <span>Kontakt beenden</span></button>
    </div>
    ${e.askBlock ? html`<div class="small dim mt">${icon('info')} <span>${e.askBlock}</span></div>` : ''}
    ${e.hist.length ? html`<div class="small mt"><b><span>Zuletzt:</span></b> ${e.hist.slice(0, 4).map((h) => html`<span class="chip small ${h.res === 2 ? 'good' : h.res === 0 ? 'bad' : ''}">${h.label} <span class="mono">${h.delta >= 0 ? '+' : ''}${dec(h.delta)}</span></span> `)}</div>` : ''}
  </article>`;
}

/** Karte „Bekanntschaften“ auf der Familienseite (ohne Partner). */
export function wooSection(ctx) {
  const v = ctx.view; const f = v.fam; if (!f || !f.on || v.partner) return '';
  return html`<section class="card glow" data-woo-box>
    <div class="row spread nowrap"><div class="card-title" style="margin:0">${icon('heart')} <span>Bekanntschaften</span> <span class="dim small">(<span data-i18n-skip>${f.woo.length}</span> / <span data-i18n-skip>${f.maxActive}</span>)</span></div>
      ${infoBtn(['Statt eines einzigen Wurfs gibt es jetzt einen Verlauf: Kennenlernen, Treffen, Aufmerksamkeiten, Gespräche – und irgendwann den Antrag.', 'Jede Person hat zwei Vorlieben (zum Beispiel Kultur oder Natur). Was ihr gefällt, siehst du an der Reaktion. Charme, Bildung und Verhandlungsgeschick helfen, dein Auftreten und dein Rang auch. Zwischen den Treffen braucht es ein paar Tage Pause; wer sich zu lange nicht meldet, wird vergessen.', 'Tippe auf „Beste Wahl“ – wir wählen die passende Aufmerksamkeit für dich. Mit einem Antrittsbesuch lernst du die Familie kennen.'], 'Werben')}</div>
    ${f.woo.length ? html`<div class="grid auto mt" style="--gap:1rem">${f.woo.map((e) => wooCard(e, v))}</div>`
      : html`<div class="empty-note mt">${icon('heart')}<span>Du lebst allein. In der Zeitung (Kontakte) findest du Menschen, die jemanden suchen. Ein erstes Treffen ist der Anfang – daraus wächst eine Bekanntschaft.</span><button class="btn sm primary" data-go="newspaper">Kontakte ansehen</button></div>`}
  </section>`;
}

/* ------------------------------------------------------------------ Hochzeit und Ehevertrag ------------------------------------------------------------------ */
function dowryText(d, cur) {
  if (!d) return html`<span>Keine Aussteuer.</span>`;
  if (d.taken) return html`<span>Eine Aussteuer gibt es nur einmal pro Leben.</span>`;
  if (d.form === 'firm') return html`<span>Aussteuer: der Familienbetrieb</span> <b data-i18n-skip>${d.firm ? d.firm.name : ''}</b> <span>(Wert</span> <span class="mono">${money(d.value, cur)}</span><span>)</span>`;
  if (d.form === 'home') return html`<span>Aussteuer: eine Wohnung</span> <b data-i18n-skip>${d.home || ''}</b> <span>(Wert</span> <span class="mono">${money(d.value, cur)}</span><span>)</span>`;
  if (d.cash > 0) return html`<span>Aussteuer:</span> <b class="mono">${money(d.cash, cur)}</b>${d.limited ? html` <span>(durch dein Vermögen begrenzt)</span>` : ''}`;
  return html`<span>Keine Aussteuer</span> <span class="dim">(<span data-i18n-skip>${d.className}</span>)</span>`;
}

export function openMarry(ctx) {
  const v = ctx.view; const f = v.fam; const cur = v.currency; const c = f.contract; const p = v.partner;
  const body = () => html`<h3>Hochzeit mit <span data-i18n-skip>${p.name.split(' ')[0]}</span></h3>
    <p class="dim small">Wähle den Güterstand und die Eheringe. Wer nichts wählt, heiratet im gesetzlichen Güterstand ohne Ringe. ${f.family ? html`<span>Die Familie:</span> <b data-i18n-skip>${f.family.name}</b>.` : ''}</p>
    <h4><span>Ehevertrag</span> ${infoBtn(['Der Güterstand regelt, wer bei einer Scheidung was bekommt.', 'Zugewinngemeinschaft: Wer in der Ehe mehr dazugewonnen hat (inflationsbereinigt), gibt dem Partner die Hälfte des Unterschieds ab. Gütertrennung: Jeder behält das Seine, die Familie gibt aber nur die halbe Aussteuer. Mitgift: Die Familie bringt mehr ein, bei einer Scheidung fällt die Mitgift an sie zurück.', 'Unternehmer wählen oft die Gütertrennung, damit der Betrieb bei einer Scheidung nicht geteilt wird.'], 'Ehevertrag')}</h4>
    <div class="stack" style="--gap:.5rem">${c.kinds.map((k, i) => html`<label class="card flat dyn-kind"><div class="row nowrap"><input type="radio" name="contract" value="${k.key}" ${i === 0 ? 'checked' : ''}> <b>${k.name}</b> <span class="dim small">${k.short}</span></div>
      <div class="small mt">${k.text}</div>
      <div class="small mt">${k.notary ? html`<span>Notar:</span> <b class="mono">${money(k.notary, cur)}</b> · ` : html`<span>Kein Notar nötig</span> · `}${dowryText(k.dowry, cur)}</div></label>`)}</div>
    <h4 class="mt"><span>Eheringe</span></h4>
    <div class="stack" style="--gap:.4rem">${c.rings.map((r, i) => html`<label class="card flat dyn-kind"><div class="row nowrap spread"><span class="row nowrap"><input type="radio" name="ring" value="${r.lv}" ${i === 0 ? 'checked' : ''}> <b>${r.name}</b></span>${r.lv ? html`<b class="mono">${money(r.price, cur)}</b>` : ''}</div>
      <div class="small dim">${r.text}${r.lv ? html` <span>Zählt als Schmuck: Auftreten +</span><span class="mono">${dec(r.look)}</span><span>. Nicht verkäuflich, wird vererbt.</span>` : ''}</div></label>`)}</div>
    <div class="row spread mt"><span><span>Hochzeit</span> <b class="mono">${money(c.wedCost, cur)}</b></span><b>Gesamt: <span class="mono" id="dynTotal">${money(c.wedCost, cur)}</span></b></div>
    <div class="row end mt"><button class="btn ghost" data-close="x">Abbrechen</button><button class="btn primary" id="dynMarryGo">${icon('party-popper')} <span>Heiraten</span></button></div>`;
  const m = modal(body(), { wide: true });
  const total = () => {
    const k = c.kinds.find((x) => x.key === (m.el.querySelector('input[name=contract]:checked') || {}).value) || c.kinds[0];
    const r = c.rings.find((x) => String(x.lv) === (m.el.querySelector('input[name=ring]:checked') || {}).value) || c.rings[0];
    const t = c.wedCost + k.notary + r.price; const el = m.el.querySelector('#dynTotal'); if (el) el.textContent = money(t, cur);
    const go = m.el.querySelector('#dynMarryGo'); if (go) go.disabled = v.money < t;
  };
  m.el.addEventListener('change', total); total();
  m.el.querySelector('#dynMarryGo').addEventListener('click', async () => {
    const k = (m.el.querySelector('input[name=contract]:checked') || {}).value || 'zugewinn'; const r = Number((m.el.querySelector('input[name=ring]:checked') || {}).value || 0);
    m.close(); await ctx.act('marry', { contract: k, ring: r });
  });
  return m;
}

/** Block „Ehe“ in der Partnerkarte: Ehevertrag, Ringe, Herkunftsfamilie, Scheidung. */
export function marriageBlock(ctx) {
  const v = ctx.view; const f = v.fam; const p = v.partner; if (!f || !f.on || !p || p.linked) return '';
  const cur = v.currency; const c = f.contract;
  const ct = c.current;
  const dv = c.divorce;
  return html`<div class="dyn-marriage mt" data-dyn-marriage>
    ${f.family ? html`<div class="row wrap small"><span class="chip">${icon('users')} <span>Herkunft:</span> <b data-i18n-skip>${f.family.name}</b></span><span class="chip ${BAND_TONE[f.family.opinion >= 75 ? 'begeistert' : f.family.opinion >= 55 ? 'angetan' : f.family.opinion >= 35 ? 'aufgeschlossen' : 'skeptisch']}">${term('Familienmeinung', 'Familienmeinung')}: <b class="mono">${f.family.opinion}</b></span>
      ${c.ring ? html`<span class="chip gold" data-dyn-ring>${icon('gem')} <b data-i18n-skip>${c.ring.name}</b></span>` : ''}</div>` : ''}
    ${p.married && ct ? html`<div class="small mt">${icon('scroll')} <span>Ehevertrag:</span> <b>${ct.name}</b>${ct.dowry && ct.dowry.real > 0 ? html` · <span>Aussteuer</span> <span class="mono">${money(Math.round(ct.dowry.real * v.idx), cur)}</span>` : ''}
      ${ct.rule && ct.kind === 'zugewinn' ? html` · <span>bei Scheidung zu zahlen (heute):</span> <b class="mono" data-dyn-owed>${money(ct.rule.owed, cur)}</b>` : ''}</div>` : ''}
    ${p.married && !ct ? html`<div class="small dim mt">${icon('info')} <span>Diese Ehe wurde vor dem Ehevertrag geschlossen. Bei einer Trennung gilt die alte Regel: Die Hälfte des Vermögens geht an den Partner.</span></div>` : ''}
    <div class="row wrap mt">
      ${!p.married ? html`<button class="btn sm primary" data-dyn-marry="1">${icon('party-popper')} <span>Heiraten – mit Ehevertrag</span> <span class="mono">${money(c.wedCost, cur)}</span></button>` : ''}
      ${p.married && dv.pending == null ? html`<button class="btn sm ghost" data-dyn-divorce="1" title="Nach einem Trennungsjahr wird die Ehe geschieden.">${icon('scale')} <span>Scheidung beantragen</span> <span class="mono">${money(dv.cost, cur)}</span></button>` : ''}
      ${p.married && dv.pending != null ? html`<button class="btn sm ghost" data-dyn-divorce-cancel="1">${icon('refresh-cw')} <span>Antrag zurückziehen</span> <small class="dim"><span>noch</span> <span class="mono">${dv.pending}</span> <span>Tage</span></small></button>` : ''}
    </div>
  </div>`;
}

/* ------------------------------------------------------------------ Kinder im Familienbetrieb, Übergabe ------------------------------------------------------------------ */
const kidOf = (v, id) => ((v.fam && v.fam.kids) || []).find((k) => k.id === id) || null;

/** Block im Kinder-Karte: Einarbeitung, Nachfolger, übergebene Betriebe, Übergabe. */
export function kidBlock(c, v) {
  const f = v.fam; if (!f || !f.on) return '';
  const k = kidOf(v, c.id); if (!k) return '';
  const cur = v.currency; const g = k.groom;
  if (!g && !k.estate.length && !(k.options.length && f.groomOn)) return '';
  return html`<div class="dyn-kid mt" data-dyn-kid="${c.id}">
    <div class="small"><b>${icon('store')} <span>Im Familienbetrieb</span></b> ${infoBtn(['Kinder können im eigenen Betrieb eingearbeitet werden: Sie lernen den Beruf (Lehre) oder arbeiten als Fachkraft mit, ihre Talente wachsen, und die Berufserfahrung bleibt ihnen als Erben.', 'Die Vergütung zahlt der Betrieb. Ein bereiter Nachfolger bekommt den Betrieb im Pflichtanteil mit Abschlag angerechnet.', 'Ab einem Alter von 55 Jahren kannst du einen Betrieb schon zu Lebzeiten übergeben – mit Steuer und Gebühren, aber ohne Streit um den Nachlass.'], 'Familienbetrieb')}</div>
    ${g ? html`<div class="row wrap small mt"><span class="chip ${g.ready ? 'good' : 'accent'}">${icon('hammer')} <b data-i18n-skip>${g.firm}</b> · ${g.kind === 'lehre' ? html`<span>Lehre</span>` : html`<span>Mitarbeit</span>`}</span>
      ${g.ready ? html`<span class="chip good" data-dyn-ready>${icon('badge-check')} <span>Nachfolger bereit</span></span>` : html`<span class="dim"><span class="mono">${dec(g.days)}</span> <span>Tage im Betrieb</span>${g.kind === 'nachfolge' ? html` <span>(bereit nach</span> <span class="mono">${dec(g.readyAt)}</span><span>)</span>` : ''}</span>`}
      ${g.grown ? html`<span class="chip">${icon('trending-up')} <span>Talent</span> <b class="mono">+${g.grown}</b></span>` : ''}
      <button class="btn sm ghost" data-dyn-groom-end="${c.id}">${icon('x')} <span>Einarbeitung beenden</span></button></div>` : ''}
    ${k.estate.map((e) => html`<div class="small mt card flat" data-dyn-estate="${e.id}"><div class="row spread"><b data-i18n-skip>${icon('store')} ${e.name}</b><span class="chip gold">${icon('crown')} <span>führt den Betrieb</span></span></div>
      <div class="row wrap dim"><span>Wert</span> <span class="mono">${money(e.value, cur)}</span> · <span>Kasse</span> <span class="mono">${money(e.cash, cur)}</span> · <span>Altenteil bisher</span> <span class="mono">${money(e.altenteil, cur)}</span></div></div>`)}
    <div class="row wrap mt">
      ${!g && k.canGroom && k.options.length ? html`<button class="btn sm" data-dyn-groom="${c.id}" ${k.options.some((o) => o.ok) ? '' : 'disabled'}>${icon('hammer')} <span>Im Familienbetrieb einarbeiten</span></button>` : ''}
      ${k.options.length && f.handover.on && c.age >= f.handover.childMinAge ? html`<button class="btn sm" data-dyn-hand="${c.id}">${icon('handshake')} <span>Betrieb übergeben</span></button>` : ''}
    </div>
  </div>`;
}

function pickFirm(ctx, c, k, mode) {
  const v = ctx.view; const cur = v.currency; const first = c.name.split(' ')[0];
  const rows = k.options.map((o) => {
    const h = o.handover; const ok = mode === 'groom' ? o.ok : h.ok; const why = mode === 'groom' ? o.why : h.why;
    return html`<button class="btn" data-pick="${o.id}" ${ok ? '' : 'disabled'} title="${why || ''}" style="text-align:left;display:block;width:100%"><div class="row spread nowrap"><b data-i18n-skip>${icon('store')} ${o.name}</b>${mode === 'groom' ? html`<span class="chip">${o.kind === 'lehre' ? html`<span>Lehre</span>` : html`<span>Mitarbeit</span>`}</span>` : html`<span class="mono">${money(h.value, cur)}</span>`}</div>
      <div class="small dim">${mode === 'groom' ? html`<span data-i18n-skip>${o.profession}</span>` : html`<span>Steuer</span> <span class="mono">${money(h.tax, cur)}</span> · <span>Gebühren</span> <span class="mono">${money(h.fee, cur)}</span> · <span>Verschonung</span> <span class="mono">${h.relief} %</span> · <span>Freibetrag</span> <span class="mono">${money(h.free, cur)}</span>`}</div>${ok ? '' : html`<div class="small warn">${why}</div>`}</button>`;
  });
  const m = modal(html`<h3>${mode === 'groom' ? html`<span>Einarbeiten:</span> <span data-i18n-skip>${first}</span>` : html`<span>Übergabe an</span> <span data-i18n-skip>${first}</span>`}</h3>
    <p class="dim small">${mode === 'groom' ? html`<span>Wähle den Betrieb. Qualifizierte Kinder arbeiten als Fachkraft mit, die übrigen machen eine Lehre im Betrieb. Der Betrieb zahlt die Vergütung.</span>` : html`<span>Der Betrieb gehört danach deinem Kind und läuft weiter. Du erhältst als Altenteil</span> <span class="mono">${v.fam.handover.altenteilPct} %</span> <span>des Tagesgewinns. Die Übergabe wird im Pflichtanteil angerechnet.</span>`}</p>
    <div class="stack" style="--gap:.5rem">${rows}</div>
    <div class="row end mt"><button class="btn ghost" data-close="x">Abbrechen</button></div>`, { wide: true });
  m.el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-pick]'); if (!b) return;
    m.close(); await ctx.act(mode === 'groom' ? 'famGroom' : 'famHandover', { childId: c.id, id: Number(b.dataset.pick) });
  });
}

/* ------------------------------------------------------------------ Dynastie-Wertung und Traditionsbetrieb ------------------------------------------------------------------ */
const PART_LABEL = { generations: 'Generationen', firms: 'Familienbetriebe', wealth: 'Vermögen', standing: 'Ansehen und Titel', kids: 'Kinder', bond: 'Beständige Ehe', inherited: 'Familienerbe' };

export function dynastyCard(ctx, { compact = false } = {}) {
  const f = ctx.view.fam; if (!f || !f.on || !isOpen(ctx, 'dynasty')) return '';
  const d = f.dyn;
  return html`<section class="card mt" data-dyn-card>
    <div class="row spread nowrap"><div class="card-title" style="margin:0">${icon('crown')} ${term('Dynastie', 'Dynastie-Wertung')}: <b>${d.name}</b></div>
      ${infoBtn(['Die Dynastie-Wertung misst, wie fest deine Familie über Generationen steht: wie viele Generationen schon, wie viele Familienbetriebe und Traditionsbetriebe, Vermögen, Ansehen und Titel, gut ausgebildete Kinder und eine beständige Ehe.', 'Ein Teil davon wird an die nächste Generation weitergegeben (Familienerbe). Die Wertung bringt keine Sperren; sie zeigt, wie weit die Familie gekommen ist, und steht in der Rangliste „Dynastie“.', 'Arbeite Kinder im Familienbetrieb ein, halte die Betriebe in der Familie und pflege Ansehen und Zusammenhalt.'], 'Dynastie')}</div>
    <div class="row wrap small mt"><span class="chip ${DYN_TONE[d.lv]}">${icon('award')} <span>Stufe</span> <b>${d.lv}</b> <span>von 5</span></span><span class="chip">${icon('users')} <span>Generation</span> <b>${d.generation}</b></span><span class="chip">${icon('star')} <b class="mono">${dec(d.pts, 1)}</b> <span>Punkte</span></span></div>
    ${d.next ? html`<div class="mt">${bar(Math.max(0, Math.min(100, (d.pts - d.levels[d.lv - 1].at) / Math.max(1, d.next.at - d.levels[d.lv - 1].at) * 100)), 'good')}<div class="small dim mt"><span>Noch</span> <span class="mono">${dec(d.next.missing, 1)}</span> <span>Punkte bis</span> <b>${d.next.name}</b></div></div>` : html`<div class="small dim mt">${icon('crown')} <span>Höchste Stufe erreicht.</span></div>`}
    ${compact ? '' : html`<div class="stack mt" style="--gap:.3rem">${d.parts.map((p) => html`<div class="ch-prow"><span class="small">${PART_LABEL[p.key] || p.key}</span>${bar(p.max > 0 ? p.pts / p.max * 100 : 0, '')}<span class="small mono">${dec(p.pts, 1)}<span class="dim">/${dec(p.max)}</span></span></div>`)}</div>`}
    <div class="card-title mt" style="margin-bottom:.3rem">${icon('store')} <span>Familienbetriebe</span></div>
    ${d.firms.length ? html`<ul class="dyn-firms">${d.firms.map((b) => html`<li data-dyn-firm="${b.id}"><b data-i18n-skip>${b.name}</b> <span class="small dim"><span class="mono">${b.years}</span> <span>Jahre in Familienhand</span> · <span class="mono">${b.gen}</span><span>. Generation</span></span>${b.trad ? html` <span class="chip gold">${icon('award')} <span>${b.tradName}</span>${b.rev > 0 ? html` <span class="mono">+${dec(b.rev, 1)} %</span>` : ''}</span>` : ''}</li>`)}</ul>
      <div class="small dim mt">${icon('info')} <span>Ab</span> <span class="mono">${f.tradition.levels[0].years}</span> <span>Jahren in zweiter Generation gilt ein Betrieb als Traditionsbetrieb: etwas mehr Kundenbindung (höchstens</span> <span class="mono">${f.tradition.capPct} %</span> <span>Umsatz) und Ansehen.</span></div>`
      : html`<div class="small dim">${icon('info')} <span>Du führst noch keinen Betrieb. Ein Betrieb, der über Generationen in der Familie bleibt, wird zum Traditionsbetrieb.</span></div>`}
    ${d.div ? html`<div class="small dim mt">${icon('scale')} <span>Scheidungen:</span> <span class="mono">${d.div}</span></div>` : ''}
  </section>`;
}

/* ------------------------------------------------------------------ Anbindung ------------------------------------------------------------------ */
/** Alle Knöpfe der Familienseite binden (Karten stehen in views/family.js und im Charakterblatt). */
export function bindDyn(root, ctx) {
  const act = (name, input) => ctx.act(name, input);
  on(root, 'click', '[data-woo-act]', (e, t) => { const [id, key] = t.dataset.wooAct.split(':'); act('wooAct', { id, act: key }); });
  on(root, 'click', '[data-woo-best]', (e, t) => act('wooAct', { id: t.dataset.wooBest, act: 'best' }));
  on(root, 'click', '[data-woo-visit]', (e, t) => act('wooVisit', { id: t.dataset.wooVisit }));
  on(root, 'click', '[data-woo-ask]', (e, t) => act('wooAsk', { id: t.dataset.wooAsk }));
  on(root, 'click', '[data-woo-drop]', async (e, t) => { if (await confirmBox({ title: 'Kontakt beenden?', text: 'Ihr verliert den Kontakt; nach einer Weile könnt ihr es noch einmal versuchen.', ok: 'Beenden', danger: true })) act('wooDrop', { id: t.dataset.wooDrop }); });
  on(root, 'click', '[data-dyn-marry]', () => openMarry(ctx));
  on(root, 'click', '[data-dyn-divorce]', async () => { if (await confirmBox({ title: 'Scheidung beantragen?', text: 'Nach einem Trennungsjahr wird die Ehe geschieden. Der Ehevertrag regelt dann, wer was bekommt; die Verfahrenskosten sind sofort fällig.', ok: 'Antrag stellen', danger: true })) act('divorce', {}); });
  on(root, 'click', '[data-dyn-divorce-cancel]', () => act('divorceCancel', {}));
  on(root, 'click', '[data-dyn-groom]', (e, t) => { const c = ctx.view.children.find((x) => String(x.id) === t.dataset.dynGroom); const k = kidOf(ctx.view, Number(t.dataset.dynGroom)); if (c && k) pickFirm(ctx, c, k, 'groom'); });
  on(root, 'click', '[data-dyn-hand]', (e, t) => { const c = ctx.view.children.find((x) => String(x.id) === t.dataset.dynHand); const k = kidOf(ctx.view, Number(t.dataset.dynHand)); if (c && k) pickFirm(ctx, c, k, 'hand'); });
  on(root, 'click', '[data-dyn-groom-end]', (e, t) => act('famGroomEnd', { childId: Number(t.dataset.dynGroomEnd) }));
}
