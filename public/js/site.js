document.querySelectorAll('[data-theme-toggle]').forEach(function (b) {
  b.addEventListener('click', function () {
    var cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', cur);
    try { localStorage.setItem('tp-theme', cur); } catch (e) {}
  });
});
