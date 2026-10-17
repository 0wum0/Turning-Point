// Local, visual movement only. Coordinates match buildAerial's 2000 × 1250 street grid.
const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
export function streetPoint(roads, point) {
  const xs = roads.xs, ys = roads.ys;
  const clamp = (v, values) => Math.max(values[0], Math.min(values.at(-1), v));
  const candidates = [
    ...xs.map(x => ({ x, y: clamp(point.y, ys), axis: 'x', line: x })),
    ...ys.map(y => ({ x: clamp(point.x, xs), y, axis: 'y', line: y })),
  ];
  return candidates.sort((a, b) => distance(a, point) - distance(b, point))[0];
}

/** Shortest orthogonal route on the existing continuous street grid; never through a block. */
export function streetRoute(roads, from, to) {
  const a = streetPoint(roads, from), b = streetPoint(roads, to);
  let points;
  if (a.axis === b.axis && a.line === b.line) points = [a, b];
  else if (a.axis !== b.axis) points = [a, { x: a.axis === 'x' ? a.x : b.x, y: a.axis === 'y' ? a.y : b.y }, b];
  else {
    const vertical = a.axis === 'x', values = vertical ? roads.ys : roads.xs;
    const best = [...values].sort((u, v) => {
      const p = vertical ? 'y' : 'x';
      return Math.abs(a[p] - u) + Math.abs(b[p] - u) - Math.abs(a[p] - v) - Math.abs(b[p] - v);
    })[0];
    points = vertical ? [a, { x:a.x, y:best }, { x:b.x, y:best }, b] : [a, { x:best, y:a.y }, { x:best, y:b.y }, b];
  }
  return points.map(({x,y}) => ({x,y})).filter((p, i, all) => !i || distance(p, all[i-1]) > .001);
}

export function routeLength(points) { return points.slice(1).reduce((n, p, i) => n + distance(points[i], p), 0); }
export function routePosition(points, travelled) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i-1], b = points[i], length = distance(a,b);
    if (travelled <= length) { const t = length ? Math.max(0, travelled) / length : 1; return { x:a.x+(b.x-a.x)*t, y:a.y+(b.y-a.y)*t, angle:Math.atan2(b.x-a.x,b.y-a.y) }; }
    travelled -= length;
  }
  return { ...points.at(-1), angle:0 };
}
