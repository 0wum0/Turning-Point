'use strict';
/**
 * Versionsstempel für statische Dateien (?v=…): Paketversion plus Build-Kennung, damit ein ausgeliefertes Update
 * nie von einem alten Browser-Cache verdeckt wird. Kennung = kurze Git-Revision (falls vorhanden), sonst die jüngste
 * Änderungszeit der Dateien unter public/. Wird einmal beim Start berechnet.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function newestMtime(dir, depth = 0) {
  let best = 0;
  let list = [];
  try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return 0; }
  for (const e of list) {
    if (e.name === 'fonts' || e.name === 'img' || e.name === 'vendor') continue;
    const f = path.join(dir, e.name);
    try {
      if (e.isDirectory()) { if (depth < 4) best = Math.max(best, newestMtime(f, depth + 1)); } else best = Math.max(best, Math.floor(fs.statSync(f).mtimeMs / 1000));
    } catch (_) { /* egal */ }
  }
  return best;
}

function buildStamp(root) {
  if (process.env.TP_BUILD && /^[\w.-]{1,32}$/.test(process.env.TP_BUILD)) return process.env.TP_BUILD;
  try {
    const rev = execFileSync('git', ['rev-parse', '--short=8', 'HEAD'], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000 }).toString().trim();
    if (/^[0-9a-f]{4,40}$/.test(rev)) return rev;
  } catch (_) { /* kein Git: Änderungszeit */ }
  const m = newestMtime(path.join(root, 'public'));
  return m ? m.toString(36) : '0';
}

/** z. B. „0.1.0-3fa9c1d2“ */
const assetVersion = (root, version) => `${version}-${buildStamp(root)}`;

module.exports = { assetVersion, buildStamp };
