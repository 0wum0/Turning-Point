/* Konto → Benachrichtigungen: Web-Push-Abo des Geräts verwalten (Service Worker, VAPID, Kategorien, Ruhezeit). */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var card = $('pushcard'); if (!card) return;
  var T = document.documentElement.lang === 'en'
    ? { on: 'Turn notifications on', off: 'Turn notifications off', active: 'Active on this device.', blocked: 'Notifications are blocked in your browser settings.', err: 'Could not change notifications: ', saved: 'Saved.', test: 'Test message sent.', testFail: 'No test message could be sent (quiet time, limit or no device).' }
    : { on: 'Benachrichtigungen einschalten', off: 'Benachrichtigungen ausschalten', active: 'Auf diesem Gerät aktiv.', blocked: 'Benachrichtigungen sind in den Browser-Einstellungen blockiert.', err: 'Benachrichtigungen konnten nicht geändert werden: ', saved: 'Gespeichert.', test: 'Testnachricht gesendet.', testFail: 'Es konnte keine Testnachricht gesendet werden (Ruhezeit, Limit oder kein Gerät).' };
  var csrf = (document.querySelector('meta[name="csrf-token"]') || {}).content || '';
  function api(method, url, body) {
    return fetch(url, { method: method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: 'HTTP ' + r.status }; }); });
  }
  var btn = $('push-toggle'), stateEl = $('push-state'), opts = $('push-opts'), testBtn = $('push-test');
  var supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!supported) { $('push-unsupported').style.display = ''; return; }
  if (card.dataset.enabled !== '1') { $('push-off').style.display = ''; return; }
  function b64(s) { var p = '='.repeat((4 - s.length % 4) % 4), r = (s + p).replace(/-/g, '+').replace(/_/g, '/'), raw = atob(r), a = new Uint8Array(raw.length); for (var i = 0; i < raw.length; i++) a[i] = raw.charCodeAt(i); return a; }
  var reg = null, sub = null;
  function paint(prefs) {
    var on = !!sub && !!(prefs && prefs.on);
    btn.disabled = false; btn.textContent = on ? T.off : T.on; btn.classList.toggle('primary', !on);
    stateEl.textContent = on ? T.active : (Notification.permission === 'denied' ? T.blocked : '');
    opts.style.display = on ? '' : 'none'; testBtn.style.display = on ? '' : 'none';
    if (prefs) {
      Array.prototype.forEach.call(opts.querySelectorAll('[data-pcat]'), function (c) { c.checked = prefs.cats[c.dataset.pcat] !== false; });
      $('push-quiet').checked = !!prefs.quiet.enabled; $('push-qfrom').value = prefs.quiet.from; $('push-qto').value = prefs.quiet.to;
    }
  }
  function say(t) { stateEl.textContent = t; }
  navigator.serviceWorker.ready.then(function (r) { reg = r; return r.pushManager.getSubscription(); }).then(function (s) { sub = s; return api('GET', '/api/push/prefs'); }).then(function (r) { paint(r.ok ? r.prefs : null); }).catch(function () { btn.disabled = false; });
  btn.addEventListener('click', function () {
    btn.disabled = true;
    if (sub) {
      var ep = sub.endpoint;
      sub.unsubscribe().catch(function () {}).then(function () { sub = null; return api('POST', '/api/push/unsubscribe', { endpoint: ep }); }).then(function (r) { paint(r.ok ? r.prefs : null); });
      return;
    }
    Notification.requestPermission().then(function (perm) {
      if (perm !== 'granted') { paint(null); say(T.blocked); return null; }
      return api('GET', '/api/push/key').then(function (k) {
        if (!k.ok || !k.key) throw new Error(k.error || 'key');
        return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(k.key) });
      }).then(function (s) {
        sub = s;
        var tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { /* egal */ }
        return api('POST', '/api/push/subscribe', { subscription: s.toJSON(), tz: tz });
      }).then(function (r) { if (!r.ok) throw new Error(r.error); paint(r.prefs); });
    }).catch(function (e) { paint(null); say(T.err + (e && e.message || '')); });
  });
  $('push-save').addEventListener('click', function () {
    var cats = {}; Array.prototype.forEach.call(opts.querySelectorAll('[data-pcat]'), function (c) { cats[c.dataset.pcat] = c.checked; });
    api('POST', '/api/push/prefs', { cats: cats, quiet: { enabled: $('push-quiet').checked, from: $('push-qfrom').value, to: $('push-qto').value } }).then(function (r) { if (r.ok) { paint(r.prefs); say(T.saved); } else say(T.err + r.error); });
  });
  testBtn.addEventListener('click', function () { api('POST', '/api/push/test').then(function (r) { say(r.ok ? T.test : T.testFail); }); });
})();
