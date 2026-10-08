/* Konto → Anzeige im Spiel: Schalter „Alle Funktionen anzeigen“ (wirkt nur auf die Oberfläche). */
(function () {
  var box = document.getElementById('showall'); if (!box) return;
  var csrf = (document.querySelector('meta[name="csrf-token"]') || {}).content || '';
  function call(method, url, body) {
    return fetch(url, { method: method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json(); }).catch(function () { return null; });
  }
  call('GET', '/api/state').then(function (r) {
    box.checked = !!(r && r.view && r.view.onboarding && r.view.onboarding.showAll);
    box.disabled = false;
  });
  box.addEventListener('change', function () {
    var want = box.checked; box.disabled = true;
    call('POST', '/api/action/uiPrefs', { showAll: want }).then(function (r) { if (!r || r.ok === false) box.checked = !want; box.disabled = false; });
  });
})();
