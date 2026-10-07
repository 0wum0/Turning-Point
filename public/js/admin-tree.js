/* Baum-Editor für JSON: macht aus <textarea data-tree> ein bearbeitbares Formular (Zahlen, Texte, Schalter,
   Listen mit Hinzufügen/Löschen/Sortieren). Der Text bleibt im Formular und wird beim Speichern übertragen. */
(function () {
  'use strict';
  var typeOf = function (v) { return v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v; };
  var clone = function (v) { return JSON.parse(JSON.stringify(v)); };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function labelOf(v, fallback) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      var n = v.name || v.title || v.id || v.key || v.pkey;
      if (n != null) return String(n) + (v.id != null && v.name ? '  ·  ' + v.id : '');
    }
    return fallback;
  }
  function blankLike(v) {
    switch (typeOf(v)) {
      case 'number': return 0; case 'boolean': return false; case 'string': return '';
      case 'array': return []; case 'object': { var o = {}; Object.keys(v).forEach(function (k) { o[k] = blankLike(v[k]); }); return o; }
      default: return '';
    }
  }

  function build(ta) {
    var data;
    try { data = JSON.parse(ta.value); } catch (e) { return; }
    var box = el('div', 'tree');
    var bar = el('div', 'tree-bar');
    var rawBtn = el('button', 'btn sm ghost', 'Roh-JSON'); rawBtn.type = 'button';
    var openBtn = el('button', 'btn sm ghost', 'Alles aufklappen'); openBtn.type = 'button';
    var closeBtn = el('button', 'btn sm ghost', 'Alles zuklappen'); closeBtn.type = 'button';
    bar.appendChild(openBtn); bar.appendChild(closeBtn); bar.appendChild(rawBtn);
    var body = el('div', 'tree-body');
    box.appendChild(bar); box.appendChild(body);
    ta.parentNode.insertBefore(box, ta);
    ta.classList.add('hide'); ta.style.display = 'none';
    var raw = false;

    function sync() { ta.value = JSON.stringify(data, null, 2); }

    function primitive(holder, key, label) {
      var row = el('div', 'tr-row');
      row.appendChild(el('label', 'tr-key', label));
      var v = holder[key]; var t = typeOf(v); var input;
      if (t === 'boolean') {
        input = el('input'); input.type = 'checkbox'; input.checked = v;
        input.addEventListener('change', function () { holder[key] = input.checked; sync(); });
      } else if (t === 'number') {
        input = el('input'); input.type = 'number'; input.step = 'any'; input.value = v;
        input.addEventListener('input', function () { var n = parseFloat(input.value); holder[key] = Number.isFinite(n) ? n : 0; sync(); });
      } else if (t === 'string' && (v.length > 90 || v.indexOf('\n') >= 0)) {
        input = el('textarea'); input.value = v; input.rows = Math.min(8, Math.max(3, Math.ceil(v.length / 90)));
        input.addEventListener('input', function () { holder[key] = input.value; sync(); });
      } else {
        input = el('input'); input.type = 'text'; input.value = v == null ? '' : v;
        input.addEventListener('input', function () { holder[key] = input.value; sync(); });
      }
      row.appendChild(input);
      var tools = el('span', 'tr-tools');
      if (t === 'null') { var nb = el('button', 'btn sm ghost', 'Wert setzen'); nb.type = 'button'; nb.onclick = function () { holder[key] = ''; sync(); render(); }; tools.appendChild(nb); input.disabled = true; input.placeholder = 'leer (null)'; }
      else if (t === 'string' || t === 'number') {
        var cv = el('button', 'btn sm ghost', t === 'string' ? '→ Zahl' : '→ Text'); cv.type = 'button'; cv.title = 'Datentyp wechseln';
        cv.onclick = function () { if (t === 'string') { var n = parseFloat(String(holder[key]).replace(',', '.')); holder[key] = Number.isFinite(n) ? n : 0; } else holder[key] = String(holder[key]); sync(); render(); };
        tools.appendChild(cv);
      }
      row.appendChild(tools);
      return row;
    }

    function container(holder, key, label, depth, parent, idx) {
      var v = holder[key]; var isArr = Array.isArray(v);
      var d = el('details', 'tr-node'); if (depth < 1) d.open = true;
      var sum = el('summary');
      var title = el('span', 'tr-title', label);
      var cnt = el('span', 'tr-count', isArr ? v.length + ' Einträge' : Object.keys(v).length + ' Felder');
      sum.appendChild(title); sum.appendChild(cnt);
      var tools = el('span', 'tr-tools');
      function mk(text, fn, tip) { var b = el('button', 'btn sm ghost', text); b.type = 'button'; if (tip) b.title = tip; b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); fn(); }); tools.appendChild(b); }
      if (parent && Array.isArray(parent)) {
        mk('↑', function () { if (idx > 0) { var x = parent[idx]; parent[idx] = parent[idx - 1]; parent[idx - 1] = x; sync(); render(); } }, 'nach oben');
        mk('↓', function () { if (idx < parent.length - 1) { var x = parent[idx]; parent[idx] = parent[idx + 1]; parent[idx + 1] = x; sync(); render(); } }, 'nach unten');
        mk('⧉', function () { parent.splice(idx + 1, 0, clone(parent[idx])); sync(); render(); }, 'duplizieren');
      }
      if (parent) mk('✕', function () { if (!window.confirm('„' + label + '“ löschen?')) return; if (Array.isArray(parent)) parent.splice(idx, 1); else delete holder[key]; sync(); render(); }, 'löschen');
      sum.appendChild(tools);
      d.appendChild(sum);
      var inner = el('div', 'tr-inner');
      if (isArr) {
        v.forEach(function (_, i) { inner.appendChild(node(v, i, labelOf(v[i], '#' + (i + 1)), depth + 1, v, i)); });
        var add = el('button', 'btn sm', '+ Eintrag'); add.type = 'button';
        add.onclick = function () {
          var nv; if (v.length) nv = blankLike(v[v.length - 1]); else { var c = window.prompt('Typ des neuen Eintrags: zahl, text, objekt, liste', 'text'); if (c == null) return; nv = c === 'zahl' ? 0 : c === 'objekt' ? {} : c === 'liste' ? [] : ''; }
          if (v.length && v[v.length - 1] && typeof v[v.length - 1] === 'object' && !Array.isArray(v[v.length - 1])) { nv = clone(v[v.length - 1]); if ('id' in nv) nv.id = (nv.id || 'neu') + '_2'; if ('name' in nv) nv.name = 'Neu: ' + nv.name; }
          v.push(nv); sync(); render();
        };
        inner.appendChild(add);
      } else {
        Object.keys(v).forEach(function (k) { inner.appendChild(node(v, k, k, depth + 1, v, k)); });
        var addF = el('button', 'btn sm', '+ Feld'); addF.type = 'button';
        addF.onclick = function () {
          var name = window.prompt('Name des neuen Feldes'); if (!name) return;
          if (name in v) { window.alert('Das Feld gibt es schon.'); return; }
          var t = window.prompt('Typ: zahl, text, ja/nein, objekt, liste', 'zahl'); if (t == null) return;
          v[name] = t === 'zahl' ? 0 : t === 'text' ? '' : t === 'ja/nein' ? false : t === 'liste' ? [] : {};
          sync(); render();
        };
        inner.appendChild(addF);
      }
      d.appendChild(inner);
      return d;
    }

    function node(holder, key, label, depth, parent, idx) {
      var t = typeOf(holder[key]);
      if (t === 'object' || t === 'array') return container(holder, key, label, depth, parent, idx);
      var row = primitive(holder, key, label);
      if (parent && Array.isArray(parent)) {
        var x = el('button', 'btn sm ghost', '✕'); x.type = 'button'; x.title = 'löschen';
        x.onclick = function () { parent.splice(idx, 1); sync(); render(); };
        row.querySelector('.tr-tools').appendChild(x);
      } else if (parent && typeof parent === 'object') {
        var x2 = el('button', 'btn sm ghost', '✕'); x2.type = 'button'; x2.title = 'Feld löschen';
        x2.onclick = function () { delete parent[key]; sync(); render(); };
        row.querySelector('.tr-tools').appendChild(x2);
      }
      return row;
    }

    function render() {
      var openState = {};
      body.querySelectorAll('details.tr-node').forEach(function (d, i) { openState[i] = d.open; });
      body.textContent = '';
      var holder = { root: data };
      if (data && typeof data === 'object') {
        var top = Array.isArray(data) ? data : data;
        var inner = el('div', 'tr-inner tr-root');
        if (Array.isArray(top)) {
          top.forEach(function (_, i) { inner.appendChild(node(top, i, labelOf(top[i], '#' + (i + 1)), 0, top, i)); });
          var add = el('button', 'btn sm', '+ Eintrag'); add.type = 'button';
          add.onclick = function () { top.push(top.length ? blankLike(top[top.length - 1]) : ''); sync(); render(); };
          inner.appendChild(add);
        } else {
          Object.keys(top).forEach(function (k) { inner.appendChild(node(top, k, k, 0, top, k)); });
          var addF = el('button', 'btn sm', '+ Feld'); addF.type = 'button';
          addF.onclick = function () { var name = window.prompt('Name des neuen Feldes'); if (!name || name in top) return; top[name] = 0; sync(); render(); };
          inner.appendChild(addF);
        }
        body.appendChild(inner);
      } else {
        var r = primitive(holder, 'root', 'Wert'); body.appendChild(r);
      }
      body.querySelectorAll('details.tr-node').forEach(function (d, i) { if (i in openState) d.open = openState[i]; });
    }

    rawBtn.onclick = function () {
      if (!raw) { raw = true; body.style.display = 'none'; ta.style.display = ''; ta.classList.remove('hide'); rawBtn.textContent = 'Formular'; }
      else {
        try { data = JSON.parse(ta.value); } catch (e) { window.alert('Das JSON ist ungültig: ' + e.message); return; }
        raw = false; ta.style.display = 'none'; body.style.display = ''; rawBtn.textContent = 'Roh-JSON'; render();
      }
    };
    openBtn.onclick = function () { body.querySelectorAll('details').forEach(function (d) { d.open = true; }); };
    closeBtn.onclick = function () { body.querySelectorAll('details').forEach(function (d) { d.open = false; }); };
    ta.form && ta.form.addEventListener('submit', function () { if (raw) { try { data = JSON.parse(ta.value); } catch (e) { /* Server meldet den Fehler */ } } });
    render();
  }

  document.querySelectorAll('textarea[data-tree]').forEach(build);
})();
