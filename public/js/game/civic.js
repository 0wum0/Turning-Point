/* Gesellschaft (Oberfläche): Vereine, Gemeinde, Stiftung, Titel und Ränge. Daten: /api/civic
 * Beträge kommen in Cent der eigenen Währung vom Server; Eingaben gehen in der Hauptwährung (z. B. 12,50) zurück. Zahlen stehen in eigenen Elementen (für die englische Oberfläche). */
import { html, icon, api, on, modal, toast, money, infoBtn, term, bar } from './ui.js';

const TABS = [['clubs', 'Vereine', 'users'], ['parish', 'Gemeinde', 'church'], ['foundation', 'Stiftung', 'crown'], ['titles', 'Titel & Ränge', 'award']];
const dec1 = (x) => (Math.round(Number(x) * 10) / 10).toLocaleString(document.documentElement.lang === 'en' ? 'en-US' : 'de-DE', { maximumFractionDigits: 1 });
const when = (ms) => new Date(ms).toLocaleString(document.documentElement.lang === 'en' ? 'en-GB' : 'de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const inTxt = (ms) => { const h = (ms - Date.now()) / 3600000; if (h <= 0) return 'gleich'; if (h < 1) return `in ${Math.max(1, Math.round(h * 60))} Min.`; if (h < 48) return `in ${Math.round(h)} Std.`; return `in ${Math.round(h / 24)} Tagen`; };
const inp = (cents) => (Math.max(0, cents) / 100).toFixed(2);

const LEDGER = {
  found: 'Verein gegründet', join: 'Beitritt (erster Beitrag)', leave: 'Austritt', fee: 'Beitrag', fee_set: 'Beitrag geändert', donate: 'Spende', event: 'Vereinsfest', endorse: 'Wahlempfehlung', withdraw: 'Privat entnommen',
  restitution: 'Rückzahlung nach Urteil', chair: 'Neuer Vorsitz', board: 'Vorstand geändert', kick: 'Ausgeschlossen', lapse: 'Ausgeschieden (Beitrag offen)', ousted: 'Abgewählt', verdict: 'Verurteilt wegen Veruntreuung', dissolve: 'Verein aufgelöst',
  aid: 'Notgabe', ceremony: 'Feier', give: 'Zustiftung', payout: 'Ausschüttung', will: 'Vermächtnis',
};
const ledgerRows = (rows, cur) => rows.map((e) => html`<div class="firm small"><div class="grow"><b>${LEDGER[e.kind] || e.kind}</b>${e.who ? html` <span class="dim" data-i18n-skip>${e.who}</span>` : ''}${e.kind === 'withdraw' ? html` <span class="chip bad">${icon('skull')} <span>Veruntreuung</span></span>` : ''}</div>${e.amount ? html`<span class="mono">${money(e.amount, cur)}</span>` : ''}<span class="dim">${when(e.at)}</span></div>`);

/* ------------------------------------------------------------------ kleine Dialoge ------------------------------------------------------------------ */
function ask({ title, text, label, value = '', ok = 'OK', type = 'number', ic = 'coins', extra = '', danger = false }) {
  return new Promise((resolve) => {
    let out = null;
    const m = modal(html`<h3>${icon(ic)} ${title}</h3>${text ? html`<p class="small dim">${text}</p>` : ''}
      <div class="field"><label for="ask-v">${label}</label><input id="ask-v" type="${type}" ${type === 'number' ? html`step="any" min="0" inputmode="decimal"` : ''} value="${value}" autocomplete="off" autofocus></div>${extra}
      <div class="row end mt"><button class="btn ghost" data-close="no">Abbrechen</button><button class="btn ${danger ? 'danger' : 'primary'}" id="ask-ok">${ok}</button></div>`, { onClose: () => resolve(out) });
    const go = () => { out = m.el.querySelector('#ask-v').value; m.close(); };
    m.el.querySelector('#ask-ok').onclick = go;
    m.el.querySelector('#ask-v').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
  });
}

async function call(ctx, url, body) {
  try {
    const r = await api('POST', url, body || {});
    if (r.view) { ctx.setView(r.view); ctx.hud(); }
    if (r.message) toast(r.message, r.level === 'bad' ? 'bad' : r.level === 'warn' ? 'warn' : 'good');
    return r;
  } catch (e) { toast(e.message, 'warn'); return null; }
}

export const civicSkeleton = () => html`<section class="card mt" id="civicBox" data-spot="civic"><div class="dim small">Lade …</div></section>`;

/** Kleine Karte für die Übersicht: wer wo dazugehört (nur wenn es etwas zu zeigen gibt). */
export function civicMini(ctx) {
  const c = ctx.view && ctx.view.civic; if (!c || !c.on) return '';
  const any = c.clubs.length || c.parish || c.foundation || c.titles.length || c.funerals;
  if (!any) return '';
  return html`<section class="card mt" id="civicMini">
    <div class="row spread nowrap"><div class="card-title" style="margin:0">${icon('users')} Vereine, Gemeinde & Titel</div><button class="btn sm" data-go="society">Öffnen</button></div>
    <div class="chips mt">
      ${c.titles.map((t) => html`<span class="chip good" title="Titel">${icon('award')} <span>${t.name}</span></span>`)}
      ${c.clubs.map((x) => html`<span class="chip" title="Verein">${icon('users')} <span data-i18n-skip>${x.name}</span></span>`)}
      ${c.parish ? html`<span class="chip" title="Gemeinde">${icon('church')} <span data-i18n-skip>${c.parish.name}</span></span>` : ''}
      ${c.foundation ? html`<span class="chip good" title="Stiftung">${icon('crown')} <span data-i18n-skip>${c.foundation.name}</span></span>` : ''}
      ${c.due ? html`<span class="chip warn">${icon('clock')} <span>Beitrag offen</span></span>` : ''}
      ${c.funerals ? html`<span class="chip warn">${icon('heart')} <span>Trauerfeier offen</span></span>` : ''}
    </div></section>`;
}

/* ------------------------------------------------------------------ Vereine ------------------------------------------------------------------ */
function clubsView(d, ctx) {
  const c = d.clubs; const cur = d.currency;
  return html`
    <p class="small dim">Ein ${term('Verein')} verbindet die Menschen deiner Stadt. Mitglieder zahlen einen Jahresbeitrag in die ${term('Vereinskasse')}; daraus richtet der ${term('Vorstand')} Feste aus. Ab <b>${c.found.minActive}</b> <span>Mitgliedern wirkt der Verein auf alle, die dazugehören.</span></p>
    <div class="grid c2 mt" style="--gap:.6rem">${c.kinds.map((k) => html`<div class="firm small">${icon(k.icon)}<div class="grow"><b>${k.name}</b><div class="dim">${k.what}</div></div></div>`)}</div>
    <div class="card-title mt">${icon('users')} Deine Vereine <span class="dim small">(${c.mine.length}/${c.found.slots})</span></div>
    ${c.mine.length ? html`<div class="stack" style="--gap:.6rem">${c.mine.map((x) => html`<article class="card flat" data-club="${x.id}">
      <div class="row nowrap spread"><h3 class="serif" style="margin:0;font-size:1.1rem">${icon(x.icon)} <span data-i18n-skip>${x.name}</span></h3><span class="chip ${x.role === 'president' ? 'good' : ''}">${x.roleName}</span></div>
      <div class="small dim mt"><span>${x.kindName}</span> · <b>${x.members}</b> <span>${x.members === 1 ? 'Mitglied' : 'Mitglieder'}</span> · <span>Beitrag</span> <b>${money(x.fee, cur)}</b> <span>im Jahr</span>${x.president ? html` · <span>Vorsitz:</span> <span data-i18n-skip>${x.president}</span>` : ''}</div>
      <div class="chips mt">${x.active ? html`<span class="chip good">${icon('circle-check')} <span>wirkt auf die Mitglieder</span></span>` : html`<span class="chip warn">${icon('info')} <span>noch zu klein für die Wirkung</span></span>`}
        <span class="chip">${icon('piggy-bank')} <span>Kasse:</span> <b>${money(x.treasury, cur)}</b></span>${x.arrears ? html`<span class="chip warn">${icon('clock')} <span>Beitrag offen</span></span>` : ''}</div>
      <div class="row mt" style="flex-wrap:wrap;gap:.4rem"><button class="btn sm primary" data-club-open="${x.id}">Öffnen</button><button class="btn sm ghost" data-club-leave="${x.id}" data-name="${x.name}">Austreten</button></div></article>`)}</div>`
    : html`<div class="alert info small">${icon('info')}<div>Du gehörst noch keinem Verein an. Tritt unten einem bei oder gründe einen eigenen – der erste Beitrag ist gering.</div></div>`}
    <div class="row spread mt" style="flex-wrap:wrap;gap:.5rem"><div class="card-title" style="margin:0">${icon('map-pin')} Vereine in <span data-i18n-skip>${d.city.name}</span></div>
      <button class="btn primary sm" data-club-found ${c.found.ok ? '' : 'disabled'} ${c.found.ok ? '' : html`title="${c.found.why}"`}>${icon('plus')} Verein gründen</button></div>
    ${c.found.ok ? '' : html`<div class="small dim mt">${c.found.why}</div>`}
    <div class="stack mt" style="--gap:.4rem">${c.list.length ? c.list.map((x) => html`<div class="firm small" data-club="${x.id}">${icon(x.icon)}<div class="grow"><b data-i18n-skip>${x.name}</b>${x.joined ? html` <span class="chip good">Mitglied</span>` : ''}<div class="dim"><span>${x.kindName}</span> · <b>${x.members}</b> <span>${x.members === 1 ? 'Mitglied' : 'Mitglieder'}</span> · <span>Beitrag</span> ${money(x.fee, cur)}${x.president ? html` · <span data-i18n-skip>${x.president}</span>` : ''}</div></div>
        ${x.joined ? html`<button class="btn sm" data-club-open="${x.id}">Öffnen</button>` : html`<button class="btn sm primary" data-club-join="${x.id}" data-name="${x.name}" data-fee="${x.fee}" ${x.why ? html`disabled title="${x.why}"` : ''}>Beitreten</button>`}</div>`)
      : html`<div class="dim small">In deiner Stadt gibt es noch keinen Verein. Sei der Erste!</div>`}</div>`;
}

async function foundClubDialog(ctx, d, reload) {
  const c = d.clubs; const cur = d.currency;
  const m = modal(html`<h3>${icon('users')} Verein gründen</h3>
    <p class="small dim">Die Gründung kostet einmalig <b>${money(c.found.cost, cur)}</b> (Eintragung und Satzung). Du wirst Vorsitzende/r und zahlst keinen eigenen Beitrag im ersten Jahr.</p>
    <div class="field"><label for="cf-kind">Art des Vereins</label><select id="cf-kind">${c.kinds.map((k) => html`<option value="${k.key}">${k.name}</option>`)}</select><div class="small dim" id="cf-what"></div></div>
    <div class="field"><label for="cf-name">Name</label><input id="cf-name" maxlength="${c.found.nameMax}" placeholder="z. B. Sportfreunde Eintracht" autocomplete="off"></div>
    <div class="field"><label for="cf-fee">Jahresbeitrag (${cur === 'EUR' ? '€' : 'DM'}, höchstens ${(c.found.feeMax / 100).toFixed(2)})</label><input id="cf-fee" type="number" step="any" min="0" inputmode="decimal" value="${inp(c.found.feeDefault)}"></div>
    <div class="field"><label for="cf-descr">Beschreibung (freiwillig)</label><textarea id="cf-descr" rows="2" maxlength="200" placeholder="Was macht ihr?"></textarea></div>
    <div class="alert info small">${icon('info')}<div>Mit einem hohen Beitrag füllt sich die Kasse schneller, aber weniger Menschen treten bei. Ein Verein wirkt erst ab ${c.found.minActive} Mitgliedern.</div></div>
    <div class="row end mt"><button class="btn ghost" data-close="no">Abbrechen</button><button class="btn primary" id="cf-go">Gründen</button></div>`);
  const q = (s) => m.el.querySelector(s);
  const what = () => { const k = c.kinds.find((x) => x.key === q('#cf-kind').value); q('#cf-what').textContent = k ? k.what : ''; };
  q('#cf-kind').addEventListener('change', what); what();
  q('#cf-go').onclick = async () => {
    const r = await call(ctx, '/api/civic/club/found', { kind: q('#cf-kind').value, name: q('#cf-name').value, fee: q('#cf-fee').value, descr: q('#cf-descr').value });
    if (r) { m.close(); if (window.TPMotion) window.TPMotion.confetti(); reload(); }
  };
}

async function clubDialog(ctx, id, reload) {
  let x; try { x = await api('GET', `/api/civic/club/${id}`); } catch (e) { toast(e.message, 'warn'); return; }
  const cur = ctx.view.currency; const me = x.me; const board = me && (me.role === 'president' || me.role === 'board'); const pres = me && me.role === 'president';
  const memberRow = (mm) => html`<div class="firm small"><div class="grow"><b data-i18n-skip>${mm.name}</b> <span class="chip ${mm.role === 'president' ? 'good' : ''}">${mm.roleName}</span></div>
    ${pres && !mm.me ? html`<span class="row nowrap" style="gap:.25rem">${mm.role === 'member' ? html`<button class="btn sm" data-cm="board" data-u="${mm.userId}" title="in den Vorstand berufen">${icon('plus')}</button>` : ''}${mm.role === 'board' ? html`<button class="btn sm" data-cm="member" data-u="${mm.userId}" title="aus dem Vorstand entlassen">${icon('minus')}</button>` : ''}<button class="btn sm" data-cm="president" data-u="${mm.userId}" title="Vorsitz übergeben">${icon('crown')}</button><button class="btn sm danger" data-cm="kick" data-u="${mm.userId}" title="ausschließen">${icon('x')}</button></span>`
      : board && !mm.me && mm.role === 'member' ? html`<button class="btn sm danger" data-cm="kick" data-u="${mm.userId}" title="ausschließen">${icon('x')}</button>` : ''}</div>`;
  const m = modal(html`<div class="civic-modal">
    <div class="row spread nowrap"><h3 style="margin:0">${icon(x.icon)} <span data-i18n-skip>${x.name}</span></h3><button class="btn ghost sm" data-close="x" aria-label="Schließen">${icon('x')}</button></div>
    <div class="small dim mt"><span>${x.kindName}</span> · <span data-i18n-skip>${x.city}</span> · <b>${x.count}</b> <span>${x.count === 1 ? 'Mitglied' : 'Mitglieder'}</span> · <span>Beitrag</span> <b>${money(x.fee, cur)}</b> <span>im Jahr</span></div>
    ${x.descr ? html`<p class="small" data-i18n-skip>${x.descr}</p>` : ''}
    <div class="chips mt">${x.active ? html`<span class="chip good">${icon('circle-check')} <span>wirkt auf die Mitglieder</span></span>` : html`<span class="chip warn">${icon('info')} <span>noch zu klein für die Wirkung</span></span>`}
      ${x.fx.health ? html`<span class="chip">${icon('heart-pulse')} <span>Gesundheit</span> +${dec1(x.fx.health)}</span>` : ''}${x.fx.mood ? html`<span class="chip">${icon('smile')} <span>Stimmung</span> +${dec1(x.fx.mood)}</span>` : ''}${x.fx.rev ? html`<span class="chip">${icon('trending-up')} <span>Umsatz</span> +${dec1(x.fx.rev)} %</span>` : ''}${x.fx.rest ? html`<span class="chip">${icon('moon')} <span>Erholung</span> +${dec1(x.fx.rest)}</span>` : ''}
      ${x.treasury != null ? html`<span class="chip">${icon('piggy-bank')} <span>Kasse:</span> <b>${money(x.treasury, cur)}</b></span>` : ''}</div>
    ${me ? '' : html`<div class="alert info small mt">${icon('info')}<div>Die Kasse und das Kassenbuch sehen nur Mitglieder.</div></div>`}
    <div class="card-title mt">Mitglieder</div><div class="stack" style="--gap:.3rem" id="cm-list">${x.members.map(memberRow)}</div>
    ${me ? html`
      <div class="row mt" style="flex-wrap:wrap;gap:.4rem">
        <button class="btn sm primary" data-cd="donate">${icon('coins')} Spenden</button>
        ${board ? html`<button class="btn sm" data-cd="event" title="Kosten aus der Kasse: ${money(x.limits.eventCost, cur)}${x.cooldown.event > 0 ? ` – nächstes Fest ${inTxt(Date.now() + x.cooldown.event)}` : ''}">${icon('party-popper')} Fest ausrichten (${money(x.limits.eventCost, cur)})</button>` : ''}
        ${pres ? html`<button class="btn sm" data-cd="fee">${icon('pencil')} Beitrag ändern</button>` : ''}
        ${me.role !== 'president' ? html`<button class="btn sm ${me.mistrust ? 'warn' : ''}" data-cd="mistrust">${icon('flag')} ${me.mistrust ? 'Misstrauen zurücknehmen' : 'Misstrauen gegen den Vorsitz'}</button>` : ''}
        <button class="btn sm ghost" data-cd="leave">Austreten</button>${pres ? html`<button class="btn sm danger" data-cd="dissolve">Verein auflösen</button>` : ''}</div>
      ${me.role !== 'president' && x.mistrustVotes ? html`<div class="small dim mt"><b>${x.mistrustVotes}</b> <span>von</span> <b>${x.count}</b> <span>Mitgliedern misstrauen dem Vorsitz. Bei einer Mehrheit (mindestens drei Stimmen) ist er abgewählt.</span></div>` : ''}
      ${x.elections && x.elections.length ? html`<div class="card-title mt">${icon('landmark')} Wahlempfehlung</div>
        <p class="small dim">Der Vorstand darf vor einer Wahl einen Kandidaten empfehlen (etwa +${dec1(x.elections[0].boost)} % Stimmengewicht, mit Wahlkampfhilfe aus der Kasse etwa +${dec1(x.elections[0].boostFunded)} %). Gewählt wird weiter von den Bürgern – ein Verein ersetzt keine Stimmen.</p>
        <div class="stack" style="--gap:.4rem">${x.elections.map((e) => html`<div class="card flat"><b>${e.office}</b> <span class="dim small">· <span>Wahl beginnt</span> ${when(e.voteStart)}</span>
          ${e.candidates.length ? html`<div class="stack mt" style="--gap:.3rem">${e.candidates.map((cn) => html`<div class="firm small"><div class="grow"><b data-i18n-skip>${cn.name}</b>${e.endorsed && e.endorsed.candidate === cn.userId ? html` <span class="chip good">empfohlen${e.endorsed.funded ? ' (mit Wahlkampfhilfe)' : ''}</span>` : ''}</div>
            <button class="btn sm" data-endorse="${e.id}" data-c="${cn.userId}" data-f="0">Empfehlen</button><button class="btn sm" data-endorse="${e.id}" data-c="${cn.userId}" data-f="1" title="Kosten aus der Kasse: ${money(x.limits.endorseCost, cur)}">mit Wahlkampfhilfe (${money(x.limits.endorseCost, cur)})</button></div>`)}</div>` : html`<div class="dim small mt">Noch keine anderen Kandidaten.</div>`}</div>`)}</div>` : ''}
      <div class="card-title mt">${icon('scroll')} Kassenbuch</div><div class="stack" style="--gap:.3rem">${x.ledger.length ? ledgerRows(x.ledger, cur) : html`<div class="dim small">Noch keine Buchungen.</div>`}</div>
      ${board ? html`<details class="mt"><summary class="small neg">${icon('skull')} <b>Kasse privat entnehmen</b></summary>
        <div class="alert bad small mt">${icon('triangle-alert')}<div><b>Das ist Veruntreuung.</b> Die Buchung steht für alle Mitglieder im Kassenbuch, ein Mitglied kann dich vor Gericht bringen, du verlierst bei einem Urteil das Geld und Ansehen – und die Mitglieder können dich abwählen. Es gibt kein Zurück.</div></div>
        <button class="btn sm danger mt" data-cd="withdraw">${icon('skull')} Trotzdem Geld entnehmen …</button></details>` : ''}` : ''}
    <div class="row end mt"><button class="btn primary" data-close="x">Schließen</button></div></div>`, { wide: true });
  const again = () => { m.close(); clubDialog(ctx, id, reload); reload(); };
  on(m.el, 'click', '[data-cd]', async (e, b) => {
    const a = b.dataset.cd;
    if (a === 'donate') { const v = await ask({ title: 'Spenden', text: `Deine Spende geht in die Vereinskasse von „${x.name}“.`, label: `Betrag (${cur === 'EUR' ? '€' : 'DM'})`, value: '10.00', ok: 'Spenden' }); if (v != null && await call(ctx, `/api/civic/club/${id}/donate`, { amount: v })) again(); }
    else if (a === 'event') { if (await call(ctx, `/api/civic/club/${id}/event`)) again(); }
    else if (a === 'fee') { const v = await ask({ title: 'Jahresbeitrag ändern', text: 'Der neue Beitrag gilt für alle Mitglieder ab dem nächsten Zeitraum.', label: `Beitrag (${cur === 'EUR' ? '€' : 'DM'})`, value: inp(x.fee), ok: 'Speichern' }); if (v != null && await call(ctx, `/api/civic/club/${id}/fee`, { fee: v })) again(); }
    else if (a === 'mistrust') { if (await call(ctx, `/api/civic/club/${id}/mistrust`, { on: !me.mistrust })) again(); }
    else if (a === 'leave') { if (await ctx.confirm({ title: 'Austreten?', text: `Du verlässt den Verein „${x.name}“.`, ok: 'Austreten' }) && await call(ctx, `/api/civic/club/${id}/leave`)) { m.close(); reload(); } }
    else if (a === 'dissolve') { if (await ctx.confirm({ title: 'Verein auflösen?', text: 'Das Vermögen der Kasse fällt an die Stadt (Gemeinwohl). Alle Mitglieder verlieren die Mitgliedschaft.', ok: 'Auflösen', danger: true }) && await call(ctx, `/api/civic/club/${id}/dissolve`)) { m.close(); reload(); } }
    else if (a === 'withdraw') {
      const v = await ask({ title: 'Kasse privat entnehmen', text: 'Das Geld geht auf dein Konto. Das ist strafbar und für alle sichtbar.', label: `Betrag (${cur === 'EUR' ? '€' : 'DM'})`, value: '10.00', ok: 'Entnehmen (Veruntreuung)', ic: 'skull', danger: true });
      if (v != null && await ctx.confirm({ title: 'Wirklich?', text: 'Du begehst Veruntreuung. Ein Mitglied kann dich anzeigen.', ok: 'Ja, entnehmen', danger: true }) && await call(ctx, `/api/civic/club/${id}/withdraw`, { amount: v, confirm: true })) again();
    }
  });
  on(m.el, 'click', '[data-cm]', async (e, b) => {
    const a = b.dataset.cm; const u = Number(b.dataset.u);
    if (a === 'kick') { if (!(await ctx.confirm({ title: 'Mitglied ausschließen?', text: 'Das Mitglied kann erst nach einer Wartezeit wieder beitreten.', ok: 'Ausschließen', danger: true }))) return; if (await call(ctx, `/api/civic/club/${id}/kick`, { user: u })) again(); }
    else if (a === 'president') { if (!(await ctx.confirm({ title: 'Vorsitz übergeben?', text: 'Du bleibst im Vorstand, der neue Vorsitz bestimmt künftig über Beitrag und Auflösung.', ok: 'Übergeben' }))) return; if (await call(ctx, `/api/civic/club/${id}/role`, { user: u, role: 'president' })) again(); }
    else if (await call(ctx, `/api/civic/club/${id}/role`, { user: u, role: a })) again();
  });
  on(m.el, 'click', '[data-endorse]', async (e, b) => { if (await call(ctx, `/api/civic/club/${id}/endorse`, { election: Number(b.dataset.endorse), candidate: Number(b.dataset.c), funded: b.dataset.f === '1' })) again(); });
}

/* ------------------------------------------------------------------ Gemeinde ------------------------------------------------------------------ */
function parishView(d, ctx) {
  const p = d.parish; const cur = d.currency; const me = p.mine;
  if (!me) {
    return html`<p class="small dim">Die ${term('Gemeinde')} ist die Glaubensgemeinschaft deiner Stadt. Mitglieder spenden in die Gemeindekasse; daraus gibt es ${term('Notgabe', 'Notgaben')} für Mitglieder in Not. Hochzeit, Taufe und Trauerfeier feierst du hier mit deiner Familie. Die Mitgliedschaft bleibt deiner Familie über die Generationen erhalten – aber du musst nicht beitreten.</p>
      <div class="stack mt" style="--gap:.5rem">${p.faiths.map((f) => html`<div class="firm" data-faith="${f.key}">${icon('church')}<div class="grow"><b>${f.name}</b><div class="small dim"><b>${f.members}</b> <span>${f.members === 1 ? 'Mitglied' : 'Mitglieder'}</span> · <span>Kasse</span> ${money(f.fund, cur)}</div></div>
        <button class="btn sm primary" data-parish-join="${f.key}" data-name="${f.name}" ${p.joinWhy ? html`disabled title="${p.joinWhy}"` : ''}>Beitreten</button></div>`)}</div>
      ${p.joinWhy ? html`<div class="small dim mt">${p.joinWhy}</div>` : ''}`;
  }
  const lv = me.level; const cer = p.ceremonies; const f = (k) => cer.labels && cer.labels[k];
  return html`
    <article class="card flat"><div class="row nowrap spread"><h3 class="serif" style="margin:0;font-size:1.1rem">${icon('church')} <span data-i18n-skip>${me.name}</span></h3><span class="chip good">${lv.name}</span></div>
      <div class="mt">${bar(lv.pct * 100, 'good')}<div class="small dim">${lv.next ? html`<span>Gemeinde-Ansehen:</span> <b>${dec1(me.standing)}</b> <span>Punkte – nächste Stufe:</span> <b>${lv.next}</b> <span>ab</span> <b>${lv.nextAt}</b> <span>Punkten</span>` : html`<span>Gemeinde-Ansehen:</span> <b>${dec1(me.standing)}</b> <span>Punkte – höchste Stufe erreicht.</span>`}</div></div>
      <div class="chips mt"><span class="chip">${icon('piggy-bank')} <span>Gemeindekasse:</span> <b>${money(me.fund, cur)}</b></span><span class="chip">${icon('coins')} <span>Von dir gespendet:</span> <b>${money(me.donated, cur)}</b></span></div>
      <div class="row mt" style="flex-wrap:wrap;gap:.4rem"><button class="btn sm primary" data-parish-donate>${icon('coins')} Spenden</button><button class="btn sm ghost" data-parish-leave>Austreten</button></div></article>
    <div class="card-title mt">${icon('hand-coins')} Notgabe ${infoBtn(['Die Gemeinde hilft Mitgliedern in Not mit einem Teil der Kasse.', 'Damit niemand die Kasse plündert, gibt es sie nur mit etwas Gemeinde-Ansehen, nach einer Wartezeit und nur, wenn dein Geld wirklich nicht reicht oder du auf der Straße lebst.', 'Spende regelmäßig, wenn du kannst – dann ist die Kasse gefüllt, wenn jemand sie braucht.'], 'Notgabe')}</div>
    <div class="firm small">${icon(me.aid.ok ? 'circle-check' : 'lock')}<div class="grow">${me.aid.ok ? html`<b>Du kannst eine Notgabe von <span>${money(me.aid.amount, cur)}</span> erbitten.</b><div class="dim">${me.aid.need}</div>` : html`<b>Zurzeit keine Notgabe möglich.</b><div class="dim">${me.aid.why}</div>`}</div><button class="btn sm primary" data-parish-aid ${me.aid.ok ? '' : 'disabled'}>Erbitten</button></div>
    <div class="card-title mt">${icon('heart')} Feiern mit der Familie</div>
    <div class="stack" style="--gap:.4rem">
      <div class="firm small">${icon('heart')}<div class="grow"><b>${f('wedding')}</b><div class="dim">${cer.wedding.done ? 'Schon gefeiert.' : cer.wedding.ok ? html`<span>Mit</span> <span data-i18n-skip>${cer.wedding.partner}</span> <span>– die Zufriedenheit steigt.</span>` : cer.wedding.why}</div></div><span class="mono">${money(cer.fees.wedding, cur)}</span><button class="btn sm" data-parish-cer="wedding" ${cer.wedding.ok ? '' : 'disabled'}>Feiern</button></div>
      <div class="firm small">${icon('baby')}<div class="grow"><b>${f('baptism')}</b><div class="dim">${cer.baptism.children.length ? 'Für kleine Kinder bis drei Jahre.' : 'Kein Kind bis drei Jahre, das noch nicht gefeiert wurde.'}</div></div><span class="mono">${money(cer.fees.baptism, cur)}</span></div>
      ${cer.baptism.children.map((c) => html`<div class="firm small" style="margin-left:1.4rem"><div class="grow"><b data-i18n-skip>${c.name}</b> <span class="dim">· ${c.age} <span>${c.age === 1 ? 'Jahr' : 'Jahre'}</span></span></div><button class="btn sm" data-parish-cer="baptism" data-child="${c.id}">Feiern</button></div>`)}
      <div class="firm small">${icon('heart')}<div class="grow"><b>${f('funeral')}</b><div class="dim">${cer.funeral.list.length ? 'Für einen verstorbenen Angehörigen: Das tröstet die Familie.' : 'Zurzeit steht keine Trauerfeier an.'}</div></div><span class="mono">${money(cer.fees.funeral, cur)}</span></div>
      ${cer.funeral.list.map((x) => html`<div class="firm small" style="margin-left:1.4rem"><div class="grow"><b data-i18n-skip>${x.name}</b></div><button class="btn sm" data-parish-cer="funeral" data-id="${x.id}">Ausrichten</button></div>`)}</div>
    <div class="card-title mt">${icon('scroll')} Kassenbuch der Gemeinde</div><div class="stack" style="--gap:.3rem">${me.ledger.length ? ledgerRows(me.ledger, cur) : html`<div class="dim small">Noch keine Buchungen.</div>`}</div>`;
}

/* ------------------------------------------------------------------ Stiftung ------------------------------------------------------------------ */
function foundationView(d, ctx) {
  const F = d.foundation; const cur = d.currency; const f = F.mine;
  if (!f) {
    return html`<p class="small dim">Eine ${term('Stiftung')} bindet Vermögen auf Dauer. Es bleibt erhalten und wirft einen kleinen Ertrag ab; ein Teil davon wird jedes Jahr ausgeschüttet – für das Gemeinwohl deiner Stadt (das bringt Ansehen und lässt den ${term('Gemeinwohl-Topf', 'Gemeinwohl-Topf')} wirken) oder, bei einer Familienstiftung, an deine Nachkommen. Die Stiftung gehört deiner Familie und überlebt dich.</p>
      <div class="alert info small mt">${icon('info')}<div><span>Mindestens</span> <b>${money(F.min, cur)}</b> <span>Gründungsvermögen plus</span> <b>${money(F.fee, cur)}</b> <span>Gebühr. Das Vermögen ist danach 30 Tage gebunden. Wer viel einbringt, trägt den Titel „Stifter“.</span></div></div>
      ${F.why ? html`<div class="alert warn small mt">${icon('lock')}<div>${F.why}</div></div>` : ''}
      <div class="card-title mt">Zweck der Stiftung</div>
      <div class="stack" style="--gap:.4rem" id="fd-purposes">${F.purposes.map((p, i) => html`<label class="firm small" style="cursor:pointer"><input type="radio" name="fd-purpose" value="${p.key}" ${i === 0 ? 'checked' : ''}>${icon(p.icon)}<div class="grow"><b>${p.name}</b><div class="dim">${p.what}</div></div></label>`)}</div>
      <div class="grid c2 mt" style="--gap:.6rem"><div class="field"><label for="fd-name">Name der Stiftung</label><input id="fd-name" maxlength="40" placeholder="z. B. Bürgerstiftung Zukunft" autocomplete="off"></div>
        <div class="field"><label for="fd-amount">Gründungsvermögen (${cur === 'EUR' ? '€' : 'DM'})</label><input id="fd-amount" type="number" step="any" min="0" inputmode="decimal" value="${inp(F.min)}"></div></div>
      <div class="field"><label for="fd-pct">Ausschüttung im Jahr (${F.payout.min} bis ${F.payout.max} % des Vermögens)</label><input id="fd-pct" type="number" step="0.5" min="${F.payout.min}" max="${F.payout.max}" value="${F.payout.def}"></div>
      <div class="row end mt"><button class="btn primary" data-fd-found ${F.why ? 'disabled' : ''}>${icon('crown')} Stiftung gründen</button></div>`;
  }
  const eff = f.effect; const unlocked = f.lockedUntil <= Date.now();
  return html`
    <article class="card flat"><div class="row nowrap spread"><h3 class="serif" style="margin:0;font-size:1.1rem">${icon(f.icon)} <span data-i18n-skip>${f.name}</span></h3><span class="chip good">${f.purposeName}</span></div>
      <div class="small dim mt"><span data-i18n-skip>${f.city}</span> · <span>Generation</span> <b>${f.generation}</b> <span>der Stifterfamilie</span></div>
      <dl class="kv small mt"><dt>Stiftungsvermögen</dt><dd><b>${money(f.capital, cur)}</b></dd><dt>Eingebracht insgesamt</dt><dd>${money(f.contributed, cur)}</dd><dt>Bisher ausgeschüttet</dt><dd>${money(f.paid, cur)}</dd>
        <dt>Ausschüttung im Jahr</dt><dd><b>${dec1(f.payoutPct)}</b> % <span class="dim">≈ ${money(f.yearPayout, cur)}</span></dd><dt>Ertrag im Jahr</dt><dd class="pos">+${money(f.yearIncome, cur)}</dd>
        <dt>Nächste Abrechnung</dt><dd>${inTxt(f.nextAt)}</dd><dt>Vermögen gebunden bis</dt><dd>${unlocked ? 'frei' : when(f.lockedUntil)}</dd><dt>Vermächtnis</dt><dd>${f.will ? html`<b>${f.will}</b> <span>% des Bargelds beim Tod</span>` : 'keines'}</dd></dl>
      ${f.family ? html`<div class="small dim mt">Die Ausschüttung geht an deine Familie (Gutschrift). Gemeinwohl-Ansehen gibt es dafür nicht.</div>`
        : html`<div class="small dim mt">${icon('sparkles')} <span>Wirkung in der Stadt:</span> ${eff && (eff.kids || eff.health || eff.wellbeing || eff.aid) ? html`${eff.kids ? html`<span class="chip">Kinder +${dec1(eff.kids * 10)}</span> ` : ''}${eff.health ? html`<span class="chip">Gesundheit +${dec1(eff.health)}</span> ` : ''}${eff.wellbeing ? html`<span class="chip">Stimmung +${dec1(eff.wellbeing)}</span> ` : ''}${eff.aid ? html`<span class="chip">Notgaben +${Math.round(eff.aid * 50)} %</span>` : ''}` : html`<span class="dim">Noch gering – jede Ausschüttung füllt den Topf, er klingt aber täglich ab.</span>`}</div>`}
      <div class="row mt" style="flex-wrap:wrap;gap:.4rem"><button class="btn sm primary" data-fd="give">${icon('plus')} Zustiften</button><button class="btn sm" data-fd="set">Ausschüttung ändern</button><button class="btn sm" data-fd="will">Vermächtnis</button><button class="btn sm ghost danger" data-fd="dissolve" ${unlocked ? '' : 'disabled'}>Auflösen</button></div></article>
    <div class="card-title mt">${icon('scroll')} Buch der Stiftung</div><div class="stack" style="--gap:.3rem">${f.ledger.length ? ledgerRows(f.ledger, cur) : html`<div class="dim small">Noch keine Buchungen.</div>`}</div>`;
}

/* ------------------------------------------------------------------ Titel ------------------------------------------------------------------ */
function titlesView(d, ctx) {
  const T = d.titles; const cur = d.currency; const fx = T.fx;
  const fxLine = (r) => [r.vote ? html`<span class="chip">${icon('landmark')} <span>Stimmengewicht</span> +${dec1(r.vote)} %</span>` : '', r.fee ? html`<span class="chip">${icon('coins')} <span>Kandidaturgebühr</span> −${dec1(r.fee)} %</span>` : '', r.rev ? html`<span class="chip">${icon('trending-up')} <span>Umsatz</span> +${dec1(r.rev)} %</span>` : '', r.slots ? html`<span class="chip">${icon('users')} +${r.slots} <span>Verein</span></span>` : ''];
  const mine = T.mine.filter((x) => x.active);
  const need = (l) => (l.key === 'lvl' ? l.need : l.key === 'office' ? '' : l.money ? money(l.need, cur) : l.need);
  return html`
    <p class="small dim">Ein ${term('Titel')} würdigt, was du für deine Stadt leistest. Er wird automatisch verliehen, sobald du die Voraussetzungen erfüllst, und bringt <b>kleine</b> Vorteile: mehr Gewicht bei Wahlen, eine günstigere Kandidatur, etwas mehr Umsatz, mehr Vereinsplätze. Titel und Vereine unterstützen im Wahlkampf – sie ersetzen aber keine Stimmen (zusammen höchstens +6 % Stimmengewicht).</p>
    <div class="card-title mt">${icon('award')} Deine Titel</div>
    ${mine.length ? html`<div class="stack" style="--gap:.4rem">${mine.map((x) => html`<div class="firm small">${icon('award')}<div class="grow"><b>${x.name}</b>${x.city ? html` <span class="dim" data-i18n-skip>· ${x.city}</span>` : ''}<div class="dim">${x.scope === 'family' ? 'Familientitel – bleibt über die Generationen' : 'Persönlicher Titel – endet mit deinem Leben'}</div></div></div>`)}</div>
      <div class="chips mt">${fxLine(fx)}</div>` : html`<div class="alert info small">${icon('info')}<div>Du trägst noch keinen Titel. Unten siehst du, was dafür nötig ist.</div></div>`}
    <div class="row spread mt" style="flex-wrap:wrap;gap:.5rem"><div class="card-title" style="margin:0">Alle Titel und ihre Voraussetzungen</div><button class="btn sm" data-titles-check>${icon('refresh-cw')} Jetzt prüfen</button></div>
    ${T.facts ? html`<div class="small dim">Dein Ansehen: <b>${T.facts.lvlName}</b>${T.facts.scandal ? html` · <span>Skandal</span> <b class="neg">${dec1(T.facts.scandal)}</b>` : ''}. <span>Ohne guten Ruf gibt es keinen Titel – wer verrufen ist, verliert sie.</span></div>` : ''}
    <div class="stack mt" style="--gap:.6rem">${T.catalog.map((t) => html`<article class="card flat"><div class="row nowrap spread"><b>${t.name}</b><span class="chip ${t.have ? 'good' : ''}">${t.have ? t.ranks[t.have - 1].name : 'noch nicht'}</span></div>
      <div class="small dim">${t.what}</div>
      ${t.auto ? html`<div class="stack mt" style="--gap:.4rem">${t.ranks.map((r) => html`<div class="small ${r.got ? '' : 'dim'}">${icon(r.got ? 'circle-check' : 'lock')} <b>${r.name}</b>${r.lines.length ? html`: ${r.lines.map((l) => html`<span class="chip ${l.ok ? 'good' : ''}" title="Du: ${l.money ? money(l.have, cur) : l.have}"><span>${l.label}</span> ${l.key === 'office' ? '' : need(l)}</span> `)}` : ''}
        ${r.fx.vote || r.fx.fee || r.fx.rev || r.fx.slots ? html`<div class="dim" style="margin-left:1.4rem">${r.fx.vote ? html`<span>Stimmen</span> +${dec1(r.fx.vote)} % · ` : ''}${r.fx.fee ? html`<span>Gebühr</span> −${dec1(r.fx.fee)} % · ` : ''}${r.fx.rev ? html`<span>Umsatz</span> +${dec1(r.fx.rev)} % · ` : ''}${r.fx.slots ? html`+${r.fx.slots} <span>Verein</span>` : ''}</div>` : ''}</div>`)}</div>`
        : html`<div class="small mt">${icon('landmark')} <span>Wird nicht automatisch vergeben: Ein Bürgermeister verleiht die Würde einem verdienten Bürger seiner Stadt.</span></div>`}</article>`)}</div>`;
}

/* ------------------------------------------------------------------ Karte ------------------------------------------------------------------ */
function cityPot(d) {
  const p = d.city.potRaw; const fx = d.city.pot; if (!p || !fx) return '';
  const rows = [['bildung', 'Bildung', 'graduation-cap', fx.kids ? `Kinder +${dec1(fx.kids * 10)}` : ''], ['gesundheit', 'Gesundheit', 'heart-pulse', fx.health ? `+${dec1(fx.health)}` : ''], ['kultur', 'Kultur', 'music', fx.wellbeing ? `+${dec1(fx.wellbeing)}` : ''], ['armut', 'Armenhilfe', 'hand-coins', fx.aid ? `+${Math.round(fx.aid * 50)} %` : '']].filter((r) => p[r[0]] > 1);
  if (!rows.length) return '';
  return html`<div class="small dim mt">${icon('sparkles')} <span>Gemeinwohl in</span> <span data-i18n-skip>${d.city.name}</span>: ${rows.map((r) => html`<span class="chip">${icon(r[2])} <span>${r[1]}</span> ${r[3]}</span> `)}</div>`;
}

/* ------------------------------------------------------------------ Verdrahtung ------------------------------------------------------------------ */
export async function bindCivic(root, ctx) {
  const box = root.querySelector('#civicBox'); if (!box) return;
  window.dispatchEvent(new CustomEvent('tp-seen', { detail: 'civic' }));
  let d; let tab = ctx.ui.civicTab || 'clubs';
  const load = async () => {
    try { d = await api('GET', '/api/civic'); } catch (e) { box.remove(); return false; }
    if (!d.enabled || !d.alive) { box.remove(); return false; }
    return true;
  };
  const draw = () => {
    if (!d) return;
    const avail = TABS.filter((t) => d.parts[{ clubs: 'clubs', parish: 'parish', foundation: 'foundation', titles: 'titles' }[t[0]]]);
    if (!avail.length) { box.remove(); return; }
    if (!avail.some((t) => t[0] === tab)) tab = avail[0][0];
    const body = tab === 'clubs' ? clubsView(d, ctx) : tab === 'parish' ? parishView(d, ctx) : tab === 'foundation' ? foundationView(d, ctx) : titlesView(d, ctx);
    box.innerHTML = html`<div class="row spread nowrap"><div class="card-title" style="margin:0">${icon('users')} Vereine, Gemeinde, Stiftung & Titel</div>${infoBtn(['Hier gehört deine Familie zur Gesellschaft ihrer Stadt: Vereine, Glaubensgemeinschaft, Stiftungen und Titel.', 'Alles bringt kleine Vorteile und Ansehen – nichts davon ist Pflicht, und Politik bleibt für alle offen.', 'Fang klein an: Tritt einem Verein bei oder spende der Gemeinde.'], 'Gesellschaft')}</div>
      <div class="tabs mt" role="tablist">${avail.map((t) => html`<a href="#/society" data-ctab="${t[0]}" class="${tab === t[0] ? 'on' : ''}" role="tab">${icon(t[2])} <span>${t[1]}</span></a>`)}</div>
      <div id="civicBody">${body}</div>${cityPot(d)}`.__raw;
  };
  const reload = async () => { if (!box.isConnected) return; if (await load()) { draw(); } };
  if (!(await load())) return;
  if (tab === 'titles') api('POST', '/api/civic/titles/check').then(() => reload()).catch(() => {});
  draw();
  on(box, 'click', '[data-ctab]', (e, t) => {
    e.preventDefault(); tab = t.dataset.ctab; ctx.ui.civicTab = tab; draw();
    if (tab === 'titles') api('POST', '/api/civic/titles/check').then((r) => { if (r.changed) { if (r.view) { ctx.setView(r.view); ctx.hud(); } reload(); } }).catch(() => {});
  });
  const live = () => { if (!document.querySelector('.modal-backdrop') && box.isConnected) reload(); };
  window.addEventListener('tp-live-civic', live, { once: false }); box.__off = () => window.removeEventListener('tp-live-civic', live);
  // Vereine
  on(box, 'click', '[data-club-found]', () => foundClubDialog(ctx, d, reload));
  on(box, 'click', '[data-club-open]', (e, b) => clubDialog(ctx, Number(b.dataset.clubOpen), reload));
  on(box, 'click', '[data-club-join]', async (e, b) => {
    if (!(await ctx.confirm({ title: `Dem Verein „${b.dataset.name}“ beitreten?`, text: `Der erste Jahresbeitrag (${money(Number(b.dataset.fee), d.currency)}) wird sofort abgebucht, danach jedes Jahr.`, ok: 'Beitreten' }))) return;
    if (await call(ctx, `/api/civic/club/${b.dataset.clubJoin}/join`)) reload();
  });
  on(box, 'click', '[data-club-leave]', async (e, b) => {
    if (!(await ctx.confirm({ title: 'Austreten?', text: `Du verlässt den Verein „${b.dataset.name}“.`, ok: 'Austreten' }))) return;
    if (await call(ctx, `/api/civic/club/${b.dataset.clubLeave}/leave`)) reload();
  });
  // Gemeinde
  on(box, 'click', '[data-parish-join]', async (e, b) => {
    if (!(await ctx.confirm({ title: `Der ${b.dataset.name} beitreten?`, text: 'Die Mitgliedschaft bleibt deiner Familie über die Generationen erhalten. Du kannst jederzeit austreten.', ok: 'Beitreten' }))) return;
    if (await call(ctx, '/api/civic/parish/join', { faith: b.dataset.parishJoin })) reload();
  });
  on(box, 'click', '[data-parish-leave]', async () => { if (await ctx.confirm({ title: 'Aus der Gemeinde austreten?', text: 'Dein Gemeinde-Ansehen verfällt. Ein neuer Beitritt ist erst nach einer Wartezeit möglich.', ok: 'Austreten' }) && await call(ctx, '/api/civic/parish/leave')) reload(); });
  on(box, 'click', '[data-parish-donate]', async () => { const v = await ask({ title: 'An die Gemeinde spenden', text: `Die Spende füllt die Gemeindekasse und stärkt dein Gemeinde-Ansehen. Kleinste Spende: ${money(d.parish.donate.min, d.currency)}.`, label: `Betrag (${d.currency === 'EUR' ? '€' : 'DM'})`, value: '10.00', ok: 'Spenden' }); if (v != null && await call(ctx, '/api/civic/parish/donate', { amount: v })) reload(); });
  on(box, 'click', '[data-parish-aid]', async () => { if (await call(ctx, '/api/civic/parish/aid')) reload(); });
  on(box, 'click', '[data-parish-cer]', async (e, b) => {
    const k = b.dataset.parishCer; const label = d.parish.ceremonies.labels[k]; const fee = d.parish.ceremonies.fees[k];
    if (!(await ctx.confirm({ title: `${label} feiern?`, text: `Die Gebühr (${money(fee, d.currency)}) geht in die Gemeindekasse.`, ok: 'Feiern' }))) return;
    if (await call(ctx, '/api/civic/parish/ceremony', { kind: k, child: Number(b.dataset.child) || 0, id: Number(b.dataset.id) || 0 })) { if (window.TPMotion) window.TPMotion.confetti(); reload(); }
  });
  // Stiftung
  on(box, 'click', '[data-fd-found]', async () => {
    const purpose = (box.querySelector('input[name="fd-purpose"]:checked') || {}).value;
    const r = await call(ctx, '/api/civic/foundation/found', { name: box.querySelector('#fd-name').value, purpose, amount: box.querySelector('#fd-amount').value, payoutPct: Number(box.querySelector('#fd-pct').value) });
    if (r) { if (window.TPMotion) window.TPMotion.confetti(); reload(); }
  });
  on(box, 'click', '[data-fd]', async (e, b) => {
    const a = b.dataset.fd; const cur = d.currency; const f = d.foundation.mine;
    if (a === 'give') { const v = await ask({ title: 'Zustiften', text: `Das Geld bleibt dauerhaft im Stiftungsvermögen. Kleinste Zustiftung: ${money(d.foundation.giveMin, cur)}. Danach ist das Vermögen wieder 30 Tage gebunden.`, label: `Betrag (${cur === 'EUR' ? '€' : 'DM'})`, value: inp(d.foundation.giveMin), ok: 'Zustiften', ic: 'crown' }); if (v != null && await call(ctx, '/api/civic/foundation/give', { amount: v })) reload(); }
    else if (a === 'set') { const v = await ask({ title: 'Ausschüttung ändern', text: `Wie viel Prozent des Vermögens schüttet die Stiftung jährlich aus? (${d.foundation.payout.min} bis ${d.foundation.payout.max}) Der Ertrag beträgt etwa ${d.foundation.yieldPct} %: Liegt die Ausschüttung darunter, wächst das Vermögen.`, label: 'Prozent im Jahr', value: String(f.payoutPct), ok: 'Speichern', ic: 'crown' }); if (v != null && await call(ctx, '/api/civic/foundation/set', { payoutPct: Number(v) })) reload(); }
    else if (a === 'will') { const v = await ask({ title: 'Vermächtnis', text: `Wie viel Prozent deines Bargelds sollen beim Tod an die Stiftung gehen (0 bis ${d.foundation.willMax})? Deine Kinder teilen sich den Rest.`, label: 'Prozent des Bargelds', value: String(f.will || 0), ok: 'Festlegen', ic: 'crown' }); if (v != null && await call(ctx, '/api/civic/foundation/will', { pct: Number(v) })) reload(); }
    else if (a === 'dissolve') { if (await ctx.confirm({ title: 'Stiftung auflösen?', text: 'Du bekommst das Vermögen zurück, abzüglich der Kosten der Auflösung. Der Titel „Stifter“ richtet sich dann nach dem, was eingebracht bleibt.', ok: 'Auflösen', danger: true }) && await call(ctx, '/api/civic/foundation/dissolve')) reload(); }
  });
  // Titel
  on(box, 'click', '[data-titles-check]', async () => { const r = await call(ctx, '/api/civic/titles/check'); if (r) reload(); });
}

/** Einstieg von außen (z. B. aus „Zeig mir’s“): Reiter wählen. */
export function openCivicTab(ctx, tab) { ctx.ui.civicTab = tab; }
void term;
