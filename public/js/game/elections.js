/* Spielerwahlen: Kandidatur, Stimmabgabe, Ergebnisse. Daten kommen von /api/social/elections. */
import { html, icon, api, on, toast, money, infoBtn, modal } from './ui.js';
import { repChip } from './reputation.js';

const dt = (ms) => new Date(ms).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const left = (ms) => { const m = Math.max(0, Math.round((ms - Date.now()) / 60000)); return m >= 1440 ? `${Math.floor(m / 1440)} T. ${Math.floor((m % 1440) / 60)} Std.` : m >= 60 ? `${Math.floor(m / 60)} Std. ${m % 60} Min.` : `${m} Min.`; };

export function renderElections(ctx, d) {
  const cur = ctx.view.currency;
  if (!d.enabled) return html`<div class="alert info">${icon('info')}<div>Spielerwahlen sind gerade abgeschaltet.</div></div>`;
  return html`
  <div class="alert info">${icon('landmark')}<div>${d.phase === 'voting'
    ? html`<b>Wahlfenster offen</b> – noch ${left(d.voteEnd)}. Jedes Konto hat pro Wahl eine Stimme.`
    : html`<b>Kandidaturen möglich</b> – das Wahlfenster öffnet am ${dt(d.voteStart)} und endet am ${dt(d.voteEnd)}.`}
    Ämter bis zur Bürgermeisterwahl werden in deiner Stadt (${d.city}) gewählt, höhere landesweit. Bots dürfen mitstimmen, ihr Gewicht ist begrenzt; bei Gleichstand entscheidet der Einfluss. ${infoBtn(['Wähle in der Wahlphase einen Kandidaten – eine Stimme je Wahl.', 'Wer kandidieren will, zahlt eine Kandidaturgebühr und wird in der Nominierungsphase eingetragen.', 'Der Sieger tritt das Amt automatisch an. Das Ergebnis erscheint im Tagesblatt.'], 'Wahlen')}</div></div>
  <div class="stack mt" style="--gap:.8rem">${d.offices.map((o) => html`<section class="card ${o.isCandidate ? 'glow' : ''}">
    <div class="row spread wrap"><div class="card-title" style="margin:0">${icon('landmark')} ${o.name} <span class="chip">${o.national ? 'landesweit' : o.city}</span></div>
      <span class="dim small">${o.voting ? 'Wahl endet in ' + left(o.voteEnd) : 'Wahl: ' + dt(o.voteStart) + ' – ' + dt(o.voteEnd)}</span></div>
    <div class="stack mt" style="--gap:.4rem">${o.candidates.map((c) => html`<div class="row nowrap spread"><div class="grow"><b>${c.name}</b> ${repChip(c.lv)} <span class="dim small">· Einfluss ${c.influence}</span>${c.mine ? html` <span class="chip accent">Du</span>` : ''}${o.myVote === c.userId ? html` <span class="chip good">${icon('check')} deine Stimme</span>` : ''}${c.platform ? html`<div class="dim small">„${c.platform}“</div>` : ''}</div>
      ${o.canVote && !c.mine ? html`<button class="btn sm primary" data-evote="${o.electionId}:${c.userId}">Wählen</button>` : ''}</div>`)}
      ${o.candidates.length ? '' : html`<div class="dim small">Noch keine Kandidaten.</div>`}</div>
    <div class="row end wrap mt" style="gap:.5rem">${o.isCandidate && !o.voting ? html`<button class="btn sm ghost" data-ewd="${o.electionId}">Kandidatur zurückziehen</button>` : ''}
      ${!o.isCandidate ? html`<span class="dim small">Gebühr ${money(o.fee, cur)}</span><button class="btn sm primary" data-erun="${o.idx}" ${o.canRun ? '' : 'disabled'} title="${o.whyNot || ''}">Kandidieren</button>` : ''}</div>
    ${!o.canRun && !o.isCandidate && o.whyNot ? html`<div class="dim small mt">${/Ansehen/.test(o.whyNot) ? icon('lock') : ''} ${o.whyNot}</div>` : ''}
    ${o.minName ? html`<div class="dim small">${icon('badge-check')} <span>Mindestansehen für dieses Amt:</span> ${o.minName}</div>` : ''}</section>`)}</div>
  <section class="card mt"><div class="card-title">${icon('newspaper')} Letzte Ergebnisse</div>
    ${d.results.length ? html`<div class="stack" style="--gap:.5rem">${d.results.map((r) => html`<div><b>${r.office}</b> <span class="dim small">· ${r.city} · ${dt(r.at)}</span><div class="small">${r.winner ? html`Sieger: <b>${r.winner}</b> (${r.total} Stimmen)` : 'Niemand gewählt.'}${r.ranking.length > 1 ? html` <span class="dim">· ${r.ranking.map((x) => x.name + ' ' + x.votes).join(' · ')}</span>` : ''}</div></div>`)}</div>` : html`<div class="dim small">Noch keine abgeschlossenen Wahlen.</div>`}</section>`;
}

export function bindElections(root, ctx, d, go) {
  const act = async (fn) => { try { await fn(); go(); } catch (e) { toast(e.message, 'warn'); } };
  on(root, 'click', '[data-evote]', (e, t) => { const [electionId, candidateId] = t.dataset.evote.split(':').map(Number); act(async () => { await api('POST', '/api/social/elections/vote', { electionId, candidateId }); toast('Stimme abgegeben.'); }); });
  on(root, 'click', '[data-ewd]', (e, t) => act(async () => { await api('POST', '/api/social/elections/withdraw', { electionId: Number(t.dataset.ewd) }); toast('Kandidatur zurückgezogen.', 'warn'); }));
  on(root, 'click', '[data-erun]', (e, t) => {
    const idx = Number(t.dataset.erun); const o = d.offices.find((x) => x.idx === idx);
    const m = modal(html`<h3>${icon('landmark')} Kandidatur: ${o.name}</h3><p class="dim small">Die Gebühr von ${money(o.fee, ctx.view.currency)} ist verloren, auch wenn du nicht gewählt wirst. Deine Kandidatur ist öffentlich.</p>
      <div class="field"><label for="el-pl">Wahlspruch (optional)</label><input id="el-pl" maxlength="200" placeholder="Für eine starke Stadt"></div>
      <div class="row end mt"><button class="btn ghost" data-close="no">Abbrechen</button><button class="btn primary" id="el-go">Kandidieren</button></div>`);
    m.el.querySelector('#el-go').onclick = async () => { try { const r = await api('POST', '/api/social/elections/run', { idx, platform: m.el.querySelector('#el-pl').value }); if (r.view) { ctx.setView(r.view); ctx.hud(); } toast(r.message || 'Kandidatur eingereicht.'); m.close(); go(); } catch (er) { toast(er.message, 'warn'); } };
  });
}
