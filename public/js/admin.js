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
  function upd() {
    var t = q('[data-pv=title]').value, x = q('[data-pv=text]').value, f = q('[data-pv=flash]').checked;
    box.querySelector('[data-pv-title]').textContent = t || 'Überschrift';
    box.querySelector('[data-pv-text]').textContent = x || 'Text der Meldung …';
    var k = box.querySelector('[data-pv-kicker]'); k.textContent = f ? 'EILMELDUNG' : 'AKTUELL'; k.classList.toggle('norm', !f);
  }
  document.querySelectorAll('[data-pv]').forEach(function (e) { e.addEventListener('input', upd); e.addEventListener('change', upd); });
  upd();
})();
