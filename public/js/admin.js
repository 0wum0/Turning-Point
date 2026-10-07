document.addEventListener('click', function (e) {
  var b = e.target.closest('[data-confirm]');
  if (b && !window.confirm(b.getAttribute('data-confirm'))) { e.preventDefault(); e.stopPropagation(); }
}, true);
document.addEventListener('change', function (e) {
  var all = e.target.closest('[data-check-all]');
  if (!all) return;
  document.querySelectorAll('input[name="' + all.getAttribute('data-check-all') + '"]').forEach(function (c) { c.checked = all.checked; });
});
(function () {
  var adm = document.getElementById('adm'); if (!adm) return;
  var burger = document.getElementById('admBurger'); var scrim = document.getElementById('admScrim');
  if (burger) burger.addEventListener('click', function () { adm.classList.toggle('open'); });
  if (scrim) scrim.addEventListener('click', function () { adm.classList.remove('open'); });
  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName)) { var q = document.getElementById('admQ'); if (q) { e.preventDefault(); q.focus(); } }
    if (e.key === 'Escape') adm.classList.remove('open');
  });
})();
(function () {
  var box = document.querySelector('[data-pv-box]'); if (!box) return;
  var q = function (s) { return document.querySelector(s); };
  function paginate(text, size) {
    var pages = [];
    String(text || '').split(/\n[ \t]*-{3,}[ \t]*\n/).forEach(function (block) {
      var paras = block.split(/\n{2,}/).map(function (p) { return p.trim(); }).filter(Boolean); var cur = '';
      var push = function () { if (cur) { pages.push(cur); cur = ''; } };
      paras.forEach(function (p) {
        while (p.length > size) { var cut = p.lastIndexOf('. ', size); if (cut < size * 0.5) cut = p.lastIndexOf(' ', size); if (cut <= 0) cut = size; var part = p.slice(0, cut + 1).trim(); p = p.slice(cut + 1).trim(); if (cur && cur.length + part.length + 2 > size) push(); cur += (cur ? '\n\n' : '') + part; push(); }
        if (p) { if (cur && cur.length + p.length + 2 > size) push(); cur += (cur ? '\n\n' : '') + p; }
      });
      push();
    });
    return pages.length ? pages : [''];
  }
  var page = 0;
  function upd() {
    var t = q('[data-pv=title]').value, x = q('[data-pv=text]').value, f = q('[data-pv=flash]').checked;
    var pages = paginate(x, 950); page = Math.max(0, Math.min(page, pages.length - 1));
    box.querySelector('[data-pv-title]').textContent = t || 'Überschrift';
    box.querySelector('[data-pv-text]').textContent = pages[page] || 'Text der Meldung …';
    var k = box.querySelector('[data-pv-kicker]'); k.textContent = f ? 'EILMELDUNG' : 'AKTUELL'; k.classList.toggle('norm', !f);
    var c = q('[data-pv-count]'); if (c) c.textContent = x.length;
    var pg = q('[data-pv-pager]'); pg.style.display = pages.length > 1 ? 'flex' : 'none'; q('[data-pv-page]').textContent = 'Seite ' + (page + 1) + ' von ' + pages.length;
  }
  q('[data-pv-prev]').addEventListener('click', function () { page--; upd(); }); q('[data-pv-next]').addEventListener('click', function () { page++; upd(); });
  document.querySelectorAll('[data-pv]').forEach(function (e) { e.addEventListener('input', function () { page = 0; upd(); }); e.addEventListener('change', upd); });
  upd();
})();
