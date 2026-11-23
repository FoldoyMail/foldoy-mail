import { openWithPassword } from '../shared/pgp.js';

const $ = s => document.querySelector(s);
const token = location.pathname.split('/').filter(Boolean)[1] || '';
let data = null;

(async () => {
  const r = await fetch(`/locked/${encodeURIComponent(token)}/data`, {
    credentials: 'omit',
    cache: 'no-store',
  }).catch(() => null);
  const d = r ? await r.json().catch(() => ({})) : {};
  if (!r || !r.ok) {
    $('#lockh').textContent =
      r && r.status === 404 ? 'This message is gone' : 'This message can’t be opened now';
    $('#lockfrom').textContent = d.error || 'Try again in a few minutes.';
    return;
  }
  data = d;
  const until = new Date(d.expires).toLocaleString([], {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
  $('#lockfrom').textContent =
    `From ${d.from}. It opens with the password they gave you, until ${until}.`;
  if (d.hint) $('#lockhint').textContent = `Hint: ${d.hint}`;
  $('#lockfields').hidden = false;
  $('#lockacts').hidden = false;
  $('#lockpw').focus();
})();

$('#lockshow').onclick = () => {
  const i = $('#lockpw');
  i.type = i.type === 'password' ? 'text' : 'password';
  $('#lockshow').textContent = i.type === 'password' ? 'Show' : 'Hide';
};
$('#lockf').addEventListener('submit', async e => {
  e.preventDefault();
  if (!data) return;
  const pw = $('#lockpw').value,
    b = $('#lockgo'),
    err = $('#lockerr');
  err.textContent = '';
  if (!pw) {
    err.textContent = 'Type the password.';
    return;
  }
  b.setAttribute('aria-busy', 'true');
  b.textContent = 'Opening…';
  try {
    const m = await openWithPassword(data.armored, pw);
    $('#lockf').hidden = true;
    $('#lockmsg').hidden = false;
    $('#locksubj').textContent = m.subject || '(no subject)';
    $('#lockmeta').textContent = `From ${data.from}`;
    $('#lockbody').textContent = m.text;
    $('#locksubj').focus();
  } catch {
    err.textContent = 'That password doesn’t open it.';
    $('#lockpw').select();
  } finally {
    b.removeAttribute('aria-busy');
    b.textContent = 'Open';
  }
});

document.addEventListener(
  'pointerdown',
  e => {
    if (e.pointerType !== 'mouse' && e.target.closest?.('.field > button.end')) e.preventDefault();
  },
  true,
);
