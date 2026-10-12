/* Betrieb 2.0 (Oberfläche): Ausbaumodule (Lager, Brandschutz, Schutz, Arbeitsplätze), Betriebsklima und Führungsaktionen.
 * Daten kommen fertig vom Server (view.companies[].ops und .mods). Zahlen stehen in eigenen Elementen (für die englische Oberfläche).
 * Die Karte erscheint erst, wenn der Betrieb Mitarbeiter hat (Freischaltung „staff“); die Aktionen rufen ausschließlich Spielaktionen des Servers auf. */
import { html, icon, money, infoBtn, bar, on, modal, term } from './ui.js';
import { isOpen, lockHint } from './onboarding.js';

const dec = (x, d = 1) => (Math.round(x * 10 ** d) / 10 ** d).toLocaleString(document.documentElement.lang === 'en' ? 'en-US' : 'de-DE', { maximumFractionDigits: d });
const BAND_TONE = { great: 'good', good: 'good', ok: '', low: 'warn', bad: 'bad', none: '' };
const MOD_ORDER = ['lager', 'brand', 'schutz', 'arbeit'];

const pips = (lv, max = 3) => html`<span class="ops-pips" role="img" aria-label="Stufe ${lv} von ${max}">${Array.from({ length: max }, (_, i) => html`<i class="${i < lv ? 'on' : ''}"></i>`)}</span>`;

const whyText = (n) => (n.why === 'era' ? `Gibt es erst ab ${n.from}.` : n.why === 'noinputs' ? 'Dieser Betrieb braucht keine Zutaten.' : n.why === 'abandoned' ? 'Der Betrieb steht leer.' : n.why === 'off' ? 'Gerade ausgeschaltet.' : '');

function moduleRow(c, m, v) {
  const cur = v.currency; const n = m.next;
  const lager = m.key === 'lager' && c.ops.stock;
  const dis = !n || !n.ok;
  const reason = !n ? '' : whyText(n) || (v.money < n.cost ? 'Dafür reicht dein Geld nicht.' : '');
  return html`<div class="ops-mod" data-mod="${m.key}">
    <div class="row spread nowrap"><b class="ops-mod-t">${icon(m.icon)} <span>${m.name}</span></b><span class="row nowrap">${pips(m.lv)}<button class="btn sm ghost" data-ops-info="${m.key}" data-id="${c.id}" aria-label="Stufen ansehen" title="Stufen ansehen">${icon('info')}</button></span></div>
    <div class="small ${m.cur ? '' : 'dim'}">${m.cur ? html`<b>${m.cur.name}</b>` : html`<span>Noch nicht gebaut</span>`}</div>
    ${lager ? html`<div class="small mt"><span>Vorrat:</span> <b>${dec(c.ops.stock.days)}</b> / ${c.ops.stock.cap} <span>Tage</span>${c.ops.stock.window === 'use' ? html` · <span class="chip good small">${icon('trending-down')} <span>Vorrat spart Einkauf</span></span>` : c.ops.stock.window === 'buy' ? html` · <span class="chip small">${icon('shopping-basket')} <span>Preise günstig: Vorrat füllt sich</span></span>` : c.ops.stock.window === 'cover' ? html` · <span class="chip warn small">${icon('package')} <span>Vorrat überbrückt eine Lücke</span></span>` : ''}</div>${bar(c.ops.stock.cap ? (c.ops.stock.days / c.ops.stock.cap) * 100 : 0, c.ops.stock.days < 1 ? 'bad' : 'good')}` : ''}
    ${m.upkeep > 0 ? html`<div class="small dim"><span>Unterhalt:</span> ${money(m.upkeep, cur)} <span>pro Tag</span></div>` : ''}
    <div class="row mt wrap">
      ${n ? html`<button class="btn sm ${dis ? '' : 'primary'}" data-ops-build="${m.key}" data-id="${c.id}" ${dis ? 'disabled' : ''} title="${reason}">${icon('hammer')} <span>Ausbauen:</span> ${n.name} · ${money(n.cost, cur)}</button>` : html`<span class="chip good small">${icon('check')} <span>Höchste Stufe</span></span>`}
      ${m.lv > 0 ? html`<button class="btn sm ghost danger" data-ops-remove="${m.key}" data-id="${c.id}" title="Rückbau ohne Erstattung">${icon('x')} <span>Rückbau</span></button>` : ''}
    </div>
    ${n && reason ? html`<div class="small dim mt">${reason}</div>` : ''}
  </div>`;
}

/** Karte „Ausbau und Betriebsklima“ eines Betriebs. */
export function opsBox(c, v, ctx) {
  const o = c.ops; if (!o || !o.on || c.abandoned) return '';
  const open = isOpen(ctx, 'staff') || c.staff > 0 || MOD_ORDER.some((k) => o.modules[k].lv > 0);
  if (!open) return html`<div class="ops-box ops-lock mt small dim">${icon('lock')} <span>Ausbau und Betriebsklima</span> – <span>${lockHint(ctx, 'staff')}</span></div>`;
  const cur = v.currency; const cl = o.climate; const A = o.actions;
  const fire = o.fire;
  const burning = fire.outage > 0;
  return html`<div class="ops-box mt" id="ops-${c.id}">
    <div class="row spread nowrap"><div class="card-title" style="margin:0" data-ops-modules>${icon('package')} <span>Ausbau</span> ${infoBtn(['Module machen einen Betrieb sicherer und leistungsfähiger: Das Lager hält Zutaten vor, der Brandschutz senkt die Gefahr eines Feuers, der Schutz wehrt Diebe ab, die Arbeitsplätze heben die Stimmung.', 'Jedes Modul hat drei Stufen. Sie kosten einmalig Geld (die Baufirmen deiner Stadt verdienen daran) und täglich etwas Unterhalt.', 'Beginne mit der kleinsten Stufe. Eine Betriebsversicherung schützt zusätzlich vor den Folgen eines Brandes.'], 'Ausbau')}</div>
      ${fire.band === 'high' ? html`<span class="chip warn small">${icon('flame')} <span>Hohes Brandrisiko</span></span>` : ''}</div>
    ${burning ? html`<div class="alert bad small mt">${icon('flame')}<div><span>Nach einem Brand steht der Betrieb still: noch</span> ${fire.outage} <span>Tage.</span></div></div>` : ''}
    <div class="ops-mods mt">${MOD_ORDER.map((k) => moduleRow(c, o.modules[k], v))}</div>
    <div class="row wrap mt small ops-fire">
      <span class="chip ${fire.band === 'high' ? 'warn' : ''}" title="Wie wahrscheinlich ein Betriebsbrand ist">${icon('flame')} <span>Brandrisiko:</span> <b>${dec(fire.yearPct)}</b> <span>% pro Jahr</span></span>
      ${o.insurance.on ? html`<span class="chip good" title="Die Betriebsversicherung zahlt den größten Teil des Schadens">${icon('shield')} <span>Betriebsversicherung aktiv</span>${o.insurance.disc ? html` · <span>Rabatt</span> <b>${o.insurance.disc}</b> <span>%</span>` : ''}</span>`
        : html`<button class="btn sm" data-ops-ins="1" title="Schließt die Betriebsversicherung für alle deine Betriebe ab">${icon('shield')} <span>Betriebsversicherung abschließen</span></button>`}
    </div>
    <div class="ops-clim mt" data-ops-climate>
      <div class="row spread nowrap"><div class="card-title" style="margin:0">${icon('smile')} ${term('Betriebsklima', 'Betriebsklima')}</div>
        ${cl.avg == null ? html`<span class="chip small">Keine Mitarbeiter</span>` : html`<span class="chip ${BAND_TONE[cl.band]}"><b>${cl.name}</b> · ${Math.round(cl.avg)}</span>`}</div>
      ${cl.avg == null ? html`<div class="small dim mt">Sobald du Mitarbeiter einstellst, siehst du hier ihre Stimmung. Zufriedene Teams arbeiten besser und kündigen seltener.</div>`
      : html`${bar(cl.avg, cl.band === 'bad' || cl.band === 'low' ? 'bad' : 'good')}
        <div class="small dim mt"><span>Wirkung auf den Umsatz:</span> <b class="${cl.effectPct >= 0 ? 'pos' : 'neg'}">${cl.effectPct > 0 ? '+' : cl.effectPct < 0 ? '−' : '±'}${dec(Math.abs(cl.effectPct))} %</b> <span>(höchstens ±</span>${dec(cl.maxPct)} <span>%)</span>${cl.capPct ? html` · <span>Zusatzstellen:</span> <b class="pos">+${dec(cl.capPct)} %</b>` : ''}${cl.sickPct ? html` · <span>weniger Krankenausfall:</span> <b>${cl.sickPct}</b> <span>%</span>` : ''}</div>
        ${cl.auto ? html`<div class="small dim">${icon('crown')} <span>Mit einem Manager bleibt das Klima mindestens auf neutralem Niveau.</span></div>` : ''}
        ${cl.fear ? html`<div class="alert warn small mt">${icon('triangle-alert')}<div><span>Nach einer Abmahnung ist das Team verunsichert: Zielstimmung</span> −${cl.fear} <span>Punkte.</span></div></div>` : ''}
        <div class="row mt wrap">
          <button class="btn sm primary" data-ops-lead="praise" data-id="${c.id}" ${A && A.praise.ok ? '' : 'disabled'} title="${A && A.praise.cd ? 'Wieder möglich in ' + A.praise.cd + ' Tagen' : 'Ein Lob kostet nichts'}">${icon('smile')} <span>Lob für alle</span></button>
          <button class="btn sm" data-ops-lead="bonus" data-id="${c.id}" ${A && !A.bonus.cd ? '' : 'disabled'} title="Prämie für das ganze Team">${icon('hand-coins')} <span>Prämie</span> · ${money(A ? A.bonus.perHead * cl.members.length : 0, cur)}</button>
          <button class="btn sm" data-ops-lead="party" data-id="${c.id}" ${A && !A.party.cd ? '' : 'disabled'} title="${A && A.party.cd ? 'Wieder möglich in ' + A.party.cd + ' Tagen' : A && A.party.christmas ? 'Weihnachtsfeier wirkt stärker' : 'Betriebsfest für das ganze Team'}">${icon('party-popper')} <span>${A && A.party.christmas ? 'Weihnachtsfeier' : 'Betriebsfest'}</span> · ${money(A ? A.party.cost : 0, cur)}</button>
          <button class="btn sm ghost" data-team="${c.id}" ${c.talent && c.talent.team.length ? '' : 'disabled'}>${icon('users')} <span>Mitarbeiter einzeln führen</span></button>
        </div>`}
    </div>
  </div>`;
}

/** Kleiner Block je Mitarbeiter im Teamdialog: Stimmung und Führungsaktionen. */
export function memberLead(c, x, cur) {
  const o = c.ops; if (!o || !o.on) return '';
  const mm = o.climate.members.find((m) => m.id === x.id); if (!mm) return '';
  const A = o.actions || {};
  return html`<div class="ops-member mt">
    <div class="row spread nowrap small"><span>${icon('smile')} <span>Stimmung</span></span><b class="${BAND_TONE[mm.band] === 'bad' ? 'neg' : BAND_TONE[mm.band] === 'good' ? 'pos' : ''}">${mm.mood}</b></div>
    ${bar(mm.mood, mm.band === 'bad' || mm.band === 'low' ? 'bad' : 'good')}
    ${x.ask && x.ask.unhappy ? html`<div class="small neg mt">${icon('triangle-alert')} <span>Unzufrieden – denkt ans Kündigen</span></div>` : ''}
    <div class="row mt wrap">
      <button class="btn sm" data-lead="praise" data-mid="${x.id}" ${mm.praiseCd ? 'disabled' : ''} title="${mm.praiseCd ? 'Wieder möglich in ' + mm.praiseCd + ' Tagen' : 'Ein Lob kostet nichts'}">${icon('smile')} <span>Lob</span></button>
      <button class="btn sm" data-lead="gift" data-mid="${x.id}" ${mm.giftCd ? 'disabled' : ''} title="${mm.giftCd ? 'Wieder möglich in ' + mm.giftCd + ' Tagen' : 'Ein kleines Geschenk'}">${icon('gift')} <span>Geschenk</span> · ${money(A.gift ? A.gift.cost : 0, cur)}</button>
      <button class="btn sm" data-lead="bonus" data-mid="${x.id}" ${mm.bonusCd ? 'disabled' : ''} title="${mm.bonusCd ? 'Wieder möglich in ' + mm.bonusCd + ' Tagen' : 'Eine Prämie'}">${icon('hand-coins')} <span>Prämie</span> · ${money(A.bonus ? A.bonus.perHead : 0, cur)}</button>
      <button class="btn sm ghost danger" data-lead="warn" data-mid="${x.id}" ${mm.warnCd ? 'disabled' : ''} title="Förmliche Abmahnung – senkt die Stimmung im Team">${icon('triangle-alert')} <span>Abmahnen</span></button>
    </div></div>`;
}

/** Dialog: die drei Stufen eines Moduls mit Wirkung. */
function openModule(ctx, c, key) {
  const m = c.ops.modules[key]; const v = ctx.view; const cur = v.currency;
  const rows = m.levels.map((L) => {
    const st = L.lv <= m.lv ? 'built' : m.next && L.lv === m.next.lv ? 'next' : 'later';
    return html`<li class="ops-lv ${st}"><div class="row spread nowrap"><b>${L.name}</b><span class="chip small ${st === 'built' ? 'good' : ''}">${st === 'built' ? 'Gebaut' : st === 'next' ? 'Nächste Stufe' : 'Später'}</span></div>
      <div class="small">${L.text}</div><div class="small dim">${L.eraOk ? '' : html`<span>Erst ab</span> ${L.from} · `}${st === 'next' ? html`<span>Kosten:</span> ${money(m.next.cost, cur)}` : ''}</div></li>`;
  });
  modal(html`<h3>${icon(m.icon)} <span>${m.name}</span></h3><p class="small dim">${m.what}</p><ol class="ops-lvs">${rows}</ol>
    <p class="small dim">Die Kosten sind ein Anteil am Wert des Betriebs und richten sich nach den Baupreisen deiner Stadt. Der Unterhalt läuft täglich. Beim Rückbau gibt es kein Geld zurück.</p>
    <div class="row end mt"><button class="btn primary" data-close="x">Verstanden</button></div>`, { wide: true });
}

export function bindOps(root, ctx) {
  const find = (id) => ctx.view.companies.find((x) => x.id === Number(id));
  on(root, 'click', '[data-ops-info]', (e, t) => { const c = find(t.dataset.id); if (c) openModule(ctx, c, t.dataset.opsInfo); });
  on(root, 'click', '[data-ops-build]', async (e, t) => { if (t.disabled) return; const c = find(t.dataset.id); if (!c) return; const m = c.ops.modules[t.dataset.opsBuild];
    if (await ctx.confirm({ title: `${m.name} ausbauen?`, text: `${m.next.name}: ${m.next.text} Es kostet ${money(m.next.cost, ctx.view.currency)} und danach täglich etwas Unterhalt.`, ok: 'Ausbauen' })) { try { await ctx.act('opsBuild', { id: c.id, mod: t.dataset.opsBuild }); } catch (_) { /* Meldung ist schon da */ } } });
  on(root, 'click', '[data-ops-remove]', async (e, t) => { const c = find(t.dataset.id); if (!c) return; const m = c.ops.modules[t.dataset.opsRemove];
    if (await ctx.confirm({ title: `${m.name} zurückbauen?`, text: 'Das Modul wird abgebaut. Es gibt kein Geld zurück.', ok: 'Zurückbauen', danger: true })) { try { await ctx.act('opsRemove', { id: c.id, mod: t.dataset.opsRemove }); } catch (_) { /* Meldung ist schon da */ } } });
  on(root, 'click', '[data-ops-ins]', async () => { try { await ctx.act('insurance', { key: 'betrieb', on: true }); } catch (_) { /* Meldung ist schon da */ } });
  on(root, 'click', '[data-ops-lead]', async (e, t) => {
    if (t.disabled) return; const k = t.dataset.opsLead; const id = Number(t.dataset.id);
    try {
      if (k === 'praise') await ctx.act('bizPraise', { id, mid: 'all' });
      else if (k === 'bonus') await ctx.act('bizBonus', { id, mid: 'all' });
      else if (k === 'party') await ctx.act('bizParty', { id });
    } catch (_) { /* Meldung ist schon da */ }
  });
}

/** Führungsaktionen im Teamdialog (einzelne Mitarbeiter). act = async (name, input) => …; Rückgabe: true, wenn etwas geschehen ist. */
export async function runLead(ctx, id, kind, mid) {
  if (kind === 'warn' && !(await ctx.confirm({ title: 'Mitarbeiter abmahnen?', text: 'Eine Abmahnung ist ein förmlicher Verweis. Kurzfristig steigt die Leistung, doch die Stimmung im ganzen Team sinkt, und wer oft abmahnt, verliert an Ansehen. Lob und Prämien wirken meist besser.', ok: 'Abmahnen', danger: true }))) return false;
  const name = kind === 'praise' ? 'bizPraise' : kind === 'gift' ? 'bizGift' : kind === 'bonus' ? 'bizBonus' : 'bizWarn';
  await ctx.act(name, { id, mid });
  return true;
}
