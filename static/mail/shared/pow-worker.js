import { search } from './pow.js';

onmessage = e => postMessage(search(e.data.challenge, e.data.bits, 0, Number.MAX_SAFE_INTEGER));
