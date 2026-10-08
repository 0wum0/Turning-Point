/* Einsteiger-Erlebnis (Oberfläche): Willkommensdialog, Hilfe-Menü, später Aufgabenreihe, „Was jetzt?“, Freischaltungen. */
import { html, icon, modal, money, num } from './ui.js';

/** Tempo der Spielzeit aus der Uhr der Ansicht (Standard: 24 Std. = 1 Jahr, ein Tag ≈ 4 Min.). */
export function pace(v) {
  const perMs = v.clock && v.clock.perMs ? v.clock.perMs : 365 / 86400000;
  const hoursPerYear = Math.round((365 / (perMs * 3600000)) * 10) / 10;
  const minPerDay = Math.max(1, Math.round((1 / perMs / 60000) * 10) / 10);
  return { hoursPerYear, minPerDay };
}

const dec = (x) => String(x).replace('.', ',');

function slides(v) {
  const p = pace(v);
  const cur = v.currency;
  return [
    { ic: 'hourglass', title: `Willkommen im Jahr ${v.date.year}`, body: html`
      <p>Du bist ${v.person.age} Jahre alt, auf dich allein gestellt und hast ${money(v.money, cur)}, einen erlernten Beruf – und kein Zuhause.</p>
      <p><b>Dein Ziel:</b> Baue Schritt für Schritt ein Leben auf – mit Arbeit, Wohnung, Familie und vielleicht einer eigenen Firma. Gib dein Lebenswerk an deine Kinder weiter. So wächst über Generationen ein Vermächtnis, bis ins Jahr ${v.legacy.target}.</p>` },
    { ic: 'clock', title: 'Die Uhr läuft von selbst', body: html`
      <p>Das Spiel läuft in Echtzeit: ${dec(p.hoursPerYear)} Stunden in der echten Welt sind ein Jahr im Spiel. Ein Spieltag dauert etwa ${dec(p.minPerDay)} Minuten.</p>
      <p>Du musst nichts abwarten oder drücken: Lohn, Miete und Alltag werden automatisch verrechnet – auch dann, wenn du das Spiel schließt.</p>
      <p><b>EFS</b> sind dein Vorrat an Spieltagen (1 EFS = 1 Tag). Du kannst sie einsetzen, um die Zeit zusätzlich vorzuspulen – aber nur, wenn du es willst.</p>
      <p class="dim">Du hast gerade ${num(v.efs.pool)} EFS.</p>` },
    { ic: 'heart-pulse', title: 'Vier Anzeigen halten dich am Leben', body: html`
      <ul class="wl-list">
        <li>${icon('refrigerator')}<div><b>Kühlschrank</b> – dein Essensvorrat. Ist er leer, hast du Hunger.</div></li>
        <li>${icon('smile')}<div><b>Wohlbefinden</b> – deine Stimmung. Gutes Essen, Arbeit und ein Zuhause heben sie.</div></li>
        <li>${icon('moon')}<div><b>Erholung</b> – wie ausgeruht du bist. Auf der Straße schläfst du schlecht, in einer Wohnung gut.</div></li>
        <li>${icon('heart-pulse')}<div><b>Gesundheit</b> – fällt sie auf null, stirbt dein Charakter. Alle anderen Anzeigen wirken auf sie.</div></li>
      </ul>
      <p class="dim small">Du findest sie oben im Kopfbereich. Ein Klick darauf erklärt sie genauer.</p>` },
    { ic: 'map-pin', title: 'Wo klicke ich?', body: html`
      <ul class="wl-list">
        <li>${icon('newspaper')}<div><b>Zeitung</b> – Hier stehen Arbeit, Wohnungen und Neuigkeiten. Dein erster Weg.</div></li>
        <li>${icon('shopping-basket')}<div><b>Haushalt</b> – Hier kaufst du Essen für den Kühlschrank.</div></li>
        <li>${icon('home')}<div><b>Übersicht</b> – Oben stehen „Was jetzt?“ und „Deine ersten Schritte“. Sie zeigen dir immer, was als Nächstes sinnvoll ist, und führen dich mit einem Klick dorthin.</div></li>
      </ul>
      <p class="dim small">Alles andere schaltet sich nach und nach frei. Über den Hilfe-Knopf „?“ oben rechts öffnest du diese Einführung jederzeit wieder.</p>` },
  ];
}

/** Willkommensdialog in 4 kurzen Folien. onDone wird beim Schließen aufgerufen (auch beim Überspringen). */
export function openWelcome(ctx, { first = false, onDone } = {}) {
  const v = ctx.view; const S = slides(v); let i = 0;
  const draw = () => {
    const s = S[i]; const last = i === S.length - 1;
    box.el.innerHTML = html`
      <div class="wl-top"><span class="wl-step">${i + 1} / ${S.length}</span><button class="btn ghost sm" data-close="skip">${first ? 'Überspringen' : 'Schließen'}</button></div>
      <div class="wl-ic">${icon(s.ic)}</div>
      <h3 class="wl-title">${s.title}</h3>
      <div class="wl-body">${s.body}</div>
      <div class="wl-dots" aria-hidden="true">${S.map((_, k) => html`<i class="${k === i ? 'on' : ''}"></i>`)}</div>
      <div class="row spread mt">${i > 0 ? html`<button class="btn ghost" data-wl="back">Zurück</button>` : html`<span></span>`}
        ${last ? html`<button class="btn primary" data-close="done">Los geht’s</button>` : html`<button class="btn primary" data-wl="next">Weiter</button>`}</div>`.__raw;
    const b = box.el.querySelector('.btn.primary'); if (b) b.focus();
  };
  const box = modal(html`<div></div>`, { onClose: () => { if (onDone) onDone(); } });
  box.el.classList.add('welcome'); box.el.setAttribute('aria-label', 'Willkommen');
  box.el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-wl]'); if (!b) return;
    i = Math.max(0, Math.min(S.length - 1, i + (b.dataset.wl === 'next' ? 1 : -1))); draw();
  });
  draw();
  return box;
}

/** Beim ersten Start automatisch zeigen und als gesehen melden. */
export function maybeWelcome(ctx) {
  const o = ctx.view && ctx.view.onboarding;
  if (!o || !o.welcome || ctx.__welcomed) return;
  ctx.__welcomed = true;
  const done = () => { ctx.act('seen', { key: 'welcome' }, { silent: true, noRender: true }).catch(() => {}); };
  openWelcome(ctx, { first: true, onDone: done });
}

/** Hilfe-Menü hinter dem „?“-Knopf im Kopfbereich. */
export function openHelp(ctx) {
  const m = modal(html`<h3>${icon('lightbulb')} Hilfe</h3>
    <div class="stack" style="--gap:.5rem">
      <button class="linkrow" data-help-do="welcome">${icon('play')}<span class="grow"><b>Einführung ansehen</b><div class="dim small">Die vier Folien zum Spielstart – in einer Minute gelesen.</div></span></button>
    </div>
    <div class="row end mt"><button class="btn primary" data-close="x">Schließen</button></div>`);
  m.el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-help-do]'); if (!b) return;
    const k = b.dataset.helpDo; m.close();
    if (k === 'welcome') openWelcome(ctx, {});
  });
  return m;
}
