/* Formulare auf Konto- und Anmeldeseiten ohne sichtbares Neuladen: Antwort per fetch holen und nur den Inhalt (main) tauschen.
   Ohne JS (oder mit data-no-ajax am Formular) gilt das normale Absenden. Erfolgreiche Anmeldung/Registrierung wechselt die Seite
   (Weiterleitung), Meldungen über erledigte Änderungen erscheinen als Hinweis (Toast). */
(function () {
  'use strict';
  if (!window.fetch || !window.DOMParser || !window.URL) return;
  var busy = false;
  function toast(type, msg) {
    var box = document.querySelector('.toasts[data-soft-toasts]');
    if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('data-soft-toasts', ''); box.setAttribute('role', 'status'); document.body.appendChild(box); }
    var t = document.createElement('div'); t.className = 'toast ' + type; var d = document.createElement('div'); d.textContent = msg; t.appendChild(d); box.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 5000);
  }
  document.addEventListener('submit', function (e) {
    if (e.defaultPrevented) return;
    var f = e.target; if (!f || f.tagName !== 'FORM' || f.hasAttribute('data-no-ajax')) return;
    var main = document.querySelector('main'); if (!main || !main.contains(f)) return;
    if ((f.method || 'get').toLowerCase() !== 'post' || /multipart/i.test(f.enctype) || (f.target && f.target !== '_self')) return;
    var url; try { url = new URL(f.getAttribute('action') || location.href, location.href); } catch (x) { return; }
    if (url.origin !== location.origin) return;
    e.preventDefault(); if (busy) return; busy = true;
    var sub = e.submitter; var fd; try { fd = sub ? new FormData(f, sub) : new FormData(f); } catch (x) { fd = new FormData(f); }
    var q = new URLSearchParams(); fd.forEach(function (v, k) { q.append(k, typeof v === 'string' ? v : ''); });
    var y = window.scrollY;
    if (sub) sub.disabled = true;
    fetch(url.href, { method: 'POST', credentials: 'same-origin', redirect: 'follow', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'X-Requested-With': 'fetch', Accept: 'text/html' }, body: q.toString() })
      .then(function (res) {
        var fin = new URL(res.url || url.href, location.href);
        if (fin.origin !== location.origin || (res.redirected && fin.pathname !== location.pathname) || !/text\/html/i.test(res.headers.get('content-type') || '')) { location.assign(fin.href); return; }
        return res.text().then(function (html) {
          var doc = new DOMParser().parseFromString(html, 'text/html'); var nm = doc.querySelector('main');
          if (!nm) { location.assign(fin.href); return; }
          var ok = nm.querySelector(':scope > .alert.good, .alert.good'); var msg = '';
          if (ok && res.redirected) { msg = ok.textContent.replace(/\s+/g, ' ').trim(); ok.parentNode.removeChild(ok); }
          main.innerHTML = nm.innerHTML;
          if (doc.title) document.title = doc.title;
          if (res.redirected && fin.search) { try { history.replaceState(history.state, '', fin.pathname); } catch (x) { /* egal */ } }
          main.querySelectorAll('script[src]').forEach(function (old) { var s = document.createElement('script'); s.src = old.getAttribute('src') + (old.getAttribute('src').indexOf('?') < 0 ? '?' : '&') + 'r=' + Date.now(); old.parentNode.replaceChild(s, old); });
          window.scrollTo(0, y);
          if (msg) toast('good', msg);
          else { var bad = main.querySelector('.alert.bad'); if (bad && bad.scrollIntoView) bad.scrollIntoView({ block: 'nearest' }); }
        });
      })
      .catch(function () { toast('bad', 'Keine Verbindung zum Server – bitte erneut versuchen.'); })
      .then(function () { busy = false; if (sub) sub.disabled = false; });
  });
})();
