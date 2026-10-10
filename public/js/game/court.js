/* Recht & Gericht (Oberfläche): Spuren, Anzeige, Verfahren als Zeitleisten-Karten, Sperren-Banner, Dein Amt. Daten: /api/court */
import { html, icon, api, on, modal, toast, money, term, infoBtn, mount } from './ui.js';

const ACT_IC = { sabotage: 'flame', spy: 'search', poach: 'users', price: 'trending-down', breach: 'scroll', default: 'package', evict: 'house', fraud: 'receipt-text', bribe: 'banknote' };
const STATE_TONE = { filed: 'info', investigation: 'info', hearing: 'warn', verdict: 'warn', appeal: 'warn', final: 'good', settled: 'good', dismissed: 'dim', withdrawn: 'dim' };
const BAND_TONE = { stark: 'good', mittel: 'warn', schwach: 'bad' };
const fmt = (ms) => new Date(ms).toLocaleString(document.documentElement.lang === 'en' ? 'en-GB' : 'de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const inTxt = (ms) => { const h = (ms - Date.now()) / 3600000; if (h <= 0) return 'gleich'; if (h < 1) return `in ${Math.max(1, Math.round(h * 60))} Min.`; if (h < 48) return `in ${Math.round(h)} Std.`; return `in ${Math.round(h / 24)} Tagen`; };

export const courtSkeleton = () => html`<section class="card mt" id="courtBox"><div class="dim small">Lade …</div></section>`;

/** Banner für die Übersicht: aktive Einschränkungen (mit Ende) und offene Pflichten. */
export function courtBanner(ctx) {
  const c = ctx.view && ctx.view.court; if (!c) return '';
  const now = Date.now();
  const r = (c.r || []).filter((x) => x.until > now);
  if (!r.length && !c.act && !c.debt) return '';
  return html`<section class="card mt court-banner ${r.length ? 'bad' : 'warn'}">
    <div class="row spread"><div class="card-title" style="margin:0">${icon('gavel')} Recht & Gericht</div><button class="btn sm" data-go="society">Öffnen</button></div>
    ${r.map((x) => html`<div class="alert warn mt small">${icon('lock')}<div><b>${x.label}</b> bis ${fmt(x.until)} (${inTxt(x.until)}).${x.k === 'haft' ? ' Wirtschaftliche Handlungen sind gesperrt; Essen, Schlafen, Briefe, Chat und Politik gehen weiter, und deine Spielzeit läuft geschützt.' : x.k === 'gewerbe' ? ' Du darfst keine Betriebe gründen, kaufen oder ausbauen.' : x.k === 'beruf' ? ' Diese Betriebsart darfst du nicht führen.' : ' Der Betrieb steht still.'}</div></div>`)}
    ${c.act ? html`<div class="alert info mt small">${icon('siren')}<div>Du wurdest angezeigt. Rechtsanwalt, Vergleich oder Geständnis – <a href="#/society" data-go="society">jetzt entscheiden</a>.</div></div>` : ''}
    ${c.debt ? html`<div class="small dim mt">Offene gerichtliche Zahlungen: ${money(c.debt, ctx.view.currency)} – sie werden bei Gelegenheit abgebucht.</div>` : ''}
  </section>`;
}

function evidenceCard(e, cur, costs) {
  return html`<div class="firm court-ev" style="align-items:flex-start" data-ev="${e.id}">
    <span class="dir-ic">${icon(ACT_IC[e.act] || 'search')}</span>
    <div class="grow">
      <b>${e.label}</b>${e.subject ? html` <span class="dim small">bei <span data-i18n-skip>${e.subject}</span></span>` : ''}
      <div class="small mt-s"><span class="chip ${BAND_TONE[e.band]}">Beweislage: ${e.band} (${e.strength})</span> ${e.known ? html`<span class="chip good">Täter bekannt</span>` : html`<span class="chip">Täter unbekannt</span>`}
        <span class="dim"> · verblasst, noch ${e.leftHours >= 48 ? Math.round(e.leftHours / 24) + ' Tage' : e.leftHours + ' Std.'} verwertbar</span></div>
      ${e.damage ? html`<div class="small dim">Dokumentierter Schaden: ${money(e.damage, cur)}</div>` : ''}
      ${e.suspect ? html`<div class="small mt-s">${icon('search')} Verdacht: <b data-i18n-skip>${e.suspect.name}</b> (Sicherheit ca. ${e.suspect.conf} %) – prüfe das gut, Hinweise können irren.</div>` : ''}
      ${e.detective ? html`<div class="small mt-s">${icon('hourglass')} Detektiv arbeitet, Ergebnis ${inTxt(e.detective.until)}.</div>` : ''}
      <div class="row mt-s" style="flex-wrap:wrap;gap:.4rem">
        ${e.canFile ? html`<button class="btn sm primary" data-file="${e.id}">${icon('gavel')} Anzeige erstatten</button>` : html`<span class="chip warn">Zu schwach für eine Anzeige</span>`}
        ${e.canDetective ? html`<button class="btn sm" data-evact="detective" data-id="${e.id}" data-cost="${costs.detective}">Detektiv (${money(costs.detective, cur)})</button>` : ''}
        ${e.canWitness ? html`<button class="btn sm" data-evact="witness" data-id="${e.id}" data-cost="${costs.witness}">Zeugen befragen (${money(costs.witness, cur)})</button>` : ''}
        ${e.canDocs ? html`<button class="btn sm" data-evact="docs" data-id="${e.id}" data-cost="${costs.docs}">Schaden dokumentieren (${money(costs.docs, cur)})</button>` : ''}
      </div>
    </div></div>`;
}

const ACTION_LABEL = { lawyer: 'Rechtsanwalt', detective: 'Detektiv', confess: 'Gestehen', offer: 'Vergleich anbieten', accept: 'Vergleich annehmen', decline: 'Ablehnen', withdraw: 'Anzeige zurückziehen', appeal: 'Berufung', bribe: 'Richter bestechen' };

function caseCard(c, cur) {
  const tone = STATE_TONE[c.state];
  const next = c.actions.includes('accept') ? 'accept' : c.actions.includes('lawyer') && c.role === 'd' ? 'lawyer' : c.actions.includes('appeal') ? 'appeal' : null;
  const v = c.verdict;
  return html`<div class="card flat court-case" data-case="${c.id}">
    <div class="row spread" style="flex-wrap:wrap;gap:.4rem"><b>${icon(ACT_IC[c.act] || 'gavel')} ${c.label}</b><span class="chip ${tone}">${c.stateLabel}</span></div>
    <div class="small dim">${c.role === 'p' ? 'Du klagst gegen' : 'Du wurdest angezeigt von'} <b data-i18n-skip>${c.other.name}</b> · ${c.court}${c.claim ? html` · Schaden ${money(c.claim, cur)}` : ''}</div>
    ${c.nextAt ? html`<div class="small mt-s">${icon('clock')} ${c.nextText} – nächster Schritt ${inTxt(c.nextAt)} (${fmt(c.nextAt)})</div>` : ''}
    ${c.role === 'p' && c.strengthBand ? html`<div class="small">Beweislage: <b>${c.strengthBand}</b>${c.detectives ? ` · ${c.detectives} Detektiv(e)` : ''}</div>` : ''}
    <div class="small">${c.lawyerMine ? html`<span class="chip good">Dein Rechtsanwalt</span>` : ''} ${c.lawyerOther ? html`<span class="chip warn">Gegenseite mit Anwalt</span>` : ''}${c.confessed ? html` <span class="chip warn">Geständnis</span>` : ''}</div>
    ${c.offer ? html`<div class="alert info mt small">${icon('handshake')}<div>${c.offer.mine ? 'Dein Vergleichsvorschlag' : 'Vergleichsvorschlag der Gegenseite'}: <b>${money(c.offer.amount, cur)}</b>${c.offer.expired ? ' (abgelaufen)' : ''}. Mit einem ${term('Vergleich')} sparen beide die Gerichtskosten.</div></div>` : ''}
    ${v ? html`<div class="alert ${v.guilty ? (c.role === 'd' ? 'bad' : 'good') : (c.role === 'd' ? 'good' : 'warn')} mt small">${icon(v.guilty ? 'gavel' : 'circle-check')}<div><b>${v.guilty ? `Schuldig (Stufe ${v.level})` : 'Freispruch'}</b>${v.guilty ? html`: ${v.plan.map((s) => s.label + (s.real ? ` ${money(s.real, cur)}` : s.hours ? ` ${s.hours >= 24 ? Math.round(s.hours / 24 * 10) / 10 + ' Tage' : s.hours + ' Std.'}` : '')).join(', ')}` : ''}${v.appealUntil ? html`<br>Berufung möglich bis ${fmt(v.appealUntil)}.` : ''}</div></div>` : ''}
    <details class="mt-s"><summary class="small dim">Verlauf (${c.timeline.length})</summary><ol class="court-tl small">${c.timeline.map((e) => html`<li><span class="dim">${fmt(e.at)}</span> <b>${e.title}</b> – ${e.text}</li>`)}</ol></details>
    <div class="row mt" style="flex-wrap:wrap;gap:.4rem">
      ${next ? html`<button class="btn sm primary" data-cact="${next}" data-id="${c.id}">${ACTION_LABEL[next]}</button>` : ''}
      ${c.actions.filter((a) => a !== next && a !== 'decline').map((a) => html`<button class="btn sm ${a === 'confess' || a === 'bribe' ? 'ghost' : ''}" data-cact="${a}" data-id="${c.id}">${ACTION_LABEL[a]}</button>`)}
      ${c.actions.includes('accept') ? html`<button class="btn sm ghost" data-cact="decline" data-id="${c.id}">Ablehnen</button>` : ''}
    </div></div>`;
}

export async function bindCourt(root, ctx) {
  const box = root.querySelector('#courtBox'); if (!box) return;
  window.dispatchEvent(new CustomEvent('tp-seen', { detail: 'court' }));
  let d; let pol;
  const load = async () => {
    try { d = await api('GET', '/api/court'); } catch (e) { box.remove(); return false; }
    if (!d.enabled) { box.remove(); return false; }
    try { pol = await api('GET', '/api/court/policy'); } catch (_) { pol = null; }
    return true;
  };
  const refreshView = async (r) => { if (r && r.view) { ctx.setView(r.view); ctx.hud(); } };
  const draw = () => {
    const cur = ctx.view.currency; const open = d.cases.filter((c) => c.open); const done = d.cases.filter((c) => !c.open);
    const lim = d.limits;
    mount(box, html`
      <div class="card-title">${icon('gavel')} Recht & Gericht ${infoBtn(['Feindliche Taten (Sabotage, Spionage, Vertragsbruch …) hinterlassen Spuren. Das Opfer sammelt Beweise und kann Anzeige erstatten; ein Gericht entscheidet.', 'Ohne Beweise ist eine Anzeige aussichtslos, und eine haltlose Anzeige schadet dir selbst. Spuren verblassen mit der Zeit.', 'Sammle Beweise (Detektiv, Zeugen, Dokumentation), erstatte Anzeige – oder einige dich mit der Gegenseite auf einen Vergleich.'], 'Recht & Gericht')}</div>
      <p class="dim small">Amtsgericht ${ctx.view.city.name} · ${term('Beweis', 'Beweise')} · ${term('Anzeige')} · ${term('Vergleich')} · ${term('Gericht')}. Polizei vor Ort: <b>${d.local.policeName}</b>.</p>
      ${d.restrictions.length ? html`<div class="stack" style="--gap:.4rem">${d.restrictions.map((r) => html`<div class="alert warn small">${icon('lock')}<div><b>${r.label}</b> bis ${fmt(r.until)} (${inTxt(r.until)})</div></div>`)}</div>` : ''}
      ${d.debts.length ? html`<div class="stack mt" style="--gap:.4rem">${d.debts.map((r) => html`<div class="alert info small">${icon('receipt-text')}<div>${r.label}${r.to ? ' an ' + r.to : ' (Staat)'}: noch <b>${money(r.left, cur)}</b>, wird bis ${fmt(r.due)} abgebucht.</div></div>`)}</div>` : ''}
      <div class="card-title mt" style="margin-bottom:.3rem">Meine Verfahren ${open.length ? html`<span class="chip">${open.length}</span>` : ''}</div>
      ${open.length ? html`<div class="stack" style="--gap:.7rem">${open.map((c) => caseCard(c, cur))}</div>` : html`<div class="dim small">Keine laufenden Verfahren.</div>`}
      ${done.length ? html`<details class="mt"><summary class="small dim">Abgeschlossene Verfahren (${done.length})</summary><div class="stack mt" style="--gap:.7rem">${done.map((c) => caseCard(c, cur))}</div></details>` : ''}
      <div class="card-title mt" style="margin-bottom:.3rem">Spuren ${d.evidence.length ? html`<span class="chip warn">${d.evidence.length}</span>` : ''}</div>
      <p class="dim small">Diese Spuren hast du gesichert. Den Täter erfährst du nie umsonst – nur durch Detektiv, Zeugen oder wenn er erwischt wurde. Anzeigen: ${lim.weekUsed} von ${lim.weekMax} diese Woche · Gebühr ${money(d.costs.complaint, cur)} · mindestens Beweislage ${lim.minStrength}.</p>
      ${d.evidence.length ? html`<div class="stack" style="--gap:.6rem">${d.evidence.map((e) => evidenceCard(e, cur, d.costs))}</div>` : html`<div class="dim small">Keine Spuren. Wenn dir jemand schadet, erscheint hier ein Hinweis „Spuren gesichert“.</div>`}
      ${officeSection()}`);
  };
  function officeSection() {
    if (!pol || !pol.office) return html`<details class="mt"><summary class="small dim">Wer bestimmt die Regeln?</summary><p class="small dim">Gewählte Amtsinhaber bestimmen Polizeibudget (Stadtrat, Bürgermeister), Strafrahmen (Landtag), Strafgesetz (Bundestag), Verjährung und Amnestie (Bundeskanzler). Dein Amt entscheidest du unter „Dein Amt“.</p>${pol && pol.active.length ? html`<ul class="small">${pol.active.map((a) => html`<li>${a.text}</li>`)}</ul>` : ''}</details>`;
    const o = pol.office;
    return html`<div class="card-title mt" style="margin-bottom:.3rem">${icon('landmark')} Dein Amt: Recht und Ordnung</div>
      ${o.used ? html`<div class="alert good small">${icon('circle-check')}<div>In dieser Amtszeit beschlossen: ${o.used.text}</div></div>`
      : !o.powers.length ? html`<div class="alert info small">${icon('info')}<div>Dieses Amt hat keine Macht über Gerichte.</div></div>`
      : !o.cityOk ? html`<div class="alert warn small">${icon('triangle-alert')}<div>Du bist in einer anderen Stadt gewählt worden.</div></div>`
      : html`<div class="stack" style="--gap:.7rem">${o.powers.map((p) => html`<div class="pol"><b>${p.name}</b><div class="dim small">${p.what}</div>
        <div class="field mt"><select data-polsel="${p.kind}">${p.options.map((x) => html`<option value="${x.value}">${x.label}</option>`)}</select></div>
        <div class="row end mt"><button class="btn sm primary" data-polprev="${p.kind}">Wirkung ansehen</button></div></div>`)}</div>`}
      ${pol.active.length ? html`<div class="small mt dim">Aktuelle Beschlüsse: ${pol.active.map((a) => a.text).join(' · ')}</div>` : ''}`;
  }

  async function act(name, id, kind) { // Handlung im Verfahren
    const c = d.cases.find((x) => x.id === Number(id)); if (!c) return;
    const cur = ctx.view.currency;
    let body = {};
    const costTxt = { lawyer: c.costs.lawyer, detective: c.costs.detective, appeal: c.costs.appeal, bribe: c.costs.bribe }[name];
    const conf = {
      lawyer: ['Rechtsanwalt beauftragen?', `Ein Rechtsanwalt stärkt deine Seite vor Gericht. Kosten: ${money(costTxt, cur)}.`],
      detective: ['Detektiv beauftragen?', `Der Detektiv verkürzt die Ermittlung und stärkt die Beweislage. Kosten: ${money(costTxt, cur)}.`],
      confess: ['Wirklich gestehen?', 'Mit einem Geständnis steht das Urteil sofort fest, die Strafe fällt aber milder aus (ca. 40 % weniger). Berufung ist dann nicht mehr möglich.'],
      withdraw: ['Anzeige zurückziehen?', 'Das Verfahren endet. Die Gebühr bekommst du nicht zurück; die Spuren bleiben, verblassen aber weiter.'],
      appeal: ['Berufung einlegen?', `Das Berufungsgericht entscheidet neu – einmalig. Gebühr: ${money(costTxt, cur)}. Rechtsanwälte musst du neu beauftragen.`],
      bribe: ['Den Richter bestechen?', `Riskant: Mit etwa 35 % Chance hilft es, aber der Versuch hinterlässt selbst Spuren und kann dich vor Gericht bringen. Kosten: ${money(costTxt, cur)}.`],
      accept: ['Vergleich annehmen?', `Das Verfahren endet sofort. ${c.role === 'd' ? 'Du zahlst' : 'Der Beklagte zahlt'} ${money(c.offer ? c.offer.amount : 0, cur)}; es gibt keine Gerichtskosten und keinen Schuldspruch.`],
      decline: ['Vergleich ablehnen?', 'Das Verfahren läuft weiter.'],
    }[name];
    if (name === 'offer') {
      const v = await askAmount(ctx, c, cur); if (v == null) return; body = { amount: v };
    } else if (conf && !(await ctx.confirm({ title: conf[0], text: conf[1], ok: ACTION_LABEL[name] || 'OK', danger: ['confess', 'bribe', 'withdraw'].includes(name) }))) return;
    try {
      const r = await api('POST', `/api/court/case/${id}/${name}`, body);
      await refreshView(r); toast(r.message || 'Erledigt.', r.level || 'good'); await load(); draw(); ctx.rerender && void 0;
    } catch (e) { toast(e.message, 'warn'); }
    void kind;
  }

  async function startFile(evId) {
    const e = d.evidence.find((x) => x.id === Number(evId)); if (!e) return;
    const cur = ctx.view.currency;
    const dlg = modal(html`<h3>${icon('gavel')} Anzeige erstatten</h3>
      <p class="small">Fall: <b>${e.label}</b>${e.subject ? ' bei ' + e.subject : ''}. Beweislage: <b>${e.band}</b>. Gebühr: <b>${money(d.costs.complaint, cur)}</b> (nicht erstattbar).</p>
      <div class="alert warn small">${icon('triangle-alert')}<div>Zeige nur jemanden an, bei dem du dir sicher bist. Eine haltlose Anzeige kostet dich eine Geldbuße (${money(d.costs.falseFine, cur)}) und Ansehen.</div></div>
      ${e.suspect ? html`<button class="btn mt" data-pick="${e.suspect.id}" data-name="${e.suspect.name}">Verdächtigen anzeigen: <span data-i18n-skip>${e.suspect.name}</span> (${e.suspect.conf} %)</button>` : ''}
      <div class="field mt"><label for="cqs">Oder Spieler suchen (Name)</label><input id="cqs" type="text" autocomplete="off" maxlength="40"></div>
      <div id="cres" class="stack mt" style="--gap:.4rem"></div>
      <div class="row end mt"><button class="btn ghost" data-close="x">Abbrechen</button></div>`);
    let timer = 0;
    const pick = async (id, name) => {
      if (!(await ctx.confirm({ title: `${name} anzeigen?`, text: `Die Anzeige kostet ${money(d.costs.complaint, cur)}. ${name} wird benachrichtigt und kann sich verteidigen.`, ok: 'Anzeige erstatten', danger: true }))) return;
      try { const r = await api('POST', '/api/court/file', { evidenceId: e.id, defendantId: Number(id) }); dlg.close(); await refreshView(r); toast(r.message || 'Anzeige erstattet.'); await load(); draw(); } catch (er) { toast(er.message, 'warn'); }
    };
    on(dlg.el, 'click', '[data-pick]', (ev, t) => pick(t.dataset.pick, t.dataset.name));
    dlg.el.querySelector('#cqs').addEventListener('input', (ev) => {
      clearTimeout(timer); const q = ev.target.value.trim();
      timer = setTimeout(async () => {
        const res = dlg.el.querySelector('#cres'); if (q.length < 2) { res.innerHTML = ''; return; }
        try { const r = await api('GET', `/api/court/suspects?q=${encodeURIComponent(q)}`); mount(res, html`${r.list.map((p) => html`<button class="linkrow" data-pick="${p.id}" data-name="${p.name}"><b data-i18n-skip>${p.name}</b> <span class="dim small">@${p.username}</span></button>`)}${r.list.length ? '' : html`<div class="dim small">Niemand gefunden.</div>`}`); } catch (_) { /* leer */ }
      }, 300);
    });
  }

  on(box, 'click', '[data-file]', (e, t) => startFile(t.dataset.file));
  on(box, 'click', '[data-evact]', async (e, t) => {
    const cur = ctx.view.currency; const kind = t.dataset.evact;
    const txt = { detective: 'Ein Detektiv ermittelt einige Stunden und stärkt die Beweislage. Er kann den Täter nennen – oder sich irren.', witness: 'Zeugen stützen die Beweislage ein wenig, ihre Hinweise sind unsicher.', docs: 'Die Dokumentation des Schadens stärkt die Beweislage und belegt die Höhe des Schadenersatzes.' }[kind];
    if (!(await ctx.confirm({ title: 'Beweise stärken?', text: `${txt} Kosten: ${money(Number(t.dataset.cost), cur)}.`, ok: 'Beauftragen' }))) return;
    try { const r = await api('POST', `/api/court/evidence/${t.dataset.id}/${kind}`); await refreshView(r); toast(r.message || 'Erledigt.', r.level || 'good'); await load(); draw(); } catch (er) { toast(er.message, 'warn'); }
  });
  on(box, 'click', '[data-cact]', (e, t) => act(t.dataset.cact, t.dataset.id));
  on(box, 'click', '[data-polprev]', async (e, t) => {
    const kind = t.dataset.polprev; const value = Number(box.querySelector(`[data-polsel="${kind}"]`).value);
    let pv; try { pv = await api('POST', '/api/court/policy/preview', { kind, value }); } catch (er) { toast(er.message, 'bad'); return; }
    const dlg = modal(html`<h3>${icon('scale')} Das passiert</h3><p class="small"><b>${pv.text}</b></p><ul class="pol-fx">${pv.lines.map((l) => html`<li>${l}</li>`)}</ul>
      <p class="small dim">Der Beschluss gilt bis zum Ende deiner Amtszeit und kann nicht zurückgenommen werden.</p>
      <div class="row end mt"><button class="btn ghost" data-close="no">Abbrechen</button><button class="btn primary" id="polgo">Beschließen</button></div>`);
    dlg.el.querySelector('#polgo').onclick = async () => { try { const r = await api('POST', '/api/court/policy/set', { kind, value }); await refreshView(r); toast(r.message || 'Beschluss gefasst.'); dlg.close(); await load(); draw(); } catch (er) { toast(er.message, 'bad'); } };
  });
  if (await load()) draw();
  box.__reload = async () => { if (await load()) draw(); };
  window.addEventListener('tp-live-court', () => { if (box.isConnected) box.__reload(); });
}

function askAmount(ctx, c, cur) {
  return new Promise((resolve) => {
    const dlg = modal(html`<h3>${icon('handshake')} Vergleich anbieten</h3>
      <p class="small">Der Beklagte zahlt einmalig einen Betrag, das Verfahren endet ohne Urteil. Beide sparen die Gerichtskosten. Höchstens ${money(c.settleCap, cur)}${c.claim ? `; der geforderte Schaden ist ${money(c.claim, cur)}` : ''}.</p>
      <div class="field"><label for="amt">Betrag (in ${cur === 'EUR' ? '€' : 'DM'})</label><input id="amt" type="number" min="0" step="1" value="${Math.round((c.offer ? c.offer.amount : c.claim) / 100)}"></div>
      <div class="row end mt"><button class="btn ghost" data-close="no">Abbrechen</button><button class="btn primary" id="amtgo">Vorschlag senden</button></div>`, { onClose: (v) => { if (v !== 'ok') resolve(null); } });
    dlg.el.querySelector('#amtgo').onclick = () => { const v = Math.round(Number(dlg.el.querySelector('#amt').value) * 100); resolve(Number.isFinite(v) && v >= 0 ? v : null); dlg.close('ok'); };
  });
}
