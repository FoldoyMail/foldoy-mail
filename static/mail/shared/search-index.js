import * as pgp from './pgp.js';
import { dbName } from './search-core.js';
import { DEMO } from './api.js';

let w = null,
  me = null,
  name = '',
  n = 0,
  sig = '',
  due = 0;
const waits = new Map(),
  subs = new Set();
let st = null;
const offKey = () => `foldoy-search-off:${name}`;
const isOff = () => {
  try {
    return localStorage.getItem(offKey()) === '1';
  } catch {
    return false;
  }
};
const setOff = v => {
  try {
    if (v) localStorage.setItem(offKey(), '1');
    else localStorage.removeItem(offKey());
  } catch {}
};
const tell = () =>
  subs.forEach(f => {
    try {
      f(st);
    } catch {}
  });
const ask = (m, t) =>
  new Promise(res => {
    if (!w) return res(null);
    const k = ++n;
    waits.set(k, res);
    w.postMessage({ ...m, n: k });
    setTimeout(() => {
      if (waits.delete(k)) res(null);
    }, t || 20000);
  });

function startWorker() {
  const src =
    document.querySelector('meta[name="foldoy-search-worker"]')?.content ||
    new URL('./search-worker.js', import.meta.url).href;
  w = new Worker(src, { type: 'module' });
  w.onmessage = e => {
    const d = e.data;
    if (d.t === 'state') {
      st = d;
      tell();
      return;
    }
    if (d.t === 'loaded') {
      st = { ...(st || {}), loadedMs: d.ms };
      return;
    }
    if (d.t === 'stopped' || d.t === 'error') {
      idx.stop();
      return;
    }
    const f = waits.get(d.n);
    if (f) {
      waits.delete(d.n);
      f(d);
    }
  };
  w.onerror = () => idx.stop();
  w.postMessage({ t: 'open', address: me.address, wrap: pgp.deviceKey(), keys: me.keys });
  w.postMessage({ t: 'hidden', on: document.hidden });
}
document.addEventListener('visibilitychange', () => {
  if (w) w.postMessage({ t: 'hidden', on: document.hidden });
});

export const idx = {
  eligible: s =>
    !DEMO &&
    !!s?.e2e &&
    !s.key?.own &&
    !s.privacy_plus?.on &&
    s.mailbox === 'active' &&
    !!pgp.deviceKey() &&
    typeof Worker === 'function' &&
    typeof indexedDB !== 'undefined',
  get state() {
    return st;
  },
  get running() {
    return !!w;
  },
  complete: () => !!(w && st && st.listed && !st.waiting),
  async start(s) {
    me = s;
    if (!s?.address) return;
    name = await dbName(s.address);
    if (s.privacy_plus?.on || s.key?.own) {
      await idx.drop();
      return;
    }
    if (!idx.eligible(s)) return;
    if (isOff()) {
      st = { off: true };
      tell();
      return;
    }
    if (!w) startWorker();
  },
  stop() {
    if (w) w.terminate();
    w = null;
    st = null;
    for (const f of waits.values()) f(null);
    waits.clear();
    tell();
  },
  folders(list) {
    const s = (list || [])
      .filter(f => !f.view)
      .map(f => `${f.id}:${f.total}:${f.unread}`)
      .join('|');
    if (s === sig) return;
    const first = !sig;
    sig = s;
    if (first || !w) return;
    clearTimeout(due);
    due = setTimeout(() => w?.postMessage({ t: 'sync' }), 1500);
  },
  sync() {
    w?.postMessage({ t: 'sync' });
  },
  query: (q, offset = 0, limit = 50) => ask({ t: 'query', q, offset, limit }),
  indexed: async () => {
    const r = await ask({ t: 'indexed' });
    return r ? new Set(r.ids) : null;
  },
  async remove() {
    setOff(true);
    if (w) {
      await ask({ t: 'remove' }, 10000);
      idx.stop();
    }
    await idx.drop();
    st = { off: true };
    tell();
  },
  async build() {
    setOff(false);
    st = null;
    await idx.start(me);
    tell();
  },
  async drop() {
    if (!name) return;
    await new Promise(res => {
      try {
        const r = indexedDB.deleteDatabase(name);
        r.onsuccess = r.onerror = r.onblocked = () => res();
      } catch {
        res();
      }
    });
  },
  rewrap(from, to) {
    if (w && from && to && from !== to) w.postMessage({ t: 'rewrap', from, to });
  },
  on(f) {
    subs.add(f);
    return () => subs.delete(f);
  },
};
