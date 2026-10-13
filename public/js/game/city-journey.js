import { html, icon, on } from './ui.js';
import { journeyOf } from './journey-model.js';
import { runCta } from './onboarding.js';
import { visitCity } from './city-context.js';

export function cityJourney(ctx, data) {
  const journey = journeyOf(ctx.view), next = journey.next;
  if (!data.here) return html`<section class="sim-city-only city-journey"><span class="city-eyebrow">STADTBESUCH</span><h3>${data.city.name} entdecken</h3><p>Du kannst Gebäude ansehen und die örtliche Zeitung lesen. Deine persönlichen Aufgaben erledigst du in ${ctx.view.city.name}.</p><button class="btn primary block" data-journey-home>${icon('house')} Zur eigenen Stadt</button></section>`;
  return html`<section class="sim-city-only city-journey" aria-label="Dein nächster Schritt"><span class="city-eyebrow">DEIN NÄCHSTER SCHRITT</span><h3>${next.title}</h3><p>${next.why}</p><button class="btn primary block" data-journey-next>${icon(next.icon || 'flag')} ${next.cta.label || 'Weiter'}</button>
    <details class="city-life-path"><summary>${icon('route')} Dein Lebensweg <span>${journey.done} / ${journey.total}</span></summary><p>Diese Ziele verbinden deine Möglichkeiten. Du bestimmst deinen Weg; erledigte Schritte werden im Spielstand gespeichert.</p><ol>${journey.chapters.map(chapter=>html`<li><div><b>${icon(chapter.icon)} ${chapter.title}</b><span>${chapter.done} / ${chapter.total}</span></div><p>${chapter.why}</p><button class="btn ghost sm" data-journey-chapter="${chapter.id}">${chapter.done === chapter.total ? 'Bereich öffnen' : chapter.next.title}</button></li>`)}</ol></details>
  </section>`;
}

export function cityJourneyShortcut(ctx, data) {
  if (!data.here) return '';
  const next = journeyOf(ctx.view).next;
  return html`<button class="sim-city-only city-goal-shortcut" data-journey-next><span>${icon(next.icon || 'flag')} Nächster Schritt</span><b>${next.cta.label || next.title}</b>${icon('arrow-right')}</button>`;
}

export function bindCityJourney(root, ctx) {
  on(root, 'click', '[data-journey-home]', () => visitCity(ctx, ctx.view.city.id, true));
  on(root, 'click', '[data-journey-next], [data-journey-chapter]', async (event, button) => {
    const journey = journeyOf(ctx.view);
    const action = button.dataset.journeyChapter ? journey.chapters.find(c=>c.id===button.dataset.journeyChapter)?.next : journey.next;
    button.disabled = true;
    try { await runCta(ctx, action); } finally { if (button.isConnected) button.disabled = false; }
  });
}
