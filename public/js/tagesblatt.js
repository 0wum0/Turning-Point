/* Tagesblatt: Kennzahlen und Meldungen live nachladen (alle 60 Sekunden). */
(function () {
  var LOC = document.documentElement.lang === 'en' ? 'en-GB' : 'de-DE';
  var fmt = function (k, n) {
    if (k === 'money') { var a = Math.abs(n); if (a >= 1e9) return (n / 1e9).toFixed(1).replace('.', ',') + ' Mrd'; if (a >= 1e6) return (n / 1e6).toFixed(1).replace('.', ',') + ' Mio'; if (a >= 1e4) return Math.round(n / 1e3) + ' Tsd'; }
    return Number(n).toLocaleString(LOC);
  };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var d = document.getElementById('tb-date'); if (d) d.textContent = new Date().toLocaleDateString(LOC, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  var feed = document.getElementById('tb-feed') || document.getElementById('tb-feed-home');
  function load() {
    fetch('/tagesblatt.json?n=' + (feed && feed.dataset.n || 60)).then(function (r) { return r.json(); }).then(function (j) {
      document.querySelectorAll('[data-k]').forEach(function (el) { var v = j.stats[el.dataset.k]; if (v != null) el.textContent = fmt(el.dataset.k, v); });
      if (feed && j.news) feed.innerHTML = j.news.map(function (n) { var t = new Date(n.at); return '<article class="tb-item"><div class="tb-meta"><span class="tb-sec">' + esc(n.section) + '</span>' + (n.city ? '<span>· ' + esc(n.city) + '</span>' : '') + '<time>· ' + t.toLocaleString(LOC, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + '</time></div><h3>' + esc(n.title) + '</h3><p>' + esc(n.text) + '</p></article>'; }).join('') || '';
    }).catch(function () {});
  }
  setInterval(function () { if (!document.hidden) load(); }, 60000);
})();
