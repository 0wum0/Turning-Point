'use strict';
const fs = require('fs');
const path = require('path');
const { paths } = require('../config');

const MAX = 1024 * 1024;
function write(level, args) {
  const msg = args.map((a) => (a instanceof Error ? a.stack || a.message : typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  const line = `${new Date().toISOString()} [${level}] ${msg}\n`;
  (level === 'error' ? process.stderr : process.stdout).write(line);
  try {
    const file = path.join(paths.logsDir, 'app.log');
    fs.mkdirSync(paths.logsDir, { recursive: true });
    try { if (fs.statSync(file).size > MAX) fs.renameSync(file, file + '.1'); } catch (_) {}
    fs.appendFileSync(file, line);
  } catch (_) { /* Logging darf nie crashen */ }
}
module.exports = {
  info: (...a) => write('info', a), warn: (...a) => write('warn', a), error: (...a) => write('error', a),
  tail(lines = 120) {
    try {
      const txt = fs.readFileSync(path.join(paths.logsDir, 'app.log'), 'utf8').split('\n');
      return txt.slice(-lines).join('\n');
    } catch (_) { return ''; }
  },
};
