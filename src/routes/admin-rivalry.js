'use strict';
/** Admin: Wettbewerb ein-/ausschalten (aus, freiwillig, für alle) und Protokoll ansehen. */
const db = require('../db');
const settings = require('../settings');
const rivalry = require('../lib/rivalry');
const { audit } = require('../lib/audit');

module.exports = function mount(router, H) {
  const { wrap, flash, int } = H;

  router.get('/rivalry', wrap(async (req, res) => {
    const log = await rivalry.adminLog(100);
    const k = (await db.query("SELECT (SELECT COUNT(*) FROM users WHERE rivalry = 1) optin, (SELECT COUNT(*) FROM rivalry_log WHERE created_at > NOW() - INTERVAL 7 DAY) week, (SELECT COUNT(*) FROM rivalry_log WHERE caught = 1 AND created_at > NOW() - INTERVAL 7 DAY) caught, (SELECT COUNT(*) FROM users WHERE rivalry_ban > NOW()) banned"))[0];
    res.render('admin/rivalry', { title: 'Wettbewerb', subtitle: 'Sabotage, Preiskampf und Co. zwischen Spielern – ein- und ausschalten.', active: 'rivalry', cfg: settings.get('rivalry'), log, k });
  }));

  router.post('/rivalry/mode', wrap(async (req, res) => {
    const mode = ['off', 'optin', 'all'].includes(req.body.mode) ? req.body.mode : 'optin';
    await settings.set('rivalry', { ...settings.get('rivalry'), mode });
    await audit(req, 'rivalry_mode', { mode });
    flash(req, 'good', { off: 'Wettbewerb ausgeschaltet.', optin: 'Wettbewerb ist freiwillig: Spieler entscheiden selbst.', all: 'Wettbewerb ist für ALLE Spieler aktiv.' }[mode]);
    res.redirect('/admin/rivalry');
  }));

  router.post('/rivalry/ban/:id(\\d+)/clear', wrap(async (req, res) => {
    await db.query('UPDATE users SET rivalry_ban = NULL WHERE id = ?', [int(req.params.id)]);
    flash(req, 'good', 'Sperre aufgehoben.'); res.redirect('/admin/rivalry');
  }));
};
