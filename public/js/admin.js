document.addEventListener('click', function (e) {
  var b = e.target.closest('[data-confirm]');
  if (b && !window.confirm(b.getAttribute('data-confirm'))) { e.preventDefault(); e.stopPropagation(); }
}, true);
document.addEventListener('change', function (e) {
  var all = e.target.closest('[data-check-all]');
  if (!all) return;
  document.querySelectorAll('input[name="' + all.getAttribute('data-check-all') + '"]').forEach(function (c) { c.checked = all.checked; });
});
