// Fraction of one real game trip; cosmetic flow is deliberately separate.
export function freightProgress(trip, clock = {}, elapsedMs = 0) {
  if (!trip || !Number.isFinite(trip.days) || trip.days <= 0) return 0;
  const fraction = Math.max(0, Number(clock.carry) || 0) + Math.max(0, elapsedMs) * Math.max(0, Number(clock.perMs) || 0);
  return Math.max(0, Math.min(1, (trip.days - trip.left + fraction) / trip.days));
}
export function freightPoint(a, b, progress) {
  return [a[0] + (b[0] - a[0]) * progress, a[1] + (b[1] - a[1]) * progress];
}
