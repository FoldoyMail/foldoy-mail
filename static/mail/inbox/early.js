(function () {
  var d = document.documentElement;
  var get = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
  var mq = function (q) { return window.matchMedia && matchMedia(q).matches; };
  d.setAttribute('data-look', 'b');
  var t = get('foldoy-theme') || 'dark';
  d.setAttribute('data-theme', t === 'system' ? (mq('(prefers-color-scheme: light)') ? 'light' : 'dark') : (t === 'light' ? 'light' : 'dark'));
  d.setAttribute('data-theme-pick', t);
  var a = get('foldoy-accent'); if (a) d.setAttribute('data-accent', a);
  d.setAttribute('data-pane', get('foldoy-pane') === 'right' ? 'right' : 'full');
  var touch = mq('(max-width: 1023px) and (hover: none)'), pref = get('foldoy-rail');
  d.classList.add('noanim');
  if (!touch && get('foldoy-pane') !== 'right' && /^#\/(f|s)\/[^/]+\/[^/]+/.test(location.hash)) { d.setAttribute('data-boot-open', ''); setTimeout(function () { d.removeAttribute('data-boot-open'); }, 5000); }
  if (/^#\/(settings|aliases)/.test(location.hash)) { d.setAttribute('data-boot-view', ''); setTimeout(function () { d.removeAttribute('data-boot-view'); }, 5000); }
  d.setAttribute('data-rail', !touch && (pref ? pref === 'min' : mq('(max-width: 1180px)')) ? 'min' : 'full');
  var names = { drafts: 'Drafts', sent: 'Sent', starred: 'Starred', snoozed: 'Snoozed', scheduled: 'Scheduled', archive: 'Archive', junk: 'Junk', trash: 'Trash', all: 'All mail' };
  var m = location.hash.match(/^#\/f\/([a-z]+)/), title = /^#\/s\//.test(location.hash) ? 'Search' : /^#\/settings/.test(location.hash) ? 'Settings' : /^#\/aliases/.test(location.hash) ? 'Aliases' : m && names[m[1]];
  if (title) { var mo = new MutationObserver(function () { var h = document.querySelector('#list .lh h1'); if (h && h.textContent) { if (h.textContent === 'Inbox') h.textContent = title; mo.disconnect(); } }); mo.observe(document.documentElement, { childList: true, subtree: true }); setTimeout(function () { mo.disconnect(); }, 4000); }
})();
