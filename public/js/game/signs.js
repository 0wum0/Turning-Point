// Beschriftete Holzschilder und Symbole als kleine Canvas-Texturen (kein Bild-Download).
export function signTexture(T, text, { bg = '#6a4a2a', fg = '#f7ecd0', border = '#2b1d12', w = 512, h = 96 } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h); g.strokeStyle = border; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8);
  g.strokeStyle = fg + '55'; g.lineWidth = 2; g.strokeRect(14, 14, w - 28, h - 28);
  let size = 52; g.font = `700 ${size}px Georgia, 'Times New Roman', serif`;
  while (g.measureText(text).width > w - 56 && size > 20) { size -= 2; g.font = `700 ${size}px Georgia, 'Times New Roman', serif`; }
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 3);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; return t;
}
export function iconTexture(T, kind) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#e9d9b0'; g.fillRect(0, 0, 128, 128); g.strokeStyle = '#2b1d12'; g.lineWidth = 8; g.strokeRect(4, 4, 120, 120);
  g.fillStyle = '#5b3a1e'; g.strokeStyle = '#5b3a1e'; g.lineWidth = 7; g.lineCap = 'round';
  if (kind === 'mug') { g.fillRect(34, 38, 46, 56); g.fillStyle = '#f5d36a'; g.fillRect(38, 54, 38, 36); g.fillStyle = '#fff'; g.fillRect(38, 40, 38, 14); g.strokeStyle = '#5b3a1e'; g.beginPath(); g.arc(88, 66, 14, -1.4, 1.4); g.stroke(); }
  else if (kind === 'pretzel') { g.strokeStyle = '#b8742c'; g.lineWidth = 11; g.beginPath(); g.arc(46, 66, 20, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(82, 66, 20, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(46, 86); g.lineTo(82, 46); g.moveTo(82, 86); g.lineTo(46, 46); g.stroke(); }
  else if (kind === 'anvil') { g.fillStyle = '#2f3237'; g.fillRect(30, 46, 68, 18); g.fillRect(48, 64, 32, 22); g.fillRect(36, 86, 56, 12); g.beginPath(); g.moveTo(98, 46); g.lineTo(116, 52); g.lineTo(98, 62); g.fill(); }
  else if (kind === 'cross') { g.fillStyle = '#c0392b'; g.fillRect(52, 24, 24, 80); g.fillRect(24, 52, 80, 24); }
  else if (kind === 'clover') { g.fillStyle = '#2f8a46'; for (const [x, y] of [[50, 50], [78, 50], [50, 78], [78, 78]]) { g.beginPath(); g.arc(x, y, 17, 0, Math.PI * 2); g.fill(); } g.fillRect(60, 84, 8, 28); }
  else if (kind === 'saw') { g.fillStyle = '#8c9298'; g.fillRect(24, 50, 80, 24); g.fillStyle = '#e9d9b0'; for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(26 + i * 10, 74); g.lineTo(31 + i * 10, 84); g.lineTo(36 + i * 10, 74); g.fill(); } }
  else if (kind === 'wheat') { g.strokeStyle = '#a9831f'; g.beginPath(); g.moveTo(64, 108); g.lineTo(64, 28); g.stroke(); g.fillStyle = '#c9a233'; for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(52, 40 + i * 14, 7, 12, -.5, 0, Math.PI * 2); g.fill(); g.beginPath(); g.ellipse(76, 40 + i * 14, 7, 12, .5, 0, Math.PI * 2); g.fill(); } }
  else if (kind === 'coin') { g.fillStyle = '#d9a82f'; g.beginPath(); g.arc(64, 64, 38, 0, Math.PI * 2); g.fill(); g.fillStyle = '#7a5810'; g.font = '700 52px Georgia'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('€', 64, 68); }
  else { g.fillStyle = '#5b3a1e'; g.beginPath(); g.arc(64, 64, 30, 0, Math.PI * 2); g.fill(); }
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
}
