(function () {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var icon = function (n) { return '<svg class="i" aria-hidden="true"><use href="/img/icons.svg#i-' + n + '"/></svg>'; };
  var state = { dbOk: false, existing: false };

  function show(n) {
    document.querySelectorAll('.pane').forEach(function (p) { p.classList.toggle('hide', p.dataset.pane !== String(n)); });
    document.querySelectorAll('#steps li').forEach(function (li) {
      var s = Number(li.dataset.step);
      li.classList.toggle('on', s === n); li.classList.toggle('done', s < n);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function key() { var k = $('#installKey'); return k ? k.value : ''; }
  function post(url, body) {
    body.installKey = key();
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) { return r.json(); });
  }
  function dbBody() {
    return { host: $('#db_host').value, port: $('#db_port').value, database: $('#db_name').value, user: $('#db_user').value, password: $('#db_pass').value || (state.pwEnv ? '__ENV__' : '') };
  }

  fetch('/install/api/check').then(function (r) { return r.json(); }).then(function (res) {
    $('#checks').innerHTML = res.checks.map(function (c) {
      var cls = !c.ok ? 'bad' : c.warn ? 'warn' : 'ok';
      return '<div class="check-row ' + cls + '">' + icon(!c.ok ? 'circle-alert' : c.warn ? 'triangle-alert' : 'circle-check') + '<div><b>' + c.label + '</b><span>' + c.detail.replace(/</g, '&lt;') + '</span></div></div>';
    }).join('');
    $('#to2').disabled = !res.ok;
    if (res.prefill) { state.pwEnv = true; $('#db_host').value = res.prefill.host; $('#db_port').value = res.prefill.port; $('#db_name').value = res.prefill.database; $('#db_user').value = res.prefill.user; $('#db_pass').placeholder = 'aus Umgebungsvariable TP_DB_PASS'; }
  });
  $('#to2').addEventListener('click', function () { show(2); });
  document.querySelectorAll('[data-back]').forEach(function (b) { b.addEventListener('click', function () { show(Number(b.dataset.back)); }); });

  $('#dbTest').addEventListener('click', function () {
    var btn = this; btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Teste …';
    $('#dbResult').innerHTML = '';
    post('/install/api/db-test', { db: dbBody() }).then(function (res) {
      btn.disabled = false; btn.textContent = 'Verbindung testen';
      if (res.ok) {
        state.dbOk = true; state.existing = res.installed;
        $('#dbResult').innerHTML = '<div class="alert good">' + icon('circle-check') + '<div>Verbunden mit MySQL/MariaDB ' + res.version + '. ' + (res.installed ? '<b>Bestehende Installation gefunden.</b>' : res.tables ? 'Die Datenbank enthält bereits ' + res.tables + ' fremde Tabellen – sie werden nicht angetastet.' : 'Leere Datenbank – perfekt.') + '</div></div>';
        $('#to3').disabled = false;
      } else {
        state.dbOk = false; $('#to3').disabled = true;
        $('#dbResult').innerHTML = '<div class="alert bad">' + icon('circle-alert') + '<div>' + String(res.error).replace(/</g, '&lt;') + '</div></div>';
      }
    }).catch(function () { btn.disabled = false; btn.textContent = 'Verbindung testen'; $('#dbResult').innerHTML = '<div class="alert bad">' + icon('circle-alert') + '<div>Keine Antwort vom Server.</div></div>'; });
  });
  $('#to3').addEventListener('click', function () {
    $('#adminBox').classList.toggle('hide', state.existing);
    $('#existingBox').classList.toggle('hide', !state.existing);
    show(3);
  });

  function run() {
    show(4);
    $('#log').innerHTML = ''; $('#doneBox').classList.add('hide'); $('#errBox').classList.add('hide'); $('#doneTitle').textContent = 'Installation läuft …';
    post('/install/api/run', {
      db: dbBody(), site: { name: $('#site_name').value, url: $('#site_url').value },
      admin: { username: $('#a_user').value, email: $('#a_mail').value, password: $('#a_pass').value },
    }).then(function (res) {
      if (!res.ok) { $('#errBox').classList.remove('hide'); $('#errText').textContent = res.error; $('#doneTitle').textContent = 'Installation fehlgeschlagen'; return; }
      var i = 0;
      (function next() {
        if (i >= res.steps.length) {
          $('#doneTitle').textContent = 'Installation abgeschlossen'; $('#doneBox').classList.remove('hide');
          if (res.env) {
            $('#envBox').classList.remove('hide');
            var txt = Object.keys(res.env).map(function (k) { return k + '=' + res.env[k]; }).join('\n');
            $('#envPre').textContent = txt;
            $('#envCopy').onclick = function () { navigator.clipboard.writeText(txt).then(function () { $('#envCopy').textContent = 'Kopiert ✓'; }); };
          }
          return;
        }
        var li = document.createElement('li'); li.innerHTML = icon('circle-check') + '<span></span>'; li.lastChild.textContent = res.steps[i++]; $('#log').appendChild(li);
        setTimeout(next, 220);
      })();
    }).catch(function () { $('#errBox').classList.remove('hide'); $('#errText').textContent = 'Keine Antwort vom Server.'; });
  }
  $('#install').addEventListener('click', run);
  $('#retry').addEventListener('click', function () { show(3); });
  document.querySelectorAll('[data-theme-toggle]').forEach(function (b) { b.addEventListener('click', function () { var c = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light'; document.documentElement.setAttribute('data-theme', c); try { localStorage.setItem('tp-theme', c); } catch (e) {} }); });
})();
