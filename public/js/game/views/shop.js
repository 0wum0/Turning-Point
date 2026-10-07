import { html, icon, money, infoBtn, on, api, toast } from '../ui.js';

export default {
  id: 'shop', label: 'Shop', icon: 'coins',
  async load(ctx) { return api('GET', '/api/shop'); },
  render(ctx, data) {
    const v = ctx.view; const w = ctx.world;
    return html`
    <div class="panel-head"><div><h2>Coins &amp; EFS</h2><p>Komplett kostenlos spielbar – alles hier ist freiwillig.</p></div>
      ${infoBtn(['Coins sind Premium-Währung und Meta-Fortschritt: Sie bleiben über Tod, Game Over und Neustart erhalten.', 'Du bekommst Coins durch freiwillige Werbung und einmalig für jedes Kind (100). Kaufen ist möglich, aber nie nötig.', 'Sieh Werbung nur an, wenn du willst – sie läuft nie von allein.'], 'Coins')}</div>
    <div class="grid c3" style="--gap:1rem">
      <section class="card glow stack"><div class="card-title">${icon('circle-play')} Freiwillige Werbung</div>
        <div class="big-money">+${w.adCoins} <small>Coins</small></div><p class="dim small">Ein kurzes Video. Keine Pflicht, kein Zwang.</p>
        <button class="btn primary block" data-ad="coins" ${w.adsEnabled ? '' : 'disabled'}>${icon('video')} Video ansehen</button></section>
      <section class="card stack"><div class="card-title">${icon('zap')} Zeit-Bonus</div>
        <div class="big-money" style="color:var(--accent-2)">+20 <small>EFS</small></div><p class="dim small">Zusätzliche Zeit durch ein Video.</p>
        <button class="btn block" data-ad="efs" ${w.adsEnabled ? '' : 'disabled'}>${icon('video')} Video ansehen</button></section>
      <section class="card stack"><div class="card-title">${icon('wallet')} Dein Stand</div>
        <dl class="kv"><dt>Coins</dt><dd>${v.coins}</dd><dt>EFS-Vorrat</dt><dd>${v.efs.pool}</dd></dl>
        <p class="dim small mb0">Coins bleiben dir nach jedem Leben erhalten.</p></section>
    </div>
    <div class="panel-head mt2"><div><h3 style="font-size:1.5rem">Pakete</h3><p>Kleine Preise statt hoher Einstiegshürden.</p></div>${data.mode !== 'test' ? html`<span class="chip warn">Zahlungen noch nicht aktiv</span>` : html`<span class="chip info">Testmodus</span>`}</div>
    <div class="grid auto" style="--gap:1rem">${data.packages.map((p) => html`<section class="card stack"><h4>${p.name}</h4>
      <div class="row small">${p.coins ? html`<span class="chip accent">${icon('coins')} ${p.coins}</span>` : ''}${p.efs ? html`<span class="chip">${icon('zap')} ${p.efs} EFS</span>` : ''}${p.money ? html`<span class="chip good">${icon('banknote')} ${money(p.money, v.currency)}</span>` : ''}</div>
      <div class="serif" style="font-size:1.6rem">${(p.price_cents / 100).toFixed(2).replace('.', ',')} €</div>
      <button class="btn ${data.mode === 'test' ? 'primary' : ''} block" data-buy="${p.id}" ${data.mode === 'test' ? '' : 'disabled'}>Kaufen</button></section>`)}</div>
    ${data.subscription.enabled ? html`<section class="card mt"><div class="card-title">${icon('crown')} Dauerkarte</div><p>${(data.subscription.price_cents / 100).toFixed(2).replace('.', ',')} € / Monat – täglich ${data.subscription.daily_coins} Coins und kleine Vorteile.</p><button class="btn" disabled>Bald verfügbar</button></section>` : ''}`;
  },
  bind(root, ctx) {
    on(root, 'click', '[data-ad]', async (e, t) => { await ctx.watchAd(t.dataset.ad); ctx.rerender(); });
    on(root, 'click', '[data-buy]', async (e, t) => {
      try { const r = await api('POST', '/api/shop/buy', { id: t.dataset.buy }); ctx.setView(r.view, r); toast(r.message); ctx.rerender(); } catch (er) { toast(er.message, 'bad'); }
    });
  },
};
