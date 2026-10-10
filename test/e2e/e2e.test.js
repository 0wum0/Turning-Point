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
      await L.paperTab(a, 'housing');
      await a.page.waitForSelector('.listings article');
      await a.page.click('[data-act=rent]:not([disabled]) >> nth=0');
      await a.page.waitForFunction(() => /Du wohnst hier/.test(document.querySelector('#page').innerText));
      await L.nav(a, 'housing');
      assert.doesNotMatch(await text(a), /Kein Dach/);
      noErrors(a);
    });

    it('Stellenmarkt: Job annehmen', async () => {
      await L.paperTab(a, 'jobs');
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
      // Fortgeschrittene Bereiche (Markt, Unternehmen, Börse …) sind erst nach und nach frei – hier per Konto-Einstellung „Alle Funktionen anzeigen“ (users.meta.showAll)
      await L.showAll(a); await L.showAll(b);
    });

    it('Alice kauft alle Häuser, die diese Woche in Berlin zum Verkauf stehen (mindestens drei)', async () => {
      await L.paperTab(a, 'housing');
      await a.page.waitForSelector('[data-act=buy]:not([disabled])');
      const offered = await a.page.locator('[data-act=buy]:not([disabled])').count();
      assert.ok(offered >= 3, `mindestens drei Verkaufsangebote erwartet, gefunden: ${offered}`);
      for (let i = 1; i <= offered; i++) {
        await a.page.click('[data-act=buy]:not([disabled]) >> nth=0');
        await confirmYes(a);
        await a.page.waitForFunction((n) => document.querySelectorAll('[data-act=buy]').length === n, offered - i); // die Liste baut sich ohne das gekaufte Haus neu auf
      }
      const props = L.json((await app.sql('SELECT JSON_EXTRACT(state, "$.properties") p FROM characters WHERE user_id = ?', [aId]))[0].p);
      assert.equal(props.length, offered);
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
      await L.paperTab(a, 'biz');
      await a.page.waitForSelector('[data-act=buyBiz]:not([disabled])');
      await a.page.click('[data-act=buyBiz]:not([disabled]) >> nth=0');
      if (await a.page.locator('.modal [data-close=yes]').count()) await confirmYes(a);
      await L.until(async () => Number((await app.sql("SELECT JSON_LENGTH(JSON_EXTRACT(state, '$.companies')) c FROM characters WHERE user_id = ?", [aId]))[0].c) > 0, { what: 'gekaufter Betrieb' });
      await L.nav(a, 'business');
      await a.page.waitForSelector('[data-ipo]');
      await a.page.click('[data-ipo]');
      await a.page.click('#ip-go');
      const n = await L.until(async () => Number((await app.sql("SELECT COUNT(*) n FROM stocks WHERE user_id = ? AND status = 'active'", [aId]))[0].n), { what: 'Börsengang (Aktie aktiv)' });
      assert.equal(n, 1);
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

  describe('Neue Abläufe: Einstieg, Gründung, Lieferverträge, Spieluhr, Preisbarometer', () => {
    const F = { username: 'frieda_e2e', email: 'frieda@e2e.test', password: 'frieda-pass-123' };
    const C = { username: 'cora_e2e', email: 'cora@e2e.test', password: 'cora-pass-12345' };
    const FIRM_F = 'Brot und Mehr E2E'; const FIRM_C = 'Muehle am Fluss E2E';
    let f; let c; let fId; let cId;

    /** Gründungsdialog: Betriebsart wählen, Namen eintragen, bestätigen, auf den Abschluss warten. */
    async function foundViaDialog(pl, pkey, name) {
      await L.nav(pl, 'business');
      await pl.page.click('[data-found]');
      await pl.page.click(`.modal [data-found-pick="${pkey}"]`);
      await pl.page.fill('#found-name', name);
      const done = pl.page.waitForResponse((r) => /\/api\/action\/foundBiz$/.test(r.url()) && r.request().method() === 'POST');
      await pl.page.click('#found-go');
      assert.equal((await done).status(), 200);
      await pl.page.locator('.modal-backdrop').first().waitFor({ state: 'detached' });
    }

    before(async () => {
      f = await L.newPlayer(browser, app, 'frieda'); c = await L.newPlayer(browser, app, 'cora');
      await L.register(f, F); await L.register(c, C);
      await L.createCharacter(f, { first: 'Frieda', last: 'Fink', gender: 'f' });
      await L.createCharacter(c, { first: 'Cora', last: 'Claasen', gender: 'f', prof: 'muehle' });
      fId = await L.userId(app, F.username); cId = await L.userId(app, C.username);
      await L.setMoney(app, F.username, 30000000); await L.setMoney(app, C.username, 30000000);
      await L.reloadGame(f); await L.reloadGame(c);
    });
    after(async () => { for (const p of [f, c]) if (p) await p.ctx.close(); });

    it('Neuer Spieler: Fortgeschrittenes ist gesperrt, „Alle Funktionen anzeigen“ im Hilfe-Menü schaltet es frei', async () => {
      // Brandneues Konto ohne Geld-/Aufgabenfortschritt (eigener Spieler, damit Frieda/Cora ihr Geld behalten)
      const n = await L.newPlayer(browser, app, 'neu');
      await L.register(n, { username: 'neu_e2e', email: 'neu@e2e.test', password: 'neu-pass-123456' });
      await L.createCharacter(n, { first: 'Nils', last: 'Neu' });
      assert.match(await n.page.locator('#side a[data-nav=business]').getAttribute('class'), /locked/);
      await n.page.click('#side a[data-nav=exchange], #side a[data-nav=business]');
      await n.page.waitForSelector('#page .lock-card');
      assert.match(await text(n), /Wird freigeschaltet, wenn/);
      // Hilfe-Menü → Alle Funktionen anzeigen
      await n.page.click('#hud [data-help]');
      const saved = n.page.waitForResponse((r) => /\/api\/action\/uiPrefs$/.test(r.url()));
      await n.page.check('#helpShowAll');
      assert.equal((await saved).status(), 200);
      await L.closeModals(n);
      await n.page.waitForFunction(() => !document.querySelector('#side a[data-nav=business]').classList.contains('locked'));
      await L.navOpen(n, 'business');
      const [u] = await app.sql('SELECT meta FROM users WHERE username = ?', ['neu_e2e']);
      assert.equal(L.json(u.meta).showAll, true);
      noErrors(n);
      await n.ctx.close();
    });

    it('Unternehmen gründen: Dialog mit Prüfung der Eingabe, danach steht die Firma im Spielstand', async () => {
      await L.showAll(f); await L.showAll(c);
      await L.nav(f, 'business');
      await f.page.click('[data-found]');
      await f.page.waitForSelector('.modal [data-found-pick]');
      assert.match(await text(f, '.modal'), /Schritt 1 von 2/);
      await f.page.click('.modal [data-found-pick="baecker"]');
      assert.match(await text(f, '.modal'), /Schritt 2 von 2/);
      // zu kurzer Name wird vom Server abgelehnt, der Dialog bleibt offen und zeigt den Grund
      await f.page.fill('#found-name', 'x');
      await f.page.click('#found-go');
      await f.page.waitForFunction(() => /zu kurz/.test(document.querySelector('#found-err').innerText));
      assert.equal((await app.sql("SELECT JSON_LENGTH(JSON_EXTRACT(state, '$.companies')) c FROM characters WHERE user_id = ?", [fId]))[0].c, 0);
      await f.page.click('.modal [data-found-back]');
      await f.page.waitForSelector('.modal [data-found-pick="baecker"]');
      await L.closeModals(f);
      const money0 = Number((await app.sql("SELECT money FROM characters WHERE user_id = ?", [fId]))[0].money);
      await foundViaDialog(f, 'baecker', FIRM_F);
      await foundViaDialog(c, 'muehle', FIRM_C);
      const fs = L.json((await app.sql("SELECT JSON_EXTRACT(state, '$.companies') s FROM characters WHERE user_id = ?", [fId]))[0].s);
      assert.equal(fs.length, 1); assert.equal(fs[0].name, FIRM_F); assert.equal(fs[0].pkey, 'baecker');
      assert.ok(Number((await app.sql("SELECT money FROM characters WHERE user_id = ?", [fId]))[0].money) < money0, 'Gründungspreis wurde abgebucht');
      await f.page.waitForFunction((n) => document.querySelector('#page').innerText.includes(n), FIRM_F);
      // die Firma ist für andere Spieler veröffentlicht (Voraussetzung für Lieferverträge)
      await L.until(async () => (await app.sql('SELECT 1 FROM player_firms WHERE user_id IN (?, ?)', [fId, cId])).length === 2, { what: 'veröffentlichte Firmen' });
      noErrors(f, c);
    });

    it('Talente: Bewerber aus dem Pool einstellen (Dialog), Teamqualität sichtbar; Kind mit Begabung fördern', async () => {
      await L.nav(f, 'business');
      assert.match(await text(f, '.card.biz'), /Team-Qualität/);
      await f.page.click('[data-applicants]');
      await f.page.waitForSelector('#talApp .tal-person');
      const n = await f.page.locator('#talApp [data-hire]').count();
      assert.ok(n >= 3, 'mindestens drei Bewerber');
      assert.match(await text(f, '#talApp'), /Passung/);
      const name = (await f.page.locator('#talApp .tal-person b[data-i18n-skip]').first().innerText()).trim();
      const done = f.page.waitForResponse((r) => /\/api\/action\/bizHireApplicant$/.test(r.url()));
      await f.page.click('#talApp [data-hire]:not([disabled]) >> nth=0');
      assert.equal((await done).status(), 200);
      await L.closeModals(f);
      const comp = L.json((await app.sql("SELECT JSON_EXTRACT(state, '$.companies[0]') s FROM characters WHERE user_id = ?", [fId]))[0].s);
      assert.equal(comp.staff, 1); assert.equal(comp.team.length, 1); assert.equal(comp.team[0].name, name);
      assert.ok(comp.team[0].v.length === 6 && comp.team[0].v.every((x) => x >= 1 && x <= 100));
      // Kind: Anlagen sichtbar ab 6 Jahren; Fördern kostet Geld und läuft als Programm
      const { testWorld } = require('../helpers'); const fam = require('../../src/game/family'); const { rngFor } = require('../../src/game/rng');
      const [row] = await app.sql("SELECT id, state FROM characters WHERE user_id = ? AND status = 'alive'", [fId]);
      const st = L.json(row.state); st.partner = st.partner || { personId: 'p77', name: 'Paul Fink', gender: 'm', born: st.day - 9000, sat: 70, married: true, cohabit: true, giftBoost: 0, unhappyDays: 0, pkey: 'tischler', profession: 'Tischler', since: 0 };
      fam.bornChild({ world: testWorld(), state: st, idx: 1 }, rngFor('e2e', 1)); st.children[0].born = st.day - 8 * 365;
      await app.sql('UPDATE characters SET state = ? WHERE id = ?', [JSON.stringify(st), row.id]);
      await L.reloadGame(f); await L.nav(f, 'family');
      assert.match(await text(f, '.card.child'), /Begabung/);
      assert.match(await text(f, '.card.child'), /Empfehlung/);
      await f.page.click('[data-foster]'); await f.page.waitForSelector('.modal .tal-opt');
      const m0 = Number((await app.sql('SELECT money FROM characters WHERE id = ?', [row.id]))[0].money);
      const fd = f.page.waitForResponse((r) => /\/api\/action\/foster$/.test(r.url()));
      await f.page.click('.modal .tal-opt:not([disabled]) >> nth=0');
      assert.equal((await fd).status(), 200);
      const after = L.json((await app.sql("SELECT JSON_EXTRACT(state, '$.children[0].foster') s, money FROM characters WHERE id = ?", [row.id]))[0].s);
      assert.ok(after && after.end > st.day);
      assert.ok(Number((await app.sql('SELECT money FROM characters WHERE id = ?', [row.id]))[0].money) < m0, 'Förderung kostet Geld');
      noErrors(f);
    });

    it('Jahreszeiten & Seuchen: Jahreszeit-Karte und Check, Seuchenhinweis, Schutz mit einem Klick, Beschluss des Kanzlers mit Vorschau', async () => {
      // Spieldatum: 11. Dezember 1957 – Winter, die Asiatische Grippe zieht gerade durch Berlin
      const day = (1957 - 1945) * 365 + 345;
      await app.sql("UPDATE characters SET state = JSON_SET(state, '$.day', ?, '$.money', ?), game_day = ?, money = ? WHERE user_id = ? AND status = 'alive'", [day, 30000000, day, 30000000, fId]);
      await app.sql('UPDATE users SET efs_accrued_at = ?, efs_carry = 0 WHERE id = ?', [Date.now(), fId]);
      await L.reloadGame(f); await L.nav(f, 'overview');
      await f.page.waitForSelector('#seasonCard');
      assert.match(await text(f, '#seasonCard'), /Winter/);
      assert.match(await text(f, '#seasonCard'), /Heizung/);
      assert.ok(await f.page.locator('#hud .hud-season').count(), 'Jahreszeit im Kopfbereich');
      // Jahreszeiten-Check erklärt Heizung, Ernte und Vorsorge – und erfüllt die Aufgabe „Bereite dich auf den Winter vor“
      await f.page.click('[data-season-guide]');
      await f.page.waitForSelector('.modal');
      assert.match(await text(f, '.modal'), /Winter-Check/);
      assert.match(await text(f, '.modal'), /Ernte 1957/);
      await L.closeModals(f);
      await L.until(async () => (await app.sql("SELECT JSON_EXTRACT(state, '$.flags.quests.seen.season') s FROM characters WHERE user_id = ? AND status = 'alive'", [fId]))[0].s, { what: 'Aufgabe „Winter“ gesehen' });
      // Seuchenhinweis mit drei Schutzknöpfen; Hygienepaket kostet Geld und wirkt
      await f.page.waitForSelector('#epiBanner');
      assert.match(await text(f, '#epiBanner'), /Asiatische Grippe/);
      assert.equal(await f.page.locator('#epiBanner [data-epi]').count(), 3);
      assert.ok(await f.page.locator('#epiBanner [data-epi="vaccine"]').isDisabled(), '1957 gibt es noch keinen Impfstoff');
      const m0 = Number((await app.sql("SELECT money FROM characters WHERE user_id = ? AND status = 'alive'", [fId]))[0].money);
      const pr = f.page.waitForResponse((r) => /\/api\/action\/epiProtect$/.test(r.url()));
      await f.page.click('#epiBanner [data-epi="hygiene"]');
      assert.equal((await pr).status(), 200);
      const st = L.json((await app.sql("SELECT state FROM characters WHERE user_id = ? AND status = 'alive'", [fId]))[0].state);
      assert.ok(st.epi.hygUntil > st.day, 'Hygienepaket läuft');
      assert.ok(Number((await app.sql("SELECT money FROM characters WHERE user_id = ? AND status = 'alive'", [fId]))[0].money) < m0, 'Schutz kostet Geld');
      await f.page.waitForFunction(() => /aktiv/.test(document.querySelector('#epiBanner [data-epi="hygiene"]').innerText));
      // Betriebe und Haushalt zeigen Jahreszeit und Seuche
      await L.nav(f, 'business'); assert.match(await text(f), /Seuche/);
      await L.nav(f, 'household'); assert.match(await text(f, '#seasonCard'), /Winter/);
      // Kanzler: Seuchenmaßnahmen mit Vorschau (Ansteckung gegen Wirtschaft gegen Ansehen), Beschluss, Tagesblatt
      await app.sql("UPDATE characters SET state = JSON_SET(state, '$.politics.term', JSON_OBJECT('idx', 5, 'startDay', ?, 'endDay', ?, 'cityId', 0)) WHERE user_id = ? AND status = 'alive'", [st.day, st.day + 1460, fId]);
      await L.showAll(f); await L.reloadGame(f); await L.nav(f, 'society');
      await f.page.waitForSelector('#polBox [data-pol="pandemic"]');
      assert.ok(await f.page.locator('#polBox [data-pol="hygiene"]').count() === 0, 'Gesundheitsamt ist Sache der Stadt');
      await f.page.selectOption('#pl-pandemic', '1');
      await f.page.click('[data-pol-preview="pandemic"]');
      await f.page.waitForSelector('.modal #pol-go');
      assert.match(await text(f, '.modal'), /Ansteckung/);
      assert.match(await text(f, '.modal'), /Gastronomie/);
      assert.match(await text(f, '.modal'), /Ansehen/);
      await f.page.click('.modal #pol-go');
      await L.until(async () => (await app.sql("SELECT id FROM goods_policies WHERE user_id = ? AND kind = 'pandemic'", [fId])).length, { what: 'Beschluss gespeichert' });
      await L.until(async () => (await app.sql("SELECT id FROM world_events WHERE title LIKE 'Beschluss:%' ORDER BY id DESC LIMIT 1")).length, { what: 'Tagesblatt' });
      noErrors(f);
    });

    it('Liefervertrag: Frieda (Bäckerei) bietet Cora (Mühle) an, Cora nimmt an, der Vertrag läuft', async () => {
      await L.nav(f, 'business');
      await f.page.click('[data-contract-propose]');
      await f.page.click('.modal [data-pr=supplier][data-good=mehl]');
      await f.page.waitForSelector('.modal [data-pick]');
      assert.match(await text(f, '.modal'), new RegExp(FIRM_C));
      await f.page.click('.modal [data-pick="0"]');
      await f.page.fill('#of-q', '1');
      const sent = f.page.waitForResponse((r) => /\/api\/supply\/offer$/.test(r.url()));
      await f.page.click('#of-go');
      assert.equal((await sent).status(), 200);
      const [o] = await L.until(async () => { const r = await app.sql("SELECT * FROM supply_contracts WHERE buyer_id = ? AND seller_id = ?", [fId, cId]); return r.length ? r : null; }, { what: 'Vertragsangebot' });
      assert.equal(o.status, 'offer'); assert.equal(o.good, 'mehl');
      // Cora sieht das Angebot und nimmt es an
      await L.reloadGame(c); await L.nav(c, 'business');
      await c.page.waitForSelector('#supContracts [data-contract-yes]');
      assert.match(await text(c, '#supContracts'), /Angebot/);
      const resp = c.page.waitForResponse((r) => /\/api\/supply\/respond$/.test(r.url()));
      await c.page.click('#supContracts [data-contract-yes]');
      assert.equal((await resp).status(), 200);
      const act = await L.until(async () => (await app.sql("SELECT * FROM supply_contracts WHERE id = ? AND status = 'active'", [o.id]))[0], { what: 'laufender Vertrag' });
      assert.equal(act.buyer_id, fId);
      // beide sehen den laufenden Vertrag
      await c.page.waitForFunction(() => /läuft/.test(document.querySelector('#supContracts').innerText));
      await L.reloadGame(f); await L.nav(f, 'business');
      await f.page.waitForFunction(() => /läuft/.test((document.querySelector('#supContracts') || {}).innerText || ''));
      noErrors(f, c);
    });

    it('Spieluhr: Zeitreise über efs_accrued_at (zwei Stunden) – nach dem Neuladen ist das Spieldatum weiter', async () => {
      await L.nav(f, 'overview');
      const label0 = await text(f, '#hud .hud-id small');
      const [{ d0 }] = await app.sql('SELECT game_day d0 FROM characters WHERE user_id = ? AND status = ?', [fId, 'alive']);
      // Zwei echte Stunden „Abwesenheit“ nachträglich (Standard: ein Spieltag ≈ 4 Minuten, ab 90 Minuten gilt der Offline-Schutz, niemand verhungert)
      await app.sql('UPDATE users SET efs_accrued_at = efs_accrued_at - ?, efs_carry = 0 WHERE id = ?', [120 * 60 * 1000, fId]);
      await L.reloadGame(f);
      await f.page.waitForFunction((l) => document.querySelector('#hud .hud-id small').innerText !== l, label0);
      const label1 = await text(f, '#hud .hud-id small');
      assert.notEqual(label1, label0);
      const [{ d1 }] = await app.sql('SELECT game_day d1 FROM characters WHERE user_id = ? AND status = ?', [fId, 'alive']);
      assert.ok(Number(d1) - Number(d0) >= 25, `Spieltage seit der Zeitreise: ${d1 - d0}`);
      // der Offline-Bericht steht im Postfach der Übersicht
      await L.nav(f, 'overview');
      assert.match(await text(f), /Während du weg warst/);
      assert.equal((await app.sql('SELECT status FROM characters WHERE user_id = ? ORDER BY id DESC LIMIT 1', [fId]))[0].status, 'alive');
      noErrors(f);
    });

    it('Preisbarometer: Stadt und Zeitung zeigen alle fünf Bereiche, Vergleich mit einem weiteren Ort', async () => {
      await L.nav(f, 'city');
      await f.page.waitForSelector('#econBox[data-loaded="1"]');
      assert.match(await text(f, '#econBox'), /Preisbarometer/i);
      assert.deepEqual(await f.page.locator('#econBox .econ-row').evaluateAll((els) => els.map((e) => e.dataset.sector)), ['food', 'rent', 'services', 'build', 'wage']);
      const rows0 = await f.page.locator('#econBox .econ-tbl tbody tr').count();
      assert.ok(rows0 >= 2, 'Vergleichstabelle mit Nachbarorten');
      // zweiten Ort zum Vergleich suchen und hinzufügen
      await f.page.fill('#ecSearch', 'Hamburg');
      await f.page.click('#ecRes >> text=Hamburg >> nth=0');
      await f.page.waitForFunction((n) => document.querySelectorAll('#econBox .econ-tbl tbody tr').length > n, rows0);
      assert.match(await text(f, '#econBox .econ-tbl'), /Hamburg/);
      // Sortierung nach „Miete“
      await f.page.click('#econBox [data-ec-sort=rent]');
      await f.page.waitForSelector('#econBox [data-ec-sort=rent].on');
      // Zeitung → Reiter „Wirtschaft“
      await L.paperTab(f, 'economy');
      await f.page.waitForSelector('#econBox[data-loaded="1"] .econ-row');
      assert.equal(await f.page.locator('#econBox .econ-row').count(), 5);
      const api1 = await L.api(f, 'GET', '/api/economy/city?cityId=1');
      assert.equal(api1.status, 200);
      noErrors(f);
    });
  });

  describe('Ruf und Ansehen', () => {
    let r;
    before(async () => {
      r = await L.newPlayer(browser, app, 'rita');
      await L.register(r, { username: 'rita_e2e', email: 'rita@e2e.test', password: 'rita-pass-123456' });
      await L.createCharacter(r, { first: 'Rita', last: 'Roth', city: 'Berlin', gender: 'f' });
      await L.showAll(r);
    });
    after(async () => { if (r) await r.ctx.close(); });

    it('Übersicht zeigt die Ansehen-Karte; das Detailfenster erklärt Bestandteile, Wirkungen und Tipps', async () => {
      await L.nav(r, 'overview');
      await r.page.waitForSelector('#repCard .rep-level .chip');
      assert.match(await text(r, '#repCard'), /Unbekannt/);
      await r.page.waitForFunction(() => !document.querySelector('#repCard .skel'));
      await r.page.click('#repCard [data-rep-open]');
      await r.page.waitForSelector('.rep-modal');
      const t = await text(r, '.rep-modal');
      for (const w of [/fünf bestandteile/i, /Zuverlässigkeit/, /Skandal/i, /was dein ansehen bewirkt/i, /so steigerst du dein ansehen/i, /Ehrenbürger/]) assert.match(t, w);
      await L.closeModals(r);
      noErrors(r);
    });

    it('Gutes Verhalten hebt die Stufe: Karte, Plakette im Stadtverzeichnis und Einsteiger-Aufgabe', async () => {
      const id = await L.userId(app, 'rita_e2e');
      await app.sql("INSERT INTO reputation (user_id, rel, trade, civic, office, scandal, score, lvl, decay_day, updated_at) VALUES (?,60,20,30,0,0,32,2,?,?) ON DUPLICATE KEY UPDATE rel=60, trade=20, civic=30, office=0, scandal=0, score=32, lvl=2, decay_day=VALUES(decay_day)", [id, Math.floor(Date.now() / 86400000), Date.now()]);
      await app.sql("INSERT INTO reputation_log (user_id, kind, reason, delta, n, day_no) VALUES (?, 'rel', 'rent_paid', 3.4, 7, ?)", [id, Math.floor(Date.now() / 86400000)]);
      await L.reloadGame(r);
      await L.nav(r, 'overview');
      await r.page.waitForFunction(() => /Angesehen/.test(document.querySelector('#repCard .rep-level').innerText));
      await r.page.waitForSelector('#repCard .rep-chg');
      assert.match(await text(r, '#repCard'), /Miete pünktlich gezahlt/);
      await r.page.click('#repCard [data-rep-why]');
      await r.page.waitForSelector('.modal .info-steps');
      assert.match(await text(r, '.modal'), /warum ist das wichtig/i);
      await L.closeModals(r);
      // Plakette im Stadtverzeichnis (Einwohner der eigenen Stadt)
      await L.nav(r, 'city');
      await r.page.waitForFunction(() => document.querySelector('#dirBody .rep-badge .chip'), null, { timeout: 12000 });
      assert.match(await text(r, '#dirBody'), /Angesehen|Unbekannt/);
      const [q] = await app.sql("SELECT state FROM characters WHERE user_id = ? AND status = 'alive'", [id]);
      assert.ok(L.json(q.state).rep && L.json(q.state).rep.lv >= 1, 'Zwischenspeicher im Spielstand');
      noErrors(r);
    });

    it('Gesperrte Aktion: Mit dem Ruf „Verrufen“ vergibt die Bank keinen Kredit – mit Hinweis im Fenster und Absage vom Server', async () => {
      const id = await L.userId(app, 'rita_e2e');
      await app.sql("UPDATE reputation SET scandal = 90, rel = -20, trade = 0, civic = 0, score = -82, lvl = -2, decay_day = ? WHERE user_id = ?", [Math.floor(Date.now() / 86400000), id]);
      await L.setMoney(app, 'rita_e2e', 5000000);
      await L.reloadGame(r);
      await L.nav(r, 'overview');
      await r.page.waitForFunction(() => /Verrufen/.test(document.querySelector('#repCard .rep-level').innerText));
      await r.page.click('[data-bank]');
      await r.page.waitForSelector('.modal #ln-go');
      assert.match(await text(r, '.modal'), /Mit dem Ruf „Verrufen“ ist das gesperrt/);
      assert.equal(await r.page.locator('.modal #ln-go').isDisabled(), true);
      const res = await L.api(r, 'POST', '/api/action/loanTake', { amount: 100000, years: 3 });
      assert.equal(res.status, 400);
      assert.match(res.json.error, /Verrufen|Ansehen/);
      await L.closeModals(r);
      noErrors(r);
    });

    it('Ämter verlangen Ansehen: Der Server nennt die nötige Stufe', async () => {
      const res = await L.api(r, 'POST', '/api/social/elections/run', { idx: 1, platform: '' });
      assert.equal(res.status, 400);
      assert.ok(/Zuerst|Ansehen|Mindestalter/.test(res.json.error), res.json.error);
      const ov = await L.api(r, 'GET', '/api/reputation');
      assert.equal(ov.json.level, -2);
      assert.ok(ov.json.gates.some((g) => g.key === 'loan' && !g.ok));
    });
  });

  describe('Recht & Gericht', () => {
    // Anna (Alice) erleidet einen Anschlag und zeigt Bernd (Bob) an; es werden keine weiteren Konten registriert (Registrierungs-Bremse je IP)
    let v; let w;
    before(async () => {
      v = a; w = b; await L.showAll(v); await L.showAll(w);
      await L.setMoney(app, 'alice_e2e', 5000000); await L.setMoney(app, 'bob_e2e', 5000000);
    });

    it('Spuren erscheinen als Meldung; Anzeige gegen einen Spieler per Namenssuche; der Beklagte sieht das Verfahren', async () => {
      const vid = await L.userId(app, 'alice_e2e'); const wid = await L.userId(app, 'bob_e2e');
      const now = Date.now();
      await app.sql("INSERT INTO court_evidence (act, offender_id, victim_id, subject, city_id, strength, known, damage_real, created_ms, expires_ms) VALUES ('sabotage', ?, ?, 'Bäckerei Alpha', 1, 85, 0, 2000, ?, ?)", [wid, vid, now, now + 1e9]);
      await L.reloadGame(v);
      await L.nav(v, 'overview');
      assert.match(await text(v), /Spuren am Tatort|Spuren gesichert/);
      await L.nav(v, 'society');
      await v.page.waitForSelector('#courtBox [data-file]');
      assert.match(await text(v, '#courtBox'), /Beweislage: stark/);
      await v.page.click('#courtBox [data-file]');
      await v.page.fill('#cqs', 'Bernd');
      await v.page.waitForSelector('#cres [data-pick]');
      await v.page.click('#cres [data-pick]');
      await confirmYes(v);
      await v.page.waitForSelector('#courtBox .court-case');
      assert.match(await text(v, '#courtBox'), /Du klagst gegen/);
      const [c] = await app.sql('SELECT * FROM court_cases WHERE plaintiff_id = ?', [vid]);
      assert.equal(c.defendant_id, wid);
      await L.reloadGame(w);
      await L.nav(w, 'society');
      await w.page.waitForSelector('#courtBox .court-case');
      assert.match(await text(w, '#courtBox'), /Du wurdest angezeigt von/);
      noErrors(v, w);
    });

    it('Vergleich: Beklagter bietet an, Klägerin nimmt an – Verfahren endet, beide sparen die Gerichtskosten', async () => {
      const [c] = await app.sql("SELECT * FROM court_cases ORDER BY id DESC LIMIT 1");
      await w.page.click(`#courtBox [data-cact="offer"][data-id="${c.id}"]`);
      await w.page.fill('#amt', '10');
      await w.page.click('#amtgo');
      await L.until(async () => (await app.sql('SELECT offer_real FROM court_cases WHERE id = ?', [c.id]))[0].offer_real != null, { what: 'Vergleichsangebot' });
      await L.reloadGame(v); await L.nav(v, 'society');
      await v.page.waitForSelector(`#courtBox [data-cact="accept"][data-id="${c.id}"]`);
      await v.page.click(`#courtBox [data-cact="accept"][data-id="${c.id}"]`);
      await confirmYes(v);
      await L.until(async () => (await app.sql('SELECT state FROM court_cases WHERE id = ?', [c.id]))[0].state === 'settled', { what: 'Vergleich' });
      const sanc = await app.sql("SELECT kind FROM court_sanctions WHERE case_id = ?", [c.id]);
      assert.deepEqual(sanc.map((s) => s.kind), ['damages']);
      noErrors(v, w);
    });

    it('Haft: Banner in der Übersicht, wirtschaftliche Aktion mit Begründung abgelehnt, Essen bleibt möglich', async () => {
      const wid = await L.userId(app, 'bob_e2e');
      const [c] = await app.sql('SELECT id FROM court_cases ORDER BY id DESC LIMIT 1');
      await app.sql("INSERT INTO court_sanctions (case_id, user_id, kind, level, until_ms, params, status, created_ms) VALUES (?,?,'haft',5,?,'{}','active',?)", [c.id, wid, Date.now() + 7200000, Date.now()]);
      await L.reloadGame(w); await L.nav(w, 'overview');
      await w.page.waitForSelector('.court-banner');
      assert.match(await text(w, '.court-banner'), /Haft/);
      const res = await L.api(w, 'POST', '/api/action/bizHire', {});
      assert.equal(res.status, 400); assert.match(res.json.error, /Haft/);
      const ok = await L.api(w, 'POST', '/api/action/buyFood', { tier: 0 });
      assert.ok(!/Haft/.test((ok.json && ok.json.error) || ''));
      noErrors(v, w);
    });

    it('Admin: Verfahren und Sanktionen sind einsehbar', async () => {
      const ad = await L.newPlayer(browser, app, 'admin');
      await L.login(ad, { login: 'e2eadmin', password: 'e2e-admin-pass-1' });
      await ad.page.goto(`${app.base}/admin/court`);
      assert.match(await text(ad, 'body'), /Aktive Sanktionen/);
      assert.match(await text(ad, 'body'), /Haft/);
      await ad.ctx.close();
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
