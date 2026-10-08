/* Bank: Kredite aufnehmen und zurückzahlen. Beträge werden in der eigenen Währung eingegeben. */
import { html, icon, api, on, modal, toast, money, mount, yearsText } from './ui.js';

const toCents = (v) => Math.round(Number(String(v).replace(/\./g, '').replace(',', '.')) * 100);

export function openBank(ctx) {
  const v = ctx.view; const c = v.credit; const cur = v.currency;
  if (!c || !c.enabled) { toast('Die Bank vergibt gerade keine Kredite.', 'warn'); return; }
  const dlg = modal(html`<h3>${icon('landmark')} Bank &amp; Kredite</h3>
    <dl class="kv small"><dt>Kreditrahmen</dt><dd>${money(c.limit, cur)}</dd><dt>Schulden</dt><dd class="${c.debt ? 'neg' : ''}">${money(c.debt, cur)}</dd><dt>Noch verfügbar</dt><dd class="pos">${money(c.available, cur)}</dd><dt>Zinssatz neuer Kredite</dt><dd>${String(c.rate).replace('.', ',')} % p. a.</dd></dl>
    <p class="dim small">Der Rahmen richtet sich nach deinen Immobilien, Betrieben und deinem Einkommen. Die Rate wird täglich abgebucht; sinkt dein Konto unter null, droht die Insolvenz.</p>
    <div class="card flat mt"><div class="card-title">${icon('plus')} Neuer Kredit</div>
      <div class="grid c2"><div class="field"><label for="ln-a">Betrag (${cur === 'EUR' ? '€' : 'DM'})</label><input id="ln-a" type="text" inputmode="decimal" placeholder="mind. ${(c.minAmount / 100).toLocaleString('de-DE')}"></div>
      <div class="field"><label for="ln-y">Laufzeit (Jahre)</label><input id="ln-y" type="number" min="1" max="${c.maxYears}" value="5"></div></div>
      <div class="small dim" id="ln-pre"></div><div class="row end mt"><button class="btn primary" id="ln-go" ${c.available < c.minAmount ? 'disabled' : ''}>Kredit aufnehmen</button></div></div>
    ${c.loans.length ? html`<div class="card-title mt">${icon('scale')} Deine Kredite</div><div class="stack" style="--gap:.5rem">${c.loans.map((l) => html`<div class="firm"><div class="grow"><b>${money(l.left, cur)}</b> <span class="dim small">Restschuld · ${String(l.rate).replace('.', ',')} % · Rate ${money(l.pay, cur)} / Tag · ${l.days > 0 ? 'noch ' + yearsText(l.days) : 'Restlaufzeit abgelaufen'}</span></div><button class="btn sm" data-rep="${l.id}" data-all="1" ${v.money >= l.left ? '' : 'disabled'}>Ganz tilgen</button><button class="btn sm ghost" data-rep="${l.id}">Teil …</button></div>`)}</div>` : ''}
    <div class="row end mt"><button class="btn ghost" data-close="x">Schließen</button></div>`);
  const pre = dlg.el.querySelector('#ln-pre'); const inA = dlg.el.querySelector('#ln-a'); const inY = dlg.el.querySelector('#ln-y');
  const calc = () => { const a = toCents(inA.value); const y = Math.max(1, Number(inY.value) || 1); if (!(a > 0)) { pre.textContent = ''; return; } const r = c.rate / 100 / 365; const n = y * 365; const pay = Math.round((a * r) / (1 - Math.pow(1 + r, -n))); pre.textContent = `Rate ca. ${money(pay, cur)} pro Tag · Gesamtzins ca. ${money(pay * n - a, cur)}`; };
  inA.addEventListener('input', calc); inY.addEventListener('input', calc);
  dlg.el.querySelector('#ln-go').onclick = async () => {
    try { const r = await api('POST', '/api/action/loanTake', { amount: toCents(inA.value), years: Number(inY.value) }); ctx.setView(r.view); ctx.hud(); toast(r.message); dlg.close(); ctx.rerender(); } catch (e) { toast(e.message, 'bad'); }
  };
  on(dlg.el, 'click', '[data-rep]', async (e, t) => {
    let body = { id: Number(t.dataset.rep), all: !!t.dataset.all };
    if (!body.all) { const a = window.prompt('Wie viel zurückzahlen?'); if (!a) return; body.amount = toCents(a); }
    try { const r = await api('POST', '/api/action/loanRepay', body); ctx.setView(r.view); ctx.hud(); toast(r.message); dlg.close(); ctx.rerender(); } catch (er) { toast(er.message, 'bad'); }
  });
}
