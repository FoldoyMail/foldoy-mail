#!/bin/sh
# Checks the three bundled libraries against the packages published on npm.
#
#   openpgp.min.js        openpgp 6.3.3      dist/openpgp.min.mjs, without its last line (the source map pointer)
#   purify-3.4.18.es.js   dompurify 3.4.18   dist/purify.es.mjs, without its last line (the source map pointer)
#   argon2.umd.min.js     hash-wasm 4.13.0   dist/argon2.umd.min.js, unchanged
#
# Needs npm, tar, sed and sha256sum. Run from the repository's root:  sh tools/verify-vendor.sh
set -eu
V=static/mail/shared/vendor
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
fail=0

fetch() {
  (cd "$T" && npm pack --silent "$1" >/dev/null && mkdir "$2" && tar -xzf ./*.tgz -C "$2" && rm ./*.tgz)
}
sum() {
  sha256sum | cut -c1-64
}
check() {
  if [ "$2" = "$3" ]; then
    echo "ok         $1  $2"
  else
    echo "DIFFERENT  $1  here $2  upstream $3"
    fail=1
  fi
}

fetch openpgp@6.3.3 openpgp
fetch dompurify@3.4.18 dompurify
fetch hash-wasm@4.13.0 hash-wasm

check openpgp.min.js "$(sum <"$V/openpgp.min.js")" "$(sed '$d' "$T/openpgp/package/dist/openpgp.min.mjs" | sum)"
check purify-3.4.18.es.js "$(sum <"$V/purify-3.4.18.es.js")" "$(sed '$d' "$T/dompurify/package/dist/purify.es.mjs" | sum)"
check argon2.umd.min.js "$(sum <"$V/argon2.umd.min.js")" "$(sum <"$T/hash-wasm/package/dist/argon2.umd.min.js")"

exit $fail
