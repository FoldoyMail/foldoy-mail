const K = new Int32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const IV = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];
const W = new Int32Array(64);

function compress(s, m, o) {
  for (let i = 0; i < 16; i++)
    W[i] =
      (m[o + 4 * i] << 24) | (m[o + 4 * i + 1] << 16) | (m[o + 4 * i + 2] << 8) | m[o + 4 * i + 3];
  for (let i = 16; i < 64; i++) {
    const a = W[i - 15],
      b = W[i - 2];
    W[i] =
      ((((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3)) +
        W[i - 16] +
        (((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10)) +
        W[i - 7]) |
      0;
  }
  let a = s[0],
    b = s[1],
    c = s[2],
    d = s[3],
    e = s[4],
    f = s[5],
    g = s[6],
    h = s[7];
  for (let i = 0; i < 64; i++) {
    const t1 =
      (h +
        (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) +
        ((e & f) ^ (~e & g)) +
        K[i] +
        W[i]) |
      0;
    const t2 =
      ((((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) +
        ((a & b) ^ (a & c) ^ (b & c))) |
      0;
    h = g;
    g = f;
    f = e;
    e = (d + t1) | 0;
    d = c;
    c = b;
    b = a;
    a = (t1 + t2) | 0;
  }
  s[0] = (s[0] + a) | 0;
  s[1] = (s[1] + b) | 0;
  s[2] = (s[2] + c) | 0;
  s[3] = (s[3] + d) | 0;
  s[4] = (s[4] + e) | 0;
  s[5] = (s[5] + f) | 0;
  s[6] = (s[6] + g) | 0;
  s[7] = (s[7] + h) | 0;
}

const zeroBits = s => {
  let n = 0;
  for (let i = 0; i < 8; i++) {
    if (s[i] === 0) {
      n += 32;
      continue;
    }
    return n + Math.clz32(s[i]);
  }
  return n;
};

export function search(challenge, bits, from, to) {
  const pre = new TextEncoder().encode(`${challenge}:`),
    full = pre.length & ~63,
    tail = pre.length - full;
  const mid = Int32Array.from(IV);
  for (let o = 0; o < full; o += 64) compress(mid, pre, o);
  const m = new Uint8Array(128),
    s = new Int32Array(8);
  m.set(pre.subarray(full));
  for (let nonce = from; nonce < to; nonce++) {
    const digits = String(nonce),
      len = tail + digits.length,
      blocks = len + 9 > 64 ? 2 : 1,
      end = blocks * 64;
    for (let i = 0; i < digits.length; i++) m[tail + i] = digits.charCodeAt(i);
    m.fill(0, len, end);
    m[len] = 0x80;
    const bitLen = (full + len) * 8;
    m[end - 4] = bitLen >>> 24;
    m[end - 3] = bitLen >>> 16;
    m[end - 2] = bitLen >>> 8;
    m[end - 1] = bitLen;
    s.set(mid);
    compress(s, m, 0);
    if (blocks === 2) compress(s, m, 64);
    if (zeroBits(s) >= bits) return nonce;
  }
  return -1;
}

export function sha256Words(text) {
  const b = new TextEncoder().encode(text),
    len = ((b.length + 9 + 63) >> 6) << 6,
    m = new Uint8Array(len),
    s = Int32Array.from(IV);
  m.set(b);
  m[b.length] = 0x80;
  const bitLen = b.length * 8;
  m[len - 4] = bitLen >>> 24;
  m[len - 3] = bitLen >>> 16;
  m[len - 2] = bitLen >>> 8;
  m[len - 1] = bitLen;
  for (let o = 0; o < len; o += 64) compress(s, m, o);
  return Array.from(s, x => x >>> 0);
}

function onPage(challenge, bits) {
  return new Promise(resolve => {
    let from = 0;
    const slice = () => {
      const n = search(challenge, bits, from, from + 20000);
      if (n >= 0) return resolve({ challenge, nonce: String(n) });
      from += 20000;
      setTimeout(slice, 0);
    };
    slice();
  });
}

export function solve(challenge, bits) {
  let w;
  try {
    w = new Worker(document.body.dataset.powWorker || new URL('./pow-worker.js', import.meta.url), {
      type: 'module',
    });
  } catch (_) {
    return onPage(challenge, bits);
  }
  return new Promise(resolve => {
    const done = r => {
      w.terminate();
      resolve(r);
    };
    w.onmessage = e => done({ challenge, nonce: String(e.data) });
    w.onerror = e => {
      e.preventDefault?.();
      w.terminate();
      onPage(challenge, bits).then(resolve);
    };
    w.postMessage({ challenge, bits });
  });
}
