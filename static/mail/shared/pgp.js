let lib = null;
const load = async () => (lib ||= await import('./vendor/openpgp.min.js'));
const loadAgain = async () =>
  (lib ||= await import(
    `${
      document.querySelector('link[rel="modulepreload"][href*="openpgp"]')?.href ||
      new URL('./vendor/openpgp.min.js', import.meta.url).href
    }?again=1`
  ));
export const b64 = u8 => {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000)
    s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
};
export const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const enc = s => new TextEncoder().encode(s);
export const ITER = 600000;

let ring = [];
let wrapKey = null;
let extra = [];
const acct = () => ring.find(k => !k.alias)?.priv || null;
let opening = null,
  epoch = 0;

let argonP = null;
const argon = () =>
  (argonP ||= globalThis.hashwasm
    ? Promise.resolve(globalThis.hashwasm)
    : new Promise((res, rej) => {
        const el = document.createElement('script');
        el.src = new URL('./vendor/argon2.umd.min.js', import.meta.url).href;
        el.onload = () => res(globalThis.hashwasm);
        el.onerror = () => rej(new Error('Argon2 could not load.'));
        document.head.append(el);
      }));
export const newKdf = () => ({
  name: 'argon2id',
  salt: b64(crypto.getRandomValues(new Uint8Array(16))),
  time: 3,
  memory: 65536,
  parallelism: 1,
});
export function kdfOk(kdf) {
  if (!kdf || typeof kdf.salt !== 'string' || unb64(kdf.salt).length < 16) return false;
  if (kdf.name === 'argon2id')
    return (
      kdf.time >= 3 &&
      kdf.memory >= 65536 &&
      kdf.parallelism >= 1 &&
      kdf.time <= 20 &&
      kdf.memory <= 262144 &&
      kdf.parallelism <= 4
    );
  return false;
}
async function masterKey(password, kdf) {
  if (!kdfOk(kdf)) throw new Error('weak-kdf');
  const h = await argon();
  return (
    await h.argon2id({
      password,
      salt: unb64(kdf.salt),
      iterations: kdf.time,
      memorySize: kdf.memory,
      parallelism: kdf.parallelism,
      hashLength: 32,
      outputType: 'binary',
    })
  ).buffer;
}
export async function derive(password, kdf) {
  const master = await masterKey(password, kdf);
  const hk = await crypto.subtle.importKey('raw', master, 'HKDF', false, [
    'deriveBits',
    'deriveKey',
  ]);
  const auth = b64(
    new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc('foldoy auth') },
        hk,
        256,
      ),
    ),
  );
  const wrap = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc('foldoy wrap') },
    hk,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  return { auth, wrap };
}
export const authFor = async (password, kdf) => (await derive(password, kdf)).auth;
async function seal(wrap, bytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return {
    wrapped_key: b64(
      new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrap, bytes)),
    ),
    iv: b64(iv),
  };
}
async function open(wrap, k) {
  return new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(k.iv) }, wrap, unb64(k.wrapped_key)),
  );
}
async function gen(address) {
  const o = await load();
  return o.generateKey({
    type: 'ecc',
    curve: 'curve25519Legacy',
    userIDs: address ? [{ email: address }] : [{ name: 'foldoy mail' }],
    format: 'object',
  });
}

export async function newAccountKey(address, password) {
  const kdf = newKdf();
  const { auth, wrap } = await derive(password, kdf);
  const { privateKey, publicKey } = await gen(address);
  ring = [{ id: null, alias: null, priv: privateKey }];
  wrapKey = wrap;
  return {
    auth,
    kdf,
    key: { public_key: publicKey.armor(), ...(await seal(wrap, privateKey.write())) },
    fingerprint: fmt(publicKey.getFingerprint()),
  };
}
export async function newWrappedKey(address, recPub) {
  if (opening) await opening;
  if (!wrapKey) throw new Error('Your key is not loaded on this device.');
  const { privateKey, publicKey } = await gen(address);
  ring.push({ id: null, alias: address, priv: privateKey });
  return {
    public_key: publicKey.armor(),
    ...(await seal(wrapKey, privateKey.write())),
    ...(recPub ? { rcopy: await copyOf(privateKey, recPub) } : {}),
  };
}
async function sameKey(o, priv, public_key) {
  if (!public_key) return true;
  try {
    return priv.getFingerprint() === (await o.readKey({ armoredKey: public_key })).getFingerprint();
  } catch {
    return false;
  }
}
async function openKeys(wrap, keys) {
  const o = await load();
  const out = [];
  for (const k of keys || []) {
    if (k.kind === 'own' || k.stale || !k.wrapped_key) continue;
    try {
      const priv = await o.readPrivateKey({ binaryKey: await open(wrap, k) });
      if (await sameKey(o, priv, k.public_key))
        out.push({ id: k.id, alias: k.alias || null, priv });
    } catch {}
  }
  if (!out.some(k => !k.alias) && (keys || []).some(k => !k.alias && k.kind !== 'own' && !k.stale))
    throw new Error('wrong');
  return out;
}
export async function unlockAll(wrap, keys) {
  const out = await openKeys(wrap, keys);
  ring = out;
  wrapKey = wrap;
  return true;
}
export async function rewrapAll(password) {
  if (opening) await opening;
  if (!ring.length) throw new Error('Your key is not loaded on this device.');
  const kdf = newKdf();
  const { auth, wrap } = await derive(password, kdf);
  const keys = [];
  for (const k of ring) keys.push({ id: k.id, ...(await seal(wrap, k.priv.write())) });
  wrapKey = wrap;
  return { auth, kdf, keys };
}
export const hasKey = () => ring.length > 0 || extra.length > 0;
export async function newMainKey(address, password, kdf) {
  if (opening) await opening;
  const { auth, wrap } = await derive(password, kdf);
  const { privateKey, publicKey } = await gen(address);
  ring = [{ id: null, alias: null, priv: privateKey }, ...ring.filter(k => k.alias)];
  wrapKey = wrap;
  return {
    auth,
    key: { public_key: publicKey.armor(), ...(await seal(wrap, privateKey.write())) },
  };
}
export async function contactId(address) {
  if (opening) await opening;
  const me = acct();
  if (!me) throw new Error('nokey');
  const bytes = new Uint8Array([...me.write(), 0, ...enc(String(address).toLowerCase())]);
  return b64(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
export const ownLoaded = () => extra.length > 0;
export const lockTab = () => {
  extra = [];
};
export function setIds(keys) {
  for (const k of ring) {
    const m = (keys || []).find(
      x => (x.alias || null) === k.alias && x.current !== false && !x.stale,
    );
    if (m) k.id = m.id;
  }
}

const STORES = ['wrap', 'pins', 'cache'];
const idb = () =>
  new Promise((res, rej) => {
    const r = indexedDB.open('foldoy-mail', 2);
    r.onupgradeneeded = () => {
      for (const n of STORES)
        if (!r.result.objectStoreNames.contains(n)) r.result.createObjectStore(n);
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
const txIn = async (store, mode, fn) => {
  const db = await idb();
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const q = fn(t.objectStore(store));
    t.oncomplete = () => res(q && q.result);
    t.onerror = () => rej(t.error);
  });
};
const tx = (mode, fn) => txIn('wrap', mode, fn);
export async function remember(address) {
  if (wrapKey) await tx('readwrite', s => s.put(wrapKey, address)).catch(() => {});
}
export async function restore(address, keys) {
  try {
    const w = await tx('readonly', s => s.get(address));
    if (!w) return false;
    await unlockAll(w, keys);
    return true;
  } catch {
    return false;
  }
}
export async function restoreWrap(address, keys) {
  let w;
  try {
    w = await tx('readonly', s => s.get(address));
  } catch {
    return false;
  }
  if (!w) return false;
  const main = (keys || []).filter(k => !k.alias && k.kind !== 'own' && !k.stale);
  if (main.length) {
    let ok = false;
    for (const k of main) {
      if (!k.wrapped_key) continue;
      try {
        const b = await open(w, k);
        if (b instanceof Uint8Array) b.fill(0);
        ok = true;
        break;
      } catch {}
    }
    if (!ok) return false;
  }
  wrapKey = w;
  const e = epoch;
  const once = () =>
    openKeys(w, keys).then(
      out => {
        if (e !== epoch) return null;
        ring = out;
        setIds(keys);
        return true;
      },
      x => (e !== epoch ? null : x?.message === 'wrong' ? false : 'load'),
    );
  const p = (opening = once()
    .then(r =>
      r === 'load'
        ? new Promise(res => setTimeout(res, 1500)).then(() =>
            e === epoch
              ? loadAgain()
                  .catch(() => {})
                  .then(once)
              : null,
          )
        : r,
    )
    .then(r => {
      if (opening === p) opening = null;
      return r;
    }));
  return { ready: p };
}
const soon = (p, ms) =>
  Promise.race([Promise.resolve(p).catch(() => {}), new Promise(r => setTimeout(r, ms))]);
export async function forget(address) {
  epoch++;
  opening = null;
  ring = [];
  wrapKey = null;
  extra = [];
  rowMem.clear();
  await soon(
    tx('readwrite', s => s.delete(address)),
    3000,
  );
  await soon(
    txIn('cache', 'readwrite', s => s.clear()),
    3000,
  );
  await soon(dropSearch(address), 1500);
}
export async function forgetAll() {
  epoch++;
  opening = null;
  ring = [];
  wrapKey = null;
  extra = [];
  rowMem.clear();
  await soon(
    tx('readwrite', s => s.clear()),
    3000,
  );
  await soon(
    txIn('cache', 'readwrite', s => s.clear()),
    3000,
  );
  await soon(dropSearch(null), 1500);
}
export const deviceKey = () => wrapKey;
async function dropSearch(address) {
  const del = name =>
    new Promise(res => {
      try {
        const r = indexedDB.deleteDatabase(name);
        r.onsuccess = r.onerror = r.onblocked = () => res();
      } catch {
        res();
      }
    });
  try {
    const { dbName } = await import('./search-core.js');
    const names = new Set(address ? [await dbName(address)] : []);
    if (!address && indexedDB.databases)
      for (const d of await indexedDB.databases())
        if (d.name?.startsWith('foldoy-search-')) names.add(d.name);
    await Promise.all([...names].map(del));
  } catch {}
}

const pinId = async (account, name) =>
  b64(
    new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        enc(`${String(account).toLowerCase()}\n${String(name).toLowerCase()}`),
      ),
    ),
  );
export async function pinGet(account, name) {
  try {
    const id = await pinId(account, name);
    return (await txIn('pins', 'readonly', s => s.get(id))) || null;
  } catch {
    return null;
  }
}
export async function pinSet(account, name, value) {
  try {
    const id = await pinId(account, name);
    await txIn('pins', 'readwrite', s => s.put(value, id));
  } catch {}
}

const rowMem = new Map();
export function rowGet(id) {
  const r = rowMem.get(String(id)) || null;
  return r && typeof r.s === 'string' && r.s.includes('=?') ? { ...r, s: decodeWords(r.s) } : r;
}
export async function rowLoad(ids) {
  const want = ids.map(String).filter(id => !rowMem.has(id));
  if (!want.length || !wrapKey) return;
  try {
    const db = await idb();
    const got = await new Promise((res, rej) => {
      const t = db.transaction('cache', 'readonly'),
        s = t.objectStore('cache'),
        out = {};
      for (const id of want) {
        const q = s.get(id);
        q.onsuccess = () => {
          if (q.result) out[id] = q.result;
        };
      }
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error);
    });
    await Promise.all(
      Object.entries(got).map(async ([id, v]) => {
        try {
          rowMem.set(
            id,
            JSON.parse(
              new TextDecoder().decode(
                await crypto.subtle.decrypt(
                  { name: 'AES-GCM', iv: v.iv, additionalData: enc(id) },
                  wrapKey,
                  v.data,
                ),
              ),
            ),
          );
        } catch {}
      }),
    );
  } catch {}
}
export async function rowPut(id, row) {
  id = String(id);
  rowMem.set(id, row);
  if (rowMem.size > 4000) rowMem.delete(rowMem.keys().next().value);
  if (!wrapKey) return;
  try {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: enc(id) },
      wrapKey,
      enc(JSON.stringify(row)),
    );
    await txIn('cache', 'readwrite', s => s.put({ iv, data }, id));
  } catch {}
}

const keptDb = () =>
  new Promise((res, rej) => {
    const r = indexedDB.open('foldoy-kept', 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('kept');
      r.result.createObjectStore('files');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error('blocked'));
  });
const keptTx = async (stores, mode, fn) => {
  const db = await keptDb();
  try {
    return await new Promise((res, rej) => {
      const t = db.transaction(stores, mode),
        q = fn(t);
      t.oncomplete = () => res(q && q.result);
      t.onerror = t.onabort = () => rej(t.error);
    });
  } finally {
    db.close();
  }
};
const sealTo = async (armoredKey, part) => {
  const o = await load();
  return o.encrypt({
    message: await o.createMessage(part),
    encryptionKeys: await o.readKey({ armoredKey }),
    format: part.binary ? 'binary' : 'armored',
  });
};
const filesOf = k => IDBKeyRange.bound(`${k}|`, `${k}|\uffff`);
export async function keptPut(address, id, words, files, armoredKey) {
  const k = `${address}|${id}`;
  const have = new Set(
    (await keptTx('files', 'readonly', t => t.objectStore('files').getAllKeys(filesOf(k)))) || [],
  );
  const fresh = [];
  for (const f of files)
    if (!have.has(`${k}|${f.id}`))
      fresh.push([`${k}|${f.id}`, await sealTo(armoredKey, { binary: f.bytes })]);
  const sealed = await sealTo(armoredKey, { text: JSON.stringify(words) }),
    now = new Set(files.map(f => `${k}|${f.id}`));
  await keptTx(['kept', 'files'], 'readwrite', t => {
    const fs = t.objectStore('files');
    for (const [fk, bytes] of fresh) fs.put(bytes, fk);
    for (const old of have) if (!now.has(old)) fs.delete(old);
    return t.objectStore('kept').put({ address, id, at: Date.now(), sealed }, k);
  });
}
export async function keptList() {
  return (await keptTx('kept', 'readonly', t => t.objectStore('kept').getAll())) || [];
}
export async function keptOpen(rec) {
  if (opening) await opening;
  const o = await load(),
    keys = [...ring.map(k => k.priv), ...extra];
  if (!keys.length) throw new Error('nokey');
  const words = JSON.parse(
      (
        await o.decrypt({
          message: await o.readMessage({ armoredMessage: rec.sealed }),
          decryptionKeys: keys,
        })
      ).data,
    ),
    files = {};
  const k = `${rec.address}|${rec.id}`;
  for (const f of words.files || []) {
    const m = await keptTx('files', 'readonly', t => t.objectStore('files').get(`${k}|${f.id}`));
    if (m)
      files[f.id] = (
        await o.decrypt({
          message: await o.readMessage({ binaryMessage: m }),
          decryptionKeys: keys,
          format: 'binary',
        })
      ).data;
  }
  return { words, files };
}
export async function keptDrop(address, id) {
  const k = `${address}|${id}`;
  await keptTx(['kept', 'files'], 'readwrite', t => {
    t.objectStore('files').delete(filesOf(k));
    return t.objectStore('kept').delete(k);
  });
}

export async function decrypt(armored, signerKey) {
  if (opening) await opening;
  const o = await load();
  const keys = [...ring.map(k => k.priv), ...extra];
  if (!keys.length) throw new Error('nokey');
  let data,
    signatures = [];
  const verificationKeys = signerKey ? [await o.readKey({ armoredKey: signerKey })] : undefined;
  try {
    ({ data, signatures } = await o.decrypt({
      message: await o.readMessage({ armoredMessage: armored }),
      decryptionKeys: keys,
      verificationKeys,
    }));
  } catch {
    throw new Error('nokey');
  }
  let verified = false;
  if (signerKey && signatures.length) {
    try {
      verified = (await signatures[0].verified) === true;
    } catch {
      verified = false;
    }
  }
  return { ...mime(data), verified, signed: signatures.length > 0 };
}

export async function encryptMail(
  { subject, text, html, files = [] },
  publicKeys,
  from,
  { hide = false, bcc = [] } = {},
) {
  if (opening) await opening;
  const o = await load();
  const keys = await Promise.all([...new Set(publicKeys)].map(k => o.readKey({ armoredKey: k })));
  const self = (from && ring.find(k => k.alias === from)?.priv) || acct();
  if (self) keys.push(self.toPublic());
  const b = 'fp' + b64(crypto.getRandomValues(new Uint8Array(12))).replace(/[^A-Za-z0-9]/g, '');
  const atts = files
    .map(
      f =>
        `\r\n--${b}\r\nContent-Type: ${safeType(f.type)}; name="${mimeName(f.name)}"\r\nContent-Disposition: attachment; filename="${mimeName(f.name)}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64(f.bytes).replace(/(.{76})/g, '$1\r\n')}`,
    )
    .join('');
  const bccLine = bcc.length
    ? `Bcc: ${bcc
        .map(a =>
          String(a)
            .replace(/[\r\n,]+/g, ' ')
            .trim(),
        )
        .filter(Boolean)
        .join(', ')}\r\n`
    : '';
  const inner = `Content-Type: multipart/mixed; boundary="${b}"; protected-headers="v1"\r\nSubject: ${(subject || '').replace(/[\r\n]+/g, ' ')}\r\n${bccLine}\r\n--${b}\r\n${toMime({ text, html })}${atts}\r\n--${b}--\r\n`;
  return o.encrypt({
    message: await o.createMessage({ text: inner }),
    encryptionKeys: keys,
    ...(self ? { signingKeys: self } : {}),
    ...(hide ? { wildcard: true } : {}),
  });
}
const safeType = t => (/^[\w.+-]+\/[\w.+-]+$/.test(t || '') ? t : 'application/octet-stream');
const mimeName = n =>
  String(n || 'file')
    .replace(/[\r\n"\\]/g, '_')
    .slice(0, 200);
export async function sealOnArrival(parts, public_key) {
  const o = await load();
  return o.encrypt({
    message: await o.createMessage({ text: toMime(parts) }),
    encryptionKeys: await o.readKey({ armoredKey: public_key }),
  });
}

const hname = n =>
  /^[\x20-\x7e]*$/.test(n) ? `"${n.replace(/["\\]/g, '\\$&')}"` : `=?UTF-8?B?${b64(enc(n))}?=`;
const person = names => a => {
  const n = (names?.[a] || '').replace(/[\r\n]/g, ' ').trim();
  return n ? `${hname(n)} <${a}>` : a;
};
export function rawMessage({ from, to = [], cc = [], armored, names }) {
  const b = 'pgp' + Math.random().toString(36).slice(2, 10),
    p = person(names);
  const head = `From: ${from}\r\n${to.length ? `To: ${to.map(p).join(', ')}\r\n` : ''}${cc.length ? `Cc: ${cc.map(p).join(', ')}\r\n` : ''}Subject: ...\r\nDate: ${new Date().toUTCString()}\r\nMIME-Version: 1.0\r\n`;
  const body = `Content-Type: multipart/encrypted; protocol="application/pgp-encrypted"; boundary="${b}"\r\n\r\n--${b}\r\nContent-Type: application/pgp-encrypted\r\n\r\nVersion: 1\r\n\r\n--${b}\r\nContent-Type: application/octet-stream; name="encrypted.asc"\r\n\r\n${armored}\r\n--${b}--\r\n`;
  return b64(enc(head + body));
}
export function armoredFromRaw(raw) {
  const t = new TextDecoder().decode(unb64(raw));
  return (t.match(/-----BEGIN PGP MESSAGE-----[\s\S]+?-----END PGP MESSAGE-----/) || [null])[0];
}

const W1252 =
  '\u20ac\u0081\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u008d\u017d\u008f\u0090\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u009d\u017e\u0178';
export function textOf(bytes, charset) {
  const cs = String(charset || '')
    .trim()
    .toLowerCase()
    .replace(/^["']|["']$/g, '')
    .replace(/\*.*$/, '');
  if (
    /^(windows-1252|cp1252|x-cp1252|iso-8859-1|iso8859-1|iso_8859-1|latin1|latin-1|l1|cp819|ibm819)$/.test(
      cs,
    )
  ) {
    let t = '';
    for (const b of bytes) t += b >= 0x80 && b < 0xa0 ? W1252[b - 0x80] : String.fromCharCode(b);
    return t;
  }
  if (cs && !/^(us-)?ascii$|^utf-?8$/.test(cs)) {
    try {
      return new TextDecoder(cs).decode(bytes);
    } catch {}
  }
  return new TextDecoder('utf-8').decode(bytes);
}
const latin = s => Uint8Array.from(s, c => c.charCodeAt(0) & 255);
const WORD = /=\?([^?\s]+)\?([bBqQ])\?([^?\s]*)\?=/;
const wordBytes = (e, t) => {
  if (e === 'b' || e === 'B') {
    try {
      const s = t.replace(/=+$/, '');
      if (!s || /[^A-Za-z0-9+/]/.test(s) || s.length % 4 === 1) return null;
      return unb64(s + '='.repeat((4 - (s.length % 4)) % 4));
    } catch {
      return null;
    }
  }
  return latin(
    t
      .replace(/_/g, ' ')
      .replace(/=([0-9A-Fa-f]{2})/g, (m, x) => String.fromCharCode(parseInt(x, 16))),
  );
};
export function decodeWords(s) {
  if (typeof s !== 'string' || !s.includes('=?')) return s;
  const parts = s
    .split(new RegExp(`(${WORD.source})`))
    .filter((x, i, a) => i % 5 === 0 || i % 5 === 1);
  let out = '',
    run = null;
  const flush = () => {
    if (run) {
      out += textOf(run.bytes, run.cs);
      run = null;
    }
  };
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (i % 2 === 0) {
      if (p === '' || (/^[ \t\r\n]+$/.test(p) && i > 0 && i < parts.length - 1)) continue;
      flush();
      out += p;
      continue;
    }
    const [, cs, e, t] = p.match(WORD);
    const b = wordBytes(e, t);
    if (!b) {
      flush();
      out += p;
      continue;
    }
    const name = cs.toLowerCase().replace(/\*.*$/, '');
    if (run && run.cs === name) {
      const j = new Uint8Array(run.bytes.length + b.length);
      j.set(run.bytes);
      j.set(b, run.bytes.length);
      run.bytes = j;
    } else {
      flush();
      run = { cs: name, bytes: b };
    }
  }
  flush();
  return out;
}
function param(h, name) {
  const pieces = [
    ...h.matchAll(new RegExp(`\\b${name}\\*(\\d+)?(\\*)?=("([^"]*)"|[^;\\s]+)`, 'gi')),
  ]
    .map(m => ({ n: +(m[1] || 0), enc: !!m[2] || (!m[1] && !m[2]), v: m[4] ?? m[3] }))
    .sort((a, b) => a.n - b.n);
  if (pieces.length) {
    let cs = 'utf-8';
    const bytes = [];
    pieces.forEach((p, i) => {
      let v = p.v;
      if (p.enc && i === 0) {
        const m = v.match(/^([^']*)'[^']*'(.*)$/);
        if (m) {
          cs = m[1] || cs;
          v = m[2];
        }
      }
      if (p.enc)
        for (const ch of v.replace(/%([0-9A-Fa-f]{2})/g, (x, hx) =>
          String.fromCharCode(parseInt(hx, 16)),
        ))
          bytes.push(ch.charCodeAt(0) & 255);
      else for (const ch of v) bytes.push(...new TextEncoder().encode(ch));
    });
    return textOf(new Uint8Array(bytes), cs);
  }
  const q =
    h.match(new RegExp(`\\b${name}="([^"]*)"`, 'i')) ||
    h.match(new RegExp(`\\b${name}=([^;\\s]+)`, 'i'));
  return q ? decodeWords(q[1]) : undefined;
}
export function mime(raw) {
  const out = { text: null, html: null, subject: null, files: [], bcc: null };
  const walk = (part, top) => {
    const cut = part.search(/\r?\n\r?\n/);
    const head = cut < 0 ? part : part.slice(0, cut),
      body = cut < 0 ? '' : part.slice(cut).replace(/^\r?\n\r?\n/, '');
    const h = head.replace(/\r?\n[ \t]+/g, ' ');
    if (top || (out.subject === null && /\bprotected-headers=/i.test(h))) {
      const sj = h.match(/^subject:[ \t]*(.*)$/im);
      if (sj) out.subject = decodeWords(sj[1]).trim();
    }
    if (top) {
      const bc = h.match(/^bcc:[ \t]*(.*)$/im);
      if (bc)
        out.bcc = bc[1]
          .split(',')
          .map(x => x.trim())
          .filter(Boolean);
    }
    const type = (h.match(/^content-type:\s*([^;\s]+)/im) || [, 'text/plain'])[1].toLowerCase();
    const te = (h.match(/^content-transfer-encoding:\s*(\S+)/im) || [, ''])[1].toLowerCase();
    const charset = ((h.match(/^content-type:.*$/im) || [''])[0].match(
      /\bcharset="?([^";\s]+)"?/i,
    ) || [])[1];
    if (type.startsWith('multipart/')) {
      const bd = (h.match(/boundary="?([^";]+)"?/i) || [])[1];
      if (!bd) return;
      const seg = body.split(
        new RegExp(
          `(?:^|\\r?\\n)--${bd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(--)?[ \\t]*(?:\\r?\\n|$)`,
        ),
      );
      for (let i = 1; i + 1 < seg.length; i += 2) {
        if (seg[i]) break;
        if (seg[i + 1].trim()) walk(seg[i + 1]);
      }
      return;
    }
    if (type === 'application/pgp-signature') return;
    const disp = (h.match(/^content-disposition:\s*([^;\s]+)/im) || [, ''])[1].toLowerCase();
    const fname = param(h, 'filename') || param(h, 'name');
    const cid = ((h.match(/^content-id:\s*<?([^>\s]+)>?/im) || [])[1] || '').toLowerCase() || null;
    if (disp === 'attachment' || ((fname || cid) && !type.startsWith('text/'))) {
      const packed = te === 'base64' ? body.replace(/\s+/g, '') : null;
      out.files.push({
        name: fname || 'attachment',
        type,
        cid,
        size: packed
          ? Math.floor((packed.length * 3) / 4) - (packed.match(/=+$/) || [''])[0].length
          : enc(body).length,
        bytes: () => (packed ? unb64(packed) : enc(body)),
      });
      return;
    }
    let txt = body;
    if (te === 'base64') {
      try {
        txt = textOf(unb64(body.replace(/\s+/g, '')), charset);
      } catch {}
    }
    if (te === 'quoted-printable')
      txt = textOf(
        latin(
          body
            .replace(/=\r?\n/g, '')
            .replace(/=([0-9A-F]{2})|[\s\S]/gi, (m, x) =>
              x ? String.fromCharCode(parseInt(x, 16)) : m,
            ),
        ),
        charset,
      );
    if (type === 'text/plain' && out.text === null)
      out.text = txt.replace(/\r\n/g, '\n').replace(/\n$/, '');
    if (type === 'text/html' && out.html === null) out.html = txt;
  };
  if (!/^[\w-]+:/m.test(raw.split(/\r?\n\r?\n/)[0] || ''))
    return { text: raw, html: null, subject: null, files: [] };
  walk(raw, true);
  return out;
}
export function toMime({ text, html }) {
  if (!html)
    return `Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${text || ''}`;
  const b = 'fo' + Math.random().toString(36).slice(2, 10);
  return `Content-Type: multipart/alternative; boundary="${b}"\r\n\r\n--${b}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${text || ''}\r\n--${b}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${html}\r\n--${b}--\r\n`;
}

const fmt = f =>
  f
    .toUpperCase()
    .replace(/(.{4})/g, '$1 ')
    .trim();
export async function fingerprint(public_key) {
  const o = await load();
  return fmt((await o.readKey({ armoredKey: public_key })).getFingerprint());
}
export async function keyIds(public_key) {
  const o = await load();
  return (await o.readKey({ armoredKey: public_key })).getKeyIDs().map(k => k.toHex());
}
export async function encryptedTo(armored) {
  const o = await load();
  return new Set(
    (await o.readMessage({ armoredMessage: armored })).getEncryptionKeyIDs().map(k => k.toHex()),
  );
}
export async function checkKey(public_key, address) {
  const o = await load();
  const k = await o.readKey({ armoredKey: public_key });
  if (k.isPrivate()) throw new Error('bad-key');
  const ids = k.getUserIDs().map(u => (u.match(/<([^>]+)>/) || [, u])[1].trim().toLowerCase());
  return {
    fingerprint: fmt(k.getFingerprint()),
    matches: ids.includes(String(address).toLowerCase()),
  };
}
export async function verifyOwn(armored) {
  if (opening) await opening;
  const o = await load();
  const me = acct();
  if (!me) return null;
  const { data, signatures } = await o.decrypt({
    message: await o.readMessage({ armoredMessage: armored }),
    decryptionKeys: [me],
    verificationKeys: [me.toPublic()],
  });
  try {
    if (!signatures.length || (await signatures[0].verified) !== true) return null;
  } catch {
    return null;
  }
  return mime(data);
}
export async function myFingerprint() {
  if (opening) await opening;
  const k = acct();
  return k ? fmt(k.getFingerprint()) : null;
}

export async function readPublic(text) {
  const o = await load();
  if (/PRIVATE KEY BLOCK/.test(text))
    throw new Error('That is a private key. Paste the public key; the private one stays with you.');
  let k;
  try {
    k = await o.readKey({ armoredKey: text.trim() });
  } catch {
    throw new Error("That doesn't read as an OpenPGP public key.");
  }
  if (k.isPrivate())
    throw new Error('That is a private key. Paste the public key; the private one stays with you.');
  return { public_key: k.armor(), fingerprint: fmt(k.getFingerprint()) };
}
export async function loadForTab(text, passphrase) {
  const o = await load();
  const blocks = text.match(
    /-----BEGIN PGP PRIVATE KEY BLOCK-----[\s\S]+?-----END PGP PRIVATE KEY BLOCK-----/g,
  ) || [text];
  const got = [];
  for (const blk of blocks) {
    let k;
    try {
      k = await o.readPrivateKey({ armoredKey: blk.trim() });
    } catch {
      throw new Error("That doesn't read as an OpenPGP private key.");
    }
    if (!k.isDecrypted()) {
      try {
        k = await o.decryptKey({ privateKey: k, passphrase: (passphrase || '').trim() });
      } catch {
        throw new Error("That passphrase or recovery code doesn't open the key.");
      }
    }
    got.push(k);
  }
  extra.push(...got);
  return fmt(got[0].getFingerprint());
}

export async function keyFile(address) {
  if (opening) await opening;
  if (!ring.length) throw new Error('Your key is not loaded on this device.');
  const o = await load();
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
    r = crypto.getRandomValues(new Uint8Array(24));
  const code = Array.from(r, x => A[x % 32])
    .join('')
    .replace(/(.{4})(?!$)/g, '$1-');
  const blocks = [];
  for (const k of ring)
    blocks.push(
      `${k.alias || address}\n${(await o.encryptKey({ privateKey: await o.readPrivateKey({ binaryKey: k.priv.write() }), passphrase: code })).armor()}`,
    );
  const txt = `foldoy mail keys\n${address}\nMade ${new Date().toISOString().slice(0, 10)}\n\nYour private keys (your address and each alias), encrypted with the passphrase shown when you downloaded this file.\nAny PGP app (gpg, Thunderbird) opens your mail with them. The passphrase is not in this file. Keep them apart.\n\n${blocks.join('\n\n')}\n`;
  return { blob: new Blob([txt], { type: 'text/plain' }), code };
}

export async function armorKeys(privs, passphrase) {
  const o = await load();
  const parts = [];
  for (const p of privs)
    parts.push(
      (
        await o.encryptKey({
          privateKey: await o.readPrivateKey({ binaryKey: p.write() }),
          passphrase,
        })
      ).write(),
    );
  const bytes = new Uint8Array(parts.reduce((n, x) => n + x.length, 0));
  let at = 0;
  for (const x of parts) {
    bytes.set(x, at);
    at += x.length;
  }
  return o.armor(o.enums.armor.privateKey, bytes, undefined, undefined, undefined, true);
}
export async function appKeyFile() {
  if (opening) await opening;
  if (!ring.length) throw new Error('Your key is not loaded on this device.');
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
    r = crypto.getRandomValues(new Uint8Array(24));
  const code = Array.from(r, x => A[x % 32])
    .join('')
    .replace(/(.{4})(?!$)/g, '$1-');
  const seen = new Set(),
    privs = ring
      .map(k => k.priv)
      .filter(p => !seen.has(p.getFingerprint()) && seen.add(p.getFingerprint()));
  return {
    blob: new Blob([await armorKeys(privs, code)], { type: 'application/pgp-keys' }),
    code,
    count: privs.length,
  };
}

export function publicFile(address, keys) {
  const cur = (keys || []).filter(k => k.current !== false && !k.stale && k.public_key);
  return new Blob(
    [cur.map(k => `${k.alias || address}\n${k.public_key.trim()}`).join('\n\n') + '\n'],
    { type: 'application/pgp-keys' },
  );
}

export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

const RC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newRecoveryCode() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), x => RC[x % 32])
    .join('')
    .replace(/(.{4})(?!$)/g, '$1-');
}
export const normCode = s =>
  String(s || '')
    .toUpperCase()
    .replace(/[\s-]/g, '');
export const codeShape = s =>
  normCode(s).length === 32 && [...normCode(s)].every(c => RC.includes(c));
async function deriveRecovery(code, kdf) {
  const master = await masterKey(normCode(code), kdf);
  const hk = await crypto.subtle.importKey('raw', master, 'HKDF', false, [
    'deriveBits',
    'deriveKey',
  ]);
  const rauth = b64(
    new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: 'HKDF',
          hash: 'SHA-256',
          salt: new Uint8Array(0),
          info: enc('foldoy recovery auth'),
        },
        hk,
        256,
      ),
    ),
  );
  const rwrap = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc('foldoy recovery wrap') },
    hk,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  return { rauth, rwrap };
}
export const recoveryAuth = async (code, kdf) => (await deriveRecovery(code, kdf)).rauth;
async function copyOf(priv, recPub) {
  const o = await load();
  return o.encrypt({
    message: await o.createMessage({ binary: priv.write() }),
    encryptionKeys: await o.readKey({ armoredKey: recPub }),
    format: 'armored',
  });
}
export async function makeRecovery(code) {
  if (opening) await opening;
  const kdf = newKdf();
  const { rauth, rwrap } = await deriveRecovery(code, kdf);
  const { privateKey, publicKey: bare } = await gen('');
  const me = acct();
  const publicKey = me ? await bare.signPrimaryUser([me]) : bare;
  const recovery = {
    kdf,
    rauth,
    public_key: publicKey.armor(),
    ...(await seal(rwrap, privateKey.write())),
  };
  const copies = [];
  for (const k of ring)
    copies.push({ id: k.id, alias: k.alias, rcopy: await copyOf(k.priv, recovery.public_key) });
  await checkCopies(privateKey, copies);
  return { recovery, copies };
}
export async function recoveryCertified(recPub) {
  if (opening) await opening;
  const o = await load();
  const me = acct();
  if (!me || !recPub) return false;
  try {
    return (
      await (await o.readKey({ armoredKey: recPub })).verifyPrimaryUser([me.toPublic()])
    ).some(x => x.valid === true);
  } catch {
    return false;
  }
}
async function checkCopies(pair, copies) {
  const o = await load();
  for (const c of copies) {
    const { data } = await o.decrypt({
      message: await o.readMessage({ armoredMessage: c.rcopy }),
      decryptionKeys: pair,
      format: 'binary',
    });
    const k =
      ring.find(x => x.id === c.id && x.alias === c.alias) || ring.find(x => x.alias === c.alias);
    if (!k || b64(data) !== b64(k.priv.write()))
      throw new Error('A recovery copy did not check out. Try again.');
  }
}
export async function copiesFor(recPub, which = () => true) {
  if (opening) await opening;
  const out = [];
  for (const k of ring)
    if (which(k)) out.push({ id: k.id, alias: k.alias, rcopy: await copyOf(k.priv, recPub) });
  return out;
}
export async function copyForAddress(address, recPub) {
  if (opening) await opening;
  const k = ring.find(x => x.alias === address);
  return k ? copyOf(k.priv, recPub) : null;
}
export async function openCopies(code, kdf, sealed, keys) {
  const o = await load();
  const { rwrap } = await deriveRecovery(code, kdf);
  let pair;
  try {
    pair = await o.readPrivateKey({ binaryKey: await open(rwrap, sealed) });
  } catch {
    throw new Error('wrong');
  }
  const out = [];
  for (const k of keys || []) {
    if (!k.rcopy) continue;
    try {
      const { data } = await o.decrypt({
        message: await o.readMessage({ armoredMessage: k.rcopy }),
        decryptionKeys: pair,
        format: 'binary',
      });
      const priv = await o.readPrivateKey({ binaryKey: data });
      if (await sameKey(o, priv, k.public_key))
        out.push({ id: k.id, alias: k.alias || null, stale: !!k.stale, priv });
    } catch {}
  }
  out.pair = pair.toPublic().armor();
  return out;
}
export async function wrapOpened(opened, password) {
  if (opening) await opening;
  const kdf = newKdf();
  const { auth, wrap } = await derive(password, kdf);
  const keys = [];
  for (const k of opened) keys.push({ id: k.id, ...(await seal(wrap, k.priv.write())) });
  ring = opened.filter(k => !k.stale).map(k => ({ id: k.id, alias: k.alias, priv: k.priv }));
  wrapKey = wrap;
  return { auth, kdf, keys };
}
export async function rewrapOpened(opened) {
  if (opening) await opening;
  if (!wrapKey) throw new Error('Your key is not loaded on this device.');
  const keys = [];
  for (const k of opened) keys.push({ id: k.id, ...(await seal(wrapKey, k.priv.write())) });
  return keys;
}
export function addToRing(opened) {
  for (const k of opened)
    if (!ring.some(x => x.id === k.id)) ring.push({ id: k.id, alias: k.alias, priv: k.priv });
}

async function derivePP(pkey, kdf) {
  const master = await masterKey(pkey, kdf);
  const hk = await crypto.subtle.importKey('raw', master, 'HKDF', false, [
    'deriveBits',
    'deriveKey',
  ]);
  const pauth = b64(
    new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: 'HKDF',
          hash: 'SHA-256',
          salt: new Uint8Array(0),
          info: enc('foldoy privacy auth'),
        },
        hk,
        256,
      ),
    ),
  );
  const pwrap = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc('foldoy privacy wrap') },
    hk,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  return { pauth, pwrap };
}
export const ppAuth = async (pkey, kdf) => (await derivePP(pkey, kdf)).pauth;
export async function ppWrapAll(pkey) {
  if (opening) await opening;
  if (!ring.length) throw new Error('Your key is not loaded on this device.');
  const kdf = newKdf();
  const { pauth, pwrap } = await derivePP(pkey, kdf);
  const keys = [];
  for (const k of ring) keys.push({ id: k.id, ...(await seal(pwrap, k.priv.write())) });
  wrapKey = pwrap;
  return { pauth, kdf, keys };
}
export async function ppUnwrapAll(pkey, ppKdf, password, kdf) {
  if (opening) await opening;
  if (!ring.length) throw new Error('Your key is not loaded on this device.');
  const { pauth } = await derivePP(pkey, ppKdf);
  const { auth, wrap } = await derive(password, kdf);
  const keys = [];
  for (const k of ring) keys.push({ id: k.id, ...(await seal(wrap, k.priv.write())) });
  return {
    pauth,
    auth,
    keys,
    done: () => {
      wrapKey = wrap;
    },
  };
}
export async function ppUnlock(pkey, ppKdf, keys) {
  if (!kdfOk(ppKdf)) throw new Error('weak-kdf');
  const { pwrap } = await derivePP(pkey, ppKdf);
  return unlockAll(pwrap, keys);
}
export async function ppBackup(address, pkey) {
  if (opening) await opening;
  if (!ring.length) throw new Error('Your key is not loaded on this device.');
  const o = await load();
  const blocks = [];
  for (const k of ring)
    blocks.push(
      `${k.alias || address}\n${(await o.encryptKey({ privateKey: await o.readPrivateKey({ binaryKey: k.priv.write() }), passphrase: pkey })).armor()}`,
    );
  const txt = `foldoy privacy+ backup\n${address}\nMade ${new Date().toISOString().slice(0, 10)}\n\nYour private keys (your address and each alias), encrypted with your privacy+ key. Any PGP app opens them with that key.\nWe don't have this file or your privacy+ key, and can't reset either.\n\n${blocks.join('\n\n')}\n`;
  return new Blob([txt], { type: 'text/plain' });
}

export async function lockWithPassword({ subject, text }, password) {
  const o = await load();
  const message = await o.createMessage({ text: JSON.stringify({ v: 1, subject, text }) });
  return o.encrypt({
    message,
    passwords: [password],
    format: 'armored',
    config: {
      s2kType: o.enums.s2k.argon2,
      s2kArgon2Params: { passes: 3, parallelism: 1, memoryExponent: 16 },
    },
  });
}
export const newLockPassword = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(20)), x => RC[x % 32])
    .join('')
    .replace(/(.{4})(?!$)/g, '$1-');
export async function openWithPassword(armored, password) {
  const o = await load();
  const message = await o.readMessage({ armoredMessage: armored });
  const { data } = await o.decrypt({ message, passwords: [password], format: 'utf8' });
  const d = JSON.parse(data);
  return { subject: String(d.subject || ''), text: String(d.text || '') };
}
