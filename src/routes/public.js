'use strict';
const express = require('express');
const settings = require('../settings');
const LEGAL_DE = require('../legal-texts');
const router = express.Router();

let LEGAL_EN = {};
try { LEGAL_EN = require('../legal-texts-en'); } catch (_) { /* Übersetzung optional */ }

router.get('/', (req, res) => res.render('index', { landing: settings.get(req.lang === 'en' ? 'landing_en' : 'landing'), deleted: !!req.query.deleted }));

/** Englische Fassung nur, solange der Admin den deutschen Text nicht selbst geändert hat. */
function legal(key, titleDe, titleEn) {
  return (req, res) => {
    const de = settings.get(`legal.${key}`);
    const en = req.lang === 'en' && de === LEGAL_DE[key] && LEGAL_EN[key];
    res.render('legal', { title: en ? titleEn : titleDe, body: en || de });
  };
}
router.get('/impressum', legal('impressum', 'Impressum', 'Legal notice'));
router.get('/datenschutz', legal('datenschutz', 'Datenschutz', 'Privacy policy'));
router.get('/agb', legal('agb', 'Nutzungsbedingungen (AGB)', 'Terms of use'));
router.get('/widerruf', legal('widerruf', 'Widerrufsbelehrung', 'Right of withdrawal'));

module.exports = router;
