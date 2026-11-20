(function () {
  'use strict';
  var EVERY = 10 * 60 * 1000, last = 0, stale = false;
  var mine = function (html) {
    var out = [], re = /\/static\/mail\/[^"'\s>]+\.[0-9a-f]{12}\.(?:css|js)/g, m;
    while ((m = re.exec(html))) out.push(m[0]);
    return out.sort().join(' ');
  };
  var now = mine(document.documentElement.outerHTML);
  if (!now) return;
  var busy = function () {
    if (document.getElementById('dock') || /^#\/compose/.test(location.hash)) return true;
    if (document.querySelector('dialog[open], .keys:not([hidden]), .sdlg')) return true;
    var a = document.activeElement;
    return !!(a && (a.tagName === 'TEXTAREA' || a.isContentEditable || (a.tagName === 'INPUT' && a.value)));
  };
  var go = function () { if (stale && !busy()) location.reload(); };
  var check = function () {
    if (stale || Date.now() - last < EVERY) return;
    last = Date.now();
    fetch(location.pathname, { cache: 'no-store', credentials: 'same-origin', redirect: 'manual' })
      .then(function (r) { return r.ok ? r.text() : ''; })
      .then(function (t) { var got = t && mine(t); if (got && got !== now) { stale = true; if (document.hidden) go(); } })
      .catch(function () {});
  };
  document.addEventListener('visibilitychange', function () { if (document.hidden) go(); else check(); });
  addEventListener('hashchange', function () { check(); if (/^#\/(f\/|$)|^$/.test(location.hash)) go(); });
  setInterval(function () { if (document.hidden) { check(); go(); } }, EVERY);
  last = Date.now();
})();
