/* A viewed city is navigation context, never a change of the player's residence. */
export function rememberCity(ctx, cityId) {
  if (ctx.ui.cityId != null && ctx.ui.cityId !== cityId) { ctx.ui.cityBox = null; ctx.ui.cityBuilding = null; ctx.ui.cityTab = 'city'; }
  ctx.ui.cityId = cityId;
  ctx.ui.newsCity = cityId;
}

export function visitCity(ctx, cityId, three = false) {
  rememberCity(ctx, cityId);
  ctx.ui.cityTab = 'city';
  if (three) { ctx.ui.cityScene = '3d'; ctx.ui.mapCity = cityId; ctx.ui.mapPanelCollapsed = false; }
  ctx.go('city');
}

export function newspaperCity(ctx, simulator) {
  return ctx.ui.newsCity ?? (simulator ? ctx.ui.cityId : null) ?? ctx.view.city.id;
}
