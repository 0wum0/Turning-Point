import { isV2 } from './design.js';
import { icon } from './ui.js';

export function startSplash(app) {
  if (!isV2()) {
    document.getElementById('sim-splash')?.remove();
    return { done() {}, finish() {}, cancel() {} };
  }
  let el = document.getElementById('sim-splash');
  if (!el) { el = document.createElement('div'); el.id = 'sim-splash'; el.className = 'sim-splash'; document.body.append(el); }
  el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
  el.innerHTML = `<div class="sim-splash-brand"><div class="sim-splash-seal">${icon('hourglass').__raw}</div><span class="sim-splash-eyebrow">LIFE. WORK. LEGACY.</span><h1>TURNING <b>POINT</b></h1><p>Ein Leben. Tausend Möglichkeiten.</p></div><div class="sim-splash-loading"><div class="sim-splash-status"><b data-splash-status>Deine Geschichte beginnt …</b><span>DEUTSCHLAND</span></div><progress max="3" value="0" aria-label="Spielstart"></progress><div class="sim-splash-steps"><span data-phase="world">01 · Spielwelt</span><span data-phase="state">02 · Dein Leben</span><span data-phase="map">03 · Bereit zum Spielen</span></div><p class="sim-splash-tip">Baue dir ein Zuhause auf, gründe Betriebe und hinterlasse dein Vermächtnis.</p></div>`;
  app.inert = true; app.setAttribute('aria-busy', 'true');
  const phases = new Set();
  const release = () => { app.inert = false; app.removeAttribute('aria-busy'); };
  return {
    done(phase) {
      if (!el.isConnected) return;
      phases.add(phase); el.querySelector(`[data-phase="${phase}"]`)?.classList.add('done');
      el.querySelector('progress').value = phases.size;
      el.querySelector('[data-splash-status]').textContent = phases.size === 3 ? 'Willkommen in Turning Point.' : phases.has('world') && phases.has('state') ? 'Deine Spielwelt wird vorbereitet …' : phases.has('world') ? 'Dein Spielstand wird geladen …' : 'Deutschland wird vorbereitet …';
    },
    finish() { release(); el.classList.add('leaving'); setTimeout(() => el.remove(), 320); },
    cancel() { release(); el.remove(); },
  };
}
