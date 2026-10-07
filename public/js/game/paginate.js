/** Teilt lange Texte in Zeitungsseiten. Eigene Seitenumbrüche: eine Zeile nur mit „---“. Absätze: Leerzeile. */
export function paginate(text, size = 950) {
  const pages = [];
  for (const block of String(text || '').replace(/\r\n?/g, '\n').split(/\n[ \t]*-{3,}[ \t]*\n/)) {
    const paras = block.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    let cur = '';
    const push = () => { if (cur) { pages.push(cur); cur = ''; } };
    for (let p of paras) {
      while (p.length > size) {
        let cut = p.lastIndexOf('. ', size); if (cut < size * 0.5) cut = p.lastIndexOf(' ', size); if (cut <= 0) cut = size;
        const part = p.slice(0, cut + 1).trim(); p = p.slice(cut + 1).trim();
        if (cur && cur.length + part.length + 2 > size) push();
        cur += (cur ? '\n\n' : '') + part; push();
      }
      if (p) { if (cur && cur.length + p.length + 2 > size) push(); cur += (cur ? '\n\n' : '') + p; }
    }
    push();
  }
  return pages.length ? pages : [''];
}
