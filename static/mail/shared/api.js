
import { MESSAGES, ALIASES, ME } from './sample-data.js';
import * as pgp from './pgp.js';

const QP = new URLSearchParams(location.search);
const DEMO_BUILD = false;
const DEMO_HOST = DEMO_BUILD || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
try { if (DEMO_HOST && QP.has('demo')) sessionStorage.setItem('foldoy-demo', '1'); } catch {}
export const DEMO = DEMO_HOST && (QP.has('demo') || (() => { try { return sessionStorage.getItem('foldoy-demo') === '1'; } catch { return false; } })());
if (DEMO) document.cookie = `foldoy_demo=1; path=/; samesite=lax${location.protocol === 'https:' ? '; secure' : ''}`;
if (DEMO && typeof document !== 'undefined') addEventListener('DOMContentLoaded', () => { const b = document.createElement('div'); b.className = 'demo-mark'; b.textContent = 'Demo data'; document.body.append(b); });
const LIVE = !DEMO;
const BASE = '/mail/api/';
export const PLANS_URL = location.hostname.startsWith('mail.')
  ? `https://${location.hostname.slice(5)}/auth/sso/?next=/pricing/` : '/pricing/';
export const siteUrl = path => (location.hostname.startsWith('mail.')
  ? `https://${location.hostname.slice(5)}/auth/sso/?next=${encodeURIComponent(path)}` : path);
let csrf = '';

export class ApiError extends Error { constructor(msg, status, extra) { super(msg); this.status = status; Object.assign(this, extra || {}); } }

async function live(method, path, body, form) {
  if (method !== 'GET' && !csrf) await live('GET', 'session').catch(() => {});
  const r = await fetch(BASE + path, { method, credentials: 'same-origin',
    headers: { ...(form ? {} : { 'Content-Type': 'application/json' }), ...(method !== 'GET' ? { 'X-CSRFToken': csrf } : {}) },
    body: method === 'GET' || body === undefined ? undefined : form || JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (j && j.csrf_token) csrf = j.csrf_token;
  if (r.status === 401 && j.error === 'Sign in first.') { forgetRead(); await pgp.forgetAll().catch(() => {}); }
  if (!r.ok) throw new ApiError(j.error || 'Something went wrong. Try again.', r.status, j);
  return j;
}
const call = (method, path, body) => (LIVE ? live(method, path, body) : standIn(method, path, body));
const qs = o => Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
function withKey(s) {
  const d = s && s.plan_detail;
  if (d) Object.assign(s, { storage: d.storage, cashback_pct: d.cashback_percent, alias_limit: d.alias_limit, aliases_send: d.aliases_send,
    domain_limit: d.custom_domain_limit, address_limit: d.extra_address_limit });
  if (s && s.address) ME_ADDR = s.address;
  if (s && 'images' in s) IMAGES = s.images !== false;
  if (!s || !s.keys) return s;
  const mine = s.keys.filter(k => !k.alias);
  const cur = mine.find(k => k.current && !k.stale) || mine[0] || {};
  s.key = { own: cur.kind === 'own', public_key: cur.public_key, kdf: s.kdf, fingerprint: cur.fingerprint, previous: mine.filter(k => k.stale || k !== cur) };
  return s;
}
const sess = p => p.then(withKey);

export const api = {
  check: (name, domain) => call('GET', `check?${qs({ name, domain })}`),
  prelogin: login => call('GET', `prelogin?${qs({ login })}`),
  signup: body => sess(call('POST', 'signup', body)),
  pow: () => call('GET', 'pow'),
  invites: () => call('GET', 'invites'),
  makeInvite: () => call('POST', 'invites', {}),
  unlockSending: () => sess(call('POST', 'unlock-sending', {})),
  setAppearance: change => sess(call('POST', 'appearance', change)),
  applyToSend: note => sess(call('POST', 'send-application', { note: note || '' })),
  claim: body => sess(call('POST', 'claim', body)),
  login: body => sess(call('POST', 'login', body)),
  logout: () => call('POST', 'logout', {}),
  session: () => sess(call('GET', 'session')),
  resetStart: email => call('POST', 'reset', { email }),
  resetCheck: (email, code) => call('POST', 'reset/check', { email, code }),
  resetConfirm: body => call('POST', 'reset/confirm', body),
  keys: address => call('GET', `keys?${qs({ address })}`),
  contactKeys: () => call('GET', 'contact-keys'),
  saveContactKeys: armored => call('PUT', 'contact-keys', { armored }),
  addContactKeys: (entries, auth) => call('POST', 'contact-keys', { entries, ...(auth ? { auth } : {}) }),
  setKey: body => call('PUT', 'key', body),
  folders: () => call('GET', 'folders'),
  messages: ({ folder, q, alias, cursor, unread } = {}) => call('GET', `messages?${qs({ folder, q, alias, cursor, unread: unread ? '1' : undefined })}`),
  message: (id, o = {}) => call('GET', `messages/${encodeURIComponent(id)}${o.images ? '?images=1' : ''}`),
  messageBatch: (ids, o = {}) => (LIVE ? call('GET', `message-batch?${qs({ ids: ids.join(','), images: o.images ? '1' : undefined })}`)
    : Promise.all(ids.map(id => standIn('GET', `messages/${id}${o.images ? '?images=1' : ''}`).catch(() => null))).then(xs => ({ items: xs.filter(Boolean) }))),
  update: (id, patch) => { patchKept(id, patch); return call('PATCH', `messages/${id}`, patch); },
  thread: tid => call('GET', `messages?${qs({ thread: tid })}`),
  snooze: (id, until) => { dropBody(id); return call('POST', `messages/${id}/snooze`, { until }); },
  unsnooze: id => { dropBody(id); return call('DELETE', `messages/${id}/snooze`); },
  unsubscribe: id => { dropBody(id); return call('POST', `messages/${id}/unsubscribe`, {}); },
  preferences: p => sess(call('POST', 'preferences', p)),
  makeFolder: name => call('POST', 'folders', { name }),
  renameFolder: (id, name) => call('PATCH', `folders/${id}`, { name }),
  deleteFolder: id => call('DELETE', `folders/${id}`),
  rules: () => call('GET', 'rules'),
  addRule: r => call('POST', 'rules', r),
  deleteRule: id => call('DELETE', `rules/${id}`),
  autoreply: v => sess(call('POST', 'autoreply', v)),
  cancelScheduled: id => call('DELETE', `scheduled/${id}`),
  importState: () => call('GET', 'import'),
  startImport: d => call('POST', 'import', d),
  cancelImport: () => call('DELETE', 'import'),
  switchList: () => call('GET', 'switch'),
  switchTick: (item, done) => call('POST', 'switch', { item, done }),
  moving: () => call('GET', 'moving'),
  movingAgain: () => call('POST', 'moving', {}),
  movingMark: (id, mark) => call('PATCH', `moving/${id}`, { mark }),
  screener: () => call('GET', 'screener'),
  screenerSet: on => call('PUT', 'screener', { on }),
  screenerAnswer: (address, answer, domain) => { forgetRead(); return call('POST', 'screener/answer', { address, answer, domain: !!domain }); },
  screenerDropDomain: id => call('DELETE', `screener/domains/${id}`),
  exportState: () => call('GET', 'export'),
  startExport: (auth, code) => call('POST', 'export', { auth, code }),
  cancelExport: () => call('DELETE', 'export'),
  lockedCreate: (armored, days, hint, from) => call('POST', 'locked', { armored, days, hint, from }),
  blocked: () => call('GET', 'blocked'),
  block: address => call('POST', 'blocked', { address }),
  unblock: id => call('DELETE', `blocked/${id}`),
  remove: id => { dropBody(id); return call('DELETE', `messages/${id}`); },
  send: body => call('POST', 'send', body),
  saveDraft: (id, body) => call('PUT', `drafts/${id || 'new'}`, body),
  attach: file => { if (LIVE) { const f = new FormData(); f.append('file', file); return live('POST', 'attachments', {}, f); }
    return standIn('POST', 'attachments', { name: file.name, size: file.size, type: file.type }); },
  raw: async id => { if (LIVE) { const r = await fetch(`${BASE}messages/${id}/raw`, { credentials: 'same-origin' }); if (!r.ok) throw new ApiError('That message could not be downloaded.', r.status); return r.blob(); }
    return standIn('GET', `messages/${id}/raw`); },
  aliases: () => call('GET', 'aliases'),
  createAlias: body => call('POST', 'aliases', body),
  updateAlias: (id, patch) => call('PATCH', `aliases/${id}`, patch),
  deleteAlias: id => call('DELETE', `aliases/${id}`),
  aliasKey: (id, key) => call('PUT', `aliases/${id}/key`, { key }),
  addresses: () => call('GET', 'addresses'),
  createAddress: body => call('POST', 'addresses', body),
  deleteAddress: id => call('DELETE', `addresses/${id}`),
  plans: () => call('GET', 'plans'),
  activity: () => call('GET', 'activity'),
  setPlan: (plan, period) => sess(call('POST', 'plan', { plan, period })),
  resumePlan: () => sess(call('POST', 'plan', { resume: true })),
  cancelPlan: () => sess(call('DELETE', 'plan', {})),
  billingPortal: () => call('POST', 'billing-portal', {}),
  domains: () => call('GET', 'domains'),
  addDomain: domain => call('POST', 'domains', { domain }),
  verifyDomain: id => call('POST', `domains/${id}/verify`, {}),
  deleteDomain: id => call('DELETE', `domains/${id}`),
  ppOn: body => call('PUT', 'privacy-plus', body),
  ppOff: body => call('DELETE', 'privacy-plus', body),
  ownKey: (auth, code, public_key) => call('PUT', 'key', { auth, code, public_key, own: true }),
  setRecovery: (email, auth, code) => call('PUT', 'recovery-email', { email, auth, code }),
  confirmRecovery: code => call('POST', 'recovery-email/confirm', { code }),
  clearRecovery: (auth, code) => call('DELETE', 'recovery-email', { auth, code }),
  twoFactor: () => call('GET', 'two-factor'),
  twoFactorSetup: auth => call('POST', 'two-factor/setup', { auth }),
  twoFactorConfirm: (code, auth) => call('POST', 'two-factor/confirm', { code, auth }),
  twoFactorOff: (auth, code) => call('DELETE', 'two-factor', { auth, code }),
  recoveryCodes: (auth, code) => call('POST', 'two-factor/recovery-codes', { auth, code }),
  sessions: () => call('GET', 'sessions'),
  endSession: id => call('DELETE', `sessions/${id}`),
  endOtherSessions: () => call('POST', 'sessions/end-others', {}),
  changePassword: body => call('POST', 'password', body),
  deleteAccount: (auth, code) => call('DELETE', 'account', { auth, code }),
  recoveryPrelogin: login => call('GET', `reset/code/prelogin?${qs({ login })}`),
  recoveryStart: body => call('POST', 'reset/code/check', body),
  recoveryFinish: body => call('POST', 'reset/code/finish', body),
  setRecoveryCode: body => call('PUT', 'recovery-code', body),
  recoveryUnlock: rauth => call('POST', 'recovery-code/unlock', { rauth }),
  recoveryRestore: body => call('POST', 'recovery-code/restore', body),
  appPasswords: () => call('GET', 'app-passwords'),
  createAppPassword: (label, auth, code) => call('POST', 'app-passwords', { label, auth, code }),
  revokeAppPassword: id => call('DELETE', `app-passwords/${id}`),
};
export { pgp };

const meta = n => (typeof document !== 'undefined' && document.querySelector(`meta[name="${n}"]`)?.content) || '';
const FREE_DOM = meta('foldoy-free-domain');
const FREE_DOMS = [FREE_DOM, ...meta('foldoy-free-domains').split(',')].map(d => d.trim().toLowerCase()).filter(Boolean);
export const FOLDOY = new RegExp(`@(${[...new Set(['foldoy.com', 'veil.no', 'dm.fo', ...FREE_DOMS])].filter(d => /^[a-z0-9.-]+$/.test(d)).map(d => d.replace(/\./g, '\\.')).join('|')})$`, 'i');
const COMMON = new Set(['password1234', '123456789012', 'qwertyuiopas', 'passwordpassword', 'iloveyou1234', 'letmeinplease', 'aaaaaaaaaaaa', 'foldoyfoldoy']);
const strong = p => p.length >= 12 && !/^(.)\1+$/.test(p) && !COMMON.has(p.toLowerCase());

async function freshAliasKeys(s) {
  const stale = (s.keys || []).filter(k => k.alias && k.stale && !(s.keys || []).some(x => x.alias === k.alias && !x.stale));
  if (!stale.length) return;
  const list = await api.aliases().catch(() => []);
  for (const k of stale) { const a = list.find(x => x.address === k.alias); if (a) await api.aliasKey(a.id, await pgp.newWrappedKey(a.address, REC)).catch(() => {}); }
}

let REC = null;
const ppOn = s => !!s?.privacy_plus?.on;
async function recOf(s) {
  REC = null;
  const pub = s?.recovery?.set && !ppOn(s) ? s.recovery.public_key : null;
  if (!pub) return null;
  try {
    const fp = await pgp.fingerprint(pub), pinned = await pgp.pinGet(s.address, 'recovery');
    if (pinned ? pinned === fp : await pgp.recoveryCertified(pub)) { REC = pub; if (!pinned) await pgp.pinSet(s.address, 'recovery', fp); }
  } catch {}
  return REC;
}
const trustRec = async (address, pub) => { try { await pgp.pinSet(address, 'recovery', await pgp.fingerprint(pub)); } catch {} REC = pub; };
const NOMATCH = 'Wrong address or recovery code.';
const recState = { login: '', code: '', token: '', opened: null };

export const account = {
  passwordProblem: p => (p.length < 12 ? 'Use 12 characters or more.' : !strong(p) ? 'That password is too common. Pick another.' : ''),
  async makeKey(address, password) {
    const k = await pgp.newAccountKey(address, password);
    const code = pgp.newRecoveryCode(); const { recovery, copies } = await pgp.makeRecovery(code);
    await pgp.pinSet(address, 'recovery', await pgp.fingerprint(recovery.public_key));
    return { ...k, code, recovery, key: { ...k.key, rcopy: copies[0].rcopy } };
  },
  async recoverStart(login, code, two_factor_code) {
    login = login.trim().toLowerCase();
    if (!pgp.codeShape(code)) throw new ApiError(NOMATCH, 400);
    const pre = await api.recoveryPrelogin(login);
    if (!pgp.kdfOk(pre.kdf)) throw new ApiError('This reset could not be checked safely. Try again later.', 400);
    const st = await api.recoveryStart({ login, rauth: await pgp.recoveryAuth(code, pre.kdf), two_factor_code });
    if (!(st.keys || []).length) { Object.assign(recState, { login, code, token: st.token, opened: [], loginOnly: true }); return { loginOnly: true }; }
    let opened; try { opened = await pgp.openCopies(code, pre.kdf, st.recovery, st.keys); } catch { opened = []; }
    if (!opened.some(k => !k.alias && !k.stale)) throw new ApiError(NOMATCH, 400);
    Object.assign(recState, { login, code, token: st.token, opened, loginOnly: false });
    return { loginOnly: false };
  },
  async recoverFinish(password) {
    if (recState.loginOnly) { const kdf = pgp.newKdf(); const r = await api.recoveryFinish({ token: recState.token, auth: await pgp.authFor(password, kdf), kdf, keys: [] }); Object.assign(recState, { code: '', token: '' }); return r; }
    const w = await pgp.wrapOpened(recState.opened, password);
    const r = await api.recoveryFinish({ token: recState.token, auth: w.auth, kdf: w.kdf, keys: w.keys });
    Object.assign(recState, { code: '', token: '', opened: null });
    return r;
  },
  async makeRecoveryCode(password, s, code) {
    const auth = await pgp.authFor(password, s.kdf);
    const rc = pgp.newRecoveryCode(); const { recovery, copies } = await pgp.makeRecovery(rc);
    const { kdf, rauth, public_key, wrapped_key, iv } = recovery;
    await api.setRecoveryCode({ auth, code, rauth, kdf, public_key, wrapped_key, iv, keys: ppOn(s) ? [] : copies.filter(c => c.id).map(({ id, rcopy }) => ({ id, rcopy })) });
    await trustRec(s.address, recovery.public_key); if (ppOn(s)) REC = null; return rc;
  },
  async unlockOlder(code, s) {
    const pre = await api.recoveryPrelogin(s.address);
    if (!pgp.codeShape(code) || !pgp.kdfOk(pre.kdf)) throw new ApiError("That recovery code doesn't match.", 400);
    const rauth = await pgp.recoveryAuth(code, pre.kdf);
    let r; try { r = await api.recoveryUnlock(rauth); } catch (x) { throw new ApiError(x.status === 429 ? x.message : "That recovery code doesn't match.", x.status); }
    let opened; try { opened = await pgp.openCopies(code, pre.kdf, r.recovery, r.keys); } catch { opened = []; }
    if (!opened.length) throw new ApiError("That recovery code doesn't match.", 400);
    const older = opened.filter(k => k.stale);
    const missing = new Set((s.keys || []).filter(k => !k.stale && k.kind !== 'own' && k.recovery === false).map(k => k.id));
    await trustRec(s.address, opened.pair);
    const rkeys = (await pgp.copiesFor(opened.pair, k => missing.has(k.id))).map(({ id, rcopy }) => ({ id, rcopy }));
    await api.recoveryRestore({ rauth, keys: older.length ? await pgp.rewrapOpened(older) : [], rkeys });
    if (older.length) pgp.addToRing(older);
    return older.length;
  },
  async login(login, password, code) {
    const pre = await api.prelogin(login.trim().toLowerCase());
    if (pre.scheme !== 'e2e') {
      if (FOLDOY.test(login.trim())) throw new ApiError('This sign-in could not be checked safely. Try again later.', 400);
      throw new ApiError('Older accounts made with an email or an account number log in on the classic page.', 400, { classic: true });
    }
    if (!pgp.kdfOk(pre.kdf)) throw new ApiError('This sign-in could not be checked safely. Try again later.', 400);
    const { auth, wrap } = await pgp.derive(password, pre.kdf);
    const s = await api.login({ login, auth, code });
    if (ppOn(s)) { await pgp.forget(s.address); return s; }
    if (!s.key.own) { await pgp.unlockAll(wrap, s.keys); pgp.setIds(s.keys); await pgp.remember(s.address); await recOf(s); await freshAliasKeys(s); }
    return s;
  },
  async boot(s) {
    if (!s.e2e || !s.keys || s.key?.own) return true;
    if (await pgp.restore(s.address, s.keys)) { pgp.setIds(s.keys); await recOf(s); return true; }
    if (LIVE || ppOn(s)) return false;
    try { const { wrap } = await pgp.derive(DEMO_PASSWORD, s.kdf); await pgp.unlockAll(wrap, s.keys); pgp.setIds(s.keys); await pgp.remember(s.address); await recOf(s); return true; } catch { return false; }
  },
  async logout(address) { await api.logout().catch(() => {}); await pgp.forget(address); },
  auth: (password, s) => pgp.authFor(password, s.kdf),
  async reset(email, code, password, two_factor_code, privacyPlus, address) {
    if (privacyPlus) { const kdf = pgp.newKdf(); return api.resetConfirm({ email, code, auth: await pgp.authFor(password, kdf), kdf, two_factor_code }); }
    const k = await pgp.newAccountKey(address || '', password);
    return api.resetConfirm({ email, code, auth: k.auth, kdf: k.kdf, key: k.key, two_factor_code });
  },
  async changePassword(current, next, s, code) {
    const cur = await pgp.authFor(current, s.kdf);
    if (ppOn(s)) { const kdf = pgp.newKdf(); const nw = await pgp.authFor(next, kdf); return api.changePassword({ current_auth: cur, new_auth: nw, kdf, keys: [], code }); }
    const w = await pgp.rewrapAll(next);
    const r = await api.changePassword({ current_auth: cur, new_auth: w.auth, kdf: w.kdf, keys: w.keys, code });
    await pgp.remember(s.address); return r;
  },
  async claim(name, domain, password, next) {
    if (!next || next === password) throw new ApiError('Choose a new password for your mail. It must differ from the old one.', 400);
    const k = await pgp.newAccountKey(`${name}@${domain}`, next);
    const s = await api.claim({ name, domain, password, auth: k.auth, kdf: k.kdf, key: k.key });
    await pgp.remember(s.address); return s;
  },
  async ppTurnOn(password, pkey, s, code) {
    const auth = await pgp.authFor(password, s.kdf);
    const k = await pgp.ppWrapAll(pkey);
    const r = await api.ppOn({ auth, code, pauth: k.pauth, kdf: k.kdf, keys: k.keys.filter(x => x.id) });
    await pgp.remember(s.address); REC = null; return r;
  },
  async ppTurnOff(password, pkey, s, code) {
    const k = await pgp.ppUnwrapAll(pkey, s.privacy_plus.kdf, password, s.kdf);
    let pub = s.recovery?.set ? s.recovery.public_key : null;
    if (pub) { const fp = await pgp.fingerprint(pub).catch(() => null), pinned = await pgp.pinGet(s.address, 'recovery'); if (!(pinned ? pinned === fp : await pgp.recoveryCertified(pub))) pub = null; }
    const rkeys = pub ? (await pgp.copiesFor(pub, x => !!x.id)).map(({ id, rcopy }) => ({ id, rcopy })) : [];
    const r = await api.ppOff({ auth: k.auth, code, pauth: k.pauth, keys: k.keys.filter(x => x.id), rkeys });
    k.done(); await pgp.remember(s.address); REC = pub; return r;
  },
  async ppUnlock(pkey, s) {
    try { await pgp.ppUnlock(pkey, s.privacy_plus.kdf, s.keys); } catch { throw new ApiError('That privacy+ key doesn\'t open your mail.', 403); }
    pgp.setIds(s.keys); await pgp.remember(s.address); REC = null; await freshAliasKeys(s);
  },
  ppBackup: (s, pkey) => pgp.ppBackup(s.address, pkey),
  async keyHere(password, s, code) {
    const k = await pgp.newMainKey(s.address, password, s.kdf);
    const rcopy = (await recOf(s)) ? await pgp.copyForAddress(null, REC) : null;
    const r = await api.setKey({ auth: k.auth, code, key: { ...k.key, ...(rcopy ? { rcopy } : {}) } }); await pgp.remember(s.address); return r;
  },
  async createAlias(body) { const domain = body.domain; const name = body.name || ''; return api.createAlias({ ...body, key: await pgp.newWrappedKey(name ? `${name}@${domain}` : `alias@${domain}`, REC) }); },
  async createAddress(name, domain, primary = false) { return api.createAddress({ name, domain, ...(primary ? { primary: true } : {}), key: await pgp.newWrappedKey(`${name}@${domain}`, REC) }); },
};

const bodyMem = new Map();
function keepBody(id, full, images = false) {
  if ((full.armored || '').length > 400000) return;
  bodyMem.set(String(id), { at: Date.now(), v: full, images: !!images });
  if (bodyMem.size > 60) bodyMem.delete(bodyMem.keys().next().value);
}
const keptBody = (id, o = {}) => { const k = bodyMem.get(String(id)); return k && Date.now() - k.at < 120000 && (k.v.armored || k.images === !!o.images) ? k.v : null; };
const readMem = new Map();
const READ_TTL = 120000, READ_MAX = 30;
const copyMsg = v => Array.isArray(v) ? v.map(copyMsg)
  : v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, copyMsg(x)]))
    : v;
let IMAGES = true;
function patchKept(id, patch) {
  const k = String(id);
  if (patch.folder !== undefined) { dropBody(k); return; }
  for (const v of [bodyMem.get(k)?.v, readMem.get(k)?.v]) {
    if (!v) continue;
    if (patch.unread !== undefined) v.unread = patch.unread;
    if (patch.flagged !== undefined) v.flagged = patch.flagged;
  }
}
export const dropBody = id => { bodyMem.delete(String(id)); readMem.delete(String(id)); };
export const forgetRead = () => { bodyMem.clear(); readMem.clear(); };
const inflight = new Map();
function fetchAhead(ids, opts) {
  const need = ids.map(String).filter(id => !keptBody(id, opts) && !inflight.has(id));
  for (let i = 0; i < need.length; i += 25) {
    const part = need.slice(i, i + 25);
    const p = (part.length === 1 ? api.message(part[0], opts).then(x => ({ items: [x] })) : api.messageBatch(part, opts))
      .then(r => { for (const x of r.items || []) keepBody(x.id, x, opts.images); });
    for (const id of part) inflight.set(id, p);
    p.catch(() => {}).finally(() => { for (const id of part) if (inflight.get(id) === p) inflight.delete(id); });
  }
  return Promise.all(ids.map(id => inflight.get(String(id))).filter(Boolean)).catch(() => {});
}
let seen = null;
let ME_ADDR = '';
export const pinsFor = a => { ME_ADDR = a || ''; };
async function pinned(addr, m) { const mine = ME_ADDR ? await pgp.pinGet(ME_ADDR, `contact:${addr}`) : null; if (mine) return mine; if (m[addr] && ME_ADDR) await pgp.pinSet(ME_ADDR, `contact:${addr}`, m[addr]); return m[addr] || null; }
function seenMap() {
  return (seen ||= (async () => {
    const m = {};
    try {
      const r = await api.contactKeys();
      if (r.armored) { const d = await pgp.verifyOwn(r.armored).catch(() => null); if (d) Object.assign(m, JSON.parse(d.text)); }
      for (const e of r.entries || []) {
        try { const d = await pgp.verifyOwn(e.armored); if (!d) continue; const x = JSON.parse(d.text); if (x.addr && x.fp && (await pgp.contactId(x.addr)) === e.id) m[x.addr] = x.fp; } catch {}
      }
    } catch {}
    return m;
  })());
}
const entryFor = async (addr, fp) => ({ id: await pgp.contactId(addr), armored: await pgp.encryptMail({ subject: 'contact key', text: JSON.stringify({ addr, fp }) }, []) });
async function remember(addr, fp, accept = false) {
  const m = await seenMap();
  if (ME_ADDR && (accept || !(await pgp.pinGet(ME_ADDR, `contact:${addr}`)))) await pgp.pinSet(ME_ADDR, `contact:${addr}`, fp);
  if (m[addr] && !accept) return;
  m[addr] = fp; try { await api.addContactKeys([await entryFor(addr, fp)]); } catch {}
}
async function peekKey(addr) {
  if (!FOLDOY.test(addr) || addr === 'orders@foldoy.com') return null;
  try {
    const c = await lookup(addr);
    if (!c.matches) return null;
    const was = (ME_ADDR ? await pgp.pinGet(ME_ADDR, `contact:${addr}`) : null) || (await seenMap())[addr] || null;
    return { address: addr, public_key: c.public_key, fingerprint: c.fingerprint, changed: was && was !== c.fingerprint ? was : null };
  } catch { return null; }
}
const keyMem = new Map();
function lookup(a) {
  const hit = keyMem.get(a); if (hit && Date.now() - hit.at < 180000) return hit.p;
  const p = (async () => { const k = await api.keys(a); const c = await pgp.checkKey(k.public_key, a); return { public_key: k.public_key, fingerprint: c.fingerprint, matches: c.matches }; })();
  keyMem.set(a, { at: Date.now(), p }); p.catch(() => { if (FOLDOY.test(a) && keyMem.get(a)?.p === p) keyMem.delete(a); });
  return p;
}
const lower = a => a.map(x => x.trim().toLowerCase()).filter(Boolean);
const named = (e, names) => Object.fromEntries(Object.entries(e).map(([k, v]) => [k, v.map(a => (names?.[a] ? { name: names[a], addr: a } : a))]));

export const fold = s => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
const textMem = new Map();
let textSize = 0;
const htmlText = h => { try { return new DOMParser().parseFromString(h, 'text/html').body?.textContent || ''; } catch { return ''; } };
function keepText(m, d) {
  const id = String(m.id), had = textMem.get(id);
  if (had != null) return had;
  const people = [m.from, ...(m.to || []), ...(m.cc || [])].flatMap(p => (p ? [p.name, p.addr] : []));
  const t = fold([d.subject || m.subject, ...people, d.text || htmlText(d.html || '')].join('\n')).slice(0, 200000);
  textMem.set(id, t); textSize += t.length;
  while (textSize > 40e6 && textMem.size) { const [k, v] = textMem.entries().next().value; textMem.delete(k); textSize -= v.length; }
  return t;
}
const cutWords = (t, n = 160) => (t.length > n ? `${t.slice(0, n).replace(/\s+\S*$/, '')}…` : t);
const previewOf = t => cutWords((t || '').replace(/^>.*$/gm, '').replace(/\s+/g, ' ').trim());

export const mail = {
  async classify(addrs) {
    const out = { e2e: [], plain: [], unknown: [], changed: [] };
    const m = await seenMap();
    const list = [...new Set(lower(addrs))].filter(a => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a));
    const got = await Promise.all(list.map(async a => {
      const miss = FOLDOY.test(a) ? 'unknown' : 'plain';
      try {
        const c = await lookup(a);
        if (!c.matches) return [miss, a];
        const was = await pinned(a, m);
        return ['e2e', { addr: a, public_key: c.public_key, fingerprint: c.fingerprint }, was && was !== c.fingerprint ? { addr: a, was, now: c.fingerprint } : null];
      } catch { return [miss, a]; }
    }));
    for (const [kind, v, ch] of got) { out[kind].push(v); if (ch) out.changed.push(ch); }
    return out;
  },
  async send(c, s) {
    const k = await mail.classify([...c.to, ...c.cc, ...c.bcc]);
    if (k.unknown.length) throw new ApiError(`No foldoy account has ${k.unknown.join(', ')}.`, 400);
    const moved = k.changed.filter(x => !(c.accept_keys || []).includes(x.now));
    if (moved.length) throw new ApiError(`${moved.map(x => x.addr).join(', ')} has a different key than before.`, 409, { key_changed: moved });
    for (const x of k.changed) await remember(x.addr, x.now, true);
    if (c.lock && k.plain.length && !c.outside) throw new ApiError('This message is encrypted with a password. Set it again before sending.', 400);
    const parts = { subject: c.subject, text: c.text, ...(c.html ? { html: c.html } : {}) };
    const files = c.files || [];
    const ownPub = s?.key?.own ? [s.key.public_key] : [];
    const e2e = new Set(k.e2e.map(x => x.addr)), isE = a => e2e.has(a), notE = a => !e2e.has(a);
    const env = f => ({ to: lower(c.to).filter(f), cc: lower(c.cc).filter(f), bcc: lower(c.bcc).filter(f) });
    let id;
    if (k.e2e.length) {
      const e = env(isE);
      const armored = await pgp.encryptMail({ ...parts, files }, [...k.e2e.map(x => x.public_key), ...ownPub], c.from, { hide: e.bcc.length > 0 });
      id = (await api.send({ from: c.from, ...named(e, c.names), raw: pgp.rawMessage({ from: c.from, to: e.to, cc: e.cc, armored, names: c.names }), draft_id: c.draft_id, in_reply_to: c.in_reply_to, send_at: c.send_at })).id;
      for (const x of k.e2e) await remember(x.addr, x.fingerprint);
    }
    if (k.plain.length) {
      const p = env(notE);
      const mixed = k.e2e.length > 0, noCopy = mixed && !c.send_at;
      const copy = noCopy ? undefined : pgp.rawMessage({ from: c.from, to: p.to, cc: p.cc, names: c.names, armored: await pgp.encryptMail({ ...parts, files }, ownPub, c.from) });
      const out = c.outside || parts;
      const attachment_ids = c.outside ? [] : await Promise.all(files.map(async f => (await api.attach(new File([f.bytes], f.name, { type: f.type }))).id));
      const r = await api.send({ from: c.from, ...named(p, c.names), ...out, attachment_ids, sent_copy: copy, ...(noCopy ? { no_copy: true } : {}), draft_id: mixed ? undefined : c.draft_id, in_reply_to: c.in_reply_to, send_at: c.send_at });
      id = r.id || id;
    }
    return { id };
  },
  async saveDraft(id, c) {
    const armored = await pgp.encryptMail({ subject: c.subject, text: c.text, ...(c.html ? { html: c.html } : {}) }, [], c.from);
    return api.saveDraft(id, { raw: pgp.rawMessage({ from: c.from, to: lower(c.to), cc: lower(c.cc), armored, names: c.names }) });
  },
  async read(id, s, o = {}) {
    const k = String(id), hit = readMem.get(k);
    if (hit && Date.now() - hit.at < READ_TTL && (hit.images === !!o.images || hit.enc)) {
      const v = await hit.p.catch(() => null);
      if (v && !v.locked) return copyMsg(v);
    }
    const p = mail.readNow(k, s, o), e = { at: Date.now(), images: !!o.images, p };
    readMem.set(k, e);
    if (readMem.size > READ_MAX) readMem.delete(readMem.keys().next().value);
    try {
      const m = await p;
      const big = (m.armored || '').length + (m.html || '').length + (m.text || '').length > 400000;
      if (readMem.get(k) === e) { if (m.locked || big) readMem.delete(k); else { e.v = m; e.enc = !!m.armored; } }
      return copyMsg(m);
    } catch (x) { if (readMem.get(k) === e) readMem.delete(k); throw x; }
  },
  async readNow(id, s, o = {}) {
    const keyOf = a => (o.ahead ? peekKey(a) : mail.senderKey(a).catch(() => null));
    const early = o.from && FOLDOY.test(o.from) ? keyOf(o.from) : null;
    let kept = keptBody(id, o);
    if (!kept && inflight.has(id)) { await inflight.get(id).catch(() => {}); kept = keptBody(id, o); }
    const m = kept ? copyMsg(kept) : await api.message(id, { images: o.images });
    if (m.armored) {
      const from = m.from?.addr || '';
      const sk = !FOLDOY.test(from) ? null : early && from === o.from ? await early : await keyOf(from);
      try {
        const d = await pgp.decrypt(m.armored, sk?.public_key);
        Object.assign(m, { text: d.text, html: d.html, subject: d.subject || m.subject });
        if (d.files?.length) m.attachments = d.files.map((f, i) => ({ id: `in:${i}`, name: f.name, size: f.size, type: f.type, cid: f.cid, bytes: f.bytes }));
        m.verified = !!(d.verified && sk && !sk.changed);
        m.unsigned = FOLDOY.test(m.from?.addr || '') && !d.verified && m.arrival === 'e2e';
      } catch { m.locked = s?.key?.own ? 'own' : 'previous'; }
    }
    return m;
  },
  async prefetch(items, o = {}) {
    const opts = { images: o.images ?? IMAGES };
    const want = items.filter(m => m && m.id && !m.locked && !readMem.has(String(m.id)));
    await fetchAhead(want.map(m => m.id), opts);
    for (const m of want.slice(0, o.open ?? 3)) await mail.read(m.id, null, { ...opts, ahead: true }).catch(() => {});
  },
  ahead(m, o = {}) {
    if (!m || !m.id || m.locked || readMem.has(String(m.id))) return Promise.resolve();
    return mail.read(m.id, null, { images: o.images ?? IMAGES, ahead: true, from: m.encrypted ? m.from?.addr : undefined }).catch(() => {});
  },
  cached(items) { for (const m of items) { const r = m.encrypted && !m.opened && pgp.rowGet(m.id); if (r) Object.assign(m, { subject: r.s, preview: r.p, opened: true }); } return items; },
  async open(items, onRow) {
    await pgp.rowLoad(items.filter(m => m.encrypted && !m.opened).map(m => m.id));
    mail.cached(items);
    const todo = items.filter(m => m.encrypted && !m.opened && !m.locked);
    const missing = todo.filter(m => !m.armored && !keptBody(m.id)).map(m => String(m.id)), batch = new Map();
    for (let j = 0; j < missing.length; j += 25) {
      const ids = missing.slice(j, j + 25);
      const got = api.messageBatch(ids).then(r => { const by = new Map(); for (const x of r.items || []) { by.set(String(x.id), x); keepBody(x.id, x); } return by; }, () => new Map());
      for (const id of ids) batch.set(id, got);
    }
    let i = 0;
    const work = async () => {
      while (i < todo.length) {
        const m = todo[i++];
        try {
          let armored = m.armored;
          if (!armored) {
            const full = (await batch.get(String(m.id)))?.get(String(m.id)) || keptBody(m.id) || await api.message(m.id);
            armored = full.armored; keepBody(m.id, full);
          }
          const d = await pgp.decrypt(armored); m.subject = d.subject || m.subject; m.preview = previewOf(d.text); m.opened = true;
          pgp.rowPut(m.id, { s: m.subject, p: m.preview }); keepText(m, d);
        } catch { m.locked = true; }
        if (onRow) try { onRow(m); } catch {}
      }
    };
    await Promise.all(Array.from({ length: Math.min(6, todo.length) }, work));
    if (onRow) mail.prefetch(items.slice(0, 6)).catch(() => {});
    return items;
  },
  async prime(items) { await pgp.rowLoad(items.filter(m => m.encrypted && !m.opened).map(m => m.id)); return mail.cached(items); },
  textOf: id => textMem.get(String(id)) ?? null,
  async fetchText(m) {
    const had = textMem.get(String(m.id));
    if (had != null) { mail.cached([m]); return had; }
    const full = keptBody(m.id) || await api.message(m.id);
    if (!full.armored) return keepText(m, full);
    const d = await pgp.decrypt(full.armored);
    if (!m.opened) { m.subject = d.subject || m.subject; m.preview = previewOf(d.text); m.opened = true; pgp.rowPut(m.id, { s: m.subject, p: m.preview }); }
    return keepText(m, d);
  },
  forgetText() { textMem.clear(); textSize = 0; },
  async senderKey(addr) {
    if (!FOLDOY.test(addr) || addr === 'orders@foldoy.com') return null;
    try {
      const c = await lookup(addr);
      if (!c.matches) return null;
      const m = await seenMap(); const was = await pinned(addr, m); if (!was) await remember(addr, c.fingerprint);
      return { address: addr, public_key: c.public_key, fingerprint: c.fingerprint, changed: was && was !== c.fingerprint ? was : null };
    } catch { return null; }
  },
  async acceptKey(addr, fp, auth) { await api.addContactKeys([await entryFor(addr, fp)], auth); forgetRead(); const m = await seenMap(); m[addr] = fp; if (ME_ADDR) await pgp.pinSet(ME_ADDR, `contact:${addr}`, fp); },
  acceptHere: (addr, fp) => remember(addr, fp, true),
};


const KEY = 'foldoy-proto-v4';
export const DEMO_PASSWORD = 'fjord-morning-12';
export const DEMO_CODE = '246810';
export const DEMO_TOTP = '135790';
const NAME = /^[a-z0-9](?:[a-z0-9]|[._-](?=[a-z0-9])){2,31}$/;
const ROLES = new Set('abuse admin administrator billing contact daemon foldoy help hostmaster info legal mail mailer-daemon noc nobody noreply no-reply postmaster privacy root sales security support system webmaster www'.split(' '));
const BRANDS = ['foldoy', 'paypal', 'icloud', 'google', 'gmail', 'microsoft', 'hotmail', 'outlook', 'amazon', 'netflix', 'facebook', 'instagram', 'whatsapp', 'telegram', 'binance', 'coinbase', 'metamask', 'revolut'];
const TAKEN = new Set(['mira', 'kari', 'jonas', 'ola', 'nora', 'emma', 'anna', 'lars', 'erik', 'sofie', 'test', 'john', 'alex', 'max', 'selma', 'hallvard', 'ana.ruiz', 'selma.okafor', 'sam', 'leo']);
const DOMAINS = [...new Set(['foldoy.com', 'veil.no', 'dm.fo', ...FREE_DOMS])];
const PLANS = {
  free: { alias_limit: 3, quota: 1e9, domains: 0, addresses: 0, cashback: 0 },
  plus: { alias_limit: 50, quota: 15e9, domains: 1, addresses: 0, cashback: 0 },
  polar: { alias_limit: 500, quota: 50e9, domains: 5, addresses: 10, cashback: 0 },
};

const now = Date.now();
const iso = ago => new Date(now - ago * 60000).toISOString();
const clone = o => JSON.parse(JSON.stringify(o));
let P = null;
const sample = async () => (P ||= (await import('./sample-pgp.js')).SAMPLE_PGP);

async function scenario(name, extra) {
  const X = await sample();
  const base = { scenario: name, seq: 100, sessionOn: true, two_factor: false, recovery_codes: [], seen: null, domains: [], addresses: [], sessions: [
    { id: 's1', device: 'Firefox on Linux', country: 'Norway', since: iso(9 * 1440), seen: iso(0), current: true },
    { id: 's2', device: 'Safari on iPhone', country: 'Norway', since: iso(30 * 1440), seen: iso(5 * 60), current: false },
    { id: 's3', device: 'Chrome on Windows', country: 'Sweden', since: iso(61 * 1440), seen: iso(12 * 1440), current: false }] };
  if (name === 'pending-plan') return { ...(await scenario('pending', extra)), scenario: name, address: 'kari@veil.no', waiting_for: 'plan' };
  if (name === 'empty' || name === 'pending' || name === 'new') {
    const a = extra?.account || X.accounts.kari;
    return { ...base, address: extra?.address || 'kari@foldoy.com', display: '', plan: 'free', mailbox: name === 'empty' ? 'active' : 'pending',
      balance_usd: 0, used: name === 'empty' ? 2.1e6 : 0, recovery_email: extra?.recovery_email || null, waiting_for: name === 'empty' ? null : 'server',
      kdf: a.kdf, auth: a.auth, keys: clone(a.keys), privacy_plus: { enabled: !!extra?.privacy_plus, applied: true }, aliases: [], messages: [] };
  }
  const M = X.accounts.mira;
  const s = { ...base, address: ME.addr, display: ME.name, plan: name === 'polar' ? 'polar' : name === 'free' ? 'free' : 'plus', mailbox: 'active', balance_usd: name === 'free' ? 0 : 14.2, used: name === 'polar' ? 3.4e9 : 2.3e9,
    recovery_email: { address: 'mira.s@posteo.example', confirmed: true }, kdf: M.kdf, auth: M.auth, keys: clone(M.keys).filter(k => !k.extra || name === 'polar'), seen: X.seen,
    privacy_plus: { enabled: name === 'pplus', applied: true },
    aliases: ALIASES.map(a => ({ ...a, created: iso(a.created_ago), permanent: false })),
    messages: MESSAGES.map(m => {
      const x = { ...clone(m), date: iso(m.ago), attachments: m.attachments || [], cc: [], bcc: [], arrival: 'plain' };
      if (X.e2e[x.id]) Object.assign(x, { arrival: 'e2e', armored: X.e2e[x.id], subject: '...', text: null, html: null, attachments: [] });
      else if (name === 'pplus' && X.sealed[x.id]) Object.assign(x, { arrival: 'sealed', armored: X.sealed[x.id], text: null, html: null, attachments: [] });
      if (name === 'own' && X.own[x.id]) x.armored = X.own[x.id];
      return x;
    }) };
  if (name === 'pplus') { s.two_factor = true; s.recovery_codes = ['KQ7M-2XRP', 'T4WD-9HNE', 'P2LB-R8XC', 'MV6Q-3ZTA', 'H9SE-K4YU', 'D7NF-W2GJ', 'BX3R-6PQL', 'Z8CA-5TMV']; }
  if (name === 'polar') {
    s.balance_usd = 15.2;
    s.addresses = M.keys.filter(k => k.extra).map(k => ({ id: k.id.replace('k', 'ad'), address: k.alias, created: iso(30 * 1440) }));
    s.domains = [
      { id: 'd1', domain: 'solberg.family', status: 'active', created: iso(40 * 1440), records: dnsRecords('solberg.family', true) },
      { id: 'd2', domain: 'mira-draws.no', status: 'unverified', created: iso(60), records: dnsRecords('mira-draws.no') },
    ];
  }
  if (name === 'own') { s.keys = [{ id: 'kown', kind: 'own', alias: null, public_key: X.own_public, wrapped_key: null, iv: null, fingerprint: '', current: true, created: iso(5 * 1440) }];
    s.messages = s.messages.filter(m => m.folder !== 'sent' && m.folder !== 'drafts'); }
  return s;
}
function dnsRecords(d, ok = null) {
  const tag = d.replace(/[^a-z0-9]/g, '').slice(0, 8);
  return [
    { type: 'TXT', host: `_foldoy-verify.${d}`, value: `foldoy-verify=${tag}${String(d.length * 7919).slice(0, 4)}`, purpose: 'Ownership', ok },
    { type: 'MX', host: d, value: '10 mx.foldoy.com.', purpose: 'Mail', ok },
    { type: 'TXT', host: d, value: 'v=spf1 include:_spf.foldoy.com ~all', purpose: 'SPF', ok },
    { type: 'TXT', host: `foldoy._domainkey.${d}`, value: null, purpose: 'DKIM', ok: null },
    { type: 'TXT', host: `_dmarc.${d}`, value: 'v=DMARC1; p=quarantine; rua=mailto:dmarc@foldoy.com', purpose: 'DMARC', ok },
  ];
}

let S = null;
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} }
async function state() {
  if (S) return S;
  const p = new URLSearchParams(location.search), want = ['1', ''].includes(p.get('demo')) ? null : p.get('demo');
  try { S = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { S = null; }
  if (want && (!S || S.scenario !== want || p.has('reset'))) S = null;
  if (!S) { S = await scenario(want || 'full'); save(); }
  return S;
}
export async function useScenario(name, extra) { S = await scenario(name, extra); save(); return S; }

const wait = ms => new Promise(r => setTimeout(r, ms));
const err = (msg, status = 400, extra) => { throw new ApiError(msg, status, extra); };
const pub = m => ({ id: m.id, thread_id: m.thread_id, from: m.from, to: m.to, subject: m.subject,
  preview: m.armored ? '' : cutWords((m.text || '').replace(/^>.*$/gm, '').replace(/\s+/g, ' ').trim()),
  date: m.date, unread: m.unread, flagged: m.flagged, attachments: (m.attachments || []).length, encrypted: !!m.armored, arrival: m.arrival || 'plain',
  via_alias: m.via_alias || null, folder: m.folder });
const FOLDERS = [['inbox', 'Inbox'], ['drafts', 'Drafts'], ['sent', 'Sent'], ['archive', 'Archive'], ['junk', 'Junk'], ['trash', 'Trash']];
const codeOk = (s, code) => { const c = (code || '').replace(/[\s-]/g, '').toUpperCase();
  if (c === DEMO_TOTP) return true;
  const i = (s.recovery_codes || []).findIndex(r => r.replace(/-/g, '') === c); if (i < 0) return false;
  s.recovery_codes.splice(i, 1); return true; };
const checkPw = (s, auth, code) => { if (auth !== s.auth) err('Your password is wrong.', 403); if (s.two_factor && !codeOk(s, code)) err(code ? 'Wrong two-factor code.' : 'Type the code from your authenticator app.', 403, { two_factor: true }); };
const RCODES = () => Array.from({ length: 8 }, () => Math.random().toString(36).slice(2, 6).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase());
function fakeQr(seed) {
  let x = 0; for (const ch of seed) x = (x * 31 + ch.charCodeAt(0)) >>> 0;
  const n = 25, cells = [];
  const finder = (r, c) => [[0, 0], [0, n - 7], [n - 7, 0]].some(([a, b]) => r >= a && r < a + 7 && c >= b && c < b + 7);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (finder(r, c)) { const [a, b] = r < 7 ? (c < 7 ? [0, 0] : [0, n - 7]) : [n - 7, 0]; const rr = r - a, cc = c - b;
      if (rr === 0 || rr === 6 || cc === 0 || cc === 6 || (rr > 1 && rr < 5 && cc > 1 && cc < 5)) cells.push([r, c]); continue; }
    x = (x * 1103515245 + 12345) >>> 0; if (x & 0x10000) cells.push([r, c]);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 ${n + 4} ${n + 4}" shape-rendering="crispEdges"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/>${cells.map(([r, c]) => `<rect x="${c}" y="${r}" width="1" height="1" fill="#000"/>`).join('')}</svg>`;
}
function nameProblem(name) {
  if (!NAME.test(name)) return ['invalid', 'Use 3 to 32 letters or digits. Dots, dashes and underscores can go between them.'];
  const joined = name.split(/[._-]/).join('');
  if (ROLES.has(name) || ROLES.has(joined) || BRANDS.some(b => joined.includes(b))) return ['reserved', 'Role and brand names are kept back.'];
  return null;
}
async function fakeKdf(address) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('foldoy-fake:' + address)));
  return { name: 'argon2id', salt: pgp.b64(h.subarray(0, 16)), time: 3, memory: 65536, parallelism: 1 };
}
const keyRow = (s, k, alias) => {
  if (s.pp?.on && k.rcopy) err('Recovery copies are off while privacy+ is on.');
  if (s.recovery && !s.pp?.on && !k.rcopy && k.wrapped_key && !s.resetting) err('Add the recovery copy of the new key.');
  return { id: `k${++s.seq}`, kind: 'made_here', alias: alias || null, public_key: k.public_key, wrapped_key: k.wrapped_key, iv: k.iv, rcopy: k.rcopy || null, fingerprint: '', current: true, created: new Date().toISOString() };
};
const recObj = s => (s.recovery ? { set: true, complete: !!s.pp?.on || s.keys.filter(k => !k.stale && k.kind !== 'own').every(k => k.rcopy), paused: !!s.pp?.on, public_key: s.recovery.public_key } : { set: false, complete: false, public_key: null });
const ppObj = s => ({ on: !!s.pp?.on, enabled: !!s.pp?.on, kdf: s.pp?.on ? s.pp.kdf : null, kind: 'key', applied: true });
const copiesOut = s => s.keys.filter(k => k.rcopy).map(k => ({ id: k.id, alias: k.alias, public_key: k.public_key, rcopy: k.rcopy, stale: !!k.stale }));

async function standIn(method, path, body) {
  await wait(method === 'GET' ? 60 : 120);
  const [route, query] = path.split('?');
  const q = Object.fromEntries(new URLSearchParams(query || ''));
  const parts = route.split('/');
  const r = `${method} ${parts[0]}`;

  if (r === 'GET check') {
    const name = (q.name || '').trim().toLowerCase(), domain = q.domain;
    if (!DOMAINS.includes(domain)) err('Pick one of the domains.');
    const needs_plan = domain !== 'foldoy.com';
    const p = nameProblem(name);
    if (p) return { ok: false, message: p[1], needs_plan };
    if (TAKEN.has(name) || name.startsWith('test')) return { ok: false, message: 'That address is taken.', needs_plan };
    return { ok: true, message: `${name}@${domain} is free.`, needs_plan };
  }
  if (r === 'GET prelogin') {
    const s = await state(), a = (q.login || '').toLowerCase();
    if (!FOLDOY.test(a)) return { scheme: 'password' };
    if (a === s.address) return { scheme: 'e2e', kdf: s.kdf };
    if (a === ME.addr) return { scheme: 'e2e', kdf: (await sample()).accounts.mira.kdf };
    return { scheme: 'e2e', kdf: await fakeKdf(a) };
  }
  if (r === 'GET reset' && parts[1] === 'code' && parts[2] === 'prelogin') {
    const s = await state(), a = (q.login || '').toLowerCase();
    if (a === s.address && s.recovery) return { kdf: s.recovery.kdf };
    const k = await fakeKdf('recovery:' + a); return { kdf: k };
  }
  if (r === 'POST reset' && parts[1] === 'code' && parts[2] === 'check') {
    const s = await state(), a = (body.login || '').toLowerCase();
    if (a !== s.address || !s.recovery || body.rauth !== s.recovery.rauth) err('Wrong address or recovery code.', 400);
    if (s.two_factor && !codeOk(s, body.two_factor_code)) err(body.two_factor_code ? 'Wrong two-factor code.' : 'Type the code from your authenticator app.', 401, { two_factor: true });
    s.rtoken = 'rt' + (++s.seq); save();
    return { token: s.rtoken, recovery: { wrapped_key: s.recovery.wrapped_key, iv: s.recovery.iv }, keys: copiesOut(s) };
  }
  if (r === 'POST reset' && parts[1] === 'code' && parts[2] === 'finish') {
    const s = await state();
    if (!s.rtoken || body.token !== s.rtoken) err('This reset has expired. Start again.', 400);
    if (!body.auth || !pgp.kdfOk(body.kdf) || 'wrap' in body) err('The new password could not be set.');
    const withCopy = s.keys.filter(k => k.rcopy);
    if (!withCopy.every(k => (body.keys || []).some(x => x.id === k.id && x.wrapped_key && x.iv))) err('Send every key, wrapped with the new password.');
    for (const x of body.keys || []) { const k = s.keys.find(y => y.id === x.id); if (k) Object.assign(k, { wrapped_key: x.wrapped_key, iv: x.iv, stale: false }); }
    s.kdf = body.kdf; s.auth = body.auth; s.rtoken = null; s.sessionOn = false; save();
    return { ok: true, message: 'Your password is changed and all your mail is still readable. Log in with the new password.' };
  }
  if (r === 'POST reset') {
    const s = await state();
    const mine = s.recovery_email?.confirmed && (body.email || '').trim().toLowerCase() === s.recovery_email.address.toLowerCase();
    if (parts[1] === 'check') { if (!mine || body.code !== DEMO_CODE) err('Wrong code.'); return { ok: true, two_factor: !!s.two_factor, privacy_plus: !!s.pp?.on }; }
    if (parts[1] === 'confirm') {
      if (!mine || body.code !== DEMO_CODE) err('Wrong code.');
      if (s.two_factor && !codeOk(s, body.two_factor_code)) err('Wrong two-factor code.', 400, { two_factor: true });
      if (s.pp?.on) { if (!body.auth || !pgp.kdfOk(body.kdf)) err('The new password could not be set.'); s.kdf = body.kdf; s.auth = body.auth; s.sessionOn = false; save(); return { ok: true, message: 'Your password is changed. Log in with it.' }; }
      if (!body.auth || !body.key?.public_key || !body.key?.wrapped_key || !body.key?.iv) err('The new key is missing.');
      for (const k of s.keys) { k.stale = true; k.current = false; }
      s.resetting = true; s.keys.unshift({ ...keyRow(s, body.key, null) }); s.resetting = false;
      s.kdf = body.kdf; s.auth = body.auth; s.sessionOn = false; save();
      return { ok: true, message: 'Your password is changed. Log in with it.' };
    }
    return { ok: true, message: 'If an account has this recovery email, a code is on its way to it.' };
  }
  if (r === 'POST signup') {
    const a = await standIn('GET', `check?${qs({ name: body.name, domain: body.domain })}`);
    if (!a.ok) err(a.message, /taken/.test(a.message) ? 409 : 400);
    if (!body.auth || !body.kdf || !body.key?.public_key) err('The key is missing.');
    if ('password' in body || 'wrap' in body) err('Send auth, never the password.');
    if (!body.accept) err('Accept the terms to continue.');
    const address = `${body.name.trim().toLowerCase()}@${body.domain}`;
    const k = body.key.own ? { id: 'k1', kind: 'own', alias: null, public_key: body.key.public_key, wrapped_key: null, iv: null, fingerprint: '', current: true, created: new Date().toISOString() }
      : { id: 'k1', kind: 'made_here', alias: null, ...body.key, fingerprint: '', current: true, created: new Date().toISOString() };
    if (body.recovery) { if (!body.recovery.rauth || !pgp.kdfOk(body.recovery.kdf) || !body.recovery.public_key || !body.recovery.wrapped_key) err('The recovery code is missing.');
      if (!body.key.own && !body.key.rcopy) err('Add the recovery copy of the new key.'); k.rcopy = body.key.rcopy || null; }
    await useScenario('new', { address, recovery_email: body.recovery_email ? { address: body.recovery_email, confirmed: false } : null, privacy_plus: !!body.privacy_plus,
      account: { kdf: body.kdf, auth: body.auth, keys: [k] } });
    if (body.recovery) { S.recovery = clone(body.recovery); save(); }
    S.waiting_for = body.domain === 'foldoy.com' ? 'server' : 'plan'; save();
    return session(S);
  }
  if (r === 'POST login') {
    let s = await state();
    const addr = (body.login || '').trim().toLowerCase();
    if (addr === ME.addr && s.address !== ME.addr) s = await useScenario('full');
    if (addr !== s.address || body.auth !== s.auth) err("That address and password don't match.", 401);
    if (s.two_factor && !codeOk(s, body.code)) err(body.code ? 'Wrong two-factor code.' : 'Type the code from your authenticator app.', 401, { two_factor: true });
    s.sessionOn = true; save(); return session(s);
  }
  if (r === 'POST logout') { const s = await state(); s.sessionOn = false; save(); return { ok: true, csrf_token: 'proto' }; }
  if (r === 'GET keys') {
    const s = await state(), X = await sample(), a = (q.address || '').toLowerCase();
    const own = s.keys.find(k => !k.stale && (a === s.address ? !k.alias : k.alias === a) && (k.alias ? true : k.current));
    const pk = own?.public_key || X.contacts[a] || (a === 'kari@foldoy.com' ? X.accounts.kari.keys[0].public_key : a === ME.addr ? X.accounts.mira.keys[0].public_key : null);
    if (!pk || (s.aliases.find(x => x.address === a && !x.active))) err('No key for that address.', 404);
    return { address: a, public_key: pk, fingerprint: await pgp.fingerprint(pk) };
  }

  const s = await state();
  if (!s.sessionOn) err('Sign in first.', 401);
  if (r === 'PUT recovery-code') {
    checkPw(s, body.auth, body.code);
    if (!body.rauth || !pgp.kdfOk(body.kdf) || !body.public_key || !body.wrapped_key || !body.iv) err('The recovery code could not be made.');
    const live = s.keys.filter(k => !k.stale && k.kind !== 'own');
    if (s.pp?.on && (body.keys || []).length) err('Recovery copies are off while privacy+ is on.');
    if (!s.pp?.on && !live.every(k => (body.keys || []).some(c => c.id === k.id && c.rcopy))) err('Send a recovery copy of every key.');
    for (const k of s.keys) k.rcopy = (body.keys.find(c => c.id === k.id) || {}).rcopy || null;
    s.recovery = { rauth: body.rauth, kdf: body.kdf, public_key: body.public_key, wrapped_key: body.wrapped_key, iv: body.iv }; save(); return recObj(s);
  }
  if (r === 'POST recovery-code' && parts[1] === 'unlock') {
    if (!s.recovery || body.rauth !== s.recovery.rauth) err('Wrong recovery code.', 400);
    return { recovery: { wrapped_key: s.recovery.wrapped_key, iv: s.recovery.iv }, keys: copiesOut(s) };
  }
  if (r === 'POST recovery-code' && parts[1] === 'restore') {
    if (!s.recovery || body.rauth !== s.recovery.rauth) err('Wrong recovery code.', 400);
    for (const x of body.keys || []) { const k = s.keys.find(y => y.id === x.id); if (k && k.stale) Object.assign(k, { wrapped_key: x.wrapped_key, iv: x.iv, stale: false, current: false }); }
    for (const c of body.rkeys || []) { const k = s.keys.find(y => y.id === c.id); if (k && !k.rcopy && c.rcopy) k.rcopy = c.rcopy; }
    save(); return recObj(s);
  }

  if (r === 'GET session') return session(s);
  if (r === 'GET contact-keys') return { armored: s.seen || null, entries: s.entries || [] };
  if (r === 'POST contact-keys') {
    s.entries ||= [];
    const changed = body.entries.filter(e => s.entries.some(x => x.id === e.id && x.armored !== e.armored));
    if (changed.length) { if (body.auth !== s.auth) err('A contact\'s key is recorded already. Changing it needs your password.', 409, { needs_password: true }); }
    for (const e of body.entries) { const i = s.entries.findIndex(x => x.id === e.id); if (i >= 0) s.entries[i] = e; else s.entries.push(e); }
    save(); return { ok: true, changed: changed.length };
  }
  if (r === 'PUT contact-keys') { s.seen = body.armored; save(); return { ok: true }; }
  s.snoozes ||= {}; s.blocked ||= []; s.custom ||= []; s.rules ||= []; s.scheduled ||= [];
  const sentOut = () => { s.scheduled = s.scheduled.filter(x => Date.parse(x.send_at) > Date.now()); };
  if (r === 'POST folders') {
    const name = (body.name || '').trim().replace(/\s+/g, ' ');
    if (!name) err('name is missing.');
    if ([...FOLDERS.map(f => f[1]), 'Starred', 'Snoozed', 'Scheduled', 'All mail', ...s.custom.map(f => f.name)].some(n => n.toLowerCase() === name.toLowerCase())) err('You have a folder with that name.');
    const id = `f${++s.seq}`; s.custom.push({ id, name }); save(); return { id };
  }
  if (r === 'PATCH folders') { const f = s.custom.find(x => x.id === parts[1]) || err('That folder is not one of yours.', 404); f.name = (body.name || '').trim() || f.name; save(); return { ok: true }; }
  if (r === 'DELETE folders') { for (const m of s.messages) if (m.folder === parts[1]) m.folder = 'archive'; s.custom = s.custom.filter(x => x.id !== parts[1]); s.rules = s.rules.filter(x => x.folder !== parts[1]); save(); return { ok: true }; }
  if (r === 'GET rules' || r === 'POST rules') {
    if (method === 'POST') {
      if (!['from', 'to'].includes(body.field) || !['move', 'star', 'read'].includes(body.action)) err('Pick what to look at and what to do.');
      if (!(body.value || '').trim()) err('value is missing.');
      if (body.action === 'move' && !['archive', 'junk', 'trash', ...s.custom.map(f => f.id)].includes(body.folder)) err('Pick a folder to move it to.');
      s.rules.push({ id: `r${++s.seq}`, field: body.field, value: body.value.trim().toLowerCase(), action: body.action, folder: body.action === 'move' ? body.folder : null }); save();
    }
    return s.rules;
  }
  if (r === 'DELETE rules') { s.rules = s.rules.filter(x => x.id !== parts[1]); save(); return { ok: true }; }
  if (r === 'POST autoreply') { if (body.enabled && !(body.text || '').trim()) err('Write the reply first.'); s.autoreply = { enabled: !!body.enabled, subject: body.subject || '', text: body.text || '', from: body.from || null, to: body.to || null }; save(); return session(s); }
  if (r === 'DELETE scheduled') { const x = s.scheduled.find(y => y.id === parts[1]) || err("That message isn't scheduled.", 404); const m = s.messages.find(y => y.id === x.msg_id); if (m) m.folder = 'drafts'; s.scheduled = s.scheduled.filter(y => y !== x); save(); return { ok: true, id: x.msg_id }; }
  if (r === 'POST locked') {
    if (!/^-----BEGIN PGP MESSAGE-----/.test((body.armored || '').trim())) err('Send the message encrypted in your browser.');
    if (![1, 7, 28].includes(body.days)) err('Pick how long it can be opened.');
    return { url: `${location.origin}/locked/demo${++s.seq}xxxxxxxxxxxxxxxxxxxx`, expires: new Date(Date.now() + body.days * 864e5).toISOString() };
  }
  const wake = () => { const now = Date.now(); for (const [id, z] of Object.entries(s.snoozes)) if (Date.parse(z.until) <= now) { const m = s.messages.find(x => x.id === id); if (m) { m.folder = z.back; m.unread = true; } delete s.snoozes[id]; } save(); };
  if (r === 'POST preferences') {
    if ('undo_seconds' in body && ![0, 5, 10, 20, 30].includes(body.undo_seconds)) err('Pick one of the times shown.');
    for (const k of ['signature', 'undo_seconds', 'threads']) if (k in body) s[k] = body[k];
    save(); return session(s);
  }
  if (r === 'GET blocked' || r === 'POST blocked') {
    if (method === 'POST') { const a = (body.address || '').trim().toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a)) err('That is not an email address.'); if (!s.blocked.some(b => b.address === a)) s.blocked.push({ id: `b${++s.seq}`, address: a, since: new Date().toISOString() }); save(); }
    return s.blocked.slice().sort((a, b) => a.address.localeCompare(b.address));
  }
  if (r === 'DELETE blocked') { s.blocked = s.blocked.filter(b => b.id !== parts[1]); save(); return { ok: true }; }
  if (parts[0] === 'messages' && parts[2] === 'snooze') {
    const m = s.messages.find(x => x.id === parts[1]) || err('That message is gone.', 404);
    if (method === 'DELETE') { if (s.snoozes[m.id]) s.snoozes[m.id].until = new Date(0).toISOString(); wake(); return { ok: true }; }
    if (!(Date.parse(body.until) > Date.now() + 60e3)) err('Pick a time later than now and within a year.');
    s.snoozes[m.id] = { until: body.until, back: m.folder === 'archive' ? 'inbox' : m.folder }; m.folder = 'archive'; m.unread = false; save(); return { ok: true, until: body.until };
  }
  if (parts[0] === 'messages' && parts[2] === 'unsubscribe') {
    const m = s.messages.find(x => x.id === parts[1]) || err('That message is gone.', 404);
    if (!m.unsubscribe) err("This message doesn't say how to unsubscribe.", 404);
    m.unsubscribed = true; save(); return m.unsubscribe.one_click ? { done: true } : { done: false, url: m.unsubscribe.url, mailto: m.unsubscribe.mailto };
  }
  if (r === 'GET folders' || r === 'GET messages') { wake(); sentOut(); }
  const sendersAnswer = demoSenders(s, r, method, parts, q, body); if (sendersAnswer !== undefined) { save(); return sendersAnswer; }
  if (r === 'GET messages' && parts.length === 1 && q.folder === 'scheduled') return { items: s.scheduled.slice().sort((a, b) => a.send_at.localeCompare(b.send_at)).map(x => { const m = s.messages.find(y => y.id === x.msg_id); return m && { ...pub(m), send_at: x.send_at, scheduled_id: x.id }; }).filter(Boolean), next: null };
  if (r === 'GET messages' && parts.length === 1 && (!q.folder || q.folder === 'inbox') && !q.q && s.blocked.length) {
    const stop = new Set(s.blocked.map(b => b.address)); for (const m of s.messages) if (m.folder === 'inbox' && stop.has(m.from.addr.toLowerCase())) m.folder = 'junk'; save();
  }
  const snz = m => (s.snoozes[m.id] ? { ...m, snoozed_until: s.snoozes[m.id].until } : m);
  if (r === 'GET messages' && parts.length === 1 && q.thread) return { items: s.messages.filter(m => m.thread_id === q.thread).sort((a, b) => a.date.localeCompare(b.date)).map(pub).map(snz), next: null };
  if (r === 'GET messages' && parts.length === 1 && q.folder === 'snoozed') return { items: s.messages.filter(m => s.snoozes[m.id]).sort((a, b) => s.snoozes[a.id].until.localeCompare(s.snoozes[b.id].until)).map(pub).map(snz), next: null };
  if (r === 'GET folders') return [...FOLDERS.map(([id, name]) => {
    const ms = s.messages.filter(m => m.folder === id);
    return { id, name, role: id, unread: ms.filter(m => m.unread).length, total: ms.length };
  }), { id: 'starred', name: 'Starred', role: 'starred', unread: 0, total: s.messages.filter(m => m.flagged && m.folder !== 'trash').length, view: true },
    ...(Object.keys(s.snoozes).length ? [{ id: 'snoozed', name: 'Snoozed', role: 'snoozed', unread: 0, total: Object.keys(s.snoozes).length, view: true }] : []),
    ...(s.scheduled.length ? [{ id: 'scheduled', name: 'Scheduled', role: 'scheduled', unread: 0, total: s.scheduled.length, view: true }] : []),
    ...(s.scr?.on ? [{ id: 'screener', name: 'Screener', role: 'screener', unread: 0, total: s.messages.filter(m => m.folder === 'screener').length }] : []),
    ...s.custom.map(f => { const ms = s.messages.filter(m => m.folder === f.id); return { id: f.id, name: f.name, role: null, unread: ms.filter(m => m.unread).length, total: ms.length }; }),
    { id: 'all', name: 'All mail', role: 'all', unread: 0, total: 0, view: true }];
  if (r === 'GET messages' && parts.length === 1) {
    let ms = q.folder === 'starred' ? s.messages.filter(m => m.flagged && m.folder !== 'trash')
      : q.folder === 'all' ? s.messages.filter(m => m.folder !== 'junk' && m.folder !== 'trash')
      : s.messages.filter(m => !q.folder || m.folder === q.folder);
    if (q.folder === 'archive') ms = ms.filter(m => !s.snoozes[m.id]);
    if (q.unread === '1') ms = ms.filter(m => m.unread);
    if (q.alias) ms = s.messages.filter(m => m.via_alias === q.alias);
    if (q.q) {
      const t = q.q.toLowerCase();
      ms = s.messages.filter(m => m.folder !== 'trash' && [m.from.name, m.from.addr, m.armored ? '' : m.subject, m.armored ? '' : m.text].join(' ').toLowerCase().includes(t));
    }
    ms = ms.slice().sort((a, b) => b.date.localeCompare(a.date));
    const at = +(q.cursor || 0), page = ms.slice(at, at + 50);
    return { items: page.map(pub), next: at + 50 < ms.length ? String(at + 50) : null };
  }
  const find = id => s.messages.find(m => m.id === id) || err('That message is gone.', 404);
  if (r === 'GET messages' && parts[2] === 'raw') {
    const m = find(parts[1]);
    const addr = p => (p.name ? `"${p.name}" <${p.addr}>` : p.addr);
    const head = `From: ${addr(m.from)}\r\nTo: ${m.to.map(addr).join(', ')}\r\nSubject: ${m.subject}\r\nDate: ${new Date(m.date).toUTCString()}\r\nMessage-ID: <${m.id}@foldoy.com>\r\nMIME-Version: 1.0\r\n`;
    const b = 'pgp' + m.id;
    const bodyTxt = m.armored
      ? `Content-Type: multipart/encrypted; protocol="application/pgp-encrypted"; boundary="${b}"\r\n\r\n--${b}\r\nContent-Type: application/pgp-encrypted\r\n\r\nVersion: 1\r\n\r\n--${b}\r\nContent-Type: application/octet-stream; name="encrypted.asc"\r\n\r\n${m.armored}\r\n--${b}--\r\n`
      : pgp.toMime({ text: m.text, html: m.html });
    return new Blob([head + bodyTxt], { type: 'message/rfc822' });
  }
  if (r === 'GET messages') {
    const m = find(parts[1]);
    return { ...pub(m), armored: m.armored || null, cc: m.cc || [], bcc: m.bcc || [], reply_to: null, text: m.armored ? null : m.text, html: m.armored ? null : (m.html || null),
      attachments: m.armored ? [] : (m.attachments || []).map(a => (a.b64 ? { ...a, b64: undefined, bytes: (b => () => Uint8Array.from(atob(b), c => c.charCodeAt(0)))(a.b64) } : a)), remote_images_blocked: 0, unsubscribe: m.unsubscribed ? null : (m.unsubscribe || null), snoozed_until: s.snoozes[m.id]?.until || null };
  }
  if (r === 'PATCH messages') { const m = find(parts[1]); for (const k of ['unread', 'flagged', 'folder']) if (k in body) m[k] = body[k]; save(); return pub(m); }
  if (r === 'DELETE messages') {
    const m = find(parts[1]);
    if (m.folder === 'trash') s.messages = s.messages.filter(x => x !== m); else m.folder = 'trash';
    save(); return {};
  }
  if (r === 'PUT drafts') {
    if (s.mailbox !== 'active') err('Your mailbox is being set up.', 409);
    if (!body.raw) err('Drafts are encrypted in your browser.');
    const id = parts[1] !== 'new' ? parts[1] : `m${++s.seq}`;
    s.messages = s.messages.filter(m => m.id !== id);
    const head = new TextDecoder().decode(pgp.unb64(body.raw));
    const unq = n => n.replace(/^"|"$/g, '').replace(/\\(.)/g, '$1').replace(/=\?UTF-8\?B\?([^?]*)\?=/gi, (_, x) => new TextDecoder().decode(pgp.unb64(x)));
    const to = ((head.match(/^To: (.*)$/m) || [])[1] || '').match(/("(?:[^"\\]|\\.)*"|=\?[^?]+\?B\?[^?]*\?=)\s*<[^>]+>|[^,\s]+/g)?.map(x => { const m = x.match(/^(.*)\s*<([^>]+)>$/); return m ? { name: unq(m[1].trim()), addr: m[2] } : { name: '', addr: x }; }) || [];
    s.messages.push({ id, thread_id: `t${id}`, folder: 'drafts', from: { name: s.display, addr: s.address }, to, cc: [], bcc: [], subject: '...', date: new Date().toISOString(),
      unread: false, flagged: false, via_alias: null, text: null, armored: pgp.armoredFromRaw(body.raw), arrival: 'e2e', attachments: [] });
    save(); return { id };
  }
  if (r === 'POST send') {
    if (s.mailbox !== 'active') err('Your mailbox is being set up.', 409);
    const P = x => (typeof x === 'string' ? { name: '', addr: x } : { name: x?.name || '', addr: x?.addr || '' });
    const toP = (body.to || []).map(P), ccP = (body.cc || []).map(P);
    const to = toP.map(x => x.addr), cc = ccP.map(x => x.addr), bcc = (body.bcc || []).map(x => P(x).addr), all = [...to, ...cc, ...bcc];
    if (!all.length) err('Add someone to send it to.');
    const froms = [s.address, ...s.aliases.filter(a => a.active).map(a => a.address), ...s.addresses.map(a => a.address)];
    if (body.from && !froms.includes(body.from)) err("You can't send from that address.", 403);
    if (s.plan === 'free' && body.from && s.aliases.some(a => a.address === body.from)) err('Aliases on the free plan receive mail only. Send from your address, or move to foldoy+.', 403);
    if (s.used >= PLANS[s.plan].quota) err('Your mailbox is full. Delete some mail or move to a bigger plan.', 507);
    if (!body.raw && all.some(a => FOLDOY.test(a))) err('Mail to foldoy addresses must be encrypted in your browser.');
    if (body.draft_id) s.messages = s.messages.filter(m => m.id !== body.draft_id);
    const reply = body.in_reply_to && s.messages.find(m => m.id === body.in_reply_to);
    const id = `m${++s.seq}`;
    const base = { thread_id: reply ? reply.thread_id : `t${id}`, from: { name: s.display, addr: body.from || s.address }, to: toP,
      cc: ccP, bcc: [], date: new Date().toISOString(), flagged: false, attachments: [], text: null };
    const armored = body.raw ? pgp.armoredFromRaw(body.raw) : body.sent_copy ? pgp.armoredFromRaw(body.sent_copy) : null;
    if (!body.raw && !armored) { s.messages.push({ ...base, id, folder: 'sent', unread: false, subject: body.subject, text: body.text, arrival: 'plain', via_alias: null }); save(); return { id }; }
    if (!(body.raw && s.messages.some(m => m.folder === 'sent' && m.date === base.date))) s.messages.push({ ...base, id, folder: 'sent', unread: false, subject: '...', armored, arrival: 'e2e', via_alias: null });
    if (body.raw) for (const a of all) {
      const alias = s.aliases.find(x => x.address === a), extraA = s.addresses.find(x => x.address === a);
      if (a !== s.address && !alias && !extraA) continue;
      if (alias && !alias.active) { alias.blocked++; continue; }
      if (alias) alias.received++;
      s.messages.push({ ...base, id: `m${++s.seq}`, folder: 'inbox', unread: true, subject: '...', armored, arrival: 'e2e', via_alias: alias ? alias.address : null });
    }
    if (body.send_at) {
      if (!(Date.parse(body.send_at) > Date.now() + 120e3) || Date.parse(body.send_at) > Date.now() + 7 * 864e5) err('Pick a time from a few minutes from now to a week ahead.');
      const sentId = s.messages.filter(m => m.folder === 'sent').sort((a, b) => b.date.localeCompare(a.date))[0]?.id || id;
      s.scheduled.push({ id: `sc${++s.seq}`, msg_id: sentId, send_at: body.send_at });
    }
    s.used += 4000; save(); return { id, send_at: body.send_at || null };
  }
  if (r === 'POST attachments') {
    if (body.size > 20e6) err('Files can be up to 20 MB.', 413);
    if (s.used + body.size > PLANS[s.plan].quota) err('Your mailbox is full. Delete some mail or move to a bigger plan.', 507);
    return { id: `f${++s.seq}`, name: body.name, size: body.size, type: body.type || 'application/octet-stream' };
  }
  if (r === 'GET aliases') return s.aliases.map(({ created_ago, ...a }) => a);
  if (r === 'POST aliases') {
    const limit = PLANS[s.plan].alias_limit;
    if (s.aliases.length >= limit) err(`Your plan holds ${limit} aliases.`, 400);
    if (!body.key?.public_key) err('The alias key is missing.');
    const domain = body.domain || s.address.split('@')[1];
    let name = (body.name || '').trim().toLowerCase();
    if (!name) { const A = 'abcdefghijkmnpqrstuvwxyz23456789', pick = n => Array.from({ length: n }, () => A[Math.floor(Math.random() * A.length)]).join(''); name = `${pick(6)}.${pick(4)}`; }
    const p = nameProblem(name);
    if (p) err(p[1]);
    const address = `${name}@${domain}`;
    if (s.aliases.some(a => a.address === address) || TAKEN.has(name)) err('That address is taken.');
    const a = { id: `a${++s.seq}`, address, note: (body.note || '').trim(), active: true, permanent: s.plan === 'free', created: new Date().toISOString(), received: 0, blocked: 0 };
    s.aliases.unshift(a); s.keys.push(keyRow(s, body.key, address)); save(); return a;
  }
  const al = () => s.aliases.find(a => a.id === parts[1]) || err('That alias is gone.', 404);
  if (r === 'PUT aliases' && parts[2] === 'key') { const a = al(); if (s.keys.some(k => k.alias === a.address && !k.stale)) err('That alias has a working key.', 409); s.keys.push(keyRow(s, body.key, a.address)); save(); return { ok: true }; }
  if (r === 'PATCH aliases') { const a = al(); for (const k of ['active', 'note']) if (k in body) a[k] = body[k]; save(); return a; }
  if (r === 'DELETE aliases') { const a = al(); if (s.plan === 'free') err('Aliases on the free plan are permanent. Turn it off instead.', 400); s.aliases = s.aliases.filter(x => x !== a); save(); return {}; }
  if (r === 'GET addresses') return s.addresses;
  if (r === 'POST addresses') {
    const lim = PLANS[s.plan].addresses;
    if (!lim) err('Extra addresses come with Polar.', 403);
    if (s.addresses.length >= lim) err(`Your plan holds ${lim} extra addresses.`, 400);
    const c = await standIn('GET', `check?${qs({ name: body.name, domain: body.domain })}`);
    if (!c.ok) err(c.message);
    const a = { id: `ad${++s.seq}`, address: `${body.name}@${body.domain}`, created: new Date().toISOString() };
    s.addresses.push(a); s.keys.push(keyRow(s, body.key, a.address)); save(); return a;
  }
  if (r === 'DELETE addresses') { s.addresses = s.addresses.filter(a => a.id !== parts[1]); save(); return { ok: true }; }
  if (r === 'GET domains') return s.domains;
  if (r === 'POST domains' && parts.length === 1) {
    const lim = PLANS[s.plan].domains;
    if (!lim) err('Custom domains come with foldoy+.', 403);
    if (s.domains.length >= lim) err(`${s.plan === 'polar' ? 'Polar' : 'foldoy+'} has ${lim} custom domain${lim > 1 ? 's' : ''}.`, 403);
    const d = (body.domain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(d)) err('Type a domain like example.com.');
    if (FOLDOY.test('x@' + d) || s.domains.some(x => x.domain === d)) err('That domain is already in use.');
    const x = { id: `d${++s.seq}`, domain: d, status: 'unverified', created: new Date().toISOString(), records: dnsRecords(d), checks: 0 };
    s.domains.push(x); save(); return x;
  }
  if (r === 'POST domains' && parts[2] === 'verify') {
    const d = s.domains.find(x => x.id === parts[1]) || err('That domain is gone.', 404);
    d.checks = (d.checks || 0) + 1;
    for (const x of d.records) x.ok = x.purpose === 'DKIM' ? null : x.purpose === 'DMARC' ? d.checks >= 2 : true;
    d.status = 'verified';
    save(); return d;
  }
  if (r === 'GET plans') return { plans: Object.entries(PLANS).map(([id, p]) => ({ id, name: { free: 'Free', plus: 'foldoy+', polar: 'Polar' }[id], prices: id === 'free' ? null : { month: id === 'plus' ? '4.00' : '7.00', year: id === 'plus' ? '36.00' : '69.00' },
    storage_gb: p.quota / 1e9, aliases: p.alias_limit, aliases_permanent: id === 'free', aliases_send: id !== 'free', custom_domains: p.domains, extra_addresses: p.addresses, cashback_percent: p.cashback })) };
  if (r === 'GET plans') return { plans: Object.entries(PLANS).map(([id, p]) => ({ id, name: { free: 'Free', plus: 'foldoy+', polar: 'Polar' }[id], prices: id === 'free' ? null : { month: id === 'plus' ? '4.00' : '7.00', year: id === 'plus' ? '36.00' : '69.00' },
    storage_gb: p.quota / 1e9, aliases: p.alias_limit, aliases_permanent: id === 'free', aliases_send: id !== 'free', custom_domains: p.domains, extra_addresses: p.addresses, cashback_percent: p.cashback })) };
  if (r === 'GET activity') return { rows: s.plan === 'free' ? [] : [
    { date: iso(2 * 60), what: 'Deposit, Bitcoin', usd: '10.00', status: 'Payment seen', href: '/account/deposit/' },
    { date: iso(18 * 1440), what: 'foldoy+, a month', usd: '-4.00', status: '', href: '' },
    { date: iso(18 * 1440 + 30), what: 'Added funds, Monero', usd: '+20.00', status: '', href: '' }] };
  if (r === 'DELETE domains') { s.domains = s.domains.filter(x => x.id !== parts[1]); save(); return { ok: true }; }
  if (r === 'DELETE privacy-plus') {
    checkPw(s, body.auth, body.code);
    if (!s.pp?.on) err('privacy+ is off already.', 409);
    if (body.pauth !== s.pp.pauth) err('Your privacy+ key is wrong.', 403);
    const live = s.keys.filter(k => !k.stale && k.wrapped_key);
    if (!live.every(k => (body.keys || []).some(x => x.id === k.id && x.wrapped_key))) err('Send every key, wrapped with your password again.');
    if (s.recovery && !live.every(k => (body.rkeys || []).some(x => x.id === k.id && x.rcopy))) err('Send a recovery copy of every key.');
    for (const x of body.keys) { const k = s.keys.find(y => y.id === x.id); if (k) Object.assign(k, { wrapped_key: x.wrapped_key, iv: x.iv }); }
    for (const x of body.rkeys || []) { const k = s.keys.find(y => y.id === x.id); if (k) k.rcopy = x.rcopy; }
    s.pp = null; save(); return ppObj(s);
  }
  if (r === 'PUT privacy-plus') {
    checkPw(s, body.auth, body.code);
    if (!body.own) {
      if (s.pp?.on) err('privacy+ is on already.', 409);
      if (!body.pauth || !pgp.kdfOk(body.kdf) || body.pauth === body.auth) err('Send every key, wrapped with your privacy+ key.');
      const live = s.keys.filter(k => !k.stale && k.wrapped_key);
      if (!live.every(k => (body.keys || []).some(x => x.id === k.id && x.wrapped_key))) err('Send every key, wrapped with your privacy+ key.');
      if (s.keys.some(k => k.stale && k.rcopy)) err('Open your older mail with your recovery code first.', 409);
      for (const x of body.keys) { const k = s.keys.find(y => y.id === x.id); if (k) Object.assign(k, { wrapped_key: x.wrapped_key, iv: x.iv }); }
      for (const k of s.keys) k.rcopy = null;
      s.pp = { on: true, pauth: body.pauth, kdf: body.kdf }; save(); return ppObj(s);
    }
    if (body.own) {
      if (!body.public_key) err('The key is missing.');
      for (const k of s.keys) if (!k.alias) k.current = false;
      s.keys.unshift({ id: `k${++s.seq}`, kind: 'own', alias: null, public_key: body.public_key, wrapped_key: null, iv: null, fingerprint: '', current: true, created: new Date().toISOString() });
      save(); return clone(s.privacy_plus);
    }
    save(); return ppObj(s);
  }
  if (r === 'PUT key') {
    checkPw(s, body.auth, body.code);
    if (body.own) {
      if (!body.public_key) err('The key is missing.');
      for (const k of s.keys) if (!k.alias) k.current = false;
      s.keys.unshift({ id: `k${++s.seq}`, kind: 'own', alias: null, public_key: body.public_key, wrapped_key: null, iv: null, fingerprint: '', current: true, created: new Date().toISOString() });
      save(); return session(s);
    }
    if (!body.key?.public_key || !body.key?.wrapped_key) err('The key is missing.');
    for (const k of s.keys) if (!k.alias) k.current = false;
    s.keys.unshift(keyRow(s, body.key, null)); s.kdf = body.kdf || s.kdf; s.auth = body.auth || s.auth;
    save(); return session(s);
  }
  if (r === 'PUT recovery-email') {
    checkPw(s, body.auth, body.code);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email || '')) err('Check the email address.');
    if (FOLDOY.test(body.email)) err('Use an address outside foldoy.');
    s.recovery_email = { address: body.email, confirmed: false }; save();
    return { ...s.recovery_email, sent: true, message: `We sent a 6-digit code to ${body.email}.` };
  }
  if (r === 'POST recovery-email') {
    if (!s.recovery_email) err('Add a recovery email first.');
    if (body.code !== DEMO_CODE) err("That code doesn't match. Check the latest email.");
    s.recovery_email.confirmed = true; save(); return { ...s.recovery_email, message: 'Confirmed.' };
  }
  if (r === 'DELETE recovery-email') { checkPw(s, body.auth, body.code); s.recovery_email = null; save(); return { address: null, confirmed: false }; }
  if (r === 'GET two-factor') return { enabled: !!s.two_factor, recovery_left: (s.recovery_codes || []).length, available: true };
  if (r === 'POST two-factor') {
    if (parts[1] === 'setup') {
      checkPw(s, body.auth);
      if (s.two_factor) err('Two-factor is already on.', 409);
      const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
      s.tfSecret = Array.from({ length: 8 }, () => Array.from({ length: 4 }, () => A[Math.floor(Math.random() * 32)]).join('')).join(' ');
      save();
      return { secret: s.tfSecret, otpauth_uri: `otpauth://totp/foldoy:${encodeURIComponent(s.address)}?secret=${s.tfSecret.replace(/ /g, '')}&issuer=foldoy`, qr_svg: fakeQr(s.tfSecret) };
    }
    if (parts[1] === 'confirm') {
      checkPw(s, body.auth);
      if (!s.tfSecret) err('Start again.');
      if ((body.code || '').trim() !== DEMO_TOTP) err('Wrong code.');
      s.two_factor = true; s.tfSecret = null; s.recovery_codes = RCODES(); save();
      return { enabled: true, recovery_codes: s.recovery_codes.slice() };
    }
    if (parts[1] === 'recovery-codes') { checkPw(s, body.auth, body.code); s.recovery_codes = RCODES(); save(); return { recovery_codes: s.recovery_codes.slice() }; }
  }
  if (r === 'DELETE two-factor') { checkPw(s, body.auth, body.code); s.two_factor = false; s.recovery_codes = []; save(); return { enabled: false }; }
  if (r === 'GET sessions') return s.sessions;
  if (r === 'DELETE sessions') { const me = s.sessions.find(x => x.id === parts[1]); s.sessions = s.sessions.filter(x => x.id !== parts[1]); save(); return { ok: true, signed_out: !!me?.current }; }
  if (r === 'POST sessions') { s.sessions = s.sessions.filter(x => x.current); save(); return { ok: true }; }
  if (r === 'POST appearance') {
    if ('accent' in body) { if (!['blue', 'teal', 'mint', 'violet', 'pink', 'red', 'orange', 'yellow', 'graphite'].includes(body.accent)) err('Pick one of the colours shown.'); s.accent = body.accent; }
    if ('theme' in body) { if (!['dark', 'black', 'light', 'system'].includes(body.theme)) err('Pick one of the themes shown.'); s.theme = body.theme; }
    if ('display' in body) { const n = String(body.display || ''); if (n.length > 64 || /[\r\n\t<>"@]/.test(n)) err('Use up to 64 letters, spaces and ordinary punctuation.'); s.display = n.trim().replace(/\s+/g, ' '); }
    save(); return session(s);
  }
  if (r === 'GET import') return { job: null };
  if (r === 'GET export') return { job: null };
  if (r === 'GET switch' || r === 'POST switch') { s.switchDone ||= []; if (body) { s.switchDone = s.switchDone.filter(x => x !== body.item); if (body.done) s.switchDone.push(body.item); save(); } return { done: s.switchDone }; }
  if (r === 'GET app-passwords') err('Not found.', 404);
  if (r === 'POST password') {
    checkPw(s, body.current_auth, body.code);
    const working = s.keys.filter(k => k.kind === 'made_here' && !k.stale);
    if (!body.new_auth || !body.kdf || !Array.isArray(body.keys) || (!s.pp?.on && working.some(k => !body.keys.find(x => x.id === k.id && x.wrapped_key && x.iv)))) err('Every key has to be wrapped again.');
    for (const x of body.keys) { const k = s.keys.find(y => y.id === x.id); if (k) Object.assign(k, { wrapped_key: x.wrapped_key, iv: x.iv }); }
    s.auth = body.new_auth; s.kdf = body.kdf;
    s.sessions = s.sessions.filter(x => x.current); save(); return { ok: true, message: 'Password changed.', csrf_token: 'proto' };
  }
  if (r === 'DELETE account') { checkPw(s, body.auth, body.code); localStorage.removeItem(KEY); S = null; return { ok: true }; }
  err('Not in the demo: this needs a real account.', 404);
}

const ago = days => new Date(Date.now() - days * 864e5).toISOString();
function demoMoving() {
  const row = (id, name, domain, messages, old, nw, state, by_hand = false) => ({ id, name, domain, messages, last_old: ago(old), last_new: nw == null ? null : ago(nw), state, by_hand });
  return [row('mv1', 'Havbanken', 'havbanken.example', 14, 2, null, 'old'), row('mv2', 'Strømly', 'stromly.example', 23, 1, null, 'old'),
    row('mv3', 'Lillevik skole', 'lillevik-skole.example', 8, 5, null, 'old'), row('mv4', 'Brekkevik Sykkel', 'brekkevik-sykkel.example', 6, 9, null, 'old'),
    row('mv5', 'Nordvik Energi', 'nordvik-energi.example', 11, 40, 3, 'moved'), row('mv6', 'Apotek Nord', 'apoteknord.example', 4, 20, null, 'moved', true),
    row('mv7', 'Kvikk Levering', 'kvikk.example', 31, 6, null, 'ignored')];
}
function movingView(s) {
  const order = { old: 0, moved: 1, ignored: 2 };
  const list = s.mv.slice().sort((a, b) => order[a.state] - order[b.state] || b.last_old.localeCompare(a.last_old));
  const n = k => list.filter(x => x.state === k).length;
  return { scan: { status: 'done', scanned: 18342, started: ago(1), finished: ago(1) }, services: list, left: n('old'), done: n('moved'), ignored: n('ignored') };
}
function screenerView(s) {
  const sc = s.scr;
  if (!sc?.on) return { on: false, ready: false, looked: 0, since: null, known: 0, domains: [], waiting: [] };
  const by = new Map();
  for (const m of s.messages.filter(x => x.folder === 'screener').sort((a, b) => b.date.localeCompare(a.date))) {
    const a = m.from.addr.toLowerCase(); if (!by.has(a)) by.set(a, { address: a, name: m.from.name || '', domain: a.split('@')[1].split('.').slice(-2).join('.'), count: 0, newest: { ...pub(m), folder: 'screener' } });
    by.get(a).count++;
  }
  return { on: true, ready: true, looked: s.messages.length, since: sc.since, known: sc.known.length, domains: sc.domains, waiting: [...by.values()] };
}
function demoSenders(s, r, method, parts, q, body) {
  if (r === 'GET moving' || r === 'POST moving') { s.mv ||= demoMoving(); return movingView(s); }
  if (r === 'PATCH moving') {
    s.mv ||= demoMoving();
    const x = s.mv.find(y => y.id === parts[1]) || err("That service isn't on your list.", 404);
    if (!['done', 'ignored', ''].includes(body.mark)) err('Pick done, ignored or neither.');
    x.by_hand = body.mark === 'done'; x.state = body.mark === 'done' ? 'moved' : body.mark === 'ignored' ? 'ignored' : (x.last_new && x.last_new > x.last_old ? 'moved' : 'old');
    return movingView(s);
  }
  if (r === 'GET screener') return screenerView(s);
  if (r === 'PUT screener') {
    if (body.on && !s.scr?.on) {
      const known = new Set(); for (const m of s.messages) { known.add(m.from.addr.toLowerCase()); for (const p of m.to || []) known.add(p.addr.toLowerCase()); }
      s.scr = { on: true, since: new Date().toISOString(), known: [...known], domains: [] };
      const arrive = (from, subject, text, mins) => s.messages.push({ id: `m${++s.seq}`, thread_id: `t${s.seq}`, folder: 'screener', from, to: [{ name: s.display, addr: s.address }], cc: [], bcc: [],
        subject, text, date: new Date(Date.now() - mins * 6e4).toISOString(), unread: true, flagged: false, via_alias: null, arrival: 'plain', attachments: [] });
      arrive({ name: 'Riverside Tannlege', addr: 'booking@riverside-tannlege.example' }, 'Your appointment on Thursday at 10:30', 'Hello Mira,\n\nThis confirms your check-up on Thursday at 10:30.\n\nRiverside Tannlege', 4);
      arrive({ name: 'Bylet Parkering', addr: 'no-reply@app.bylet.example' }, 'Your sign-in code is 482 913', 'Your sign-in code is 482 913. It works for 10 minutes.', 1);
    }
    if (body.on === false && s.scr?.on) { for (const m of s.messages) if (m.folder === 'screener') m.folder = 'inbox'; s.scr = null; }
    return screenerView(s);
  }
  if (r === 'POST screener') {
    if (!s.scr?.on) err('The screener is off.');
    const a = (body.address || '').toLowerCase(), dom = (a.split('@')[1] || '').split('.').slice(-2).join('.');
    if (!['yes', 'no'].includes(body.answer)) err('Answer yes or no.');
    if (body.domain && body.answer === 'no') err('A whole domain can be let in, not blocked.');
    if (body.answer === 'no') { s.blocked ||= []; if (!s.blocked.some(b => b.address === a)) s.blocked.push({ id: `b${++s.seq}`, address: a, since: new Date().toISOString() }); }
    else if (body.domain) { if (!s.scr.domains.some(d => d.domain === dom)) s.scr.domains.push({ id: `d${++s.seq}`, domain: dom }); }
    else s.scr.known.push(a);
    let moved = 0;
    for (const m of s.messages) {
      const f = m.from.addr.toLowerCase();
      const fd = f.split('@')[1] || '';
      if (m.folder === 'screener' && (f === a || (body.domain && (fd === dom || fd.endsWith('.' + dom))))) { m.folder = body.answer === 'yes' ? 'inbox' : 'junk'; moved++; }
    }
    return { ...screenerView(s), moved };
  }
  if (r === 'DELETE screener') {
    if (!s.scr?.on) err("That domain isn't on your list.", 404);
    s.scr.domains = s.scr.domains.filter(d => d.id !== parts[2]); return screenerView(s);
  }
  if (r === 'GET messages' && parts.length === 1 && q.folder === 'inbox' && !q.q && s.scr?.on) {
    const known = new Set(s.scr.known), doms = s.scr.domains.map(d => d.domain);
    for (const m of s.messages) {
      const a = m.from.addr.toLowerCase();
      const ad = a.split('@')[1] || '';
      if (m.folder === 'inbox' && m.date > s.scr.since && !known.has(a) && !doms.some(d => ad === d || ad.endsWith('.' + d)) && !FOLDOY.test(a)) m.folder = 'screener';
    }
  }
  if (r === 'PATCH messages' && body?.folder === 'inbox' && s.scr?.on) { const m = s.messages.find(x => x.id === parts[1]); if (m?.folder === 'screener') s.scr.known.push(m.from.addr.toLowerCase()); }
  return undefined;
}

function session(s) {
  const P0 = PLANS[s.plan];
  return { address: s.address, login: s.address, display: s.display, plan: s.plan, mailbox: s.mailbox, waiting_for: s.mailbox === 'pending' ? (s.waiting_for || 'server') : null,
    mail_hosts: null, alias_count: s.aliases.length, balance_usd: s.balance_usd, two_factor: !!s.two_factor, csrf_token: 'proto', accent: s.accent || 'blue', theme: s.theme || 'dark',
    signature: s.signature || '', undo_seconds: s.undo_seconds ?? 10, threads: s.threads ?? true,
    plans_open: true,
    deposits_open: true,
    autoreply: { enabled: false, subject: '', text: '', from: null, to: null, ...(s.autoreply || {}) },
    plan_detail: { plan: s.plan, period: s.plan === 'free' ? null : 'month', price_usd: { free: null, plus: '4.00', polar: '7.00' }[s.plan], renews_at: s.plan === 'free' ? null : iso(-18 * 1440),
      status: s.plan === 'free' ? null : 'active', cashback_percent: P0.cashback, alias_limit: P0.alias_limit, aliases_send: s.plan !== 'free',
      custom_domain_limit: P0.domains, extra_address_limit: P0.addresses, storage: { used_bytes: s.used || 0, quota_bytes: P0.quota } },
    recovery_email: s.recovery_email || { address: null, confirmed: false }, privacy_plus: ppObj(s),
    e2e: true, kdf: s.kdf, keys: clone(s.keys).map(k => { const has = !!k.rcopy; delete k.rcopy; return { ...k, recovery: has }; }),
    recovery: recObj(s) };
}
