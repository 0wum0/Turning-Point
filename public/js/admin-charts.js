/* Kleine Diagramm-Bibliothek für das Admin-Panel (SVG, ohne Abhängigkeiten, CSP-sicher).
   Verwendung: <div data-chart='{"type":"line","labels":[…],"series":[{"name":"…","data":[…]}]}'></div>
   Typen: line, area, bar, combo (Serie mit "type":"bar"|"line"), donut, hbar · <span data-spark='[1,2,3]'> */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var COLORS = ['#e0a94a', '#6aa7ff', '#4fd1a1', '#a78bfa', '#f472b6', '#38bdf8', '#fb923c', '#94a3b8'];
  function css(name, fb) { var v = getComputedStyle(document.body).getPropertyValue(name).trim(); return v || fb; }
  function el(tag, attrs, parent) { var e = document.createElementNS(NS, tag); Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); }); if (parent) parent.appendChild(e); return e; }
  function h(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  var FMT = {
    int: function (v) { return Math.round(v).toLocaleString('de-DE'); },
    eur: function (v) { return v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; },
    pct: function (v) { return Math.round(v) + ' %'; },
    short: function (v) { var a = Math.abs(v); return a >= 1e9 ? (v / 1e9).toFixed(1) + ' Mrd' : a >= 1e6 ? (v / 1e6).toFixed(1) + ' Mio' : a >= 1e4 ? (v / 1e3).toFixed(0) + ' Tsd' : FMT.int(v); },
  };
  function nice(max) { if (max <= 0) return 1; var p = Math.pow(10, Math.floor(Math.log10(max))); var f = max / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }
  function dateLabel(l) { return /^\d{4}-\d{2}-\d{2}$/.test(l) ? l.slice(8, 10) + '.' + l.slice(5, 7) + '.' : l; }

  function tooltipFor(host) {
    var t = h('div', 'ch-tip'); t.style.display = 'none'; host.appendChild(t); return t;
  }

  function cartesian(host, cfg, w) {
    var H = cfg.height || 240; var m = { l: 46, r: 12, t: 12, b: 28 };
    var fmt = FMT[cfg.fmt || 'int'] || FMT.int; var afmt = cfg.fmt === 'eur' || cfg.fmt === 'int' || !cfg.fmt ? function (v) { return Math.abs(v) < 10 && v % 1 ? v.toLocaleString('de-DE', { maximumFractionDigits: 1 }) : FMT.short(v); } : fmt;
    var n = cfg.labels.length; var series = cfg.series.map(function (s, i) { return Object.assign({ color: COLORS[i % COLORS.length], type: cfg.type === 'bar' ? 'bar' : cfg.type === 'area' ? 'area' : cfg.type === 'combo' ? 'line' : 'line' }, s); });
    var hasBar = series.some(function (s) { return s.type === 'bar'; });
    var stack = !!cfg.stacked && series.every(function (s) { return s.type === 'bar'; });
    var max = 0;
    for (var i = 0; i < n; i++) { var tot = 0; series.forEach(function (s) { var v = s.data[i]; if (v == null) return; if (stack) tot += v; else if (v > max) max = v; }); if (stack && tot > max) max = tot; }
    var top = nice(max * 1.05 || 1);
    var iw = w - m.l - m.r; var ih = H - m.t - m.b;
    var svg = el('svg', { viewBox: '0 0 ' + w + ' ' + H, width: w, height: H, 'class': 'ch-svg', role: 'img' }, host);
    var defs = el('defs', {}, svg);
    series.forEach(function (s, k) { var g = el('linearGradient', { id: 'g' + host._uid + k, x1: 0, y1: 0, x2: 0, y2: 1 }, defs); el('stop', { offset: '0%', 'stop-color': s.color, 'stop-opacity': 0.38 }, g); el('stop', { offset: '100%', 'stop-color': s.color, 'stop-opacity': 0 }, g); });
    var X = function (i) { return m.l + (hasBar ? (i + 0.5) * iw / n : (n === 1 ? iw / 2 : i * iw / (n - 1))); };
    var Y = function (v) { return m.t + ih - v / top * ih; };
    for (var t = 0; t <= 4; t++) {
      var v = top / 4 * t; var y = Y(v);
      el('line', { x1: m.l, x2: w - m.r, y1: y, y2: y, 'class': t === 0 ? 'ch-axis' : 'ch-grid' }, svg);
      var tx = el('text', { x: m.l - 8, y: y + 4, 'text-anchor': 'end', 'class': 'ch-lbl' }, svg); tx.textContent = afmt(v);
    }
    var step = Math.ceil(n / Math.max(2, Math.floor(iw / 62)));
    for (var j = 0; j < n; j += step) { var lx = el('text', { x: X(j), y: H - 8, 'text-anchor': 'middle', 'class': 'ch-lbl' }, svg); lx.textContent = dateLabel(cfg.labels[j]); }
    var nb = series.filter(function (s) { return s.type === 'bar'; }); var bw = Math.max(2, Math.min(34, iw / n * (stack ? 0.66 : 0.78) / (stack ? 1 : Math.max(1, nb.length))));
    var acc = new Array(n).fill(0); var bi = 0;
    series.forEach(function (s, k) {
      if (s.type === 'bar') {
        s.data.forEach(function (v, i) {
          if (v == null) return; var x0 = stack ? X(i) - bw / 2 : X(i) - bw * nb.length / 2 + bi * bw; var y0 = stack ? Y(acc[i] + v) : Y(v); var hh = stack ? Y(acc[i]) - Y(acc[i] + v) : Y(0) - Y(v);
          el('rect', { x: x0 + (stack ? 0 : 1), y: y0, width: Math.max(1, bw - (stack ? 0 : 2)), height: Math.max(0, hh), rx: Math.min(4, bw / 3), fill: s.color, 'fill-opacity': 0.9 }, svg);
          if (stack) acc[i] += v;
        });
        bi++;
      } else {
        var pts = s.data.map(function (v, i) { return v == null ? null : [X(i), Y(v)]; }).filter(Boolean);
        if (!pts.length) return;
        var d = 'M' + pts[0][0] + ',' + pts[0][1];
        for (var p = 1; p < pts.length; p++) { var mx = (pts[p - 1][0] + pts[p][0]) / 2; d += ' Q' + pts[p - 1][0] + ',' + pts[p - 1][1] + ' ' + mx + ',' + (pts[p - 1][1] + pts[p][1]) / 2; }
        d += ' T' + pts[pts.length - 1][0] + ',' + pts[pts.length - 1][1];
        if (s.type === 'area') el('path', { d: d + ' L' + pts[pts.length - 1][0] + ',' + Y(0) + ' L' + pts[0][0] + ',' + Y(0) + ' Z', fill: 'url(#g' + host._uid + k + ')' }, svg);
        el('path', { d: d, fill: 'none', stroke: s.color, 'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, svg);
      }
    });
    var guide = el('line', { y1: m.t, y2: m.t + ih, 'class': 'ch-guide', visibility: 'hidden' }, svg);
    var dots = series.map(function (s) { return el('circle', { r: 4, fill: s.color, stroke: css('--bg', '#0b0d12'), 'stroke-width': 2, visibility: 'hidden' }, svg); });
    var tip = tooltipFor(host);
    var hit = el('rect', { x: m.l, y: m.t, width: iw, height: ih, fill: 'transparent' }, svg);
    function show(e) {
      var r = svg.getBoundingClientRect(); var px = (e.clientX - r.left) / r.width * w;
      var i = hasBar ? Math.floor((px - m.l) / (iw / n)) : Math.round((px - m.l) / (n === 1 ? 1 : iw / (n - 1)));
      i = Math.max(0, Math.min(n - 1, i));
      guide.setAttribute('x1', X(i)); guide.setAttribute('x2', X(i)); guide.setAttribute('visibility', hasBar ? 'hidden' : 'visible');
      var rows = ''; var cum = 0;
      series.forEach(function (s, k) { var v = s.data[i]; if (v == null) { dots[k].setAttribute('visibility', 'hidden'); return; } if (stack) cum += v; var yy = Y(stack ? cum : v); if (s.type !== 'bar') { dots[k].setAttribute('cx', X(i)); dots[k].setAttribute('cy', yy); dots[k].setAttribute('visibility', 'visible'); } rows += '<div><i style="background:' + s.color + '"></i>' + s.name.replace(/</g, '&lt;') + '<b>' + (s.fmt && FMT[s.fmt] ? FMT[s.fmt](v) : fmt(v)) + '</b></div>'; });
      tip.innerHTML = '<span>' + dateLabel(cfg.labels[i]) + '</span>' + rows; tip.style.display = 'block';
      var tw = tip.offsetWidth; var left = X(i) / w * r.width + 12; if (left + tw > r.width - 4) left = X(i) / w * r.width - tw - 12; tip.style.left = Math.max(4, left) + 'px'; tip.style.top = '8px';
    }
    function hide() { guide.setAttribute('visibility', 'hidden'); dots.forEach(function (d) { d.setAttribute('visibility', 'hidden'); }); tip.style.display = 'none'; }
    hit.addEventListener('mousemove', show); hit.addEventListener('touchmove', function (e) { show(e.touches[0]); }, { passive: true }); hit.addEventListener('mouseleave', hide); hit.addEventListener('touchend', hide);
  }

  function donut(host, cfg, w) {
    var data = cfg.series[0].data; var labels = cfg.labels; var total = data.reduce(function (a, b) { return a + b; }, 0);
    var wrap = h('div', 'ch-donut'); host.appendChild(wrap);
    var size = Math.min(w, 190); var r = size / 2 - 14; var C = 2 * Math.PI * r;
    var svg = el('svg', { viewBox: '0 0 ' + size + ' ' + size, width: size, height: size, 'class': 'ch-svg' }, wrap);
    el('circle', { cx: size / 2, cy: size / 2, r: r, fill: 'none', stroke: css('--border', 'rgba(255,255,255,.1)'), 'stroke-width': 18 }, svg);
    var off = 0; var segs = [];
    data.forEach(function (v, i) {
      if (!v || !total) return; var len = v / total * C;
      var c = el('circle', { cx: size / 2, cy: size / 2, r: r, fill: 'none', stroke: COLORS[i % COLORS.length], 'stroke-width': 18, 'stroke-dasharray': Math.max(0, len - 1.5) + ' ' + (C - len + 1.5), 'stroke-dashoffset': -off, transform: 'rotate(-90 ' + size / 2 + ' ' + size / 2 + ')', 'class': 'ch-seg' }, svg);
      segs.push(c); off += len;
    });
    var ctr = el('text', { x: size / 2, y: size / 2 + 2, 'text-anchor': 'middle', 'class': 'ch-big' }, svg); ctr.textContent = FMT.int(total);
    var sub = el('text', { x: size / 2, y: size / 2 + 20, 'text-anchor': 'middle', 'class': 'ch-lbl' }, svg); sub.textContent = cfg.center || 'gesamt';
    var leg = h('div', 'ch-legend'); wrap.appendChild(leg);
    data.forEach(function (v, i) {
      var row = h('div', 'ch-leg'); var dot = h('i'); dot.style.background = COLORS[i % COLORS.length]; row.appendChild(dot);
      row.appendChild(h('span', '', labels[i])); row.appendChild(h('b', '', FMT.int(v) + (total ? ' · ' + Math.round(v / total * 100) + ' %' : ''))); leg.appendChild(row);
    });
  }

  function hbar(host, cfg) {
    var data = cfg.series[0].data; var max = Math.max.apply(null, data.concat([1])); var fmt = FMT[cfg.fmt || 'int'] || FMT.int;
    var box = h('div', 'ch-hbar');
    data.forEach(function (v, i) {
      var row = h('div', 'ch-hrow'); row.appendChild(h('span', 'ch-hl', cfg.labels[i]));
      var bar = h('div', 'ch-htrack'); var fill = h('i'); fill.style.width = Math.max(2, v / max * 100) + '%'; fill.style.background = cfg.series[0].color || COLORS[0]; bar.appendChild(fill); row.appendChild(bar);
      row.appendChild(h('b', 'ch-hv', fmt(v))); box.appendChild(row);
    });
    if (!data.length) box.appendChild(h('div', 'dim small', 'Keine Daten.'));
    host.appendChild(box);
  }

  var uid = 0;
  function render(host) {
    var cfg; try { cfg = JSON.parse(host.getAttribute('data-chart')); } catch (e) { return; }
    host._uid = host._uid || ++uid; host.textContent = ''; host.classList.add('ch');
    if (cfg.title) { /* Titel stehen im Karten-Kopf */ }
    var w = Math.max(240, Math.floor(host.clientWidth || host.parentNode.clientWidth || 320));
    var empty = !cfg.series || !cfg.series.length || cfg.series.every(function (s) { return !s.data.length || s.data.every(function (v) { return !v; }); });
    if (empty && cfg.type !== 'donut') { host.appendChild(h('div', 'ch-empty', cfg.empty || 'Noch keine Daten.')); host.style.minHeight = '80px'; return; }
    if (cfg.type === 'donut') donut(host, cfg, w); else if (cfg.type === 'hbar') hbar(host, cfg); else cartesian(host, cfg, w);
  }
  function sparks() {
    document.querySelectorAll('[data-spark]').forEach(function (e) {
      var d; try { d = JSON.parse(e.getAttribute('data-spark')); } catch (x) { return; }
      if (!d.length) return; var W = 96, Hh = 28; var mx = Math.max.apply(null, d.concat([1])); var mn = Math.min.apply(null, d.concat([0]));
      var pts = d.map(function (v, i) { return [d.length === 1 ? W / 2 : i * (W - 2) / (d.length - 1) + 1, Hh - 3 - (v - mn) / ((mx - mn) || 1) * (Hh - 6)]; });
      var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + Hh, width: W, height: Hh, 'class': 'ch-spark' });
      var path = 'M' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' L');
      el('path', { d: path + ' L' + pts[pts.length - 1][0] + ',' + Hh + ' L' + pts[0][0] + ',' + Hh + ' Z', fill: 'currentColor', 'fill-opacity': 0.14 }, svg);
      el('path', { d: path, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
      e.textContent = ''; e.appendChild(svg);
    });
  }
  function all() { document.querySelectorAll('[data-chart]').forEach(render); sparks(); }
  var timer; var lastW = window.innerWidth;
  window.addEventListener('resize', function () { if (window.innerWidth === lastW) return; lastW = window.innerWidth; clearTimeout(timer); timer = setTimeout(all, 150); });
  new MutationObserver(function () { clearTimeout(timer); timer = setTimeout(all, 50); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', all); else all();
})();
