const FOLD = { ø: 'o', æ: 'ae', œ: 'oe', ß: 'ss', ł: 'l', đ: 'd', ð: 'd', þ: 'th', ı: 'i' };
export const fold = s =>
  String(s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[øæœßłđðþı]/g, c => FOLD[c]);
const ONE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u;
const WORDS = /[\p{L}\p{N}]+/gu;
export const MAX_WORD = 40;
export const MAX_WORDS = 6000;
export const MAX_TEXT = 200000;
const URLS = /\b(?:https?:\/\/|www\.)([^\s/?#<>"']+)[^\s<>"']*/gi;
export function words(text, into = new Set()) {
  const t = fold(
    String(text || '')
      .slice(0, MAX_TEXT)
      .replace(URLS, ' $1 '),
  );
  for (const m of t.matchAll(WORDS)) {
    const w = m[0];
    if (ONE.test(w)) {
      let run = '';
      for (const ch of w) {
        if (ONE.test(ch)) {
          if (run.length > 1) into.add(run.slice(0, MAX_WORD));
          run = '';
          into.add(ch);
        } else run += ch;
      }
      if (run.length > 1) into.add(run.slice(0, MAX_WORD));
    } else if (w.length > 1) into.add(w.slice(0, MAX_WORD));
    if (into.size >= MAX_WORDS) break;
  }
  return into;
}
export function parse(q) {
  const out = [];
  const add = (s, exact) => {
    for (const w of words(s))
      if (!out.some(x => x.w === w)) out.push({ w, exact: exact || ONE.test(w) });
  };
  String(q || '').replace(/"([^"]*)"?|([^"]+)/g, (m, quoted, plain) => {
    add(quoted ?? plain, quoted !== undefined);
    return '';
  });
  if (!out.length) {
    const t = fold(q).match(/[\p{L}\p{N}]/u);
    if (t) out.push({ w: t[0], exact: false });
  }
  return out;
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', shy: '' };
const WORDCH = /[A-Za-z0-9_]/,
  SPACE = /\s/,
  BLOCKS = ['script', 'style', 'head', 'title'];
function dropBlocks(s) {
  const low = s.replace(/[A-Z]+/g, m => m.toLowerCase()),
    n = s.length;
  const opens = {},
    closes = {},
    done = new Set(),
    out = [];
  const findOpen = (nm, from) => {
    let i = low.indexOf('<' + nm, from);
    while (i >= 0 && i + nm.length + 1 < n && WORDCH.test(low[i + nm.length + 1]))
      i = low.indexOf('<' + nm, i + 1);
    return i;
  };
  const findClose = (nm, from) => {
    let i = low.indexOf('</' + nm, from);
    while (i >= 0) {
      let k = i + nm.length + 2;
      while (k < n && SPACE.test(s[k])) k++;
      if (k < n && s[k] === '>') return [i, k + 1];
      i = low.indexOf('</' + nm, i + 1);
    }
    return null;
  };
  let pos = 0;
  for (;;) {
    let best = -1,
      name = '';
    for (const nm of BLOCKS) {
      if (done.has(nm)) continue;
      if (opens[nm] === undefined || opens[nm] < pos) opens[nm] = findOpen(nm, pos);
      if (opens[nm] < 0) {
        done.add(nm);
        continue;
      }
      if (best < 0 || opens[nm] < best) {
        best = opens[nm];
        name = nm;
      }
    }
    if (best < 0) break;
    const from = best + 1 + name.length;
    if (closes[name] === undefined || (closes[name] && closes[name][0] < from))
      closes[name] = findClose(name, from);
    if (!closes[name]) {
      done.add(name);
      continue;
    }
    out.push(s.slice(pos, best), ' ');
    pos = closes[name][1];
  }
  out.push(s.slice(pos));
  return out.join('');
}
function dropBetween(s, open, close) {
  const out = [];
  let pos = 0;
  for (;;) {
    const i = s.indexOf(open, pos);
    if (i < 0) break;
    const j = s.indexOf(close, i + open.length);
    if (j < 0) break;
    out.push(s.slice(pos, i), ' ');
    pos = j + close.length;
  }
  out.push(s.slice(pos));
  return out.join('');
}
export function htmlText(h) {
  return dropBetween(
    dropBetween(dropBlocks(String(h || '').slice(0, MAX_TEXT * 2)), '<!--', '-->'),
    '<',
    '>',
  ).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try {
        return String.fromCodePoint(n);
      } catch {
        return ' ';
      }
    }
    return ENT[e.toLowerCase()] ?? ' ';
  });
}
export const previewOf = t =>
  String(t || '')
    .replace(/^>.*$/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);

const own_ = w => (w.length < 13 ? w : Array.from(w).join(''));
export class Index {
  constructor() {
    this.ids = [];
    this.date = [];
    this.meta = [];
    this.dead = new Uint8Array(1024);
    this.byId = new Map();
    this.terms = [];
    this.start = new Uint32Array(1);
    this.docs = new Uint32Array(0);
    this.post = new Map();
    this.sorted = null;
  }
  get size() {
    return this.byId.size;
  }
  has(id) {
    return this.byId.has(String(id));
  }
  doc(id, date, meta) {
    id = String(id);
    if (this.byId.has(id)) this.remove(id);
    const n = this.ids.length;
    this.ids.push(id);
    this.date.push(+date || 0);
    this.meta.push(meta);
    this.byId.set(id, n);
    if (n >= this.dead.length) {
      const d = new Uint8Array(this.dead.length * 2);
      d.set(this.dead);
      this.dead = d;
    }
    this.dead[n] = 0;
    return n;
  }
  add(id, date, meta, line) {
    const n = this.doc(id, date, meta);
    for (const w of line ? line.split(' ') : []) {
      if (!w) continue;
      const p = this.post.get(w);
      if (p) {
        if (p[p.length - 1] !== n) p.push(n);
      } else {
        this.post.set(own_(w), [n]);
        this.sorted = null;
      }
    }
  }
  packer() {
    const ix = this,
      termId = new Map(),
      names = [],
      parts = [];
    let cur = new Uint32Array(1 << 20),
      at = 0;
    const docOf = [];
    return {
      add(id, date, meta, line) {
        const n = ix.doc(id, date, meta),
          from = parts.length * cur.length + at;
        for (const w of line ? line.split(' ') : []) {
          if (!w) continue;
          let t = termId.get(w);
          if (t === undefined) {
            t = names.length;
            const own = own_(w);
            names.push(own);
            termId.set(own, t);
          }
          if (at === cur.length) {
            parts.push(cur);
            cur = new Uint32Array(1 << 20);
            at = 0;
          }
          cur[at++] = t;
        }
        docOf.push(n, from, parts.length * cur.length + at);
      },
      pack() {
        parts.push(cur.subarray(0, at));
        const size = 1 << 20,
          T = names.length;
        const get = i => parts[(i / size) | 0][i % size];
        const order = new Uint32Array(T);
        for (let i = 0; i < T; i++) order[i] = i;
        order.sort((a, b) => (names[a] < names[b] ? -1 : names[a] > names[b] ? 1 : 0));
        const rank = new Uint32Array(T);
        for (let i = 0; i < T; i++) rank[order[i]] = i;
        const count = new Uint32Array(T + 1);
        for (let k = 0; k < docOf.length; k += 3)
          for (let i = docOf[k + 1]; i < docOf[k + 2]; i++) count[rank[get(i)] + 1]++;
        for (let i = 0; i < T; i++) count[i + 1] += count[i];
        const docs = new (ix.ids.length <= 65536 ? Uint16Array : Uint32Array)(count[T]),
          fill = count.slice(0, T);
        for (let k = 0; k < docOf.length; k += 3)
          for (let i = docOf[k + 1]; i < docOf[k + 2]; i++) docs[fill[rank[get(i)]]++] = docOf[k];
        ix.terms = Array.from(order, i => names[i]);
        ix.start = count;
        ix.docs = docs;
        termId.clear();
        names.length = 0;
        parts.length = 0;
        docOf.length = 0;
      },
    };
  }
  remove(id) {
    const n = this.byId.get(String(id));
    if (n === undefined) return false;
    this.dead[n] = 1;
    this.meta[n] = null;
    this.byId.delete(String(id));
    return true;
  }
  static range(s, p, exact) {
    let lo = 0,
      hi = s.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (s[mid] < p) lo = mid + 1;
      else hi = mid;
    }
    if (exact) return lo < s.length && s[lo] === p ? [lo, lo + 1] : [lo, lo];
    let a = lo;
    hi = s.length;
    while (a < hi) {
      const mid = (a + hi) >> 1;
      if (s[mid].startsWith(p)) a = mid + 1;
      else hi = mid;
    }
    return [lo, a];
  }
  runs(w, exact) {
    const out = [];
    const [a, b] = Index.range(this.terms, w, exact);
    if (b > a) out.push([this.docs, this.start[a], this.start[b]]);
    const s = this.sorted || (this.sorted = [...this.post.keys()].sort());
    const [c, d] = Index.range(s, w, exact);
    for (let i = c; i < d; i++) {
      const p = this.post.get(s[i]);
      out.push([p, 0, p.length]);
    }
    return out;
  }
  find(parsed) {
    if (!parsed.length) return [];
    const N = this.ids.length;
    const lists = parsed
      .map(({ w, exact }) => {
        const r = this.runs(w, exact);
        return { r, n: r.reduce((x, [, a, b]) => x + b - a, 0) };
      })
      .sort((a, b) => a.n - b.n);
    if (!lists[0].n) return [];
    const mark = new Uint8Array(N);
    lists.forEach(({ r }, k) => {
      for (const [p, a, b] of r)
        for (let i = a; i < b; i++) if (mark[p[i]] === k) mark[p[i]] = k + 1;
    });
    const out = [],
      need = lists.length;
    for (let n = 0; n < N; n++) if (mark[n] === need && !this.dead[n]) out.push(n);
    return out.sort((a, b) => this.date[b] - this.date[a]);
  }
}

const te = new TextEncoder(),
  td = new TextDecoder();
async function pipe(bytes, stream) {
  return new Uint8Array(
    await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer(),
  );
}
const canZip = typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
export async function seal(key, name, value) {
  let bytes = te.encode(JSON.stringify(value)),
    z = 0;
  if (canZip) {
    bytes = await pipe(bytes, new CompressionStream('gzip'));
    z = 1;
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: te.encode(name) },
    key,
    bytes,
  );
  return { iv, data, z };
}
export async function unseal(key, name, rec) {
  let bytes = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: rec.iv, additionalData: te.encode(name) },
      key,
      rec.data,
    ),
  );
  if (rec.z) bytes = await pipe(bytes, new DecompressionStream('gzip'));
  return JSON.parse(td.decode(bytes));
}
const KEY_NAME = address => `foldoy search key\n${String(address).toLowerCase()}`;
export async function newIndexKey(wrap, address) {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: te.encode(KEY_NAME(address)) },
    wrap,
    raw,
  );
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  raw.fill(0);
  return { key, sealed: { iv, data } };
}
export async function openIndexKey(wrap, address, sealed) {
  const raw = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: sealed.iv, additionalData: te.encode(KEY_NAME(address)) },
      wrap,
      sealed.data,
    ),
  );
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  raw.fill(0);
  return key;
}
export async function resealIndexKey(oldWrap, newWrap, address, sealed) {
  const raw = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: sealed.iv, additionalData: te.encode(KEY_NAME(address)) },
      oldWrap,
      sealed.data,
    ),
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: te.encode(KEY_NAME(address)) },
    newWrap,
    raw,
  );
  raw.fill(0);
  return { iv, data };
}
export async function dbName(address) {
  const h = new Uint8Array(
    await crypto.subtle.digest(
      'SHA-256',
      te.encode(`foldoy search\n${String(address).toLowerCase()}`),
    ),
  );
  return 'foldoy-search-' + [...h.slice(0, 16)].map(b => b.toString(16).padStart(2, '0')).join('');
}
