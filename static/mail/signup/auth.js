import { api, pgp, account, FOLDOY, DEMO } from '../shared/api.js';
import { $, $$, esc, picker, icon, DOMAINS, FREE_DOMAIN, copy } from '../shared/ui.js';
import { solve } from '../shared/pow.js';

const pathMode = () => (/\/signup\/?$/.test(location.pathname) ? 'signup' : 'login');
if (location.hash === '#signup' || new URLSearchParams(location.search).has('signup')) history.replaceState(null, '', '/signup/');
const st = { mode: pathMode(), name: '', domain: FREE_DOMAIN, ok: false };
const INVITE = new URLSearchParams(location.search).get('invite') || '';
let powJob = null;
const startPow = () => (powJob = powJob || api.pow().then(c => solve(c.challenge, c.bits)).catch(() => (powJob = null)));
if (st.mode === 'signup') startPow();
const PAID = document.body.dataset.paid === '1';
const R = { email: '', code: '' };
const EMAIL_RESET = document.body.dataset.reset !== '0' || DEMO;
const K = { started: false, two: false };
const NEXT = (() => {
  const n = new URLSearchParams(location.search).get('next'); if (!n) return '/mail/';
  try {
    const u = new URL(n, location.href), home = document.body.dataset.home;
    if (u.origin === location.origin && !u.pathname.startsWith('//')) return u.pathname + u.search;
    if (home && u.origin === `https://${home}` && u.pathname === '/auth/sso/') return u.href;
  } catch (_) {  }
  return '/mail/';
})();
const on = (sel, ev, fn) => $(sel)?.addEventListener(ev, fn);
const form = $('#auth'), err = $('#err'), pw = $('#pw'), rule = $('#pwrule');

function show(id) {
  $$('.step').forEach(s => (s.hidden = s.id !== id));
  const i = $(`#${id} input:not([hidden])`); (i || $(`#${id} .hl`))?.focus({ preventScroll: true });
}
$$('[data-show]').forEach(b => {
  const flip = () => {
    const i = $('#' + b.dataset.show), had = document.activeElement === i, at = i.selectionStart, to = i.selectionEnd;
    i.type = i.type === 'password' ? 'text' : 'password';
    b.textContent = i.type === 'password' ? 'Show' : 'Hide';
    b.setAttribute('aria-pressed', String(i.type === 'text'));
    if (had) { i.focus({ preventScroll: true }); try { i.setSelectionRange(at, to); } catch (_) {  } }
  };
  let touched = false;
  b.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') return; e.preventDefault(); touched = true; flip(); });
  b.addEventListener('click', e => { e.preventDefault(); if (touched) { touched = false; return; } flip(); });
});

function mode(m) {
  st.mode = m; const up = m === 'signup'; document.body.dataset.mode = m;
  document.title = up ? 'Sign up · foldoy' : 'Log in · foldoy';
  $('#authh').textContent = up ? 'Create your account' : 'Log in to foldoy';
  for (const a of document.querySelectorAll('.sh-end a[data-mode]')) a.hidden = a.dataset.mode === m;
  for (const d of document.querySelectorAll('details.sh-menu[open]')) d.open = false;
  $('#addrf').hidden = up; $('#picker').hidden = !up;
  $('#avail').hidden = !up; $('#sugg').hidden = !up;
  $('#pwrule').hidden = !up; $('#recwrap').hidden = !up; $('#terms').hidden = !up;
  if ($('#forgotl')) $('#forgotl').hidden = up;
  if ($('#holdnote')) $('#holdnote').hidden = !up;
  pw.autocomplete = up ? 'new-password' : 'current-password';
  $('#go').textContent = up ? 'Create account' : 'Log in';
  $('#switch').innerHTML = up ? 'Have an account? <a href="/login/" data-mode="login">Log in</a>' : 'No account yet? <a href="/signup/" data-mode="signup">Sign up</a>';
  if (!up && st.name && !$('#addr').value) $('#addr').value = `${st.name}@${st.domain}`;
  err.textContent = '';
}

const avail = $('#avail'), sugg = $('#sugg');
let seq = 0, timer = 0;
const PRE = (new URLSearchParams(location.search).get('name') || '').toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 32);
const PRED = new URLSearchParams(location.search).get('domain') || '';
const pk = picker($('#picker'), {
  name: PRE,
  ...(DOMAINS.some(o => o.d === PRED && o.plan === 'Free') ? { domain: PRED } : {}),
  domains: DOMAINS.map(o => ({ ...o, off: !PAID && o.plan !== 'Free' })),
  note: PAID ? '@veil.no mailboxes open with foldoy+, $4/mo or $48/yr.'
    : n => `${DOMAINS.filter(o => o.plan !== 'Free').map(o => '@' + o.d).join(', ')} open with foldoy+, when paid plans open. Until then, take ${n || 'yourname'}@${FREE_DOMAIN}.`,
  onChange: v => { Object.assign(st, v); st.ok = false; clearTimeout(timer); timer = setTimeout(check, 220);
    if (!v.name) { avail.textContent = ''; avail.className = 'say'; sugg.innerHTML = ''; } },
});
if (PRE) { Object.assign(st, { name: PRE }, DOMAINS.some(o => o.d === PRED && o.plan === 'Free') ? { domain: PRED } : {}); st.ok = false; setTimeout(check, 0); }
async function check() {
  const { name, domain } = st, n = ++seq;
  if (!name) return;
  const r = await api.check(name, domain).catch(e => ({ ok: false, message: e.message }));
  if (n !== seq) return;
  st.ok = r.ok;
  avail.className = 'say ' + (r.ok ? 'ok' : 'bad');
  avail.innerHTML = r.ok ? `${icon('check', 'i ck')}<b>${esc(name)}@${esc(domain)}</b> is available.${domain !== FREE_DOMAIN ? ' Its mailbox opens with foldoy+.' : ''}` : esc(r.message);
  sugg.innerHTML = '';
  if (/taken/i.test(r.message)) {
    const tries = [[name, domain === FREE_DOMAIN ? 'veil.no' : FREE_DOMAIN], [`${name}.${String(new Date().getFullYear()).slice(2)}`, domain], [`${name}.no`, domain], [`the.${name}`, domain]]
      .filter(([, d]) => PAID || d === FREE_DOMAIN);
    const free = [];
    for (const [nm, d] of tries) { const a = await api.check(nm, d); if (a.ok) free.push([nm, d]); if (free.length === 3) break; }
    if (n !== seq) return;
    sugg.innerHTML = free.map(([nm, d]) => `<button type="button" data-n="${esc(nm)}" data-d="${d}">${esc(nm)}@${d}</button>`).join('');
  }
}
sugg.addEventListener('click', e => { const b = e.target.closest('button'); if (b) { pk.set(b.dataset.n, b.dataset.d); pk.focus(); } });
pw.addEventListener('input', () => { pw.closest('.field').classList.remove('bad'); rule.classList.remove('bad'); rule.classList.toggle('ok', !account.passwordProblem(pw.value)); rule.lastChild.textContent = '12 characters or more'; });

const loginOf = v => { v = (v || '').trim().toLowerCase(); return v && !v.includes('@') && !/^\d+$/.test(v) ? `${v}@${FREE_DOMAIN}` : v; };
async function logIn(b, errEl, code) {
  const login = loginOf($('#addr').value.trim()), password = pw.value;
  b.setAttribute('aria-busy', 'true'); const was = b.textContent; b.textContent = 'Logging in…';
  let ok = false;
  try { await account.login(login, password, code); ok = true; location.replace(NEXT); }
  catch (x) {
    if (x.two_factor) { if (code) { errEl.textContent = x.message; $('#totp').select(); } else location.hash = 'code-2fa'; }
    else if (x.classic) { errEl.innerHTML = `${esc(x.message)} <a href="/login/?classic=1">Open it</a>`; }
    else { errEl.textContent = x.message; if (!code) pw.select(); }
  } finally { if (!ok) { b.removeAttribute('aria-busy'); b.textContent = was; } }
}
async function signUp() {
  if (!st.name) { avail.className = 'say bad'; avail.textContent = 'Type the name you want.'; pk.focus(); return; }
  if (!st.ok) { await check(); if (!st.ok) { pk.focus(); return; } }
  const why = account.passwordProblem(pw.value);
  if (why) { rule.classList.remove('ok'); rule.classList.add('bad'); rule.lastChild.textContent = why.startsWith('Use 12') ? '12 characters or more' : why; pw.closest('.field').classList.add('bad'); pw.focus(); return; }
  const rec = $('#rec').value.trim(), rs = $('#recsay');
  if (rec && (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(rec) || FOLDOY.test(rec))) { rs.className = 'say bad'; rs.textContent = FOLDOY.test(rec) ? 'Use an address outside foldoy.' : 'Check the email address.'; $('#rec').focus(); return; }
  const b = $('#go'); b.setAttribute('aria-busy', 'true'); b.textContent = 'Making your key…';
  try {
    const address = `${st.name}@${st.domain}`;
    const k = await account.makeKey(address, pw.value);
    const pow = await startPow();
    const s = await api.signup({ name: st.name, domain: st.domain, auth: k.auth, kdf: k.kdf, key: k.key, recovery: k.recovery,
      privacy_plus: false, recovery_email: rec || null, accept: true, pow, ...(INVITE ? { invite: INVITE } : {}) });
    await pgp.remember(s.address);
    try { sessionStorage.setItem('foldoy-new', s.address); } catch {}
    pw.value = '';
    if (s.recovery?.set && $('#rc')) return showCode(k.code, s.address);
    location.replace(NEXT);
  } catch (x) { err.textContent = x.message; }
  finally { b.removeAttribute('aria-busy'); b.textContent = 'Create account'; }
}
form.addEventListener('submit', e => {
  e.preventDefault(); err.textContent = '';
  if (st.mode === 'signup') return signUp();
  if (!$('#addr').value.trim() || !pw.value) { err.textContent = 'Type your address and password.'; ($('#addr').value.trim() ? pw : $('#addr')).focus(); return; }
  logIn($('#go'), err);
});

function showCode(code, address) {
  $('#rcv').textContent = code.replace(/^((?:.{4}-){3}.{4})-/, '$1\n');
  const saved = () => { $('#rcdone').disabled = false; $('#rcsay').hidden = true; };
  $('#rcsave').onclick = () => { pgp.download(new Blob([`foldoy recovery code\n${address}\nMade ${new Date().toISOString().slice(0, 10)}\n\n${code}\n\nYou need it if you forget your password: it sets a new one and keeps all your mail.\nKeep it somewhere safe, away from this device.\n`], { type: 'text/plain' }), 'foldoy-recovery-code.txt'); saved(); };
  $('#rccopy').onclick = () => { copy(code, 'Recovery code copied'); saved(); };
  $('#rcdone').onclick = () => { $('#rcv').textContent = ''; location.replace(NEXT); };
  history.replaceState(null, '', '/signup/#recovery-code');
  show('rc'); scrollTo(0, 0); $('#rc .hl').focus({ preventScroll: true });
}

on('#k1', 'submit', async e => {
  e.preventDefault(); const er = $('#k1err'); er.textContent = '';
  const login = loginOf($('#kaddr').value.trim()), code = $('#kcode').value;
  if (!login || !code.trim()) { er.textContent = 'Type your address and your recovery code.'; return; }
  const b = $('#k1 button[type=submit]'); b.setAttribute('aria-busy', 'true'); b.textContent = 'Checking…';
  try { K.only = (await account.recoverStart(login, code)).loginOnly; K.started = true; K.two = false; location.hash = 'recover-new'; }
  catch (x) { if (x.two_factor) { K.two = true; location.hash = 'recover-2fa'; } else er.textContent = x.message; }
  finally { b.removeAttribute('aria-busy'); b.textContent = 'Continue'; }
});
on('#k2', 'submit', async e => {
  e.preventDefault(); const er = $('#k2err'); er.textContent = '';
  const c = $('#ktotp').value.trim(); if (!c) { er.textContent = 'Type the code from your authenticator app.'; return; }
  try { K.only = (await account.recoverStart(loginOf($('#kaddr').value.trim()), $('#kcode').value, c)).loginOnly; K.started = true; location.hash = 'recover-new'; }
  catch (x) { er.textContent = x.message; $('#ktotp').select(); }
});
on('#knpw', 'input', () => { const r = $('#krule'); r.classList.remove('bad'); r.classList.toggle('ok', !account.passwordProblem($('#knpw').value)); $('#knpw').closest('.field').classList.remove('bad'); });
on('#k3', 'submit', async e => {
  e.preventDefault(); $('#k3err').textContent = '';
  const why = account.passwordProblem($('#knpw').value);
  if (why) { const r = $('#krule'); r.classList.remove('ok'); r.classList.add('bad'); if (!why.startsWith('Use 12')) $('#k3err').textContent = why; $('#knpw').closest('.field').classList.add('bad'); $('#knpw').focus(); return; }
  const b = $('#k3 button[type=submit]'); b.setAttribute('aria-busy', 'true'); b.textContent = 'Saving…';
  try { await account.recoverFinish($('#knpw').value); $('#knpw').value = ''; $('#kcode').value = ''; K.started = false; location.hash = 'recover-done'; }
  catch (x) { $('#k3err').textContent = x.message; }
  finally { b.removeAttribute('aria-busy'); b.textContent = 'Save password'; }
});
on('#krelog', 'click', e => { e.preventDefault(); $('#addr').value = loginOf($('#kaddr').value.trim()); location.hash = ''; });

let recMode = false;
$('#userec').onclick = () => {
  recMode = !recMode; const i = $('#totp');
  $('#tflabel').textContent = recMode ? 'Backup code' : 'Code from your authenticator app';
  i.maxLength = recMode ? 20 : 6; i.inputMode = recMode ? 'text' : 'numeric'; i.placeholder = recMode ? 'Like ABCD-EFGH' : '6 digits'; i.value = ''; i.focus();
  $('#userec').textContent = recMode ? 'Use the app code' : 'Use a backup code'; $('#tferr').textContent = '';
};
$('#tf').addEventListener('submit', e => {
  e.preventDefault(); $('#tferr').textContent = '';
  const c = $('#totp').value.trim();
  if (!c) { $('#tferr').textContent = recMode ? 'Type a recovery code.' : 'Type the 6-digit code.'; return; }
  logIn($('#tfgo'), $('#tferr'), c);
});

$('#r1').addEventListener('submit', async e => {
  e.preventDefault();
  const v = $('#raddr').value.trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { $('#r1err').textContent = 'Type the recovery email you set.'; return; }
  let msg = 'If an account has this recovery email, a code is on its way to it.';
  try { msg = (await api.resetStart(v)).message || msg; } catch (x) { $('#r1err').textContent = x.message; return; }
  R.email = v; $('#r2msg').textContent = msg; location.hash = 'code';
});
$('#resend').onclick = async () => { await api.resetStart(R.email).catch(() => {}); $('#r2err').className = 'say ok'; $('#r2err').textContent = 'If it has one, a new code is on its way.'; };
$('#r2').addEventListener('submit', async e => {
  e.preventDefault(); const er = $('#r2err'); er.className = 'say bad'; er.textContent = '';
  const c = $('#rcode').value.replace(/\s/g, '');
  if (!/^\d{8}$/.test(c)) { er.textContent = 'The code is 8 digits.'; $('#rcode').select(); return; }
  let r; try { r = await api.resetCheck(R.email, c); } catch (x) { er.textContent = x.message; $('#rcode').select(); return; }
  R.code = c; R.pp = !!r.privacy_plus; R.addr = r.address || ''; $('#r3tf').hidden = !r.two_factor; location.hash = 'new';
});
$('#npw').addEventListener('input', () => { const r = $('#nrule'); r.classList.remove('bad'); r.classList.toggle('ok', !account.passwordProblem($('#npw').value)); $('#npw').closest('.field').classList.remove('bad'); });
$('#r3').addEventListener('submit', async e => {
  e.preventDefault();
  const why = account.passwordProblem($('#npw').value);
  if (why) {
    const r = $('#nrule');
    if (why.startsWith('Use 12')) { r.classList.remove('ok'); r.classList.add('bad'); $('#r3err').textContent = ''; } else $('#r3err').textContent = why;
    $('#npw').closest('.field').classList.add('bad'); $('#npw').focus(); return;
  }
  const b = $('#r3 button[type=submit]'); b.setAttribute('aria-busy', 'true'); b.textContent = 'Making your new key…';
  try {
    await account.reset(R.email, R.code, $('#npw').value, $('#r3code').value.trim() || undefined, R.pp, R.addr);
    $('#npw').value = ''; R.code = ''; location.hash = 'done';
  } catch (x) {
    if (x.two_factor || /two-factor/i.test(x.message)) { $('#r3tf').hidden = false; $('#r3code').focus(); $('#r3err').textContent = $('#r3code').value ? x.message : ''; }
    else if (/code/i.test(x.message)) { location.hash = 'code'; $('#r2err').textContent = x.message; }
    else $('#r3err').textContent = x.message;
  } finally { b.removeAttribute('aria-busy'); b.textContent = 'Save password'; }
});
$('#relog').onclick = e => { e.preventDefault(); location.hash = ''; };

function route() {
  const h = location.hash.slice(1);
  if (h === 'recover' && $('#rq')) { $('#byemail').hidden = $('#byemailnote').hidden = !EMAIL_RESET; return show('rq'); }
  if (h === 'recover-code' && $('#k1')) { if (!$('#kaddr').value && $('#addr').value) $('#kaddr').value = $('#addr').value; return show('k1'); }
  if (h === 'recover-2fa' && K.two) return show('k2');
  if (h === 'recover-new' && K.started) { $('#k3lead').textContent = K.only ? 'privacy+ is on: this changes your password only. Your mail opens with your privacy+ key, as before.' : 'All your mail stays readable.'; return show('k3'); }
  if (h === 'recover-done') { $('#k4lead').textContent = K.only ? "You're signed out everywhere. Log in with the new password, then unlock with your privacy+ key." : "All your mail is still readable. You're signed out everywhere; log in with the new password."; return show('k4'); }
  if (h === 'forgot' && EMAIL_RESET) return show('r1');
  if (h === 'code-2fa' && pw.value) return show('tf');
  if (h === 'code' && R.email) return show('r2');
  if (h === 'new' && R.code) return show('r3');
  if (h === 'done') return show('r4');
  mode(pathMode());
  $$('.step').forEach(s => (s.hidden = s.id !== 'auth'));
  (st.mode === 'signup' ? pk : $('#addr')).focus();
}
window.addEventListener('hashchange', route); window.addEventListener('popstate', route);
document.addEventListener('click', e => {
  const l = e.target.closest('a[data-mode]'); if (!l || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
  e.preventDefault(); document.body.classList.add('switched');
  history.pushState(null, '', l.getAttribute('href')); route();
});
route(); $('#picker').classList.remove('pre');

(() => {
  const v = document.querySelector('.xm video');
  if (!v) return;
  const still = () => { v.pause(); v.closest('.xm').classList.add('still'); };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return still();
  const p = v.play();
  if (p && p.catch) p.catch(still);
  setTimeout(() => { if (v.paused) still(); }, 2500);
  const box = v.closest('.xm'), cv = document.createElement('canvas'), cx = cv.getContext('2d');
  if (!cx) return;
  cv.setAttribute('aria-hidden', 'true'); box.appendChild(cv); box.classList.add('cv');
  const halves = new Path2D('M14 47.75H76A31 31 0 0 0 14 47.75Z M24 52.25H86A31 31 0 0 1 24 52.25Z');
  let S = 0;
  const size = () => { const r = box.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2); S = r.width; cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d); cx.setTransform(d, 0, 0, d, 0, 0); };
  size(); addEventListener('resize', size);
  const draw = () => {
    if (box.classList.contains('still')) { cv.remove(); box.classList.remove('cv'); return; }
    if (v.readyState >= 2 && v.videoWidth && S) {
      const c = Math.max(S / v.videoWidth, S / v.videoHeight), dw = v.videoWidth * c, dh = v.videoHeight * c;
      const dx = (S - dw) * .88, dy = (S - dh) * .30, ox = S * .82, oy = S * .38, k = 2.1;
      cx.save(); cx.clearRect(0, 0, S, S); cx.scale(S / 100, S / 100); cx.clip(halves); cx.scale(100 / S, 100 / S);
      cx.fillStyle = '#050607'; cx.fillRect(0, 0, S, S);
      cx.drawImage(v, ox + k * (dx - ox), oy + k * (dy - oy), dw * k, dh * k);
      cx.restore();
    }
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
})();
