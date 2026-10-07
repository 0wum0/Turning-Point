'use strict';
const express = require('express');
const router = express.Router();

router.use((req, res, next) => (req.user ? next() : res.redirect(`/login?next=${encodeURIComponent('/play')}`)));
router.get('/', (req, res) => res.render('game/shell'));
router.get('/*', (req, res) => res.redirect('/play'));

module.exports = router;
