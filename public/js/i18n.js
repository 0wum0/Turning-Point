/* Englische Oberfläche: tauscht bekannte deutsche Texte im DOM (inkl. dynamisch erzeugter Inhalte). Wird nur bei lang=en geladen. */
(function () {
  var D = window.TP_I18N; if (!D) return;
  var ex = D.exact, pats = (D.patterns || []).map(function (p) { return [new RegExp(p[0]), p[1]]; });
  var ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, CODE: 1 };
  function tr(s) {
    var t = s.trim(); if (!t) return null;
    var r = ex[t]; if (r === undefined) { for (var i = 0; i < pats.length; i++) if (pats[i][0].test(t)) { r = t.replace(pats[i][0], pats[i][1]); break; } }
    if (r === undefined) r = parts(t);
    if (r === undefined) return null;
    r = r.replace(/(\d),(\d{1,2})(?= ?%)/g, '$1.$2');
    return s.replace(t, r);
  }
  /* Zusammengesetzte Zeilen („3 Zimmer · Zustand 80 %“, „Wert 5 DM ·“): Teile an „ · “ einzeln übersetzen. */
  function one(t) {
    var r = ex[t]; if (r !== undefined) return r;
    for (var i = 0; i < pats.length; i++) if (pats[i][0].test(t)) return t.replace(pats[i][0], pats[i][1]);
    return undefined;
  }
  function parts(t) {
    var lead = /^· /.test(t) ? '· ' : '', trail = / ·$/.test(t) ? ' ·' : '', core = t.slice(lead.length, t.length - trail.length);
    if (core.indexOf(' · ') < 0) { if (!lead && !trail) return undefined; var c = one(core); return c === undefined ? undefined : lead + c + trail; }
    var any = false, out = core.split(' · ').map(function (x) { var c = one(x); if (c === undefined) return x; any = true; return c; });
    return any ? lead + out.join(' · ') + trail : undefined;
  }
  function text(n) { var v = n.nodeValue, r = tr(v); if (r !== null && r !== v) n.nodeValue = r; }
  function walk(root) {
    if (root.nodeType === 3) { if (!root.parentNode || !SKIP[root.parentNode.nodeName] && !(root.parentNode.closest && root.parentNode.closest('[data-i18n-skip]'))) text(root); return; }
    if (root.nodeType !== 1 || SKIP[root.nodeName] || (root.closest && root.closest('[data-i18n-skip]'))) return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null), n = w.currentNode;
    attrs(root);
    while ((n = w.nextNode())) {
      if (n.nodeType === 3) { var p = n.parentNode; if (p && !SKIP[p.nodeName] && !(p.closest && p.closest('[data-i18n-skip]'))) text(n); } else attrs(n);
    }
  }
  function attrs(el) { ATTRS.forEach(function (a) { var v = el.getAttribute && el.getAttribute(a); if (v) { var r = tr(v); if (r !== null && r !== v) el.setAttribute(a, r); } }); if (el.nodeName === 'INPUT' && el.type === 'submit' && el.value) { var r2 = tr(el.value); if (r2) el.value = r2; } }
  function start() {
    walk(document.body);
    var busy = false;
    new MutationObserver(function (ms) {
      if (busy) return; busy = true;
      ms.forEach(function (m) {
        if (m.type === 'characterData') text(m.target);
        else if (m.type === 'attributes') attrs(m.target);
        else m.addedNodes.forEach(walk);
      });
      busy = false;
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    var tt = tr(document.title); if (tt) document.title = tt;
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
