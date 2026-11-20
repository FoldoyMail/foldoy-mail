import DOMPurify from './vendor/purify-3.4.17.es.js';

const TAGS = ['a', 'abbr', 'b', 'blockquote', 'br', 'caption', 'center', 'code', 'col', 'colgroup', 'dd', 'del', 'div', 'dl', 'dt', 'em', 'font',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'ins', 'kbd', 'li', 'mark', 'ol', 'p', 'pre', 'q', 's', 'small', 'span', 'strike',
  'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'tt', 'u', 'ul', 'p'];
const ATTRS = ['align', 'dir', 'lang', 'title', 'style', 'width', 'height', 'valign', 'bgcolor', 'color', 'border', 'href', 'src', 'alt', 'colspan',
  'rowspan', 'start', 'cellpadding', 'cellspacing', 'face', 'size', 'span', 'class', 'id'];
const STYLE = new Set(['color', 'background-color', 'font', 'font-family', 'font-size', 'font-style', 'font-weight', 'text-align', 'text-decoration',
  'text-transform', 'line-height', 'letter-spacing', 'white-space', 'vertical-align', 'width', 'max-width', 'min-width', 'height', 'max-height',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border', 'border-top', 'border-right', 'border-bottom', 'border-left', 'border-color', 'border-style', 'border-width', 'border-collapse',
  'border-spacing', 'border-radius', 'display', 'table-layout', 'word-break', 'overflow-wrap']);
const LOCAL_IMG = /^(cid:|data:image\/(png|jpeg|gif|webp)[;,])/i;
const TRACKER_HOST = /(^|\.)(list-manage\.com|mailchimp\.com|mcsv\.net|sendgrid\.net|mandrillapp\.com|hubspot(email)?\.(com|net)|hs-analytics\.net|mailgun\.(org|net)|exacttarget\.com|exct\.net|klaviyo(mail)?\.com|sparkpostmail\.com|mailjet\.com|createsend\.com|cmail\d*\.com|customer\.io|intercom-mail\.com|pardot\.com|mktoweb\.com|marketo\.com|substack\.com|convertkit-mail\d*\.com|sendinblue\.com|brevo\.com|mixpanel\.com|google-analytics\.com|doubleclick\.net|facebook\.com|linkedin\.com\/emimp)$/i;
const TRACKER_PATH = /(\/(open|opened|track|tracking|pixel|beacon|wf\/open|e\/o|o\.gif|t\.gif)[\/._?]|[?&](utm_|mc_eid=|_hsenc=))/i;
const LINK_TAGS = /^(utm_[a-z]+|fbclid|gclid|dclid|msclkid|yclid|igshid|mc_cid|mc_eid|_hsenc|_hsmi|mkt_tok|vero_id|oly_enc_id|oly_anon_id|ck_subscriber_id|s_cid|trk|trkCampaign)$/i;
function isTracker(node, src) {
  const w = parseInt(node.getAttribute('width') || '', 10), h = parseInt(node.getAttribute('height') || '', 10);
  const st = (node.getAttribute('style') || '').toLowerCase().replace(/\s/g, '');
  if ((w >= 0 && w <= 2) || (h >= 0 && h <= 2) || /display:none|visibility:hidden|(width|height):[0-2]px|opacity:0(;|$)/.test(st)) return true;
  try { const u = new URL(src.startsWith('//') ? 'https:' + src : src); return TRACKER_HOST.test(u.hostname) || TRACKER_PATH.test(u.pathname + u.search); } catch { return false; }
}
export function untag(href) {
  try {
    const u = new URL(href); if (!/^https?:$/.test(u.protocol)) return href;
    let cut = false;
    for (const k of [...u.searchParams.keys()]) if (LINK_TAGS.test(k)) { u.searchParams.delete(k); cut = true; }
    return cut ? u.href : href;
  } catch { return href; }
}
const REMOTE = /^(https?:|\/\/)/i;

function cleanStyle(v) {
  const out = [];
  for (const decl of String(v).split(';')) {
    const i = decl.indexOf(':'); if (i < 0) continue;
    const prop = decl.slice(0, i).trim().toLowerCase(), val = decl.slice(i + 1).trim();
    const low = val.toLowerCase();
    if (!STYLE.has(prop) || low.includes('url(') || low.includes('expression(') || low.includes('@import') || val.includes('\\')) continue;
    out.push(`${prop}: ${val}`);
  }
  return out.join('; ');
}

const SHEET_PREFIX = /^(margin|padding|border|font|text-decoration|text-|list-style-type|outline-(color|style|width)$|overflow|min-|max-|background-color$)/;
const SHEET_EXTRA = new Set(['float', 'clear', 'box-sizing', 'direction', 'opacity', 'visibility', 'word-wrap', 'mso-hide', 'text-indent', 'caption-side', 'empty-cells']);
const sheetProp = p => (STYLE.has(p) || SHEET_EXTRA.has(p) || SHEET_PREFIX.test(p)) && !/image|source|^border-image/.test(p);
const LOADS = /url\(|image\(|image-set\(|cross-fade\(|element\(|expression\(|src\(/i;
function rules(list, out) {
  for (const r of list) {
    if (r.type === 1) {
      const d = [];
      for (let i = 0; i < r.style.length; i++) {
        const p = r.style[i], v = r.style.getPropertyValue(p);
        if (sheetProp(p) && !LOADS.test(v)) d.push(`${p}:${v}${r.style.getPropertyPriority(p) ? '!important' : ''}`);
      }
      if (d.length) out.push(`${r.selectorText}{${d.join(';')}}`);
    } else if (r.type === 4 && !/prefers-color-scheme/i.test(r.conditionText || r.media?.mediaText || '')) {
      const inner = []; rules(r.cssRules, inner);
      if (inner.length) out.push(`@media ${r.media.mediaText}{${inner.join('')}}`);
    }
  }
}
function sheet(texts) {
  if (!texts.length || typeof CSSStyleSheet !== 'function' || !('replaceSync' in CSSStyleSheet.prototype)) return '';
  const out = [];
  for (const t of texts) {
    if (t.length > 100000) continue;
    try { const s = new CSSStyleSheet(); s.replaceSync(t); rules(s.cssRules, out); } catch {}
  }
  return out.join('\n').replace(/</g, '\\3c ');
}
const STYLED = /\bbgcolor=|background|(^|[\s;"'{])color\s*:|<font[^>]*\bcolor=/i;

export const proxied = src => `${location.origin}/mail/api/img?u=${encodeURIComponent(src.startsWith('//') ? 'https:' + src : src)}`;

export function cleanHtml(html, { images = false, cids = {} } = {}) {
  let held = 0, trackers = 0;
  const usedCids = new Set();
  const P = DOMPurify(window);
  let css = '';
  try { css = sheet([...new DOMParser().parseFromString(String(html || ''), 'text/html').querySelectorAll('style')].map(s => s.textContent || '')); } catch {}
  P.addHook('beforeSanitizeAttributes', node => {
    if (node.tagName !== 'IMG') return;
    const s = (node.getAttribute('src') || '').trim();
    if (/^cid:/i.test(s)) {
      let id = s.slice(4); try { id = decodeURIComponent(id); } catch {}
      const url = cids[id.replace(/^<|>$/g, '').toLowerCase()];
      if (url) { node.setAttribute('src', url); usedCids.add(id.toLowerCase()); } else node.removeAttribute('src');
      node.removeAttribute('srcset'); return;
    }
    if (LOCAL_IMG.test(s)) return;
    if (REMOTE.test(s) && isTracker(node, s)) { trackers++; node.removeAttribute('src'); node.removeAttribute('srcset'); node.setAttribute('width', '0'); node.setAttribute('height', '0'); return; }
    if (REMOTE.test(s) && images) { node.setAttribute('src', proxied(s)); node.removeAttribute('srcset'); return; }
    if (REMOTE.test(s)) held++;
    node.removeAttribute('src'); node.removeAttribute('srcset');
  });
  P.addHook('afterSanitizeAttributes', node => {
    if (node.hasAttribute('style')) { const s = cleanStyle(node.getAttribute('style')); if (s) node.setAttribute('style', s); else node.removeAttribute('style'); }
    if (node.tagName === 'A') {
      const h = (node.getAttribute('href') || '').trim();
      if (/^(data:|cid:)/i.test(h)) node.removeAttribute('href');
      else if (h) node.setAttribute('href', untag(h));
      node.setAttribute('target', '_blank'); node.setAttribute('rel', 'noopener noreferrer nofollow');
    }
  });
  const clean = P.sanitize(String(html || ''), {
    ALLOWED_TAGS: TAGS, ALLOWED_ATTR: ATTRS, ALLOW_DATA_ATTR: false, ALLOW_ARIA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|cid):|data:image\/(?:png|jpeg|gif|webp)[;,])/i,
    ADD_URI_SAFE_ATTR: ATTRS.filter(a => a !== 'href' && a !== 'src'),
    FORBID_TAGS: ['style', 'script', 'title', 'head', 'noscript', 'template', 'textarea', 'select', 'button', 'iframe', 'object', 'embed', 'svg', 'math', 'form', 'audio', 'video', 'link', 'meta', 'base'],
    KEEP_CONTENT: true, WHOLE_DOCUMENT: false,
  });
  return { html: clean, css, held, trackers, usedCids, styled: !!css || STYLED.test(clean) };
}
