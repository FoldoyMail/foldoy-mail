import * as pgp from './pgp.js';
import {
  words,
  parse,
  htmlText,
  previewOf,
  Index,
  seal,
  unseal,
  newIndexKey,
  openIndexKey,
  resealIndexKey,
  dbName,
} from './search-core.js';

const DEC = new URL(self.location.href).searchParams.has('dec');
const API = '/mail/api/';

let keysP = null;
const unlock = (wrap, keys) =>
  (keysP = pgp.unlockAll(wrap, keys).then(
    () => true,
    () => false,
  ));
async function opened(j) {
  try {
    const m = await pgp.decrypt(j.armored);
    const body = m.text ?? htmlText(m.html || '');
    const set = words(m.subject || '');
    words(j.people, set);
    words(body, set);
    for (const f of m.files || []) words(f.name, set);
    return {
      id: j.id,
      ok: true,
      subject: m.subject || '',
      preview: previewOf(body),
      files: (m.files || []).length,
      line: [...set].join(' '),
    };
  } catch {
    return { id: j.id, ok: false };
  }
}
if (DEC) {
  self.onmessage = async e => {
    const d = e.data;
    if (d.t === 'keys') {
      unlock(d.wrap, d.keys);
      return;
    }
    if (d.t === 'dec') {
      await keysP;
      const out = [];
      for (const j of d.jobs) out.push(await opened(j));
      self.postMessage({ t: 'done', n: d.n, out });
    }
  };
} else
  self.onmessage = e => {
    on(e.data).catch(() => {});
  };

let db = null,
  name = '';
const openDb = n =>
  new Promise((res, rej) => {
    const r = indexedDB.open(n, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('meta');
      r.result.createObjectStore('chunks');
    };
    r.onsuccess = () => {
      const d = r.result;
      d.onversionchange = () => {
        d.close();
        db = null;
        stopped = true;
      };
      res(d);
    };
    r.onerror = () => rej(r.error);
  });
const req = (store, mode, fn) =>
  new Promise((res, rej) => {
    if (!db) return rej(new Error('closed'));
    const t = db.transaction(store, mode),
      q = fn(t.objectStore(store));
    t.oncomplete = () => res(q && q.result);
    t.onerror = t.onabort = () => rej(t.error);
  });
const get = (store, k) => req(store, 'readonly', s => s.get(k));
const put = (store, k, v) => req(store, 'readwrite', s => s.put(v, k));
const del = (store, k) => req(store, 'readwrite', s => s.delete(k));
const cname = no => `${name}/chunk/${no}`;

const CHUNK = 200;
const BATCH = 100;
const LANES = 2;
let address = '',
  wrap = null,
  keys = null,
  ikey = null,
  stopped = false,
  hidden = false;
let idx = new Index();
const chunkOf = new Map();
const sizes = new Map();
const filling = new Map();
let nextNo = 0;
let state = new Map();
let listed = false;
let fails = new Map();
let pending = [],
  pi = 0;
const inflight = new Set();
let loaded = null,
  loadedOk;
const ready = new Promise(r => {
  loadedOk = r;
});

const post = m => {
  try {
    self.postMessage(m);
  } catch {}
};
function counts() {
  let indexed = 0,
    failed = 0;
  for (const id of state.keys()) {
    if (idx.has(id)) indexed++;
    else if (fails.has(id)) failed++;
  }
  let bytes = 0;
  for (const v of sizes.values()) bytes += v;
  return {
    indexed,
    total: state.size,
    failed,
    waiting: state.size - indexed - failed,
    listed,
    bytes,
    building: pumping,
    mem: idx.size,
  };
}
let reportDue = 0;
function report(now) {
  if (now) {
    clearTimeout(reportDue);
    reportDue = 0;
    post({ t: 'state', ...counts() });
    return;
  }
  if (!reportDue)
    reportDue = setTimeout(() => {
      reportDue = 0;
      post({ t: 'state', ...counts() });
    }, 250);
}

async function on(d) {
  if (d.t === 'open') return open(d);
  if (d.t === 'sync') {
    await ready;
    return sync();
  }
  if (d.t === 'hidden') {
    hidden = !!d.on;
    if (!hidden) wake();
    return;
  }
  if (d.t === 'query') {
    await ready;
    return post({ t: 'result', n: d.n, ...query(d.q, d.offset || 0, d.limit || 50) });
  }
  if (d.t === 'indexed') {
    await ready;
    return post({ t: 'indexed', n: d.n, ids: [...idx.byId.keys()] });
  }
  if (d.t === 'rewrap') {
    await ready;
    try {
      const sk = await get('meta', 'key');
      await put('meta', 'key', await resealIndexKey(d.from, d.to, address, sk));
      wrap = d.to;
    } catch {}
    return;
  }
  if (d.t === 'remove') {
    await remove();
    post({ t: 'removed', n: d.n });
  }
}

async function open(d) {
  address = d.address;
  wrap = d.wrap;
  keys = d.keys;
  try {
    name = await dbName(address);
    db = await openDb(name);
    const sk = await get('meta', 'key');
    if (sk) {
      try {
        ikey = await openIndexKey(wrap, address, sk);
      } catch {
        ikey = null;
      }
    }
    if (!ikey) {
      await req('chunks', 'readwrite', s => s.clear());
      await del('meta', 'fails').catch(() => {});
      await del('meta', 'done').catch(() => {});
      const k = await newIndexKey(wrap, address);
      ikey = k.key;
      await put('meta', 'key', k.sealed);
    }
    const t0 = performance.now();
    const recs = await req('chunks', 'readonly', s => s.getAllKeys());
    const pk = idx.packer();
    for (const no of recs) {
      const rec = await get('chunks', no);
      let entries;
      try {
        entries = await unseal(ikey, cname(no), rec);
      } catch {
        await del('chunks', no);
        continue;
      }
      for (const e of entries) {
        pk.add(e[0], e[1], e[2], e[3]);
        chunkOf.set(e[0], no);
      }
      sizes.set(no, rec.data.byteLength + 28);
      if (entries.length < CHUNK) filling.set(no, entries);
      nextNo = Math.max(nextNo, no + 1);
    }
    pk.pack();
    let finished = false;
    try {
      const f = await get('meta', 'done');
      finished = !!f && (await unseal(ikey, `${name}/done`, f)) === true;
    } catch {}
    if (finished) {
      for (const [id, n] of idx.byId) {
        let fo;
        try {
          fo = JSON.parse(idx.meta[n]).fo;
        } catch {}
        state.set(id, [fo, 0, 0, idx.date[n]]);
      }
      listed = idx.size > 0;
    }
    try {
      const f = await get('meta', 'fails');
      if (f) fails = new Map(await unseal(ikey, `${name}/fails`, f));
    } catch {
      fails = new Map();
    }
    loaded = { ms: Math.round(performance.now() - t0), messages: idx.size };
  } catch (e) {
    post({ t: 'error', what: 'open' });
    return;
  }
  loadedOk();
  post({ t: 'loaded', ...loaded });
  report(true);
  sync();
}

async function remove() {
  stopped = true;
  for (const h of pool)
    try {
      h.w.terminate();
    } catch {}
  pool.length = 0;
  idx = new Index();
  state = new Map();
  fails = new Map();
  ikey = null;
  wrap = null;
  try {
    db?.close();
  } catch {}
  db = null;
  await new Promise(res => {
    const r = indexedDB.deleteDatabase(name);
    r.onsuccess = r.onerror = r.onblocked = () => res();
  });
}

function query(q, offset, limit) {
  const t0 = performance.now();
  const nums = idx.find(parse(q)).filter(n => !listed || state.has(idx.ids[n]));
  const rows = nums.slice(offset, offset + limit).map(n => {
    const id = idx.ids[n],
      st = state.get(id);
    let m = {};
    try {
      m = JSON.parse(idx.meta[n]);
    } catch {}
    return {
      id,
      thread_id: m.t || '',
      from: m.f || { name: '', addr: '' },
      to: m.o || [],
      subject: m.s || '',
      preview: m.p || '',
      attachments: m.a || 0,
      encrypted: !!m.e,
      arrival: m.r,
      via_alias: m.v || null,
      date: new Date(idx.date[n]).toISOString(),
      folder: st ? st[0] : m.fo,
      unread: !!st?.[1],
      flagged: !!st?.[2],
      opened: true,
      indexed: true,
    };
  });
  return { ...counts(), rows, found: nums.length, ms: +(performance.now() - t0).toFixed(1) };
}

let syncing = false,
  again = false,
  backoff = 0;
async function getJson(path) {
  const r = await fetch(API + path, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  if (!r.ok) throw Object.assign(new Error('http'), { status: r.status });
  return r.json();
}
async function sync() {
  if (stopped) return;
  if (syncing) {
    again = true;
    return;
  }
  syncing = true;
  try {
    const man = new Map();
    let cursor = '';
    do {
      const r = await getJson(
        `search-index/list${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
      );
      for (const [id, date, folder, u, f] of r.items)
        man.set(String(id), [folder, u, f, Date.parse(date) || 0]);
      cursor = r.next;
    } while (cursor && !stopped);
    if (stopped) return;
    state = man;
    listed = true;
    const gone = [...idx.byId.keys()].filter(id => !man.has(id));
    if (gone.length) await drop(gone);
    for (const id of fails.keys()) if (!man.has(id)) fails.delete(id);
    plan();
    await mark();
    report(true);
    pump();
  } catch (e) {
    if (e.status === 401 || e.status === 403) {
      stopped = true;
      post({ t: 'stopped' });
      return;
    }
    setTimeout(sync, e.status === 429 ? 60000 : 15000);
  } finally {
    syncing = false;
    if (again) {
      again = false;
      sync();
    }
  }
}
function plan() {
  const now = Date.now();
  pending = [...state.entries()]
    .filter(([id]) => !idx.has(id) && !inflight.has(id) && !((fails.get(id) || [0, 0])[1] > now))
    .sort((a, b) => b[1][3] - a[1][3])
    .map(([id]) => id);
  pi = 0;
}
function take(n) {
  const out = [];
  while (out.length < n && pi < pending.length) {
    const id = pending[pi++];
    if (state.has(id) && !idx.has(id) && !inflight.has(id)) {
      out.push(id);
      inflight.add(id);
    }
  }
  return out;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
let wakeUp = null;
const wake = () => {
  if (wakeUp) {
    wakeUp();
    wakeUp = null;
  }
};
let pumping = false;
async function pump() {
  if (pumping || stopped) return;
  pumping = true;
  report();
  try {
    await Promise.all(Array.from({ length: LANES }, (_, i) => lane(i)));
  } finally {
    pumping = false;
    await mark();
    report(true);
  }
  if (!stopped && pi < pending.length) pump();
}
async function lane(i) {
  while (!stopped) {
    if (i > 0 && hidden) {
      await new Promise(r => {
        wakeUp = r;
        setTimeout(r, 5000);
      });
      continue;
    }
    const batch = take(BATCH);
    if (!batch.length) return;
    try {
      await fetchBatch(batch);
      backoff = 0;
    } catch (e) {
      batch.forEach(id => inflight.delete(id));
      if (stopped) return;
      if (e.status === 401 || e.status === 403) {
        stopped = true;
        post({ t: 'stopped' });
        return;
      }
      pending = [...batch, ...pending.slice(pi)];
      pi = 0;
      backoff = e.status === 429 ? 60000 : Math.min(60000, Math.max(2000, backoff * 2));
      await sleep(backoff);
    }
  }
}

async function fetchBatch(ids) {
  const r = await fetch(`${API}search-index/bodies?ids=${ids.join(',')}`, {
    credentials: 'same-origin',
  });
  if (!r.ok) throw Object.assign(new Error('http'), { status: r.status });
  const got = new Set(),
    jobs = [],
    entries = [],
    failed = [];
  let broken = false;
  const take1 = o => {
    if (!o.id) {
      broken = true;
      return;
    }
    got.add(o.id);
    if (o.gone) {
      state.delete(String(o.id));
      return;
    }
    if (o.error) {
      failed.push(o.id);
      return;
    }
    const people = [o.from, ...(o.to || []), ...(o.cc || [])]
      .flatMap(p => (p ? [p.name, p.addr] : []))
      .join('\n');
    if (o.armored) {
      jobs.push({ id: o.id, armored: o.armored, people, item: o });
      return;
    }
    const body = o.too_big ? '' : o.text || htmlText(o.html || '');
    const set = words(o.encrypted ? '' : o.subject);
    words(people, set);
    words(body, set);
    for (const f of o.files || []) words(f, set);
    entries.push(
      entry(o, {
        subject: o.encrypted ? '' : o.subject,
        preview: o.encrypted ? '' : previewOf(body),
        files: o.attachments,
        line: [...set].join(' '),
      }),
    );
  };
  const reader = r.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '',
    decs = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buf += value;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        take1(JSON.parse(line));
      } catch {
        broken = true;
      }
      if (jobs.length >= 10) decs.push(decrypt(jobs.splice(0)));
    }
    if (done) break;
  }
  if (jobs.length) decs.push(decrypt(jobs.splice(0)));
  for (const out of await Promise.all(decs))
    for (const [j, x] of out) {
      if (x.ok) entries.push(entry(j.item, x));
      else failed.push(j.id);
    }
  const left = ids.filter(id => !got.has(id));
  ids.forEach(id => inflight.delete(id));
  if (left.length) {
    pending = [...left, ...pending.slice(pi)];
    pi = 0;
  }
  await keep(entries);
  if (failed.length) await fail(failed);
  report();
  if (broken && !entries.length) throw Object.assign(new Error('server'), { status: 502 });
}
function entry(o, x) {
  const meta = {
    t: o.thread_id || '',
    f: o.from || null,
    o: o.to || [],
    s: x.subject || '',
    p: x.preview || '',
    a: x.files || o.attachments || 0,
    e: !!o.encrypted,
    r: o.arrival,
    v: o.via_alias || null,
    fo: o.folder,
  };
  return [String(o.id), Date.parse(o.date) || 0, JSON.stringify(meta), x.line];
}
let marked = null;
async function mark() {
  const c = counts(),
    done = c.listed && !c.waiting;
  if (done === marked || !ikey || stopped) return;
  marked = done;
  await writes(async () => put('meta', 'done', await seal(ikey, `${name}/done`, done)));
}
async function fail(ids) {
  const now = Date.now();
  for (const id of ids) {
    const [n] = fails.get(id) || [0];
    fails.set(id, [n + 1, now + Math.min(864e5, 6e5 * 4 ** n)]);
  }
  await writes(async () => {
    if (ikey) await put('meta', 'fails', await seal(ikey, `${name}/fails`, [...fails]));
  });
}

let writeQ = Promise.resolve();
const writes = fn => (writeQ = writeQ.then(fn).catch(() => {}));
async function keep(entries) {
  if (!entries.length || stopped) return;
  const touched = new Set();
  for (const e of entries) {
    if (idx.has(e[0])) continue;
    idx.add(e[0], e[1], e[2], e[3]);
    let no = [...filling.keys()].find(k => filling.get(k).length < CHUNK);
    if (no === undefined) {
      no = nextNo++;
      filling.set(no, []);
    }
    filling.get(no).push(e);
    chunkOf.set(e[0], no);
    touched.add(no);
    if (fails.has(e[0])) fails.delete(e[0]);
  }
  await writes(async () => {
    for (const no of touched) {
      const list = filling.get(no);
      if (!list || !ikey) continue;
      const rec = await seal(ikey, cname(no), list);
      await put('chunks', no, rec);
      sizes.set(no, rec.data.byteLength + 28);
      if (list.length >= CHUNK) filling.delete(no);
    }
  });
}
async function drop(ids) {
  const by = new Map();
  for (const id of ids) {
    idx.remove(id);
    const no = chunkOf.get(id);
    chunkOf.delete(id);
    if (no !== undefined) (by.get(no) || by.set(no, new Set()).get(no)).add(id);
  }
  await writes(async () => {
    for (const [no, gone] of by) {
      let list = filling.get(no);
      if (!list) {
        const rec = await get('chunks', no);
        if (!rec) continue;
        try {
          list = await unseal(ikey, cname(no), rec);
        } catch {
          list = [];
        }
      }
      list = list.filter(e => !gone.has(e[0]));
      if (!list.length) {
        await del('chunks', no);
        sizes.delete(no);
        filling.delete(no);
        continue;
      }
      const rec = await seal(ikey, cname(no), list);
      await put('chunks', no, rec);
      sizes.set(no, rec.data.byteLength + 28);
      if (filling.has(no) || list.length < CHUNK) filling.set(no, list);
    }
  });
}

const pool = [];
let poolTried = false,
  jobNo = 0;
function makePool() {
  poolTried = true;
  const n = Math.max(1, Math.min(2, (self.navigator?.hardwareConcurrency || 2) - 2));
  if (typeof Worker !== 'function') return;
  for (let i = 0; i < n; i++) {
    try {
      const u = new URL(self.location.href);
      u.searchParams.set('dec', '1');
      const w = new Worker(u.href, { type: 'module' });
      const h = { w, load: 0, wait: new Map() };
      w.onmessage = e => {
        const f = h.wait.get(e.data.n);
        if (f) {
          h.wait.delete(e.data.n);
          f(e.data.out);
        }
      };
      w.onerror = () => {
        for (const f of h.wait.values()) f(null);
        h.wait.clear();
        h.dead = true;
      };
      w.postMessage({ t: 'keys', wrap, keys });
      pool.push(h);
    } catch {}
  }
}
async function decrypt(jobs) {
  if (!poolTried) makePool();
  const live = pool.filter(h => !h.dead);
  let out;
  if (live.length) {
    const h = live.reduce((a, b) => (b.load < a.load ? b : a));
    const n = ++jobNo;
    h.load += jobs.length;
    out = await new Promise(res => {
      h.wait.set(n, res);
      h.w.postMessage({
        t: 'dec',
        n,
        jobs: jobs.map(({ id, armored, people }) => ({ id, armored, people })),
      });
    });
    h.load -= jobs.length;
  }
  if (!out) {
    if (!keysP) unlock(wrap, keys);
    await keysP;
    out = [];
    for (const j of jobs) out.push(await opened(j));
  }
  const by = new Map(out.map(x => [x.id, x]));
  return jobs.map(j => [j, by.get(j.id) || { ok: false }]);
}
