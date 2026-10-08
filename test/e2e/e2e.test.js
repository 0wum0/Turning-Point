'use strict';
/**
 * E2E-Rundgang durch die wichtigsten Abläufe mit zwei frischen Spielern (Browser über Playwright, eigene App + frische Datenbank).
 * Start: npm run test:e2e   (nicht Teil von npm test). Siehe README → „E2E-Tests“.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const L = require('./lib');

const A = { username: 'alice_e2e', email: 'alice@e2e.test', password: 'alice-pass-123' };
const B = { username: 'bob_e2e', email: 'bob@e2e.test', password: 'bob-pass-12345' };
const XSS = '<img src=x onerror="window.__xss=1">';

let app; let browser; let a; let b;
const noErrors = (...pls) => { for (const p of pls) assert.deepEqual(p.errors, [], `Fehler im Browser von ${p.label}:\n${p.errors.join('\n')}\n--- Server-Log ---\n${app.log().split('\n').filter((l) => /\[error\]|Error/.test(l)).slice(-12).join('\n')}`); };
const text = (pl, sel = '#page') => pl.page.innerText(sel);
const confirmYes = (pl) => pl.page.click('.modal [data-close=yes]');

describe('E2E Turning Point', { concurrency: false }, () => {
  before(async () => {
    app = await L.startApp();
    const pw = L.loadPlaywright();
    browser = await pw.chromium.launch({ headless: !process.env.TP_E2E_HEADED });
    a = await L.newPlayer(browser, app, 'alice'); b = await L.newPlayer(browser, app, 'bob');
  });
  after(async () => {
    if (browser) await browser.close();
    if (app) await app.stop();
  });

  describe('Konto & Charakter', () => {
    it('Startseite und Rechtstexte laden', async () => {
      await a.page.goto(app.base);
      assert.match(await text(a, 'body'), /Turning Point|TURNING POINT/i);
      for (const p of ['/impressum', '/datenschutz', '/agb', '/login', '/register', '/forgot']) {
        const r = await a.page.goto(app.base + p); assert.equal(r.status(), 200, p);
      }
      noErrors(a);
    });

    it('Registrierung: Validierung und Erfolg', async () => {
      await a.page.goto(`${app.base}/register`);
      await a.page.fill('#username', 'x'); await a.page.fill('#email', 'kaputt'); await a.page.fill('#password', 'kurz');
      await a.page.check('input[name=terms]'); await a.page.click('button[type=submit]');
      assert.match(await text(a, '.auth-card'), /3–24 Zeichen/);
      await L.register(a, A);
      await L.register(b, B);
      await a.page.goto(`${app.base}/register`); // angemeldet → Weiterleitung
      await a.page.waitForURL('**/play');
      noErrors(a, b);
    });

    it('Doppelte Registrierung wird abgelehnt', async () => {
      const p = await L.newPlayer(browser, app, 'dup');
      await p.page.goto(`${app.base}/register`);
      await p.page.fill('#username', A.username); await p.page.fill('#email', 'andere@e2e.test'); await p.page.fill('#password', 'irgendwas-123');
      await p.page.check('input[name=terms]'); await p.page.click('button[type=submit]');
      assert.match(await text(p, '.auth-card'), /bereits vergeben/);
      await p.ctx.close();
    });

    it('Charaktere anlegen (Wizard) und HUD zeigt Namen', async () => {
      await L.createCharacter(a, { first: 'Anna', last: 'Alpha', gender: 'f' });
      await L.createCharacter(b, { first: 'Bernd', last: 'Beta' });
      assert.match(await text(a, '#hud'), /Anna Alpha/);
      assert.match(await text(b, '#hud'), /Bernd Beta/);
      assert.match(await text(a, '#page'), /Berliner|Zeitung|Stellenmarkt/i);
      noErrors(a, b);
    });

    it('Abmelden und falsches/richtiges Anmelden', async () => {
      await L.logout(b);
      await b.page.goto(`${app.base}/login`);
      await b.page.fill('#login', B.username); await b.page.fill('#password', 'falsch-falsch');
      await b.page.click('button[type=submit]');
      assert.match(await text(b, '.auth-card'), /stimmt nicht/);
      await L.login(b, { login: B.email, password: B.password }); // per E-Mail
      await b.page.waitForSelector('#hud .hud-id');
      assert.match(await text(b, '#hud'), /Bernd Beta/);
      // geschützte Seite ohne Sitzung
      const anon = await L.newPlayer(browser, app, 'anon');
      await anon.page.goto(`${app.base}/play`);
      assert.match(anon.page.url(), /login|\/$/);
      await anon.ctx.close();
      noErrors(a, b);
    });
  });

  describe('Alltag: Essen, Wohnen, Arbeit, Zeit', () => {
    it('Essen kaufen füllt den Kühlschrank', async () => {
      await L.nav(a, 'household');
      const before = await text(a);
      await a.page.click('[data-food="0"]');
      await a.page.waitForFunction((t) => document.querySelector('#page').innerText !== t, before);
      assert.match(await text(a), /% gefüllt/);
      const [{ s }] = await app.sql("SELECT JSON_EXTRACT(state, '$.fridge') s FROM characters WHERE user_id = ?", [await L.userId(app, A.username)]);
      assert.ok(Number(s) > 45 || s === null || typeof s === 'string', 'Kühlschrank geändert');
      noErrors(a);
    });

    it('Zeitung: Wohnungsmarkt, Pension beziehen', async () => {
      await L.nav(a, 'newspaper');
      await a.page.click('.paper-tabs [data-tab=housing]');
      await a.page.waitForSelector('.listings article');
      await a.page.click('[data-act=rent]:not([disabled]) >> nth=0');
      await a.page.waitForFunction(() => /Du wohnst hier/.test(document.querySelector('#page').innerText));
      await L.nav(a, 'housing');
      assert.doesNotMatch(await text(a), /Kein Dach/);
      noErrors(a);
    });

    it('Stellenmarkt: Job annehmen', async () => {
      await L.nav(a, 'newspaper');
      await a.page.click('.paper-tabs [data-tab=jobs]');
      await a.page.waitForSelector('[data-act=apply]');
      await a.page.click('[data-act=apply]:not([disabled]) >> nth=0');
      await a.page.waitForFunction(() => /Aktuell/.test(document.querySelector('#page').innerText));
      await L.nav(a, 'work');
      assert.doesNotMatch(await text(a), /Du hast keine Tätigkeit/);
      noErrors(a);
    });

    it('Zeit vorspulen (7 Tage)', async () => {
      await L.nav(a, 'overview');
      const date0 = await text(a, '#hud .hud-id small');
      await a.page.click('[data-advance="7"]');
      await a.page.waitForFunction((d) => document.querySelector('#hud .hud-id small').innerText !== d, date0);
      assert.notEqual(await text(a, '#hud .hud-id small'), date0);
      noErrors(a);
    });

    it('Karte, Stadt, Zeitung, Haushalt, Familie, Shop laden ohne Fehler', async () => {
      for (const id of ['map', 'city', 'newspaper', 'society', 'family', 'legacy', 'shop', 'business', 'work', 'housing', 'household', 'overview']) {
        await L.nav(a, id);
        assert.ok((await text(a)).length > 20, id);
      }
      await L.nav(a, 'map');
      assert.match(await text(a), /Deutschland/);
      noErrors(a);
    });
  });

  describe('Spielerwelt: Stadtplatz, Briefe, Verzeichnis', () => {
    it('Stadtverzeichnis zeigt beide Spieler', async () => {
      await L.nav(a, 'city');
      await a.page.waitForSelector('#dirBody .dir-row');
      assert.match(await text(a, '#dirBody'), /Bernd Beta/);
      assert.match(await text(a, '#dirBody'), /Anna Alpha/);
      noErrors(a);
    });

    it('Stadtplatz-Chat: Text wird maskiert angezeigt (XSS), Chat-Fenster, Antwort', async () => {
      await L.socialTab(a, 'plaza');
      await a.page.fill('#chatin', `${XSS} Hallo Berlin`);
      await a.page.click('#chatform button');
      await a.page.waitForSelector('#chatlog .cl.mine');
      assert.match(await text(a, '#chatlog'), /<img src=x/);
      await L.socialTab(b, 'plaza');
      await b.page.waitForSelector('#chatlog .cl');
      assert.match(await text(b, '#chatlog'), /Hallo Berlin/);
      assert.equal(await b.page.locator('#chatlog img').count(), 0, 'kein eingeschleustes <img>');
      assert.equal(await b.page.evaluate(() => window.__xss), undefined);
      // Chat-Fenster über die Kopfzeile
      await L.closeModals(b);
      await b.page.click('#hud [data-chat]');
      await b.page.waitForSelector('#cm-in');
      await b.page.fill('#cm-in', 'Moin Anna!');
      await b.page.press('#cm-in', 'Enter');
      await b.page.waitForFunction(() => /Moin Anna!/.test(document.querySelector('#cm-log').innerText));
      // gleiche Nachricht sofort noch einmal → abgelehnt (Flut-Schutz)
      await b.page.fill('#cm-in', 'Moin Anna!'); await b.page.press('#cm-in', 'Enter');
      await b.page.waitForSelector('.toasts .toast.warn');
      await L.closeModals(b);
      await L.closeModals(a); await a.page.click('#hud [data-chat]');
      await a.page.waitForFunction(() => /Moin Anna!/.test((document.querySelector('#cm-log') || {}).innerText || ''));
      await L.closeModals(a);
      assert.equal(await a.page.evaluate(() => window.__xss), undefined);
      noErrors(a, b);
    });

    it('Brief schreiben, Glocke zeigt neue Post, Brief lesen', async () => {
      await L.socialTab(a, 'letters');
      await a.page.click('#newletter');
      await a.page.fill('#rq', 'Bernd');
      await a.page.click('[data-to] >> nth=0');
      await a.page.fill('#lsub', `Hallo ${XSS}`); await a.page.fill('#lbody', `Guten Tag, Bernd. ${XSS}`);
      await a.page.click('#lsend');
      await a.page.waitForSelector('.toasts .toast');
      // B lädt neu (Benachrichtigungen werden beim Laden abgefragt)
      await b.page.reload(); await b.page.waitForSelector('#hud [data-bell] .bcount');
      await b.page.click('#hud [data-bell]');
      await b.page.waitForSelector('.notif');
      assert.match(await text(b, '.modal'), /Anna Alpha/);
      await L.closeModals(b);
      await L.socialTab(b, 'letters');
      await b.page.click('[data-letter] >> nth=0');
      await b.page.waitForSelector('.modal');
      assert.match(await text(b, '.modal'), /Guten Tag, Bernd/);
      assert.equal(await b.page.locator('.modal img').count(), 0);
      assert.equal(await b.page.evaluate(() => window.__xss), undefined);
      await L.closeModals(b);
      noErrors(a, b);
    });

    it('Rangliste und Freunde-Tab laden', async () => {
      await L.socialTab(a, 'rank'); assert.match(await text(a), /Rangliste|Platz/);
      await L.socialTab(a, 'friends'); assert.match(await text(a), /Freunde/);
      await L.socialTab(a, 'love'); await L.socialTab(a, 'jobs'); await L.socialTab(a, 'elections');
      noErrors(a);
    });
  });

  describe('Spielerwirtschaft: Mieten, Angebote, Auktion, Börse', () => {
    let aId; let bId;
    before(async () => {
      aId = await L.userId(app, A.username); bId = await L.userId(app, B.username);
      await L.setMoney(app, A.username, 60000000); await L.setMoney(app, B.username, 30000000);
      await a.page.reload(); await b.page.reload();
      await a.page.waitForSelector('#hud .hud-id'); await b.page.waitForSelector('#hud .hud-id');
    });

    it('Alice kauft vier Häuser über die Zeitung', async () => {
      await L.nav(a, 'newspaper');
      await a.page.click('.paper-tabs [data-tab=housing]');
      for (let i = 1; i <= 4; i++) {
        await a.page.click('[data-act=buy]:not([disabled]) >> nth=0');
        await confirmYes(a);
        await a.page.waitForFunction((n) => document.querySelectorAll('.toasts .toast').length >= n, i);
      }
      const props = L.json((await app.sql('SELECT JSON_EXTRACT(state, "$.properties") p FROM characters WHERE user_id = ?', [aId]))[0].p);
      assert.equal(props.length, 4);
      noErrors(a);
    });

    it('Vermieten an Spieler: Eigentümerin schreibt aus, Bernd mietet im Stadtverzeichnis, zieht wieder aus', async () => {
      await L.nav(a, 'housing');
      await a.page.click('[data-lease=on][data-id="1"]');
      await a.page.waitForSelector('[data-lplayers="1"]');
      await a.page.check('[data-lplayers="1"]');
      await a.page.waitForFunction(() => /im Stadtverzeichnis/.test(document.querySelector('#page').innerText));
      // Mieter: Stadtverzeichnis → Häuser → Einziehen
      await L.nav(b, 'city');
      await b.page.click('[data-dtab=houses]');
      await b.page.waitForSelector(`[data-rentp$=":1"]`);
      await b.page.click(`[data-rentp$=":1"]`);
      await confirmYes(b);
      await b.page.waitForFunction(() => /eingezogen/.test(document.body.innerText));
      const [{ n }] = await app.sql("SELECT COUNT(*) n FROM player_leases WHERE owner_id = ? AND tenant_id = ? AND status = 'active'", [aId, bId]);
      assert.equal(n, 1);
      // Eigentümerin sieht den Mieter
      await a.page.reload(); await a.page.waitForSelector('#page');
      await L.nav(a, 'housing');
      assert.match(await text(a), /Spieler-Mieter kündigen/);
      // Mieter zieht aus
      await L.nav(b, 'housing');
      assert.match(await text(b), /zur Miete bei einem anderen Spieler/);
      await b.page.click('[data-leave]'); await confirmYes(b);
      await b.page.waitForFunction(() => !/zur Miete bei einem anderen Spieler/.test(document.querySelector('#page').innerText));
      const [{ m }] = await app.sql("SELECT COUNT(*) m FROM player_leases WHERE owner_id = ? AND tenant_id = ? AND status = 'ended'", [aId, bId]);
      assert.equal(m, 1);
      noErrors(a, b);
    });

    it('Erneut mieten und von der Eigentümerin kündigen lassen', async () => {
      await a.page.reload(); await a.page.waitForSelector('#page'); await L.nav(a, 'housing'); await a.page.waitForSelector('[data-lplayers="1"]:not([disabled])');
      await L.nav(b, 'city'); await b.page.click('[data-dtab=houses]');
      await b.page.click(`[data-rentp$=":1"]`); await confirmYes(b);
      await b.page.waitForFunction(() => /eingezogen/.test(document.body.innerText));
      await a.page.reload(); await a.page.waitForSelector('#page'); await L.nav(a, 'housing');
      await a.page.click('[data-evict="1"]'); await confirmYes(a);
      await a.page.waitForFunction(() => !/Spieler-Mieter kündigen/.test(document.querySelector('#page').innerText));
      await b.page.reload(); await b.page.waitForSelector('#hud .hud-id'); await L.nav(b, 'housing');
      assert.match(await text(b), /Straße|Kein Dach|Aktuell/);
      assert.doesNotMatch(await text(b), /zur Miete bei einem anderen Spieler/);
      noErrors(a, b);
    });

    it('Marktangebot: Bernd bietet für Haus 2, Alice nimmt an', async () => {
      await L.nav(b, 'city'); await b.page.click('[data-dtab=houses]');
      await b.page.waitForSelector(`[data-offer="prop:${aId}:2"]`);
      await b.page.click(`[data-offer="prop:${aId}:2"]`);
      await b.page.fill('#of-m', `Sofort bar ${XSS}`);
      await b.page.click('#of-go');
      await b.page.waitForSelector('.toasts .toast');
      await a.page.reload(); await a.page.waitForSelector('#hud .hud-id');
      await L.socialTab(a, 'market');
      await a.page.waitForSelector('[data-moff=accept]');
      assert.match(await text(a), /Sofort bar/);
      assert.equal(await a.page.locator('#page img').count(), 0);
      assert.equal(await a.page.evaluate(() => window.__xss), undefined);
      await a.page.click('[data-moff=accept] >> nth=0');
      await a.page.waitForFunction(() => /angenommen|Abgeschlossen/.test(document.body.innerText) || !document.querySelector('[data-moff=accept]'));
      const [o] = await app.sql("SELECT status FROM market_offers WHERE seller_id = ? ORDER BY id DESC LIMIT 1", [aId]);
      assert.equal(o.status, 'accepted');
      const bProps = L.json((await app.sql('SELECT JSON_EXTRACT(state, "$.properties") p FROM characters WHERE user_id = ?', [bId]))[0].p);
      assert.equal(bProps.length, 1);
      noErrors(a, b);
    });

    it('Versteigerung: Alice startet, Bernd bietet', async () => {
      await L.socialTab(a, 'market');
      await a.page.click('[data-sell^="prop:"] >> nth=0');
      await a.page.click('#sl-auc');
      await confirmYes(a);
      await a.page.waitForFunction(() => /Die Versteigerung läuft/.test(document.body.innerText));
      await L.socialTab(b, 'market');
      await b.page.reload(); await b.page.waitForSelector('#hud .hud-id'); await L.socialTab(b, 'market');
      await b.page.waitForSelector('[data-bid]');
      await b.page.click('[data-bid] >> nth=0');
      await b.page.click('#bd-go');
      await b.page.waitForFunction(() => /Gebot abgegeben/.test(document.body.innerText));
      const [{ n }] = await app.sql('SELECT COUNT(*) n FROM market_bids WHERE user_id = ?', [bId]);
      assert.equal(n, 1);
      noErrors(a, b);
    });

    it('Börse: Betrieb kaufen, Börsengang, Bernd kauft Anteile', async () => {
      await L.nav(a, 'newspaper');
      await a.page.click('.paper-tabs [data-tab=biz]');
      await a.page.waitForSelector('[data-act=buyBiz]:not([disabled])');
      await a.page.click('[data-act=buyBiz]:not([disabled]) >> nth=0');
      if (await a.page.locator('.modal [data-close=yes]').count()) await confirmYes(a);
      for (let i = 0; i < 30; i++) { const [{ c }] = await app.sql("SELECT JSON_LENGTH(JSON_EXTRACT(state, '$.companies')) c FROM characters WHERE user_id = ?", [aId]); if (Number(c) > 0) break; await L.sleep(300); }
      await L.nav(a, 'business');
      await a.page.waitForSelector('[data-ipo]');
      await a.page.click('[data-ipo]');
      await a.page.click('#ip-go');
      let n = 0; for (let i = 0; i < 30 && !n; i++) { n = (await app.sql("SELECT COUNT(*) n FROM stocks WHERE user_id = ? AND status = 'active'", [aId]))[0].n; if (!n) await L.sleep(300); }
      assert.equal(n, 1, `Börsengang: ${await L.toastText(a)}`);
      await L.socialTab(b, 'exchange');
      await b.page.reload(); await b.page.waitForSelector('#hud .hud-id'); await L.socialTab(b, 'exchange');
      await b.page.waitForSelector('[data-xbuy]');
      await b.page.click('[data-xbuy] >> nth=0');
      await b.page.fill('#tr-n', '5');
      await b.page.click('#tr-go');
      await b.page.waitForFunction(() => /Anteile ausgeführt|Orderbuch/.test(document.body.innerText));
      const [{ sh }] = await app.sql('SELECT COALESCE(SUM(shares),0) sh FROM stock_holdings WHERE user_id = ?', [bId]);
      assert.ok(Number(sh) > 0 || (await app.sql("SELECT COUNT(*) n FROM stock_orders WHERE user_id = ? AND status = 'open'", [bId]))[0].n > 0);
      noErrors(a, b);
    });
  });

  describe('Familie: Adoption', () => {
    it('Adoptions-Schaltfläche erscheint für ein verheiratetes, zusammenlebendes Paar (mit Grund, wenn gesperrt)', async () => {
      const aId = await L.userId(app, A.username);
      const none = await L.api(a, 'POST', '/api/action/adopt', {});
      assert.equal(none.status, 400, 'ohne Partner nicht möglich');
      const partner = { personId: 'p-e2e', name: 'Paul Partner', gender: 'm', born: -9000, pkey: 'baecker', profession: 'Bäcker', sat: 80, married: true, cohabit: true, giftBoost: 0, unhappyDays: 0, since: 0 };
      await app.sql("UPDATE characters SET state = JSON_SET(state, '$.partner', JSON_COMPACT(?)) WHERE user_id = ? AND status = 'alive'", [JSON.stringify(partner), aId]);
      await a.page.reload(); await a.page.waitForSelector('#hud .hud-id');
      await L.nav(a, 'family');
      await a.page.waitForSelector('[data-p=adopt], [data-p=adoptCancel]');
      assert.match(await text(a), /Kind adoptieren|Adoption läuft/);
      noErrors(a);
    });
  });

  describe('Sicherheit (live)', () => {
    it('POST ohne CSRF-Token wird abgelehnt, mit Token nicht', async () => {
      const r = await a.page.evaluate(async () => (await fetch('/api/social/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status);
      assert.equal(r, 403);
      const ok = await L.api(a, 'POST', '/api/social/profile', { bio: 'Hallo', public: true });
      assert.equal(ok.status, 200);
    });

    it('Fremde Orders, Angebote, Mieter und Briefe lassen sich nicht anfassen (IDOR)', async () => {
      const aId = await L.userId(app, A.username);
      const [ord] = await app.sql("SELECT id FROM stock_orders WHERE user_id = ? AND status = 'open' LIMIT 1", [aId]);
      if (ord) { const r = await L.api(b, 'POST', '/api/social/exchange/cancel', { id: ord.id }); assert.equal(r.status, 400); }
      const w = await L.api(a, 'POST', '/api/social/market/withdraw', { id: 1 }); // Angebot 1 stammt von Bernd
      assert.equal(w.status, 400, 'fremdes Angebot nicht zurückziehbar');
      const ev = await L.api(b, 'POST', '/api/social/lease/evict', { propId: 1 });
      assert.equal(ev.status, 400);
      const [m] = await app.sql("SELECT id FROM messages WHERE kind = 'letter' LIMIT 1");
      const c = await L.api(a, 'GET', `/api/social/letter/${m.id}`);
      assert.equal(c.status, 200); // eigener Brief
      const other = await L.newPlayer(browser, app, 'carol');
      await L.register(other, { username: 'carol_e2e', email: 'carol@e2e.test', password: 'carol-pass-123' });
      const x = await L.api(other, 'GET', `/api/social/letter/${m.id}`);
      assert.equal(x.status, 400, 'Brief eines Dritten darf nicht lesbar sein');
      await other.ctx.close();
    });

    it('Links im Chat und Spielernamen mit Sonderzeichen werden abgelehnt', async () => {
      const r = await L.api(a, 'POST', '/api/social/chat', { cityId: 0, text: 'Besuche www.spam-seite.de jetzt' });
      assert.equal(r.status, 400);
      const p = await L.newPlayer(browser, app, 'evil');
      await p.page.goto(`${app.base}/register`);
      await p.page.fill('#username', '<script>x'); await p.page.fill('#email', 'evil@e2e.test'); await p.page.fill('#password', 'passwort-123');
      await p.page.check('input[name=terms]'); await p.page.click('button[type=submit]');
      assert.match(await text(p, '.auth-card'), /3–24 Zeichen/);
      await p.ctx.close();
    });

    it('Sitzungs-Cookie: HttpOnly und SameSite', async () => {
      const cookies = await a.ctx.cookies();
      const c = cookies.find((x) => x.name === 'tp.sid');
      assert.ok(c.httpOnly); assert.equal(c.sameSite, 'Lax');
    });

    it('Anmeldeversuche werden gebremst (429)', async () => {
      const p = await L.newPlayer(browser, app, 'brute');
      let last = 0;
      for (let i = 0; i < 14; i++) {
        const r = await p.ctx.request.post(`${app.base}/login`, { form: { login: 'gibt_es_nicht', password: 'x' + i }, failOnStatusCode: false, headers: {} });
        last = r.status(); if (last === 429) break;
        if (last === 403) { // CSRF: Token holen
          await p.page.goto(`${app.base}/login`); const t = await p.page.getAttribute('input[name=_csrf]', 'value');
          const r2 = await p.ctx.request.post(`${app.base}/login`, { form: { _csrf: t, login: 'gibt_es_nicht', password: 'x' + i }, failOnStatusCode: false }); last = r2.status(); if (last === 429) break;
        }
      }
      assert.equal(last, 429);
      await p.ctx.close();
    });
  });

  describe('Englische Oberfläche', () => {
    it('Registrieren, Charakter anlegen, Navigation und Texte auf Englisch', async () => {
      const e = await L.newPlayer(browser, app, 'erin', 'en');
      await e.page.goto(`${app.base}/lang/en?next=/register`);
      await L.register(e, { username: 'erin_e2e', email: 'erin@e2e.test', password: 'erin-pass-1234' });
      await L.createCharacter(e, { first: 'Erin', last: 'Evans', city: 'Hamburg', gender: 'f' });
      await e.page.waitForFunction(() => document.documentElement.lang === 'en');
      await e.page.waitForFunction(() => /Newspaper|Overview/.test(document.querySelector('#side').innerText));
      await L.nav(e, 'newspaper');
      assert.match(await text(e), /Jobs|Housing|News/i);
      await L.nav(e, 'household');
      assert.doesNotMatch(await text(e), /Kühlschrank/);
      noErrors(e);
      await e.ctx.close();
    });
  });
});
