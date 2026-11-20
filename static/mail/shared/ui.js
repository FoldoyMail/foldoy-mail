
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const P = {
  check: '<path d="M4.5 10.5l3.5 3.5 7.5-8"/>',
  search: '<circle cx="9" cy="9" r="5.5"/><path d="M13.2 13.2L17 17"/>',
  write: '<path d="M4 16l1-4 8.5-8.5a2.1 2.1 0 013 3L8 15l-4 1z"/>',
  back: '<path d="M12.5 4.5L7 10l5.5 5.5"/>',
  next: '<path d="M7.5 4.5L13 10l-5.5 5.5"/>',
  reply: '<path d="M8 5L3.5 9.5 8 14"/><path d="M3.5 9.5H12a4.5 4.5 0 014.5 4.5v1"/>',
  replyall: '<path d="M10 5L5.5 9.5 10 14"/><path d="M6 5L1.5 9.5 6 14"/><path d="M5.5 9.5H13a4.5 4.5 0 014.5 4.5v1"/>',
  forward: '<path d="M12 5l4.5 4.5L12 14"/><path d="M16.5 9.5H8A4.5 4.5 0 003.5 14v1"/>',
  archive: '<rect x="3" y="4" width="14" height="4" rx="1.2"/><path d="M4.5 8v7a1 1 0 001 1h9a1 1 0 001-1V8M8 11h4"/>',
  trash: '<path d="M4 6h12M8 6V4.5h4V6M5.5 6l.8 10h7.4l.8-10"/>',
  flag: '<path d="M5 17V3.5M5 4h9l-2 3.5 2 3.5H5"/>',
  star: '<path d="M10 3.2l2 4.3 4.6.5-3.4 3.1 1 4.6L10 13.4l-4.2 2.3 1-4.6-3.4-3.1 4.6-.5z"/>',
  allmail: '<path d="M3.5 8h13v8a.5.5 0 01-.5.5H4a.5.5 0 01-.5-.5V8z"/><path d="M5 5.5h10M6.5 3h7"/>',
  square: '<rect x="4" y="4" width="12" height="12" rx="3"/>',
  squarecheck: '<rect x="4" y="4" width="12" height="12" rx="3"/><path d="M7 10.2l2.1 2.1L13.2 8"/>',
  mailclosed: '<rect x="3.5" y="5" width="13" height="10" rx="1"/><path d="M3.5 6l6.5 5 6.5-5"/>',
  mailopen: '<path d="M3.5 8.5L10 4l6.5 4.5V16a.5.5 0 01-.5.5H4a.5.5 0 01-.5-.5V8.5z"/><path d="M3.5 8.5L10 13l6.5-4.5"/>',
  dot: '<circle cx="10" cy="10" r="3.5"/>',
  clip: '<path transform="rotate(40 10 10)" d="M13.6 7v6.4a3.6 3.6 0 01-7.2 0V5.9a2.4 2.4 0 014.8 0v7.3a1.2 1.2 0 01-2.4 0V7.3"/>',
  close: '<path d="M5 5l10 10M15 5L5 15"/>',
  download: '<path d="M10 3.5v9M6.5 9L10 12.5 13.5 9M4 15.5h12"/>',
  copy: '<rect x="7" y="7" width="9" height="9" rx="2"/><path d="M13 7V5.5A1.5 1.5 0 0011.5 4h-6A1.5 1.5 0 004 5.5v6A1.5 1.5 0 005.5 13H7"/>',
  menu: '<path d="M3.5 6h13M3.5 10h13M3.5 14h13"/>',
  down: '<path d="M10 4v11M5.5 10.5L10 15l4.5-4.5"/>',
  refresh: '<path d="M15.6 10a5.6 5.6 0 11-1.7-4"/><path d="M15.8 3.6v3.5h-3.5"/>',
  plus: '<path d="M10 4v12M4 10h12"/>',
  addfunds: '<circle cx="10" cy="10" r="6.5"/><path d="M10 7v6M7 10h6"/>',
  plans: '<path d="M10 3.5l6.5 3.3L10 10.1 3.5 6.8z"/><path d="M3.5 10.2l6.5 3.3 6.5-3.3M3.5 13.4l6.5 3.3 6.5-3.3"/>',
  home: '<path d="M3.5 9L10 3.5 16.5 9"/><path d="M5 8v8a.5.5 0 00.5.5H8.5V12h3v4.5h3a.5.5 0 00.5-.5V8"/>',
  inbox: '<path d="M3 11l2-6.5h10L17 11v4.5a1 1 0 01-1 1H4a1 1 0 01-1-1V11z"/><path d="M3 11h4l1 2h4l1-2h4"/>',
  drafts: '<path d="M5 3.5h7l3 3V16a.5.5 0 01-.5.5h-9.5A.5.5 0 014.5 16V4a.5.5 0 01.5-.5z"/><path d="M7.5 10h5M7.5 13h3"/>',
  sent: '<path d="M3 10l14-6-5 13-2.5-5.5L3 10z"/><path d="M9.5 11.5L17 4"/>',
  junk: '<circle cx="10" cy="10" r="6.5"/><path d="M5.5 14.5l9-9"/>',
  at: '<circle cx="10" cy="10" r="3"/><path d="M13 10v1.2a2.3 2.3 0 004.5 0V10A7.5 7.5 0 1014 16"/>',
  gear: '<circle cx="10" cy="10" r="2.6"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4"/>',
  key: '<circle cx="7" cy="12.5" r="3.5"/><path d="M9.5 10L16 3.5M13.5 6l2 2M12 7.5l1.5 1.5"/>',
  out: '<path d="M8 4H5a1 1 0 00-1 1v10a1 1 0 001 1h3M12 6.5L15.5 10 12 13.5M15.5 10H8"/>',
  more: '<circle cx="5" cy="10" r=".9"/><circle cx="10" cy="10" r=".9"/><circle cx="15" cy="10" r=".9"/>',
  clock: '<circle cx="10" cy="10" r="6.5"/><path d="M10 6.5V10l2.5 1.6"/>',
  folder: '<path d="M3 6.5A1.5 1.5 0 014.5 5h3.2l1.6 1.8h6.2A1.5 1.5 0 0117 8.3v6.2a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 013 14.5z"/>',
  bell: '<path d="M6 13.5V9a4 4 0 018 0v4.5l1.5 1.5h-11z"/><path d="M8.5 16.5a1.6 1.6 0 003 0"/>',
  shield: '<path d="M10 2.5l6 2.2v4.6c0 3.8-2.6 6.7-6 8.2-3.4-1.5-6-4.4-6-8.2V4.7z"/>',
  lock: '<rect x="5" y="9" width="10" height="7.5" rx="1.5"/><path d="M7.5 9V7a2.5 2.5 0 015 0v2"/>',
  block: '<circle cx="10" cy="10" r="6.5"/><path d="M6.5 10h7"/>',
  screener: '<circle cx="10" cy="7" r="3"/><path d="M4.5 16.5a5.5 5.5 0 0111 0"/>',
  unread: '<rect x="3" y="5" width="14" height="10.5" rx="1.5"/><path d="M3.5 6l6.5 5 6.5-5"/>',
};
export const icon = (n, cls = 'i') => `<svg class="${cls}" viewBox="0 0 20 20" aria-hidden="true">${P[n] || ''}</svg>`;

let tt = 0;
let lastUndo = null, lastUndoUntil = 0;
const undoing = f => async () => { lastUndo = null; toast('Undone'); await f(); };
export function takeUndo() { const f = Date.now() < lastUndoUntil ? lastUndo : null; lastUndo = null; return f ? undoing(f) : null; }
export function toast(text, action, ms) {
  lastUndo = action && action.label === 'Undo' ? action.run : null; lastUndoUntil = Date.now() + (ms || 8000);
  let t = $('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
  t.innerHTML = `<span>${esc(text)}</span>${action ? `<button class="ta" type="button">${esc(action.label)}</button>` : ''}<button class="tx" type="button" aria-label="Dismiss" title="Dismiss"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>`;
  t.querySelector('.tx').onclick = () => { clearTimeout(tt); t.classList.remove('on'); lastUndo = null; };
  if (action) t.querySelector('.ta').onclick = action.label === 'Undo' ? undoing(action.run) : () => { t.classList.remove('on'); lastUndo = null; action.run(); };
  const pane = document.getElementById('pane'), fab = document.querySelector('.fab');
  const fr = fab && getComputedStyle(fab).display !== 'none' ? fab.getBoundingClientRect() : null;
  const desk = matchMedia('(min-width: 1024px), (hover: hover)').matches;
  const pr = !desk && pane && innerWidth > 760 && getComputedStyle(pane).display !== 'none' ? pane.getBoundingClientRect() : null;
  t.style.left = pr ? `${pr.left + pr.width / 2}px` : '';
  t.style.bottom = fr ? `${innerHeight - fr.top + 16}px` : pr ? `${innerHeight - pr.bottom + 20}px` : '';
  if (desk) { t.style.left = ''; t.style.bottom = ''; }
  requestAnimationFrame(() => t.classList.add('on'));
  clearTimeout(tt); tt = setTimeout(() => t.classList.remove('on'), ms || (action ? 6000 : 3200));
}

const LETTERED = ['foldoy.com', 'veil.no'];
export const artFor = (name, domain) => `/static/mail/shared/art/${name}-${LETTERED.includes(domain) ? domain : 'blank'}.svg`;

export const FREE_DOMAIN = document.querySelector('meta[name="foldoy-free-domain"]')?.content || 'foldoy.com';
export const FREE_DOMAINS = [...new Set([FREE_DOMAIN, ...(document.querySelector('meta[name="foldoy-free-domains"]')?.content || '').split(',').map(d => d.trim()).filter(Boolean)])];
export const DOMAINS = [
  ...FREE_DOMAINS.map(d => ({ d, plan: 'Free' })),
  ...['veil.no'].filter(d => !FREE_DOMAINS.includes(d)).map(d => ({ d, plan: 'foldoy+' })),
];

export function picker(host, { name = '', domain = FREE_DOMAIN, domains = DOMAINS, note = '', placeholder = 'yourname', label = 'Name', onChange = () => {}, onPreview = () => {} } = {}) {
  const id = 'p' + Math.random().toString(36).slice(2, 7);
  host.innerHTML = `
    <div class="field pick-field">
      <input id="${id}" name="name" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="32" placeholder="${esc(placeholder)}" value="${esc(name)}" aria-label="${esc(label)}">
      <span class="mirror" aria-hidden="true"></span>
      <button class="dom" type="button" aria-haspopup="listbox" aria-expanded="false" aria-controls="${id}-m"><span class="dv">@${esc(domain)}</span><span class="chev">${'<svg viewBox="0 0 14 14"><path d="M3 5.5L7 9.5l4-4"/></svg>'}</span></button>
      <div class="menu" id="${id}-m" role="listbox" aria-label="Domain" hidden>
        ${domains.map(o => `<div class="opt${o.off ? ' off' : ''}" role="option" tabindex="-1" data-d="${o.d}" aria-selected="${o.d === domain}"${o.off ? ' aria-disabled="true"' : ''}><b>@${o.d}</b><span class="${o.plan === 'Free' || o.off ? '' : 'plus'}">${o.off ? `${o.plan}, opens soon` : o.plan}</span></div>`).join('')}
        ${note ? `<p class="note" id="${id}-n"></p>` : ''}
      </div>
    </div>`;
  const field = $('.field', host), inp = $('input', host), mir = $('.mirror', host), btn = $('.dom', host), menu = $('.menu', host), opts = $$('.opt', host);
  const st = { name, domain };
  const noteEl = $('.note', host), say = () => { if (noteEl) noteEl.textContent = typeof note === 'function' ? note(st.name) : note; };
  say();
  const size = () => {
    mir.textContent = inp.value || inp.placeholder; const w = Math.ceil(mir.getBoundingClientRect().width + 1);
    const fw = field.clientWidth, dw = $('.dv', host).getBoundingClientRect().width + 56;
    if (fw) field.classList.toggle('two', w > fw - 24 - dw);
    inp.style.width = (field.classList.contains('two') ? Math.min(w, fw - 48) : w) + 'px';
  };
  const fire = () => onChange({ ...st });
  inp.addEventListener('input', () => { inp.value = inp.value.toLowerCase().replace(/\s/g, ''); st.name = inp.value; size(); say(); fire(); });
  field.addEventListener('click', e => { if (e.target === field) inp.focus(); });
  const close = (focus) => { onPreview(null); menu.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); setTimeout(() => { if (btn.getAttribute('aria-expanded') === 'false') menu.hidden = true; }, 200); if (focus) btn.focus(); };
  const open = () => { menu.hidden = false; void menu.offsetWidth; menu.classList.add('open'); btn.setAttribute('aria-expanded', 'true');
    (opts.find(o => o.getAttribute('aria-selected') === 'true') || opts[0]).focus({ preventScroll: true }); };
  const pick = d => { if (opts.find(o => o.dataset.d === d)?.getAttribute('aria-disabled') === 'true') return false; st.domain = d; $('.dv', host).textContent = '@' + d; opts.forEach(o => o.setAttribute('aria-selected', String(o.dataset.d === d))); fire(); };
  btn.addEventListener('click', () => (btn.getAttribute('aria-expanded') === 'true' ? close() : open()));
  btn.addEventListener('keydown', e => { if (e.key === 'ArrowDown') { e.preventDefault(); open(); } });
  opts.forEach(o => { ['mouseenter', 'focus'].forEach(ev => o.addEventListener(ev, () => onPreview(o.dataset.d))); });
  menu.addEventListener('mouseleave', () => onPreview(null));
  opts.forEach((o, n) => {
    o.addEventListener('click', () => { if (pick(o.dataset.d) === false) { noteEl?.classList.add('hl'); return; } close(true); });
    o.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); opts[(n + 1) % opts.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); opts[(n + opts.length - 1) % opts.length].focus(); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (pick(o.dataset.d) === false) { noteEl?.classList.add('hl'); return; } close(true); }
      else if (e.key === 'Escape' || e.key === 'Tab') { close(e.key === 'Escape'); }
    });
  });
  document.addEventListener('click', e => { if (!host.contains(e.target) && btn.getAttribute('aria-expanded') === 'true') close(); });
  document.fonts?.ready.then(size); size();
  if ('ResizeObserver' in window) new ResizeObserver(size).observe(field);
  return { get: () => ({ ...st }), focus: () => inp.focus(), set: (n, d) => { inp.value = n; st.name = n; if (d) pick(d); size(); say(); fire(); }, open };
}

export function copy(text, done = 'Copied') {
  (navigator.clipboard?.writeText(text) || Promise.reject()).then(() => toast(done), () => {
    const t = document.createElement('textarea'); t.value = text; document.body.append(t); t.select();
    try { document.execCommand('copy'); toast(done); } catch {} t.remove();
  });
}
