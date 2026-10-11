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
window.tpPvInit = function () {
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
};
window.tpPvInit();

/* Formulare, deren Pfad die Konto-Nummer enthält (Rechteprüfung der Spielleitung): data-uid-path="/admin/civic/user/{uid}/title/{mode}" */
document.addEventListener('submit', function (e) {
  var f = e.target.closest ? e.target.closest('form[data-uid-path]') : null; if (!f) return;
  var uid = f.elements.uid ? String(f.elements.uid.value).replace(/\D/g, '') : ''; var mode = f.elements.mode ? f.elements.mode.value : '';
  if (!uid) { e.preventDefault(); return; }
  f.action = f.getAttribute('data-uid-path').replace('{uid}', uid).replace('{mode}', /^[a-z]+$/.test(mode) ? mode : '');
});

/* ============================================================================================================
   Flackerfreie Bedienung (progressive Verbesserung): Formulare und Links im Admin laden per fetch, nur der Inhalt (main), die
   Navigation und die Brotkrümel werden getauscht; Meldungen erscheinen als Hinweis (Toast). Ohne JS arbeitet alles wie bisher.
   Ausnahmen: data-no-ajax (an Formular, Link oder Schaltfläche), target=_blank, download, Links aus /admin hinaus.
   Rückmeldungen außerhalb von /admin (Weiterleitung, Abmeldung) und Fehlerseiten ohne Admin-Rahmen laden normal.
   ============================================================================================================ */
(function () {
  var main = document.querySelector('.adm-main'); if (!main || !window.fetch || !window.DOMParser || !window.URL) return;
  var busy = false; var seq = 0;
  var root = document.documentElement;

  function toast(type, msg, sticky) {
    var box = document.querySelector('.toasts[data-adm-toasts]');
    if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('data-adm-toasts', ''); box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    var t = document.createElement('div'); t.className = 'toast ' + (type || 'good');
    var d = document.createElement('div'); d.style.flex = '1'; d.style.overflowWrap = 'anywhere'; d.textContent = msg;
    var x = document.createElement('button'); x.type = 'button'; x.className = 'btn ghost sm'; x.setAttribute('aria-label', 'Schließen'); x.textContent = '×';
    t.appendChild(d); t.appendChild(x); box.appendChild(t);
    var timer = null; var close = function () { clearTimeout(timer); if (t.parentNode) t.parentNode.removeChild(t); };
    x.addEventListener('click', close);
    if (!sticky && type !== 'bad') { t.style.setProperty('--ms', '1'); timer = setTimeout(close, 4000 + Math.min(8000, msg.length * 40)); t.addEventListener('mouseenter', function () { clearTimeout(timer); }); }
    while (box.children.length > 4) box.removeChild(box.firstChild);
  }
  window.tpAdminToast = toast;

  function setBusy(on) { busy = on; root.classList.toggle('adm-busy', on); }

  /* Zustand der Seite merken (Scroll, offene Details, Fokus, nicht gespeicherte Eingaben) und danach wiederherstellen */
  function ctrlKey(el, i) { var f = el.form; return (f ? (f.getAttribute('action') || '') + '|' + f.method : '') + '|' + (el.name || el.id || '') + '|' + (el.type || el.tagName) + '|' + i; }
  function capture(skipForm) {
    var st = { y: window.scrollY, x: window.scrollX, open: [], vals: {}, focus: null };
    main.querySelectorAll('details').forEach(function (d, i) { if (d.open) st.open.push(i); });
    var n = {};
    main.querySelectorAll('input,textarea,select').forEach(function (el) {
      if (el.name === '_csrf' || el.type === 'hidden' || el.type === 'password' || el.type === 'file' || el.type === 'submit' || el.type === 'button' || (skipForm && el.form === skipForm) || !el.name) return;
      var k = ctrlKey(el, 0); n[k] = (n[k] || 0) + 1; k = ctrlKey(el, n[k]);
      if (el.type === 'checkbox' || el.type === 'radio') { if (el.checked !== el.defaultChecked) st.vals[k] = { c: el.checked }; }
      else if (el.tagName === 'SELECT') { var o = el.options[el.selectedIndex]; if (o && !o.defaultSelected) st.vals[k] = { v: el.value }; }
      else if (el.value !== el.defaultValue) st.vals[k] = { v: el.value };
    });
    var a = document.activeElement;
    if (a && main.contains(a) && a !== main && (a.id || a.name)) st.focus = { id: a.id, name: a.name, type: a.type, form: a.form ? a.form.getAttribute('action') : null, s: a.selectionStart, e: a.selectionEnd };
    return st;
  }
  function restore(st, keepScroll) {
    main.querySelectorAll('details').forEach(function (d, i) { if (st.open.indexOf(i) >= 0) d.open = true; });
    var n = {};
    main.querySelectorAll('input,textarea,select').forEach(function (el) {
      if (!el.name || el.type === 'hidden' || el.type === 'password' || el.type === 'file') return;
      var k = ctrlKey(el, 0); n[k] = (n[k] || 0) + 1; var v = st.vals[ctrlKey(el, n[k])]; if (!v) return;
      if ('c' in v) el.checked = v.c; else el.value = v.v;
    });
    if (st.focus) {
      var f = null;
      if (st.focus.id) f = document.getElementById(st.focus.id);
      if (!f && st.focus.name) { var c = main.querySelectorAll('[name="' + String(st.focus.name).replace(/"/g, '') + '"]'); for (var i = 0; i < c.length; i++) { if ((c[i].form ? c[i].form.getAttribute('action') : null) === st.focus.form) { f = c[i]; break; } } }
      if (f && main.contains(f)) { try { f.focus({ preventScroll: true }); if (st.focus.s != null && f.setSelectionRange && /text|search|url|tel|email|textarea/.test(f.type || '')) f.setSelectionRange(st.focus.s, st.focus.e); } catch (e) { /* egal */ } }
    }
    if (keepScroll) window.scrollTo(st.x, st.y);
  }

  function reinit() {
    if (window.tpTreeInit) window.tpTreeInit(main);
    if (window.tpChartsInit) window.tpChartsInit();
    if (window.tpPvInit) window.tpPvInit();
    window.dispatchEvent(new CustomEvent('tp:admin-swap'));
  }

  function isAdminUrl(u) { return u.origin === location.origin && (u.pathname === '/admin' || u.pathname.indexOf('/admin/') === 0); }

  /* Antwort in die Seite einsetzen. Gibt false zurück, wenn die Antwort kein Admin-Rahmen ist (dann lädt der Aufrufer normal). */
  function swapIn(html, url, opts) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var nm = doc.querySelector('.adm-main'); if (!nm || !doc.getElementById('adm')) return false;
    var st = opts.state;
    var flash = nm.querySelector('[data-flash]');
    var fl = null;
    if (flash) { fl = { type: /\b(bad|warn|good|info)\b/.exec(flash.className) ? /\b(bad|warn|good|info)\b/.exec(flash.className)[1] : 'good', msg: flash.textContent.replace(/\s+/g, ' ').trim() }; flash.parentNode.removeChild(flash); }
    var apply = function () {
      main.innerHTML = nm.innerHTML;
      var nav = document.querySelector('[data-adm-nav]'), nn = doc.querySelector('[data-adm-nav]'); if (nav && nn && nav.innerHTML !== nn.innerHTML) nav.innerHTML = nn.innerHTML;
      var cr = document.querySelector('[data-adm-crumb]'), nc = doc.querySelector('[data-adm-crumb]'); if (cr && nc && cr.innerHTML !== nc.innerHTML) cr.innerHTML = nc.innerHTML;
      if (doc.title) document.title = doc.title;
      document.getElementById('adm').classList.remove('open');
      if (st) restore(st, opts.keepScroll);
      else if (opts.scroll) window.scrollTo(opts.scroll.x, opts.scroll.y);
      else window.scrollTo(0, 0);
      reinit();
    };
    apply();
    if (fl && fl.msg) toast(fl.type, fl.msg);
    return true;
  }

  function download(res, fallbackName) {
    var cd = res.headers.get('content-disposition') || ''; var m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
    return res.blob().then(function (b) {
      var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = m ? decodeURIComponent(m[1]) : fallbackName || 'download'; a.style.display = 'none'; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    });
  }

  /* Eine Anfrage ausführen und das Ergebnis darstellen. req: { url, method, body, push, keepState, form } */
  function run(req) {
    if (busy) return;
    var my = ++seq; setBusy(true);
    var sameUrl = req.url.pathname + req.url.search === location.pathname + location.search;
    var st = req.keepState === false ? null : capture(req.form);
    var init = { method: req.method, credentials: 'same-origin', redirect: 'follow', headers: { 'X-Requested-With': 'fetch', Accept: 'text/html,application/xhtml+xml' } };
    if (req.body) init.body = req.body;
    if (req.body && typeof req.body === 'string') init.headers['Content-Type'] = 'application/x-www-form-urlencoded;charset=UTF-8';
    fetch(req.url.href, init).then(function (res) {
      var ct = res.headers.get('content-type') || '';
      var cd = res.headers.get('content-disposition') || '';
      if (/attachment/i.test(cd) || (ct && !/text\/html|application\/xhtml/i.test(ct))) {
        if (/attachment/i.test(cd)) return download(res).then(function () { toast('good', 'Download gestartet.'); });
        if (req.method === 'GET') { location.assign(req.url.href); return; }
        return download(res);
      }
      var final = new URL(res.url || req.url.href, location.href);
      return res.text().then(function (html) {
        if (my !== seq) return;
        if (!isAdminUrl(final)) { location.assign(final.href); return; }
        var same = final.pathname + final.search === location.pathname + location.search || (req.method === 'POST' && !res.redirected); // direkt gerenderte Antwort (z. B. Prüffehler): Ort bleibt
        var ok = swapIn(html, final, { state: same ? st : null, keepScroll: same });
        if (!ok) { document.open(); document.write(html); document.close(); return; }
        if (req.push && !(req.method === 'POST' && !res.redirected)) { var target = final.pathname + final.search + (req.hash || final.hash || ''); if (target !== location.pathname + location.search + location.hash) history.pushState({ adm: 1 }, '', target); }
        if (req.hash && !same) { var el = document.getElementById(req.hash.slice(1)); if (el) el.scrollIntoView(); }
        if (res.status >= 400 && !document.querySelector('.alert.bad')) toast('bad', 'Der Server meldet einen Fehler (' + res.status + ').');
      });
    }).catch(function (e) {
      toast('bad', 'Keine Verbindung zum Server – bitte erneut versuchen.', true);
    }).then(function () { setBusy(false); if (req.form) { req.form.removeAttribute('data-sending'); } });
  }

  /* ---- Formulare ---- */
  document.addEventListener('submit', function (e) {
    if (e.defaultPrevented) return;
    var f = e.target; if (!f || f.tagName !== 'FORM' || f.hasAttribute('data-no-ajax')) return;
    var sub = e.submitter || null;
    if (sub && sub.hasAttribute('data-no-ajax')) return;
    if ((f.target && f.target !== '_self') || (sub && sub.formTarget && sub.formTarget !== '_self')) return;
    var action = (sub && sub.getAttribute('formaction')) || f.getAttribute('action') || location.href;
    var url; try { url = new URL(action, location.href); } catch (x) { return; }
    if (!isAdminUrl(url) || !main.contains(f) && !f.closest('.adm-bar')) return;
    var method = ((sub && sub.getAttribute('formmethod')) || f.getAttribute('method') || 'get').toUpperCase();
    if (method !== 'GET' && method !== 'POST') return;
    if (busy || f.hasAttribute('data-sending')) { e.preventDefault(); return; }
    var multipart = /multipart/i.test((sub && sub.getAttribute('formenctype')) || f.enctype || '');
    var fd; try { fd = sub ? new FormData(f, sub) : new FormData(f); } catch (x) { fd = new FormData(f); if (sub && sub.name) fd.append(sub.name, sub.value); }
    e.preventDefault(); f.setAttribute('data-sending', '');
    if (method === 'GET') {
      var p = new URLSearchParams(); fd.forEach(function (v, k) { if (typeof v === 'string') p.append(k, v); });
      url.search = p.toString(); run({ url: url, method: 'GET', push: true, form: f, keepState: false });
      return;
    }
    var body;
    if (multipart) body = fd; else { var q = new URLSearchParams(); fd.forEach(function (v, k) { q.append(k, typeof v === 'string' ? v : ''); }); body = q.toString(); }
    run({ url: url, method: 'POST', body: body, push: true, form: f });
  });

  /* ---- Links ---- */
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest ? e.target.closest('a[href]') : null; if (!a || a.hasAttribute('data-no-ajax') || a.hasAttribute('download')) return;
    if (a.target && a.target !== '_self') return;
    var url; try { url = new URL(a.href, location.href); } catch (x) { return; }
    if (!isAdminUrl(url)) return;
    if (url.pathname === location.pathname && url.search === location.search && url.hash) return; // Sprung innerhalb der Seite
    if (/\.(json|csv|zip|log|txt|js|png|jpe?g|svg|webp|pdf)$/i.test(url.pathname)) return;
    e.preventDefault(); if (busy) return;
    run({ url: url, method: 'GET', push: true, keepState: false, hash: url.hash });
  });

  /* ---- Zurück/Vor ---- */
  try { history.replaceState({ adm: 1 }, '', location.href); } catch (x) { /* egal */ }
  window.addEventListener('popstate', function (e) {
    if (!e.state || !e.state.adm) return;
    seq++; setBusy(false);
    run({ url: new URL(location.href), method: 'GET', push: false, popstate: true, keepState: false });
  });
})();
