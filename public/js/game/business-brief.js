import {constructionSummary} from './construction.js';
import { html, icon, money, signed } from './ui.js';
import { businessLife } from './business-life.js';

/** A concise explanation beside the actual room, with no duplicate economy/actions. */
export function businessBrief(c, currency) {
  const life = businessLife(c); if (!life) return '';
  const qty = n => Number(n || 0).toLocaleString(document.documentElement.lang === 'en' ? 'en-US' : 'de-DE', {maximumFractionDigits:2});
  return html`<section class="int-business" data-business-state="${life.active ? 'active' : 'stopped'}" aria-label="Betriebsablauf">
    <span class="city-eyebrow">DEIN BETRIEBSALLTAG</span>
    <h2 class="${life.tone}">${icon(life.active ? 'factory' : 'triangle-alert')} ${life.status}</h2><p>${life.why}</p>
    <ol class="business-cycle"><li><span>Zutaten</span><b>${c.supply?.on ? Math.round(life.supplied * 100) + ' %' : 'Direkteinkauf'}</b></li><li><span>Auslastung</span><b>${Math.round(life.efficiency * 100)} %</b></li><li><span>Gewinn / Tag</span><b class="${life.profit < 0 ? 'neg' : 'pos'}">${signed(life.profit, currency)}</b></li></ol>
    ${constructionSummary(c)}
    <details class="business-ledger"><summary>Waren &amp; Team ansehen</summary>
      <p>${life.workers} Mitarbeiter${life.owner ? ' + du' : ''} · ${c.operation?.managed || c.manager || c.owner ? 'Betrieb geführt' : 'Ohne Betriebsleitung'}</p>
      ${life.inputs.length ? html`<b>Zutaten pro Spieltag</b><ul>${life.inputs.map(n => html`<li>${n.name}: ${qty(n.need)} ${n.unit}</li>`)}</ul>` : html`<p>${c.supply?.on ? 'Keine Rezeptzutaten erforderlich.' : 'Einkauf und Verkauf erfolgen direkt über den Betrieb.'}</p>`}
      ${life.outputs.length ? html`<b>Erzeugnisse pro Spieltag</b><ul>${life.outputs.map(n => html`<li>${n.name}: ${qty(n.units)} ${n.unit}</li>`)}</ul>` : ''}
      <p>Firmenkasse: <b>${money(c.cash, currency)}</b></p>
    </details>
    <button class="btn block" data-business-manage>${icon('briefcase')} Versorgung &amp; Team verwalten</button>
  </section>`;
}
