# foldoy mail

The web client of [foldoy](https://foldoy.com): the sign-up and log-in pages, the inbox, and the page that opens a
password-encrypted message. This is the code the site sends to your browser. The server is not in this repository.

## What happens in the browser

- **Your password stays on your device.** Argon2id turns it into a master key, and HKDF splits that into two values:
  one is sent to the server to sign in, the other wraps your private key (`static/mail/shared/pgp.js`).
- **Mail is OpenPGP.** Messages are PGP/MIME with protected headers, so the real subject travels inside the
  encrypted part. Keys are generated here and stored on the server only in wrapped form.
- **HTML mail is cleaned before it is shown.** DOMPurify runs with a strict allow-list (`static/mail/shared/clean.js`),
  and the result is displayed in a sandboxed frame that cannot run scripts.
- **Search is local.** The index is built and kept on the device by a worker (`static/mail/shared/search-*.js`).

## Layout

| Path | What it is |
| --- | --- |
| `static/mail/shared/api.js` | Every request to the server, and the sign-up, log-in and mail steps built on them |
| `static/mail/shared/pgp.js` | Key derivation, key wrapping, encrypting and decrypting mail |
| `static/mail/shared/clean.js` | The rules for showing HTML mail |
| `static/mail/shared/ui.js` | Small helpers: escaping, icons, notices |
| `static/mail/inbox/` | The inbox: list, reader, compose, settings, aliases |
| `static/mail/signup/` | Sign-up and log-in |
| `static/mail/locked/` | The page a recipient opens for a password-encrypted message |
| `static/mail/shared/vendor/` | The three bundled libraries |
| `templates/mail/` | The HTML pages that load the scripts |

There is no framework and no bundler. The browser loads these files directly, most of them as ES modules.

## Differences from what the site serves

This repository is produced from the site's source by a script. It leaves out what belongs to the site and not to
the mail client: the staff panel, links to other pages of the site, and the site's shared header and footer. A few
lines therefore differ from the files the site serves.

## Bundled libraries

| File | Package | Upstream file |
| --- | --- | --- |
| `openpgp.min.js` | [openpgp](https://www.npmjs.com/package/openpgp) 6.3.3 | `dist/openpgp.min.mjs`, without its last line |
| `purify-3.4.18.es.js` | [dompurify](https://www.npmjs.com/package/dompurify) 3.4.18 | `dist/purify.es.mjs`, without its last line |
| `argon2.umd.min.js` | [hash-wasm](https://www.npmjs.com/package/hash-wasm) 4.13.0 | `dist/argon2.umd.min.js`, unchanged |

The removed last line is the pointer to a source map that is not shipped. The libraries are bundled so that the
client loads nothing from another host and a release cannot change under it. To check them against npm:

```sh
sh tools/verify-vendor.sh
```

## Formatting

Prettier 3.10.1 with the settings in `.prettierrc.json`. The bundled libraries are left as shipped.

## Security

Write to support@foldoy.com.

## Licence

AGPL-3.0, see `LICENSE`. The bundled libraries keep their own licences, beside them in `static/mail/shared/vendor/`.
