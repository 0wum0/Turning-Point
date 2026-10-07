'use strict';
const express = require('express');
const settings = require('../settings');
const router = express.Router();

router.get('/', (req, res) => res.render('index', { landing: require('../settings').get('landing') }));
router.get('/impressum', (req, res) => res.render('legal', { title: 'Impressum', body: settings.get('legal.impressum') }));
router.get('/datenschutz', (req, res) => res.render('legal', { title: 'Datenschutz', body: settings.get('legal.datenschutz') }));

module.exports = router;
