import { WORLD } from './aerial.js';

// A single camera for mouse, touch, keyboard and building selection.
export function createCityCamera(svg, { saved, onChange, smooth = () => true }) {
  const { w: W, h: H } = WORLD;
  let ratio = .65, current, target, frame = 0, last = 0, disposed = false;
  let dragged = false, velocity = [0, 0], lastMove = 0, inertia = false;
  const points = new Map(), removers = [];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const animated = () => smooth() && !reduced.matches && document.documentElement.dataset.motion !== 'off';
  const listen = (type, handler, options) => { svg.addEventListener(type, handler, options); removers.push(() => svg.removeEventListener(type, handler, options)); };
  const clamp = b => {
    const max = Math.min(W, H / ratio);
    b.w = Math.max(max / 6, Math.min(max, b.w)); b.h = b.w * ratio;
    b.x = Math.max(0, Math.min(W - b.w, b.x)); b.y = Math.max(0, Math.min(H - b.h, b.y));
    return b;
  };
  const paint = () => {
    svg.setAttribute('viewBox', `${current.x} ${current.y} ${current.w} ${current.h}`);
    svg.classList.toggle('zoomed', W / current.w > 1.7);
    onChange({ ...current });
  };
  const request = () => { if (!frame && !disposed) frame = requestAnimationFrame(tick); };
  function tick(now) {
    frame = 0; const dt = Math.max(1, last ? now - last : 16); last = now;
    if (inertia && animated()) {
      target.x += velocity[0] * Math.min(dt,40); target.y += velocity[1] * Math.min(dt,40); clamp(target);
      const decay = Math.exp(-dt / 120); velocity = velocity.map(v => v * decay);
      if (Math.hypot(...velocity) < .015) inertia = false;
    } else inertia = false;
    const amount = animated() && !points.size ? 1 - Math.exp(-dt / 85) : 1;
    let distance = 0;
    for (const k of ['x', 'y', 'w', 'h']) { current[k] += (target[k] - current[k]) * amount; distance += Math.abs(target[k] - current[k]); }
    if (distance < .04 && !inertia) current = { ...target };
    paint(); if (distance >= .04 || inertia) request(); else last = 0;
  }
  const sync = () => { current = { ...target }; paint(); };
  const point = (x, y, box = target) => { const r = svg.getBoundingClientRect(); return [box.x + (x - r.left) / r.width * box.w, box.y + (y - r.top) / r.height * box.h]; };
  const zoom = (factor, x, y) => {
    inertia = false;
    const r = svg.getBoundingClientRect(); if (!r.width || !r.height) return;
    x ??= r.left + r.width / 2; y ??= r.top + r.height / 2;
    const [wx, wy] = point(x, y); const fx = (x - r.left) / r.width, fy = (y - r.top) / r.height;
    target.w *= factor; clamp(target); target.x = wx - fx * target.w; target.y = wy - fy * target.h; clamp(target); request();
  };
  const center = (x, y, level = 2.1, immediate = false) => {
    inertia = false; target = clamp({ x:0, y:0, w:Math.min(W, H / ratio) / level, h:0 });
    target.x = x - target.w / 2; target.y = y - target.h / 2; clamp(target);
    if (immediate || !current) sync(); else request();
  };
  const resize = () => {
    const r = svg.getBoundingClientRect(); if (!r.width || !r.height) return;
    const old = ratio; ratio = r.height / r.width;
    if (!current) { target = clamp(saved ? { ...saved } : { x:0,y:0,w:W,h:H }); current = { ...target }; }
    else { const cx = current.x + current.w / 2, cy = current.y + current.h / 2; const oldMax = Math.min(W, H / old); target = clamp({ ...current, w:current.w * Math.min(W, H / ratio) / oldMax }); target.x = cx - target.w / 2; target.y = cy - target.h / 2; clamp(target); }
    sync();
  };
  const observer = new ResizeObserver(resize); observer.observe(svg); resize();
  listen('wheel', e => { e.preventDefault(); zoom(Math.exp(Math.max(-120, Math.min(120, e.deltaY * (e.deltaMode === 1 ? 16 : 1))) * .002), e.clientX, e.clientY); }, { passive:false });
  listen('pointerdown', e => {
    if (e.button && e.pointerType === 'mouse') return;
    inertia = false; velocity = [0,0]; target = { ...current }; if (!points.size) dragged = false;
    points.set(e.pointerId, { x:e.clientX,y:e.clientY,ox:e.clientX,oy:e.clientY }); lastMove = performance.now();
  });
  listen('pointermove', e => {
    const p = points.get(e.pointerId); if (!p) return;
    const old = [...points.values()].map(v => ({ ...v })); const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (points.size === 2) {
      dragged = true; svg.setPointerCapture(e.pointerId);
      const next = [...points.values()], a = old[0], b = old[1], c = next[0], d = next[1];
      const distance = Math.hypot(c.x-d.x,c.y-d.y), previous = Math.hypot(a.x-b.x,a.y-b.y);
      const anchor = point((a.x+b.x)/2,(a.y+b.y)/2);
      if (distance > 4) { target.w *= previous / distance; clamp(target); }
      const r = svg.getBoundingClientRect(); target.x = anchor[0] - ((c.x+d.x)/2-r.left)/r.width*target.w; target.y = anchor[1] - ((c.y+d.y)/2-r.top)/r.height*target.h; clamp(target); sync(); return;
    }
    if (Math.hypot(p.x-p.ox,p.y-p.oy) > 5) dragged = true;
    if (!dragged) return;
    svg.setPointerCapture(e.pointerId);
    const r = svg.getBoundingClientRect(), now = performance.now(), dt = Math.max(8,now-lastMove);
    const mx = -dx/r.width*target.w, my = -dy/r.height*target.h;
    target.x += mx; target.y += my; clamp(target); velocity = [mx/dt,my/dt]; lastMove = now; sync();
  });
  const end = e => {
    points.delete(e.pointerId);
    if (points.size) { for (const p of points.values()) { p.ox=p.x; p.oy=p.y; } velocity=[0,0]; return; }
    inertia = e.type !== 'pointercancel' && dragged && performance.now()-lastMove < 80 && animated(); if (inertia) request();
  };
  listen('pointerup', end); listen('pointercancel', end); listen('lostpointercapture', e => { if (points.has(e.pointerId)) { points.delete(e.pointerId); inertia=false; } });
  listen('keydown', e => {
    if (e.key === '+' || e.key === '=') { e.preventDefault(); zoom(.8); }
    else if (e.key === '-') { e.preventDefault(); zoom(1.25); }
    else if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) { e.preventDefault(); inertia=false; target.x += (e.key==='ArrowLeft'?-1:e.key==='ArrowRight'?1:0)*target.w*.12; target.y += (e.key==='ArrowUp'?-1:e.key==='ArrowDown'?1:0)*target.h*.12; clamp(target); request(); }
  });
  return { center, zoom, get dragged() { return dragged; }, dispose() { disposed=true; observer.disconnect(); cancelAnimationFrame(frame); removers.forEach(fn=>fn()); } };
}
