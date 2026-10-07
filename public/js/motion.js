/* TURNING POINT · Bewegungs-Engine
   Scroll-Reveal, Zahlen-Zähler, Spotlight, 3D-Tilt, Ripple, Partikel, Konfetti, Fortschrittsbalken.
   Abschaltbar (Knopf im Spiel, prefers-reduced-motion). Keine Abhängigkeiten, CSP-sicher. */
(function () {
  'use strict';
  var root = document.documentElement;
  var store = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* egal */ } } };
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function off() { return root.getAttribute('data-motion') === 'off'; }
  if (reduce && store.get('tp-motion') !== 'on') root.setAttribute('data-motion', 'off');
  else if (store.get('tp-motion') === 'off') root.setAttribute('data-motion', 'off');
  root.classList.add('js');
  var isAdmin = document.body && document.body.classList.contains('admin');

  /* ---------- Scroll-Reveal ---------- */
  var REVEAL = '.card, .feature, .stat, .kpi, .news-item, .listing, .office, .table-wrap, .alert, .tl-item, .hero .chip, .timeline-strip .chip, .quote, .panel-head, .biz-card, .room-card, .res-card';
  var io = ('IntersectionObserver' in window) ? new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      io.unobserve(e.target); var t = e.target;
      t.classList.add('in');
      setTimeout(function () { t.classList.remove('rv', 'in'); t.style.removeProperty('--i'); }, 1100);
    });
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 }) : null;
  var pending = new Set();
  function reveal(scope) {
    if (off() || !io) return;
    var list = (scope.querySelectorAll ? scope.querySelectorAll(REVEAL) : []); var i = 0;
    var arr = Array.prototype.slice.call(list); if (scope.matches && scope.matches(REVEAL)) arr.unshift(scope);
    arr.forEach(function (el) {
      if (el.classList.contains('rv') || el.closest('.modal-backdrop, .toasts, .tree, .interior') || (el.parentElement && el.parentElement.classList.contains('enter'))) return;
      var r = el.getBoundingClientRect(); if (r.width === 0 && r.height === 0) return;
      el.style.setProperty('--i', String(Math.min(i++, 10)));
      el.classList.add('rv'); io.observe(el); pending.add(el);
    });
  }
  setInterval(function () { // Sicherheitsnetz: nichts bleibt unsichtbar
    pending.forEach(function (el) { if (!document.contains(el)) { pending.delete(el); return; } var r = el.getBoundingClientRect(); if (r.top < innerHeight && r.bottom > 0 && el.classList.contains('rv') && !el.classList.contains('in')) el.classList.add('in'); });
  }, 1500);

  /* ---------- Zahlen-Zähler ---------- */
  var COUNT = '.kpi b, .tile b, .stat b, .hud-res .res b, .count';
  var last = new Map(); var NUM = /(-|−)?\d[\d.]*(?:,\d+)?/;
  function parseDe(s) { return parseFloat(s.replace(/\./g, '').replace(',', '.').replace('−', '-')); }
  function countUp(el) {
    if (el._counted || off()) return; var txt = el.textContent; var m = NUM.exec(txt); if (!m) return;
    var to = parseDe(m[0]); if (!isFinite(to)) return; el._counted = true;
    var dec = m[0].indexOf(',') >= 0 ? m[0].length - m[0].indexOf(',') - 1 : 0; var pre = txt.slice(0, m.index); var post = txt.slice(m.index + m[0].length);
    var res = el.closest('.res'); var key = res ? res.className.replace(/\s+/g, ' ').trim() : null;
    var from = key && last.has(key) ? last.get(key) : 0; if (key) last.set(key, to);
    if (from === to) return;
    var fmt = function (v) { return pre + v.toLocaleString('de-DE', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + post; };
    var t0 = performance.now(); var dur = key ? 800 : 1100; el.textContent = fmt(from);
    if (key && res) { res.classList.remove('flash-up', 'flash-down'); void res.offsetWidth; res.classList.add(to > from ? 'flash-up' : 'flash-down'); }
    (function tick(now) {
      var p = Math.min(1, (now - t0) / dur); var e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      el.textContent = fmt(from + (to - from) * e); if (p < 1) requestAnimationFrame(tick);
    })(t0);
  }
  function counters(scope) { if (!scope.querySelectorAll) return; var l = scope.querySelectorAll(COUNT); for (var i = 0; i < l.length; i++) countUp(l[i]); if (scope.matches && scope.matches(COUNT)) countUp(scope); }

  /* ---------- Spotlight & Tilt ---------- */
  var SPOT = '.card, .kpi, .feature, .listing, .office, .stat';
  var raf = 0; var pend = null;
  document.addEventListener('pointermove', function (e) {
    if (off() || e.pointerType === 'touch') return; pend = e; if (raf) return;
    raf = requestAnimationFrame(function () {
      raf = 0; var ev = pend; var t = ev.target.closest && ev.target.closest(SPOT);
      if (t) {
        if (!t._spot) { var pos = getComputedStyle(t).position; if (pos === 'static' || pos === 'relative') { t.classList.add('spot'); } t._spot = true; }
        var r = t.getBoundingClientRect(); t.style.setProperty('--mx', (ev.clientX - r.left) + 'px'); t.style.setProperty('--my', (ev.clientY - r.top) + 'px');
      }
      var tl = ev.target.closest && ev.target.closest('.feature, .stat, .tilt');
      if (tl && !isAdmin) { var b = tl.getBoundingClientRect(); var x = (ev.clientX - b.left) / b.width - 0.5; var y = (ev.clientY - b.top) / b.height - 0.5; tl.style.transform = 'perspective(800px) rotateX(' + (-y * 7).toFixed(2) + 'deg) rotateY(' + (x * 9).toFixed(2) + 'deg) translateY(-3px)'; tl._tilted = true; }
    });
  }, { passive: true });
  document.addEventListener('pointerout', function (e) { var t = e.target.closest && e.target.closest('.feature, .stat, .tilt'); if (t && t._tilted && !t.contains(e.relatedTarget)) { t.style.transform = ''; t._tilted = false; } });

  /* ---------- Ripple ---------- */
  document.addEventListener('pointerdown', function (e) {
    if (off()) return; var b = e.target.closest && e.target.closest('.btn'); if (!b || b.disabled) return;
    var r = b.getBoundingClientRect(); var s = document.createElement('span'); s.className = 'ripple';
    var d = Math.max(r.width, r.height) * 1.6; s.style.cssText = 'width:' + d + 'px;height:' + d + 'px;left:' + (e.clientX - r.left - d / 2) + 'px;top:' + (e.clientY - r.top - d / 2) + 'px';
    var pos = getComputedStyle(b).position; if (pos === 'static') b.style.position = 'relative'; b.style.overflow = b.style.overflow || 'hidden';
    b.appendChild(s); setTimeout(function () { s.remove(); }, 650);
  }, { passive: true });

  /* ---------- Partikel (Startseite, Anmeldung, Spiel-Hintergrund) ---------- */
  function particles(host, opts) {
    if (off() || host._fx) return; host._fx = true; opts = opts || {};
    var c = document.createElement('canvas'); c.className = 'fx-particles'; host.insertBefore(c, host.firstChild);
    var ctx = c.getContext('2d'); var dpr = Math.min(window.devicePixelRatio || 1, 1.5); var W = 0, H = 0; var P = [];
    function size() { var r = host.getBoundingClientRect(); W = r.width; H = r.height; c.width = W * dpr; c.height = H * dpr; c.style.width = W + 'px'; c.style.height = H + 'px'; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); var n = Math.round(Math.min(70, W * H / 14000)); while (P.length < n) P.push(mk()); P.length = n; }
    function mk() { return { x: Math.random() * (W || 800), y: Math.random() * (H || 600), r: Math.random() * 1.6 + 0.4, vx: (Math.random() - 0.5) * 0.18, vy: -Math.random() * 0.25 - 0.05, a: Math.random() * 0.5 + 0.15, t: Math.random() * 6 }; }
    size(); var run = true; var vis = true; var mx = -999, my = -999;
    host.addEventListener('pointermove', function (e) { var r = host.getBoundingClientRect(); mx = e.clientX - r.left; my = e.clientY - r.top; }, { passive: true });
    host.addEventListener('pointerleave', function () { mx = my = -999; });
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { vis = es[0].isIntersecting; }).observe(host);
    document.addEventListener('visibilitychange', function () { run = !document.hidden; });
    window.addEventListener('resize', size);
    var col = function () { return getComputedStyle(root).getPropertyValue('--accent-2').trim() || '#f3cd7f'; };
    var color = col(); var tick = 0;
    (function frame() {
      requestAnimationFrame(frame); if (!run || !vis || off()) return;
      if (++tick % 240 === 0) color = col();
      ctx.clearRect(0, 0, W, H); ctx.fillStyle = color;
      for (var i = 0; i < P.length; i++) {
        var p = P[i]; p.t += 0.01; p.x += p.vx + Math.sin(p.t) * 0.12; p.y += p.vy;
        var dx = p.x - mx, dy = p.y - my, d2 = dx * dx + dy * dy; if (d2 < 9000) { var f = (1 - d2 / 9000) * 0.9; p.x += dx / Math.sqrt(d2 + 1) * f * 2; p.y += dy / Math.sqrt(d2 + 1) * f * 2; }
        if (p.y < -5) { p.y = H + 5; p.x = Math.random() * W; } if (p.x < -5) p.x = W + 5; if (p.x > W + 5) p.x = -5;
        ctx.globalAlpha = p.a * (0.6 + 0.4 * Math.sin(p.t * 2)); ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
      }
      ctx.globalAlpha = 1;
    })();
  }
  function aurora(host) { if (host._aur) return; host._aur = true; var a = document.createElement('div'); a.className = 'aurora'; a.innerHTML = '<i></i><i></i><i></i>'; host.insertBefore(a, host.firstChild); }

  /* ---------- Konfetti ---------- */
  function confetti(x, y, n) {
    if (off()) return; var c = document.createElement('canvas'); c.className = 'fx-confetti'; c.width = innerWidth; c.height = innerHeight; document.body.appendChild(c);
    var ctx = c.getContext('2d'); var acc = getComputedStyle(root).getPropertyValue('--accent').trim() || '#dfa94a';
    var cols = [acc, '#f3cd7f', '#5fd6a4', '#7fb0ff', '#ff8fa3', '#ffffff']; var P = [];
    x = x == null ? innerWidth / 2 : x; y = y == null ? innerHeight * 0.35 : y; n = n || 120;
    for (var i = 0; i < n; i++) { var a = Math.random() * Math.PI * 2, s = Math.random() * 9 + 3; P.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 5, w: Math.random() * 7 + 4, h: Math.random() * 4 + 3, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: cols[i % cols.length], life: 1 }); }
    var t0 = performance.now();
    (function f(now) {
      var dt = Math.min(2, (now - (f.l || now)) / 16.7); f.l = now; ctx.clearRect(0, 0, c.width, c.height); var alive = 0;
      P.forEach(function (p) { p.vy += 0.28 * dt; p.vx *= 0.992; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt; p.life -= 0.0075 * dt; if (p.life > 0 && p.y < c.height + 20) { alive++; ctx.save(); ctx.globalAlpha = Math.max(0, p.life); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore(); } });
      if (alive && now - t0 < 3500) requestAnimationFrame(f); else c.remove();
    })(t0);
  }

  /* ---------- Hero-Titel: Wort für Wort ---------- */
  function splitHeadline(h) {
    if (h._split || off()) return; h._split = true; var i = 0;
    function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) { var frag = document.createDocumentFragment(); n.textContent.split(/(\s+)/).forEach(function (w) { if (!w) return; if (/^\s+$/.test(w)) { frag.appendChild(document.createTextNode(w)); return; } var s = document.createElement('span'); s.className = 'w'; s.style.setProperty('--w', String(i++)); s.textContent = w; frag.appendChild(s); }); node.replaceChild(frag, n); }
        else if (n.nodeType === 1 && n.tagName !== 'BR') walk(n);
      });
    }
    walk(h); h.classList.add('split');
  }

  /* ---------- Fortschritt beim Scrollen ---------- */
  function progress() {
    if (document.getElementById('tp-progress') || isAdmin || document.body.classList.contains('game')) return;
    var bar = document.createElement('div'); bar.id = 'tp-progress'; document.body.appendChild(bar);
    var parallax = document.querySelectorAll('.hero, .aurora i');
    window.addEventListener('scroll', function () { var h = document.documentElement; var p = h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight); bar.style.transform = 'scaleX(' + p.toFixed(4) + ')'; root.style.setProperty('--sy', String(Math.min(1, h.scrollTop / 600))); }, { passive: true });
  }

  /* ---------- Schalter ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-motion-toggle]'); if (!t) return;
    var nowOff = !off(); if (nowOff) root.setAttribute('data-motion', 'off'); else root.removeAttribute('data-motion'); store.set('tp-motion', nowOff ? 'off' : 'on');
    if (!nowOff) { reveal(document.body); } t.setAttribute('aria-pressed', String(!nowOff)); t.classList.toggle('on', !nowOff);
  });

  /* ---------- Start & Beobachtung ---------- */
  function scan(scope) {
    reveal(scope); counters(scope);
    if (scope.querySelectorAll) {
      var h = scope.querySelectorAll('h1[data-split]'); for (var i = 0; i < h.length; i++) splitHeadline(h[i]);
    }
  }
  function boot() {
    scan(document.body); progress();
    var hero = document.querySelector('.hero'); if (hero) { aurora(hero); particles(hero); }
    var auth = document.querySelector('.auth-wrap'); if (auth) { aurora(auth); particles(auth); }
    if (document.body.classList.contains('game')) { var bg = document.createElement('div'); bg.className = 'fx-bg'; document.body.insertBefore(bg, document.body.firstChild); aurora(bg); particles(bg); }
    new MutationObserver(function (muts) {
      muts.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType === 1) scan(n); }); });
      var sh = document.querySelector('.shell'); if (sh && !sh._fx2) { sh._fx2 = true; }
    }).observe(document.body, { childList: true, subtree: true });
  }
  window.TPMotion = { confetti: confetti, countUp: counters, reveal: reveal };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
