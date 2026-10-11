/* Screen-space marker layout for the simulator map. Pure function, no DOM. */
export function layoutMarkers(points, { box, width, height, selected, home, birth, owned = new Set(), filter = 'all' }) {
  const scale = Math.min(width / box.w, height / box.h);
  if (!Number.isFinite(scale) || scale <= 0) return { markers: [], scale: 1 };
  const ox = (width - box.w * scale) / 2, oy = (height - box.h * scale) / 2;
  const cells = new Map(); const cellSize = width < 500 ? 58 : 68;
  const priority = (c) => (c.id === selected ? 1e12 : c.id === home ? 9e11 : owned.has(c.id) ? 8e11 : c.id === birth ? 7e11 : 0) + (c.pop || c.tier * 1000);
  for (const p of points) {
    if (filter === 'owned' && !owned.has(p.c.id) && p.c.id !== home && p.c.id !== birth) continue;
    const sx = ox + (p.xy[0] - box.x) * scale, sy = oy + (p.xy[1] - box.y) * scale;
    if (sx < 10 || sx > width - 10 || sy < 18 || sy > height - 10) continue;
    const key = `${Math.floor(sx / cellSize)}:${Math.floor(sy / cellSize)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push({ ...p, sx, sy });
  }
  const markers = [...cells.values()].map((members) => {
    members.sort((a, b) => priority(b.c) - priority(a.c));
    const lead = members[0];
    return { ...lead, members, owned: members.some((p) => owned.has(p.c.id)), label: null };
  }).sort((a, b) => priority(b.c) - priority(a.c));
  // Merge neighbouring cell leaders that still land too close to each other.
  const spaced = [];
  for (const p of markers) {
    const nearby = spaced.find((q) => Math.hypot(q.sx - p.sx, q.sy - p.sy) < 34);
    if (nearby) { nearby.members.push(...p.members); nearby.owned ||= p.owned; }
    else spaced.push(p);
  }
  const reserved = spaced.map((p) => ({ x: p.sx - 11, y: p.sy - 18, w: p.members.length > 1 ? 30 : 22, h: 27 }));
  const overlaps = (a, b) => a.x < b.x + b.w + 4 && a.x + a.w + 4 > b.x && a.y < b.y + b.h + 3 && a.y + a.h + 3 > b.y;
  const maxLabels = Math.max(4, Math.min(42, Math.floor(width * height / 12000)));
  let labels = 0;
  for (const p of spaced) {
    if (labels >= maxLabels) break;
    // Name the leading major city; the pin count makes grouped places explicit.
    const important = p.c.id === selected || p.c.id === home || owned.has(p.c.id) || p.c.id === birth;
    if (p.members.length > 1 && !important && p.c.pop < 50000) continue;
    const title = p.c.name.length > 23 ? p.c.name.slice(0, 21) + '…' : p.c.name;
    const w = title.length * 6.8 + 6;
    const choices = [{ x: p.sx + 26, y: p.sy - 13, w, h: 16 }, { x: p.sx - w - 26, y: p.sy - 13, w, h: 16 }];
    const rect = choices.find((r) => r.x > 2 && r.x + r.w < width - 2 && r.y > 2 && r.y + r.h < height - 2 && !reserved.some((b) => overlaps(r, b)));
    if (!rect) continue;
    p.label = { text: title, dx: rect.x - p.sx + 3, dy: rect.y - p.sy + 12, rect };
    reserved.push(rect); labels++;
  }
  return { markers: spaced, scale };
}
