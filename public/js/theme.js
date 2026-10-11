(function () {
  try {
    var t = localStorage.getItem('tp-theme');
    if (!t) t = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', t);
  } catch (e) { document.documentElement.setAttribute('data-theme', 'dark'); }
})();

// Layout preference is separate from the existing light/dark colour preference.
(function () {
  var design = 'classic';
  try { if (localStorage.getItem('tp-game-design') === 'v2') design = 'v2'; } catch (_) {}
  document.documentElement.dataset.gameDesign = design;
})();
