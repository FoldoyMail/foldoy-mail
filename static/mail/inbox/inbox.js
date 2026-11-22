import { api, pgp, account, mail, fold, FOLDOY, PLANS_URL, siteUrl } from '../shared/api.js';
import { $, $$, esc, icon, toast, takeUndo, copy, picker, artFor, FREE_DOMAINS } from '../shared/ui.js';
import { cleanHtml } from '../shared/clean.js';
import { idx } from '../shared/search-index.js';

const app = $('#app'), list = $('#list'), pane = $('#pane');
const S = { me: null, folders: [], items: [], next: null, key: '', folder: 'inbox', q: '', sel: null, aliases: [], compose: null, back: '#/f/inbox',
  picked: new Set(), unreadOnly: false };
const phone = () => matchMedia('(max-width: 1023px) and (hover: none)').matches;
const FOLDER_ICON = { inbox: 'inbox', screener: 'screener', drafts: 'drafts', sent: 'sent', starred: 'star', snoozed: 'clock', scheduled: 'sent', archive: 'archive', junk: 'junk', trash: 'trash', all: 'allmail' };
const RAIL_ORDER = ['inbox', 'screener', 'drafts', 'sent', 'starred', 'snoozed', 'scheduled', 'archive', 'junk', 'trash', 'all'];
const COUNTED = ['drafts', 'starred', 'snoozed', 'scheduled', 'screener'];
const ORDERS = 'orders@foldoy.com';
const DEPOSIT_URL = siteUrl('/account/deposit/');
const goUrl = () => (S.me.deposits_open ? DEPOSIT_URL : PLANS_URL);
const SEES_URL = location.hostname.startsWith('mail.') ? `https://${location.hostname.slice(5)}/what-we-can-see/` : '/what-we-can-see/';
const PLAN = { free: 'Free', plus: 'foldoy+', polar: 'Polar' };
const usd = n => `$${Number(n || 0).toFixed(2)}`;
const gb = b => (b >= 1e9 ? `${(b / 1e9).toFixed(1).replace(/\.0$/, '')} GB` : `${Math.max(0.1, b / 1e6).toFixed(1).replace(/\.0$/, '')} MB`);
function meter() {
  const st = S.me.storage; if (!st) return '';
  const pc = Math.min(100, (st.used_bytes / st.quota_bytes) * 100);
  return `<div class="meter" title="Storage"><span class="bar"><i data-w="${Math.max(1.5, pc)}"></i></span><span class="mt">${(() => { const u = gb(st.used_bytes), q = gb(st.quota_bytes); return u.slice(-2) === q.slice(-2) ? `${u.slice(0, -3)} of ${q}` : `${u} of ${q}`; })()}</span></div>`;
}

function acctCard() {
  const me = S.me, name = me.display || me.address.split('@')[0];
  return `<div class="ac-id">${avatar({ addr: me.address, name }, ' ac-av')}<span class="ac-who"><b>${esc(name)}</b><span>${esc(me.address)}</span></span></div>
    <div class="ac-plan"><span>${PLAN[me.plan] || ''}</span><span>Balance ${usd(me.balance_usd)}</span></div>
    ${meter()}
    <div class="ac-acts">
      <a role="menuitem" href="#/settings">${icon('gear')}<span>Settings</span></a>
      <a role="menuitem" href="#/aliases">${icon('at')}<span>Aliases</span></a>
    </div>
    <div class="ac-acts">
      <a role="menuitem" href="${PLANS_URL}">${icon('plans')}<span>Pricing</span></a>
      <a role="menuitem" href="${siteUrl('/')}">${icon('home')}<span>foldoy.com</span></a>
    </div>
    <div class="ac-acts">
      <button role="menuitem" type="button" data-act="logout">${icon('out')}<span>Log out</span></button>
    </div>`;
}
function acctSheet(open) {
  let sh = $('#acsheet');
  if (!open) {
    if (sh) { sh.classList.remove('on'); setTimeout(() => sh.remove(), 340); }
    $$('.me-b').forEach(b => b.setAttribute('aria-expanded', 'false'));
    return;
  }
  if (sh) sh.remove();
  sh = document.createElement('div'); sh.id = 'acsheet'; sh.className = 'acsheet';
  sh.innerHTML = `<div class="ac-scrim" data-acclose></div><div class="ac-card" role="dialog" aria-modal="true" aria-label="Your account"><span class="ac-grab" aria-hidden="true"></span>${acctCard()}</div>`;
  document.body.append(sh);
  sh.querySelectorAll('.meter .bar i[data-w]').forEach(i => { i.style.width = `${i.dataset.w}%`; });
  $$('.me-b').forEach(b => b.setAttribute('aria-expanded', 'true'));
  requestAnimationFrame(() => sh.classList.add('on'));
  sh.addEventListener('click', e => { if (e.target.closest('[data-acclose], a, button')) acctSheet(false); });
  const card = sh.querySelector('.ac-card'); let d0 = null;
  card.addEventListener('touchstart', e => { d0 = card.scrollTop <= 0 && e.touches.length === 1 ? { y: e.touches[0].clientY, at: Date.now(), dy: 0 } : null; }, { passive: true });
  card.addEventListener('touchmove', e => { if (!d0) return; d0.dy = Math.max(0, e.touches[0].clientY - d0.y); card.style.transition = 'none'; card.style.transform = d0.dy ? `translateY(${d0.dy}px)` : ''; }, { passive: true });
  card.addEventListener('touchend', () => {
    if (!d0) return; const { dy, at } = d0; d0 = null; card.style.transition = 'transform .24s var(--ease)';
    if (dy > 80 || (dy > 30 && Date.now() - at < 250)) { card.style.transform = 'translateY(100%)'; acctSheet(false); }
    else card.style.transform = '';
  }, { passive: true });
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#acsheet')) { e.preventDefault(); acctSheet(false); $('.me-b')?.focus(); } });

function needPlans(redraw) {
  if (S.plansList?.length) return S.plansList;
  if (!S.plansAsk) S.plansAsk = api.plans().then(d => { S.plansList = d.plans; redraw?.(); }).catch(() => { S.plansAsk = null; });
  return null;
}
const monthly = p => `${usd(p.prices.month).replace(/\.00$/, '')} a month`;
const UNL = { aliases: 10000, domains: 100 };
const unl = (n, kind) => n >= UNL[kind];
const ofLim = (used, lim, kind) => (unl(lim, kind) ? `${used}` : `${used} of ${lim}`);
const LIFTS = {
  aliases: [p => p.aliases, n => (unl(n, 'aliases') ? 'unlimited aliases' : `${n.toLocaleString('en-GB')} aliases`), () => S.me.alias_limit],
  storage: [p => p.storage_gb, n => `${gb(n * 1e9)} of storage`, () => (S.me.storage?.quota_bytes || 0) / 1e9],
  sending: [p => p.send_per_day?.messages || 0, n => `${n} emails a day`, () => S.me.sending?.messages || 0],
  domains: [p => p.custom_domains, n => (unl(n, 'domains') ? 'unlimited custom domains' : `${n} custom domain${n === 1 ? '' : 's'}`), () => S.me.domain_limit || 0],
};
function wall(kind, sentence, redraw) {
  const [get, , now] = LIFTS[kind];
  const lifted = (needPlans(redraw) || []).some(p => p.prices && get(p) > now());
  return `<div class="limit wall">${sentence ? `<p>${esc(sentence)}</p>` : ''}
    ${!lifted && S.plansList?.length ? '' : S.me.plans_open ? `<a class="pill light sm" href="${PLANS_URL}">See plans</a>` : '<p class="dim">Paid plans can\'t be bought yet.</p>'}</div>`;
}
const DAY_LIMIT = /^That's (the most mail for a day|more recipients than)/;
function limitWall(x, c) {
  const kind = x?.status === 507 ? 'storage' : x?.status === 429 && DAY_LIMIT.test(x.message) ? 'sending' : null;
  return kind ? wall(kind, x.message, () => { if (c && c.wall && $('#cwall')) $('#cwall').innerHTML = c.wall = limitWall(x, c); }) : null;
}

const day = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
function when(iso) {
  const d = new Date(iso), now = new Date(), diff = (day(now) - day(d)) / 864e5;
  if (diff < 1) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (diff < 2) return 'Yesterday';
  if (diff < 7) return d.toLocaleDateString('en-GB', { weekday: 'short' });
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
const full = iso => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const size = b => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
const initials = p => ((p.name || p.addr).trim()[0] || '?').toUpperCase();
const names = new Map(); let namesFrom = null;
const knownName = a => {
  if (namesFrom !== S.items) { namesFrom = S.items; for (const m of S.items) for (const q of [m.from, ...(m.to || []), ...(m.cc || [])]) if (q?.name && q.addr && !names.has(q.addr)) names.set(q.addr, q.name); }
  return names.get(a);
};
const nameOf = p => p.name || knownName(p.addr) || p.addr;
const tone = p => { const a = (p?.addr || '').toLowerCase(); if (a === 'orders@foldoy.com') return 'house'; let h = 0; for (const c of a) h = (h * 31 + c.charCodeAt(0)) >>> 0; return 't' + (h % 8); };
const MARK = '<svg class="mk" viewBox="0 0 100 100" aria-hidden="true"><path d="M14 47.75H76A31 31 0 0 0 14 47.75Z"/><path d="M24 52.25H86A31 31 0 0 1 24 52.25Z"/></svg>';
const avatar = (p, cls = '') => `<span class="av ${tone(p)}${cls}" aria-hidden="true">${tone(p) === 'house' ? MARK : esc(initials(p))}${p?.brand && tone(p) !== 'house' ? `<img class="logo" src="/mail/api/logo?d=${encodeURIComponent(p.brand)}&amp;s=${encodeURIComponent(p.brand_sig || '')}" alt="" loading="lazy" decoding="async">` : ''}</span>`;
document.addEventListener('error', e => { if (e.target?.classList?.contains('logo')) e.target.remove(); }, true);
document.addEventListener('load', e => { if (e.target?.classList?.contains('logo') && e.target.naturalWidth > 1) e.target.classList.add('ok'); }, true);

const ACCENTS = [['blue', 'Blue'], ['teal', 'Teal'], ['mint', 'Mint'], ['violet', 'Violet'], ['pink', 'Pink'], ['red', 'Red'], ['orange', 'Orange'], ['yellow', 'Yellow'], ['graphite', 'Graphite']];
const THEMES = [['dark', 'Dark'], ['black', 'Black'], ['light', 'Light'], ['system', 'Match device']];
const lightQ = matchMedia('(prefers-color-scheme: light)');
const remember = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {  } };
const recall = k => { try { return localStorage.getItem(k); } catch (_) { return null; } };
function paintAccent(a) {
  if (!ACCENTS.some(([k]) => k === a)) a = 'blue';
  document.documentElement.dataset.accent = a; remember('foldoy-accent', a);
}
const settle = () => requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.remove('noanim')));
function paintTheme(t) {
  if (!THEMES.some(([k]) => k === t)) t = 'dark';
  const on = t === 'system' ? (lightQ.matches ? 'light' : 'dark') : t === 'light' ? 'light' : 'dark';
  if (document.documentElement.dataset.theme !== on || document.documentElement.dataset.themePick !== t) { document.documentElement.classList.add('noanim'); if (S.painted) settle(); }
  document.documentElement.dataset.theme = on; document.documentElement.dataset.themePick = t; remember('foldoy-theme', t);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', on === 'light' ? '#FFFFFF' : '#000000');
  $$('iframe.htmlmail').forEach(f => { const d = f.contentDocument?.documentElement; if (d && !d.classList.contains('paper')) d.dataset.theme = on; });
}
lightQ.addEventListener('change', () => { if (document.documentElement.dataset.themePick === 'system') paintTheme('system'); });
paintAccent(recall('foldoy-accent')); paintTheme(recall('foldoy-theme'));
document.documentElement.dataset.look = 'b';
document.documentElement.dataset.pane = recall('foldoy-pane') === 'right' ? 'right' : 'full';
const splitPane = () => !phone() && document.documentElement.dataset.pane === 'right';
const look = () => document.documentElement.dataset.look || '';

const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const openedIn = () => (installed() ? 'in your browser' : 'in a new tab');
const device = () => (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? 'ios'
  : /Android/.test(navigator.userAgent) ? 'android' : 'computer');
let installAsk = null;
const installRedraw = () => { if (S.sd && /^#\/settings\/install/.test(location.hash)) drawSettings('install'); };
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installAsk = e; installRedraw(); });
addEventListener('appinstalled', () => { installAsk = null; installRedraw(); });

async function boot() {
  const first = !location.hash || /^#\/f\/inbox\/?$/.test(location.hash);
  S.pre = { folders: api.folders().catch(() => null), list: first ? api.messages({ folder: 'inbox' }).catch(() => null) : null };
  try { S.me = await api.session(); }
  catch (e) { if (e.status === 401) { location.href = '/login/'; return; } if (e.status === 403 && e.locked) return bannedPane(e); throw e; }
  paintAccent(S.me.accent); paintTheme(S.me.theme);
  if (!S.me.e2e && (S.me.mailbox === 'none' || S.me.waiting_for === 'key' || !S.me.address)) return claimPane();
  if (S.me.sending?.hold) return lockedPane();
  if (!(await account.boot(S.me))) { if (S.me.privacy_plus?.on) return ppUnlockPane(); await api.logout().catch(() => {}); location.href = '/login/'; return; }
  await start();
}
async function start() {
  await refreshRail();
  idx.start(S.me).catch(() => {});
  setInterval(() => { if (!document.hidden) checkNew(); }, 30e3);
  setInterval(() => { if (document.hidden) checkNew(); }, 60e3);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkNew(); });
  if (keptFlag()) await keptFirst().catch(() => {});
  window.addEventListener('hashchange', routeSafe);
  if (!location.hash) history.replaceState(null, '', '#/f/inbox');
  routeSafe();
  const idle = window.requestIdleCallback || (f => setTimeout(f, 1500));
  setTimeout(() => idle(() => { if (!S.sd) fetchSettings().then(d => { if (!S.sd) S.sd = d; }).catch(() => {}); }), 1500);
}

function bannedPane(e) {
  S.me = { address: e.address || '' };
  setView('pending', 'pane'); document.body.classList.add('locked');
  pane.innerHTML = `<div class="blank"><div class="state lockst">
    <svg class="lockmark" viewBox="0 0 100 100" aria-label="foldoy"><path d="M14 47.75H76A31 31 0 0 0 14 47.75Z"/><path d="M24 52.25H86A31 31 0 0 1 24 52.25Z"/></svg>
    <h2>This account is locked.</h2>
    <p><b>${esc(S.me.address)}</b></p>
    <p><a href="mailto:support@foldoy.com">support@foldoy.com</a></p>
    <div class="acts"><button class="pill ghost md" type="button" data-act="logout">Log out</button></div>
  </div></div>`;
}
function lockedPane() {
  setView('pending', 'pane'); document.body.classList.add('locked');
  const s = S.me.sending, when = s.opens ? new Date(s.opens) : null;
  const at = when ? `${dayMonth(s.opens)}, ${when.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : '';
  const [h, p, go, note] = s.rejected
    ? ["This account wasn't approved.", 'Write to support@foldoy.com from another address if you think we got it wrong.', '']
    : s.applied ? ['Waiting for approval.', 'Log in again later; your mail is kept for you.', '']
    : s.can_apply ? ['Ask for approval.', 'Accounts made over a VPN or Tor are checked before they can be used. Ask now, or add funds to open it at once.',
      '<button class="pill light md" type="button" data-act="askok">Request approval</button>', true]
    : ['Your account is locked for now.', `Accounts made over a VPN or Tor are checked before they can be used. Add funds from $10 to open it at once, or ask for approval from ${esc(at)}.`, ''];
  const fund = s.rejected ? '' : `<a class="pill ${go ? 'line' : 'light'} md" href="/account/deposit/">Add funds</a>`;
  pane.innerHTML = `<div class="blank"><div class="state lockst">
    <svg class="lockmark" viewBox="0 0 100 100" aria-label="foldoy"><path d="M14 47.75H76A31 31 0 0 0 14 47.75Z"/><path d="M24 52.25H86A31 31 0 0 1 24 52.25Z"/></svg>
    <h2>${h}</h2>
    <p><b>${esc(S.me.address || '')}</b></p>
    <p>${p}</p>
    ${note ? '<div class="asknote"><textarea id="asknote" maxlength="1000" rows="3" placeholder="Anything we should know? Optional" aria-label="A message with your request"></textarea></div>' : ''}
    <p class="say bad" id="askerr" aria-live="assertive"></p>
    <div class="acts">${go}${fund}<button class="pill ghost md" type="button" data-act="logout">Log out</button></div>
    <p class="lockmore"><a href="mailto:support@foldoy.com">support@foldoy.com</a><button class="linkbtn" type="button" id="lockdel">Delete account</button></p>
    <form class="lockdelf" id="lockdelf" hidden novalidate>
      <p>Your address, mail and keys are erased for good.</p>
      <label class="label" for="lockdelpw">Your login password</label><div class="field"><input id="lockdelpw" type="password" autocomplete="current-password"></div>
      ${S.me.two_factor ? '<label class="label" for="lockdeltfa">Two-factor code</label><div class="field"><input id="lockdeltfa" inputmode="numeric" autocomplete="one-time-code" maxlength="40"></div>' : ''}
      <p class="say bad" id="lockdelerr" aria-live="assertive"></p>
      <div class="acts"><button class="pill kill md" type="submit">Delete my account</button></div>
    </form>
  </div></div>`;
  const b = $('[data-act="askok"]');
  if (b) b.onclick = async () => {
    b.setAttribute('aria-busy', 'true');
    try { S.me = await api.applyToSend($('#asknote')?.value || ''); lockedPane(); }
    catch (x) { $('#askerr').textContent = x.message; b.removeAttribute('aria-busy'); }
  };
  $('#lockdel').onclick = () => { const f = $('#lockdelf'); f.hidden = !f.hidden; if (!f.hidden) $('#lockdelpw').focus(); };
  $('#lockdelf').onsubmit = async e => {
    e.preventDefault();
    try { await api.deleteAccount(await account.auth($('#lockdelpw').value, S.me), $('#lockdeltfa')?.value.trim() || undefined); await pgp.forget(S.me.address); location.href = '/'; }
    catch (x) { $('#lockdelerr').textContent = x.message; }
  };
}

const notifyOn = () => recall('foldoy-notify') === '1' && 'Notification' in window && Notification.permission === 'granted';
const pendingDone = () => (sending.size ? Promise.race([Promise.allSettled([...sending.values()]), new Promise(r => setTimeout(r, 8000))]) : Promise.resolve());
let againT = 0;
async function checkNew() {
  if (S.out || S.me.mailbox !== 'active' || S.me.sending?.hold) return;
  await pendingDone();
  const gen = railGen;
  const stale = () => { if (gen === railGen) return false; clearTimeout(againT); againT = setTimeout(checkNew, 2000); return true; };
  let f; try { f = await api.folders(); } catch { return; }
  if (stale()) return;
  const was = (S.folders.find(x => x.role === 'inbox') || {}), now = f.find(x => x.role === 'inbox') || {};
  const show = () => { S.folders = f; renderRail(); idx.folders(f); };
  if (!(now.total > (was.total ?? now.total) || now.unread > (was.unread ?? now.unread))) return show();
  let r; try { r = await api.messages({ folder: 'inbox' }); } catch { if (!stale()) show(); return; }
  if (r.moved > 0) { try { f = await api.folders(); } catch {  } }
  const items = await mail.open(r.items);
  if (stale()) return;
  show();
  S.seen ||= new Set();
  const fresh = items.filter(m => m.unread && !S.seen.has(m.id)).slice(0, 3);
  items.forEach(m => S.seen.add(m.id));
  if (S.folder === 'inbox' && !S.q && !S.picked.size && /^#\/f\/inbox/.test(location.hash || '#/f/inbox')) { S.raw = items; S.items = groupThreads(items); S.next = r.next; patchRows(); }
  if (!notifyOn() || !document.hidden) return;
  for (const m of fresh) {
    const n = new Notification(nameOf(m.from), { body: m.locked ? 'New message' : (m.subject || 'New message'), tag: m.id, icon: '/static/mail/shared/favicon.svg' });
    n.onclick = () => { focus(); location.hash = `#/f/inbox/${m.id}`; n.close(); };
  }
}

function ppUnlockPane() {
  setView('pending', 'pane');
  pane.innerHTML = `<div class="blank"><form class="state ppunlock" id="ppuf" novalidate>
    <img class="art" src="/static/mail/shared/art/key.svg" alt="">
    <h2>Unlock with your privacy+ key</h2>
    <p>It stays open on this device until you log out.</p>
    <label class="label u-mt24" for="ppukey">privacy+ key</label>
    <div class="field"><input id="ppukey" type="password" autocomplete="off" spellcheck="false"><button class="end" type="button" data-act="showppu">Show</button></div>
    <p class="say bad" id="ppuerr" aria-live="assertive"></p>
    <div class="acts"><button class="pill light md" type="submit" id="ppugo">Unlock</button><button class="pill ghost md" type="button" data-act="logout">Log out</button></div>
  </form></div>`;
  $('#ppukey').focus();
  $('[data-act="showppu"]').onclick = e => { const i = $('#ppukey'); i.type = i.type === 'password' ? 'text' : 'password'; e.target.textContent = i.type === 'password' ? 'Show' : 'Hide'; };
  $('#ppuf').addEventListener('submit', async e => {
    e.preventDefault(); const b = $('#ppugo'), er = $('#ppuerr'); er.textContent = '';
    if (!$('#ppukey').value) { er.textContent = 'Type your privacy+ key.'; return; }
    b.setAttribute('aria-busy', 'true'); b.textContent = 'Unlocking…';
    try { await account.ppUnlock($('#ppukey').value, S.me); $('#ppukey').value = ''; await start(); }
    catch (x) { er.textContent = x.message; $('#ppukey').select(); b.removeAttribute('aria-busy'); b.textContent = 'Unlock'; }
  });
}

function claimPane() {
  setView('pending', 'pane');
  pane.innerHTML = `<div class="blank"><form class="state" id="claimf" novalidate>
    <h2>Pick your address.</h2>
    <div class="u-mt24" id="claimpick"></div>
    <p class="say" id="claimsay" aria-live="polite"></p>
    <label class="u-mt18 label" for="claimpw">Your password now</label>
    <div class="field"><input id="claimpw" type="password" autocomplete="current-password"></div>
    <label class="u-mt18 label" for="claimnew">A new password, for your mail</label>
    <div class="field"><input id="claimnew" type="password" autocomplete="new-password"></div>
    <p class="say bad" id="claimerr" aria-live="assertive"></p>
    <div class="acts"><button class="pill light md" type="submit">Take this address</button></div>
  </form></div>`;
  let ok = false, t = 0;
  const pk = picker($('#claimpick'), { onChange: v => { ok = false; clearTimeout(t); t = setTimeout(async () => {
    if (!v.name) return; const r = await api.check(v.name, v.domain).catch(e => ({ ok: false, message: e.message })); ok = r.ok;
    const say = $('#claimsay'); say.className = 'say ' + (r.ok ? 'ok' : 'bad'); say.textContent = r.ok ? `${v.name}@${v.domain} is available.` : r.message; }, 220); } });
  pk.focus();
  $('#claimf').addEventListener('submit', async e => {
    e.preventDefault(); const v = pk.get();
    if (!v.name || !ok) { $('#claimerr').textContent = 'Pick a free address first.'; return; }
    const next = $('#claimnew').value, bad = account.passwordProblem(next);
    if (bad) { $('#claimerr').textContent = bad; $('#claimnew').focus(); return; }
    try { S.me = await account.claim(v.name, v.domain, $('#claimpw').value, next); location.reload(); } catch (x) { $('#claimerr').textContent = x.message; }
  });
}

let railGen = 0;
async function refreshRail() {
  const pre = S.pre?.folders; if (pre) S.pre.folders = null;
  if (!pre) await pendingDone();
  const gen = railGen;
  if (S.me.mailbox === 'active') { const f = (pre && await pre) || await api.folders(); if (gen !== railGen) return; S.folders = f; }
  else S.folders = ['Inbox', 'Drafts', 'Sent', 'Archive', 'Junk', 'Trash'].map(n => ({ id: n.toLowerCase(), name: n, role: n.toLowerCase(), unread: 0, total: 0 }));
  renderRail(); idx.folders(S.folders);
}
function renderRail() {
  const h = location.hash, pend = S.me.mailbox !== 'active';
  const ordered = S.folders.slice().sort((a, b) => (RAIL_ORDER.indexOf(a.role) + 1 || 99) - (RAIL_ORDER.indexOf(b.role) + 1 || 99));
  $('#folders').innerHTML = ordered.map(f => {
    const n = COUNTED.includes(f.role) ? f.total : f.role === 'sent' || f.role === 'all' ? 0 : f.unread;
    const cur = !S.q && (h.startsWith(`#/f/${f.id}`) || (f.id === 'inbox' && (h === '' || h === '#/')) || (h.startsWith('#/compose') && !phone() && f.id === S.folder));
    const a = `<a href="#/f/${f.id}" class="${pend ? 'off' : ''}" ${cur ? 'aria-current="page"' : ''}>${icon(FOLDER_ICON[f.role] || 'folder')}<span>${esc(f.name)}</span>${n ? `<span class="n ${!COUNTED.includes(f.role) ? 'unread' : ''}">${n}</span>` : ''}</a>`;
    return cur && !pend ? `<div class="navcur">${a}<button class="iconbtn railrf" type="button" data-act="refresh" title="Check for new mail" aria-label="Check for new mail"${S.refreshing ? ' aria-busy="true"' : ''}>${icon('refresh')}</button></div>` : a;
  }).join('');
  const nc = $('#folders .navcur'), lab = nc && nc.querySelector('a > span:not(.n)');
  if (lab && lab.offsetWidth) nc.style.setProperty('--rl', `${lab.offsetLeft + lab.offsetWidth + 2}px`);
  setTitle();
  $('#nav3').innerHTML = `
    <a href="${DEPOSIT_URL}">${icon('addfunds')}<span>Add funds</span><span class="n">${usd(S.me.balance_usd)}</span></a>`;
  $('#nav2').innerHTML = `
    <a href="#/aliases" ${h.startsWith('#/aliases') ? 'aria-current="page"' : ''}>${icon('at')}<span>Aliases</span><span class="n">${ofLim(S.me.alias_count, S.me.alias_limit, 'aliases')}</span></a>
    <a href="#/settings" ${h.startsWith('#/settings') ? 'aria-current="page"' : ''}>${icon('gear')}<span>Settings</span></a>`;
  const dm = document.querySelector('.demo-mark'); if (dm) document.body.append(dm);
  $('#me').innerHTML = `
    <div class="acct">
    ${S.me.plan === 'free' ? `<a class="pill light sm gopro" href="${goUrl()}">Go premium</a>` : ''}
    <button class="me-a" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="memenu" title="${esc(S.me.address)}">${avatar({ addr: S.me.address }, ' me-av')}<span>${esc(S.me.address)}</span><svg class="i chev-d" viewBox="0 0 20 20" aria-hidden="true"><path d="M6 8l4 4 4-4"/></svg></button>
    <div class="memenu acard" id="memenu" role="menu" hidden>${acctCard()}</div>
    </div>
    <span class="me-p">${PLAN[S.me.plan]}</span>
    ${meter()}
`;
  const acct = $('#me .acct'); if (dm && acct && !phone()) { acct.prepend(dm); dm.classList.add('inbar'); }
  const w = `${icon('write')}<span>Write</span>`;
  $('.write').innerHTML = w; $('.fab').innerHTML = w;
  $$('[data-act="compose"]').forEach(b => { b.disabled = pend; b.title = pend ? 'Opens when your mailbox is ready' : 'Write (c)'; });
  $('.rail-x').innerHTML = icon('close');
  const f = !S.q && S.folders.find(x => x.id === S.folder), c = list.querySelector('.lh .cnt.fc');
  if (c) c.textContent = f && f.unread ? `${f.unread} unread` : '';
  const pc = list.querySelector('.ptitle h2'); if (pc) pc.innerHTML = `${esc(folderName())}${f && f.unread ? ` <span class="pc">${f.unread}</span>` : ''}`;
  const uf = list.querySelector('.lh .ufilter'), un = f ? f.unread : 0;
  if (uf) { let ub = uf.querySelector('.ub'); if (un && !ub) { ub = document.createElement('span'); ub.className = 'ub'; uf.append(ub); } if (ub) { if (un) ub.textContent = un > 99 ? '99+' : String(un); else ub.remove(); } }
}

let backingT = 0;
const SPLIT_KEY = 'foldoy-listw', SPLIT_MIN = 300;
const split = document.createElement('div');
split.className = 'lsplit'; split.hidden = true; split.tabIndex = 0;
split.setAttribute('role', 'separator'); split.setAttribute('aria-orientation', 'vertical'); split.setAttribute('aria-label', 'Resize the list');
split.title = 'Drag to resize. Double-click to reset.';
app.append(split);
const colW = () => parseFloat(getComputedStyle(app).gridTemplateColumns.split(' ')[1]) || list.offsetWidth;
const splitMax = () => Math.max(SPLIT_MIN + 60, app.offsetWidth - list.offsetLeft - 440);
const setListW = w => {
  if (w) app.style.setProperty('--list-user', `${Math.round(Math.min(splitMax(), Math.max(SPLIT_MIN, w)))}px`);
  else app.style.removeProperty('--list-user');
  requestAnimationFrame(placeSplit);
};
function placeSplit() {
  const on = !phone() && splitPane() && app.dataset.view === 'mail';
  split.hidden = !on;
  if (on) { split.style.left = `${list.offsetLeft + list.offsetWidth}px`; split.setAttribute('aria-valuenow', String(list.offsetWidth)); }
}
{ const w = +recall(SPLIT_KEY); if (w) setListW(w); }
new ResizeObserver(() => placeSplit()).observe(list);
addEventListener('resize', placeSplit);
split.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  e.preventDefault(); split.setPointerCapture(e.pointerId); app.classList.add('splitting');
  const x0 = e.clientX, w0 = colW();
  const move = ev => setListW(w0 + ev.clientX - x0);
  const up = () => { split.removeEventListener('pointermove', move); split.removeEventListener('pointerup', up); split.removeEventListener('pointercancel', up); app.classList.remove('splitting'); remember(SPLIT_KEY, String(Math.round(colW()))); };
  split.addEventListener('pointermove', move); split.addEventListener('pointerup', up); split.addEventListener('pointercancel', up);
});
split.addEventListener('dblclick', () => { setListW(0); try { localStorage.removeItem(SPLIT_KEY); } catch (_) {  } });
split.addEventListener('keydown', e => {
  const d = e.key === 'ArrowLeft' ? -16 : e.key === 'ArrowRight' ? 16 : 0;
  if (e.key === 'Home') { e.preventDefault(); split.dispatchEvent(new Event('dblclick')); return; }
  if (!d) return;
  e.preventDefault(); setListW(colW() + d); requestAnimationFrame(() => remember(SPLIT_KEY, String(Math.round(colW()))));
});
function setView(view, depth) { requestAnimationFrame(placeSplit); if (app.dataset.depth === 'pane' && depth === 'list') { app.classList.add('backing'); clearTimeout(backingT); backingT = setTimeout(() => app.classList.remove('backing'), 320); } app.dataset.view = view; app.dataset.depth = depth; if (view !== 'mail') document.documentElement.removeAttribute('data-boot-view'); }
let routeGen = 0;
const routeSafe = () => route().catch(x => { S.key = ''; toast(`That didn't load: ${x.message}`); });
async function route() {
  routeGen++;
  const h = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  closeRail();
  if (h[0] !== 'compose') { const d = $('#dock'); if (d) d.parentNode.removeChild(d); }
  const toFolder = h[0] === 'f' && (h[1] || 'inbox') !== S.folder && !!list.querySelector('.rows[data-k]');
  if (h[0] !== 'compose' && S.compose && !S.compose.sent && !(await saveDraft(true))) {
    toast(`The draft couldn't be saved: ${S.compose.saveErr.replace(/\.+$/, '')}. It is still open.`);
    history.replaceState(null, '', '#/compose'); return showCompose();
  }
  if (h[0] !== 'compose') {
    const c = S.compose; if (c && !c.sent && c.ref && ['reply', 'replyall', 'forward'].includes(c.mode) && (c.dirty || c.draftId)) (S.parked ||= {})[c.ref] = c;
    S.compose = null; try { sessionStorage.removeItem('foldoy-composing'); } catch (_) {  }
  }
  if (!toFolder) renderRail();
  if (!S.painted) setTimeout(() => { S.painted = true; settle(); }, 1200);
  if (h[0] === 'settings') return showSettings({ instant: true });
  if (h[0] === 'aliases') return showAliases(h[1]);
  if (S.me.mailbox !== 'active') return showPending();
  if (h[0] === 'compose') return showCompose();
  if (h[0] === 'm') { const m = await api.message(h[1]).catch(() => null); location.replace(m ? `#/f/${m.folder}/${m.id}` : '#/f/inbox'); return; }
  if (h[0] === 's') return showMail({ q: h[1] || '', id: h[2] });
  if (h[0] === 'f' && h[1] === 'screener') return showScreener(h[2]);
  return showMail({ folder: h[1] || 'inbox', id: h[2] });
}

async function showMail({ folder = 'inbox', q = '', id, force = false }) {
  const wasPainted = !!S.painted, gen = routeGen;
  const key = q ? `s:${q}` : `f:${folder}:${S.unreadOnly ? 'u' : ''}`;
  if (key !== S.key || !list.querySelector('.rows[data-k]')) {
    if (!key.startsWith(`f:${folder}:`) || q) S.picked.clear();
    S.key = key; S.folder = q ? S.folder : folder; S.q = q;
    S.searchGen = (S.searchGen || 0) + 1;
    if (q) { S.items = []; S.next = null; search(q, S.searchGen); }
    else {
      const pre = folder === 'inbox' && !S.unreadOnly && S.pre?.list; if (S.pre) S.pre.list = null;
      const r = (pre && await pre) || await api.messages({ folder, unread: S.unreadOnly });
      if (S.key !== key) return;
      const raw = S.raw = r.items; S.next = r.next;
      let due = 0;
      const paint = () => { if (S.raw !== raw || S.key !== key) return; S.items = groupThreads(raw); patchRows(); };
      const soon = () => { if (!due) due = setTimeout(() => { due = 0; paint(); }, 180); };
      const filling = mail.open(raw, soon);
      const firstPaint = !!list.querySelector('.sk-rows');
      await Promise.race([filling, new Promise(res => setTimeout(res, firstPaint ? 600 : 90))]);
      if (S.key !== key) { filling.then(() => { clearTimeout(due); due = 0; }); return; }
      S.items = groupThreads(raw);
      filling.then(() => { clearTimeout(due); due = 0; paint(); });
    }
    renderList(); renderRail();
    if (gen !== routeGen) return;
  } else if (!id) markCurrent(null);
  setView('mail', id ? (phone() && app.dataset.depth === 'list' && S.open?.id !== id && !document.documentElement.hasAttribute('data-boot-open') ? 'list' : 'pane') : 'list');
  if (id && app.dataset.depth === 'list') { const want = id; setTimeout(() => { if (S.sel === want && app.dataset.depth === 'list' && location.hash.endsWith('/' + want)) setView('mail', 'pane'); }, 900); }
  const still = !force && id && S.open?.id === id && !S.open.pending && S.sel === id && !phone() && $('.reader', pane) && !$('.reader.fresh', pane);
  if (still) { const f = $('.reader #cform', pane); if (f) f.parentNode.removeChild(f); const bar = $('.reader .replybar', pane); if (bar) bar.hidden = false; markCurrent(id); }
  else if (id) openMessage(id); else { S.sel = null; markCurrent(null); emptyPane(); bootDone(); }
  S.painted = true; settle();
  S.back = q ? `#/s/${encodeURIComponent(q)}` : `#/f/${folder}`;
  if (S.focusList || (document.activeElement === document.body && wasPainted)) {
    S.focusList = false;
    const r = !id && (list.querySelector('.row[aria-current="true"]') || (q ? list.querySelector('.row') : null));
    (r || (id ? null : list.querySelector('.lh h1')))?.focus({ preventScroll: true });
  }
}
const SEARCH_GAP = 100, SEARCH_WORKERS = 4;
function parseQ(q) {
  const ops = {}, words = [];
  for (const t of q.match(/\S+:"[^"]*"|\S+/g) || []) {
    const m = t.match(/^(from|to|subject|has|is|in|before|after|older_than|newer_than):(.+)$/i);
    if (m) (ops[m[1].toLowerCase()] ||= []).push(fold(m[2].replace(/^"|"$/g, ''))); else words.push(t);
  }
  return { ops, text: words.join(' ') };
}
function opsOk(m, ops) {
  const ppl = ps => fold(ps.filter(Boolean).flatMap(p => [p.name, p.addr]).join(' '));
  for (const [k, vs] of Object.entries(ops)) for (const v of vs) {
    if (k === 'from' && !ppl([m.from]).includes(v)) return false;
    if (k === 'to' && !ppl([...(m.to || []), ...(m.cc || [])]).includes(v)) return false;
    if (k === 'subject' && !fold(m.subject || '').includes(v)) return false;
    if (k === 'has' && /^attach/.test(v) && !(Array.isArray(m.attachments) ? m.attachments.length : m.attachments)) return false;
    if (k === 'is' && ((v === 'unread' && !m.unread) || (v === 'read' && m.unread) || (/^star/.test(v) && !m.flagged))) return false;
    if (k === 'in') { const f = S.folders.find(x => fold(x.name) === v || x.role === v); if (f && m.folder !== f.id && m.folder !== f.role) return false; }
    if (k === 'before' || k === 'after') { const d = Date.parse(v.replace(/\//g, '-')); if (d && (k === 'before' ? Date.parse(m.date) >= d : Date.parse(m.date) < d + 864e5)) return false; }
  }
  return true;
}
async function search(q0, gen) {
  const q = q0, live = () => gen === S.searchGen && S.q === q;
  const P = parseQ(q0), qt = P.text, keep = m => opsOk(m, P.ops);
  if (idx.complete()) S.searching = { q, quiet: true };
  const ix0 = idx.running && qt ? await idx.query(qt) : null;
  const ix = ix0 ? { ...ix0, rows: ix0.rows.filter(keep) } : null;
  if (!live()) return;
  if (ix && idx.complete() && !Object.keys(P.ops).length) { S.searching = null; S.items = ix.rows; S.next = ix.found > ix.rows.length ? { at: ix.rows.length, total: ix.found } : null; return paintSearch(null); }
  const skip = ix ? await idx.indexed() : null;
  const terms = fold(qt).split(/\s+/).filter(Boolean), match = t => terms.every(x => t.includes(x));
  const head = m => fold([m.subject, m.preview, ...[m.from, ...(m.to || [])].flatMap(p => (p ? [p.name, p.addr] : []))].join('\n'));
  const found = new Map((ix?.rows || []).map(m => [m.id, m])), queue = [], st = S.searching = { q, done: 0, listed: 0 };
  if (found.size) paintSearch(found);
  let due = 0, listing = true, fresh = false;
  const paint = () => {
    if (due) return;
    due = setTimeout(() => {
      due = 0; if (!live()) return;
      if (fresh) { fresh = false; paintSearch(found); return; }
      const p = list.querySelector('[data-searching]'); if (p) p.textContent = searchingText(st);
    }, Math.min(2000, 200 + found.size * 3));
  };
  const add = m => { if (!found.has(m.id) && keep(m)) { found.set(m.id, m); fresh = true; paint(); } };
  let server = null;
  const ask = () => (server ||= (async () => {
    let cursor;
    for (let i = 0; i < 20 && live() && qt; i++) {
      const r = await api.messages({ q: qt, folder: 'all', cursor }).catch(() => null); if (!r) return;
      await mail.open(r.items); r.items.forEach(add);
      if (!(cursor = r.next)) return;
    }
  })());
  let next = 0;
  const slot = async () => { const now = Date.now(), at = Math.max(now, next); next = at + SEARCH_GAP; if (at > now) await new Promise(r => setTimeout(r, at - now)); };
  const worker = async () => {
    while (live()) {
      const m = queue.shift();
      if (!m) { if (!listing) return; await new Promise(r => setTimeout(r, 60)); continue; }
      if (mail.textOf(m.id) == null) await slot();
      if (!live()) return;
      const t = await mail.fetchText(m).catch(() => null);
      st.done++; if (t != null && match(t)) add(m); else paint();
    }
  };
  const workers = Array.from({ length: SEARCH_WORKERS }, worker);
  let cursor;
  do {
    const r = await api.messages({ folder: 'all', cursor }).catch(() => null); if (!r || !live()) break;
    await mail.prime(r.items);
    for (const m of r.items) {
      st.listed++;
      if (!qt) { st.done++; add(m); continue; }
      if (!keep(m)) { st.done++; continue; }
      if (skip?.has(m.id)) { st.done++; continue; }
      const t = mail.textOf(m.id);
      if (t != null) { st.done++; if (match(t)) add(m); continue; }
      if (!m.encrypted) { st.done++; if (match(head(m))) add(m); ask(); continue; }
      if (match(m.opened ? head(m) : fold([m.from, ...(m.to || [])].flatMap(p => (p ? [p.name, p.addr] : [])).join('\n')))) add(m);
      queue.push(m);
    }
    paint();
    cursor = r.next;
  } while (cursor && live());
  listing = false;
  await Promise.all([...workers, server]);
  if (!live()) return;
  S.searching = null; clearTimeout(due); due = 0; paintSearch(found);
}
function paintSearch(found) {
  if (found) { S.items = [...found.values()].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)); S.next = null; }
  const rows = list.querySelector('.rows[data-k]');
  if (!rows || rows.dataset.k !== S.key || S.picked.size) return renderList();
  const had = document.activeElement?.closest?.('.row')?.dataset.id;
  rows.innerHTML = rowsInner();
  const c = list.querySelector('.lh .cnt.sc'); if (c) { c.textContent = foundText(); c.classList.toggle('busy', searchBusy() && !S.items.length); }
  markCurrent(S.sel);
  if (had) list.querySelector(`.row[data-id="${had}"]`)?.focus({ preventScroll: true });
  if (S.focusList && !S.searching) { S.focusList = false; list.querySelector('.row')?.focus({ preventScroll: true }); }
}
async function refreshList() {
  if (S.refreshing) return;
  S.refreshing = true; $$('[data-act="refresh"]').forEach(b => b.setAttribute('aria-busy', 'true'));
  const folder = S.folder, started = Date.now();
  try {
    const [, r] = await Promise.all([refreshRail(), api.messages({ folder, unread: S.unreadOnly })]);
    await mail.open(r.items);
    if (S.folder === folder && !S.q && !S.picked.size) { S.raw = r.items; S.items = groupThreads(S.raw); S.next = r.next; patchRows(); }
  } catch (x) { toast(x.message); }
  const t = Date.now() - started; await new Promise(res => setTimeout(res, Math.ceil(Math.max(t, 1) / 700) * 700 - t));
  S.refreshing = false; $$('[data-act="refresh"]').forEach(b => b.removeAttribute('aria-busy'));
}
function groupThreads(items) {
  if (!S.me.threads || S.q || ['drafts', 'snoozed'].includes(S.folder)) return items;
  const by = new Map();
  for (const m of items) {
    const k = m.thread_id || m.id, g = by.get(k);
    if (!g) by.set(k, { ...m, group: [m.id], members: [m] });
    else { g.group.push(m.id); g.members.push(m); g.unread ||= m.unread; g.flagged ||= m.flagged; }
  }
  return [...by.values()];
}
const expand = id => S.items.find(x => x.id === id)?.group || [id];
const mine = a => a === S.me.address || a === S.me.primary_address || S.aliases.some(x => x.address === a);
function threadNames(m) {
  const seen = [], out = S.folder === 'sent';
  for (const x of m.members.slice().reverse()) for (const p of out ? x.to : [x.from]) if (p?.addr && !seen.some(y => y.addr === p.addr)) seen.push(p);
  return seen.map(p => (mine(p.addr) ? 'me' : (p.name || p.addr).split(/[\s@]/)[0])).join(', ');
}
const PLACE_NAMES = { screener: 'Screener', snoozed: 'Snoozed', scheduled: 'Scheduled', starred: 'Starred', all: 'All mail' };
function setTitle() {
  const n = (S.folders.find(f => f.role === 'inbox') || {}).unread || 0;
  const h = (location.hash || '#/f/inbox').replace(/^#\/?/, '').split('/');
  let id = ''; try { id = decodeURIComponent(h[1] || 'inbox'); } catch (_) { id = 'inbox'; }
  const place = h[0] === 's' ? 'Search' : h[0] === 'settings' ? 'Settings' : h[0] === 'aliases' ? 'Aliases' : h[0] === 'admin' ? 'Admin'
    : h[0] === 'compose' ? 'New message' : (S.folders.find(f => f.id === id) || { name: PLACE_NAMES[id] || 'Inbox' }).name;
  const t = `${n ? `(${n}) ` : ''}${place} · foldoy`;
  if (document.title !== t) document.title = t;
}
addEventListener('hashchange', setTitle);
addEventListener('foldoy-moved', () => railSoon());
let lookedAt = 0;
const lookAgain = () => { if (S.out) { backIn().catch(() => {}); return; } if (Date.now() - lookedAt < 5000 || !S.me || S.me.mailbox !== 'active' || !S.folders.length) return; lookedAt = Date.now(); checkNew(); };
addEventListener('focus', lookAgain);
addEventListener('pageshow', e => { if (e.persisted) lookAgain(); });
function folderName() { return S.q ? 'Search' : (S.folders.find(f => f.id === S.folder) || { name: PLACE_NAMES[S.folder] || 'Inbox' }).name; }
const ltotText = () => S.items.length ? `1-${S.items.length} of ${S.next?.total || (S.next ? `${S.items.length}+` : S.items.length)}` : '';
function chipsHtml(f) {
  if (S.q) return '';
  const ordered = S.folders.filter(x => x.role !== 'admin' && x.role !== 'all').sort((a, b) => (RAIL_ORDER.indexOf(a.role) + 1 || 99) - (RAIL_ORDER.indexOf(b.role) + 1 || 99));
  const uf = (S.items.length || S.unreadOnly) && !['drafts', 'sent', 'scheduled'].includes(S.folder)
    ? `<button class="fchip uf" type="button" data-act="unreadonly" aria-pressed="${S.unreadOnly}">Unread</button>` : '';
  return `<nav class="fchips" aria-label="Folders">${uf}${ordered.map(x => {
    const n = COUNTED.includes(x.role) ? x.total : x.role === 'sent' ? 0 : x.unread;
    return `<a class="fchip" href="#/f/${x.id}"${x.id === S.folder ? ' aria-current="page"' : ''}>${esc(x.name)}${n ? `<span class="fn">${n > 99 ? '99+' : n}</span>` : ''}</a>`;
  }).join('')}</nav>`;
}
function bigTitle(f) {
  if (S.q) return '';
  return `<div class="ptitle"><h2>${esc(folderName())}${f && f.unread ? ` <span class="pc">${f.unread}</span>` : ''}</h2>
    ${S.me.plan === 'free' && S.me.plans_open ? `<a class="pupg" href="${PLANS_URL}">Upgrade</a>` : ''}
    <button class="iconbtn refresh" type="button" data-act="refresh" aria-label="Check for new mail"${S.refreshing ? ' aria-busy="true"' : ''}>${icon('refresh')}</button>
    <button class="me-b" type="button" aria-haspopup="dialog" aria-expanded="false" aria-label="Your account">${avatar({ addr: S.me.address, name: S.me.display })}</button></div>`;
}
function renderList() {
  const first = !!list.querySelector('.sk-rows');
  const f = S.folders.find(x => x.id === S.folder);
  const locked = S.me.key?.own && !pgp.ownLoaded() && S.items.some(m => m.locked);
  const ctl = !S.q && (S.items.length || S.unreadOnly);
  const q0 = $('#q'), typing = q0 && document.activeElement === q0 ? { v: q0.value, a: q0.selectionStart, b: q0.selectionEnd } : null;
  if (!S.q && !typing) list.classList.remove('sopen');
  list.innerHTML = `
    ${S.picked.size ? listBar() : `<div class="lh mh">
      <button class="menu-btn" type="button" data-act="rail" aria-label="Folders and settings">${icon('menu')}</button>
      ${ctl ? `<button class="pickall" type="button" data-act="pickall" aria-pressed="false" title="Select all" aria-label="Select all">${icon('squarecheck')}</button>` : ''}
      <h1 tabindex="-1">${esc(folderName())}</h1>
      ${!S.q ? `<span class="cnt fc">${f && f.unread ? `${f.unread} unread` : ''}</span>` : ''}
      ${S.q ? `<span class="cnt sc${searchBusy() && !S.items.length ? ' busy' : ''}" aria-live="polite">${esc(foundText())}</span>` : ''}
      ${!S.q ? `<button class="iconbtn refresh" type="button" data-act="refresh" title="Check for new mail" aria-label="Check for new mail"${S.refreshing ? ' aria-busy="true"' : ''}>${icon('refresh')}</button>` : ''}
      ${ctl && !phone() ? `<button class="iconbtn panemode" type="button" data-act="panemode" aria-label="${splitPane() ? 'Open mail over the list' : 'Open mail beside the list'}" aria-pressed="${splitPane()}"><svg class="i" viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true"><rect x="3" y="4" width="14" height="12" rx="2" fill="none"/>${splitPane() ? '<path d="M9 4v12"/>' : '<path d="M3 8h14"/>'}</svg></button>` : ''}
      ${ctl && !['drafts', 'sent', 'scheduled'].includes(S.folder) ? `<span class="sp"></span><button class="ufilter" type="button" data-act="unreadonly" aria-pressed="${S.unreadOnly}">Unread${f && f.unread ? `<span class="ub">${f.unread > 99 ? '99+' : f.unread}</span>` : ''}</button>` : ''}
      ${look() && ctl ? `<span class="ltot">${ltotText()}</span>` : ''}
      <button class="iconbtn sbtn" type="button" data-act="opensearch" aria-label="Search mail">${icon('search')}</button>
    </div>`}
    <form class="field search" role="search" id="searchf">
      <button class="menu-btn s-menu" type="button" data-act="rail" aria-label="Folders and settings">${icon('menu')}</button>
      ${icon('search')}
      <input type="search" id="q" placeholder="Search mail" aria-label="Search mail" value="${esc(S.q)}" autocomplete="off" enterkeyhint="search">
      ${S.q ? `<button class="clear" type="button" data-act="clear" aria-label="Clear search">${icon('close')}</button>` : '<kbd aria-hidden="true">/</kbd>'}
      <button class="me-b" type="button" aria-haspopup="dialog" aria-expanded="false" aria-label="Your account" title="${esc(S.me.address)}">${avatar({ addr: S.me.address, name: S.me.display })}</button>
    </form>
    ${chipsHtml(f)}
    ${locked ? `<div class="lockbar"><span>${icon('key')}Your own key isn't loaded</span><button class="pill soft sm" type="button" data-act="unlock">Load</button></div>` : ''}
    <div class="rows" data-k="${esc(S.key)}" role="list" ${S.picked.size ? 'data-picking="1"' : ''}>${S.q ? '' : bigTitle(f) + rcNoticeHtml()}${rowsInner()}</div>`;
  $('#searchf').addEventListener('submit', e => {
    e.preventDefault(); const v = $('#q').value.trim(), h = v ? `#/s/${encodeURIComponent(v)}` : '#/f/inbox';
    if (h === location.hash && S.q === v) { list.querySelector('.row')?.focus({ preventScroll: true }); return; }
    S.focusList = true; location.hash = h;
  });
  $('#q').addEventListener('input', e => { qSuggest(); if (!idx.complete()) return; clearTimeout(S.typeT); S.typeT = setTimeout(() => typed(e.target.value), 90); });
  $('#q').addEventListener('focus', qSuggest);
  $('#q').addEventListener('blur', e => { if (!e.relatedTarget?.closest?.('.qsug')) qSuggestOff(); if (!e.target.value && !S.q) list.classList.remove('sopen'); });
  $('#q').addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); qSuggestOff(); $('#q').value = ''; $('#q').blur(); if (S.q) location.hash = '#/f/inbox'; } if (e.key === 'ArrowDown') { e.preventDefault(); $('.row')?.focus(); } });
  if (typing) { const q = $('#q'); q.value = typing.v; q.focus({ preventScroll: true }); try { q.setSelectionRange(typing.a, typing.b); } catch (_) {  } }
  if (first) { const r = list.querySelector('.rows[data-k]'); r?.classList.add('reveal'); setTimeout(() => r?.classList.remove('reveal'), 900); }
  watchFab(); pullToRefresh();
  markCurrent(S.sel);
}
const PULL = 64;
function pullToRefresh() {
  const rows = list.querySelector('.rows[data-k]');
  if (!rows || rows.__ptr) return;
  rows.__ptr = true;
  let y0 = null, d = 0, rot = 0;
  const ring = () => list.querySelector('.ptr') || list.appendChild(Object.assign(document.createElement('div'), { className: 'ptr', innerHTML: icon('refresh') }));
  const paint = anim => {
    const r = ring();
    rows.style.transition = r.style.transition = anim ? 'transform .28s cubic-bezier(.2, .8, .2, 1), opacity .2s' : 'none';
    rows.style.transform = d ? `translateY(${d}px)` : '';
    if (!anim) rot = Math.round(d * 4);
    r.style.transform = `translateY(${Math.round(d / 2)}px) rotate(${rot}deg)`;
    r.style.opacity = String(Math.min(1, d / (PULL * .6)));
    r.classList.toggle('ready', d >= PULL);
  };
  rows.addEventListener('touchstart', e => {
    y0 = phone() && rows.scrollTop <= 0 && e.touches.length === 1 && !S.q && !S.picked.size && !S.refreshing ? e.touches[0].clientY : null; d = 0;
  }, { passive: true });
  rows.addEventListener('touchmove', e => {
    if (y0 == null) return;
    const dy = e.touches[0].clientY - y0;
    d = dy > 0 && rows.scrollTop <= 0 ? Math.min(PULL * 1.7, dy * .5) : 0;
    paint(false);
  }, { passive: true });
  const end = async () => {
    if (y0 == null) return;
    y0 = null;
    if (d >= PULL) {
      d = PULL; paint(true); ring().classList.add('spin');
      await refreshList().catch(() => {});
      ring().classList.remove('spin');
    }
    d = 0; paint(true);
  };
  rows.addEventListener('touchend', end); rows.addEventListener('touchcancel', end);
}
function patchRows() {
  const rows = list.querySelector('.rows[data-k]');
  if (!rows || rows.dataset.k !== S.key || S.picked.size || S.q || !S.items.length) { renderList(); return; }
  const have = [...rows.querySelectorAll(':scope > .row')], old = have.map(r => r.dataset.id), ids = S.items.map(m => m.id);
  const k = ids.length - old.length;
  if (!have.length || k < 0 || ids.slice(k).join('\n') !== old.join('\n') || !!rows.querySelector(':scope > .more-btn') !== !!S.next) { renderList(); return; }
  const base = '#/f/' + S.folder, focused = document.activeElement?.closest?.('.row')?.dataset.id;
  const make = h => { const t = document.createElement('template'); t.innerHTML = h.trim(); return t.content.firstElementChild; };
  S.items.forEach((m, i) => {
    const was = rowMem.get(m.id), h = rowHtml(m, base);
    rowMem.set(m.id, h);
    if (i < k) { const el = make(h); el.classList.add('arrive'); el.addEventListener('animationend', e => { if (e.target === el && e.animationName === 'row-glow') el.classList.remove('arrive'); }); rows.insertBefore(el, have[0]); return; }
    if (h === was) return;
    const el = make(h), r = have[i - k];
    if (r.querySelector('.skb') && !el.querySelector('.skb')) el.classList.add('lit');
    r.replaceWith(el);
  });
  markCurrent(S.sel);
  if (focused) list.querySelector(`.row[data-id="${focused}"]`)?.focus({ preventScroll: true });
}
function watchFab() {
  const rows = list.querySelector('.rows[data-k]'), fab = $('.fab');
  if (!rows || !fab || rows.__fab) return;
  rows.__fab = true; let y = rows.scrollTop;
  rows.addEventListener('scroll', () => {
    const t = rows.scrollTop, d = t - y;
    if (Math.abs(d) < 6) return;
    fab.classList.toggle('mini', d > 0 && t > 24); y = t;
  }, { passive: true });
  fab.classList.remove('mini');
}
const searchingText = st => {
  const x = idx.running && !idx.complete() && idx.state?.listed ? idx.state : null;
  return x ? `Indexed ${x.indexed.toLocaleString('en-GB')} of ${x.total.toLocaleString('en-GB')}` : st.listed ? `Searching: ${st.done.toLocaleString('en-GB')} of ${st.listed.toLocaleString('en-GB')} messages` : 'Searching';
};
const searchBusy = () => !!(S.q && S.searching?.q === S.q);
const foundText = () => (searchBusy() && !S.items.length ? `Searching for “${S.q}”` : `${(S.next?.total ?? S.items.length).toLocaleString('en-GB')} found for “${S.q}”`);
const skRows = n => Array.from({ length: n }, (_, i) => `<div class="row skr" aria-hidden="true"><span class="av"></span><span class="r1"><i style="width:${[34, 46, 28, 40, 52, 31][i % 6]}%"></i></span><span class="r2"><i style="width:${[64, 58, 70, 52, 66, 60][i % 6]}%"></i></span><span class="pv"><i style="width:${[90, 82, 76, 88, 70, 84][i % 6]}%"></i></span></div>`).join('');
idx.on(() => {
  const p = S.q && list.querySelector('[data-searching]'); if (!p) return;
  const busy = S.searching?.q === S.q && !S.searching.quiet ? S.searching : null;
  if (!busy && idx.complete()) p.remove(); else p.textContent = searchingText(busy || { done: 0, listed: 0 });
});
async function typed(v) {
  v = v.trim();
  if (!v || v === S.q || !idx.complete()) return;
  const h = `#/s/${encodeURIComponent(v)}`;
  if (!S.q) {
    history.pushState(null, '', h);
    await showMail({ q: v });
    const i = $('#q'); if (i && document.activeElement !== i) { i.focus({ preventScroll: true }); i.setSelectionRange(i.value.length, i.value.length); }
    return;
  }
  history.replaceState(null, '', h);
  S.q = v; S.key = `s:${v}`; S.back = h; S.searchGen = (S.searchGen || 0) + 1;
  const rows = list.querySelector('.rows[data-k]'); if (rows) rows.dataset.k = S.key;
  search(v, S.searchGen);
}
function rowsInner() {
  const searching = S.q && S.searching?.q === S.q ? S.searching : null;
  const building = !searching && S.q && idx.running && !idx.complete() && idx.state?.listed;
  return `${searching && !S.items.length ? skRows(6) : rowsHtml(S.items, S.q ? '#/s/' + encodeURIComponent(S.q) : '#/f/' + S.folder)}${
    (searching && !searching.quiet) || building ? `<p class="searching" data-searching>${searchingText(searching || { done: 0, listed: 0 })}</p>` : ''}${
    searching ? ''
    : S.items.length ? '' : (!S.q && S.folder === 'inbox') ? (phone() ? emptyHtml() : '') : `<div class="emptyf"><img class="art" src="/static/mail/shared/art/address-blank.svg" alt=""><p>${S.q ? `Nothing matches <b>${esc(S.q)}</b>.` : `Nothing in ${esc(folderName())}.`}</p></div>`}
    ${S.next ? '<button class="pill soft sm more-btn" type="button" data-act="more">Show more</button>' : ''}`;
}
function listBar() {
  const n = S.picked.size, all = n && n === S.items.length;
  if (n) {
    const inTrash = S.folder === 'trash', inJunk = S.folder === 'junk';
    return `<div class="lh lbar on" role="toolbar" aria-label="${n} selected">
      <button class="pickall" type="button" data-act="pickall" aria-pressed="${all ? 'true' : 'mixed'}" title="${all ? 'Select none' : 'Select all'}" aria-label="${all ? 'Select none' : 'Select all'}">${icon('squarecheck')}</button>
      <span class="lcount">${n}<span class="lsel"> selected</span></span><span class="sp"></span>
      ${S.folder !== 'archive' && S.folders.some(f => f.role === 'archive') ? `<button class="iconbtn" type="button" data-bulk="archive" title="Archive" aria-label="Archive">${icon('archive')}</button>` : ''}
      ${S.items.some(x => S.picked.has(x.id) && x.unread)
        ? `<button class="iconbtn" type="button" data-bulk="read" title="Mark read" aria-label="Mark read">${icon('mailopen')}</button>`
        : `<button class="iconbtn" type="button" data-bulk="unread" title="Mark unread" aria-label="Mark unread">${icon('mailclosed')}</button>`}
      ${S.items.some(x => S.picked.has(x.id)) && S.items.every(x => !S.picked.has(x.id) || x.flagged)
        ? `<button class="iconbtn" type="button" data-bulk="unstar" title="Remove star" aria-label="Remove star" aria-pressed="true">${icon('star')}</button>`
        : `<button class="iconbtn" type="button" data-bulk="star" title="Star" aria-label="Star">${icon('star')}</button>`}
      <button class="iconbtn" type="button" data-bulk="move" title="Move to" aria-label="Move to" aria-haspopup="menu">${icon('folder')}</button>
      ${inJunk ? '' : `<button class="iconbtn" type="button" data-bulk="junk" title="Move to junk" aria-label="Move to junk">${icon('junk')}</button>`}
      <button class="iconbtn" type="button" data-bulk="${inTrash ? 'delete' : 'trash'}" title="${inTrash ? 'Delete for good' : 'Delete'}" aria-label="${inTrash ? 'Delete for good' : 'Delete'}">${icon('trash')}</button>
      <button class="iconbtn" type="button" data-act="unpick" title="Clear selection" aria-label="Clear selection">${icon('close')}</button>
    </div>`;
  }
  return '';
}
async function bulk(kind) {
  if (kind === 'archive' && S.folder === 'archive') return;
  if (kind === 'move') return moveMenu(true);
  const ids = [...S.picked].flatMap(expand);
  if (!ids.length) return;
  const to = kind.startsWith('move:') ? kind.slice(5) : null;
  const patch = to ? { folder: to } : { archive: { folder: 'archive' }, trash: { folder: 'trash' }, junk: { folder: 'junk' }, read: { unread: false }, unread: { unread: true }, star: { flagged: true }, unstar: { flagged: false } }[kind];
  const picked = new Set(S.picked), gone = kind === 'delete' || 'folder' in patch, all = new Set(ids);
  const rows = S.items.filter(x => picked.has(x.id));
  const msgs = [...new Map(rows.flatMap(x => [x, ...(x.members || [])]).map(y => [y.id, y])).values()];
  const unread = msgs.filter(x => x.unread).length;
  const from = S.folder, was = new Map(ids.map(id => { const x = S.items.find(y => y.id === id) || rows.find(r => (r.group || []).includes(id)) || {}; return [id, { unread: !!x.unread, flagged: !!x.flagged }]; }));
  const beforeItems = S.items.slice(), beforeRaw = S.raw ? S.raw.slice() : null, beforeKey = S.key;
  const undo = kind === 'delete' || (kind === 'trash' && from === 'trash') || S.q ? null : async () => {
    if (S.key === beforeKey && app.dataset.view === 'mail') {
      if (gone) { S.items = beforeItems; if (beforeRaw) S.raw = beforeRaw; if (!S.q) railSoon(S.folder, unread); }
      else {
        for (const x of rows) for (const y of [x, ...(x.members || [])]) { const w = was.get(y.id) || was.get(x.id); if (w) Object.assign(y, 'unread' in patch ? { unread: w.unread } : { flagged: w.flagged }); }
        if (!S.q && 'unread' in patch) railSoon(S.folder, patch.unread ? unread - msgs.length : unread);
      }
      renderList();
      if (gone) for (const x of rows) list.querySelector(`.rows .row[data-id="${CSS.escape(x.id)}"]`)?.classList.add('back-in');
      const busy = document.activeElement?.matches?.('input, textarea, select, [contenteditable="true"]');
      if (!S.sel && !busy) list.querySelector(`.row[data-id="${CSS.escape(rows[0]?.id || '')}"]`)?.focus({ preventScroll: false });
    }
    try {
      if (gone) await Promise.all(ids.map(id => inOrder(id, () => api.update(id, { folder: from }))));
      else await Promise.all(ids.map(id => inOrder(id, () => api.update(id, 'unread' in patch ? { unread: was.get(id).unread } : { flagged: was.get(id).flagged }))));
      railSoon();
      if (S.key !== beforeKey || app.dataset.view !== 'mail') { S.key = ''; if (app.dataset.view === 'mail') showMail({ folder: S.folder, q: S.q, id: S.sel || undefined }); }
    } catch (x) { toast(`That didn't work: ${x.message}`); S.key = ''; await railQuiet(); if (app.dataset.view === 'mail') showMail({ folder: S.folder, id: S.sel || undefined }); }
  };
  if (gone) {
    S.items = S.items.filter(x => !picked.has(x.id)); if (S.raw) S.raw = S.raw.filter(x => !all.has(x.id));
    if (!S.q) railSoon(S.folder, -unread);
  } else {
    for (const x of rows) for (const y of [x, ...(x.members || [])]) Object.assign(y, patch);
    if (!S.q && 'unread' in patch) railSoon(S.folder, patch.unread ? msgs.length - unread : -unread);
    if (S.open && all.has(S.open.id)) { Object.assign(S.open, patch); $$('[data-act="flag"]', pane).forEach(b => b.setAttribute('aria-pressed', String(!!S.open.flagged))); }
  }
  S.picked.clear(); renderList();
  toast((to ? `Moved to ${folderLabel(to)}` : { archive: 'Archived', trash: 'Moved to trash', junk: 'Moved to junk', read: 'Marked read', unread: 'Marked unread', star: 'Starred', unstar: 'Star removed', delete: 'Deleted' }[kind])
    + ((rows.length || ids.length) > 1 ? ` (${rows.length || ids.length})` : ''), undo ? { label: 'Undo', run: undo } : undefined, undo ? 6000 : undefined);
  if (gone && S.sel && all.has(S.sel)) location.hash = S.back;
  try { await Promise.all(ids.map(id => inOrder(id, () => (kind === 'delete' ? api.remove(id) : api.update(id, patch))))); railSoon(); if (gone) repage(); }
  catch (x) {
    toast(`That didn't work: ${x.message}`); S.key = ''; await railQuiet();
    return showMail({ folder: S.folder, q: S.q, id: S.sel && !all.has(S.sel) ? S.sel : undefined });
  }
}
const skw = (id, a, b) => { let h = 7; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return a + (h % (b - a)); };
const rowMem = new Map();
function hl(text) {
  const t = esc(text); if (!S.q) return t;
  const words = S.q.split(/\s+/).map(w => w.replace(/^(from|to|subject):/i, '')).filter(w => w && !/^(has|is|in|before|after):/i.test(w) && w.length > 1).map(w => esc(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!words.length) return t;
  return t.replace(new RegExp(`(&[#\\w]+;)|(${words.join('|')})`, 'gi'), (x, ent, w) => ent || `<mark>${w}</mark>`);
}
function rowsHtml(items, base) { return items.map(m => { const h = rowHtml(m, base); rowMem.set(m.id, h); return h; }).join(''); }
function rowHtml(m, base) {
  {
    const out = S.folder === 'sent' || S.folder === 'drafts' || S.folder === 'scheduled';
    const n = m.group?.length || 1;
    const who = n > 1 ? threadNames(m) : out ? `To ${m.to.map(nameOf).join(', ')}` : nameOf(m.from);
    const wait = m.encrypted && !m.opened && !m.locked && !m.subject;
    const pv = m.locked ? 'Encrypted. Load your key to read it.' : m.preview;
    const on = S.picked.has(m.id);
    return `<a class="row ${m.unread ? 'unread' : ''} ${on ? 'picked' : ''}" role="listitem" href="${esc(base)}/${esc(m.id)}" data-id="${esc(m.id)}">
      <span class="pick" data-pick="${m.id}" role="checkbox" aria-checked="${on}" aria-label="Select" title="Select">${avatar(out ? m.to[0] || m.from : m.from)}<span class="box">${icon('squarecheck')}</span></span>
      <span class="r1"><span class="from">${hl(who)}</span>${n > 1 ? `<span class="tc">${n}</span>` : ''}${m.snoozed_until ? `<time class="snzt" datetime="${m.snoozed_until}">${icon('clock')}${snzWhen(m.snoozed_until)}</time>` : m.send_at ? `<time class="snzt" datetime="${m.send_at}">${icon('sent')}${snzWhen(m.send_at)}</time>` : `<time datetime="${m.date}">${when(m.date)}</time>`}</span>
      <span class="r2">${m.encrypted ? `<span class="rlock" data-tip="End-to-end encrypted" aria-label="Encrypted" role="img">${icon('lock')}</span>` : ''}${wait ? `<span class="subj"><i class="skb" style="width:${skw(m.id, 42, 78)}%"></i></span><span class="pv"><i class="skb" style="width:${skw(m.id + 'p', 62, 94)}%"></i></span>` : `<span class="subj">${m.locked ? 'Encrypted message' : m.subject ? hl(m.subject) : '(no subject)'}</span>`}${wait ? '' : pv ? `<span class="pv">${m.via_alias ? `<span class="via">${esc(m.via_alias.split('@')[0])}</span>` : ''}${hl(pv)}</span>` : `<span class="pv">${m.via_alias && !m.encrypted ? `<span class="via">${esc(m.via_alias.split('@')[0])}</span>` : '&nbsp;'}</span>`}<span class="marks">${m.attachments ? `<span class="ac" title="${m.attachments} attachments">${icon('clip')}</span>` : ''}<span class="star${m.flagged ? ' fl' : ''}" data-star="${m.id}" role="button" aria-pressed="${!!m.flagged}" aria-label="${m.flagged ? 'Starred' : 'Star'}" title="${m.flagged ? 'Starred' : 'Star'}">${icon('star')}</span></span></span>${rowActs(m)}
    </a>`;
  }
}
function rowActs(m) {
  if (S.q && !S.folder) return '';
  const b = (k, label, ic) => `<span class="ract" role="button" data-ract="${k}" data-id="${m.id}" aria-label="${label}">${icon(ic)}</span>`;
  return `<span class="hacts">${S.folder !== 'archive' && S.folders.some(f => f.role === 'archive') ? b('archive', 'Archive (e)', 'archive') : ''}${
    S.folder !== 'trash' ? b('trash', 'Delete (#)', 'trash') : ''}${
    m.unread ? b('read', 'Mark read', 'mailopen') : b('unread', 'Mark unread (u)', 'mailclosed')}${b(m.flagged ? 'unstar' : 'star', m.flagged ? 'Remove star (s)' : 'Star (s)', 'star')}</span>`;
}
list.addEventListener('click', e => {
  const a = e.target.closest('[data-ract]'); if (!a) return;
  e.preventDefault(); e.stopPropagation();
  tipOff();
  if (a.dataset.ract === 'star' || a.dataset.ract === 'unstar') { list.querySelector(`[data-star="${a.dataset.id}"]`)?.click(); return; }
  S.picked = new Set([a.dataset.id]); bulk(a.dataset.ract);
}, true);
list.addEventListener('contextmenu', e => {
  const r = e.target.closest?.('.row[data-id]'); if (!r || phone() || r.classList.contains('skr')) return;
  const m = S.items.find(x => x.id === r.dataset.id); if (!m) return;
  e.preventDefault(); closeFloat(); tipOff();
  S.ctxAt = { x: e.clientX, y: e.clientY };
  const it = (k, label, ic, key = '') => `<button type="button" role="menuitem" data-ctx="${k}"><span>${icon(ic)}${label}</span>${key ? `<kbd>${key}</kbd>` : ''}</button>`;
  const arch = S.folder !== 'archive' && S.folders.some(f => f.role === 'archive'), junk = S.folders.some(f => f.role === 'junk') && S.folder !== 'junk';
  list.insertAdjacentHTML('beforeend', `<div class="snz movemenu ctxmenu" role="menu" aria-label="Message">
    ${it('open', 'Open', 'inbox', 'Enter')}${it('reply', 'Reply', 'reply', 'r')}${it('forward', 'Forward', 'forward', 'f')}
    <span class="msep"></span>
    ${arch ? it('archive', 'Archive', 'archive', 'e') : ''}${it('trash', S.folder === 'trash' ? 'Delete for good' : 'Delete', 'trash', '#')}
    ${m.unread ? it('read', 'Mark read', 'mailopen', 'u') : it('unread', 'Mark unread', 'mailclosed', 'u')}
    ${it(m.flagged ? 'unstar' : 'star', m.flagged ? 'Remove star' : 'Star', 'star', 's')}
    <span class="msep"></span>
    ${it('move', 'Move to…', 'folder', 'v')}${S.folder === 'inbox' ? it('snooze', 'Snooze…', 'clock', 'b') : ''}${junk ? it('junk', 'Move to Junk', 'junk') : ''}
  </div>`);
  const menu = list.querySelector('.ctxmenu'); menu.classList.add('floating');
  const w = menu.offsetWidth, h = menu.offsetHeight;
  menu.style.left = `${Math.min(e.clientX, innerWidth - w - 8)}px`;
  menu.style.top = `${e.clientY + h + 8 > innerHeight ? Math.max(8, e.clientY - h) : e.clientY}px`;
  S.menuFrom = r;
  menu.dataset.id = m.id; menu.querySelector('[data-ctx]')?.focus();
  r.classList.add('ctx');
});
list.addEventListener('click', e => {
  const b = e.target.closest('[data-ctx]'); if (!b) return;
  e.preventDefault(); e.stopPropagation();
  const id = b.closest('.ctxmenu').dataset.id, k = b.dataset.ctx; closeFloat();
  if (k === 'open') { location.hash = list.querySelector(`.row[data-id="${CSS.escape(id)}"]`)?.getAttribute('href') || `#/f/${S.folder}/${id}`; return; }
  if (k === 'reply' || k === 'forward') return openThen(id, k);
  if (k === 'star' || k === 'unstar') { list.querySelector(`[data-star="${id}"]`)?.click(); return; }
  const at = S.ctxAt ? { getBoundingClientRect: () => new DOMRect(S.ctxAt.x, S.ctxAt.y - 6, 0, 0) } : null;
  if (k === 'move') { S.rowAct = id; moveMenu(true, at); return; }
  if (k === 'snooze') { S.rowAct = id; snoozeMenu(at); return; }
  if (k === 'junk') { const j = S.folders.find(f => f.role === 'junk'); if (j) { S.picked = new Set([id]); bulk(`move:${j.id}`); } return; }
  S.picked = new Set([id]); bulk(k);
}, true);
function markCurrent(id) {
  const rows = $$('.row', list);
  rows.forEach(r => r.setAttribute('aria-current', String(r.dataset.id === id)));
  const stop = rows.find(r => r.dataset.id === id) || rows[0];
  rows.forEach(r => { r.tabIndex = r === stop ? 0 : -1; });
}
{
  let sw = null;
  const what = (m, dir) => dir < 0
    ? (['archive', 'trash', 'drafts', 'sent'].includes(S.folder) || !S.folders.some(f => f.role === 'archive')
      ? { k: S.folder === 'trash' ? 'delete' : 'trash', ic: 'trash', label: 'Delete' } : { k: 'archive', ic: 'archive', label: 'Archive' })
    : (m.unread ? { k: 'read', ic: 'mailopen', label: 'Read' } : { k: 'unread', ic: 'mailclosed', label: 'Unread' });
  const reset = (r, under) => { r.style.transition = 'transform .22s var(--ease)'; r.style.transform = ''; setTimeout(() => { r.style.transition = ''; r.classList.remove('swiping'); under?.remove(); }, 230); };
  list.addEventListener('touchstart', e => {
    sw = null;
    const r = e.target.closest?.('.rows .row[data-id]:not(.skr)');
    if (!r || !phone() || S.picked.size || S.q || e.touches.length !== 1 || S.folder === 'scheduled') return;
    sw = { r, id: r.dataset.id, x: e.touches[0].clientX, y: e.touches[0].clientY, dx: 0, on: false, under: null, dir: 0 };
  }, { passive: true });
  list.addEventListener('touchmove', e => {
    if (!sw) return;
    if (S.picked.size || !sw.r.isConnected) { if (sw.on && sw.r.isConnected) reset(sw.r, sw.under); else sw.under?.remove(); sw = null; return; }
    const dx = e.touches[0].clientX - sw.x, dy = e.touches[0].clientY - sw.y;
    if (!sw.on) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { sw = null; return; }
      if (Math.abs(dx) < 12) return;
      sw.on = true; sw.r.classList.add('swiping');
    }
    const m = S.items.find(x => x.id === sw.id); if (!m) { sw = null; return; }
    const dir = dx < 0 ? -1 : 1;
    if (dir !== sw.dir) {
      sw.dir = dir; sw.under?.remove(); const a = what(m, dir);
      const u = document.createElement('div'); u.className = `swipe-under ${dir < 0 ? 'left' : 'right'}`; u.setAttribute('aria-hidden', 'true');
      u.innerHTML = `<span>${icon(a.ic)}${a.label}</span>`;
      u.style.top = `${sw.r.offsetTop}px`; u.style.height = `${sw.r.offsetHeight}px`;
      sw.r.parentNode.insertBefore(u, sw.r); sw.under = u; sw.act = a;
    }
    sw.dx = dx;
    const w = sw.r.offsetWidth, far = Math.abs(dx) > w / 3;
    sw.r.style.transform = `translateX(${dx}px)`;
    sw.under.classList.toggle('go', far);
  }, { passive: true });
  const end = () => {
    if (!sw || !sw.on) { sw = null; return; }
    if (S.picked.size || !sw.r.isConnected) { sw.under?.remove(); sw = null; return; }
    const { r, under, act, id, dx } = sw; sw = null;
    if (Math.abs(dx) <= r.offsetWidth / 3) return reset(r, under);
    if (act.k === 'read' || act.k === 'unread') { reset(r, under); setTimeout(() => { S.picked = new Set([id]); bulk(act.k); }, 240); return; }
    r.style.transition = 'transform .2s var(--ease)'; r.style.transform = `translateX(${dx < 0 ? -r.offsetWidth : r.offsetWidth}px)`;
    setTimeout(() => {
      under?.remove();
      r.style.height = `${r.offsetHeight}px`; r.style.overflow = 'hidden'; void r.offsetHeight;
      r.style.transition = 'height .18s var(--ease), padding .18s var(--ease), margin .18s var(--ease)';
      r.style.height = '0px'; r.style.paddingTop = r.style.paddingBottom = '0px'; r.style.marginTop = r.style.marginBottom = '0px';
      setTimeout(() => { S.picked = new Set([id]); bulk(act.k); }, 190);
    }, 190);
  };
  list.addEventListener('touchend', end, { passive: true });
  list.addEventListener('touchcancel', () => { if (sw?.on) reset(sw.r, sw.under); sw = null; }, { passive: true });
  list.addEventListener('click', e => { if (e.target.closest?.('.row.swiping')) { e.preventDefault(); e.stopPropagation(); } }, true);
}
{
  let held = null, swallow = false;
  const pickOne = id => { if (S.picked.has(id)) S.picked.delete(id); else S.picked.add(id); S.lastPick = id; renderList(); };
  list.addEventListener('touchstart', e => {
    const r = e.target.closest?.('.rows .row[data-id]:not(.skr)'); clearTimeout(held?.t); held = null;
    if (!r || !phone() || e.touches.length !== 1 || e.target.closest('[data-pick],[data-star],button')) return;
    const x = e.touches[0].clientX, y = e.touches[0].clientY, id = r.dataset.id;
    held = { x, y, t: setTimeout(() => { held = null; swallow = true; try { navigator.vibrate?.(8); } catch (_) {  } if (!S.picked.has(id)) pickOne(id); }, 450) };
  }, { passive: true });
  list.addEventListener('touchmove', e => { if (held && Math.hypot(e.touches[0].clientX - held.x, e.touches[0].clientY - held.y) > 10) { clearTimeout(held.t); held = null; } }, { passive: true });
  list.addEventListener('touchend', () => { if (held) { clearTimeout(held.t); held = null; } }, { passive: true });
  list.addEventListener('contextmenu', e => { if (phone() && e.target.closest?.('.rows .row[data-id]')) e.preventDefault(); });
  list.addEventListener('click', e => {
    if (!phone()) return;
    const r = e.target.closest('.rows .row[data-id]:not(.skr)');
    if (swallow) { swallow = false; if (r) { e.preventDefault(); e.stopPropagation(); } return; }
    if (r && S.picked.size && !e.target.closest('[data-pick],[data-star]')) { e.preventDefault(); e.stopPropagation(); pickOne(r.dataset.id); }
  }, true);
}
list.addEventListener('click', e => {
  const p = e.target.closest('[data-pick]');
  if (p) {
    e.preventDefault(); e.stopPropagation();
    const id = p.dataset.pick, ids = S.items.map(m => m.id), a = ids.indexOf(S.lastPick), z = ids.indexOf(id);
    if (e.shiftKey && a >= 0 && z >= 0 && S.picked.has(S.lastPick)) ids.slice(Math.min(a, z), Math.max(a, z) + 1).forEach(x => S.picked.add(x));
    else if (S.picked.has(id)) S.picked.delete(id); else S.picked.add(id);
    S.lastPick = id;
    return renderList();
  }
  const b = e.target.closest('[data-bulk]');
  if (b) { e.preventDefault(); return bulk(b.dataset.bulk); }
  const t = e.target.closest('[data-act="pickall"],[data-act="unpick"],[data-act="unreadonly"]');
  if (!t) return;
  e.preventDefault(); e.stopPropagation();
  if (t.dataset.act === 'unpick') { S.picked.clear(); return renderList(); }
  if (t.dataset.act === 'pickall') {
    if (S.picked.size === S.items.length && S.items.length) S.picked.clear(); else S.items.forEach(m => S.picked.add(m.id));
    return renderList();
  }
  S.unreadOnly = !S.unreadOnly; S.picked.clear(); S.key = '';
  showMail({ folder: S.folder });
}, true);
list.addEventListener('click', async e => {
  const s = e.target.closest('[data-star]'); if (!s) return;
  e.preventDefault(); e.stopPropagation();
  const m = S.items.find(x => x.id === s.dataset.star); if (!m) return;
  const on = !m.flagged, ids = on ? [m.id] : expand(m.id);
  const paint = v => { m.flagged = v; if (!v) m.members?.forEach(x => { x.flagged = false; }); if (S.open?.id === m.id) { S.open.flagged = v; $$('[data-act="flag"]', pane).forEach(b => b.setAttribute('aria-pressed', String(v))); } patchRows(); };
  paint(on);
  try { await Promise.all(ids.map(id => api.update(id, { flagged: on }))); railQuiet(); }
  catch (x) { paint(!on); toast(x.message); }
}, true);
list.addEventListener('focusin', e => { const r = e.target.closest?.('.row'); if (r && list.contains(r)) $$('.row', list).forEach(x => { x.tabIndex = x === r ? 0 : -1; }); });
function openAhead(r) {
  const m = r && list.contains(r) && ((S.raw || []).find(x => x.id === r.dataset.id) || S.items.find(x => x.id === r.dataset.id));
  if (m) mail.ahead(m, { images: S.me.images !== false }).catch(() => {});
}
let hoverT = 0, touchT = 0;
list.addEventListener('touchstart', e => { const r = e.target.closest?.('.row[data-id]'); clearTimeout(touchT); if (r) touchT = setTimeout(() => openAhead(r), 40); }, { passive: true });
list.addEventListener('touchmove', () => clearTimeout(touchT), { passive: true });
const hovers = matchMedia('(hover: hover)');
const railQ = matchMedia('(max-width: 1180px)');
function foldRail() {
  const pref = recall('foldoy-rail'), min = !phone() && (pref ? pref === 'min' : railQ.matches);
  app.classList.toggle('rmin', min); document.documentElement.dataset.rail = min ? 'min' : 'full';
  const b = $('.rail-fold'); if (b) b.setAttribute('aria-label', min ? 'Expand menu' : 'Collapse menu');
}
railQ.addEventListener('change', () => { railOver(false); foldRail(); }); foldRail();
function railOver(on) {
  const d = document.documentElement;
  if (on) d.setAttribute('data-rail-over', ''); else d.removeAttribute('data-rail-over');
  d.dataset.rail = on || !app.classList.contains('rmin') ? 'full' : 'min';
  const b = $('.rail-fold'); if (b) b.setAttribute('aria-label', on ? 'Close menu' : (app.classList.contains('rmin') ? 'Expand menu' : 'Collapse menu'));
}
let eatClick = false;
document.addEventListener('pointerdown', e => { if (document.documentElement.hasAttribute('data-rail-over') && !e.target.closest('.rail')) { railOver(false); eatClick = true; setTimeout(() => { eatClick = false; }, 600); } }, true);
document.addEventListener('click', e => { if (eatClick) { eatClick = false; e.preventDefault(); e.stopImmediatePropagation(); } }, true);
addEventListener('hashchange', () => railOver(false));
const tip = Object.assign(document.createElement('div'), { className: 'tip', role: 'tooltip' }); document.body.append(tip);
let tipEl = null, tipT = 0;
const tipOff = () => { clearTimeout(tipT); tipEl = null; tip.classList.remove('on'); };
let tipQuiet = false;
document.addEventListener('pointerdown', () => { tipQuiet = true; tipOff(); }, true);
document.addEventListener('pointermove', e => {
  if (!tipQuiet || !(e.movementX || e.movementY)) return;
  tipQuiet = false; tipEl = null;
  e.target.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
}, { passive: true });
document.addEventListener('pointerover', e => {
  if (!hovers.matches || tipQuiet) return;
  const el = e.target.closest?.('button, [role="button"], a, summary, [data-tip]');
  if (el === tipEl) return;
  tipOff();
  if (!el || el.disabled) return;
  if (el.title) { el.dataset.tip = el.title; el.removeAttribute('title'); }
  const inNav = el.closest('.nav');
  let text = el.dataset.tip || el.getAttribute('aria-label') || (inNav && app.classList.contains('rmin') ? el.querySelector('span')?.textContent : '');
  if (!text || (inNav && !app.classList.contains('rmin'))) return;
  const said = el.textContent.trim();
  if (said && said.toLowerCase() === text.toLowerCase() && !(inNav && app.classList.contains('rmin'))) return;
  tipEl = el;
  tipT = setTimeout(() => {
    if (tipEl !== el || !el.isConnected) return;
    const m = text.match(/^(.*?) \((.{1,6})\)$/);
    tip.innerHTML = m ? `${esc(m[1])}<kbd>${esc(m[2])}</kbd>` : esc(text);
    const r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    const side = inNav || el.closest('.rail');
    let x = side ? r.right + 8 : r.left + r.width / 2 - w / 2, y = side ? r.top + r.height / 2 - h / 2 : r.bottom + 8;
    if (!side && y + h > innerHeight - 4) y = r.top - h - 8;
    x = Math.max(6, Math.min(x, innerWidth - w - 6));
    tip.style.transform = ''; tip.style.left = `${x}px`; tip.style.top = `${y}px`; tip.classList.add('on');
  }, tip.classList.contains('on') ? 60 : 380);
}, { passive: true });
for (const ev of ['pointerdown', 'keydown', 'scroll', 'blur']) addEventListener(ev, tipOff, { passive: true, capture: true });
list.addEventListener('mouseover', e => { const r = hovers.matches && e.target.closest?.('.row[data-id]'); clearTimeout(hoverT); if (r) hoverT = setTimeout(() => openAhead(r), 70); });
list.addEventListener('mouseout', () => clearTimeout(hoverT));
function emptyPane() {
  if (S.me.mailbox === 'active' && S.folder === 'inbox' && !S.q && !S.items.length) return emptyAccount();
  if (phone() || !S.items.length) { pane.innerHTML = ''; return; }
  const f = S.folders.find(x => x.id === S.folder), total = S.q || !S.next ? S.items.length : f?.total || S.items.length, unread = S.q ? 0 : f?.unread || 0;
  const word = S.me.threads ? (total === 1 ? 'conversation' : 'conversations') : (total === 1 ? 'message' : 'messages');
  pane.innerHTML = `<div class="blank"><div class="glance nosel">
    <span class="g-ic" aria-hidden="true">${icon(S.q ? 'search' : FOLDER_ICON[f?.role] || 'inbox')}</span>
    <h2>${esc(folderName())}</h2>
    <p>${S.q ? `${total} found` : `${total} ${word}${unread ? `, ${unread} unread` : ''}`}</p>
    ${S.folder === 'inbox' && !S.q ? movingLine() : ''}
  </div></div>`;
}

function stubOf(id) {
  const r = (S.raw || []).find(x => x.id === id) || S.items.find(x => x.id === id);
  if (!r || r.locked || (r.encrypted && !r.opened)) return null;
  return { ...r, cc: [], bcc: [], text: '', html: '', attachments: [], unsubscribe: null, pending: true };
}
let railT = 0;
const railQuiet = () => refreshRail().catch(() => {});
function railSoon(folder, d = 0) {
  const f = folder && d && S.folders.find(x => x.id === folder);
  if (f) { f.unread = Math.max(0, (f.unread || 0) + d); railGen++; renderRail(); }
  clearTimeout(railT); railT = setTimeout(() => refreshRail().catch(() => {}), 1500);
}
async function repage() {
  if (!S.next || S.q) return;
  const folder = S.folder, key = S.key;
  try {
    const r = await api.messages({ folder, unread: S.unreadOnly }); await mail.open(r.items);
    if (S.key === key && S.folder === folder && !S.q && !S.picked.size) { S.raw = r.items; S.items = groupThreads(S.raw); S.next = r.next; renderList(); markCurrent(S.sel); }
  } catch {}
}
function markSeen(id, folder) {
  const it = S.items.find(x => x.id === id), was = it ? it.unread : true;
  const n = it ? new Set([it, ...(it.members || [])].filter(x => x.unread).map(x => x.id)).size : 1;
  if (it) { it.unread = false; it.members?.forEach(x => { x.unread = false; }); }
  list.querySelector(`.row[data-id="${id}"]`)?.classList.remove('unread');
  inOrder(id, () => api.update(id, { unread: false })).catch(() => {});
  railSoon(folder, was ? -Math.max(1, n) : 0);
}
function oneEach(items, open) {
  const k = x => `${x.from?.addr}|${String(x.date).slice(0, 16)}|${x.subject}`, seen = new Set(open ? [k(open)] : []);
  return items.filter(x => { const key = k(x); if (seen.has(key)) return false; seen.add(key); return true; });
}
async function openMessage(id) {
  const shown = !phone() && S.sel === id && S.open?.id === id && !!S.open.pending;
  S.sel = id;
  if (!shown) S.open = null;
  const stub = shown ? S.open : stubOf(id), row = S.items.find(x => x.id === id);
  const tid = stub?.thread_id, early = S.me.threads && tid && stub.folder !== 'drafts' ? api.thread(tid).catch(() => null) : null;
  const reading = mail.read(id, S.me, { images: S.me.images !== false, from: (stub || row)?.encrypted ? (stub || row).from?.addr : undefined });
  reading.catch(() => {});
  if (!phone() && !splitPane() && !$('.reader', pane)) app.dataset.depth = 'list';
  if (splitPane() && stub && !shown) { markCurrent(id); $('.reader', pane)?.classList.add('leaving'); }
  const fast = !stub || shown ? true : await Promise.race([reading.then(() => true, () => true), new Promise(r => setTimeout(() => r(false), splitPane() ? 300 : 150))]);
  if (S.sel !== id) return;
  if (stub) {
    S.thread = null;
    if (!fast) { renderReader(stub); if (stub.unread) { markSeen(id, stub.folder); stub.unread = false; } }
  }
  let m;
  try { m = await reading; }
  catch (e) { bootDone(); if (S.sel === id) { pane.innerHTML = `<div class="blank"><div class="state"><h2>${esc(e.message)}</h2></div></div>`; setView('mail', 'pane'); } return; }
  if (S.sel !== id) return;
  if (m.locked) { bootDone(); setView('mail', 'pane'); return loadKeyPane(m); }
  if (m.folder === 'drafts' && S.outbox?.c?.draftId === m.id) { clearTimeout(S.outbox.timer); S.outbox = null; $('.toast')?.classList.remove('on'); toast('Not sent. It is open again.'); }
  if (m.folder === 'drafts' && !phone()) {
    bootDone(); S.open = m; history.replaceState(null, '', '#/f/drafts'); S.sel = null;
    if ($('.reader', pane)) { emptyPane(); markCurrent(null); if (!splitPane()) setView('mail', 'list'); }
    return startCompose('draft', m);
  }
  if (early && m.thread_id === tid && !S.thread) {
    const t = await Promise.race([early, new Promise(r => setTimeout(() => r(null), 250))]);
    if (S.sel !== id) return;
    if (t && t.items.length > 1) {
      const keep = x => x.id !== m.id && (m.folder === 'trash' || x.folder !== 'trash') && (m.folder === 'junk' || x.folder !== 'junk') && x.folder !== 'drafts';
      const others = oneEach((await mail.open(t.items)).filter(keep), m);
      if (S.sel !== id) return;
      if (others.length) S.thread = others;
    }
  }
  if (stub) { m.flagged = S.open === stub ? stub.flagged : m.flagged; if (!stub.unread) m.unread = false; }
  else S.thread = null;
  if (S.me.threads && m.thread_id && !['drafts'].includes(m.folder)) {
    (early && m.thread_id === tid ? early : api.thread(m.thread_id)).then(async t => {
      if (S.sel !== id || !t || t.items.length < 2) return;
      const keep = x => x.id !== m.id && (m.folder === 'trash' || x.folder !== 'trash') && (m.folder === 'junk' || x.folder !== 'junk') && x.folder !== 'drafts';
      const others = oneEach((await mail.open(t.items)).filter(keep), m);
      if (S.sel !== id || S.open !== m || !others.length) return;
      S.thread = others;
      for (const x of others) if (x.unread) { x.unread = false; api.update(x.id, { unread: false }); }
      if (!S.compose && !$('.replybox, #replyf', pane)) renderReader(m);
    }).catch(() => {});
  }
  if (m.encrypted && (!m.arrival || m.arrival === 'e2e') && m.folder !== 'sent' && m.folder !== 'drafts' && m.from?.addr) {
    m.keyNow = await Promise.race([mail.senderKey(m.from.addr).catch(() => null), new Promise(r => setTimeout(() => r(undefined), 200))]);
    if (S.sel !== id) return;
  }
  if (row?.group?.length > 1 && row.unread && !m.unread) { row.unread = false; list.querySelector(`.row[data-id="${id}"]`)?.classList.remove('unread'); railSoon(); }
  const holds = !!m.html && !phone() && !splitPane() && app.dataset.depth !== 'pane';
  if ((m.unread || stub?.unread) && holds) { (S.seenLater ||= []).push([id, m.folder]); m.unread = false; }
  else if (m.unread || stub?.unread) { markSeen(id, m.folder); m.unread = false; if (stub) stub.unread = false; }
  renderReader(m);
  if (S.resume?.ref === id) {
    const r = S.resume; S.resume = null;
    startCompose(r.mode || 'reply', m);
    if (S.compose) Object.assign(fromDraft(S.compose, r.draft), { resumed: true, quote: '' });
  }
}

const bootDone = () => document.documentElement.removeAttribute('data-boot-open');
function reveal() {
  const r = $('.reader.fresh', pane); if (!r) return;
  r.classList.remove('fresh'); bootDone();
  for (const [id, folder] of (S.seenLater || []).splice(0)) markSeen(id, folder);
  if (app.dataset.view === 'mail') app.dataset.depth = 'pane';
  if (document.activeElement === document.body) $('#rsubj')?.focus({ preventScroll: true });
}
const folderChip = m => { const f = S.folders.find(x => x.id === m.folder || x.role === m.folder); return f ? ` <span class="fchip" aria-hidden="true">${esc(f.name)}</span>` : ''; };
function renderReader(m) {
  if (m.id === S.sel) markCurrent(m.id);
  if (m.id === S.sel && app.dataset.depth === 'list' && app.dataset.view === 'mail' && phone()) setView('mail', 'pane');
  const again = S.open?.id === m.id && !!pane.querySelector('.reader'), top = again ? pane.scrollTop : 0, fe = document.activeElement;
  const fresh = !again && !!m.html && !m.pending && !phone() && !splitPane() && app.dataset.depth !== 'pane';
  if (!fresh) bootDone();
  const refocus = again && pane.contains(fe) ? (fe.id ? `#${fe.id}` : fe.dataset?.act ? `[data-act="${fe.dataset.act}"]` : null) : null;
  const n = S.items.findIndex(x => x.id === m.id);
  const isDraft = m.folder === 'drafts';
  const canBlock = !mine(m.from.addr) && m.from.addr !== ORDERS && !['drafts', 'sent'].includes(m.folder);
  const junkF = S.folders.find(f => f.role === 'junk');
  const rec = [...(m.to || []), ...(m.cc || [])];
  const toLine = rec.length ? `to ${rec.map(p => (mine(p.addr) ? 'me' : nameOf(p))).join(', ')}` : '';
  const files = (m.attachments || []).map((a, i) => ({ a, i })).filter(x => !shownInline(m, x.a));
  const facts = [
    m.via_alias ? `<span>${icon('at')}Through <a href="#/aliases/${esc((S.aliases.find(a => a.address === m.via_alias) || {}).id || '')}" data-alias="${esc(m.via_alias)}">${esc(m.via_alias)}</a></span>` : '',
  ].join('');
  const sec = secOf(m);
  const moreHtml = `<details class="tmore"><summary class="iconbtn" aria-label="More actions" title="More">${icon('more')}</summary><div class="tmore-m" role="menu">
          
          ${m.folder !== 'drafts' ? `<button class="ph-only" type="button" role="menuitem" data-act="move">${icon('folder')}<span>Move to…</span></button>` : ''}
          ${!['drafts', 'sent', 'trash', 'junk'].includes(m.folder) ? `<button class="ph-only" type="button" role="menuitem" data-act="snooze">${icon('clock')}<span>Snooze…</span></button>` : ''}
          ${junkF && !['junk', 'drafts', 'sent'].includes(m.folder) ? `<button type="button" role="menuitem" data-act="junk">${icon('junk')}<span>Move to Junk</span></button>` : ''}
          ${canBlock ? `<button type="button" role="menuitem" data-act="block">${icon('block')}<span>Block sender</span></button>` : ''}
          <button type="button" role="menuitem" data-act="print"><svg class="i" viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true"><path d="M6 7V3.5h8V7"/><rect x="3.5" y="7" width="13" height="7" rx="1.5"/><path d="M6 12h8v4.5H6z"/></svg><span>Print</span></button>
          <button type="button" role="menuitem" data-act="original">${icon('more')}<span>Show original</span></button>
          <button type="button" role="menuitem" data-act="raw">${icon('down')}<span>Download message (.eml)</span></button>
        </div></details>`;
  pane.innerHTML = `
    <article class="in reader${again ? ' still' : ''}${fresh ? ' fresh' : ''}" aria-labelledby="rsubj">
      ${phone() ? `<div class="tools">
        <button class="iconbtn back" type="button" data-act="back" aria-label="Back to ${esc(folderName())}">${icon('back')}</button>
        <span class="tg tg-one">
        ${S.folders.some(f => f.role === 'archive') && m.folder !== 'archive' ? `<button class="iconbtn" type="button" data-act="archive" aria-label="Archive">${icon('archive')}</button>` : ''}
        <button class="iconbtn" type="button" data-act="trash" aria-label="${m.folder === 'trash' ? 'Delete for good' : 'Delete'}">${icon('trash')}</button>
        <button class="iconbtn" type="button" data-act="unread" aria-label="Mark unread">${icon('mailclosed')}</button>
        ${moreHtml}
        </span>
      </div>` : `      <div class="tools">
        <button class="iconbtn back" type="button" data-act="back" title="Back (Esc)" aria-label="Back to ${esc(folderName())}">${icon('back')}<span class="bk-l" aria-hidden="true">${esc(folderName())}</span></button>
        <span class="tsep" aria-hidden="true"></span>
        <span class="tg">
        ${S.folders.some(f => f.role === 'archive') && m.folder !== 'archive' ? `<button class="iconbtn" type="button" data-act="archive" title="Archive (e)" aria-label="Archive">${icon('archive')}</button>` : ''}
        <button class="iconbtn" type="button" data-act="trash" title="${m.folder === 'trash' ? 'Delete for good' : 'Delete (#)'}" aria-label="Delete">${icon('trash')}</button>
        </span>
        <span class="tsep tg-d" aria-hidden="true"></span>
        <span class="tg">
        <button class="iconbtn tg-d" type="button" data-act="unread" title="Mark unread (u)" aria-label="Mark unread">${icon('mailclosed')}</button>
        <button class="iconbtn ph-only" type="button" data-act="flag" title="Star (s)" aria-label="Star" aria-pressed="${m.flagged}">${icon('star')}</button>
        ${m.folder !== 'drafts' ? `<button class="iconbtn" type="button" data-act="move" title="Move to (v)" aria-label="Move to" aria-haspopup="menu">${icon('folder')}</button>` : ''}
        ${!['drafts', 'sent', 'trash', 'junk'].includes(m.folder) ? `<button class="iconbtn" type="button" data-act="snooze" title="Snooze (b)" aria-label="Snooze" aria-haspopup="menu">${icon('clock')}</button>` : ''}
        </span>
        <span class="tsep tg-d" aria-hidden="true"></span>
        ${moreHtml}
        <span class="tsubj" aria-hidden="true">${esc(m.subject || '(no subject)')}</span>
        <span class="sp"></span>
        ${n >= 0 ? `<span class="pos">${n + 1} of ${S.items.length}</span>
        <button class="iconbtn" type="button" data-act="prev" title="Newer (k)" aria-label="Newer message" ${n <= 0 ? 'disabled' : ''}>${icon('back')}</button>
        <button class="iconbtn" type="button" data-act="next" title="Older (j)" aria-label="Older message" ${n >= S.items.length - 1 ? 'disabled' : ''}>${icon('next')}</button>` : ''}
      </div>`}
      <div id="actnote"></div>
      ${m.folder === (S.folders.find(f => f.role === 'junk') || {}).id && S.folders.some(f => f.role === 'inbox') ? `<div class="junkbar">${icon('junk')}<span>In Junk</span><button class="pill line sm" type="button" data-act="notjunk">Not junk</button></div>` : ''}
      ${phone() ? `<div class="rs-row"><h2 class="r-subj" id="rsubj" tabindex="-1">${esc(m.subject || '(no subject)')}${folderChip(m)}</h2>
        <button class="iconbtn rstar" type="button" data-act="flag" aria-label="Star" aria-pressed="${m.flagged}">${icon('star')}</button></div>`
        : `<h2 class="r-subj" id="rsubj" tabindex="-1">${esc(m.subject || '(no subject)')}</h2>`}
      ${S.thread ? cards(S.thread.filter(x => x.date <= m.date)) : ''}
      <div class="msg">
      <div class="who"${S.thread?.length ? ' aria-expanded="true" title="Click to fold"' : ''}>
        ${avatar(m.from)}
        <div class="who-t">
          <div class="who-l1"><span class="who-n">${esc(nameOf(m.from))}</span>${sec.icon ? `<span class="sec ${sec.cls}" data-tip="${esc(sec.label)}" aria-label="${esc(sec.label)}" role="img">${icon(sec.icon)}</span>` : ''}${m.from.name ? `<span class="who-a">${esc(m.from.addr)}</span>` : ''}</div>
          <button class="who-to" type="button" data-act="details" aria-expanded="false" title="Details">${esc(toLine)}<svg class="i" viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true"><path d="M6 8l4 4 4-4"/></svg></button>
        </div>
        <span class="who-r">
          ${m.unsubscribe && !m.unsubscribed && !unsubbed.has(unsubKey(m.unsubscribe)) ? '<button class="linkbtn unsub" type="button" data-act="unsub" id="unsubnote">Unsubscribe</button>' : ''}
          <time datetime="${m.date}" title="${esc(full(m.date))}">${phone() ? when(m.date) : full(m.date)}</time>
          <button class="iconbtn desk-only" type="button" data-act="flag" title="Star (s)" aria-label="Star" aria-pressed="${m.flagged}">${icon('star')}</button>
          ${isDraft ? '' : `<button class="iconbtn desk-only" type="button" data-act="reply" title="Reply (r)" aria-label="Reply">${icon('reply')}</button>`}
        </span>
      </div>
      <dl class="who-det" id="whodet" hidden>
        <dt>From</dt><dd>${esc(m.from.name ? `${m.from.name} <${m.from.addr}>` : m.from.addr)}</dd>
        ${m.to?.length ? `<dt>To</dt><dd>${esc(m.to.map(p => (p.name ? `${p.name} <${p.addr}>` : p.addr)).join(', '))}</dd>` : ''}
        ${m.cc?.length ? `<dt>Cc</dt><dd>${esc(m.cc.map(p => (p.name ? `${p.name} <${p.addr}>` : p.addr)).join(', '))}</dd>` : ''}
        <dt>Date</dt><dd>${esc(new Date(m.date).toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }))}</dd>
        ${m.via_alias ? `<dt>Alias</dt><dd>${esc(m.via_alias)}</dd>` : ''}
        <dt>Security</dt><dd><span class="arrival" id="arrival">${sec.label}</span></dd>
      </dl>
      <div class="facts">${facts}</div>
      <hr class="r-hr">
      ${schedOf(m) ? `<div class="note">${icon('sent')}<span class="t">Sends <b>${snzWhen(schedOf(m).send_at)}</b></span><button type="button" data-act="unschedule">Don't send</button></div>` : ''}
      ${m.snoozed_until ? `<div class="note">${icon('clock')}<span class="t">Snoozed until <b>${snzWhen(m.snoozed_until)}</b></span><button type="button" data-act="unsnooze">Back now</button></div>` : ''}
      ${m.unsigned && m.folder !== 'sent' && m.folder !== 'drafts' ? `<div class="note warn"><span class="t"><b>Not signed by ${esc(m.from.addr)}.</b> Mail from a foldoy address carries its sender's signature, and this one doesn't. It may not be from them.</span></div>` : ''}
      <div id="keynote"></div>
      <div id="imgnote">${m.html ? (() => { try { return imgNoteHtml(m, cleanHtml(m.html, { images: S.me.images !== false, cids: m.cids || {} }), S.me.images !== false); } catch { return ''; } })() : ''}</div>
      ${m.html ? '<div class="htmlwrap"><iframe class="htmlmail" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" title="Message"></iframe></div>'
        : m.pending && !m.text ? '<div class="body skbody" aria-busy="true"><i style="width:82%"></i><i style="width:94%"></i><i style="width:61%"></i></div>'
          : `<div class="body">${quote(m.text || '')}</div>`}
      ${files.length ? `<div class="atts-h"><span>${files.length} attachment${files.length > 1 ? 's' : ''}, ${size(files.reduce((t, x) => t + (x.a.size || 0), 0))}</span>${files.length > 1 ? '<button class="linkbtn" type="button" data-act="dlall">Download all</button>' : ''}</div>
      <div class="atts">${files.map(({ a, i }) => { const pic = /^image\/(jpeg|png|gif|webp)$/.test(a.type || '') && (a.size || 0) < 8e6, had = pic && thumbUrls.get(`${m.id}/${a.id}`); return `<button class="att${pic ? ' photo' : ''}" type="button" data-act="dl" data-i="${i}" ${pic ? 'data-thumb' : ''} title="${pic ? 'Open' : 'Download'} ${esc(a.name)}"><span class="th${had ? ' pic' : ''}" aria-hidden="true"${had ? ` style="background-image:url(&quot;${had}&quot;)"` : ''}>${/^image\//.test(a.type || '') ? '<svg class="i" viewBox="0 0 20 20" fill="none" stroke="currentColor"><rect x="3" y="4" width="14" height="12" rx="2"/><circle cx="7.5" cy="8.5" r="1.5"/><path d="M3.5 14l4-4 3 3 2-2 4 3.5"/></svg>' : icon('clip')}</span><span class="t"><b>${esc(a.name)}</b><span>${size(a.size)}</span></span>${icon('down')}</button>`; }).join('')}</div>` : ''}
      </div>
      ${S.thread ? cards(S.thread.filter(x => x.date > m.date)) : ''}
      <div class="replybar">
        ${isDraft ? `<button class="pill light md" type="button" data-act="editdraft">Edit draft</button>` : `
        <button class="pill ${phone() ? 'light' : 'soft'} md" type="button" data-act="reply">${icon('reply')}Reply</button>
        ${m.to.length + (m.cc?.length || 0) > 1 ? `<button class="pill ${phone() ? 'soft' : 'ghost'} md" type="button" data-act="replyall">${icon('replyall')}Reply all</button>` : ''}
        <button class="pill ${phone() ? 'soft' : 'ghost'} md" type="button" data-act="forward">${icon('forward')}Forward</button>`}
      </div>
    </article>`;
  pane.scrollTop = top;
  S.open = m;
  thumbs(m);
  if (app.dataset.view === 'mail' && app.dataset.depth !== 'pane' && !(fresh && !splitPane())) app.dataset.depth = 'pane';
  if (fresh) setTimeout(reveal, 900);
  watchSubj();
  if (m.html) showHtml(m);
  if (again) { if (refocus) $(refocus, pane)?.focus({ preventScroll: true }); }
  else if (phone() || S.focusPane || document.activeElement === document.body || (!splitPane() && list.contains(document.activeElement))) { S.focusPane = false; $('#rsubj').focus({ preventScroll: true }); }
  if (m.pending) return;
  senderKey(m);
  sentKeys(m);
  screenerNote(m);
}
const thumbUrls = new Map();
async function thumbs(m) {
  for (const b of $$('.atts .att[data-thumb]', pane)) {
    const a = m.attachments?.[+b.dataset.i]; if (!a) continue;
    const key = `${m.id}/${a.id}`;
    let url = thumbUrls.get(key);
    if (!url) {
      try {
        const blob = a.bytes ? new Blob([a.bytes()], { type: a.type }) : await (await fetch(`/mail/api/attachments/${encodeURIComponent(m.id)}/${encodeURIComponent(a.id)}`, { credentials: 'same-origin' }).then(r => { if (!r.ok) throw new Error(); return r; })).blob();
        url = URL.createObjectURL(blob); thumbUrls.set(key, url);
        if (thumbUrls.size > 40) { const [k0, u0] = thumbUrls.entries().next().value; URL.revokeObjectURL(u0); thumbUrls.delete(k0); }
      } catch { continue; }
    }
    if (S.open !== m || !b.isConnected) return;
    const th = b.querySelector('.th'); if (th) { th.style.backgroundImage = `url("${url}")`; th.classList.add('pic'); }
  }
}
function watchSubj() {
  const r = $('.reader', pane), h = $('#rsubj', pane), t = $('.reader > .tools', pane); if (!r || !h || !t) return;
  const check = () => r.classList.toggle('scrolled', h.getBoundingClientRect().bottom < t.getBoundingClientRect().bottom);
  if (!pane.__subj) { pane.__subj = true; pane.addEventListener('scroll', () => { const rr = $('.reader', pane); if (rr) { const hh = $('#rsubj', pane), tt = $('.reader > .tools', pane); if (hh && tt) rr.classList.toggle('scrolled', hh.getBoundingClientRect().bottom < tt.getBoundingClientRect().bottom); } }, { passive: true }); }
  check();
}
document.addEventListener('click', e => { for (const d of $$('details.tmore[open]')) if (!d.contains(e.target) || e.target.closest('.tmore-m [data-act]')) d.open = false; });
const closeMore = () => { for (const d of $$('details.tmore[open]')) d.open = false; };
document.addEventListener('toggle', e => { const d = e.target; if (d.matches?.('details.tmore') && d.open && !phone()) requestAnimationFrame(() => [...d.querySelectorAll('[role="menuitem"]')].find(x => x.offsetParent)?.focus({ preventScroll: true })); }, true);
addEventListener('blur', closeMore);
pane.addEventListener('scroll', closeMore, { passive: true });
const schedOf = m => (S.folder === 'scheduled' ? S.items.find(x => x.id === m.id && x.scheduled_id) : null);
async function unschedule() {
  const m = S.open, row = m && schedOf(m); if (!row) return;
  try { const r = await api.cancelScheduled(row.scheduled_id); toast('Not sent. It is in Drafts.'); S.key = ''; await railQuiet(); location.hash = `#/f/drafts/${r.id}`; }
  catch (x) { toast(x.message); }
}
function cards(xs) {
  return xs.map(x => `<div class="tm-w"><button class="tm" type="button" data-tm="${x.id}" aria-expanded="false">${avatar(x.from)}<span class="tm-t"><span class="tm-n">${esc(mine(x.from.addr) ? 'You' : nameOf(x.from))}</span><span class="tm-to">${esc(toLineOf(x))}</span></span><time datetime="${x.date}" title="${esc(full(x.date))}">${phone() ? when(x.date) : full(x.date)}</time></button><div class="tm-b" id="tmb-${x.id}" hidden></div></div>`).join('');
}
const toLineOf = r => { const rec = [...(r.to || []), ...(r.cc || [])]; return rec.length ? `to ${rec.map(p => (mine(p.addr) ? 'me' : nameOf(p))).join(', ')}` : ''; };
async function openCard(id) {
  const b = $(`[data-tm="${id}"]`, pane), box = $(`#tmb-${id}`, pane); if (!b || !box) return;
  const open = b.getAttribute('aria-expanded') === 'true';
  if (open) {
    $$('.tm[aria-expanded="true"]', pane).forEach(t => { t.setAttribute('aria-expanded', 'false'); const x = $(`#tmb-${t.dataset.tm}`, pane); if (x) x.hidden = true; });
    return;
  }
  b.setAttribute('aria-expanded', 'true'); box.hidden = false;
  if (box.dataset.done) return;
  let r; try { r = await mail.read(id, S.me); } catch (x) { box.innerHTML = `<p class="say bad">${esc(x.message)}</p>`; return; }
  box.dataset.done = '1';
  if (r.locked) { box.innerHTML = '<p class="plain">Encrypted. Load your key to read it.</p>'; return; }
  const to = b.querySelector('.tm-to'); if (to && !to.textContent) to.textContent = toLineOf(r);
  if (r.html && !(r.text || '').trim()) {
    box.innerHTML = '<div class="htmlwrap"><iframe class="htmlmail" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" title="Message"></iframe></div>';
    const auto = S.me.images !== false;
    if (auto && r.remote_images_blocked && !r.armored) { try { const x = await mail.read(id, S.me, { images: true }); r.html = x.html; } catch {} }
    mountHtml($('.htmlmail', box), cleanHtml(r.html, { images: auto, cids: await inlineImages(r) }), false, `card:${id}`);
  } else box.innerHTML = `<div class="body">${quote(r.text || '')}</div>`;
}
const snzWhen = iso => {
  const d = new Date(iso), days = (d - Date.now()) / 864e5;
  const t = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return days < 6 ? `${d.toLocaleDateString('en-GB', { weekday: 'short' })} ${t}` : `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} ${t}`;
};
const ARRIVAL = {
  e2e: `<span class="mint">${icon('key')}End-to-end encrypted</span>`,
  verified: `<span class="mint">${icon('key')}End-to-end encrypted, verified sender</span>`,
  sealed: `<span>${icon('key')}Encrypted on arrival</span>`,
  plain: `<span>Not encrypted. Stored as it arrived.</span>`,
  encrypted: `<span>${icon('key')}Encrypted</span>`,
};
const sentE2E = new Map();
function sentSec(m) {
  const rec = [...(m.to || []), ...(m.cc || [])].map(p => p.addr).filter(Boolean);
  const sure = sentE2E.get(m.id);
  const outside = rec.filter(a => !FOLDOY.test(a) && !sure?.has(a.toLowerCase()));
  if (!rec.length || !outside.length) return { icon: 'lock', cls: 'on', label: 'End-to-end encrypted' };
  return { icon: 'lock', cls: '', label: outside.length === rec.length ? 'Sent readable to outside addresses. Your copy is encrypted.' : 'End-to-end to foldoy addresses, readable to the others. Your copy is encrypted.' };
}
async function sentKeys(m) {
  if ((m.folder !== 'sent' && m.folder !== 'scheduled') || !m.armored || sentE2E.has(m.id)) return;
  const out = [...(m.to || []), ...(m.cc || [])].map(p => (p.addr || '').toLowerCase()).filter(a => a && !FOLDOY.test(a));
  if (!out.length) return;
  let to, k;
  try {
    to = await pgp.encryptedTo(m.armored);
    const own = [...(S.me.keys || []).map(x => x.public_key), S.me.key?.public_key].filter(Boolean);
    for (const ids of await Promise.all(own.map(x => pgp.keyIds(x).catch(() => [])))) for (const id of ids) to.delete(id);
    if (!to.size) return;
    k = await mail.classify(out);
  } catch { return; }
  const sure = new Set();
  for (const x of k.e2e) { try { if ((await pgp.keyIds(x.public_key)).some(id => to.has(id))) sure.add(x.addr); } catch {} }
  if (!sure.size) return;
  sentE2E.set(m.id, sure);
  if (S.open?.id !== m.id) return;
  const sec = sentSec(m), lock = $('.who-l1 .sec', pane), a = $('#arrival', pane);
  if (lock) { lock.className = `sec ${sec.cls}`; lock.dataset.tip = sec.label; lock.setAttribute('aria-label', sec.label); }
  if (a) a.textContent = sec.label;
}
function secOf(m) {
  if (m.folder === 'sent' || m.folder === 'scheduled') return sentSec(m);
  const k = m.verified ? 'verified' : (m.arrival || (m.encrypted ? 'encrypted' : 'plain'));
  return { verified: { icon: 'lock', cls: 'on', label: 'End-to-end encrypted. The sender is verified.' },
    e2e: { icon: 'lock', cls: 'on', label: 'End-to-end encrypted' },
    sealed: { icon: 'lock', cls: '', label: 'Encrypted' },
    encrypted: { icon: 'lock', cls: '', label: 'Encrypted' } }[k] || { icon: '', cls: '', label: 'Not end-to-end encrypted' };
}
const keySince = () => (S.me.keys || []).filter(k => !k.alias).map(k => Date.parse(k.created)).filter(t => t).sort((a, b) => a - b)[0];
const arrivalOf = m => { if (m.folder === 'sent' || m.folder === 'scheduled') return sentSec(m).label; const k = m.verified ? 'verified' : (m.arrival || (m.encrypted ? 'encrypted' : 'plain')); const t = keySince();
  return k === 'plain' && t && !(Date.parse(m.date) < t) ? '' : ARRIVAL[k]; };
async function senderKey(m) {
  if ((m.arrival && m.arrival !== 'e2e') || !m.encrypted || m.folder === 'sent' || m.folder === 'drafts') return;
  const k = m.keyNow !== undefined ? m.keyNow : await mail.senderKey(m.from.addr);
  const a = $('#arrival'); if (!k || !a || S.open !== m) return;
  a.insertAdjacentHTML('beforeend', `<button type="button" class="linkbtn" data-act="showkey">Key</button>`);
  const box = $('#keynote');
  const show = () => { box.innerHTML = `<div class="note keyfp">${icon('key')}<span class="t">${esc(nameOf(m.from))}'s key <b class="fp">${esc(k.fingerprint)}</b></span></div>`; };
  if (k.changed) box.innerHTML = `<div class="note warn"><span class="t"><b>${esc(nameOf(m.from))}'s key changed</b> since you first saw it. Check the new fingerprint with them another way.<br><span class="fp">Was ${esc(k.changed)}</span><br><span class="fp">Now ${esc(k.fingerprint)}</span></span><button type="button" data-act="trustkey">It's theirs</button></div>`;
  S.keyShow = show; S.keyNow = k;
}
const fileKept = new Map();
async function fileBytes(m, a) {
  if (a.bytes) return a.bytes();
  const k = `${m.id}/${a.id}`;
  if (!fileKept.has(k)) {
    const p = fetch(`/mail/api/attachments/${encodeURIComponent(m.id)}/${encodeURIComponent(a.id)}`, { credentials: 'same-origin' })
      .then(r => { if (!r.ok) throw new Error(); return r.arrayBuffer(); }).then(b => new Uint8Array(b));
    p.catch(() => fileKept.delete(k));
    fileKept.set(k, p); if (fileKept.size > 6) fileKept.delete(fileKept.keys().next().value);
  }
  return fileKept.get(k);
}
async function downloadFile(m, i) {
  const a = m?.attachments?.[i]; if (!a) return;
  try { pgp.download(new Blob([await fileBytes(m, a)], { type: 'application/octet-stream' }), a.name); }
  catch { toast("That file couldn't be downloaded. Try again."); }
}
const isPic = a => /^image\/(jpeg|png|gif|webp)$/.test(a?.type || '');
async function previewFile(m, i) {
  const a = m?.attachments?.[i]; if (!a) return;
  if (!isPic(a)) return downloadFile(m, i);
  const pics = (m.attachments || []).map((x, k) => ({ x, k })).filter(({ x }) => isPic(x));
  let at = pics.findIndex(p => p.k === i), url = null;
  const v = document.createElement('div'); v.className = 'viewer'; v.setAttribute('role', 'dialog');
  const show = async () => {
    const { x, k } = pics[at];
    let u; try { u = URL.createObjectURL(new Blob([await fileBytes(m, x)], { type: x.type })); } catch { toast("That picture couldn't be opened."); return; }
    const img = new Image(); img.alt = x.name; img.src = u; await img.decode().catch(() => {});
    if (url) URL.revokeObjectURL(url); url = u; i = k;
    v.setAttribute('aria-label', x.name);
    v.innerHTML = `<div class="v-bar"><span class="v-name">${esc(x.name)}</span><span class="v-size">${size(x.size)}</span>${pics.length > 1 ? `<span class="v-count">${at + 1} of ${pics.length}</span>` : ''}<span class="sp"></span>
      <button class="iconbtn" type="button" data-v="dl" aria-label="Download ${esc(x.name)}">${icon('down')}</button><button class="iconbtn" type="button" data-v="x" aria-label="Close (Esc)">${icon('close')}</button></div>
      <div class="v-stage">${pics.length > 1 ? `<button class="v-nav prev" type="button" data-v="prev" aria-label="Previous picture" ${at === 0 ? 'disabled' : ''}>${icon('back')}</button>` : ''}
      <i class="v-img"></i>
      ${pics.length > 1 ? `<button class="v-nav next" type="button" data-v="next" aria-label="Next picture" ${at === pics.length - 1 ? 'disabled' : ''}>${icon('next')}</button>` : ''}</div>`;
    v.querySelector('.v-img').replaceWith(img);
    if (!v.isConnected) document.body.append(v);
    v.focus({ preventScroll: true });
    const nx = pics[at + 1]; if (nx) fileBytes(m, nx.x).catch(() => {});
  };
  v.tabIndex = -1;
  const from = document.activeElement;
  let stepped = false;
  const shut = () => { window.removeEventListener('popstate', onPop); if (url) URL.revokeObjectURL(url); document.removeEventListener('keydown', key, true); if (v.parentNode) v.parentNode.removeChild(v); if (!phone() && from?.isConnected) from.focus({ preventScroll: true }); };
  const onPop = () => { stepped = false; shut(); };
  const close = () => { if (stepped) { stepped = false; history.back(); } else shut(); };
  if (phone()) { history.pushState({ viewer: 1 }, ''); stepped = true; window.addEventListener('popstate', onPop); }
  let t0 = null;
  v.addEventListener('touchstart', e => { if (e.touches.length === 1) t0 = { x: e.touches[0].clientX, y: e.touches[0].clientY, at: Date.now() }; else t0 = null; }, { passive: true });
  const pic = () => v.querySelector('.v-stage img');
  v.addEventListener('touchmove', e => {
    if (!t0 || e.touches.length !== 1) return; const im = pic(); if (!im) return;
    const dx = e.touches[0].clientX - t0.x, dy = e.touches[0].clientY - t0.y;
    if (!t0.dir && Math.hypot(dx, dy) > 8) t0.dir = Math.abs(dx) > Math.abs(dy) ? 'x' : (dy > 0 ? 'y' : 'none');
    im.style.transition = 'none';
    if (t0.dir === 'x') im.style.transform = `translateX(${dx}px)`;
    else if (t0.dir === 'y') { im.style.transform = `translateY(${Math.max(0, dy)}px)`; v.style.backgroundColor = `rgba(0, 0, 0, ${Math.max(.35, 1 - Math.max(0, dy) / 400)})`; }
  }, { passive: true });
  const settle = () => { const im = pic(); if (im) { im.style.transition = 'transform .22s var(--ease)'; im.style.transform = ''; } v.style.backgroundColor = ''; };
  v.addEventListener('touchend', e => {
    if (!t0) return; const t = e.changedTouches[0], dx = t.clientX - t0.x, dy = t.clientY - t0.y, quick = Date.now() - t0.at < 700, dir = t0.dir; t0 = null;
    if (dir === 'x' && (Math.abs(dx) > innerWidth / 3 || (quick && Math.abs(dx) > 50))) { const n = at + (dx < 0 ? 1 : -1); if (n >= 0 && n < pics.length) return go(dx < 0 ? 1 : -1); }
    if (dir === 'y' && (dy > 160 || (quick && dy > 80))) return close();
    settle();
  }, { passive: true });
  const go = d => { const n = at + d; if (n < 0 || n >= pics.length) return; at = n; show(); };
  const key = e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); e.stopImmediatePropagation(); go(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopImmediatePropagation(); go(-1); }
  };
  v.addEventListener('click', e => { const b = e.target.closest('[data-v]'); const k = b?.dataset.v;
    if (k === 'dl') return downloadFile(m, i); if (k === 'next') return go(1); if (k === 'prev') return go(-1);
    if (k === 'x' || e.target === v || e.target.classList.contains('v-stage')) close(); });
  document.addEventListener('keydown', key, true); show();
}
const ATTRIB = /\b(wrote|skrev|schrieb|a écrit|escribió|scrisse|schreef):\s*$/i;
const qblock = lines => {
  const out = [];
  for (let i = 0; i < lines.length;) {
    if (!lines[i].startsWith('&gt;')) { out.push(lines[i++]); continue; }
    const run = []; while (i < lines.length && lines[i].startsWith('&gt;')) run.push(lines[i++].replace(/^&gt; ?/, ''));
    out.push(`<div class="qn">${qblock(run)}</div>`);
  }
  return out.reduce((s, x, k) => s + (k && !out[k - 1].startsWith('<div class="qn">') && !x.startsWith('<div class="qn">') ? '\n' : '') + x, '');
};
const quote = t => {
  const lines = esc(String(t || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '')).split('\n'), out = [];
  for (let i = 0; i < lines.length;) {
    if (!lines[i].startsWith('&gt;')) { out.push(lines[i++]); continue; }
    const run = []; while (i < lines.length && (lines[i].startsWith('&gt;') || (!lines[i].trim() && (lines[i + 1] || '').startsWith('&gt;')))) run.push(lines[i++]);
    const inner = `<div class="qn">${qblock(run.map(l => l.replace(/^&gt; ?/, '')))}</div>`;
    let head = '';
    const b = out.length - 1 - (out.length && !out[out.length - 1].trim() ? 1 : 0);
    if (b >= 0 && ATTRIB.test(out[b]) && out[b].length < 300) { head = out[b]; out.splice(b); }
    out.push(`<button class="qtog" type="button" data-act="qtog" aria-expanded="false" aria-label="Show quoted text" title="Show quoted text">&middot;&middot;&middot;</button><div class="qt" hidden>${head ? `<div class="qh">${head}</div>` : ''}${inner}</div>`);
  }
  return out.reduce((s, x, k) => s + (k && !/<\/div>$/.test(out[k - 1]) ? '\n' : '') + x, '');
};

const FRAME_CSS = document.querySelector('meta[name="foldoy-frame-css"]')?.content || new URL('./mailframe.css', import.meta.url).href;
const shownInline = (m, a) => !!(a.cid && INLINE.test(a.type || '') && (m.html || '').toLowerCase().includes(`cid:${a.cid.toLowerCase()}`));
const INLINE = /^image\/(png|jpeg|gif|webp)$/;
async function inlineImages(m) {
  if (m.cids) return m.cids;
  const out = {};
  for (const a of m.attachments || []) {
    if (!a.cid || !INLINE.test(a.type || '') || (a.size || 0) > 5e6) continue;
    try {
      const bytes = a.bytes ? a.bytes() : new Uint8Array(await (await fetch(`/mail/api/attachments/${encodeURIComponent(m.id)}/${encodeURIComponent(a.id)}`, { credentials: 'same-origin' })).arrayBuffer());
      out[a.cid.toLowerCase()] = `data:${a.type};base64,${pgp.b64(bytes)}`;
    } catch {}
  }
  return (m.cids = out);
}
function imgNoteHtml(m, c, images) {
  const { held, trackers } = c, held2 = held + (images ? 0 : (m.remote_images_blocked || 0));
  const tr = trackers ? `${trackers} tracker${trackers > 1 ? 's' : ''} blocked. ` : '';
  return held2 && !images ? `<div class="note">${icon('down')}<span class="t">${tr}${held2} image${held2 > 1 ? 's' : ''} from the web held back. Loading them tells the sender when you opened this, never your IP address.</span><button type="button" data-act="images">Show images</button></div>`
    : trackers ? `<div class="note">${icon('block')}<span class="t">${tr}They report when mail is opened.</span></div>` : '';
}
async function showHtml(m, images = S.me.images !== false) {
  const cids = await inlineImages(m);
  if (S.open !== m) return;
  const c = cleanHtml(m.html, { images, cids });
  const box = $('#imgnote'), note = imgNoteHtml(m, c, images);
  if (box && box.innerHTML !== note) box.innerHTML = note;
  const fr = $('.htmlmail', pane);
  if (fr) mountHtml(fr, c, m.from?.addr === 'orders@foldoy.com' && m.arrival !== 'e2e');
}
async function showImages() {
  const m = S.open; if (!m) return;
  if (m.remote_images_blocked && !m.armored) { try { const r = await mail.read(m.id, S.me, { images: true }); m.html = r.html; m.remote_images_blocked = 0; } catch {} }
  showHtml(m, true);
}
const frameH = new Map();
function mountHtml(fr, { html, css = '', styled = false }, storeOrder, key = S.open?.id) {
  const paper = styled && !storeOrder, theme = paper ? 'light' : (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
  const known = frameH.get(key);
  fr.parentElement.classList.toggle('paper', paper);
  if (known) fr.style.height = `${known}px`;
  fr.parentElement.classList.add('loading');
  fr.srcdoc = `<!doctype html><html data-theme="${theme}"${paper ? ' class="paper"' : ''}><head><meta charset="utf-8"><meta name="color-scheme" content="${theme}"><base target="_blank"><link rel="stylesheet" href="${FRAME_CSS}">${paper && css ? `<style>${css}</style>` : ''}</head><body>${html}</body></html>`;
  const place = () => {
    let d; try { d = fr.contentDocument; } catch { return; }
    if (!d) return;
    const sh = d.documentElement.scrollHeight;
    const h = !paper && d.body && sh <= fr.clientHeight + 1 ? Math.max(1, Math.ceil(d.documentElement.getBoundingClientRect().height), d.body.scrollHeight) : sh;
    fr.style.height = h + 'px';
    if (key) { frameH.set(key, h); if (frameH.size > 60) frameH.delete(frameH.keys().next().value); }
    const c = storeOrder ? d.querySelector('.fo-code') : null, wrap = fr.parentElement;
    let b = wrap.querySelector('.codecopy');
    if (!c) { b?.remove(); return; }
    if (!b) { b = document.createElement('button'); b.type = 'button'; b.className = 'pill light md codecopy'; b.innerHTML = 'Copy'; wrap.append(b); }
    b.dataset.copy = c.textContent.trim(); b.setAttribute('aria-label', 'Copy the gift card code');
    const r = c.getBoundingClientRect();
    if (fr.clientWidth <= 420) { b.style.top = `${r.bottom - 58}px`; b.style.right = ''; b.style.left = `${r.left + 18}px`; }
    else { b.style.top = `${r.top + r.height / 2 - 22}px`; b.style.left = ''; b.style.right = `${fr.clientWidth - r.right + 14}px`; }
  };
  const edge = () => {
    let d; try { d = fr.contentDocument; } catch { return; }
    if (!paper || !d?.body) return;
    for (let el = d.body.firstElementChild; el; el = el.children.length === 1 ? el.firstElementChild : null) {
      const bg = getComputedStyle(el).backgroundColor;
      if (bg && bg !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(bg)) {
        if (el.getBoundingClientRect().width >= d.body.clientWidth - 64) { d.body.style.backgroundColor = bg; fr.parentElement.style.background = bg; }
        return;
      }
    }
  };
  fr._place = place;
  fr.onload = () => { if (!storeOrder) foldQuote(fr); edge(); place(); fr.parentElement.classList.remove('loading'); reveal(); if (!fr._ro) { fr._ro = new ResizeObserver(() => fr._place()); fr._ro.observe(fr.parentElement); } };
}
function foldQuote(fr) {
  const wrap = fr.parentElement, was = wrap.nextElementSibling;
  if (was?.classList.contains('hq')) was.remove();
  let d; try { d = fr.contentDocument; } catch { return; }
  const body = d?.body; if (!body) return;
  const blank = n => n.nodeType === 3 ? !n.textContent.trim() : n.nodeType !== 1 || (!n.textContent.trim() && !n.querySelector?.('img') && n.tagName !== 'IMG');
  const after = n => { const r = d.createRange(); r.setStartAfter(n); r.setEndAfter(body.lastChild); return r; };
  const tops = [...body.querySelectorAll('div.gmail_quote, blockquote')].filter(q => !q.parentElement.closest('div.gmail_quote, blockquote'));
  const q = tops[tops.length - 1]; if (!q) return;
  const rest = after(q); if (rest.toString().trim() || rest.cloneContents().querySelector('img')) return;
  const hide = [q];
  let n = q, steps = 0;
  find: for (let up = 0; up < 3 && n && n !== body; up++, n = n.parentElement) {
    for (let p = n.previousSibling; p && steps < 8; p = p.previousSibling, steps++) {
      if (blank(p)) continue;
      let x = p;
      if (x.nodeType === 1 && x.querySelector('br, div, p')) { x = x.lastChild; while (x && blank(x)) x = x.previousSibling; }
      const t = (x?.textContent || '').trim();
      if (x && (x.nodeType === 3 || !x.querySelector?.('br, div, p')) && t.length < 300 && ATTRIB.test(t)) {
        if (x.nodeType === 3) { const s = d.createElement('span'); x.replaceWith(s); s.append(x); x = s; }
        hide.unshift(x);
      }
      break find;
    }
  }
  const r = d.createRange(); r.setStart(body, 0); r.setEndBefore(hide[0]);
  if (!r.toString().trim() && !r.cloneContents().querySelector('img')) return;
  for (const x of hide) { x.dataset.fq = ''; x.style.setProperty('display', 'none', 'important'); }
  wrap.insertAdjacentHTML('afterend', '<button class="qtog hq" type="button" data-act="qtog" aria-expanded="false" aria-label="Show quoted text" title="Show quoted text">&middot;&middot;&middot;</button>');
}

function loadKeyPane(m) {
  const own = S.me.key?.own;
  if (m) S.open = m;
  setView('mail', m ? 'pane' : (phone() ? 'pane' : app.dataset.depth));
  pane.innerHTML = `
    <div class="u-tools-bare tools"><button class="iconbtn back" type="button" data-act="back" aria-label="Back">${icon('back')}</button></div>
    <div class="u-fill64 blank">
      <form class="state unlock" id="unlockf" novalidate>
        <img class="art" src="/static/mail/shared/art/key.svg" alt="">
        <h2>${own ? "Your own key isn't loaded." : 'Encrypted with your previous key.'}</h2>
        <p>${m ? `<b>${esc(m.subject && m.subject !== '...' ? m.subject : 'This message')}</b> from ${esc(nameOf(m.from))}. ` : ''}${own
          ? 'Load your private key for this tab, or download the message and open it in your PGP app.'
          : `It arrived before your password reset. ${S.me.recovery?.set ? 'Your recovery code opens it again, in Settings. Or load' : 'Load'} your key file with its passphrase to read it here.`}</p>
        ${!own && S.me.recovery?.set ? '<div class="acts"><a class="pill light md" href="#/settings/security" data-act="rcunlock">Unlock with your recovery code</a></div>' : ''}
        <textarea class="keybox" id="pkey" spellcheck="false" placeholder="-----BEGIN PGP PRIVATE KEY BLOCK-----" aria-label="${own ? 'Your private key' : 'Your key file'}"></textarea>
        <div class="u-mt8 acts"><label class="u-ptr pill soft sm">Upload a file<input type="file" id="pkfile" hidden></label>${m ? `<button class="pill soft sm" type="button" data-act="raw">Download message</button>` : ''}</div>
        <div class="field"><input id="ppin" type="password" autocomplete="off" placeholder="${own ? 'Its passphrase, if it has one' : 'Its passphrase'}" aria-label="Passphrase"><button class="end" type="button" data-act="showpp">Show</button></div>
        <p class="say bad" id="ppsay" aria-live="assertive"></p>
        <div class="acts"><button class="pill light" type="submit" id="ppgo">Load for this tab</button></div>
      </form>
    </div>`;
  $('#unlockf').addEventListener('submit', async e => {
    e.preventDefault();
    const b = $('#ppgo'); b.setAttribute('aria-busy', 'true'); $('#ppsay').textContent = '';
    try {
      await pgp.loadForTab($('#pkey').value, $('#ppin').value);
      $('#pkey').value = ''; $('#ppin').value = '';
      S.key = ''; renderRail(); toast('Loaded until you close this tab');
      const h = m ? `${S.back}/${m.id}` : location.hash;
      if (location.hash === h) routeSafe(); else location.hash = h;
    } catch (x) { $('#ppsay').textContent = x.message; }
    finally { b.removeAttribute('aria-busy'); }
  });
  $('#pkfile')?.addEventListener('change', async e => { const f = e.target.files[0]; if (f) $('#pkey').value = await f.text(); });
  if (!phone() || m) $('#pkey').focus({ preventScroll: true });
}

const emptyHtml = () => `<div class="state">
    <img class="art" src="${artFor('address', S.me.address.split('@')[1])}" alt="">
    <h2>No mail yet.</h2>
    <ul class="kv"><li><span>Your address</span><b>${esc(S.me.address)}</b></li></ul>
    <div class="acts"><a class="pill light md" href="#/settings/import">Import from Gmail</a><a class="pill soft md" href="#/settings/switch">Forward Gmail here</a><button class="pill soft md" type="button" data-copy="${esc(S.me.address)}">Copy address</button></div>
  </div>`;
function emptyAccount() {
  pane.innerHTML = phone() ? '' : `<div class="blank">${emptyHtml()}</div>`;
  if (phone()) setView('mail', 'list');
}
const isNew = () => { try { return sessionStorage.getItem('foldoy-new') === S.me.address; } catch { return false; } };

const dayMonth = iso => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const sendWait = () => S.me.sending?.hold
  ? (S.me.sending.applied ? 'Your application to send is waiting for review.' : 'New accounts made over a VPN or Tor are reviewed before they can send.')
  : `Sending opens on ${dayMonth(S.me.send_opens)}, or now with the $${Number(S.me.sending?.unlock_price || 5).toFixed(0)} unlock.`;
const cantSend = () => !!(S.me.send_opens || S.me.sending?.hold || S.me.sending?.suspended);
function sendingGroup(limitNote = '') {
  const s = S.me.sending; if (!s) return '';
  const tierLine = { plan: `Your plan: ${s.messages} messages and ${s.recipients} recipients a day`, unlocked: `Unlocked: ${s.recipients} recipients a day`,
    invited: `${s.messages} messages and ${s.recipients} recipients a day`, free: `${s.messages} messages and ${s.recipients} recipients a day`,
    waiting: `Receive only until ${S.me.send_opens ? dayMonth(S.me.send_opens) : 'sending opens'}`,
    hold: s.rejected ? "Sending isn't available for this account." : s.applied ? 'Your application is waiting for review.'
      : s.can_apply ? 'Accounts made over a VPN or Tor are reviewed before they can send. You can apply now.'
      : `Accounts made over a VPN or Tor are reviewed before they can send. You can apply from ${s.opens ? dayMonth(s.opens) : 'two days after signing up'}.` }[s.tier] || '';
  const canUnlock = !s.unlocked && s.tier !== 'plan';
  const price = Number(s.unlock_price).toFixed(0);
  return `<section aria-labelledby="h-send"><h3 tabindex="-1" id="h-send">Sending</h3><div class="box"><ul class="kv">
    <li class="wide"><span class="k">${s.suspended ? 'Paused' : 'Today'}<small>${esc(s.suspended ? 'We are looking at unusual activity. Write to support@foldoy.com.' : tierLine)}</small></span>
      <span class="val">${s.recipients ? `<b>${Math.round(s.recipients_used)} of ${s.recipients} recipients</b>` : ''}</span></li>
    ${limitNote ? `<li class="impnote">${limitNote}</li>` : ''}
    ${s.can_apply ? `<li class="wide"><span class="k">Apply to send<small>We look at it and let you know in your inbox.</small></span><span class="val">${btn('apply-send', 'Apply', 'light')}</span></li>` : ''}
    ${canUnlock ? `<li class="wide stack"><span class="k">Unlock sending<small>$${price} once, from your balance: 50 recipients a day.</small></span>
      <span class="val">${Number(S.me.balance_usd) >= Number(s.unlock_price) ? btn('unlock', `Unlock for $${price}`, 'light') : S.me.plans_open ? `<a class="pill line sm" href="${DEPOSIT_URL}">Add funds</a>` : '<span class="nobuy">Paid plans can\'t be bought yet.</span>'}</span></li>` : ''}
  </ul></div></section>`;
}
function rcNoticeHtml() {
  const rc = S.me.recovery; if (!rc || rc.set || !S.me.e2e || S.me.key?.own) return '';
  try { if (sessionStorage.getItem('foldoy-rc-later') === S.me.address) return ''; } catch {}
  if (S.folder !== 'inbox') return '';
  return `<div class="rcnote" id="rcnote"><a class="rc-go" href="#/settings/security" data-act="rcnew"><span class="rc-ic" aria-hidden="true">${icon('key')}</span>
    <span class="rc-t"><strong>Make a recovery code</strong><span>With it you can reset your password and keep all your mail.</span></span></a>
    <button class="iconbtn rc-x" type="button" data-act="rc-later" aria-label="Not now">${icon('close')}</button></div>`;
}
const twoLines = c => c.replace(/^((?:.{4}-){3}.{4})-/, '$1\n');

function showPending() {
  setView('pending', 'pane');
  pane.innerHTML = `
    <div class="lh pend-h"><button class="menu-btn" type="button" data-act="rail" aria-label="Folders and settings">${icon('menu')}</button><span class="word pend-w">foldoy</span></div>
    <div class="u-fill72 blank"><div class="state">
      ${isNew() ? '' : `<img class="art" src="${artFor('address', S.me.address.split('@')[1])}" alt="">`}
      ${S.me.waiting_for === 'plan' ? `<h2>Your mailbox opens with foldoy+.</h2>
      <p><b>${esc(S.me.address)}</b> is held for you. @${esc(S.me.address.split('@')[1])} mailboxes come with foldoy+.</p>
      <div class="acts"><a class="pill light md" href="${PLANS_URL}">Get foldoy+</a><a class="pill soft md" href="#/settings">Settings</a></div>` : `<h2>Your mailbox is being set up.</h2>
      <p><b>${esc(S.me.address)}</b> is yours.</p>
      <div class="acts"><a class="pill light md" href="#/settings">Settings</a></div>`}
      ${rcNoticeHtml() ? `<div class="u-mt32">${rcNoticeHtml()}</div>` : ''}
    </div></div>`;
}

function fromDraft(c, m) {
  const list = xs => (xs || []).map(a => a.addr).join(', ');
  for (const p of [...(m.to || []), ...(m.cc || []), ...(m.bcc || [])]) if (p?.name && p.addr) (c.names ||= {})[p.addr] = p.name;
  const files = (m.attachments || []).map(a => ({ name: a.name, type: a.type || 'application/octet-stream', size: a.size || 0, bytes: null, from: { m, a } }));
  return Object.assign(c, { from: m.from?.addr || c.from, to: list(m.to), cc: list(m.cc), bcc: list(m.bcc), subject: m.subject, text: m.text || '', html: m.html || null, draftId: m.id, files });
}
function startCompose(mode, m) {
  if (m?.pending) {
    const id = m.id, t0 = Date.now();
    const wait = () => { if (S.open?.id !== id || Date.now() - t0 > 10000) return; if (S.open.pending) return void setTimeout(wait, 50); startCompose(mode, S.open); };
    return wait();
  }
  if (m && ['reply', 'replyall', 'forward'].includes(mode) && S.parked?.[m.id]?.mode === mode) {
    const c = S.parked[m.id]; delete S.parked[m.id]; c.resumed = true;
    S.compose = c; S.back = location.hash.startsWith('#/compose') ? S.back : location.hash || '#/f/inbox'; location.hash = '#/compose'; return;
  }
  const me = S.me.primary_address || S.me.address;
  const re = s => (/^re:/i.test(s) ? s : `Re: ${s}`), fw = s => (/^fwd?:/i.test(s) ? s : `Fwd: ${s}`);
  const quoted = m ? `\n\nOn ${full(m.date)}, ${nameOf(m.from)} wrote:\n${(m.text || '').split('\n').map(l => '> ' + l).join('\n')}` : '';
  const fromAddr = m?.via_alias || me;
  const sig = S.me.signature && mode !== 'draft' ? `\n\n-- \n${S.me.signature}` : '';
  const c = { mode, ref: m?.id || null, from: fromAddr, to: '', cc: '', bcc: '', subject: '', text: '', draftId: null, files: [], dirty: false,
    names: Object.fromEntries((m ? [m.from, ...(m.to || []), ...(m.cc || [])] : []).filter(p => p?.name && p.addr).map(p => [p.addr, p.name])),
    orig: m && mode !== 'draft' ? { who: nameOf(m.from), addr: m.from.addr, date: m.date, subject: m.subject, text: m.text || '' } : null };
  if (mode === 'reply' || mode === 'replyall') {
    c.to = m.from.addr === me ? m.to.map(a => a.addr).join(', ') : m.from.addr;
    if (mode === 'replyall') { const inTo = new Set(c.to.split(',').map(x => x.trim().toLowerCase())); c.cc = [...new Set([...m.to, ...(m.cc || [])].map(a => a.addr))].filter(a => a !== me && a !== fromAddr && a !== m.from.addr && !inTo.has(a.toLowerCase())).join(', '); }
    c.subject = re(m.subject); c.text = sig; c.quote = m.from.addr === ORDERS ? '' : quoted;
  } else if (mode === 'forward') { c.files = (m.attachments || []).filter(a => !shownInline(m, a)).map(a => ({ name: a.name, type: a.type || 'application/octet-stream', size: a.size || 0, bytes: null, from: { m, a } })); c.subject = fw(m.subject); c.fwd = `Forwarded message from ${nameOf(m.from)} <${m.from.addr}>, ${full(m.date)}\nSubject: ${m.subject}\n\n${(m.text || '').replace(/\s+$/, '')}`; c.text = `${sig}\n\n${c.fwd}`; }
  else if (mode === 'draft') fromDraft(c, m);
  else c.text = sig;
  S.compose = c;
  S.back = location.hash.startsWith('#/compose') ? S.back : location.hash || '#/f/inbox';
  location.hash = '#/compose';
}
async function showCompose() {
  if (!S.compose) {
    let kept = null; try { kept = JSON.parse(sessionStorage.getItem('foldoy-composing') || 'null'); } catch (_) {  }
    if (typeof kept === 'string') kept = { id: kept };
    const m = kept?.id ? await mail.read(kept.id, S.me, { images: S.me.images !== false }).catch(() => null) : null;
    if (!m || m.folder !== 'drafts') { location.replace(S.back || '#/f/inbox'); return; }
    if (kept.ref && !phone()) {
      S.resume = { ref: kept.ref, mode: kept.mode, draft: m };
      const back = kept.back || '#/f/inbox';
      location.replace(back.endsWith(`/${kept.ref}`) ? back : `${back}/${kept.ref}`); return;
    }
    if (!phone() && !list.querySelector('.rows[data-k]')) await showMail({ folder: S.folder || 'inbox' });
    startCompose('draft', m);
  }
  const c = S.compose;
  if (location.hash !== '#/compose') return;
  if (!S.aliases.length) S.aliases = await api.aliases();
  if (S.me.address_limit && !S.addresses) S.addresses = await api.addresses().catch(() => []);
  const froms = [...new Set([S.me.primary_address, S.me.address, ...(S.addresses || []).map(a => a.address), ...(S.me.plan === 'free' ? [] : S.aliases.filter(a => a.active).map(a => a.address))].filter(Boolean))];
  if (!phone() && !list.querySelector('.rows[data-k]')) await showMail({ folder: S.folder });
  const title = { reply: 'Reply', replyall: 'Reply all', forward: 'Forward', draft: 'Draft', new: 'New message' }[c.mode];
  const inline = !phone() && ['reply', 'replyall', 'forward'].includes(c.mode) && S.open?.id === c.ref && !!$('.reader', pane);
  const dock = !phone() && !inline && !!list.querySelector('.rows');
  if (!dock) setView('mail', 'pane');
  const html = `
    <form class="compose${inline ? ' inline' : ''}" id="cform" novalidate>
      <div class="in">
        <div class="tools">
          <button class="iconbtn back" type="button" data-act="cclose" aria-label="Close">${icon('back')}</button>
          <h2 class="c-h">${title}</h2><span class="sp"></span>
          <button class="iconbtn" type="button" data-act="cclose" title="Close and keep the draft (Esc)" aria-label="Close and keep the draft" data-desk-only>${icon('close')}</button>
        </div>
        <div class="cf">
          <div class="cr"><span class="lb" id="lfrom">From</span>
            <select id="cfrom" aria-labelledby="lfrom">${froms.map(f => `<option ${f === c.from ? 'selected' : ''}>${esc(f)}</option>`).join('')}${S.me.plan !== 'free' ? '<option value="__new">New alias…</option>' : ''}</select>
            ${froms.length > 1 ? `<span class="chevs"><svg class="i" viewBox="0 0 20 20" aria-hidden="true"><path d="M6 8l4 4 4-4"/></svg></span>` : ''}</div>
          <div class="cr"><label for="cto">To</label><input id="cto" type="email" multiple autocomplete="off" autocapitalize="none" spellcheck="false" value="${esc(c.to)}">
            <button class="tgl" type="button" data-act="cc" tabindex="-1" ${c.cc || c.bcc ? 'hidden' : ''}>Cc Bcc</button></div>
          <div class="cr" id="rcc" ${c.cc || c.bcc ? '' : 'hidden'}><label for="ccc">Cc</label><input id="ccc" type="email" multiple autocomplete="off" autocapitalize="none" value="${esc(c.cc)}"></div>
          <div class="cr" id="rbcc" ${c.cc || c.bcc ? '' : 'hidden'}><label for="cbcc">Bcc</label><input id="cbcc" type="email" multiple autocomplete="off" autocapitalize="none" value="${esc(c.bcc)}"></div>
          <div class="cr"><label for="csub">Subject</label><input id="csub" autocomplete="off" value="${esc(c.subject)}"></div>
        </div>
        <div class="cfmt" role="toolbar" aria-label="Formatting">
          <button type="button" tabindex="-1" data-fmt="bold" aria-label="Bold (Ctrl B)"><b>B</b></button><button type="button" tabindex="-1" data-fmt="italic" aria-label="Italic (Ctrl I)"><i>I</i></button>
          <button type="button" tabindex="-1" data-fmt="link" aria-label="Link (Ctrl K)"><svg class="i" viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true"><path d="M8.5 11.5a3 3 0 004.2 0l2.6-2.6a3 3 0 00-4.2-4.2l-1 1"/><path d="M11.5 8.5a3 3 0 00-4.2 0l-2.6 2.6a3 3 0 004.2 4.2l1-1"/></svg></button>
          <span class="fsep" aria-hidden="true"></span>
          <button type="button" tabindex="-1" data-fmt="insertUnorderedList" aria-label="Bulleted list"><svg class="i" viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true"><path d="M8 6h9M8 10h9M8 14h9"/><circle cx="4.5" cy="6" r=".9" fill="currentColor"/><circle cx="4.5" cy="10" r=".9" fill="currentColor"/><circle cx="4.5" cy="14" r=".9" fill="currentColor"/></svg></button>
          <button type="button" tabindex="-1" data-fmt="insertOrderedList" aria-label="Numbered list"><svg class="i" viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true"><path d="M8.5 6h8.5M8.5 10h8.5M8.5 14h8.5"/><path d="M3.5 4.5h1v3M3.3 12.5c.4-.5 1.7-.6 1.7.4 0 .8-1.8 1.4-1.8 2.1h1.9" stroke-width="1.1"/></svg></button>
          <button type="button" tabindex="-1" data-fmt="quote" aria-label="Quote"><svg class="i" viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true"><path d="M5 5v10M9 7h7M9 10h7M9 13h5"/></svg></button>
        </div>
        <div class="cbody ced" id="ced" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Message" spellcheck="true">${c.html ? safeRich(c.html) : fwdRich(c)}</div>
        <textarea id="ctext" hidden aria-hidden="true" tabindex="-1">${esc(c.text)}</textarea>
        <div class="chips" id="cfiles"></div>
        <div class="who-gets" id="cwho" aria-live="polite"></div>
        ${c.lock ? `<div class="lockf" id="lockf">
          <div class="lf-row lf-pw"><label class="label" for="lkpw">Password</label><span class="lf-in"><input id="lkpw" type="text" autocomplete="off" spellcheck="false" value="${esc(c.lock.pw || '')}" placeholder="12 characters or more"><button class="iconbtn" type="button" data-act="copypw" title="Copy password" aria-label="Copy password">${icon('copy')}</button></span></div>
          <div class="lf-row"><label class="label" for="lkhint">Hint <span>optional</span></label><input id="lkhint" type="text" autocomplete="off" maxlength="120" value="${esc(c.lock.hint || '')}"></div>
          <div class="lf-row"><label class="label" for="lkdays">Can be opened for</label><select id="lkdays">${[[1, '1 day'], [7, '1 week'], [28, '4 weeks']].map(([d, l]) => `<option value="${d}" ${+c.lock.days === d ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <p class="say">They get a link to open it. Send them the password another way, not in this email.</p>
        </div>` : ''}
        <div id="laterbox"></div>
        <div id="cwall">${c.wall || ''}</div>
        ${cantSend() ? `<p class="cwait">${S.me.sending?.suspended ? 'Sending is paused on this account while we look at unusual activity. Write to support@foldoy.com.' : `${sendWait()} <a href="#/settings/plan">Unlock sending</a>`}</p>` : ''}
        <div class="cfoot">
          <button class="pill light md" type="submit" id="csend" title="Send (Ctrl+Enter)" ${cantSend() ? 'disabled' : ''}>Send</button>
          <button class="pill soft md" type="button" data-act="later" title="Send later" aria-haspopup="menu" ${cantSend() ? 'disabled' : ''}>${icon('clock')}<span class="desk">Send later</span></button>
          <label class="u-ptr pill soft md" title="Attach">${icon('clip')}<span class="desk">Attach</span><input type="file" id="cfile" multiple hidden></label>
          <span class="st" id="cst" aria-live="polite"></span>
          <span class="sp"></span>
          ${c.quote ? '<button class="pill soft md" type="button" data-act="quote" title="Add the message you are answering, quoted">Quote</button>' : ''}
          <button class="pill ghost md" type="button" data-act="discard">Discard</button>
          <p class="say bad" id="cerr" aria-live="assertive"></p>
        </div>
        ${c.orig && !inline && c.mode !== 'forward' ? `<details class="orig"><summary><span class="o-who">${esc(c.orig.who)}</span><span class="o-sub">${esc(c.orig.subject || '(no subject)')}</span><time datetime="${c.orig.date}">${full(c.orig.date)}</time></summary>
          <div class="body">${quote(c.orig.text)}</div></details>` : ''}
      </div>
    </form>`;
  if (inline) {
    const was = $('#cform', pane); if (was) was.parentNode.removeChild(was);
    const bar = $('.reader .replybar', pane);
    bar.insertAdjacentHTML('beforebegin', html); bar.hidden = true;
    queueMicrotask(() => {
      const f = $('#cform'); if (!f) return;
      f.scrollIntoView({ block: 'end', behavior: 'auto' });
      const h = $('#rsubj', pane), t = $('.reader > .tools', pane); if (!h || !t) return;
      const hr = h.getBoundingClientRect(), tb = t.getBoundingClientRect().bottom;
      if (hr.top < tb && hr.bottom > tb) pane.scrollTop += hr.bottom - tb + 2;
    });
  } else if (dock) {
    let d = $('#dock'); if (!d) { d = document.createElement('div'); d.id = 'dock'; d.className = 'dock'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', title); document.body.append(d); }
    d.innerHTML = html;
  } else { pane.innerHTML = html; pane.scrollTop = 0; }
  const f = $('#cform');
  $('#cfrom').addEventListener('change', e => { if (e.target.value === '__new') composeAlias(); });
  ['cto', 'ccc', 'cbcc'].forEach(chips);
  renderFiles();
  f.addEventListener('input', e => { c.dirty = true; c.ver = (c.ver || 0) + 1; const st = $('#cst'); if (st && st.textContent) st.textContent = ''; read(); clearTimeout(c.t); c.t = setTimeout(() => saveDraft(), draftWait(c)); if (/^c(to|cc|bcc)$/.test(e.target.id)) { clearTimeout(c.w); c.w = setTimeout(whoGets, 350); } });
  whoGets();
  f.addEventListener('submit', e => { e.preventDefault(); send(); });
  if (S.out) outLook();
  $('#cfile').addEventListener('change', async e => {
    for (const file of e.target.files) {
      if (c.files.reduce((n, f) => n + f.size, 0) + file.size > 12e6) { $('#cerr').textContent = 'Files can be up to 12 MB in all.'; continue; }
      c.files.push({ name: file.name, type: file.type || 'application/octet-stream', size: file.size, bytes: new Uint8Array(await file.arrayBuffer()) });
    }
    e.target.value = ''; renderFiles(); filesChanged(c);
  });
  richEditor(c);
  const first = c.mode === 'reply' || c.mode === 'replyall' || (c.mode === 'forward' && c.to) ? $('#ced') : (c.to ? $('#csub') : $('#cto'));
  first.focus({ preventScroll: true });
  if (first.id === 'ced') { const r = document.createRange(); if (c.resumed) { r.selectNodeContents(first); r.collapse(false); } else { r.setStart(first, 0); r.collapse(true); } const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }
}
const RICH_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'A', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'BR', 'DIV', 'P']);
function safeRich(html) {
  const t = document.createElement('template'); t.innerHTML = html;
  const walk = n => { for (const k of [...n.childNodes]) {
    if (k.nodeType === 3) continue;
    if (k.nodeType !== 1 || !RICH_TAGS.has(k.tagName)) { if (k.nodeType === 1) { walk(k); k.replaceWith(...k.childNodes); } else k.parentNode.removeChild(k); continue; }
    for (const a of [...k.attributes]) if (!(k.tagName === 'A' && a.name === 'href' && /^(https?:|mailto:)/i.test(a.value))) k.removeAttribute(a.name);
    walk(k);
  } };
  walk(t.content); return t.innerHTML.replace(/\u200b/g, '');
}
const textToRich = t => esc(t || '').replace(/\n/g, '<br>');
function fwdRich(c) {
  if (phone() || c.mode !== 'forward' || !c.fwd || !c.text.endsWith(c.fwd)) return textToRich(c.text);
  const mine = c.text.slice(0, -c.fwd.length).replace(/\n+$/, '');
  return `${mine ? textToRich(mine) : '<div><br></div>'}<div class="cfwd">${textToRich(c.fwd)}</div>`;
}
function richText(ed) {
  const c = ed.cloneNode(true);
  for (const li of c.querySelectorAll('ol > li')) li.prepend(`${[...li.parentNode.children].indexOf(li) + 1}. `);
  for (const li of c.querySelectorAll('ul > li')) li.prepend('• ');
  for (const a of c.querySelectorAll('a[href]')) if (a.textContent.trim() !== a.getAttribute('href')) a.append(` (${a.getAttribute('href')})`);
  const box = Object.assign(document.createElement('div'), { style: 'position:fixed;left:-9999px;top:0;white-space:pre-wrap' });
  box.append(c); document.body.append(box);
  for (const f of c.querySelectorAll('.cfwd')) { const p = f.previousSibling; if (p && p.textContent.trim()) f.before(document.createElement('br')); }
  for (const q of c.querySelectorAll('blockquote')) q.innerText = q.innerText.split('\n').map(l => `> ${l}`).join('\n');
  const out = c.innerText.replace(/\u200b/g, '').replace(/\u00a0/g, ' ').replace(/\n{3,}/g, '\n\n'); box.parentNode.removeChild(box);
  return out;
}
const richUsed = ed => !!ed.querySelector('b, strong, i, em, a, ul, ol, blockquote');
function richEditor(c) {
  const ed = $('#ced'), ta = $('#ctext'), bar = $('.cfmt'); if (!ed || !ta) return;
  const sync = () => { ta.value = richText(ed); c.html = richUsed(ed) ? safeRich(ed.innerHTML) : null; c.text = ta.value; c.dirty = true; };
  ed.addEventListener('input', sync);
  ed.addEventListener('paste', e => { const t = e.clipboardData?.getData('text/plain'); if (t == null) return; e.preventDefault(); document.execCommand('insertText', false, t); });
  const link = () => {
    bar.querySelector('.linkpop')?.remove();
    const sel = getSelection(), range = sel && sel.rangeCount && ed.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null;
    const had = !!range && !range.collapsed;
    const pop = Object.assign(document.createElement('div'), { className: 'linkpop' });
    pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Add a link');
    pop.innerHTML = `<label><span>Link</span><input id="lkurl" autocomplete="off" autocapitalize="none" spellcheck="false" inputmode="url" placeholder="example.com"></label>
      <label><span>Text</span><input id="lktext" autocomplete="off" value="${esc(had ? range.toString() : '')}"${had ? ' disabled' : ''}></label>
      <div class="lkacts"><button type="button" class="pill ghost sm" data-lk="cancel">Cancel</button><button type="button" class="pill light sm" data-lk="ok">Add link</button></div>`;
    bar.append(pop);
    const cr = (range && (range.getClientRects()[0] || (range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement)?.getBoundingClientRect())) || ed.getBoundingClientRect();
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    pop.style.position = 'fixed';
    pop.style.left = `${Math.max(8, Math.min(cr.left, innerWidth - pw - 8))}px`;
    pop.style.top = `${cr.bottom + ph + 8 > innerHeight ? Math.max(8, cr.top - ph - 8) : cr.bottom + 8}px`;
    const done = ok => {
      const u = pop.querySelector('#lkurl').value.trim(), txt = pop.querySelector('#lktext').value.trim();
      pop.remove(); ed.focus();
      if (range) { const g = getSelection(); g.removeAllRanges(); g.addRange(range); }
      if (!ok || !u) return;
      const href = /^(https?:|mailto:)/i.test(u) ? u : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u) ? `mailto:${u}` : `https://${u}`;
      if (had) document.execCommand('createLink', false, href); else document.execCommand('insertHTML', false, `<a href="${esc(href)}">${esc(txt || u)}</a>\u200b`);
      sync();
    };
    pop.addEventListener('click', e => { const b = e.target.closest('[data-lk]'); if (b) done(b.dataset.lk === 'ok'); });
    pop.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); done(true); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); }
    });
    pop.querySelector('#lkurl').focus({ preventScroll: true });
  };
  ed.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); link(); } });
  bar?.addEventListener('mousedown', e => { if (e.target.closest('[data-fmt]') && !e.target.closest('.linkpop')) e.preventDefault(); });
  bar?.addEventListener('click', e => {
    const b = e.target.closest('[data-fmt]'); if (!b || b.closest('.linkpop')) return;
    if (b.dataset.fmt !== 'link') ed.focus();
    const f = b.dataset.fmt;
    if (f === 'link') return link();
    if (f === 'quote') document.execCommand('formatBlock', false, document.queryCommandValue('formatBlock') === 'blockquote' ? 'div' : 'blockquote');
    else document.execCommand(f);
    sync();
  });
  document.execCommand('defaultParagraphSeparator', false, 'div');
}
function read() {
  const c = S.compose; if (!c || !$('#cform')) return;
  const ed = $('#ced'); if (ed) { $('#ctext').value = richText(ed); c.html = richUsed(ed) ? safeRich(ed.innerHTML) : null; }
  Object.assign(c, { from: $('#cfrom').value === '__new' ? c.from : $('#cfrom').value, to: rcpt('cto'), cc: rcpt('ccc'), bcc: rcpt('cbcc'), subject: $('#csub').value, text: $('#ctext').value });
  if (c.lock && $('#lkpw')) Object.assign(c.lock, { pw: $('#lkpw').value, hint: $('#lkhint').value.trim(), days: +$('#lkdays').value });
}
const rcpt = id => [...$$(`#${id}-chips .rc`).map(x => x.dataset.a), ...people($('#' + id)?.value).map(x => x.addr)].join(', ');
const Q_HINTS = [['from:', 'Mail from someone'], ['to:', 'Mail to someone'], ['has:attachment', 'With files'], ['is:unread', 'Not read yet'], ['is:starred', 'Starred'], ['before:2026-01-01', 'Older than a date'], ['subject:', 'Words in the subject']];
let qPick = -1;
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.key === 'Shift' || e.key === 'Tab') return;
  if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
  if (!document.documentElement.hasAttribute('data-kbd')) document.documentElement.setAttribute('data-kbd', '');
}, true);
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || !document.documentElement.hasAttribute('data-rail-over')) return;
  e.preventDefault(); e.stopImmediatePropagation(); railOver(false); $('.rail-fold')?.focus({ preventScroll: true });
}, true);
document.addEventListener('mousemove', e => { if ((e.movementX || e.movementY) && document.documentElement.hasAttribute('data-kbd')) document.documentElement.removeAttribute('data-kbd'); }, { passive: true });
function qSuggestOff() { $('.qsug')?.parentNode?.removeChild($('.qsug')); qPick = -1; }
function qSuggest() {
  const inp = $('#q'); if (!inp || phone()) return;
  const v = inp.value, last = v.split(/\s+/).pop() || '', head = v.slice(0, v.length - last.length);
  let rows = [];
  if (!v.trim()) rows = Q_HINTS.map(([k, d]) => ({ fill: k, label: k, sub: d, go: !k.endsWith(':') }));
  else {
    const w = fold(last.replace(/^(from|to):/i, ''));
    const people = w.length < 1 ? [] : known().filter(p => fold(p.name).split(/\s+/).some(x => x.startsWith(w)) || p.addr.split(/[@._+-]/).some(x => x.startsWith(w))).slice(0, 5);
    rows = [{ fill: v, label: v, sub: 'Search', go: true }, ...people.map(p => ({ fill: `${head}from:${p.addr} `, label: p.name || p.addr, sub: `from:${p.addr}`, go: true, who: p }))];
    const words = v.trim().split(/\s+/).filter(x => x && !/^\w+:/.test(x)).map(fold);
    if (words.length && words.join('').length >= 2) {
      const seen = new Set(), hits = [];
      for (const m of [...(S.raw || []), ...S.items]) {
        if (seen.has(m.id) || m.locked) continue; seen.add(m.id);
        const hay = fold(`${m.subject || ''} ${m.from?.name || ''} ${m.from?.addr || ''} ${m.preview || ''}`);
        if (words.every(x => hay.includes(x))) hits.push(m);
        if (hits.length >= 4) break;
      }
      rows.push(...hits.map(m => ({ open: `#/f/${m.folder || S.folder}/${m.id}`, label: m.subject || '(no subject)', sub: nameOf(m.from), who: m.from, mail: true })));
    }
    if (/^[\w:]*$/.test(last) && last.length >= 1) rows.push(...Q_HINTS.filter(([k]) => k.startsWith(last.toLowerCase()) && k !== last.toLowerCase()).map(([k, d]) => ({ fill: head + k, label: k, sub: d, go: !k.endsWith(':') })));
  }
  let box = $('.qsug');
  if (!rows.length) return qSuggestOff();
  if (!box) { box = Object.assign(document.createElement('div'), { className: 'qsug', role: 'listbox' }); inp.closest('form').append(box); }
  qPick = Math.min(qPick, rows.length - 1);
  const h0 = box.isConnected && box.childElementCount ? box.getBoundingClientRect().height : 0;
  box.innerHTML = rows.map((r, i) => `<button type="button" tabindex="-1" role="option" class="qs${r.mail ? ' qm' : ''}" data-i="${i}" aria-selected="${i === qPick}">${r.who ? avatar(r.who, ' qav') : `<span class="qic">${icon(r.sub === 'Search' ? 'search' : 'dot')}</span>`}<span class="ql">${esc(r.label)}</span><span class="qd">${esc(r.sub)}</span></button>`).join('');
  box.__rows = rows;
  box.style.height = '';
}
function qTake(r) {
  const inp = $('#q'); if (!inp || !r) return;
  if (r.open) { qSuggestOff(); inp.blur(); location.hash = r.open; return; }
  inp.value = r.fill; qPick = -1;
  if (r.go) { qSuggestOff(); inp.closest('form').requestSubmit(); } else { inp.focus(); qSuggest(); }
}
document.addEventListener('mousedown', e => { const b = e.target.closest('.qsug .qs'); if (!b) return; e.preventDefault(); qTake($('.qsug').__rows[+b.dataset.i]); });
document.addEventListener('keydown', e => {
  if (document.activeElement?.id !== 'q' || !$('.qsug')) return;
  const rows = $('.qsug').__rows || [];
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopImmediatePropagation(); qPick = e.key === 'ArrowDown' ? (qPick + 1 >= rows.length ? -1 : qPick + 1) : (qPick - 1 < -1 ? rows.length - 1 : qPick - 1); qSuggest(); }
  else if (e.key === 'Enter' && qPick >= 0) { e.preventDefault(); e.stopImmediatePropagation(); qTake(rows[qPick]); }
  else if (e.key === 'Escape') { qSuggestOff(); }
}, true);
function known() {
  const k = new Map();
  for (const m of S.items) for (const p of [m.from, ...(m.to || []), ...(m.cc || [])]) if (p?.addr && p.addr !== S.me.address && !k.has(p.addr)) k.set(p.addr, p.name || '');
  return [...k].map(([addr, name]) => ({ addr, name }));
}
function chips(id) {
  const inp = $('#' + id); if (!inp) return;
  const row = inp.closest('.cr');
  inp.insertAdjacentHTML('beforebegin', `<span class="rcs" id="${id}-chips"></span>`);
  inp.insertAdjacentHTML('afterend', `<div class="sug" id="${id}-sug" role="listbox" aria-label="Suggestions" hidden></div>`);
  inp.setAttribute('role', 'combobox'); inp.setAttribute('aria-autocomplete', 'list'); inp.setAttribute('aria-controls', `${id}-sug`); inp.setAttribute('aria-expanded', 'false');
  inp.type = 'text';
  const box = $(`#${id}-chips`), sug = $(`#${id}-sug`), nm = NAMES();
  let pick = -1;
  const draw = list => {
    box.innerHTML = list.map(a => `<span class="rc${okAddr(a) ? '' : ' bad'}" data-a="${esc(a)}" title="${esc(okAddr(a) ? a : `${a} is not an email address`)}"><span class="rcn">${esc(nm[a] || nameFor(a) || a)}</span><button type="button" aria-label="Remove ${esc(a)}" data-rc>${icon('close')}</button></span>`).join('');
  };
  const add = v => { if (!S.compose) return; const now = [...$$('.rc', box).map(x => x.dataset.a)]; for (const { addr: a, name } of people(v)) { if (name && !S.compose.names?.[a]) (S.compose.names ||= {})[a] = name; if (!now.includes(a)) now.push(a); } draw(now); inp.value = ''; hide(); S.compose.dirty = true; read(); clearTimeout(S.compose.w); S.compose.w = setTimeout(whoGets, 50); };
  const hide = () => { sug.hidden = true; inp.setAttribute('aria-expanded', 'false'); pick = -1; };
  const show = () => {
    const q = inp.value.trim().toLowerCase(), have = new Set($$('.rc', box).map(x => x.dataset.a));
    const hits = q ? known().filter(k => !have.has(k.addr) && (k.addr.includes(q) || k.name.toLowerCase().includes(q))).slice(0, 6) : [];
    sug.innerHTML = hits.map((k, i) => `<div class="so" role="option" id="${id}-o${i}" data-a="${esc(k.addr)}">${k.name ? `<b>${esc(k.name)}</b>` : ''}<span>${esc(k.addr)}</span></div>`).join('');
    sug.hidden = !hits.length; inp.setAttribute('aria-expanded', String(!!hits.length));
    pick = hits.length ? 0 : -1;
    if (hits.length) { $('.so', sug).setAttribute('aria-selected', 'true'); inp.setAttribute('aria-activedescendant', `${id}-o0`); } else inp.removeAttribute('aria-activedescendant');
  };
  draw(addrs(inp.value)); inp.value = '';
  inp.addEventListener('input', e => { const v = inp.value; if (/[,;]$/.test(v) && v.trim().replace(/[,;]$/, '') && !halfQuoted(v.slice(0, -1))) add(v); else if (/\s$/.test(v) && okAddr(v.trim())) add(v); else show(); });
  inp.addEventListener('paste', e => {
    const t = e.clipboardData?.getData('text/plain'); if (!t || !t.includes('@')) return;
    const got = people(inp.value + t); if (!got.some(x => okAddr(x.addr))) return;
    e.preventDefault(); add(inp.value + t);
  });
  const take = () => {
    const v = inp.value.trim().replace(/[,;]$/, ''); if (!v) return false;
    if (okAddr(v)) { add(v); return true; }
    const w = fold(v), hit = known().find(p => fold(p.name || '').split(/\s+/).some(x => x.startsWith(w)) || p.addr.split(/[@._+-]/).some(x => x.startsWith(w)));
    if (hit) { add(hit.addr); return true; }
    show(); return false;
  };
  inp.addEventListener('keydown', e => {
    const opts = $$('.so', sug);
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && opts.length) {
      e.preventDefault(); pick = (pick + (e.key === 'ArrowDown' ? 1 : opts.length - 1) + (pick < 0 && e.key === 'ArrowUp' ? 1 : 0)) % opts.length;
      opts.forEach((o, i) => o.setAttribute('aria-selected', String(i === pick))); inp.setAttribute('aria-activedescendant', opts[pick].id);
    } else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      if (pick >= 0 && opts[pick]) add(opts[pick].dataset.a); else if (inp.value.trim()) take();
    }
    else if (e.key === 'Tab' && inp.value.trim()) { if (pick >= 0 && opts[pick]) add(opts[pick].dataset.a); else take(); }
    else if (e.key === 'Backspace' && !inp.value) { const last = $$('.rc', box).pop(); if (last) { last.remove(); read(); whoGets(); } }
    else if (e.key === 'Escape' && !sug.hidden) { e.preventDefault(); e.stopPropagation(); hide(); }
  });
  inp.addEventListener('blur', () => setTimeout(() => { if (document.activeElement?.closest?.(`#${id}-sug`)) return; if (inp.value.trim()) add(inp.value); hide(); }, 120));
  sug.addEventListener('mousedown', e => { const o = e.target.closest('.so'); if (o) { e.preventDefault(); add(o.dataset.a); inp.focus(); } });
  box.addEventListener('click', e => { const b = e.target.closest('[data-rc]'); if (b) { b.closest('.rc').remove(); read(); whoGets(); inp.focus(); } });
  row.addEventListener('click', e => { if (e.target === row || e.target === box) inp.focus(); });
}
function renderFiles() {
  const c = S.compose, h = $('#cfiles'); if (!h) return;
  h.innerHTML = c.files.map((a, i) => `<div class="att"><span class="t"><b>${esc(a.name)}</b><span>${size(a.size)}</span></span><button class="iconbtn" type="button" data-rmfile="${i}" aria-label="Remove ${esc(a.name)}">${icon('close')}</button></div>`).join('');
}
const addrs = s => (s || '').split(/[,;\s]+/).map(x => x.trim()).filter(Boolean);
function people(t) {
  const out = [], parts = [];
  let cur = '', q = false, ang = false;
  for (const ch of String(t || '')) {
    if (ch === '"' && !ang) q = !q;
    else if (ch === '<' && !q) ang = true;
    else if (ch === '>' && !q) ang = false;
    if (!q && !ang && /[,;\n\r]/.test(ch)) { parts.push(cur); cur = ''; } else cur += ch;
  }
  parts.push(cur);
  for (const raw of parts) {
    const seg = raw.trim(); if (!seg) continue;
    const m = seg.match(/^(.*?)<\s*(?:mailto:)?([^<>\s]+)\s*>\s*$/i);
    if (m) { out.push({ addr: m[2], name: m[1].trim().replace(/^"(.*)"$/, '$1').replace(/\\(.)/g, '$1').trim() }); continue; }
    const words = seg.split(/\s+/).map(w => w.replace(/^mailto:/i, '')), at = words.filter(w => w.includes('@'));
    if (at.length === 1 && words.length > 1) out.push({ addr: at[0], name: words.filter(w => !w.includes('@')).join(' ').replace(/^"(.*)"$/, '$1') });
    else for (const w of words) out.push({ addr: w, name: '' });
  }
  return out;
}
const halfQuoted = v => ((v.match(/"/g) || []).length % 2 === 1) || v.lastIndexOf('<') > v.lastIndexOf('>');
const okAddr = a => /^[^@\s<>()]+@[^@\s<>()]+\.(?:[a-z]{2,}|xn--[a-z0-9]{1,59})$/i.test(a);
const NAMES = () => { const n = {}; for (const m of S.items) for (const p of [m.from, ...m.to]) if (p.name) n[p.addr] = p.name; return n; };
const list3 = a => (a.length < 3 ? a.join(' and ') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
async function whoGets() {
  const c = S.compose, box = $('#cwho'); if (!c || !box) return;
  read();
  const all = [...addrs(c.to), ...addrs(c.cc), ...addrs(c.bcc)];
  if (!all.length) { box.innerHTML = ''; return; }
  const k = await mail.classify(all), nm = NAMES(), who = a => nm[a] || a;
  if (S.compose !== c) return;
  const lines = [];
  if (k.e2e.length) lines.push(`<p class="ok">${icon('key')}<span>End-to-end: only ${esc(list3([...k.e2e.map(x => who(x.addr)), 'you']))} can read this.</span></p>`);
  if (k.plain.length && !c.lock) lines.push(`<p><span>${k.e2e.length ? 'Ordinary mail for ' + esc(list3(k.plain)) + '. It leaves foldoy readable.' : 'Ordinary mail. Outside addresses get it readable.'}</span><button class="linkbtn" type="button" data-act="lockon">Encrypt with a password</button></p>`);
  if (k.plain.length && c.lock) lines.push(`<p class="ok lockline">${icon('lock')}<span>Password-encrypted for ${esc(list3(k.plain))}</span><button class="linkbtn" type="button" data-act="lockoff">Don't encrypt</button></p>`);
  c.outsiders = k.plain;
  if (k.unknown.length) lines.push(`<p class="bad"><span>No foldoy account has ${esc(list3(k.unknown))}.</span></p>`);
  for (const x of k.changed) if (!(c.accept_keys || []).includes(x.now)) lines.push(`<p class="bad"><span>${esc(who(x.addr))}'s key changed since you first saw it. Check the fingerprint with them before you send. Send asks you first.</span></p>`);
  box.innerHTML = lines.join('');
}
const nameFor = a => S.compose?.names?.[a] || NAMES()[a] || knownName(a) || '';
const namesOf = c => Object.fromEntries([...addrs(c.to), ...addrs(c.cc), ...addrs(c.bcc)].map(a => [a.toLowerCase(), (c.names?.[a] || NAMES()[a] || knownName(a) || '').replace(/[\r\n]/g, ' ').slice(0, 120)]).filter(x => x[1]));
const OUT_STYLE = 'font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.5; color: #000000; background-color: #ffffff;';
const textHtml = t => esc(t || '').replace(/\r\n?/g, '\n').split('\n').map(l => l || '<br>').map(l => (l === '<br>' ? '<div><br></div>' : `<div>${l}</div>`)).join('');
const outHtml = c => (c.html || (c.text || '').trim() ? `<div style="${OUT_STYLE}">${c.html || textHtml(c.text)}</div>` : undefined);
function body(c, out = false) { return { from: c.from, to: addrs(c.to), cc: addrs(c.cc), bcc: addrs(c.bcc), names: namesOf(c), subject: c.subject, text: c.text, html: out ? outHtml(c) : c.html || undefined, in_reply_to: c.ref, files: c.files, draft_id: c.draftId, send_at: c.send_at || undefined, lock: !!c.lock, accept_keys: c.accept_keys || [], send_key: out ? keyFor(c) : undefined }; }
const keyFor = c => { const now = JSON.stringify([c.from, c.to, c.cc, c.bcc, c.subject, c.text, c.html || '', (c.files || []).map(f => [f.name, f.size]), c.send_at || '', c.lock ? [c.lock.pw, c.lock.days, c.lock.hint] : 0]); const m = (c.sendKeys ||= new Map()); if (!m.has(now)) m.set(now, sendKey()); return m.get(now); };
const sendErr = x => (x instanceof TypeError ? "The connection dropped before foldoy answered, so it may have gone. Press Send again: it won't go twice." : x.message);
const sendKey = () => Array.from(crypto.getRandomValues(new Uint8Array(18)), b => b.toString(16).padStart(2, '0')).join('');
async function sendNow(c) {
  const b = body(c, true);
  const outside = c.lock ? (await mail.classify([...b.to, ...b.cc, ...b.bcc])).plain : [];
  if (c.lock && outside.length) {
    const armored = await pgp.lockWithPassword({ subject: c.subject, text: c.text }, c.lock.pw);
    const r = await api.lockedCreate(armored, c.lock.days, c.lock.hint, c.from);
    const until = new Date(r.expires).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
    b.outside = { subject: `An encrypted message from ${c.from}`,
      text: `${c.from} sent you an encrypted message.\n\nOpen it here:\n${r.url}\n\nIt opens with a password they give you another way${c.lock.hint ? ` (hint: ${c.lock.hint})` : ''}. You can open it until ${until}.\n` };
  }
  return mail.send(b, S.me);
}
const draftWait = c => (!S.out && (c.files || []).reduce((n, f) => n + (f.size || 0), 0) > 1e6 ? Math.max(500, (c.savedAt || 0) + 60000 - Date.now()) : 500);
function filesChanged(c) { if (!c || S.compose !== c) return; c.dirty = true; c.ver = (c.ver || 0) + 1; clearTimeout(c.t); c.t = setTimeout(() => saveDraft(), 300); }
async function saveDraft(quiet) {
  const c = S.compose; if (!c || !c.dirty) return true;
  if (c.saving) { await c.saving; if (!c.dirty) return true; }
  let done; c.saving = new Promise(r => { done = r; });
  try { return await saveDraftNow(c, quiet); } finally { c.saving = null; done(); }
}
async function saveDraftNow(c, quiet) {
  if (!c.dirty) return true;
  if (S.out) return keptInstead(c);
  if (S.compose === c) read();
  if (!c.to && !c.subject && !c.text.trim() && !c.files.length) return true;
  const v = c.ver || 0;
  const missed = [];
  for (const f of c.files) if (!f.bytes && f.from) { try { f.bytes = await fileBytes(f.from.m, f.from.a); } catch { missed.push(f.name); } }
  try { const r = await mail.saveDraft(c.draftId, body(c)); c.draftId = r.id; c.savedAt = Date.now(); c.saveErr = null; c.saveNote = missed.length ? `Draft saved without ${list3(missed)}` : null; c.dirty = (c.ver || 0) !== v; try { sessionStorage.setItem('foldoy-composing', JSON.stringify({ id: r.id, ref: ['reply', 'replyall', 'forward'].includes(c.mode) ? c.ref : null, mode: c.mode, back: S.back })); } catch (_) {  } if (!quiet) { const st = $('#cst'); if (st) st.textContent = c.saveNote || 'Draft saved'; } if (!$('#memenu') || $('#memenu').hidden) railQuiet(); return true; }
  catch (x) { if (S.out) return keptInstead(c); c.saveErr = x.message || "the server didn't answer"; if (!quiet) { const st = $('#cst'); if (st) st.textContent = "Draft not saved"; } return false; }
}

const KEPT_FLAG = 'foldoy-kept';
const keptFlag = () => { try { return localStorage.getItem(KEPT_FLAG) === '1'; } catch (_) { return false; } };
const KEPT_DAYS = 60;
function keep(c) { if (!c) return Promise.resolve(false); const run = (c.keeping || Promise.resolve()).catch(() => {}).then(() => keepNow(c)); c.keeping = run; return run; }
async function keepNow(c) {
  const pub = S.me && S.me.key && S.me.key.public_key;
  if (!c || c.gone || !pub || !S.me.address) return false;
  if (S.compose === c) read();
  if (!c.to && !c.subject && !(c.text || '').trim() && !c.files.length) return true;
  c.keptId = c.keptId || sendKey();
  const b = body(c);
  const files = c.files.filter(f => f.bytes).map(f => ({ id: (f.keptId = f.keptId || sendKey()), name: f.name, type: f.type, size: f.size, bytes: typeof f.bytes === 'function' ? f.bytes() : f.bytes }));
  const words = { from: b.from, to: b.to, cc: b.cc, bcc: b.bcc, names: b.names, subject: b.subject, text: b.text, html: b.html, files: files.map(f => ({ id: f.id, name: f.name, type: f.type, size: f.size })),
    missed: c.files.filter(f => !f.bytes).map(f => f.name),
    draftId: c.draftId || null, mode: c.mode || null, ref: ['reply', 'replyall', 'forward'].includes(c.mode) ? c.ref : null, back: S.back || '#/f/inbox' };
  try { await pgp.keptPut(S.me.address, c.keptId, words, files, pub); c.kept = true; (S.keptIds = S.keptIds || new Set()).add(c.keptId); try { localStorage.setItem(KEPT_FLAG, '1'); } catch (_) {  } }
  catch (_) { c.kept = false; }
  if (c.gone) { await pgp.keptDrop(S.me.address, c.keptId).catch(() => {}); c.kept = false; if (S.keptIds) S.keptIds.delete(c.keptId); return false; }
  const st = S.compose === c && $('#cst'); if (st) st.textContent = c.kept ? 'Kept on this device' : 'Not saved';
  if (S.out && S.compose === c) outLook();
  return c.kept;
}
async function keptInstead(c) { const ok = await keep(c); c.saveErr = ok ? null : "you've been signed out, and this browser couldn't keep it"; c.saveNote = ok ? 'Kept on this device' : null; return ok; }
addEventListener('foldoy-signed-out', () => { if (!S.me || !S.me.address || S.leaving) return; signedOut().catch(() => {}); });
async function signedOut() {
  S.out = true;
  const o = S.outbox;
  if (o && !o.c.delivering) { clearTimeout(o.timer); S.outbox = null; await putBack(o.c); }
  if (S.compose) await keep(S.compose);
  outNotice();
}
async function putBack(c) {
  c.sent = false; c.delivering = false;
  if (!S.compose) { S.compose = c; if (!/^#\/compose/.test(location.hash)) S.back = location.hash || '#/f/inbox'; if (location.hash === '#/compose') showCompose(); else location.hash = '#/compose'; }
  await keep(c);
}
const OUT_KEPT = "You've been signed out. What you wrote is kept on this device, encrypted.";
const OUT_LOST = "You've been signed out. What you wrote couldn't be kept on this device: copy it before you sign in.";
const signIn = () => { S.leaving = true; location.href = '/login/'; };
function outLook() {
  const c = S.compose, b = $('#csend'), err = $('#cerr'); if (!c || !b || !err) return false;
  b.textContent = 'Sign in'; b.title = 'Sign in to send this'; b.dataset.out = '1'; b.disabled = false;
  const later = $('#cform [data-act="later"]'); if (later) later.disabled = true;
  const wrote = c.to || c.subject || (c.text || '').trim() || c.files.length;
  err.textContent = !wrote ? "You've been signed out." : c.kept === false ? OUT_LOST : OUT_KEPT;
  const t = $('.toast'); if (t) t.classList.remove('on');
  return true;
}
function outNotice() {
  clearTimeout(S.outT);
  S.outT = setTimeout(() => {
    if (outLook()) return;
    toast(S.keptIds && S.keptIds.size ? OUT_KEPT : "You've been signed out.", { label: 'Sign in', run: signIn }, 6 * 3600e3);
  }, 150);
}
async function notSentOut(c) {
  const said = $('#csend') && $('#csend').dataset.out, ok = await keep(c);
  if (!said) { outLook(); return; }
  if (!ok && !confirm("What you wrote couldn't be kept on this device. Signing in now will lose it.\n\nSign in anyway?")) return;
  signIn();
}
let probing = false;
async function backIn() {
  if (probing || S.leaving) return; probing = true;
  try { await api.session(); } catch (_) { probing = false; return; }
  if (S.compose) await keep(S.compose);
  S.leaving = true; location.reload();
}
async function keptFirst() {
  let recs = []; try { recs = await pgp.keptList(); } catch (_) { return; }
  const now = Date.now(), fresh = r => now - r.at <= KEPT_DAYS * 86400e3;
  for (const r of recs.filter(r => !fresh(r))) await pgp.keptDrop(r.address, r.id).catch(() => {});
  const mine = recs.filter(r => fresh(r) && r.address === S.me.address).sort((x, y) => x.at - y.at);
  if (!recs.some(fresh)) { try { localStorage.removeItem(KEPT_FLAG); } catch (_) {  } }
  if (!mine.length) return;
  try { sessionStorage.removeItem('foldoy-composing'); } catch (_) {  }
  if (/^#\/compose/.test(location.hash)) history.replaceState(null, '', '#/f/inbox');
  bringBack(mine).catch(() => {});
}
const okId = v => { const t = typeof v === 'number' ? String(v) : v; return typeof t === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(t) ? t : null; };
async function bringBack(mine) {
  const coming = 'Bringing back the message you were writing.';
  const slow = setTimeout(() => { if (!S.out && !S.leaving && !S.compose) toast(coming, null, 120000); }, 1500);
  try { return await bringBackNow(mine); }
  finally { clearTimeout(slow); const t = $('.toast.on'); if (t && t.textContent.startsWith(coming)) t.classList.remove('on'); }
}
async function bringBackNow(mine) {
  if (S.ring) await S.ring;
  let last = null, why = '', missed = [], n = 0;
  for (const rec of mine) {
    let k; try { k = await pgp.keptOpen(rec); } catch (_) { why = "this account's key doesn't open it"; continue; }
    const w = k.words, c = { ...w, files: (w.files || []).filter(f => k.files[f.id]).map(f => ({ name: f.name, type: f.type, bytes: k.files[f.id] })) };
    const draftId = okId(w.draftId);
    let r = null;
    try { r = await mail.saveDraft(draftId, c); }
    catch (x) {
      if (draftId && x.status && x.status !== 401) { try { r = await mail.saveDraft(null, c); } catch (y) { why = y.message || "the server didn't answer"; } }
      else why = x.message || "the server didn't answer";
    }
    if (!r || !r.id) continue;
    await pgp.keptDrop(rec.address, rec.id).catch(() => {});
    last = { id: r.id, ref: okId(w.ref), mode: ['reply', 'replyall', 'forward'].includes(w.mode) ? w.mode : undefined, back: typeof w.back === 'string' && /^#\/[A-Za-z0-9/_%.~+@=-]*$/.test(w.back) ? w.back : '#/f/inbox' }; n++;
    missed = missed.concat(w.missed || []);
  }
  if (!(await pgp.keptList().catch(() => [1])).length) { try { localStorage.removeItem(KEPT_FLAG); } catch (_) {  } }
  if (S.out || S.leaving) return;
  if (n) railSoon();
  const again = { label: 'Try again', run: () => keptFirst().catch(() => {}) };
  if (why) return toast(`What you wrote before you were signed out is still kept on this device. It couldn't go to Drafts: ${why.replace(/\.+$/, '')}.`, again, 30000);
  if (!last) return;
  if (S.compose) {
    const said = n > 1 ? 'What you wrote before you were signed out is in Drafts.' : 'The message you were writing before you were signed out is in Drafts.';
    const t = setInterval(() => {
      if (S.compose || S.outbox) return;
      clearInterval(t);
      if (!S.out && !S.leaving) setTimeout(() => toast(said, { label: 'Open', run: () => { location.hash = `#/f/drafts/${last.id}`; } }, 15000), 2500);
    }, 1000);
    return;
  }
  try { sessionStorage.setItem('foldoy-composing', JSON.stringify(last)); } catch (_) {  }
  S.back = /^#\/compose/.test(location.hash) ? last.back : (location.hash || last.back);
  location.hash = '#/compose';
  if (missed.length) setTimeout(() => toast(`Brought back without ${list3(missed)}: add ${missed.length > 1 ? 'them' : 'it'} again.`, null, 15000), 1500);
}
async function send() {
  const c = S.compose; if (!c || c.sendBusy) return;
  c.sendBusy = true;
  try { await sendOnce(c); } finally { c.sendBusy = false; }
}
async function sendOnce(c) {
  read();
  const b = $('#csend'), err = $('#cerr'); err.textContent = ''; c.wall = null; if ($('#cwall')) $('#cwall').innerHTML = '';
  if (S.out) return notSentOut(c, err);
  if (!addrs(c.to).length) { err.textContent = 'Add someone to send it to.'; $('#cto').focus(); return; }
  const bad = [...addrs(c.to), ...addrs(c.cc), ...addrs(c.bcc)].filter(a => !okAddr(a));
  if (bad.length) { err.textContent = `${list3(bad)} ${bad.length > 1 ? 'are not email addresses' : 'is not an email address'}. Fix or remove ${bad.length > 1 ? 'them' : 'it'}.`; $('#cto').focus(); return; }
  if (!c.subject.trim() && !confirmEmpty()) return;
  if (c.lock && (c.lock.pw || '').length < 12) { err.textContent = 'Give it a password of 12 characters or more.'; $('#lkpw')?.focus(); return; }
  if (c.lock && c.files.length) { err.textContent = "An encrypted message can't carry files yet. Remove them, or don't encrypt it."; return; }
  try { for (const f of c.files) if (!f.bytes && f.from) f.bytes = await fileBytes(f.from.m, f.from.a); }
  catch { err.textContent = "A forwarded file couldn't be fetched. Remove it or try again."; return; }
  try {
    const k = await mail.classify([...addrs(c.to), ...addrs(c.cc), ...addrs(c.bcc)]);
    const moved = k.changed.filter(x => !(c.accept_keys || []).includes(x.now));
    if (moved.length) {
      if (!confirm(`${moved.map(x => x.addr).join(', ')} has a different key than the one this device remembers.\n\nIf they didn't tell you they changed it, don't send.\n\n${moved.map(x => `${x.addr}\nWas ${x.was}\nNow ${x.now}`).join('\n\n')}\n\nSend with the new key?`)) return;
      c.accept_keys = [...(c.accept_keys || []), ...moved.map(x => x.now)];
    }
  } catch {}
  if (S.out) return notSentOut(c, err);
  clearTimeout(c.t); if (c.saving) await c.saving.catch(() => {});
  if (S.out) return notSentOut(c, err);
  if (c.send_at) {
    b.setAttribute('aria-busy', 'true');
    try {
      await sendNow(c);
      c.sent = true; clearTimeout(c.t); S.compose = null; S.key = ''; S.focusList = true;
      toast(`Sends ${snzWhen(c.send_at)}`); await railQuiet(); location.hash = /^#\/f\/drafts\/./.test(S.back) ? '#/f/drafts' : S.back;
    } catch (x) { c.wall = limitWall(x, c); if (c.wall) $('#cwall').innerHTML = c.wall; else err.textContent = sendErr(x); c.send_at = null; }
    finally { if (b.isConnected) b.removeAttribute('aria-busy'); }
    return;
  }
  const wait = S.me.undo_seconds ?? 10;
  if (wait > 0) {
    clearTimeout(c.t); c.dirty = true; saveDraft(true);
    c.sent = true; S.compose = null; S.focusList = true;
    const back = /^#\/f\/drafts\/./.test(S.back) ? '#/f/drafts' : S.back, timer = setTimeout(() => deliver(c), wait * 1000);
    S.outbox = { c, timer };
    location.hash = back;
    toast(`Sending in ${wait} s`, [{ label: 'Send now', run: () => { if (S.outbox?.c !== c) return; clearTimeout(timer); deliver(c); } }, { label: 'Undo', run: () => {
      clearTimeout(timer); S.outbox = null;
      if (S.compose && S.compose !== c) { S.compose.dirty = true; saveDraft(true); const d = $('#dock'); if (d) d.parentNode.removeChild(d); }
      c.sent = false; S.compose = c; S.back = back;
      if (location.hash === '#/compose') showCompose(); else location.hash = '#/compose';
    } }], wait * 1000);
    const t0 = Date.now(), tick = setInterval(() => {
      const sp = $('.toast span'), left = Math.ceil((wait * 1000 - (Date.now() - t0)) / 1000);
      if (S.outbox?.c !== c || left <= 0 || !sp || !/^Sending in/.test(sp.textContent)) return clearInterval(tick);
      sp.textContent = `Sending in ${left} s`;
    }, 250);
    return;
  }
  b.setAttribute('aria-busy', 'true'); b.textContent = 'Sending…';
  try {
    await sendNow(c);
    c.sent = true; clearTimeout(c.t); S.compose = null; S.key = ''; S.focusList = true;
    toast('Sent'); await railQuiet();
    location.hash = /^#\/f\/drafts\/./.test(S.back) ? '#/f/drafts' : S.back;
  } catch (x) { c.wall = limitWall(x, c); if (c.wall) $('#cwall').innerHTML = c.wall; else err.textContent = sendErr(x); }
  finally { if (b.isConnected) { b.removeAttribute('aria-busy'); b.textContent = 'Send'; } }
}
let oopsN = 0;
addEventListener('error', () => { if (oopsN++ < 3) api.oops('js-error'); });
addEventListener('unhandledrejection', () => { if (oopsN++ < 3) api.oops('js-error'); });
async function deliver(c) {
  if (c.delivering) return;
  c.delivering = true;
  try {
    await sendNow(c);
    if (c.keptId) { c.gone = true; await pgp.keptDrop(S.me.address, c.keptId).catch(() => {}); c.kept = false; if (S.keptIds) S.keptIds.delete(c.keptId); }
    S.outbox = null; toast('Sent'); S.key = ''; await railQuiet();
    if (/^#\/(f|s)\//.test(location.hash) || !location.hash) showMail({ folder: S.folder, q: S.q, id: S.sel || undefined, force: true });
  } catch (x) {
    c.delivering = false;
    if (S.out) { if (S.outbox && S.outbox.c === c) S.outbox = null; await putBack(c); outNotice(); return; }
    S.outbox = null; c.sent = false; c.wall = limitWall(x, c);
    if (!c.wall) api.oops('send-failed');
    toast(x instanceof TypeError ? sendErr(x) : `Not sent: ${x.message}`, { label: 'Open', run: () => { S.compose = c; location.hash = '#/compose'; } }, 12000);
  }
}
function laterMenu() {
  const box = $('#laterbox'); if (!box) return;
  if (box.innerHTML) { box.innerHTML = ''; return; }
  const keepTop = pane.scrollTop;
  const now = new Date(), at = (days, h) => { const d = new Date(now); d.setDate(d.getDate() + days); d.setHours(h, 0, 0, 0); return d; };
  const opts = [['Tomorrow morning', at(1, 8)], ['Tomorrow afternoon', at(1, 13)], ['Monday morning', at(((8 - now.getDay()) % 7) || 7, 8)]];
  const pad = x => String(x).padStart(2, '0'), local = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  box.innerHTML = `<div class="snz" role="menu" aria-label="Send later">
    ${opts.map(([l, d]) => `<button type="button" role="menuitem" data-later="${d.toISOString()}"><span>${l}</span><time>${snzWhen(d.toISOString())}</time></button>`).join('')}
    <div class="snz-pick">${whenPick('laterat', 7, at(1, 8))}<button class="pill light sm" type="button" data-later="pick">Schedule</button></div>
  </div>`;
  floatMenu(box.querySelector('.snz'), $('#cform [data-act="later"]'));
  box.querySelector('[data-later]')?.focus({ preventScroll: true });
  pane.scrollTop = keepTop; requestAnimationFrame(() => { pane.scrollTop = keepTop; setTimeout(() => { if (pane.scrollTop !== keepTop) pane.scrollTop = keepTop; }, 120); });
}
function whenPick(id, days, def) {
  const pad = x => String(x).padStart(2, '0'), ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const now = new Date(), defDay = ymd(def), defTime = `${pad(def.getHours())}:${pad(def.getMinutes())}`;
  const dayOpts = Array.from({ length: days }, (_, i) => {
    const d = new Date(now); d.setDate(d.getDate() + i);
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
    return `<option value="${ymd(d)}"${ymd(d) === defDay ? ' selected' : ''}>${esc(label)}</option>`;
  }).join('');
  const times = []; for (let h = 6; h <= 22; h++) for (const m of [0, 30]) times.push(`${pad(h)}:${pad(m)}`);
  const timeOpts = times.map(t => `<option value="${t}"${t === defTime ? ' selected' : ''}>${t}</option>`).join('');
  return `<span class="wp"><select class="wp-day" aria-label="Day">${dayOpts}</select><select class="wp-time" aria-label="Time">${timeOpts}</select><input type="hidden" id="${id}" value="${defDay}T${defTime}"></span>`;
}
document.addEventListener('change', e => {
  const w = e.target.closest?.('.wp'); if (!w) return;
  w.querySelector('input[type="hidden"]').value = `${w.querySelector('.wp-day').value}T${w.querySelector('.wp-time').value}`;
});
const tooSoon = v => !v || new Date(v).getTime() < Date.now() + 60e3;
function sendLater(v) {
  const c = S.compose; if (!c) return;
  if (v === 'pick' && tooSoon($('#laterat').value)) { toast('Pick a time later than now.'); return; }
  const iso = v === 'pick' ? new Date($('#laterat').value).toISOString() : v;
  if (!iso) return;
  c.send_at = iso; send();
}
async function composeAlias() {
  const c = S.compose; if (!c) return;
  read();
  const to = addrs(c.to)[0] || '', base = ((to.split('@')[1] || '').split('.').slice(-2, -1)[0] || 'mail').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) || 'mail';
  const name = `${base}.${Math.random().toString(36).slice(2, 5)}`, domain = (S.me.primary_address || S.me.address).split('@')[1];
  try {
    const a = await account.createAlias({ name, domain, note: to ? `For ${to}` : 'Made while writing' });
    S.me = await api.session(); S.aliases = await api.aliases(); c.from = a.address; toast(`New alias ${a.address}`);
  } catch (x) { toast(x.message); }
  showCompose();
}
addEventListener('beforeunload', e => {
  const c = S.compose, unsaved = c && !c.sent && c.dirty;
  if (unsaved) saveDraft(true);
  if (S.outbox || unsaved) { e.preventDefault(); e.returnValue = ''; }
});
function confirmEmpty() {
  const st = $('#cst');
  if (st.dataset.warned) return true;
  st.dataset.warned = '1'; st.textContent = 'No subject. Press Send again to send it anyway.'; return false;
}
async function closeCompose(discard) {
  const c = S.compose;
  if (!discard && c && !c.sent && (c.dirty || c.draftId)) {
    clearTimeout(c.t);
    if (!(await saveDraft(true))) { toast(`The draft couldn't be saved: ${c.saveErr.replace(/\.+$/, '')}. It is still open.`); return; }
    if (S.compose !== c) return;
    const said = c.saveNote || 'Draft saved'; if (S.out) setTimeout(outNotice, 400); else setTimeout(() => toast(said), 50);
  }
  if (discard) {
    clearTimeout(c.t); if (c.saving) await c.saving;
    const had = c.dirty || c.draftId, back = S.back;
    c.gone = true;
    if (c.keptId) { await pgp.keptDrop(S.me.address, c.keptId).catch(() => {}); c.kept = false; if (S.keptIds) S.keptIds.delete(c.keptId); }
    if (c.draftId) await api.discard(c.draftId).catch(() => {});
    c.draftId = null; c.sent = true; S.compose = null; S.key = ''; await railQuiet();
    toast('Discarded', had ? { label: 'Undo', run: () => {
      if (S.compose && S.compose !== c) { S.compose.dirty = true; saveDraft(true); const d = $('#dock'); if (d) d.parentNode.removeChild(d); }
      c.sent = false; c.gone = false; c.dirty = true; S.compose = c; S.back = back;
      if (location.hash === '#/compose') showCompose(); else location.hash = '#/compose';
      setTimeout(() => { if (S.compose === c) saveDraft(true); }, 400);
    } } : null, 8000);
  }
  S.focusList = true; S.focusPane = !!S.sel;
  location.hash = S.back || '#/f/inbox';
}

const sending = new Map();
function inOrder(id, fn) {
  const p = (sending.get(id) || Promise.resolve()).catch(() => {}).then(fn);
  sending.set(id, p); p.catch(() => {}).finally(() => { if (sending.get(id) === p) sending.delete(id); });
  return p;
}
async function act(kind) {
  const m = S.open; if (!m) return;
  if (kind === 'archive' && m.folder === 'archive') return;
  const n = S.items.findIndex(x => x.id === m.id);
  const nextId = (S.items[n + 1] || S.items[n - 1] || {}).id;
  if (kind === 'flag') {
    const paint = () => { const it = S.items[n]; if (it) it.flagged = m.flagged; $$('[data-act="flag"]', pane).forEach(b => b.setAttribute('aria-pressed', String(m.flagged))); refreshRow(m.id); };
    m.flagged = !m.flagged; paint(); takeUndo();
    const want = m.flagged;
    inOrder(m.id, () => api.update(m.id, { flagged: want })).catch(x => { if (m.flagged === want) { m.flagged = !want; paint(); } toast(x.message); });
    return;
  }
  if (kind === 'unread') {
    const it = S.items[n], mark = on => { m.unread = on; if (it) it.unread = on; refreshRow(m.id); railSoon(m.folder, on ? 1 : -1); };
    mark(true);
    inOrder(m.id, () => api.update(m.id, { unread: true })).catch(x => { mark(false); toast(`That didn't work: ${x.message}`); });
    location.hash = S.back; return;
  }
  const from = m.folder, ids = expand(m.id);
  let op;
  if (kind === 'archive') { const af = S.folders.find(f => f.role === 'archive'); if (!af) return; op = Promise.all(ids.map(id => inOrder(id, () => api.update(id, { folder: af.id })))); }
  if (kind === 'trash') op = Promise.all(ids.map(id => inOrder(id, () => api.remove(id))));
  leave(m, n, nextId, kind === 'archive' ? 'Archived' : from === 'trash' ? 'Deleted for good' : 'Moved to Trash',
    from === 'trash' ? null : async () => { await Promise.all(ids.map(id => api.update(id, { folder: from }))); }, op);
}
async function leave(m, n, nextId, said, undo, op = Promise.resolve()) {
  const from = S.back = (S.back || '#/f/inbox').replace(/^(#\/[fs]\/[^/]*).*$/, '$1');
  if (n >= 0) S.items.splice(n, 1);
  if (S.raw) S.raw = S.raw.filter(x => x.id !== m.id && !(m.group || []).includes(x.id)); $(`.row[data-id="${m.id}"]`, list)?.remove();
  const tot = $('.ltot', list); if (tot) tot.textContent = ltotText();
  if (m.unread && !S.q) railSoon(m.folder, -1);
  if (!phone() && S.sel === m.id) {
    const st = nextId && stubOf(nextId);
    if (st) { S.sel = nextId; S.open = null; S.thread = null; renderReader(st); }
    else if (nextId) { S.sel = nextId; S.open = null; pane.innerHTML = ''; markCurrent(nextId); }
    else { S.sel = null; S.open = null; markCurrent(null); emptyPane(); if (!splitPane()) setView('mail', 'list'); }
  }
  toast(said, undo ? { label: 'Undo', run: async () => { await op.catch(() => {}); await undo(); S.key = ''; await railQuiet(); location.hash = `${from}/${m.id}`; } } : null);
  location.hash = nextId && !phone() ? `${S.back}/${nextId}` : S.back;
  op.then(() => { railSoon(); repage(); }, x => { toast(`That didn't work: ${x.message}`); S.key = ''; railQuiet(); routeSafe(); });
}
const ruleGoes = id => { const n = (S.rulesList || []).filter(r => r.action === 'move' && String(r.folder) === String(id)).length;
  return n ? ` ${n === 1 ? 'The rule that moves mail into it is' : `The ${n} rules that move mail into it are`} deleted too.` : ''; };
const folderLabel = id => (S.folders.find(f => f.id === id) || {}).name || id;
function moveMenu(bulkMode, at) {
  const here = bulkMode ? S.folder : S.open?.folder;
  const rank = f => ({ inbox: 0, archive: 1, junk: 3, trash: 4 }[f.role] ?? 2);
  const targets = S.folders.filter(f => (['inbox', 'archive', 'junk', 'trash'].includes(f.role) || (!f.role && !f.view)) && f.id !== here && f.role !== here).sort((a, b) => rank(a) - rank(b));
  const html = `<div class="snz movemenu" role="menu" aria-label="Move to">${targets.map(f => `<button type="button" role="menuitem" data-moveto="${esc(f.id)}"><span>${icon(FOLDER_ICON[f.role] || 'folder')}${esc(f.name)}</span></button>`).join('')}
    <a class="mm-new" href="#/settings/mail" data-goto-folders>New folder</a></div>`;
  if (bulkMode && at) {
    list.insertAdjacentHTML('beforeend', html); floatMenu(list.querySelector('.movemenu'), at);
    list.querySelector('[data-moveto]')?.focus({ preventScroll: true }); return;
  }
  if (bulkMode) {
    const old = list.querySelector('.movemenu'); if (old) { old.remove(); return; }
    list.querySelector('.lbar')?.insertAdjacentHTML('afterend', html); floatMenu(list.querySelector('.movemenu'), list.querySelector('.lbar [data-bulk="move"]'));
    list.querySelector('[data-moveto]')?.focus({ preventScroll: true }); return;
  }
  const box = $('#actnote'); if (!box) return;
  if (box.querySelector('.movemenu')) { box.innerHTML = ''; return; }
  box.innerHTML = html; floatMenu(box.querySelector('.snz'), $('[data-act="move"]', pane)); box.querySelector('[data-moveto]')?.focus({ preventScroll: true });
}
function floatMenu(menu, btn) {
  if (!menu || !btn || phone()) return;
  if (!menu.contains(document.activeElement) && document.activeElement !== document.body) S.menuFrom = document.activeElement;
  menu.classList.add('floating'); menu.style.margin = '0';
  const place = () => {
    if (!menu.isConnected) return;
    const r = btn.getBoundingClientRect(), w = menu.offsetWidth, h = menu.offsetHeight;
    menu.style.left = `${Math.max(8, Math.min(r.left, innerWidth - w - 8))}px`;
    menu.style.top = `${r.bottom + h + 6 > innerHeight ? Math.max(8, r.top - h - 6) : r.bottom + 6}px`;
  };
  place(); requestAnimationFrame(place);
}
new MutationObserver(() => {
  if (phone() || app.dataset.view === 'mail' || list.querySelector('#searchf')) return;
  list.insertAdjacentHTML('afterbegin', `<form class="field search" role="search" id="searchf">${icon('search')}<input type="search" id="q" placeholder="Search mail" aria-label="Search mail" autocomplete="off" enterkeyhint="search"><kbd aria-hidden="true">/</kbd></form>`);
  $('#searchf', list).addEventListener('submit', e => { e.preventDefault(); const v = $('#q').value.trim(); if (v) location.hash = `#/s/${encodeURIComponent(v)}`; });
}).observe(list, { childList: true });
new ResizeObserver(() => { if (pane.clientWidth) pane.classList.toggle('narrow', pane.clientWidth < 600); }).observe(pane);
function closeFloat() {
  const note = $('#actnote'); if (note && note.querySelector('.snz')) note.innerHTML = '';
  const lb = $('#laterbox'); if (lb && lb.innerHTML) lb.innerHTML = '';
  const mm = list.querySelector('.movemenu'); if (mm) mm.parentNode.removeChild(mm);
  list.querySelectorAll('.row.ctx').forEach(x => x.classList.remove('ctx'));
  list.querySelectorAll('.ctxsnz').forEach(x => x.parentNode.removeChild(x));
  S.rowAct = null;
  const back = S.menuFrom; S.menuFrom = null;
  if (back?.isConnected && (!document.activeElement || document.activeElement === document.body)) back.focus({ preventScroll: true });
}
document.addEventListener('pointerdown', e => {
  const m = $('.snz.floating'); if (!m || m.contains(e.target) || e.target.closest('[data-act="move"], [data-act="snooze"], [data-act="later"], [data-bulk="move"]')) return;
  closeFloat();
}, true);
async function moveTo(id) {
  if (S.rowAct) { S.picked = new Set([S.rowAct]); S.rowAct = null; return bulk(`move:${id}`); }
  if (S.picked.size) return bulk(`move:${id}`);
  const m = S.open; if (!m) return;
  const from = m.folder, n = S.items.findIndex(x => x.id === m.id), nextId = (S.items[n + 1] || S.items[n - 1] || {}).id, ids = expand(m.id);
  const op = Promise.all(ids.map(x => inOrder(x, () => api.update(x, { folder: id }))));
  leave(m, n, nextId, `Moved to ${folderLabel(id)}`, async () => { await Promise.all(ids.map(x => api.update(x, { folder: from }))); }, op);
}
function snoozeMenu(anchor) {
  let box = $('#actnote');
  if (anchor) { box = document.createElement('div'); box.className = 'ctxsnz'; list.append(box); }
  if (!box) return;
  if (!anchor && box.querySelector('.snz')) { box.innerHTML = ''; return; }
  const now = new Date(), at = (days, h) => { const d = new Date(now); d.setDate(d.getDate() + days); d.setHours(h, 0, 0, 0); return d; };
  const opts = [];
  if (now.getHours() < 18) opts.push(['Later today', new Date(Math.ceil((now.getTime() + 3 * 36e5) / 3e5) * 3e5)]);
  opts.push(['Tomorrow', at(1, 8)]);
  if (now.getDay() >= 1 && now.getDay() <= 4) opts.push(['This weekend', at(6 - now.getDay(), 9)]);
  opts.push(['Next week', at(((8 - now.getDay()) % 7) || 7, 8)]);
  const pad = x => String(x).padStart(2, '0'), local = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  box.innerHTML = `<div class="snz" role="menu" aria-label="Snooze until">
    ${opts.map(([l, d]) => `<button type="button" role="menuitem" data-snz="${d.toISOString()}"><span>${l}</span><time>${snzWhen(d.toISOString())}</time></button>`).join('')}
    <form class="snz-pick" id="snzf">${whenPick('snzat', 30, at(1, 8))}<button class="pill light sm" type="submit">Snooze</button></form>
  </div>`;
  floatMenu(box.querySelector('.snz'), anchor || $('[data-act="snooze"]', pane));
  box.querySelector('[data-snz]')?.focus({ preventScroll: true });
  $('#snzf').addEventListener('submit', e => { e.preventDefault(); const v = $('#snzat').value; if (tooSoon(v)) { toast('Pick a time later than now.'); return; } doSnooze(new Date(v).toISOString()); });
}
async function doSnooze(iso) {
  if (S.rowAct) { const id = S.rowAct; S.rowAct = null; closeFloat(); return snoozeRow(id, iso); }
  const m = S.open; if (!m) return;
  const n = S.items.findIndex(x => x.id === m.id), nextId = (S.items[n + 1] || S.items[n - 1] || {}).id, ids = expand(m.id);
  try { await Promise.all(ids.map(id => api.snooze(id, iso))); } catch (x) { return toast(x.message); }
  leave(m, n, nextId, `Snoozed until ${snzWhen(iso)}`, async () => { await Promise.all(ids.map(id => api.unsnooze(id))); });
}
async function snoozeRow(id, iso) {
  const ids = expand(id), before = S.items.slice(), raw = S.raw ? S.raw.slice() : null, it = S.items.find(x => x.id === id), un = it?.unread ? 1 : 0;
  S.items = S.items.filter(x => x.id !== id); if (S.raw) S.raw = S.raw.filter(x => !ids.includes(x.id)); if (un) railSoon(S.folder, -un); renderList();
  const back = () => { S.items = before; if (raw) S.raw = raw; if (un) railSoon(S.folder, un); renderList(); };
  try { await Promise.all(ids.map(x => api.snooze(x, iso))); } catch (x) { back(); return toast(x.message); }
  toast(`Snoozed until ${snzWhen(iso)}`, { label: 'Undo', run: async () => { back(); await Promise.all(ids.map(x => api.unsnooze(x))); railSoon(); } });
}
function blockAsk() {
  const m = S.open, box = $('#actnote'); if (!m || !box) return;
  box.innerHTML = `<div class="note warn"><span class="t">Block <b>${esc(m.from.addr)}</b>? Their mail goes to Junk from now on.</span><button type="button" data-act="blockok">Block</button><button type="button" data-act="blockno">Cancel</button></div>`;
}
async function blockNow() {
  const m = S.open; if (!m) return;
  const addr = m.from.addr, from = m.folder, n = S.items.findIndex(x => x.id === m.id), nextId = (S.items[n + 1] || S.items[n - 1] || {}).id, ids = expand(m.id);
  try { await api.block(addr); await Promise.all(ids.map(id => api.update(id, { folder: 'junk' }))); } catch (x) { return toast(x.message); }
  S.blockedList = null;
  leave(m, n, nextId, `Blocked ${addr}`, async () => {
    const b = (await api.blocked()).find(x => x.address === addr); if (b) await api.unblock(b.id);
    await Promise.all(ids.map(id => api.update(id, { folder: from })));
  });
}
const unsubKey = u => u ? u.url || u.mailto || '' : '';
const unsubbed = new Set();
function mailtoParts(s) {
  const [a, q = ''] = String(s).split('?'), p = new URLSearchParams(q.replace(/\+/g, '%2B'));
  let to = a; try { to = decodeURIComponent(a); } catch {  }
  return { to: to.split(',')[0].trim(), subject: p.get('subject') || 'unsubscribe', text: p.get('body') || 'unsubscribe' };
}
async function unsubscribe() {
  const m = S.open, b = $('#unsubnote'), box = $('#actnote'), u = m?.unsubscribe; if (!m || !b || !u) return;
  const say = (html, warn, link) => { if (S.open?.id === m.id && box) box.innerHTML = `<div class="note${warn ? ' warn' : ''}"><span class="t">${html}</span>${link ? `<a href="${esc(link)}" target="_blank" rel="noopener noreferrer">Open its page</a>` : ''}</div>`; };
  const gone = told => { unsubbed.add(unsubKey(u)); m.unsubscribed = true; if (S.open?.id === m.id) $('#unsubnote')?.remove(); if (told) api.unsubscribe(m.id, { left: true }).catch(() => {}); };
  if (!u.one_click && u.url) {
    open(u.url, '_blank', 'noopener,noreferrer'); gone();
    return say(`The list's page opened ${openedIn()}. Finish there.`);
  }
  b.disabled = true; b.setAttribute('aria-busy', 'true');
  let r;
  if (u.one_click) {
    try { r = await api.unsubscribe(m.id); } catch (x) { b.disabled = false; b.removeAttribute('aria-busy'); return toast(x.message); }
    if (r.done) { gone(); return say('Unsubscribed. Mail from this list should stop within a few days.'); }
  } else r = { url: null, mailto: u.mailto };
  const mt = r.mailto || u.mailto;
  if (mt) {
    const { to, subject, text } = mailtoParts(mt), me = S.me.primary_address || S.me.address;
    const from = m.via_alias && S.me.aliases_send !== false ? m.via_alias : me;
    try {
      await mail.send({ from, to: [to], cc: [], bcc: [], names: {}, subject, text, files: [], lock: false, accept_keys: [] }, S.me);
      gone(true); return say(`Unsubscribed. foldoy sent the request to <b>${esc(to)}</b>. It's in Sent.`);
    } catch (x) {
      b.disabled = false; b.removeAttribute('aria-busy');
      startCompose('new'); Object.assign(S.compose, { from, to, subject, text, dirty: true });
      return toast(`${x.message} The unsubscribe request is ready to send.`);
    }
  }
  b.disabled = false; b.removeAttribute('aria-busy');
  const url = r.url || u.url;
  if (url) return say(`${esc(r.error || "The list's server didn't take it.")} Leave on its page instead.`, true, url);
  say(esc(r.error || "This list didn't say how to leave it."), true);
}
function refreshRow(id) {
  const r = $(`.row[data-id="${id}"]`, list), it = S.items.find(x => x.id === id);
  if (r && it) { const t = document.createElement('div'); t.innerHTML = rowsHtml([it], S.back); r.replaceWith(t.firstElementChild); markCurrent(S.sel); }
}

async function showAliases(id) {
  const gen = S.alGen = (S.alGen || 0) + 1;
  const shown = !!(S.aliases?.length || S.alLoaded);
  if (shown) drawAliases(id);
  else loadingView('aliases', 'Aliases', id ? 'pane' : 'list');
  const [me, al] = await Promise.all([api.session(), api.aliases()]).catch(() => [null, null]);
  if (gen !== S.alGen) return;
  if (!me || !al) { if (!shown && /^#\/aliases/.test(location.hash)) { drawAliases(id); toast("Your aliases didn't load. Try again in a moment."); } return; }
  S.alLoaded = true;
  const changed = JSON.stringify(al) !== JSON.stringify(S.aliases) || me.alias_limit !== S.me.alias_limit || me.plan !== S.me.plan;
  S.me = me; S.aliases = al; renderRail();
  if (!/^#\/aliases/.test(location.hash)) return;
  if (!shown || (changed && !pane.contains(document.activeElement))) drawAliases(location.hash.split('/')[2] || id);
}
function loadingView(view, title, depth) {
  setView(view, depth);
  const bars = (n, ws) => Array.from({ length: n }, (_, i) => `<div class="row arow skr skl"><span class="r1"><i style="width:${ws[i % ws.length]}%"></i></span></div>`).join('');
  const al = view === 'aliases', lim = S.me?.alias_limit;
  const two = n => Array.from({ length: n }, (_, i) => `<div class="row arow skr skl"><span class="r1"><i style="width:${[52, 46, 56, 44][i % 4]}%"></i></span><span class="r2"><i style="width:${[30, 26, 34, 22][i % 4]}%"></i></span></div>`).join('');
  list.innerHTML = `<div class="lh"><button class="menu-btn" type="button" data-act="rail" aria-label="Folders and settings">${icon('menu')}</button><h1>${title}</h1></div>
    ${al && lim ? `<p class="lsub"><b>${S.me.alias_count ?? ''}</b>${unl(lim, 'aliases') ? '' : ` of ${lim}`} on ${PLAN[S.me.plan] || ''}</p>` : ''}
    <div class="rows" aria-busy="true" aria-label="Loading">${al ? two(Math.min(S.me?.alias_count || 4, 8)) : bars(8, [46, 34, 52, 30, 44, 58, 38, 48])}</div>`;
  pane.innerHTML = phone() && depth !== 'pane' ? '' : `<div class="in skpane" aria-busy="true"><i class="skh"></i>${Array.from({ length: 5 }, (_, i) => `<div class="skline"><i style="width:${[22, 30, 18, 26, 34][i]}%"></i><i style="width:${[30, 20, 26, 16, 22][i]}%"></i></div>`).join('')}</div>`;
}
function drawAliases(id) {
  setView('aliases', id ? 'pane' : 'list');
  const lim = S.me.alias_limit, used = S.aliases.length, full = used >= lim;
  list.innerHTML = `
    <div class="lh">
      <button class="menu-btn" type="button" data-act="rail" aria-label="Folders and settings">${icon('menu')}</button>
      <h1>Aliases</h1><span class="sp"></span>
      ${lim ? `<a class="pill light sm" href="#/aliases/new" ${full ? 'aria-disabled="true"' : ''}>${icon('plus')}New</a>` : ''}
    </div>
    <p class="lsub"><b>${used}</b>${unl(lim, 'aliases') ? '' : ` of ${lim}`} on ${PLAN[S.me.plan]}${S.me.plan === 'free' ? '. They receive mail only and stay yours: turn one off, not delete.' : ''}</p>
    <div class="rows" role="list">${S.aliases.map(a => `
      <a class="row arow ${a.active ? '' : 'dead'}" role="listitem" href="#/aliases/${a.id}" data-id="${a.id}">
        <span class="r1"><span class="addr">${esc(a.address)}</span>${a.held ? '<span class="tagx">Paused</span>' : a.active ? '' : '<span class="tagx">Killed</span>'}</span>
        <span class="r2"><span class="note2">${esc(a.note || 'No note')}</span></span>
      </a>`).join('') || (lim ? '<p class="listnote">No aliases yet.</p>' : '')}
    </div>`;
  if (!id && !phone() && S.aliases[0]) { history.replaceState(null, '', `#/aliases/${S.aliases[0].id}`); id = S.aliases[0].id; }
  markCurrent(id);
  if (id === 'new') return newAlias();
  const a = S.aliases.find(x => x.id === id);
  if (a) return aliasDetail(a);
  if (!phone()) aliasPitch(); else pane.innerHTML = '';
}
function aliasPitch() {
  pane.innerHTML = `<div class="blank"><div class="state">
    <img class="art" src="/static/mail/shared/art/aliases.svg" alt="">
    <h2>A new address for every site. <span class="mute">Kill it when it spams you.</span></h2>
    <p class="dim">${PLAN[S.me.plan] || 'Your plan'}: ${unl(S.me.alias_limit, 'aliases') ? 'unlimited aliases' : `${S.me.alias_limit} alias${S.me.alias_limit === 1 ? '' : 'es'}`}.</p>
    ${S.me.plan === 'polar' ? '' : S.me.plans_open ? `<div class="acts"><a class="pill light md" href="${PLANS_URL}">See plans</a></div>` : '<p class="dim">Paid plans can\'t be bought yet.</p>'}
  </div></div>`;
}
function recvHtml(items) {
  return items.map(m => {
    const wait = m.encrypted && !m.opened && !m.locked && !m.subject;
    return `<a class="row rrow ${m.unread ? 'unread' : ''}" href="#/m/${m.id}" data-id="${m.id}"><span class="from">${esc(nameOf(m.from))}</span><span class="subj">${wait ? `<i class="skb" style="width:${skw(m.id, 42, 78)}%"></i>` : m.locked ? 'Encrypted message' : esc(m.subject || '(no subject)')}</span><time datetime="${m.date}">${when(m.date)}</time></a>`;
  }).join('');
}
async function aliasDetail(a) {
  pane.innerHTML = `
    <div class="in adet">
      <div class="tools ph"><button class="iconbtn back" type="button" data-act="aback" aria-label="Back to aliases">${icon('back')}</button></div>
      <div class="u-mt32 a-h"><h2 id="ah" tabindex="-1">${esc(a.address)}</h2><button class="iconbtn" type="button" data-copy="${esc(a.address)}" title="Copy address" aria-label="Copy address">${icon('copy')}</button></div>
      <p class="a-facts"><span class="${a.held ? 'warn' : a.active ? 'on' : ''}">${a.held ? 'Paused' : a.active ? 'Receiving' : 'Killed'}</span><span>Made ${new Date(a.created).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span><span id="recvn" hidden></span></p>
      <div class="a-note"><label class="label" for="anote">Note</label><div class="field"><input id="anote" value="${esc(a.note)}" placeholder="What it's for" maxlength="80"></div></div>
      <div class="a-acts">
        ${a.locked ? '<p class="plain">Part of your account. It always receives.</p>' : `${a.active ? `<button class="pill danger md" type="button" data-alias-act="kill">Kill alias</button>` : `<button class="pill md" type="button" data-alias-act="revive">Revive</button>`}
        ${S.me.plan === 'free' ? '' : '<button class="pill ghost md" type="button" data-alias-act="delete">Delete</button>'}`}
      </div>
      ${a.held ? `<p class="plain held-line">Paused: over your plan. It takes no mail in and cannot send until you pay for the plan again. <a href="${PLANS_URL}">Plans</a></p>` : ''}
      <h3 class="h3">What it received</h3>
      <div class="recv" id="recv"></div>
    </div>`;
  if (phone()) $('#ah').focus({ preventScroll: true });
  $('#anote').addEventListener('change', async e => { try { await api.updateAlias(a.id, { note: e.target.value.trim() }); } catch (x) { return toast(x.message); } toast('Note saved'); showAliases(a.id); });
  let r; try { r = await api.messages({ alias: a.address }); } catch { return; }
  const h = $('#recv'); if (!h) return;
  h.innerHTML = r.items.length ? recvHtml(r.items) : '<p class="u-p12 listnote">Nothing yet.</p>';
  const cn = $('#recvn'); if (cn && r.items.length) { cn.textContent = `${r.items.length}${r.next ? '+' : ''} received`; cn.hidden = false; }
  if (r.items.some(m => m.encrypted && !m.opened)) mail.open(r.items).then(() => { if (h.isConnected) h.innerHTML = recvHtml(r.items); }).catch(() => {});
}
async function aliasAct(kind) {
  const id = location.hash.split('/')[2], a = S.aliases.find(x => x.id === id); if (!a) return;
  try {
    if (kind === 'kill') { await api.updateAlias(id, { active: false }); toast('Killed. Mail to it is refused.', { label: 'Undo', run: async () => { try { await api.updateAlias(id, { active: true }); } catch (x) { toast(x.message); } showAliases(id); } }); }
    if (kind === 'revive') { await api.updateAlias(id, { active: true }); toast('Receiving again'); }
    if (kind === 'delete') {
      const b = $('[data-alias-act="delete"]');
      if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'Delete for good'; b.className = 'pill kill md'; return; }
      await api.deleteAlias(id); toast('Alias deleted');
      S.aliases = S.aliases.filter(x => x.id !== id); S.me = await api.session().catch(() => S.me); location.hash = '#/aliases'; return;
    }
  } catch (x) { toast(x.message); }
  showAliases(id);
}
function newAlias() {
  const lim = S.me.alias_limit, full = S.aliases.length >= lim;
  const own = S.me.address.split('@')[1];
  const doms = [...new Set([own, ...FREE_DOMAINS, ...(S.me.plan === 'polar' ? ['veil.no'] : [])])].map(d => ({ d, plan: '' }));
  pane.innerHTML = `
    <form class="in newa" id="naf" novalidate>
      <div class="tools"><button class="iconbtn back" type="button" data-act="aback" aria-label="Back to aliases">${icon('back')}</button></div>
      <div class="a-h"><h2 tabindex="-1" id="ah">New alias</h2></div>
      ${full ? wall('aliases', `Your plan holds ${lim} alias${lim === 1 ? '' : 'es'}.${S.me.plan === 'free' ? '' : ' Delete one to make room.'}`, () => { if (location.hash === '#/aliases/new') newAlias(); }) : ''}
      <label class="label" for="" id="nal">Name</label>
      <div id="napick"></div>
      <p class="say">Leave it empty for a random name.</p>
      <label class="label" for="nanote">Note <span>optional</span></label>
      <div class="field"><input id="nanote" placeholder="Only you see it" maxlength="80"></div>
      <p class="say bad" id="naerr" aria-live="assertive"></p>
      <div class="acts"><button class="pill light md" type="submit" ${full ? 'disabled' : ''}>Make alias</button><a class="pill ghost md" href="#/aliases">Cancel</a></div>
    </form>`;
  const pk = picker($('#napick'), { domains: doms, domain: doms[0].d, placeholder: 'random', label: 'Alias name' });
  ($('#napick input') || $('#ah')).focus({ preventScroll: true });
  $('#naf').addEventListener('submit', async e => {
    e.preventDefault();
    const v = pk.get();
    try { const a = await account.createAlias({ name: v.name, domain: v.domain, note: $('#nanote').value }); S.me = await api.session(); copy(a.address, 'Alias made and copied.'); location.hash = `#/aliases/${a.id}`; }
    catch (x) { $('#naerr').textContent = x.message; }
  });
}

let setMode = null;
let freshRC = null;
let ppBackup = null;
let freshCodes = null, newApp = null, keyPass = null, openDom = null, domNote = '', tfSetup = null, tfAuth = null;
let appKeyPass = null;
let impWho = 'gmail', impTimer = 0;
const SWITCH_ITEMS = [['bank', 'Bank and payment apps'], ['shops', 'Online shops'], ['social', 'Social media'], ['subscriptions', 'Subscriptions and streaming'],
  ['government', 'Government and tax'], ['work', 'Work and school'], ['contacts', 'Tell your contacts your new address']];
let expTimer = 0;
function pollExport() {
  clearTimeout(expTimer);
  if (S.exp?.status !== 'running') return;
  expTimer = setTimeout(async () => {
    if (!/^#\/settings\/export\b/.test(location.hash)) return;
    try { S.exp = (await api.exportState()).job; S.expAt = Date.now(); } catch {}
    if (S.lastSec === 'export' && !pane.contains(document.activeElement?.closest('input') || null)) drawSettings('export'); else pollExport();
  }, 2000);
}
async function checkDom(id, quiet = false) {
  const d = await api.verifyDomain(id).catch(x => ({ error: x.message }));
  if (d.error) domNote = d.error;
  else {
    domNote = '';
    S.sd.doms = (S.sd.doms || []).map(x => (x.id === d.id ? d : x));
    if (d.status === 'active' && d.ready && !quiet) { openDom = null; toast(`${d.domain} is ready. Mail to it arrives here.`); }
  }
  if (S.lastSec === 'domains') { S.focusSec = 'h-dom'; drawSettings('domains'); }
}
function pollImport() {
  clearTimeout(impTimer);
  if (S.imp?.status !== 'running') return;
  impTimer = setTimeout(async () => {
    if (!/^#\/settings\/(import|switch)\b/.test(location.hash)) return;
    try { S.imp = (await api.importState()).job; } catch {}
    if (S.lastSec === 'import' && !pane.contains(document.activeElement?.closest('input') || null)) drawSettings('import'); else pollImport();
  }, 2000);
}
let warmAt = 0;
document.addEventListener('pointerover', e => {
  const a = e.target.closest?.('a[href^="#/settings"], a[href^="#/aliases"]');
  if (!a || Date.now() - warmAt < 30000 || app.dataset.view !== 'mail') return;
  warmAt = Date.now();
  if (!S.sd) fetchSettings().then(d => { if (!S.sd) { S.sd = d; S.sdAt = Date.now(); } }).catch(() => {});
  if (!S.aliases) api.aliases().then(al => { S.aliases ||= al; }).catch(() => {});
}, { passive: true });
async function fetchSettings() {
  const [me, tfs, sess, apps, doms, extras, inv] = await Promise.all([api.session(),
    api.twoFactor().catch(() => ({ enabled: S.me.two_factor, recovery_left: 0, available: false })), api.sessions().catch(() => []),
    S.me.mail_hosts ? api.appPasswords().catch(() => []) : null,
    S.me.domain_limit ? api.domains().catch(() => []) : null, S.me.address_limit ? api.addresses().catch(() => []) : null,
    S.me.plan !== 'free' ? api.invites().catch(() => null) : null]);
  if (inv) S.invites = inv.invites;
  return { me, tfs, sess, apps, doms, extras, invites: inv ? inv.invites : null };
}
const settled = () => !setMode && !freshRC && !freshCodes && !keyPass && !newApp && !appKeyPass && !ppBackup && !pane.contains(document.activeElement?.closest('input, textarea, select') || null);
async function showSettings({ instant = false } = {}) {
  const sec = location.hash.replace(/^#\/?/, '').split('/')[1] || null;
  if (sec !== S.lastSec) { setMode = null; S.lastSec = sec; }
  const gen = S.setGen = (S.setGen || 0) + 1;
  const drawn = instant && !!S.sd;
  if (drawn) drawSettings(sec);
  else if (!S.sd) loadingView('settings', 'Settings', sec ? 'pane' : 'list');
  if (drawn && Date.now() - (S.sdAt || 0) < 30000) return;
  const d = await fetchSettings().catch(() => null);
  if (d) S.sdAt = Date.now();
  if (gen !== S.setGen) return;
  if (!d && drawn) return;
  const fresh = d || S.sd || { me: S.me, tfs: { enabled: S.me.two_factor, recovery_left: 0, available: false }, sess: [], apps: null, doms: null, extras: null };
  const changed = JSON.stringify(fresh) !== JSON.stringify(S.sd);
  S.sd = fresh; S.me = fresh.me; if (fresh.extras) S.addresses = fresh.extras; renderRail();
  if (!drawn || (changed && settled())) drawSettings(sec);
}
function redrawSettings() { if (!S.sd) return showSettings(); S.sd = { ...S.sd, me: S.me }; S.sdAt = Date.now(); renderRail(); drawSettings(S.lastSec); }
function searchIndexRow(row, btn) {
  const x = idx.state;
  const what = 'An index of your mail\'s words, kept in this browser and encrypted with a key only your account opens. Log out removes it.';
  if (!idx.eligible(S.me) && !x?.off) {
    return row('Search index', '<b>Not kept</b>', '', S.me.privacy_plus?.on ? 'With privacy+ on, search reads each message as it looks.' : S.me.key?.own ? 'With your own key, search reads each message as it looks.' : 'Search reads each message as it looks.');
  }
  if (x?.off) return row('Search index', '<b>Off on this device</b>', btn('sidx-build', 'Build search index'), 'Search reads each message as it looks, which takes longer in a large mailbox.');
  return row('Search index', '', btn('sidx-rm', 'Remove search index from this device'), `${what} <span id="sidxv">${sidxSays(x)}</span>`, 'stack');
}
const sidxSays = x => (!x ? 'Starting.' : x.listed && x.waiting ? `Indexed ${x.indexed.toLocaleString('en-GB')} of ${x.total.toLocaleString('en-GB')}.` : `${gb(x.bytes || 0)} on this device.`);
idx.on(x => { const v = $('#sidxv'); if (v && x && !x.off) v.textContent = sidxSays(x); });
function drawSettings(sec) {
  if (!/^#\/settings/.test(location.hash)) return;
  const used = document.activeElement?.closest?.('.pane [data-set]')?.dataset.set, keepTop = used ? pane.scrollTop : null;
  if (sec !== drawSettings.last) { drawSettings.last = sec; pane.scrollTop = 0; list.scrollTop = 0; requestAnimationFrame(() => { pane.scrollTop = 0; }); }
  const { tfs, sess, apps, doms, extras } = S.sd;
  if (setMode !== 'tf-on') { tfSetup = null; tfAuth = null; }
  const setup = setMode === 'tf-on' ? tfSetup : null;
  const pp = S.me.privacy_plus || {}, own = !!S.me.key?.own, rc = S.me.recovery, rec = S.me.recovery_email || { address: null, confirmed: false };
  const older = !!rc?.set && (S.me.keys || []).some(k => k.stale && k.kind !== 'own');
  const au = async id => { const v = $('#' + id).value; if (!v) { $('#' + id).focus(); throw new Error('Enter your password.'); } return account.auth(v, S.me); };
  const tf = S.me.two_factor ? '<label class="label" for="tfa">Code from your authenticator app</label><div class="field"><input id="tfa" inputmode="numeric" autocomplete="one-time-code" maxlength="12"></div>' : '';
  const tfa = () => $('#tfa')?.value.trim() || undefined;
  const pw = id => `<label class="label" for="${id}">Your login password</label><div class="field"><input id="${id}" type="password" autocomplete="current-password"></div>${tf}`;
  const acts = (go, cls = 'light') => `<div class="acts"><button class="pill ${cls} md" type="submit">${go}</button><button class="pill ghost md" type="button" data-set="">Cancel</button></div>`;
  const err = id => `<p class="say bad" id="${id}" aria-live="assertive"></p>`;
  const SECS = [['account', 'Account'], ['mail', 'Mail'], ['screener', 'Screener'], ['import', 'Import mail'], ['switch', 'Switch from Gmail'], ['export', 'Export mail'], ...(installed() ? [] : [['install', 'Install foldoy']]), ['appearance', 'Appearance'], ['security', 'Security'], ['privacy', 'privacy+'], ['plan', 'Plan and storage'], ['addresses', 'Addresses and aliases'],
    ['domains', 'Domains'], ...(S.me.mail_hosts && apps ? [['apps', 'Mail apps']] : []), ['pgp', 'PGP info']];
  const index = !sec, cur = SECS.some(([k]) => k === sec) ? sec : 'account';
  const listOnly = index && phone();
  const row = (k, v = '', act = '', sub = '', cls = '') => `<li class="${sub ? 'wide ' : ''}${cls}"><span class="k">${k}${sub ? `<small>${sub}</small>` : ''}</span><span class="val">${v}${act}</span></li>`;
  const busy = !!(setMode || freshRC || freshCodes || keyPass || newApp || appKeyPass);
  const btn = (set, t, cls = 'line') => `<button class="pill ${busy && cls === 'light' ? 'line' : cls} sm" type="button" data-set="${set}">${t}</button>`;
  const group = (id, title, inner, { lede = '', sr = false, box = '', head = '', join = false } = {}) => `
      <section aria-labelledby="${id}" ${join ? 'class="j"' : ''}>
        ${head ? `<div class="gh"><h3 tabindex="-1" id="${id}">${title}</h3>${head}</div>` : `<h3 ${sr || join ? 'class="sr" ' : ''}tabindex="-1" id="${id}">${title}</h3>`}
        ${lede ? `<p class="gd">${lede}</p>` : ''}
        ${inner ? `<div class="box ${box}">${inner}</div>` : ''}
      </section>`;
  const held = `<p class="plain held-line">Paused: over your plan. It takes no mail in and can't send until you pay for the plan again. <a href="${PLANS_URL}">Plans</a></p>`;
  const paused = '<span class="tagx">Paused</span>';
  const card = S.me.plan_detail?.paid_by === 'card';
  const again = () => { if (S.lastSec === sec && settled()) drawSettings(sec); };
  const price = (() => { const d = S.me.plan_detail; if (S.me.plan === 'free') return ''; if (d?.price_usd && d.period) return `${usd(d.price_usd).replace(/\.00$/, '')} a ${d.period}`; const p = (needPlans(again) || []).find(x => x.id === S.me.plan); return p?.prices ? monthly(p) : ''; })();
  if (sec === 'plan' && !S.activity) { S.activity = { rows: null }; api.activity().then(d => { S.activity = d; if (S.lastSec === 'plan') drawSettings('plan'); }).catch(() => { S.activity = { rows: [] }; }); }
  if (sec === 'mail' && !S.blockedList) api.blocked().then(l => { S.blockedList = l; if (S.lastSec === 'mail') drawSettings('mail'); }).catch(() => {});
  if (sec === 'mail' && !S.rulesList) api.rules().then(l => { S.rulesList = l; if (S.lastSec === 'mail') drawSettings('mail'); }).catch(() => {});
  if ((sec === 'import' || sec === 'switch') && S.imp === undefined) {
    S.imp = null;
    api.importState().then(d => { S.imp = d.job; if (S.lastSec === sec) drawSettings(sec); }).catch(() => {});
  }
  if (sec === 'switch' && !S.swDone) api.switchList().then(d => { S.swDone = d.done; if (S.lastSec === 'switch') drawSettings('switch'); }).catch(() => {});
  if (sec === 'import' || sec === 'switch') pollImport();
  if (sec === 'export' && (S.exp === undefined || Date.now() - (S.expAt || 0) > 5000)) {
    S.expAt = Date.now(); S.exp = S.exp || null;
    api.exportState().then(d => { S.exp = d.job; S.expAt = Date.now(); if (S.lastSec === 'export') drawSettings('export'); }).catch(() => {});
  }
  if (sec === 'export') pollExport();
  const boxFull = !!(S.me.storage && S.me.storage.used_bytes >= S.me.storage.quota_bytes);
  const sentToday = !!(S.me.sending?.messages && S.me.sending.messages_used >= S.me.sending.messages);
  const xjob = S.exp, xrunning = xjob?.status === 'running';
  const xStatus = xjob && { running: xjob.cancelling ? 'Cancelling' : 'Making the file', done: 'Ready', downloaded: 'Downloaded', removed: 'Deleted', expired: 'Expired', failed: 'Stopped', cancelled: 'Cancelled' }[xjob.status];
  const DSTATE = { found: 'Found', missing: 'Missing', wrong: 'Wrong', pending: 'Not made yet', unknown: 'Not checked' };
  const need = d => d.records.filter(r => r.required);
  const right = d => need(d).filter(r => r.state === 'found').length;
  const job = S.imp, running = job?.status === 'running', gm = impWho === 'gmail';
  const num = v => Number(v || 0).toLocaleString('en-GB');
  const myAddr = S.me.primary_address || S.me.address;
  const ext = (href, t) => `<a href="${href}" target="_blank" rel="noopener noreferrer">${t}</a>`;
  const impStatus = job && { running: job.cancelling ? 'Cancelling' : 'Copying', done: 'Done', cancelled: 'Cancelled', failed: 'Stopped', full: 'Stopped: mailbox full' }[job.status];
  const ownF = S.folders.filter(f => !f.role && !f.view), ar = S.me.autoreply || {};
  const ruleSays = r => `${r.field === 'from' ? 'From' : 'Sent to'} <b>${esc(r.value)}</b>: ${r.action === 'move' ? `move to ${esc(folderLabel(r.folder))}` : r.action === 'star' ? 'star it' : 'mark it read'}`;
  const dayVal = iso => { const d = iso ? new Date(iso) : null; return d && !isNaN(d) ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : ''; };
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  const body = {
    screener: () => screenerSettings({ group, row }),
    mail: () => `
      ${group('h-sig', 'Signature', `<form class="form sigf" id="sigf" novalidate>
          <label class="label sr" for="sigin">Signature</label>
          <textarea class="sigta" id="sigin" rows="4" maxlength="2000" placeholder="Your name, or a line about you">${esc(S.me.signature || '')}</textarea>
          <div class="acts"><button class="pill ${busy ? 'line' : 'light'} md" type="submit">Save</button><span class="say" id="sigsay" aria-live="polite"></span></div>
        </form>`)}
      ${group('h-undo', 'Undo send', `<div class="swatches" role="radiogroup" aria-labelledby="h-undo">${[0, 5, 10, 20, 30].map(v => {
        const on = (S.me.undo_seconds ?? 10) === v;
        return `<button class="swatch plainsw" type="button" role="radio" aria-checked="${on}" data-set="undo-${v}">${v ? `${v} seconds` : 'Off'}</button>`;
      }).join('')}</div>`)}
      ${group('h-img', 'Images', `<ul class="kv"><li class="wide"><span class="k" id="imglab">Load images from the web<small id="imgd">Through foldoy, so senders never see your IP address. Off: each message asks first.</small></span>
          <span class="val"><button class="sw" type="button" role="switch" aria-checked="${S.me.images !== false}" aria-labelledby="imglab" aria-describedby="imgd" data-set="images"></button></span></li></ul>`, { join: true })}
      ${group('h-conv', 'Conversations', `<ul class="kv"><li class="wide"><span class="k" id="convlab">Group conversations</span>
          <span class="val"><button class="sw" type="button" role="switch" aria-checked="${S.me.threads !== false}" aria-labelledby="convlab" data-set="threads"></button></span></li></ul>`, { join: true })}
      ${group('h-folders', 'Folders', `<ul class="kv">${ownF.map(f => setMode === `fren-${f.id}`
          ? `<li><form class="inlinef" id="frenf" data-id="${esc(f.id)}"><label class="sr" for="frenin">New name</label><input id="frenin" value="${esc(f.name)}" maxlength="60"><button class="pill light sm" type="submit">Save</button><button class="pill line sm" type="button" data-set="">Cancel</button></form></li>`
          : row(`${icon('folder')}<b class="strong">${esc(f.name)}</b>`, '', setMode === `fdel-${f.id}` ? `<button class="pill danger sm" type="button" data-fdelok="${esc(f.id)}">Delete for good</button>${btn('', 'Cancel')}` : btn(`fren-${f.id}`, 'Rename') + btn(`fdel-${f.id}`, 'Delete'),
            setMode === `fdel-${f.id}` ? `Its mail moves to Archive.${ruleGoes(f.id)}` : '')).join('')}
          <li><form class="inlinef" id="nff"><label class="sr" for="nfname">New folder</label><input id="nfname" maxlength="60" placeholder="New folder"><button class="pill line sm" type="submit">Add</button></form></li></ul>`)}
      ${group('h-rules', 'Rules', `<ul class="kv">${(S.rulesList || []).map(r => row(`<span class="rule-s">${ruleSays(r)}</span>`, '', `<button class="pill line sm" type="button" data-rdel="${esc(r.id)}">Delete</button>`)).join('')}
          <li><form class="inlinef rulef" id="rulef">
            <label class="sr" for="rfield">Look at</label><select id="rfield"><option value="from">From</option><option value="to">Sent to</option></select>
            <label class="sr" for="rvalue">Address</label><input id="rvalue" maxlength="254" placeholder="an address or @domain">
            <label class="sr" for="raction">Then</label><select id="raction">${[['move:archive', 'Move to Archive'], ...ownF.map(f => [`move:${f.id}`, `Move to ${f.name}`]), ['move:junk', 'Move to Junk'], ['move:trash', 'Move to Trash'], ['star', 'Star it'], ['read', 'Mark it read']].map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select>
            <button class="pill line sm" type="submit">Add</button>
          </form></li></ul><p class="say bad" id="rerr" aria-live="assertive"></p>`, { lede: 'For new mail in your inbox.' })}
      ${group('h-ar', 'Auto-reply', `<form class="form arf" id="arf" novalidate>
          <ul class="kv"><li class="wide"><span class="k" id="arlab">Answer new mail<small>Once per sender, while it is on.</small></span><span class="val"><button class="sw" type="button" role="switch" aria-checked="${!!ar.enabled}" aria-labelledby="arlab" id="aron"></button></span></li></ul>
          <label class="label" for="arsub">Subject</label><div class="field"><input id="arsub" maxlength="200" value="${esc(ar.subject || '')}" placeholder="Away until Monday"></div>
          <label class="label" for="artext">Reply</label><textarea class="sigta" id="artext" rows="4" maxlength="4000">${esc(ar.text || '')}</textarea>
          <div class="ar-dates"><label class="label" for="arfrom">From <span>optional</span></label><input type="date" id="arfrom" value="${dayVal(ar.from)}">
            <label class="label" for="arto">Until <span>optional</span></label><input type="date" id="arto" value="${dayVal(ar.to)}"></div>
          <div class="acts"><button class="pill light md" type="submit">Save</button><span class="say" id="arsay" aria-live="polite"></span></div>
        </form>`, { lede: 'The mail server keeps this reply readable, because it sends it for you.' })}
      ${group('h-note', 'Notifications', `<ul class="kv">${row('On this device', perm === 'denied' ? '<b>Blocked in this browser</b>' : perm === 'unsupported' ? '<b>Not in this browser</b>' : notifyOn() ? '<b class="mint">On</b>' : '<b>Off</b>',
          perm === 'granted' || perm === 'default' ? btn('notify', notifyOn() ? 'Turn off' : 'Turn on') : '', 'While foldoy is open in the background.')}</ul>`)}
      ${group('h-sidx', 'Search', `<ul class="kv">${searchIndexRow(row, btn)}</ul>`)}
      ${group('h-block', 'Blocked senders', S.blockedList?.length ? `<ul class="kv">${S.blockedList.map(b => row(`<b class="strong long">${esc(b.address)}</b>`, '', `<button class="pill line sm" type="button" data-unblock="${esc(b.id)}">Unblock</button>`)).join('')}</ul>` : '',
        { lede: S.blockedList ? (S.blockedList.length ? 'Their mail goes to Junk.' : 'No one. Block a sender from any message they sent.') : '' })}`,
    import: () => `
      ${job ? group('h-impjob', running ? 'Copying now' : 'Last import', `<ul class="kv">
          ${row('Status', `<b class="${running || job.status === 'done' ? 'mint' : job.status === 'cancelled' ? '' : 'warn'}">${impStatus}</b>`,
            running && !job.cancelling ? btn('imp-cancel', 'Cancel') : '')}
          ${job.status === 'full' ? `<li class="impnote">${wall('storage', job.error || 'Your mailbox is full.', again)}</li>` : job.error ? `<li class="impnote">${esc(job.error)}</li>` : ''}
          ${row('From', `<b>${esc(job.host)}</b>`)}
          ${row('Folders', `<b>${job.folders_total ? `${num(job.folders_done)} of ${num(job.folders_total)}` : running ? 'Looking' : '0'}</b>`, '', running && job.folder ? `Now copying ${esc(job.folder)}` : '')}
          ${row('Messages copied', `<b class="strong">${num(job.copied)}</b>`)}
          ${row('Messages skipped', `<b>${num(job.skipped)}</b>`, '', 'Already in this mailbox')}
          ${job.failed ? row('Not copied', `<b>${num(job.failed)}</b>`, '', 'Over 30 MB, or the other server would not send them') : ''}
        </ul>`) : ''}
      ${running ? '' : `${group('h-impfrom', 'Import from', `<div class="swatches" role="radiogroup" aria-labelledby="h-impfrom">
          <button class="swatch plainsw" type="button" role="radio" aria-checked="${gm}" data-set="imp-gmail">Gmail</button>
          <button class="swatch plainsw" type="button" role="radio" aria-checked="${!gm}" data-set="imp-other">Another provider</button></div>`,
          { lede: 'Mail already here is skipped.' })}
      ${group('h-impform', gm ? 'Gmail' : 'Another provider', `<form class="form" id="impf" novalidate>
          ${gm ? `<div class="step"><span class="n" aria-hidden="true">1</span><div><h4>Turn on 2-Step Verification</h4>
              <p class="t">Google makes app passwords only for accounts with it on. ${ext('https://myaccount.google.com/signinoptions/twosv', 'Open 2-Step Verification')}</p></div></div>
            <div class="step"><span class="n" aria-hidden="true">2</span><div><h4>Make an app password</h4>
              <p class="t">Open ${ext('https://myaccount.google.com/apppasswords', 'myaccount.google.com/apppasswords')}, type <b>foldoy</b> as the name and press <b>Create</b>. Google shows a password of 16 letters. Work and school accounts may not offer this page.</p></div></div>
            <div class="step"><span class="n" aria-hidden="true">3</span><div><h4>Copy your mail</h4>
              <label class="label" for="impu">Gmail address</label><div class="field"><input id="impu" type="email" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="you@gmail.com"></div>
              <label class="label" for="impp">App password</label><div class="field"><input id="impp" type="password" autocomplete="off" spellcheck="false"></div>
              <p class="t u-mt8">When the copy is done, delete it on the same Google page.</p>
              ${err('imperr')}
              <div class="acts"><button class="pill ${job?.status === 'full' ? 'line' : 'light'} md" type="submit">Start import</button></div></div></div>`
          : `<label class="label" for="imph">Server</label><div class="field"><input id="imph" autocapitalize="none" spellcheck="false" placeholder="imap.example.com"></div>
            <label class="label" for="impo">Port</label><div class="field port"><input id="impo" inputmode="numeric" maxlength="5" value="993"></div>
            <label class="label" for="impu">Username</label><div class="field"><input id="impu" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Often your email address"></div>
            <label class="label" for="impp">Password</label><div class="field"><input id="impp" type="password" autocomplete="off" spellcheck="false"></div>
            <p class="t u-mt8">If your provider offers app passwords, use one.</p>
            ${err('imperr')}
            <div class="acts"><button class="pill ${job?.status === 'full' ? 'line' : 'light'} md" type="submit">Start import</button></div>`}
        </form>`)}`}`,
    switch: () => `
      ${group('h-sw', 'Switch from Gmail', `<div class="form swg">
          <div class="step"><span class="n" aria-hidden="true">1</span><div><h4>Import your old mail</h4>
            ${running ? `<p class="t">Copying now: ${num(job.copied)} messages so far.</p>` : job?.status === 'done' ? `<p class="t">Done: ${num(job.copied)} messages copied.</p>` : ''}
            <div class="acts"><a class="pill line sm" href="#/settings/import">Import mail</a></div></div></div>
          <div class="step"><span class="n" aria-hidden="true">2</span><div><h4>Forward new mail to foldoy</h4>
            <ol class="howto">
              <li>In Gmail on a computer, open Settings (the gear) and press <b>See all settings</b>.</li>
              <li>Open <b>Forwarding and POP/IMAP</b> and press <b>Add a forwarding address</b>.</li>
              <li>Type <b>${esc(myAddr)}</b>, then press <b>Next</b>, <b>Proceed</b> and <b>OK</b>.</li>
              <li>Gmail sends a confirmation code to your foldoy inbox. Open it here and click its link, or type the code into Gmail.</li>
              <li>Back in Gmail, reload the page, choose <b>Forward a copy of incoming mail to</b> your foldoy address, and press <b>Save Changes</b>.</li>
            </ol>
            <div class="acts"><button class="pill line sm" type="button" data-copy="${esc(myAddr)}">Copy your address</button>${`<a class="pill line sm" href="https://mail.google.com/mail/u/0/#settings/fwdandpop" target="_blank" rel="noopener noreferrer">Open Gmail settings</a>`}</div></div></div>
          <div class="step"><span class="n" aria-hidden="true">3</span><div><h4>Move your accounts</h4>
            ${movingStep(myAddr) ?? `<p class="t">Change the email address on each to ${esc(myAddr)}. ${S.swDone ? `${S.swDone.length} of ${SWITCH_ITEMS.length} done.` : ''}</p>
            <ul class="swl">${SWITCH_ITEMS.map(([k, n]) => `<li><label><input type="checkbox" data-sw="${k}" ${S.swDone?.includes(k) ? 'checked' : ''} ${S.swDone ? '' : 'disabled'}><span>${n}</span></label></li>`).join('')}</ul>`}</div></div>
        </div>`, { sr: true })}`,
    appearance: () => `
      ${group('h-accent', 'Accent', `<div class="swatches" role="radiogroup" aria-labelledby="h-accent">${ACCENTS.map(([k, n]) => {
        const on = (S.me.accent || 'blue') === k;
        return `<button class="swatch" type="button" role="radio" aria-checked="${on}" data-set="accent-${k}"><span class="dot" data-a="${k}"></span>${n}</button>`;
      }).join('')}</div>`)}
      ${group('h-theme', 'Theme', `<div class="swatches" role="radiogroup" aria-labelledby="h-theme">${THEMES.map(([k, n]) => {
        const on = (S.me.theme || 'dark') === k;
        return `<button class="swatch" type="button" role="radio" aria-checked="${on}" data-set="theme-${k}"><span class="dot" data-t="${k}"></span>${n}</button>`;
      }).join('')}</div>`)}`,
    account: () => `
      ${group('h-name', 'Your name', `<ul class="kv">${row('Your name', '', `<form class="dname" id="dnamef"><div class="field"><input id="dname" maxlength="64" autocomplete="name" value="${esc(S.me.display || '')}" placeholder="${esc((S.me.address || '').split('@')[0])}" aria-labelledby="h-name"></div><button class="pill sm" type="submit" hidden>Save</button></form>`, 'Shown on mail you send.', 'nmrow')}</ul>`, { join: true })}
      ${group('h-acc', 'Address', `<ul class="kv">${row('Address', `<b class="strong long">${esc(S.me.address)}</b>`, `<button class="pill line sm" type="button" data-copy="${esc(S.me.address)}">Copy</button>`)}</ul>`, { join: true })}
      ${group('h-rec', 'Recovery email', `<ul class="kv">
          ${row('Recovery email', rec.address ? `<b class="strong long">${esc(rec.address)}</b>` : '<b>None</b>', rec.address ? btn('rec', 'Change') + btn('rec-rm', 'Remove', 'ghost') : btn('rec', 'Add'),
            rec.address ? (rc?.set ? 'A reset by email makes a new key. Older mail opens again with your recovery code.' : 'A reset by email makes a new key.')
              : rc?.set ? 'Without one, a forgotten password can be reset only with your recovery code.' : "Without one, a forgotten password can't be reset.")}
          ${rec.address ? row('Password reset', rec.confirmed ? '<b class="mint">Available</b>' : '<b>Waiting for the code</b>', rec.confirmed ? '' : btn('rec-code', 'Enter code')) : ''}
        </ul>
        ${setMode === 'rec' || setMode === 'rec-rm' || setMode === 'rec-code' ? `
        <form class="form" id="recf" novalidate>
          ${setMode === 'rec' ? `<label class="label" for="recin">${rec.address ? 'New recovery email' : 'Recovery email'}</label><div class="field"><input id="recin" type="email" autocomplete="email" autocapitalize="none" value="${esc(rec.address || '')}"></div>` : ''}
          ${setMode === 'rec-rm' ? '<p class="t">Password reset by email stops working.</p>' : ''}
          ${setMode === 'rec-code' ? `<p class="t">We sent a 6-digit code to <b>${esc(rec.address)}</b>.</p><label class="label" for="reccode">Code</label><div class="field"><input id="reccode" inputmode="numeric" autocomplete="one-time-code" maxlength="6"></div>` : pw('recpw')}
          ${err('recerr')}
          ${acts({ rec: 'Send code', 'rec-rm': 'Remove', 'rec-code': 'Confirm' }[setMode], setMode === 'rec-rm' ? 'danger' : 'light')}
        </form>` : ''}`,
        { join: true })}
      <section aria-labelledby="h-out">
        <h3 class="sr" tabindex="-1" id="h-out">Log out</h3>
        <div class="box"><ul class="kv">
          ${row('Log out', '', `<button class="pill ghost sm" type="button" data-act="logout">Log out</button>`)}
        </ul></div>
      </section>
      <section aria-labelledby="h-del">
        <h3 class="sr" tabindex="-1" id="h-del">Delete your account</h3>
        <div class="box"><ul class="kv">
          ${row('Delete account', '', btn('del', 'Delete account', 'danger'), 'Your mail, address, aliases and keys are erased for good.')}
        </ul></div>
        ${setMode === 'del' ? `<dialog class="sdlg" id="deldlg" aria-labelledby="delh"><form id="delf" novalidate>
          <h2 id="delh">Delete your account?</h2>
          <ul class="what">
            <li><span>Your mail</span><span>Erased</span></li>
            <li><span>${esc(S.me.address)}${S.me.alias_count ? ` and ${S.me.alias_count} ${S.me.alias_count === 1 ? 'alias' : 'aliases'}` : ''}</span><span>Retired for good</span></li>
            <li><span>Your keys</span><span>Erased</span></li>
            ${apps?.length ? `<li><span>${apps.length === 1 ? 'Your app password' : `${apps.length} app passwords`}</span><span>Revoked</span></li>` : ''}
          </ul>
          <p class="t">This can't be undone.</p>
          ${pw('delpw')}
          ${err('delerr')}
          <div class="acts"><button class="pill ghost md" type="button" data-set="">Cancel</button><button class="pill kill md" type="submit">Delete my account</button></div>
        </form></dialog>` : ''}
      </section>`,
    security: () => `
      ${group('h-pw', 'Password', `<ul class="kv">${row('Login password', '', btn('pw', 'Change'), `Changing it signs out every other device.${S.me.mail_hosts ? ' App passwords keep working.' : ''}`)}</ul>
        ${setMode === 'pw' ? `<form class="form" id="pwf" novalidate>
          <label class="label" for="pwc">Current password</label><div class="field"><input id="pwc" type="password" autocomplete="current-password"></div>
          <label class="label" for="pwn">New password</label><div class="field"><input id="pwn" type="password" autocomplete="new-password"></div>
          ${tf}
          ${err('pwerr')}
          ${acts('Change password')}
        </form>` : ''}`, { join: true })}
      ${group('h-tf', 'Two-factor', `<ul class="kv">
          ${row('Two-factor', tfs.enabled ? '<b class="mint">On</b>' : setup && !setup.error ? '<b>Setting up</b>' : tfs.available ? '<b>Off</b>' : '<b>Not available yet</b>',
            tfs.enabled ? (setMode === 'tf-off' ? '' : btn('tf-off', 'Turn off')) : tfs.available && setMode !== 'tf-on' ? btn('tf-on', 'Turn on', rc && !rc.set ? 'line' : 'light') : '',
            '')}
          ${tfs.enabled ? row('Backup codes', `<b>${tfs.recovery_left} unused</b>`, setMode === 'tf-new' ? '' : btn('tf-new', 'New codes')) : ''}
        </ul>
        ${freshCodes ? `<div class="form">
          <p class="t"><b>Your backup codes.</b> Each works once, in place of the code from your app. They show only now.</p>
          <ul class="codes">${freshCodes.map(c => `<li>${esc(c)}</li>`).join('')}</ul>
          <div class="acts"><button class="pill line md" type="button" data-set="tf-dl">Download</button><button class="pill line md" type="button" data-copy="${esc(freshCodes.join('\n'))}">Copy</button><button class="pill light md" type="button" data-set="tf-done">I've saved them</button></div>
        </div>` : ''}
        ${setMode === 'tf-on' && !setup ? `<form class="form" id="tff" novalidate>
          ${pw('tfpw').replace(tf, '')}
          ${err('tferr')}
          ${acts('Continue')}
        </form>` : ''}
        ${setMode === 'tf-on' && setup && !setup.error ? `<form class="form" id="tff" novalidate>
          <div class="step"><span class="n" aria-hidden="true">1</span><div><h4>Scan the code</h4><p class="t">Open your authenticator app and scan this, or type the key.</p>
            <div class="qr"><img alt="QR code for your authenticator app" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(setup.qr_svg)}">
              <div><p class="t">Key</p><p class="secret">${esc(setup.secret)}</p><button class="pill line sm u-mt8" type="button" data-copy="${esc(setup.secret.replace(/ /g, ''))}">Copy key</button></div></div></div></div>
          <div class="step"><span class="n" aria-hidden="true">2</span><div><h4><label for="tfc">Enter the code from the app</label></h4>
            <div class="field code6"><input id="tfc" inputmode="numeric" autocomplete="one-time-code" maxlength="6"></div>
            ${err('tferr')}
            ${acts('Turn on')}</div></div>
        </form>` : setup?.error ? `<div class="form"><p class="say bad">${esc(setup.error)}</p></div>` : ''}
        ${setMode === 'tf-off' || setMode === 'tf-new' ? `<form class="form" id="tff" novalidate>
          ${setMode === 'tf-new' ? '<p class="t">New codes replace the old ones. The old codes stop working.</p>' : '<p class="t">Log-in then needs only your password.</p>'}
          <label class="label" for="tfpw">Your login password</label><div class="field"><input id="tfpw" type="password" autocomplete="current-password"></div>
          <label class="label" for="tfc">Code from your authenticator app</label><div class="field"><input id="tfc" autocomplete="one-time-code" maxlength="20" placeholder="Or a backup code"></div>
          ${err('tferr')}
          ${acts(setMode === 'tf-off' ? 'Turn off' : 'Make new codes', setMode === 'tf-off' ? 'danger' : 'light')}
        </form>` : ''}`, { join: true })}
      ${rc ? group('h-rc', 'Recovery code', `<ul class="kv">
          ${row('Recovery code', rc.set ? '<b class="mint">Set</b>' : '<b>Not set</b>', setMode === 'rc' || freshRC ? '' : btn('rc', rc.set ? 'New code' : 'Make a code', rc.set ? 'line' : 'light'),
            pp.on ? 'While privacy+ is on, it changes your password only.' : 'Resets your password and keeps all your mail.')}
          ${older ? row('Older mail', '<b>Encrypted</b>', setMode === 'rc-unlock' ? '' : btn('rc-unlock', 'Unlock'), 'From before your reset by email. Your recovery code opens it.') : ''}
        </ul>
        ${freshRC ? `<div class="form rcform">
          <p class="t"><b>Your recovery code.</b> With it you can reset your password and keep all your mail. We can't show it again.</p>
          <p class="rcode" id="rcv">${esc(twoLines(freshRC))}</p>
          <div class="acts"><button class="pill line md" type="button" data-set="rc-save">Save as a file</button><button class="pill line md" type="button" data-copy="${esc(freshRC)}">Copy</button><button class="pill light md" type="button" data-set="rc-done">I've saved it</button></div>
        </div>` : ''}
        ${setMode === 'rc' ? `<form class="form" id="rcf" novalidate>
          ${rc.set ? '<p class="t">The old code stops working.</p>' : ''}
          ${pw('rcpw')}
          ${err('rcerr')}
          ${acts('Make the code')}
        </form>` : ''}
        ${setMode === 'rc-unlock' ? `<form class="form" id="ruf" novalidate>
          <label class="label" for="rcin">Recovery code</label><div class="field"><input id="rcin" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="8 groups of 4"></div>
          ${err('ruerr')}
          ${acts('Unlock')}
        </form>` : ''}`,
        { join: true }) : ''}
      ${group('h-ss', 'Signed in', `${setMode === 'sess-others' ? `<div class="form">
          <p class="t">Every other device and browser signs out${S.me.mail_hosts ? ', and every app password is revoked, so mail apps stop signing in' : ''}.</p>
          <div class="acts"><button class="pill danger md" type="button" data-set="sess-others-ok">Sign out everywhere else</button><button class="pill ghost md" type="button" data-set="">Cancel</button></div>
        </div>` : ''}
        <ul class="kv sess">${sess.map(x => row(`<b>${esc(x.device)}</b>`, x.current ? '<b class="mint">This device</b>' : '',
          x.current ? '' : `<button class="pill line sm" type="button" data-endsess="${esc(x.id)}">Sign out</button>`,
          esc([x.country, `since ${new Date(x.since).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`, x.current ? '' : `last seen ${when(x.seen)}`].filter(Boolean).join(', ')))).join('')}</ul>
`,
        { head: (sess.some(x => !x.current) || S.me.mail_hosts) && setMode !== 'sess-others' ? btn('sess-others', 'Sign out everywhere else') : '' })}`,
    pgp: () => `
      ${group('h-key', 'Your keys', `<ul class="kv">
          ${own ? `${row('Your own key', '<b class="fp" id="fp"></b>', setMode === 'key-here' ? '' : btn('key-here', 'Switch back'), 'Mail to you is encrypted to your own public key.')}
            ${row('This tab', pgp.ownLoaded() ? '<b class="mint">Loaded</b>' : '<b>Not loaded</b>', pgp.ownLoaded() ? '<button class="pill line sm" type="button" data-act="lock">Unload</button>' : '')}`
          : `${row('Your public key', '', btn('pubfile', 'Download'), 'Share it freely.')}
            ${row('Your private key', '', btn('keyfile', 'Download'), 'Never share it. Encrypted with a passphrase we show you once.')}
            ${row('Use your own PGP key', '', setMode === 'pp-own' ? '' : btn('pp-own', 'Use it'), 'Mail to you is then encrypted to a public key you already have.')}`}
        </ul>
        ${keyPass ? `<div class="form">
          <p class="t"><b>The passphrase for the file.</b> Your PGP app asks for it. It shows only now.</p>
          <p class="kc">${esc(keyPass)}</p>
          <div class="acts"><button class="pill line md" type="button" data-copy="${esc(keyPass)}">Copy</button><button class="pill light md" type="button" data-set="keyfile-done">Done</button></div>
        </div>` : ''}
        ${setMode === 'pp-own' ? `<form class="form" id="ppx" novalidate>
          <label class="label" for="pkey">Your public key</label>
          <textarea class="keybox" id="pkey" spellcheck="false" placeholder="-----BEGIN PGP PUBLIC KEY BLOCK-----"></textarea>
          <div class="u-mt8 acts"><label class="u-ptr pill line sm">Upload a file<input type="file" id="pkfile" accept=".asc,.gpg,.pgp,.txt,.key" hidden></label></div>
          <p class="t">The webmail then shows that mail as encrypted until you load your private key for the tab. Nobody can recover it for you.</p>
          ${pw('ppw')}
          ${err('pperr')}
          ${acts('Use this key')}
        </form>` : ''}
        ${setMode === 'key-here' ? `<form class="form" id="ppx" novalidate>
          <p class="t">A new key is made in this browser and encrypted with your password. Mail sent to your own key still opens only with it.</p>
          ${pw('ppw')}
          ${err('pperr')}
          ${acts('Make a key here')}
        </form>` : ''}`, { sr: true, lede: 'For people who also use PGP in other apps.' })}
      `,
    privacy: () => `
      ${group('h-pp', 'privacy+', `<ul class="kv">
          <li class="wide pprow"><span class="k"><span id="pplab">privacy+ is ${pp.on ? 'on' : 'off'}</span><small id="ppd">${pp.on ? "Your mail opens only with the privacy+ key you set. We can't reset it." : 'Your mail is encrypted by default. With privacy+, you set the key yourself, and only that key opens it.'}</small></span>
            <span class="val"><button class="sw" type="button" role="switch" aria-checked="${!!pp.on}" aria-labelledby="pplab" aria-describedby="ppd" data-set="${pp.on ? 'pp-off' : 'pp-on'}"></button></span></li>
          ${pp.on ? row('privacy+ backup file', '', btn('pp-backup', 'Download', ppBackup ? 'light' : 'line'), 'Your keys, encrypted with your privacy+ key. Any PGP app opens it with that key.') : ''}
        </ul>
        ${ppBackup ? `<div class="form">
          <p class="t"><b>privacy+ is on.</b> Download the backup file now and keep it with your privacy+ key.</p>
          <div class="acts"><button class="pill line md" type="button" data-set="pp-done">Done</button></div>
        </div>` : ''}
        ${setMode === 'pp-on' ? `<form class="form" id="ppf" novalidate>
          <label class="label" for="ppk1">Set your privacy+ key</label><div class="field"><input id="ppk1" type="password" autocomplete="new-password" spellcheck="false"></div>
          <label class="label" for="ppk2">Type it again</label><div class="field"><input id="ppk2" type="password" autocomplete="new-password" spellcheck="false"></div>
          <p class="t ppwarn">Only you know this key. Lose it and the mail it encrypts can't be opened. We can't reset it.</p>
          ${pw('ppw')}
          ${err('pperr')}
          ${acts('Turn on privacy+')}
        </form>` : ''}
        ${setMode === 'pp-off' ? `<form class="form" id="ppf" novalidate>
          <label class="label" for="ppk1">Your privacy+ key</label><div class="field"><input id="ppk1" type="password" autocomplete="off" spellcheck="false"></div>
          ${pw('ppw')}
          ${err('pperr')}
          ${acts('Turn off privacy+', 'danger')}
        </form>` : ''}
        ${setMode === 'pp-bk' ? `<form class="form" id="ppbf" novalidate>
          <label class="label" for="ppbk">Your privacy+ key</label><div class="field"><input id="ppbk" type="password" autocomplete="off" spellcheck="false"></div>
          ${err('ppberr')}
          ${acts('Download')}
        </form>` : ''}`, { sr: true, box: 'ppcard' })}
      ${group('h-sees', 'What our server sees', `<ul class="kv">
          ${row('Always', '<b>Who mail is from and to</b>')}
          ${S.me.mail_subjects_locked ? '' : row('Mail encrypted on arrival', '<b>The subject line too</b>')}
        </ul>`, { head: `<a class="pill line sm" href="${SEES_URL}">Everything it stores</a>` })}`,
    plan: () => `
      ${group('h-plan', 'Plan and storage', `<ul class="kv">
          ${row('Plan', `<b class="strong">${PLAN[S.me.plan]}${price ? `<span class="dim">, ${price}</span>` : ''}</b>`, `<a class="pill ${S.me.plan === 'free' ? 'light' : 'line'} sm" href="${PLANS_URL}">${S.me.plan === 'free' ? 'Get foldoy+' : 'Change'}</a>`)}
          ${card ? row('Paid by', '<b>Card, through Stripe</b>', `<button class="pill line sm" type="button" data-set="billing-portal">Manage billing</button>`) : ''}
          ${S.me.plan_detail?.status === 'grace' ? row('Payment', card ? '<b class="warn">Your card was declined. Stripe tries again over the next days.</b>' : '<b class="warn">Due. Add funds to keep your plan.</b>', card ? `<button class="pill light sm" type="button" data-set="billing-portal">Update card</button>` : '') : ''}
          ${S.me.plan_detail?.renewal_short && S.me.plan_detail?.status !== 'grace' ? row('Renewal', `<b class="warn">Your balance won't cover it on ${dayMonth(S.me.plan_detail.renewal_short)}</b>`, `<a class="pill light sm" href="${DEPOSIT_URL}">Add funds</a>`) : ''}
          ${S.me.plan_detail?.ends_at ? row('Ends', `<b class="warn">${dayMonth(S.me.plan_detail.ends_at)}</b>`, `<button class="pill light sm" type="button" data-set="plan-resume">Keep my plan</button>`) : ''}
          ${S.me.plan_detail?.renews_at && S.me.plan !== 'free' && !S.me.plan_detail?.ends_at ? row('Renews', `<b>${dayMonth(S.me.plan_detail.renews_at)}</b>`, card && setMode !== 'plan-cancel' ? `<button class="pill line sm" type="button" data-set="plan-cancel">Cancel</button>` : '') : ''}
          ${card && setMode === 'plan-cancel' && !S.me.plan_detail?.ends_at ? `<li class="kv-form"><p class="plain">Your card won't be charged again. ${PLAN[S.me.plan]} stays until ${dayMonth(S.me.plan_detail.renews_at)}, then the account moves to Free.</p><div class="acts"><button class="pill danger md" type="button" data-set="plan-cancel-ok">Cancel plan</button><button class="pill line md" type="button" data-set="">Keep it</button></div></li>` : ''}
          ${S.me.storage ? row('Storage', meter()) : ''}
          ${boxFull ? `<li class="impnote">${wall('storage', 'Your mailbox is full. Delete some mail or move to a bigger plan.', again)}</li>` : ''}
          ${row('Balance', `<b class="strong">${usd(S.me.balance_usd)}</b>`, `<a class="pill line sm" href="${DEPOSIT_URL}">Add funds</a>`)}
        </ul>`, { sr: true })}
      ${S.activity?.rows?.length ? group('h-act', 'Balance activity', `<ul class="kv act">
          ${S.activity.rows.map(a => row(esc(a.what), `<b>${esc(/^[+-]/.test(a.usd) ? `${a.usd[0]}$${a.usd.slice(1)}` : `$${a.usd}`)}</b>`,
            a.href ? `<a class="pill ${a.status === 'Waiting for payment' ? 'light' : 'line'} sm" href="${siteUrl(a.href)}">Open</a>` : '', `${dayMonth(a.date)}${a.status ? `, ${esc(a.status)}` : ''}`)).join('')}
        </ul>`) : ''}
      ${sendingGroup(sentToday && S.me.sending.tier !== 'hold' ? wall('sending', `That's the most mail for a day (${S.me.sending.messages}). Try again tomorrow.`, again) : '')}
      ${S.me.plan !== 'free' ? group('h-inv', 'Invites', `<ul class="kv">
          ${row('Invite a friend', `<b>${S.me.invites_left ? '1 this month' : 'Used this month'}</b>`, S.me.invites_left ? btn('invite', 'Make a link') : '', 'Their free account can send from day one. If it is suspended for abuse in its first 90 days, your invites pause.')}
          ${(S.invites || []).filter(i => !i.used).map(i => row('Unused link', `<b class="strong long">${esc(i.link)}</b>`, `<button class="pill line sm" type="button" data-copy="${esc(i.link)}">Copy</button>`)).join('')}
        </ul>`) : ''}
      ${group('h-inc', `Included with ${PLAN[S.me.plan]}`, `<ul class="kv">
          ${row('Aliases', `<b>${ofLim(S.me.alias_count, S.me.alias_limit, 'aliases')}</b>`, '<a class="pill line sm" href="#/aliases">Manage</a>')}
          ${extras ? row('Extra addresses', `<b>${extras.length} of ${S.me.address_limit}</b>`, '<a class="pill line sm" href="#/settings/addresses">Manage</a>') : ''}
          ${doms ? row('Custom domains', `<b>${ofLim(doms.length, S.me.domain_limit, 'domains')}</b>`, '<a class="pill line sm" href="#/settings/domains">Manage</a>') : ''}
        </ul>`)}`,
    addresses: () => `
      ${group('h-al', 'Aliases', `<ul class="kv">
          ${S.me.primary_address ? row('Your @foldoy.com address', `<b class="strong long">${esc(S.me.primary_address)}</b>`, `<button class="pill line sm" type="button" data-copy="${esc(S.me.primary_address)}">Copy</button>`) : ''}
          ${S.me.can_claim_address && setMode !== 'claim' ? row('Your @foldoy.com address', '', btn('claim', 'Claim', 'light'), `Comes with ${PLAN[S.me.plan]}. ${esc(S.me.address)} keeps working.`) : ''}
          ${row('Your address', `<b class="strong long">${esc(S.me.address)}</b>`, `<button class="pill line sm" type="button" data-copy="${esc(S.me.address)}">Copy</button>`)}
          ${row('Aliases', `<b>${ofLim(S.me.alias_count, S.me.alias_limit, 'aliases')}</b>`, '<a class="pill line sm" href="#/aliases">Manage</a>')}
        </ul>`, { sr: true })}
      ${extras ? `${group('h-addr', 'Extra addresses', `${extras.length ? `<ul class="kv">${extras.map(a => `<li class="wide"><span class="k">${esc(a.address)}${a.held ? paused : ''}</span><span class="val"><button class="pill line sm" type="button" data-copy="${esc(a.address)}">Copy</button><button class="pill line sm" type="button" data-addr-del="${esc(a.id)}">Remove</button></span></li>`).join('')}</ul>` : ''}
        ${setMode === 'claim' ? `<form class="form newa" id="claimf" novalidate>
          <label class="label">Your @foldoy.com address</label><div id="claimpick"></div>
          <p class="t">Mail you send goes out from it. ${esc(S.me.address)} keeps receiving.</p>
          ${err('claimerr')}
          ${acts('Claim it')}
        </form>` : ''}
        ${setMode === 'addr-add' ? `<form class="form newa" id="addrf" novalidate>
          <label class="label">Address</label><div id="addrpick"></div>
          ${err('addrerr')}
          ${acts('Add address')}
        </form>` : ''}`, { lede: `${extras.length} of ${S.me.address_limit} on ${PLAN[S.me.plan]}.` })}
        ${extras.some(a => a.held) ? held : ''}
        ${setMode !== 'addr-add' && extras.length < S.me.address_limit ? `<div class="a-acts"><button class="pill line md" type="button" data-set="addr-add">Add an address</button></div>` : ''}` : ''}`,
    domains: () => {
      if (!doms) {
        return `${group('h-dom', 'Custom domains', '', { lede: 'Mail to the addresses you add on your own domain, like you@yourname.com, arrives in this mailbox.' })}
          ${wall('domains', `${PLAN[S.me.plan]} has no custom domains.`, again)}`;
      }
      const open = doms.find(x => x.id === openDom);
      const sub = d => d.held ? 'Paused: over your plan.' : d.status === 'active' ? (d.ready ? `Mail to the addresses you add on ${esc(d.domain)} arrives here.`
        : d.receiving === false && need(d).length && right(d) === need(d).length ? 'Records are right. Mail for this domain starts arriving within the hour.'
        : d.checked_at ? `${right(d)} of ${need(d).length} records right.` : 'Check its records.')
        : { verified: 'Yours. Waiting for the mail server to take it on.', unverified: 'Waiting for the DNS records.' }[d.status] || '';
      const warn = (d, w) => w.kind === 'mx_elsewhere'
        ? (w.has_ours ? `<p class="t dnswarn"><b>Its MX records point at foldoy and at ${esc(w.hosts.join(', '))}.</b> Mail goes to either one. Delete the other MX records.</p>`
          : `<p class="t dnswarn"><b>Mail to ${esc(d.domain)} goes to ${esc(w.hosts.join(', '))} now.</b> Once its MX record points at foldoy, new mail to it arrives here instead. <a href="#/settings/import">Import your old mail</a> first, then replace the old MX records with foldoy's.</p>`)
        : w.kind === 'no_domain' ? `<p class="t dnswarn"><b>Public DNS has no domain called ${esc(d.domain)}.</b> Check the spelling. A domain registered in the last few hours may not show yet.</p>`
        : w.kind === 'spf_many' ? `<p class="t dnswarn"><b>${esc(d.domain)} has ${w.count} SPF records.</b> A domain may have only one: with more, SPF checks fail. Keep one, with foldoy's include in it, and delete the others.</p>` : '';
      const cell = (v, label, pre = '') => `<span>${pre}${esc(v)}</span><button class="cp" type="button" data-copy="${esc(v)}" aria-label="${label}">${icon('copy')}</button>`;
      const wizard = d => { const h = d.dns_host; return `<div class="form dnsbox">
          ${h ? `<div class="step"><span class="n" aria-hidden="true">1</span><div><h4>${h.name ? `Its DNS is at ${esc(h.name)}` : 'Find where its DNS is managed'}</h4>
              <ol class="howto">${h.steps.map(t => `<li>${esc(t)}</li>`).join('')}</ol>
              ${h.url ? `<div class="acts"><a class="pill line sm" href="${esc(h.url)}" target="_blank" rel="noopener noreferrer">Open ${esc(h.name)}</a></div>` : ''}</div></div>` : ''}
          <div class="step"><span class="n" aria-hidden="true">${h ? 2 : 1}</span><div><h4>Add these records</h4>
            ${(d.warnings || []).map(w => warn(d, w)).join('')}
            <div class="dns" role="table" aria-label="DNS records for ${esc(d.domain)}">
              <div class="dh" role="row"><span role="columnheader">Type</span><span role="columnheader">Name</span><span role="columnheader">Value</span><span role="columnheader">Status</span></div>
              ${d.records.map(x => `<div role="row"><span role="cell">${esc(x.type)}</span><span role="cell" class="dhost">${cell(x.name, 'Copy the name')}</span>
                <span role="cell" class="dv">${x.value ? cell(x.copy, 'Copy the value', x.type === 'MX' ? `<span class="dpri">Priority ${x.priority}</span>` : '') : '<span class="mute2">Made when the mail server is set up</span>'}</span>
                <span role="cell" class="ok ${x.state === 'found' ? 'good' : x.state === 'missing' || x.state === 'wrong' ? 'bad' : ''}">${DSTATE[x.state] || ''}</span>
                ${x.state === 'wrong' && x.found.length ? `<span role="cell" class="dx">Found instead: ${x.found.map(v => `<code>${esc(v)}</code>`).join(' ')}</span>` : ''}
                ${x.fix ? `<span role="cell" class="dx">Change it to: <span class="dfix">${cell(x.fix, 'Copy the new value')}</span></span>` : ''}</div>`).join('')}
            </div>
            <p class="t u-mt8">${d.checked_at ? `${right(d)} of ${need(d).length} records right. Checked ${when(new Date(d.checked_at * 1000).toISOString())}.` : 'Not checked yet.'} New records can take a few hours to show.</p>
            ${domNote ? `<p class="say bad">${esc(domNote)}</p>` : ''}
            <div class="acts"><button class="pill light md" type="button" data-dom-check="${esc(d.id)}">Check again</button><button class="pill line md" type="button" data-dom-close>Close</button></div></div></div>
        </div>`; };
      return `
      ${group('h-dom', 'Custom domains', `${doms.length ? `<ul class="kv">${doms.map(d => row(`<b>${esc(d.domain)}</b>${d.held ? paused : ''}`,
          d.status === 'active' && !d.held && d.ready ? '<b class="mint">Active</b>' : '',
          (openDom === d.id ? '' : `<button class="pill line sm" type="button" data-dom-show="${esc(d.id)}">Records</button>`) + `<button class="pill line sm" type="button" data-dom-del="${esc(d.id)}">Remove</button>`,
          sub(d))).join('')}</ul>` : ''}
        ${open ? wizard(open) : ''}
        ${setMode === 'dom-add' ? `<form class="form" id="domf" novalidate>
          <label class="label" for="domin">Domain</label><div class="field"><input id="domin" placeholder="example.com" autocapitalize="none" spellcheck="false"></div>
          ${err('domerr')}
          ${acts('Add domain')}
        </form>` : ''}`, { sr: true, lede: `${ofLim(doms.length, S.me.domain_limit, 'domains')} on ${PLAN[S.me.plan]}.` })}
      ${doms.some(d => d.held) ? held : ''}
      ${setMode !== 'dom-add' && doms.length < S.me.domain_limit ? `<div class="a-acts"><button class="pill line md" type="button" data-set="dom-add">Add a domain</button></div>`
        : doms.length >= S.me.domain_limit ? wall('domains', `Your plan holds ${S.me.domain_limit} custom domain${S.me.domain_limit === 1 ? '' : 's'}.`, again) : ''}`;
    },
    export: () => `
      ${xjob ? group('h-expjob', xrunning ? 'Exporting now' : 'Last export', `<ul class="kv">
          ${row('Status', `<b class="${xrunning || xjob.status === 'done' ? 'mint' : ['failed'].includes(xjob.status) ? 'warn' : ''}">${xStatus}</b>`,
            xrunning && !xjob.cancelling ? btn('exp-cancel', 'Cancel') : '')}
          ${xjob.error ? `<li class="impnote">${esc(xjob.error)}</li>` : ''}
          ${row('Folders', `<b>${xjob.folders_total ? `${num(xjob.folders_done)} of ${num(xjob.folders_total)}` : xrunning ? 'Looking' : '0'}</b>`, '', xrunning && xjob.folder ? `Now writing ${esc(xjob.folder)}` : '')}
          ${row('Messages', `<b class="strong">${num(xjob.messages)}</b>`)}
          ${xjob.locked ? row('Encrypted messages', `<b>${num(xjob.locked)}</b>`, '', 'Still encrypted in the file, as OpenPGP') : ''}
          ${xjob.failed ? row('Not exported', `<b>${num(xjob.failed)}</b>`, '', 'The mail server would not send them') : ''}
          ${row('Size', `<b>${xjob.size ? gb(xjob.size) : '0 MB'}</b>`)}
          ${xjob.status === 'done' ? row('File', '', `<a class="pill light sm" href="/mail/api/export/file" download>Download</a>${btn('exp-del', 'Delete file')}`,
            `Until ${full(xjob.expires)}. Removed from foldoy's server after one download.`) : ''}
        </ul>`) : ''}
      ${xrunning ? '' : group('h-exp', 'Export mail', `<form class="form" id="expf" novalidate>
          <p class="t">One .zip file with an .mbox file for each folder.</p>
          ${S.me.account_key?.id ? `<p class="t u-mt8">Mail encrypted to your key goes into the file still encrypted, as OpenPGP. A mail app that supports OpenPGP, such as Thunderbird, opens it with your private key.${!own && !pp.on ? ' <a href="#/settings/pgp">Your private key is in PGP info.</a>' : ''}</p>` : ''}
          <p class="t u-mt8">The file waits 24 hours for one download, then it is removed.</p>
          ${pw('exppw')}
          ${err('experr')}
          <div class="acts"><button class="pill ${xjob?.status === 'done' ? 'line' : 'light'} md" type="submit">Start export</button></div>
        </form>`, { sr: true })}`,
    install: () => {
      const HOW = {
        ios: ['iPhone and iPad', ['Open foldoy in Safari.', 'Tap <b>Share</b>. If you don\'t see it, tap <b>•••</b> first.', 'Tap <b>Add to Home Screen</b>, then <b>Add</b>.']],
        android: ['Android', ['Open foldoy in Chrome.', 'Tap the menu <b>⋮</b> at the top right.', 'Tap <b>Install app</b> or <b>Add to Home screen</b>, and confirm.']],
        desk: ['Chrome or Edge on a computer', ['Click the install icon at the right end of the address bar.', 'Click <b>Install</b>.']],
        mac: ['Safari on a Mac', ['Choose <b>File</b>, <b>Add to Dock</b>. This needs macOS Sonoma or later.', 'Click <b>Add</b>.']],
      };
      const here = device(), ua = navigator.userAgent;
      const macSafari = here === 'computer' && /Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|Edg|Firefox/.test(ua);
      const order = { ios: ['ios', 'android', 'desk', 'mac'], android: ['android', 'ios', 'desk', 'mac'], computer: macSafari ? ['mac', 'desk', 'ios', 'android'] : ['desk', 'mac', 'ios', 'android'] }[here];
      return `
      ${installAsk ? group('h-inst-now', 'This browser', `<ul class="kv">${row('Install foldoy', '', '<button class="pill light sm" type="button" data-set="install-now">Install</button>')}</ul>`) : ''}
      ${order.map(k => group(`h-inst-${k}`, HOW[k][0], `<div class="form"><ol class="howto">${HOW[k][1].map(t => `<li>${t}</li>`).join('')}</ol></div>`)).join('')}`;
    },
    apps: () => {
      const h = S.me.mail_hosts, aps = apps || [], made = d => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      const cp = (v, what) => `<button class="pill line sm" type="button" data-copy="${esc(String(v))}" aria-label="Copy the ${what}">Copy</button>`;
      const servers = `<ul class="kv">
          ${row('Incoming mail (IMAP)', `<b class="strong long">${esc(h.imap)}</b>`, cp(h.imap, 'IMAP server'), `Port ${h.imap_port}, SSL/TLS`)}
          ${row('Outgoing mail (SMTP)', `<b class="strong long">${esc(h.smtp)}</b>`, cp(h.smtp, 'SMTP server'), `Port ${h.smtp_port}, SSL/TLS${h.smtp_starttls_port ? `, or port ${h.smtp_starttls_port}, STARTTLS` : ''}`)}
          ${row('Username', `<b class="strong long">${esc(h.login)}</b>`, cp(h.login, 'username'), 'For incoming and outgoing mail')}
          ${row('Password', '<b>An app password</b>', '', 'Not your login password')}
        </ul>`;
      return `
      ${group('h-apps', 'App passwords', `${aps.length ? `<ul class="kv">${aps.map(x => row(`<b class="strong">${esc(x.label)}</b>`, '',
          setMode === `app-rv-${x.id}` ? `<button class="pill danger sm" type="button" data-revoke="${esc(x.id)}">Revoke</button>${btn('', 'Cancel')}` : btn(`app-rv-${x.id}`, 'Revoke'),
          setMode === `app-rv-${x.id}` ? 'New sign-ins with it stop at once. An app already connected may finish sending what it is sending.' : `Made ${made(x.created)}`)).join('')}</ul>` : ''}
        ${newApp ? `<div class="form">
          <p class="t"><b>The app password for ${esc(newApp.label)}.</b> It is shown once. Type it into the app as the password, with ${esc(newApp.login || h.login)} as the username.</p>
          <p class="kc">${esc(newApp.secret)}</p>
          <div class="acts"><button class="pill line md" type="button" data-copy="${esc(newApp.secret)}">Copy</button><button class="pill light md" type="button" data-set="app-done">I've added it</button></div>
        </div>` : setMode === 'app' ? `<form class="form" id="appf" novalidate>
          <label class="label" for="appl">Name</label><div class="field"><input id="appl" placeholder="Thunderbird on my laptop" maxlength="60" autocomplete="off"></div>
          ${pw('appw')}
          ${err('apperr')}
          ${acts('Make app password')}
        </form>` : ''}`, { lede: 'Up to 5. Signing out other sessions (in Security), a password reset and deleting the account revoke every app password.' })}
      ${newApp || setMode === 'app' || aps.length >= 5 ? '' : `<div class="a-acts"><button class="pill ${busy ? 'line' : 'light'} md" type="button" data-set="app">New app password</button></div>`}
      ${group('h-apps-srv', 'Server settings', servers)}
      ${group('h-apps-lock', 'Encrypted mail in apps', `<div class="form"><ul class="howto bul">
          <li>Your mail stays encrypted on the server. The app decrypts it on your device with your key, which you add to the app once.</li>
          <li>Without your key, the app lists your mail but can't open it${S.me.mail_subjects_locked ? ', and each encrypted message shows the subject <b>...</b>' : ''}.</li>
          <li>Mail you send from an app counts toward the same daily limits as mail you send here.</li>
          <li>Apple Mail, Outlook and the Gmail app can't open encrypted mail today.</li>
        </ul></div>`)}
      ${group('h-apps-key', 'Key file for mail apps', own
        ? '<ul class="kv">' + row('Your own key', '', '', "Mail to you is encrypted with your own PGP key, which foldoy doesn't have. Add that key to the app.") + '</ul>'
        : `<ul class="kv">${row('Key file', '', appKeyPass ? '' : btn('app-key', 'Download'), 'Every private key of your account, for your address and each alias, in one file. Encrypted with a passphrase shown once.')}</ul>
        ${appKeyPass ? `<div class="form">
          <p class="t"><b>The passphrase for the key file.</b> The app asks for it when you import the file. It is shown once.</p>
          <p class="kc">${esc(appKeyPass)}</p>
          <div class="acts"><button class="pill line md" type="button" data-copy="${esc(appKeyPass)}">Copy</button><button class="pill light md" type="button" data-set="app-key-done">Done</button></div>
        </div>` : ''}`)}
      ${group('h-apps-tb', 'Thunderbird on a computer', `<div class="form"><ol class="howto">
          <li>Make an app password above.</li>
          <li>In Thunderbird, open the menu <b>≡</b> and choose <b>New Account</b>, <b>Email</b>.</li>
          <li>Type your name, <b>${esc(h.login)}</b> and the app password, and press <b>Continue</b>. Thunderbird fills in the server settings. If it doesn't, press <b>Configure manually</b> and type the settings above.</li>
          <li>Press <b>Done</b>.</li>
          ${own ? '<li>Add your own PGP key in <b>Account Settings</b>, <b>End-To-End Encryption</b>.</li>' : `<li>Download the key file above.</li>
          <li>Open <b>Account Settings</b>, then <b>End-To-End Encryption</b>, and press <b>Add Key</b>.</li>
          <li>Choose <b>Import an existing OpenPGP Key</b>, pick the file and type its passphrase.</li>
          <li>Back in <b>End-To-End Encryption</b>, choose the key for ${esc(h.login)}.</li>`}
        </ol></div>`)}
      ${group('h-apps-and', 'Thunderbird on Android', `<div class="form"><ol class="howto">
          <li>Install <b>OpenKeychain</b> from Google Play or F-Droid. Thunderbird on Android needs it for encrypted mail.</li>
          <li>${own ? 'Import your own PGP key into OpenKeychain.' : 'In OpenKeychain, import the key file and type its passphrase.'}</li>
          <li>In Thunderbird, add your account with <b>${esc(h.login)}</b> and an app password.</li>
          <li>In the account's settings, open <b>End-to-end encryption</b>, choose OpenKeychain, and pick your key.</li>
        </ol></div>`)}`;
    },
  };
  const title = SECS.find(([k]) => k === cur)[1];
  setView('settings', listOnly ? 'list' : 'pane');
  const lh = `
    <div class="lh">
      <button class="menu-btn" type="button" data-act="rail" aria-label="Folders and settings">${icon('menu')}</button>
      <h1 tabindex="-1" id="seth">Settings</h1>
    </div>
    <div class="rows srows" role="list">${[['Account', ['account', 'plan', 'addresses', 'domains']], ['Mail', ['mail', 'screener', 'appearance', 'apps', 'install']],
      ['Privacy and security', ['security', 'privacy', 'pgp']], ['Moving your mail', ['import', 'switch', 'export']]].map(([g, ks]) => {
      const items = SECS.filter(([k]) => ks.includes(k)); if (!items.length) return '';
      return `<p class="sgh" role="presentation">${g}</p>${items.map(([k, n]) => `<a class="row srow" role="listitem" href="#/settings/${k}" data-id="${k}"><span class="from">${n}</span>${icon('next')}</a>`).join('')}`;
    }).join('')}</div>`;
  if (lh !== S.setList || !list.querySelector('.srows')) { list.innerHTML = lh; S.setList = lh; }
  markCurrent(listOnly ? null : cur);
  pane.innerHTML = listOnly ? '' : `
    <div class="in set" data-sec="${cur}">
      <div class="tools ph"><button class="iconbtn back" type="button" data-act="sback" aria-label="Back to settings">${icon('back')}</button></div>
      <h2 tabindex="-1" id="h-sec">${title}</h2>
      ${body[cur]()}
    </div>`;
  const nff = $('#nff');
  if (nff) nff.addEventListener('submit', async e => {
    e.preventDefault(); const v = $('#nfname').value.trim(); if (!v) return;
    try { await api.makeFolder(v); await railQuiet(); toast(`Folder ${v} made`); } catch (x) { toast(x.message); }
    showSettings();
  });
  const frf = $('#frenf');
  if (frf) { $('#frenin').focus(); frf.addEventListener('submit', async e => {
    e.preventDefault();
    const v = $('#frenin').value.trim();
    if (!v) { toast('Give the folder a name.'); $('#frenin').focus(); return; }
    try { await api.renameFolder(frf.dataset.id, v); setMode = null; await railQuiet(); } catch (x) { toast(x.message); }
    showSettings();
  }); }
  const rlf = $('#rulef');
  if (rlf) rlf.addEventListener('submit', async e => {
    e.preventDefault(); const [action, folder] = $('#raction').value.split(':');
    const v = $('#rvalue').value.trim().toLowerCase(), ok = okAddr(v) || /^[^@\s<>()]+@$/.test(v) || /^@?[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(v);
    if (!ok) { $('#rerr').textContent = v ? 'Write an address, or @ and a domain, like @example.com.' : 'Write the address the rule looks for.'; $('#rvalue').setAttribute('aria-invalid', 'true'); $('#rvalue').focus(); return; }
    $('#rvalue').removeAttribute('aria-invalid');
    try { S.rulesList = await api.addRule({ field: $('#rfield').value, value: $('#rvalue').value, action, folder }); toast('Rule added'); showSettings(); }
    catch (x) { $('#rerr').textContent = x.message; }
  });
  const arf = $('#arf');
  if (arf) {
    $('#aron').onclick = () => $('#aron').setAttribute('aria-checked', String($('#aron').getAttribute('aria-checked') !== 'true'));
    arf.addEventListener('submit', async e => {
      e.preventDefault();
      const day = (id, end) => { const v = $(id).value; return v ? new Date(`${v}T${end ? '23:59' : '00:00'}`).toISOString() : null; };
      const on = $('#aron').getAttribute('aria-checked') === 'true', a = day('#arfrom'), b = day('#arto', true);
      if (on && !$('#artext').value.trim()) { $('#arsay').textContent = 'Write the reply first.'; $('#artext').focus(); return; }
      if (a && b && b <= a) { $('#arsay').textContent = 'The end comes after the start.'; $('#arto').focus(); return; }
      try {
        S.me = await api.autoreply({ enabled: $('#aron').getAttribute('aria-checked') === 'true', subject: $('#arsub').value, text: $('#artext').value, from: day('#arfrom'), to: day('#arto', true) });
        $('#arsay').textContent = S.me.autoreply?.enabled ? 'On' : 'Saved';
      } catch (x) { $('#arsay').textContent = x.message; }
    });
  }
  const expf = $('#expf');
  if (expf) expf.addEventListener('submit', async e => {
    e.preventDefault();
    const er = $('#experr'), b = $('button[type=submit]', expf);
    er.textContent = '';
    if (!$('#exppw').value) { er.textContent = 'Type your password.'; $('#exppw').focus(); return; }
    b.setAttribute('aria-busy', 'true'); b.textContent = 'Starting…';
    try {
      S.exp = (await api.startExport(await au('exppw'), tfa())).job; S.expAt = Date.now();
      S.focusSec = 'h-expjob'; drawSettings('export');
    } catch (x) { er.textContent = x.message; b.removeAttribute('aria-busy'); b.textContent = 'Start export'; }
  });
  const impf = $('#impf');
  if (impf) impf.addEventListener('submit', async e => {
    e.preventDefault();
    const er = $('#imperr'), b = $('button[type=submit]', impf), u = $('#impu').value.trim(), pw = $('#impp').value;
    er.textContent = '';
    const host = gm ? '' : $('#imph').value.trim();
    if (!gm && !host) { er.textContent = "Type the server's name."; $('#imph').focus(); return; }
    if (!u) { er.textContent = gm ? 'Type your Gmail address.' : 'Type the username.'; $('#impu').focus(); return; }
    if (!pw) { er.textContent = gm ? 'Paste the app password.' : 'Type the password.'; $('#impp').focus(); return; }
    b.setAttribute('aria-busy', 'true'); b.textContent = 'Signing in…';
    try {
      S.imp = (await api.startImport({ host, port: gm ? 993 : $('#impo').value.trim(), username: u, app_password: gm ? pw.replace(/\s+/g, '') : pw })).job;
      $('#impp').value = '';
      drawSettings('import');
    } catch (x) { er.textContent = x.message; b.removeAttribute('aria-busy'); b.textContent = 'Start import'; }
  });
  $$('.swl input[data-sw]').forEach(c => c.addEventListener('change', async () => {
    const was = S.swDone;
    S.swDone = c.checked ? [...was.filter(k => k !== c.dataset.sw), c.dataset.sw] : was.filter(k => k !== c.dataset.sw);
    try { S.swDone = (await api.switchTick(c.dataset.sw, c.checked)).done; } catch (x) { S.swDone = was; toast(x.message); }
    S.focusSec = 'h-sw'; drawSettings('switch'); $(`.swl input[data-sw="${c.dataset.sw}"]`)?.focus();
  }));
  const sf = $('#sigf');
  if (sf) sf.addEventListener('submit', async e => {
    e.preventDefault();
    try { S.me = await api.preferences({ signature: $('#sigin').value }); $('#sigsay').textContent = 'Saved'; } catch (x) { $('#sigsay').textContent = x.message; }
  });
  const rf = $('#recf');
  if (rf) {
    ($('#recin') || $('#reccode') || $('#recpw')).focus();
    rf.addEventListener('submit', async e => {
      e.preventDefault();
      try {
        if (setMode === 'rec') { await api.setRecovery($('#recin').value.trim(), await au('recpw'), tfa()); setMode = 'rec-code'; return showSettings(); }
        if (setMode === 'rec-code') { await api.confirmRecovery($('#reccode').value.trim()); toast('Confirmed. Password reset is available.'); }
        else { await api.clearRecovery(await au('recpw'), tfa()); toast('Removed. Password reset is off.'); }
        setMode = null; showSettings(); }
      catch (x) { $('#recerr').textContent = x.message; }
    });
  }
  const pf = $('#ppf');
  if (pf) {
    $('#ppk1').focus();
    pf.addEventListener('submit', async e => {
      e.preventDefault();
      const err = $('#pperr'), b = $('button[type=submit]', pf), on = setMode === 'pp-on'; err.textContent = '';
      const k = $('#ppk1').value;
      if (on) {
        const why = account.passwordProblem(k);
        if (why) { err.textContent = why.replace('Pick another', 'Pick another key'); $('#ppk1').focus(); return; }
        if (k !== $('#ppk2').value) { err.textContent = "The two keys don't match."; $('#ppk2').select(); return; }
        if (k === $('#ppw').value) { err.textContent = "Use a key that isn't your login password."; $('#ppk1').select(); return; }
      } else if (!k) { err.textContent = 'Type your privacy+ key.'; return; }
      b.setAttribute('aria-busy', 'true'); b.textContent = on ? 'Locking your keys…' : 'Turning off…';
      try {
        if (on) { await account.ppTurnOn($('#ppw').value, k, S.me, tfa()); idx.stop(); await idx.drop(); ppBackup = k; toast('privacy+ is on'); }
        else { await account.ppTurnOff($('#ppw').value, k, S.me, tfa()); toast('privacy+ is off'); }
        setMode = null; showSettings();
      } catch (x) { err.textContent = x.message; b.removeAttribute('aria-busy'); b.textContent = on ? 'Turn on privacy+' : 'Turn off privacy+'; }
    });
  }
  if ($('#fp')) pgp.fingerprint(S.me.key.public_key).then(f => { const e = $('#fp'); if (e) e.textContent = f.split(' ').slice(-4).join(' '); }).catch(() => {});
  const ppbf = $('#ppbf');
  if (ppbf) {
    $('#ppbk').focus();
    ppbf.addEventListener('submit', async e => {
      e.preventDefault(); const er = $('#ppberr'), k = $('#ppbk').value; er.textContent = '';
      if (!k) { er.textContent = 'Type your privacy+ key.'; return; }
      try { await account.ppUnlock(k, S.me); pgp.download(await account.ppBackup(S.me, k), 'foldoy-privacy-plus-backup.asc'); $('#ppbk').value = ''; setMode = null; showSettings(); }
      catch (x) { er.textContent = x.message; $('#ppbk').select(); }
    });
  }
  const ppx = $('#ppx');
  if (ppx) {
    ($('#pkey') || $('#ppw')).focus();
    $('#pkfile')?.addEventListener('change', async e => { const f = e.target.files[0]; if (f) $('#pkey').value = await f.text(); });
    ppx.addEventListener('submit', async e => {
      e.preventDefault();
      const err = $('#pperr'), btn = $('button[type=submit]', ppx); err.textContent = '';
      try {
        if (setMode === 'pp-own') {
          const k = await pgp.readPublic($('#pkey').value);
          await api.ownKey(await au('ppw'), tfa(), k.public_key);
          idx.stop(); await idx.drop();
          toast('Your own key is in use');
        } else {
          btn.setAttribute('aria-busy', 'true'); btn.textContent = 'Making your key…';
          await account.keyHere($('#ppw').value, S.me, tfa());
          toast('A new key is made here.');
        }
        setMode = null; S.key = ''; showSettings();
      } catch (x) { err.textContent = x.message; btn.removeAttribute('aria-busy'); btn.textContent = setMode === 'pp-own' ? 'Use this key' : 'Make a key here'; }
    });
  }
  const domf = $('#domf');
  if (domf) {
    $('#domin').focus();
    domf.addEventListener('submit', async e => {
      e.preventDefault();
      const b = $('button[type=submit]', domf);
      b.setAttribute('aria-busy', 'true'); b.textContent = 'Adding…';
      try {
        const d = await api.addDomain($('#domin').value);
        openDom = d.id; domNote = ''; setMode = null;
        S.sd.doms = [...(S.sd.doms || []), d]; drawSettings('domains');
        checkDom(d.id, true);
      } catch (x) { $('#domerr').textContent = x.message; b.removeAttribute('aria-busy'); b.textContent = 'Add domain'; }
    });
  }
  const addrf = $('#addrf');
  if (addrf) {
    const ap = picker($('#addrpick'), { domains: ['veil.no', ...FREE_DOMAINS.filter(d => d !== 'veil.no')].map(d => ({ d, plan: '' })), domain: 'veil.no', placeholder: 'name', label: 'Address name' });
    ap.focus();
    addrf.addEventListener('submit', async e => {
      e.preventDefault(); const v = ap.get();
      if (!v.name) { $('#addrerr').textContent = 'Type the name you want.'; return; }
      try { const a = await account.createAddress(v.name, v.domain); S.me = await api.session(); toast(`${a.address} is yours.`); setMode = null; showSettings(); }
      catch (x) { $('#addrerr').textContent = x.message; }
    });
  }
  const claimf = $('#claimf');
  if (claimf) {
    const cp = picker($('#claimpick'), { name: S.me.address.split('@')[0], domains: [{ d: 'foldoy.com', plan: '' }], domain: 'foldoy.com', placeholder: 'name', label: 'Address name' });
    cp.focus();
    claimf.addEventListener('submit', async e => {
      e.preventDefault(); const v = cp.get();
      if (!v.name) { $('#claimerr').textContent = 'Type the name you want.'; return; }
      try { const a = await account.createAddress(v.name, 'foldoy.com', true); S.me = await api.session(); toast(`${a.address} is yours.`); setMode = null; showSettings(); }
      catch (x) { $('#claimerr').textContent = x.message; }
    });
  }
  const appf = $('#appf');
  if (appf) {
    $('#appl').focus();
    appf.addEventListener('submit', async e => {
      e.preventDefault();
      const er = $('#apperr'), b = $('button[type=submit]', appf); er.textContent = '';
      if (!$('#appl').value.trim()) { er.textContent = 'Name it after the app or device, so you know which one to revoke.'; $('#appl').focus(); return; }
      if (!$('#appw').value) { er.textContent = 'Type your password.'; $('#appw').focus(); return; }
      b.setAttribute('aria-busy', 'true'); b.textContent = 'Making…';
      try {
        newApp = await api.createAppPassword($('#appl').value.trim(), await au('appw'), tfa()); setMode = null;
        S.sd.apps = [...(S.sd.apps || []), { id: newApp.id, label: newApp.label, created: newApp.created, last_used: null }];
        S.focusSec = 'h-apps'; drawSettings('apps');
      } catch (x) { er.textContent = x.message; b.removeAttribute('aria-busy'); b.textContent = 'Make app password'; if (x.two_factor) $('#tfa')?.select(); }
    });
  }
  const rcf = $('#rcf');
  if (rcf) {
    $('#rcpw').focus();
    rcf.addEventListener('submit', async e => {
      e.preventDefault(); const b = $('button[type=submit]', rcf); $('#rcerr').textContent = '';
      b.setAttribute('aria-busy', 'true'); b.textContent = 'Making the code…';
      try { freshRC = await account.makeRecoveryCode($('#rcpw').value, S.me, tfa()); setMode = null; showSettings(); }
      catch (x) { $('#rcerr').textContent = x.message; b.removeAttribute('aria-busy'); b.textContent = 'Make the code'; }
    });
  }
  const ruf = $('#ruf');
  if (ruf) {
    $('#rcin').focus();
    ruf.addEventListener('submit', async e => {
      e.preventDefault(); const b = $('button[type=submit]', ruf); $('#ruerr').textContent = '';
      b.setAttribute('aria-busy', 'true'); b.textContent = 'Unlocking…';
      try { const n = await account.unlockOlder($('#rcin').value, S.me); toast(n ? 'Older mail opens again.' : 'There was nothing older to unlock.'); S.key = ''; setMode = null; showSettings(); }
      catch (x) { $('#ruerr').textContent = x.message; b.removeAttribute('aria-busy'); b.textContent = 'Unlock'; }
    });
  }
  const tff = $('#tff');
  if (tff) {
    ($('#tfpw') || $('#tfc')).focus();
    tff.addEventListener('submit', async e => {
      e.preventDefault();
      try {
        if (setMode === 'tf-on' && !tfSetup) { tfAuth = await au('tfpw'); tfSetup = await api.twoFactorSetup(tfAuth); return showSettings(); }
        if (setMode === 'tf-on') { freshCodes = (await api.twoFactorConfirm($('#tfc').value.trim(), tfAuth)).recovery_codes; tfSetup = null; tfAuth = null; toast('Two-factor is on'); }
        else if (setMode === 'tf-off') { await api.twoFactorOff(await au('tfpw'), $('#tfc').value.trim()); toast('Two-factor is off'); }
        else { freshCodes = (await api.recoveryCodes(await au('tfpw'), $('#tfc').value.trim())).recovery_codes; }
        setMode = null; showSettings();
      } catch (x) { $('#tferr').textContent = x.message; }
    });
  }
  const pwf = $('#pwf');
  if (pwf) {
    $('#pwc').focus();
    pwf.addEventListener('submit', async e => {
      e.preventDefault();
      const why = account.passwordProblem($('#pwn').value);
      if (why) { $('#pwerr').textContent = why; return; }
      const was = pgp.deviceKey();
      try { await account.changePassword($('#pwc').value, $('#pwn').value, S.me, tfa()); idx.rewrap(was, pgp.deviceKey()); toast('Password changed'); setMode = null; showSettings(); }
      catch (x) { $('#pwerr').textContent = x.message; }
    });
  }
  const delf = $('#delf');
  if (delf) {
    const dlg = $('#deldlg'); dlg.showModal();
    dlg.addEventListener('cancel', e => { e.preventDefault(); setMode = null; S.focusSec = 'h-del'; showSettings(); });
    $('#delpw').focus();
    delf.addEventListener('submit', async e => {
      e.preventDefault();
      try { await api.deleteAccount(await au('delpw'), tfa()); await pgp.forget(S.me.address); location.href = '/'; }
      catch (x) { $('#delerr').textContent = x.message; }
    });
  }
  const back = S.focusSec && $('#' + S.focusSec); S.focusSec = null;
  if (!pf && !rf && !tff && !pwf && !delf && !ppx && !appf && !domf && !addrf && !claimf && !rcf && !ruf && !ppbf) {
    if (ppBackup) $('#h-pp')?.focus({ preventScroll: true });
    else if (freshRC) $('#h-rc')?.focus({ preventScroll: true });
    else if (freshCodes) $('#h-tf')?.focus({ preventScroll: true });
    else if (keyPass) $('#h-key')?.focus({ preventScroll: true });
    else if (newApp) $('#h-apps')?.focus({ preventScroll: true });
    else if (appKeyPass) $('#h-apps-key')?.focus({ preventScroll: true });
    else if (openDom) $('#h-dom')?.focus({ preventScroll: true });
    else if (used && $(`.pane [data-set="${CSS.escape(used)}"]`)) { $(`.pane [data-set="${CSS.escape(used)}"]`).focus({ preventScroll: true }); pane.scrollTop = keepTop; }
    else (back || $(sec ? '#h-sec' : '#seth'))?.focus({ preventScroll: true });
  }
}

function openRail() { app.classList.add('rail-open'); $('.scrim').hidden = false; $('#rail').querySelector('a[aria-current], a')?.focus(); }
function closeRail() { if (!app.classList.contains('rail-open')) return; app.classList.remove('rail-open'); if (!phone()) $('.scrim').hidden = true; }

document.addEventListener('submit', async e => {
  if (e.target.id !== 'dnamef') return;
  e.preventDefault();
  const i = $('#dname'), b = e.target.querySelector('button');
  b.setAttribute('aria-busy', 'true');
  try { S.me = await api.setAppearance({ display: i.value }); i.value = S.me.display || ''; b.hidden = true; toast(S.me.display ? `Mail you send shows ${S.me.display}` : 'Mail you send shows your address'); }
  catch (x) { toast(x.message); }
  finally { b.removeAttribute('aria-busy'); }
});
document.addEventListener('input', e => {
  if (e.target.id !== 'dname') return;
  const b = e.target.form?.querySelector('button[type=submit]');
  if (b) b.hidden = e.target.value.trim() === (S.me.display || '').trim();
});
document.addEventListener('click', async e => {
  const snz = e.target.closest('[data-snz]'); if (snz) return doSnooze(snz.dataset.snz);
  const mv = e.target.closest('[data-moveto]'); if (mv) return moveTo(mv.dataset.moveto);
  const sl = e.target.closest('[data-later]'); if (sl) return sendLater(sl.dataset.later);
  const tm = e.target.closest('[data-tm]'); if (tm) return openCard(tm.dataset.tm);
  const hd = e.target.closest('.msg > .who');
  if (hd && S.thread?.length && !e.target.closest('button, a, [data-act], [data-tip]')) {
    const msg = hd.parentElement, fold = !msg.classList.contains('folded');
    msg.classList.toggle('folded', fold); hd.setAttribute('aria-expanded', String(!fold));
    if (fold) $$('.tm[aria-expanded="true"]', pane).forEach(t => { t.setAttribute('aria-expanded', 'false'); const x = $(`#tmb-${t.dataset.tm}`, pane); if (x) x.hidden = true; });
    return;
  }
  const rd = e.target.closest('[data-rdel]');
  if (rd) { try { await api.deleteRule(rd.dataset.rdel); S.rulesList = null; toast('Rule deleted'); } catch (x) { toast(x.message); } return showSettings(); }
  const fd = e.target.closest('[data-fdelok]');
  if (fd) { try { const r = await api.deleteFolder(fd.dataset.fdelok), n = r?.rules_deleted || 0; setMode = null; S.rulesList = null; await railQuiet(); toast(`Folder deleted. Its mail is in Archive.${n ? ` ${n === 1 ? 'Its rule was' : `Its ${n} rules were`} deleted too.` : ''}`); } catch (x) { toast(x.message); } return showSettings(); }
  const ub = e.target.closest('[data-unblock]');
  if (ub) { try { await api.unblock(ub.dataset.unblock); S.blockedList = null; toast('Unblocked'); } catch (x) { toast(x.message); } return showSettings(); }
  const go = e.target.closest('[data-goto]');
  if (go) { const h = $('#' + go.dataset.goto); h?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); h?.focus({ preventScroll: true }); return; }
  const t = e.target.closest('[data-act],[data-copy],[data-set],[data-alias-act],[data-rmfile],[data-alias],[data-endsess],[data-revoke],[data-dom-show],[data-dom-close],[data-dom-check],[data-dom-del],[data-addr-del]');
  if (!t) return;
  if (t.closest('.set section')) S.focusSec = t.closest('section').getAttribute('aria-labelledby');
  if (t.dataset.copy) return copy(t.dataset.copy);
  if (t.dataset.rmfile) { S.compose.files.splice(+t.dataset.rmfile, 1); renderFiles(); return filesChanged(S.compose); }
  if (t.dataset.aliasAct) return aliasAct(t.dataset.aliasAct);
  if (t.dataset.alias) { e.preventDefault(); const as = await api.aliases().catch(() => []); const a = as.find(x => x.address === t.dataset.alias); location.hash = a ? `#/aliases/${a.id}` : '#/aliases'; return; }
  if (t.dataset.domShow) { openDom = t.dataset.domShow; domNote = ''; return showSettings(); }
  if (t.dataset.domClose !== undefined) { openDom = null; return showSettings(); }
  if (t.dataset.domCheck) { t.setAttribute('aria-busy', 'true'); t.textContent = 'Checking…'; return checkDom(t.dataset.domCheck); }
  if (t.dataset.domDel || t.dataset.addrDel) {
    if (!t.dataset.sure) {
      $$('[data-sure]').forEach(b => { delete b.dataset.sure; b.textContent = 'Remove'; b.className = 'pill line sm'; });
      $$('.rmnote').forEach(n => n.remove());
      t.dataset.sure = '1'; t.textContent = 'Remove for good'; t.className = 'pill danger sm';
      t.closest('li')?.insertAdjacentHTML('afterend', `<li class="rmnote">${t.dataset.domDel ? 'Mail to every address at this domain stops arriving.' : 'Mail to this address stops arriving and its key is erased.'} Press again to remove it.</li>`);
      return;
    }
    try {
      if (t.dataset.domDel) { await api.deleteDomain(t.dataset.domDel); if (openDom === t.dataset.domDel) openDom = null; toast('Domain removed.'); }
      else { await api.deleteAddress(t.dataset.addrDel); S.me = await api.session(); toast('Address removed.'); }
    } catch (x) { toast(x.message); }
    S.focusSec = t.dataset.domDel ? 'h-dom' : 'h-addr'; return showSettings();
  }
  if (t.dataset.revoke) {
    try { await api.revokeAppPassword(t.dataset.revoke); setMode = null; S.sd.apps = (S.sd.apps || []).filter(x => x.id !== t.dataset.revoke); toast('Revoked. New sign-ins with it stop now.'); }
    catch (x) { toast(x.message); }
    S.focusSec = 'h-apps'; return drawSettings('apps');
  }
  if (t.dataset.endsess) { let r; try { r = await api.endSession(t.dataset.endsess); } catch (x) { return toast(x.message); } if (r.signed_out) { location.href = '/login/'; return; } toast('Signed out'); return showSettings(); }
  if (t.dataset.set !== undefined) {
    if (t.dataset.set === 'imp-gmail' || t.dataset.set === 'imp-other') { impWho = t.dataset.set.slice(4); return drawSettings('import'); }
    if (t.dataset.set === 'exp-cancel' || t.dataset.set === 'exp-del') { try { S.exp = (await api.cancelExport()).job; S.expAt = Date.now(); } catch (x) { toast(x.message); } return drawSettings('export'); }
    if (t.dataset.set === 'imp-cancel') { try { S.imp = (await api.cancelImport()).job; } catch (x) { toast(x.message); } return drawSettings('import'); }
    if (t.dataset.set === 'sess-others-ok') {
      try {
        const r = await api.endOtherSessions(), ap = r.app_passwords || { revoked: 0, waiting: 0 };
        setMode = null;
        toast(`Signed out everywhere else.${ap.revoked ? ` ${ap.revoked === 1 ? 'Your app password is' : `${ap.revoked} app passwords are`} revoked.` : ''}${ap.waiting ? ' The mail server is told again every two minutes until it takes the change.' : ''}`, null, ap.waiting ? 9000 : undefined);
      } catch (x) { toast(x.message); }
      return showSettings();
    }
    if (t.dataset.set === 'tf-dl') return pgp.download(new Blob([`foldoy backup codes\n${S.me.address}\n\n${freshCodes.join('\n')}\n`], { type: 'text/plain' }), 'foldoy-backup-codes.txt');
    if (t.dataset.set === 'app-done') { newApp = null; return showSettings(); }
    if (t.dataset.set === 'app-key') {
      const k = await pgp.appKeyFile().catch(x => ({ error: x.message })); if (k.error) return toast(k.error);
      pgp.download(k.blob, 'foldoy-keys-for-mail-apps.asc'); appKeyPass = k.code; return drawSettings('apps');
    }
    if (t.dataset.set === 'app-key-done') { appKeyPass = null; return drawSettings('apps'); }
    if (t.dataset.set === 'tf-done') { freshCodes = null; return showSettings(); }
    if (t.dataset.set === 'keyfile') { const k = await pgp.keyFile(S.me.address).catch(x => ({ error: x.message })); if (k.error) return toast(k.error);
      pgp.download(k.blob, 'foldoy-private-key.asc'); keyPass = k.code; return showSettings(); }
    if (t.dataset.set === 'pubfile') return pgp.download(pgp.publicFile(S.me.address, S.me.keys), 'foldoy-public-key.asc');
    if (t.dataset.set === 'install-now') {
      const ask = installAsk; if (!ask) return;
      ask.prompt();
      const { outcome } = await ask.userChoice.catch(() => ({}));
      installAsk = null;
      if (outcome === 'accepted') toast('foldoy is installed');
      return drawSettings('install');
    }
    if (t.dataset.set === 'sidx-rm' || t.dataset.set === 'sidx-build') {
      t.setAttribute('aria-busy', 'true');
      if (t.dataset.set === 'sidx-rm') { await idx.remove(); toast('Search index removed from this device'); } else await idx.build();
      return showSettings();
    }
    if (t.dataset.set === 'notify') {
      if (notifyOn()) remember('foldoy-notify', '0');
      else if ((await Notification.requestPermission()) === 'granted') { remember('foldoy-notify', '1'); toast('Notifications on'); }
      return showSettings();
    }
    if (t.dataset.set.startsWith('undo-') || t.dataset.set === 'threads' || t.dataset.set === 'images') {
      const p = t.dataset.set === 'threads' ? { threads: S.me.threads === false } : t.dataset.set === 'images' ? { images: S.me.images === false } : { undo_seconds: +t.dataset.set.slice(5) };
      try { S.me = await api.preferences(p); S.key = ''; } catch (x) { toast(x.message); }
      return redrawSettings();
    }
    if (t.dataset.set.startsWith('accent-') || t.dataset.set.startsWith('theme-')) {
      const [k, v] = t.dataset.set.split('-'), paint = k === 'accent' ? paintAccent : paintTheme;
      const A = S.app ||= { was: {}, next: {}, t: 0 };
      if (!(k in A.was)) A.was[k] = S.me[k];
      A.next[k] = v;
      paint(v); S.me = { ...S.me, [k]: v }; if (S.sd) S.sd = { ...S.sd, me: { ...S.sd.me, [k]: v } };
      drawSettings('appearance');
      clearTimeout(A.t);
      A.t = setTimeout(async () => {
        const { was, next } = A; S.app = null;
        try { const me = await api.setAppearance(next); if (!S.app) { S.me = { ...me, ...(S.app?.next || {}) }; if (S.sd) S.sd = { ...S.sd, me: S.me }; } }
        catch (x) {
          if (S.app) return;
          for (const key of Object.keys(next)) { (key === 'accent' ? paintAccent : paintTheme)(was[key]); S.me = { ...S.me, [key]: was[key] }; }
          if (S.sd) S.sd = { ...S.sd, me: S.me };
          toast(x.message); if (/^#\/settings\/appearance/.test(location.hash)) drawSettings('appearance');
        }
      }, 500);
      return;
    }
    if (t.dataset.set === 'billing-portal') {
      try { const r = await api.billingPortal(); location.href = r.url; } catch (x) { toast(x.message); }
      return;
    }
    if (t.dataset.set === 'plan-cancel-ok' || t.dataset.set === 'plan-resume') {
      try { S.me = t.dataset.set === 'plan-resume' ? await api.resumePlan() : await api.cancelPlan(); setMode = null; toast(t.dataset.set === 'plan-resume' ? 'Your plan goes on renewing' : 'Cancelled. Nothing more is charged'); } catch (x) { toast(x.message); }
      return redrawSettings();
    }
    if (t.dataset.set === 'apply-send') { try { S.me = await api.applyToSend(); toast('Application sent'); } catch (x) { toast(x.message); } return showSettings(); }
    if (t.dataset.set === 'unlock') { try { S.me = await api.unlockSending(); toast('Sending unlocked'); } catch (x) { toast(x.message); } return showSettings(); }
    if (t.dataset.set === 'invite') { try { S.invites = (await api.makeInvite()).invites; S.me = await api.session(); toast('Invite link made'); } catch (x) { toast(x.message); } return showSettings(); }
    if (t.dataset.set === 'keyfile-done') { keyPass = null; return showSettings(); }
    if (t.dataset.set === 'rc-save') return pgp.download(new Blob([`foldoy recovery code\n${S.me.address}\nMade ${new Date().toISOString().slice(0, 10)}\n\n${freshRC}\n\nWith it you can reset your password and keep all your mail.\nKeep it somewhere safe, away from this device.\n`], { type: 'text/plain' }), 'foldoy-recovery-code.txt');
    if (t.dataset.set === 'rc-done') { freshRC = null; return showSettings(); }
    if (t.dataset.set === 'pp-backup') { if (ppBackup) { pgp.download(await account.ppBackup(S.me, ppBackup), 'foldoy-privacy-plus-backup.asc'); return; } setMode = 'pp-bk'; return showSettings(); }
    if (t.dataset.set === 'pp-done') { ppBackup = null; return showSettings(); }
    setMode = t.dataset.set || null; return showSettings();
  }
  const a = t.dataset.act;
  if (a === 'opensearch') { list.classList.add('sopen'); $('#q')?.focus(); return; }
  if (a === 'compose') return startCompose('new');
  if (a === 'reply' || a === 'replyall' || a === 'forward') return startCompose(a, S.open);
  if (a === 'editdraft') return startCompose('draft', S.open);
  if (a === 'archive' || a === 'trash' || a === 'flag' || a === 'unread') return act(a);
  if (a === 'refresh') return refreshList();
  if (a === 'panemode') {
    const right = document.documentElement.dataset.pane !== 'right';
    document.documentElement.dataset.pane = right ? 'right' : 'full'; remember('foldoy-pane', right ? 'right' : 'full'); tipOff();
    renderList(); if (!S.sel && app.dataset.view === 'mail') emptyPane();
    return;
  }
  if (a === 'rail-fold') {
    if (railQ.matches && !phone()) { railOver(!document.documentElement.hasAttribute('data-rail-over')); tipOff(); return; }
    remember('foldoy-rail', app.classList.contains('rmin') ? 'full' : 'min'); foldRail(); tipOff(); return;
  }
  if (a === 'snooze') return snoozeMenu();
  if (a === 'move') return moveMenu(false);
  if (a === 'unschedule') return unschedule();
  if (a === 'later') return laterMenu();
  if (a === 'copypw') { const f = $('#lkpw'); if (f) { copy(f.value); toast('Password copied'); } return; }
  if (a === 'lockon' || a === 'lockoff') { const c = S.compose; if (!c) return; read(); c.lock = a === 'lockon' ? { days: 7, hint: '', pw: pgp.newLockPassword() } : null; return showCompose(); }
  if (a === 'newalias') return composeAlias();
  if (a === 'unsnooze') { const m = S.open; try { await api.unsnooze(m.id); } catch (x) { return toast(x.message); } toast('Back where it was, unread'); S.key = ''; await railQuiet(); location.hash = S.back; return; }
  if (a === 'block') return blockAsk();
  if (a === 'blockok') return blockNow();
  if (a === 'blockno') { $('#actnote').innerHTML = ''; return; }
  if (a === 'unsub') return unsubscribe();
  if (a === 'notjunk') { const ib = S.folders.find(f => f.role === 'inbox'); if (ib) moveTo(ib.id); return; }
  if (a === 'next' || a === 'prev') return step(a === 'next' ? 1 : -1, true);
  if (a === 'back') { if (S.back.startsWith('#/compose')) location.hash = '#/f/inbox'; else backToRow(); return; }
  if (a === 'sback') { location.hash = '#/settings'; return; }
  if (a === 'aback') { location.hash = '#/aliases'; if (phone()) app.dataset.depth = 'list'; return; }
  if (a === 'cclose') return closeCompose(false);
  if (a === 'discard') return closeCompose(true);
  if (a === 'quote') { const ed = $('#ced'); if (ed) { const q = S.compose.quote.replace(/^\n+/, '').split('\n'), head = q.shift(); ed.insertAdjacentHTML('beforeend', `<div><br></div><div>${esc(head)}</div><blockquote>${q.map(l => esc(l.replace(/^> ?/, ''))).join('<br>')}</blockquote>`); ed.dispatchEvent(new Event('input')); }
    const ta = $('#ctext'); ta.value = ta.value.replace(/\s+$/, '') + S.compose.quote; S.compose.quote = ''; S.compose.dirty = true; t.remove(); ta.focus(); return; }
  if (a === 'cc') { $('#rcc').hidden = false; $('#rbcc').hidden = false; t.hidden = true; $('#cform')?.classList.add('ccopen'); $('#ccc').focus(); return; }
  if (a === 'clear') { location.hash = '#/f/inbox'; return; }
  if (a === 'more' && S.q && S.next?.at != null) { const r = await idx.query(S.q, S.next.at); if (!r) return; S.items.push(...r.rows); S.next = r.found > S.items.length ? { at: S.items.length, total: r.found } : null; return renderList(); }
  if (a === 'more') { let r, got; try { r = await api.messages(S.q ? { q: S.q, cursor: S.next } : { folder: S.folder, cursor: S.next }); got = await mail.open(r.items); } catch (x) { return toast(x.message); }
    if (S.q) S.items.push(...got); else { S.raw = [...(S.raw || S.items), ...got]; S.items = groupThreads(S.raw); } S.next = r.next; return renderList(); }
  if (a === 'rail') return openRail();
  if (a === 'memenu') return;
  if (a === 'rail-close') return closeRail();
  if (a === 'lock') { pgp.lockTab(); mail.forgetText(); toast('Your key is unloaded'); S.key = ''; return routeSafe(); }
  if (a === 'unlock') { if (location.hash.startsWith('#/settings')) location.hash = '#/f/inbox'; S.sel = null; setView('mail', 'pane'); return loadKeyPane(); }
  if (a === 'images') return showImages();
  if (a === 'showkey') { S.keyShow?.(); return; }
  if (a === 'ppon') { setMode = 'pp-on'; S.lastSec = 'privacy'; return; }
  if (a === 'rcnew') { setMode = 'rc'; S.lastSec = 'security'; return; }
  if (a === 'rcunlock') { setMode = 'rc-unlock'; S.lastSec = 'security'; return; }
  if (a === 'rc-later') {
    try { sessionStorage.setItem('foldoy-rc-later', S.me.address); } catch {}
    const n = $('#rcnote'); if (!n) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { n.parentNode.removeChild(n); return; }
    n.style.height = `${n.offsetHeight}px`; n.style.overflow = 'hidden'; n.style.transition = 'height .16s ease, opacity .12s ease';
    requestAnimationFrame(() => { n.style.height = '0px'; n.style.opacity = '0'; });
    setTimeout(() => n.parentNode?.removeChild(n), 200); return;
  }
  if (a === 'trustkey') {
    const box = $('#keynote .note.warn'); if (!box || $('#trustpw')) return;
    box.insertAdjacentHTML('beforeend', `<form class="trustf" id="trustf"><input id="trustpw" type="password" autocomplete="current-password" placeholder="Your login password" aria-label="Your login password"><button class="pill light sm" type="submit">Remember it</button></form>`);
    $('#trustpw').focus();
    $('#trustf').addEventListener('submit', async ev => {
      ev.preventDefault();
      try { await mail.acceptKey(S.open.from.addr, S.keyNow.fingerprint, await account.auth($('#trustpw').value, S.me)); $('#keynote').innerHTML = ''; toast('Key remembered'); }
      catch (x) { toast(x.message); }
    });
    return;
  }
  if (a === 'showpp') { const i = $('#ppin'); i.type = i.type === 'password' ? 'text' : 'password'; t.textContent = i.type === 'password' ? 'Show' : 'Hide'; return; }
  if (a === 'raw') { const id = S.open?.id; if (!id) return; try { pgp.download(await api.raw(id), `${(S.open.subject || 'message').replace(/[^\w .-]+/g, '').trim().slice(0, 60) || 'message'}.eml`); } catch (x) { toast(x.message); } return; }
  if (a === 'dl') return previewFile(S.open, +t.dataset.i);
  if (a === 'dlall') { (S.open?.attachments || []).forEach((x, i) => { if (!shownInline(S.open, x)) setTimeout(() => downloadFile(S.open, i), i * 250); }); return; }
  if (a === 'details') { const d = $('#whodet', pane); if (d) { d.hidden = !d.hidden; t.setAttribute('aria-expanded', String(!d.hidden)); } return; }
  if (a === 'qtog') {
    const on = t.getAttribute('aria-expanded') !== 'true', label = on ? 'Hide quoted text' : 'Show quoted text';
    if (t.classList.contains('hq')) {
      const fr = t.previousElementSibling?.querySelector('iframe'); let d; try { d = fr?.contentDocument; } catch {  }
      if (!d) return;
      for (const x of d.querySelectorAll('[data-fq]')) { if (on) x.style.removeProperty('display'); else x.style.setProperty('display', 'none', 'important'); }
      fr._place?.();
    } else { const q = t.nextElementSibling; if (!q) return; q.hidden = !on; }
    t.setAttribute('aria-expanded', String(on)); t.setAttribute('aria-label', label); t.title = label; return;
  }
  if (a === 'print') { closeMore(); window.print(); return; }
  if (a === 'original') { closeMore(); const w = window.open('', '_blank'); try { const r = await fetch(`/mail/api/messages/${encodeURIComponent(S.open.id)}/raw`, { credentials: 'same-origin' }); const t = r.ok ? await r.text() : `From: ${S.open.from.addr}\nTo: ${S.open.to.map(p => p.addr).join(', ')}\nDate: ${S.open.date}\nSubject: ${S.open.subject}\n\n${S.open.text || ''}`; if (w) { w.document.title = S.open.subject || 'Original'; const pre = w.document.createElement('pre'); pre.textContent = t; pre.style.cssText = 'white-space:pre-wrap;font:13px/1.5 ui-monospace,monospace;padding:16px'; w.document.body.append(pre); } } catch { if (w) w.close(); toast("The original couldn't be loaded."); } return; }
  if (a === 'junk') { const j = S.folders.find(f => f.role === 'junk'); if (j) moveTo(j.id); return; }
  if (a === 'logout') {
    S.leaving = true; idx.stop();
    if (!S.out) { try { for (const r of await pgp.keptList()) if (r.address === S.me.address) await pgp.keptDrop(r.address, r.id); } catch (_) {  } }
    await account.logout(S.me.address); location.href = '/login/';
  }
});

function meMenu(open) {
  const b = $('.me-a'), m = $('#memenu'); if (!b || !m) return;
  b.setAttribute('aria-expanded', String(open)); m.hidden = !open;
  if (open) $('[role="menuitem"]', m).focus();
}
document.addEventListener('click', e => {
  if (e.target.closest('.me-b')) { e.preventDefault(); acctSheet(true); return; }
  const b = e.target.closest('.me-a');
  if (b) { meMenu(b.getAttribute('aria-expanded') !== 'true'); return; }
  if (!e.target.closest('#memenu')) meMenu(false); else setTimeout(() => meMenu(false), 0);
}, true);
document.addEventListener('keydown', e => {
  const m = $('#memenu'); if (!m || m.hidden) return;
  const items = $$('[role="menuitem"]', m), n = items.indexOf(document.activeElement);
  if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); meMenu(false); $('.me-a').focus(); }
  else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopImmediatePropagation(); items[(n + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus(); }
  else if (e.key === 'Tab') meMenu(false);
  else if (!['Enter', ' ', 'Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) meMenu(false);
}, true);

{
  let eat = 0;
  document.addEventListener('pointerdown', e => {
    if (!phone()) return;
    const sheet = $('#laterbox .snz, #actnote .snz'); if (!sheet || sheet.contains(e.target)) return;
    e.preventDefault(); eat = Date.now(); closeFloat();
  }, true);
  document.addEventListener('click', e => { if (eat && Date.now() - eat < 500) { e.preventDefault(); e.stopPropagation(); } eat = 0; }, true);
}
{
  let guarded = false, guardHash = '', unguarding = false;
  const q = () => $('#q');
  const layerOpen = () => phone() && !!($('#laterbox .snz, #actnote .snz') || $('details.tmore[open]') || $('#acsheet') || app.classList.contains('rail-open')
    || S.picked.size || document.activeElement === q());
  const closeTop = () => {
    if ($('#laterbox .snz, #actnote .snz')) return closeFloat();
    const d = $('details.tmore[open]'); if (d) { d.open = false; return; }
    if ($('#acsheet')) return acctSheet(false);
    if (app.classList.contains('rail-open')) return closeRail();
    if (S.picked.size) { S.picked.clear(); return renderList(); }
    const i = q(); if (i && document.activeElement === i) { i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); i.blur(); }
  };
  const check = () => setTimeout(() => {
    if (!phone() || S.leaving || document.querySelector('.viewer')) return;
    const open = layerOpen();
    if (open && !guarded) { history.pushState({ layer: 1 }, ''); guarded = true; guardHash = location.hash; }
    else if (!open && guarded) {
      guarded = false;
      if (location.hash === guardHash && history.state?.layer) { unguarding = true; history.back(); }
    }
  }, 0);
  for (const ev of ['click', 'touchend', 'input', 'keyup', 'focusin', 'focusout']) document.addEventListener(ev, check, true);
  addEventListener('popstate', e => {
    if (S.leaving) return;
    if (unguarding) { unguarding = false; return; }
    if (guarded && layerOpen()) { guarded = false; closeTop(); return; }
    guarded = false;
    if (e.state?.layer && !layerOpen()) history.back();
  });
}
{
  const rail = document.querySelector('.rail'), scrim = () => $('.scrim');
  let t = null;
  rail?.addEventListener('touchstart', e => { t = phone() && app.classList.contains('rail-open') && e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY, dx: 0, on: false } : null; }, { passive: true });
  rail?.addEventListener('touchmove', e => {
    if (!t) return; const dx = e.touches[0].clientX - t.x, dy = e.touches[0].clientY - t.y;
    if (!t.on) { if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { t = null; return; } if (dx > -10) return; t.on = true; }
    t.dx = Math.min(0, dx);
    rail.style.transition = 'none'; rail.style.transform = `translateX(${t.dx}px)`;
    const sc = scrim(); if (sc) { sc.style.transition = 'none'; sc.style.opacity = String(Math.max(0, 1 + t.dx / rail.offsetWidth)); }
  }, { passive: true });
  const end = () => {
    if (!t || !t.on) { t = null; return; }
    const far = -t.dx > rail.offsetWidth / 3, sc = scrim(); t = null;
    rail.style.transition = 'transform .26s var(--ease)'; if (sc) sc.style.transition = 'opacity .26s ease';
    if (far) { rail.style.transform = 'translateX(-100%)'; if (sc) sc.style.opacity = '0'; setTimeout(() => { closeRail(); rail.style.transition = rail.style.transform = ''; if (sc) sc.style.transition = sc.style.opacity = ''; }, 270); }
    else { rail.style.transform = ''; if (sc) sc.style.opacity = ''; setTimeout(() => { rail.style.transition = ''; if (sc) sc.style.transition = ''; }, 270); }
  };
  rail?.addEventListener('touchend', end, { passive: true }); rail?.addEventListener('touchcancel', end, { passive: true });
}
function backToRow() {
  const was = S.sel; S.cursor = was;
  if (phone() && S.histPrev === S.back && history.length > 1) history.back(); else location.hash = S.back;
  setTimeout(() => { const r = list.querySelector(`.row[data-id="${was}"]`); if (r) { if (!phone()) r.focus({ preventScroll: true }); r.scrollIntoView({ block: 'nearest' }); } }, 120);
}
addEventListener('hashchange', e => { try { S.histPrev = new URL(e.oldURL).hash; } catch (_) { S.histPrev = null; } });
function step(d, open) {
  const rows = $$('.row:not(.skr)', list); if (!rows.length) return;
  const cur = rows.findIndex(r => r === document.activeElement) >= 0 ? rows.findIndex(r => r === document.activeElement) : rows.findIndex(r => r.dataset.id === (S.sel || S.cursor));
  const n = Math.max(0, Math.min(rows.length - 1, cur < 0 ? 0 : cur + d));
  rows[n].focus({ preventScroll: false }); rows[n].scrollIntoView({ block: 'nearest' });
  S.cursor = rows[n].dataset.id;
  if (((open && S.sel) || splitPane()) && !phone()) location.hash = rows[n].getAttribute('href');
}
const cursorRow = () => ((!S.sel || splitPane()) && document.activeElement?.closest?.('.row[data-id]')) || null;
const onCursor = kind => { const r = cursorRow(); if (!r) return false; const id = r.dataset.id;
  if (kind === 'star') { list.querySelector(`[data-star="${id}"]`)?.click(); takeUndo(); return true; }
  if (kind === 'pick') { if (S.picked.has(id)) S.picked.delete(id); else S.picked.add(id); S.lastPick = id; renderList(); list.querySelector(`.row[data-id="${id}"]`)?.focus(); return true; }
  const m = S.items.find(x => x.id === id), next = r.nextElementSibling?.dataset?.id || r.previousElementSibling?.dataset?.id;
  S.picked = new Set([id]); bulk(kind === 'toggle' ? (m?.unread ? 'read' : 'unread') : kind);
  setTimeout(() => { const nr = list.querySelector(`.row[data-id="${kind === 'toggle' ? id : next}"]`) || list.querySelector('.row'); nr?.focus(); if (nr) S.cursor = nr.dataset.id; }, 60);
  return true; };
function openThen(id, mode) {
  if (S.open?.id === id && !S.open.pending) return startCompose(mode, S.open);
  const row = list.querySelector(`.row[data-id="${CSS.escape(id)}"]`);
  location.hash = row?.getAttribute('href') || `#/f/${S.folder}/${id}`;
  const go = (n = 0) => { if (S.open?.id === id && !S.open.pending) startCompose(mode, S.open); else if (n < 200 && location.hash.endsWith(`/${id}`)) setTimeout(() => go(n + 1), 50); };
  go();
}
const MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const KEYS = [['j k', 'Next, previous'], ['Enter', 'Open'], ['x', 'Select'], ['z', 'Undo'], ['c', 'Write'], ['r', 'Reply'], ['a', 'Reply all'], ['f', 'Forward'], ['e', 'Archive'], ['v', 'Move to'], ['b', 'Snooze'], ['#', 'Delete'],
  ['s', 'Star'], ['u', 'Mark unread'], ['/', 'Search'], ['g i', 'Inbox'], ['g a', 'Aliases'], ['g s', 'Settings'], [MAC ? '⌘ Enter' : 'Ctrl Enter', 'Send'], ['Esc', 'Back, close']];
let keysFrom = null;
function keysHelp(show) {
  const k = $('#keys');
  if (!show) { k.hidden = true; keysFrom?.focus?.({ preventScroll: true }); keysFrom = null; return; }
  keysFrom = document.activeElement;
  k.innerHTML = `<div class="k-in"><h2 id="keysh">Keys <button class="iconbtn" type="button" aria-label="Close" id="kx">${icon('close')}</button></h2>
    <ul>${KEYS.map(([a, b]) => `<li><span>${b}</span><span>${a.split(/\s+/).filter(Boolean).map(x => `<kbd>${esc(x)}</kbd>`).join(' ')}</span></li>`).join('')}</ul></div>`;
  k.hidden = false; $('#kx').focus(); $('#kx').onclick = () => keysHelp(false);
  k.onclick = e => { if (e.target === k) keysHelp(false); };
  k.onkeydown = e => { if (e.key === 'Tab') { e.preventDefault(); $('#kx').focus(); } };
}
let g = 0;
document.addEventListener('keydown', e => {
  if (!S.me) return;
  if ($('#keys') && !$('#keys').hidden && e.key !== 'Escape' && e.key !== 'Tab') { if (e.key === '?') keysHelp(false); e.preventDefault(); return; }
  const typing = e.target.closest('input, textarea, select, [contenteditable]');
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && $('#cform')) { e.preventDefault(); send(); return; }
  if (e.key === 'Escape') {
    setTimeout(() => { if (document.activeElement === document.body && app.dataset.view === 'mail') list.querySelector(`.row[data-id="${CSS.escape(String(S.sel || S.cursor || ''))}"]`)?.focus({ preventScroll: true }); }, 0);
    if (!$('#keys').hidden) return keysHelp(false);
    if (app.classList.contains('rail-open')) return closeRail();
    if ($('.menu.open')) return;
    const pop = $('#actnote .snz, .list .movemenu, .snz.floating, #laterbox .snz, details.tmore[open]');
    if (pop) { e.preventDefault(); closeFloat(); const d = $('details.tmore[open]'); if (d) { d.open = false; d.querySelector('summary')?.focus({ preventScroll: true }); } return; }
    if (S.picked.size && !typing) { e.preventDefault(); const at = document.activeElement?.closest?.('.row')?.dataset.id || S.cursor; S.picked.clear(); renderList(); if (at) list.querySelector(`.row[data-id="${at}"]`)?.focus({ preventScroll: true }); return; }
    if ($('#cform')) { e.preventDefault(); return closeCompose(false); }
    if (typing) return;
    if (app.dataset.view === 'mail' && S.sel) { backToRow(); return; }
    if (app.dataset.view === 'mail' && S.q) { location.hash = '#/f/inbox'; return; }
    return;
  }
  if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
  const menu = document.activeElement?.closest?.('[role="menu"]');
  if (menu) {
    const items = [...menu.querySelectorAll('[role="menuitem"], [data-moveto], [data-snz], [data-later]')].filter(x => x.offsetParent);
    const i = items.indexOf(document.activeElement);
    const go = n => { e.preventDefault(); items[(n + items.length) % items.length]?.focus({ preventScroll: true }); };
    if (e.key === 'ArrowDown') return go(i + 1);
    if (e.key === 'ArrowUp') return go(i < 0 ? items.length - 1 : i - 1);
    if (e.key === 'Home') return go(0);
    if (e.key === 'End') return go(items.length - 1);
    if (e.key === 'Enter' || e.key === ' ') return;
    if (/^[a-z#]$/i.test(e.key)) return;
  }
  if (g && Date.now() - g < 1200) {
    g = 0; const to = { i: '#/f/inbox', a: '#/aliases', s: '#/settings', d: '#/f/drafts', t: '#/f/sent' }[e.key];
    if (to) { e.preventDefault(); location.hash = to; } return;
  }
  const inMail = app.dataset.view === 'mail' && !$('#cform');
  switch (e.key) {
    case 'g': g = Date.now(); break;
    case '?': e.preventDefault(); keysHelp(true); break;
    case '/': if (inMail || app.dataset.view === 'mail') { e.preventDefault(); if (!$('#q')) location.hash = '#/f/inbox'; setTimeout(() => $('#q')?.focus(), 0); } break;
    case 'c': if (S.me.mailbox === 'active') { e.preventDefault(); startCompose('new'); } break;
    case 'j': case 'ArrowDown': if (inMail || app.dataset.view === 'aliases' || (app.dataset.view === 'settings' && list.contains(document.activeElement))) { e.preventDefault(); step(1, e.key === 'j'); } break;
    case 'k': case 'ArrowUp': if (inMail || app.dataset.view === 'aliases' || (app.dataset.view === 'settings' && list.contains(document.activeElement))) { e.preventDefault(); step(-1, e.key === 'k'); } break;
    case 'Home': case 'End': if (list.contains(document.activeElement) && document.activeElement.closest('.row')) { e.preventDefault(); const rs = $$('.row:not(.skr)', list); rs[e.key === 'Home' ? 0 : rs.length - 1]?.focus(); } break;
    case 'o': if (document.activeElement.classList.contains('row')) { e.preventDefault(); document.activeElement.click(); } break;
    case 'r': if (inMail && S.open && S.sel && !cursorRow()) { e.preventDefault(); startCompose('reply', S.open); } else if (inMail && cursorRow()) { e.preventDefault(); openThen(cursorRow().dataset.id, 'reply'); } break;
    case 'a': if (inMail && S.open && S.sel && !cursorRow()) { e.preventDefault(); startCompose('replyall', S.open); } else if (inMail && cursorRow()) { e.preventDefault(); openThen(cursorRow().dataset.id, 'replyall'); } break;
    case 'f': if (inMail && S.open && S.sel && !cursorRow()) { e.preventDefault(); startCompose('forward', S.open); } else if (inMail && cursorRow()) { e.preventDefault(); openThen(cursorRow().dataset.id, 'forward'); } break;
    case 'e': if (inMail && S.picked.size) { e.preventDefault(); if (S.folders.some(f => f.role === 'archive')) bulk('archive'); } else if (inMail && S.sel) { e.preventDefault(); act('archive'); } else if (inMail && S.folders.some(f => f.role === 'archive') && onCursor('archive')) e.preventDefault(); break;
    case 'x': if (inMail && onCursor('pick')) e.preventDefault(); break;
    case 'z': { const u = takeUndo(); if (u) { e.preventDefault(); u(); } break; }
    case 'v': if (inMail && S.picked.size) { e.preventDefault(); moveMenu(true); } else if (inMail && S.sel && $('[data-act="move"]', pane)) { e.preventDefault(); moveMenu(false); } else if (inMail && cursorRow()) { e.preventDefault(); const r = cursorRow(); closeFloat(); S.rowAct = r.dataset.id; moveMenu(true, r); } break;
    case 'b': if (inMail && S.sel && $('[data-act="snooze"]', pane)) { e.preventDefault(); snoozeMenu(); } else if (inMail && cursorRow() && S.folder === 'inbox') { e.preventDefault(); const r = cursorRow(); closeFloat(); S.rowAct = r.dataset.id; snoozeMenu(r); } break;
    case '#': case 'Delete': if (inMail && S.picked.size) { e.preventDefault(); bulk(S.folder === 'trash' ? 'delete' : 'trash'); } else if (inMail && S.sel && !cursorRow()) { e.preventDefault(); act('trash'); } else if (inMail && onCursor(S.folder === 'trash' ? 'delete' : 'trash')) e.preventDefault(); break;
    case 's': if (inMail && S.sel) { e.preventDefault(); act('flag'); } else if (inMail && onCursor('star')) e.preventDefault(); break;
    case 'u': if (inMail && S.picked.size) { e.preventDefault(); bulk('unread'); } else if (inMail && S.sel) { e.preventDefault(); act('unread'); } else if (inMail && onCursor('toggle')) e.preventDefault(); break;
  }
});

let mvTimer = 0, mvAll = false;
const MV_SHOWN = 12;
const longDay = iso => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
function loadMoving(redraw) {
  if (S.mvAsk) return;
  S.mvAsk = api.moving().then(d => { S.mv = d; S.mvAt = Date.now(); redraw?.(); pollMoving(); }).catch(() => {}).finally(() => { S.mvAsk = null; });
}
const mvRedraw = () => { if (S.lastSec === 'switch' && /^#\/settings\/switch\b/.test(location.hash)) drawSettings('switch'); };
function pollMoving() {
  clearTimeout(mvTimer);
  if (S.mv?.scan?.status !== 'running') return;
  mvTimer = setTimeout(() => { mvTimer = 0; if (/^#\/settings\/switch\b/.test(location.hash)) loadMoving(mvRedraw); }, 2500);
}
function movingStep(myAddr) {
  if (!S.mv || Date.now() - (S.mvAt || 0) > 30000) loadMoving(mvRedraw);
  const d = S.mv, num = v => Number(v || 0).toLocaleString('en-GB');
  if (!d) return S.mvAsk ? '<p class="t">Looking through your mail.</p>' : null;
  const running = d.scan?.status === 'running';
  if (running && !mvTimer) pollMoving();
  if (!d.services.length) return running ? `<p class="t">Looking through your mail: ${num(d.scan.scanned)} messages so far.</p>` : null;
  const shown = mvAll ? d.services : d.services.slice(0, MV_SHOWN);
  const sub = x => (x.state === 'ignored' ? 'Ignored'
    : x.by_hand ? 'Marked moved'
    : x.state === 'moved' ? `Moved. Wrote to your foldoy address on ${longDay(x.last_new)}.`
    : `${num(x.messages)} ${x.messages === 1 ? 'message' : 'messages'} to your old address, the last on ${longDay(x.last_old)}`);
  const acts = x => (x.state === 'old' ? `<button class="pill line sm" type="button" data-mv="${esc(x.id)}" data-mark="done" aria-label="Mark ${esc(x.name)} moved">Moved</button>
      <button class="pill line sm" type="button" data-mv="${esc(x.id)}" data-mark="ignored" aria-label="Ignore ${esc(x.name)}">Ignore</button>`
    : x.by_hand || x.state === 'ignored' ? `<button class="pill line sm" type="button" data-mv="${esc(x.id)}" data-mark="" aria-label="Undo for ${esc(x.name)}">Undo</button>` : '');
  return `<p class="t">These services still write to your old address. Change the email address on each to ${esc(myAddr)}.</p>
    <p class="mvc"><b>${num(d.left)}</b> left <b>${num(d.done)}</b> moved${d.ignored ? ` <b>${num(d.ignored)}</b> ignored` : ''}${running ? '<span class="dim">Looking through your mail again</span>' : ''}</p>
    <ul class="mvl">${shown.map(x => `<li class="${x.state}"><span class="mvn"><b>${esc(x.name)}</b><small>${esc(x.domain)}</small><small>${esc(sub(x))}</small></span><span class="mva">${acts(x)}</span></li>`).join('')}</ul>
    ${d.services.length > MV_SHOWN ? `<button class="linkbtn mvmore" type="button" data-mv-all>${mvAll ? 'Show fewer' : `Show all ${num(d.services.length)}`}</button>` : ''}
    ${running ? '' : '<div class="acts"><button class="pill line sm" type="button" data-mv-again>Look again</button></div>'}`;
}
function movingLine() {
  if (S.mv === undefined) { S.mv = null; loadMoving(() => { if (S.folder === 'inbox' && !S.sel && !S.q && app.dataset.view === 'mail') emptyPane(); }); }
  const n = S.mv?.left || 0;
  return n ? `<p class="mvline"><a href="#/settings/switch">${n} ${n === 1 ? 'service still writes' : 'services still write'} to your old address</a></p>` : '';
}

function loadScreener(redraw) {
  if (S.scrAsk) return S.scrAsk;
  S.scrAsk = api.screener().then(async d => {
    await mail.open(d.waiting.map(w => w.newest));
    S.scr = d; redraw?.();
  }).catch(x => toast(x.message)).finally(() => { S.scrAsk = null; });
  return S.scrAsk;
}
const scrDraw = () => { if (/^#\/settings\/screener\b/.test(location.hash) && S.lastSec === 'screener') drawSettings('screener'); if (/^#\/f\/screener\b/.test(location.hash)) drawScreenerList(); };
function screenerSettings({ group, row }) {
  if (S.scr === undefined) { S.scr = null; loadScreener(scrDraw); }
  const d = S.scr, num = v => Number(v || 0).toLocaleString('en-GB');
  if (d && d.on && !d.ready) setTimeout(() => { if (/^#\/settings\/screener\b/.test(location.hash)) loadScreener(scrDraw); }, 2000);
  const waiting = d?.waiting?.length || 0;
  return `
    ${group('h-scr', 'Screener', `<ul class="kv"><li class="wide"><span class="k" id="scrlab">Screen new senders<small id="scrd">Mail from someone you have never had mail from or written to waits in Screener, beside your Inbox, until you say yes or no. Sign-in codes and password resets from a service you haven't used before wait there too.</small></span>
        <span class="val"><button class="sw" type="button" role="switch" aria-checked="${!!d?.on}" aria-labelledby="scrlab" aria-describedby="scrd" data-scr="toggle" ${d ? '' : 'disabled'}></button></span></li>
      ${d?.on && !d.ready ? row('Getting ready', `<b>${num(d.looked)} messages looked at</b>`, '', 'Everyone you already have mail from or wrote to is let in. Nothing waits until this is done.') : ''}
      ${d?.ready ? row('Waiting', `<b>${waiting ? `${num(waiting)} ${waiting === 1 ? 'sender' : 'senders'}` : 'No one'}</b>`, '<a class="pill line sm" href="#/f/screener">Open Screener</a>') : ''}
      ${d?.ready ? row('Let in', `<b>${num(d.known)} ${d.known === 1 ? 'address' : 'addresses'}</b>`) : ''}
      </ul>`, { sr: true, lede: d?.on ? 'Senders you say no to are blocked: their mail goes to Junk. Turning the screener off moves waiting mail to your Inbox.' : 'Mail between foldoy addresses never waits.' })}
    ${d?.ready && d.domains.length ? group('h-scrdom', 'Domains let in', `<ul class="kv">${d.domains.map(x => row(`<b class="strong long">${esc(x.domain)}</b>`, '', `<button class="pill line sm" type="button" data-scr-dom="${esc(x.id)}">Remove</button>`)).join('')}</ul>`,
      { lede: 'Every address at these domains is let in.' }) : ''}
`;
}
async function showScreener(id) {
  if (S.key !== 'screener' || !list.querySelector('.scrl')) {
    S.key = 'screener'; S.folder = 'screener'; S.q = ''; S.picked.clear(); S.items = (S.scr?.waiting || []).map(w => w.newest);
    drawScreenerList();
    loadScreener(() => { S.items = S.scr.waiting.map(w => w.newest); drawScreenerList(); });
  }
  S.back = '#/f/screener';
  setView('mail', id ? 'pane' : 'list');
  if (id) openMessage(id); else { S.sel = null; markCurrent(null); emptyPane(); }
}
function drawScreenerList() {
  if (S.folder !== 'screener') return;
  const d = S.scr, w = d?.waiting || [];
  const state = !d ? '' : !d.on ? `<div class="emptyf"><p>The screener is off.</p><a class="pill line md" href="#/settings/screener">Turn it on in Settings</a></div>`
    : !d.ready ? `<div class="emptyf"><p>Getting ready: ${Number(d.looked).toLocaleString('en-GB')} messages looked at.</p></div>`
    : !w.length ? '<div class="emptyf"><p>No one is waiting.</p></div>' : '';
  list.innerHTML = `
    <div class="lh">
      <button class="menu-btn" type="button" data-act="rail" aria-label="Folders and settings">${icon('menu')}</button>
      <h1 tabindex="-1">Screener</h1>
      <span class="cnt">${w.length ? `${w.length} waiting` : ''}</span>
    </div>
    ${w.length ? '<p class="scrh">New senders. Yes lets their mail into your Inbox. No blocks them.</p>' : ''}
    <div class="rows scrl" data-k="screener" role="list">${state}${w.map(x => {
      const m = x.newest;
      return `<div class="scrw" role="listitem" data-addr="${esc(x.address)}">
        <a class="row ${m.unread ? 'unread' : ''}" href="#/f/screener/${esc(m.id)}" data-id="${esc(m.id)}">
          ${avatar(m.from)}
          <span class="r1"><span class="from">${esc(x.name || x.address)}</span>${x.count > 1 ? `<span class="tc">${x.count}</span>` : ''}<time datetime="${m.date}">${when(m.date)}</time></span>
          <span class="r2"><span class="subj">${esc(m.locked ? 'Encrypted message' : m.subject || '(no subject)')}</span>${x.name ? `<span class="pv">${esc(x.address)}</span>` : ''}</span>
        </a>
        <div class="scra"><button class="pill line sm" type="button" data-scr-ans="yes" data-addr="${esc(x.address)}" aria-label="Yes, let ${esc(x.address)} in">Yes</button><button class="pill line sm" type="button" data-scr-ans="no" data-addr="${esc(x.address)}" aria-label="No, block ${esc(x.address)}">No</button></div>
      </div>`;
    }).join('')}</div>`;
  markCurrent(S.sel);
}
function screenerNote(m) {
  if (m.folder !== 'screener' || !$('#actnote')) return;
  const a = (m.from.addr || '').toLowerCase(), dom = (S.scr?.waiting || []).find(w => w.address === a)?.domain || a.split('@')[1] || '';
  $('#actnote').insertAdjacentHTML('afterend', `<div class="note scrnote"><span class="t">First mail from <b>${esc(a)}</b>. Let them in?</span>
    <button type="button" data-scr-ans="yes" data-addr="${esc(a)}">Yes</button><button type="button" data-scr-ans="yes" data-domain="1" data-addr="${esc(a)}">Yes to all of ${esc(dom)}</button><button type="button" data-scr-ans="no" data-addr="${esc(a)}">No</button></div>`);
}
async function screenerAnswer(addr, ans, domain) {
  let d;
  try { d = await api.screenerAnswer(addr, ans, domain); } catch (x) { return toast(x.message); }
  const opened = S.open?.folder === 'screener' && (S.open.from.addr || '').toLowerCase() === addr;
  for (const x of S.scr?.waiting || []) if (!d.waiting.some(y => y.address === x.address)) x.gone = true;
  S.scr = { ...d, waiting: (S.scr?.waiting || []).filter(x => !x.gone) };
  S.items = S.scr.waiting.map(w => w.newest); S.blockedList = null;
  toast(ans === 'no' ? `Blocked ${addr}` : domain ? `Everyone at ${addr.split('@')[1]} is let in` : `${addr} is let in`);
  await railQuiet();
  if (S.folder === 'screener') { drawScreenerList(); if (!opened && !S.sel) emptyPane(); if (opened) location.hash = ans === 'yes' && S.open ? `#/f/inbox/${S.open.id}` : '#/f/screener'; }
  else if (opened) { $('.scrnote')?.remove(); }
}
document.addEventListener('click', e => {
  if (S.folder !== 'screener' || app.dataset.view !== 'mail' || !e.target.closest('[data-act="refresh"]')) return;
  e.stopImmediatePropagation(); e.preventDefault();
  railQuiet(); loadScreener(() => { S.items = S.scr.waiting.map(w => w.newest); drawScreenerList(); });
}, true);
document.addEventListener('click', async e => {
  const mv = e.target.closest('[data-mv]');
  if (mv) {
    try { S.mv = await api.movingMark(mv.dataset.mv, mv.dataset.mark); S.mvAt = Date.now(); } catch (x) { toast(x.message); }
    S.focusSec = 'h-sw'; drawSettings('switch'); return;
  }
  if (e.target.closest('[data-mv-all]')) { mvAll = !mvAll; S.focusSec = 'h-sw'; drawSettings('switch'); return; }
  if (e.target.closest('[data-mv-again]')) {
    try { S.mv = await api.movingAgain(); S.mvAt = Date.now(); pollMoving(); } catch (x) { toast(x.message); }
    S.focusSec = 'h-sw'; drawSettings('switch'); return;
  }
  const ans = e.target.closest('[data-scr-ans]');
  if (ans) { e.preventDefault(); return screenerAnswer(ans.dataset.addr, ans.dataset.scrAns, !!ans.dataset.domain); }
  const dom = e.target.closest('[data-scr-dom]');
  if (dom) { try { const d = await api.screenerDropDomain(dom.dataset.scrDom); S.scr = { ...S.scr, domains: d.domains }; } catch (x) { toast(x.message); } S.focusSec = 'h-scrdom'; drawSettings('screener'); return; }
  const sw = e.target.closest('[data-scr="toggle"]');
  if (sw) {
    const on = sw.getAttribute('aria-checked') !== 'true';
    sw.setAttribute('aria-busy', 'true');
    try { S.scr = await api.screenerSet(on); await mail.open(S.scr.waiting.map(w => w.newest)); toast(on ? 'Screener on' : 'Screener off. Waiting mail is in your Inbox.'); } catch (x) { toast(x.message); }
    await railQuiet(); S.focusSec = 'h-scr'; drawSettings('screener');
  }
});

new MutationObserver(() => $$('i[data-w]').forEach(i => { i.style.width = `${i.dataset.w}%`; i.removeAttribute('data-w'); })).observe(document.body, { subtree: true, childList: true });

boot().catch(e => {
  setView('pending', 'pane');
  pane.innerHTML = `<div class="blank"><div class="state"><h2>Your mail didn't load.</h2><p>${esc(e?.message || "foldoy didn't answer.")}</p>
    <div class="acts"><button class="pill light md" type="button" id="bootretry">Try again</button></div></div></div>`;
  $('#bootretry')?.addEventListener('click', () => location.reload());
});

document.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse' && e.target.closest?.('.field > button.end')) e.preventDefault(); }, true);
