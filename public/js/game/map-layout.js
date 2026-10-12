/* World-anchored clusters; only projection and label placement depend on the viewport. */
function clusterPlaces(points, { scale, cellSize, selected, home, birth, owned, filter }) {
  const cells = new Map();
  const priority = (c) => (c.id === selected ? 1e12 : c.id === home ? 9e11 : owned.has(c.id) ? 8e11 : c.id === birth ? 7e11 : 0) + (c.pop || c.tier * 1000);
  const compare = (a, b) => priority(b.c) - priority(a.c) || a.c.id - b.c.id;
  // Group the full catalogue before clipping: panning must never change membership.
  for (const p of points) {
    if (filter === 'owned' && !owned.has(p.c.id) && p.c.id !== home && p.c.id !== birth) continue;
    const key = `${Math.floor(p.xy[0] * scale / cellSize)}:${Math.floor(p.xy[1] * scale / cellSize)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(p);
  }
  const markers = [...cells.values()].map((members) => {
    members.sort(compare);
    return { ...members[0], members, owned: members.some((p) => owned.has(p.c.id)) };
  }).sort(compare);
  // A spatial index avoids scanning the entire catalogue for each neighbouring pin.
  const spaced = [], neighbours = new Map();
  const gap = 34;
  for (const p of markers) {
    const x = p.xy[0] * scale, y = p.xy[1] * scale;
    const cx = Math.floor(x / gap), cy = Math.floor(y / gap);
    let nearby;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const q of neighbours.get(`${cx + dx}:${cy + dy}`) || []) {
        if (Math.hypot((q.xy[0] - p.xy[0]) * scale, (q.xy[1] - p.xy[1]) * scale) < gap && (!nearby || compare(q, nearby) < 0)) nearby = q;
      }
    }
    if (nearby) { nearby.members.push(...p.members); nearby.owned ||= p.owned; }
    else {
      spaced.push(p);
      const key = `${cx}:${cy}`;
      if (!neighbours.has(key)) neighbours.set(key, []);
      neighbours.get(key).push(p);
    }
  }
  return spaced;
}

export function layoutMarkers(points, { box, width, height, selected, home, birth, owned = new Set(), filter = 'all', measure = (text) => text.length * 6.8, excluded = [], groups }) {
  const scale = Math.min(width / box.w, height / box.h);
  if (!Number.isFinite(scale) || scale <= 0) return { markers: [], scale: 1, groups: [] };
  const ox = (width - box.w * scale) / 2, oy = (height - box.h * scale) / 2;
  const cellSize = width < 500 ? 58 : 68;
  groups ||= clusterPlaces(points, { scale, cellSize, selected, home, birth, owned, filter });
  // Overscan keeps pins mounted at the edges and includes clusters with visible members.
  const pad = Math.SQRT2 * cellSize + 34;
  const spaced = groups.map(p => ({ ...p, sx: ox + (p.xy[0] - box.x) * scale, sy: oy + (p.xy[1] - box.y) * scale, label: null }))
    .filter(p => p.sx > -pad && p.sx < width + pad && p.sy > -pad && p.sy < height + pad);
  const reserved = spaced.map((p) => ({ x: p.sx - 14, y: p.sy - 29, w: 28, h: 33 }));
  const blocked = [...excluded];
  const overlaps = (a, b) => a.x < b.x + b.w + 4 && a.x + a.w + 4 > b.x && a.y < b.y + b.h + 3 && a.y + a.h + 3 > b.y;
  const maxLabels = Math.max(4, Math.min(42, Math.floor(width * height / 12000)));
  let labels = 0;
  for (const p of spaced) {
    if (labels >= maxLabels) break;
    if (p.sx < 10 || p.sx > width - 10 || p.sy < 18 || p.sy > height - 10) continue;
    // Name the leading major city; the pin count makes grouped places explicit.
    const important = p.c.id === selected || p.c.id === home || owned.has(p.c.id) || p.c.id === birth;
    if (p.members.length > 1 && !important && p.c.pop < 50000) continue;
    const title = p.c.name.length > 23 ? p.c.name.slice(0, 21) + '…' : p.c.name;
    const w = Math.ceil(measure(title)) + 12;
    const choices = [{ x: p.sx + 24, y: p.sy - 10, w, h: 20 }, { x: p.sx - w - 24, y: p.sy - 10, w, h: 20 }];
    const rect = choices.find((r) => r.x > 2 && r.x + r.w < width - 2 && r.y > 2 && r.y + r.h < height - 2 && ![...reserved, ...blocked].some((b) => overlaps(r, b)));
    if (!rect) continue;
    p.label = { cityId: p.c.id, text: title, dx: rect.x - p.sx + 6, dy: 4, edge: rect.x > p.sx ? rect.x - p.sx : rect.x + rect.w - p.sx, rect };
    reserved.push(rect); labels++;
  }
  return { markers: spaced, scale, groups };
}
