#!/usr/bin/env bash
# Build the Paulice check-picking core to WebAssembly and emit the JS bindings
# into the web app (web/src/wasm/).
#
# Requires: rustup wasm32-unknown-unknown target, wasm-pack.
#
# getrandom appears twice in the dependency tree:
#   - 0.3 (via rand 0.9, this crate)      -> needs the `wasm_js` *backend* cfg
#   - 0.2 (via rand 0.8, rustiq-core)     -> needs the `js` *feature* (set in Cargo.toml)
# The 0.3 backend must be selected with a build-time cfg flag, below.
set -euo pipefail

CRATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/qiskit-paulice" && pwd)"
OUT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/web" && pwd)/src/wasm"

export RUSTFLAGS='--cfg getrandom_backend="wasm_js"'

wasm-pack build "$CRATE_DIR" \
  --target web \
  --out-dir "$OUT_DIR" \
  --out-name paulice \
  --release \
  --no-default-features \
  --features wasm

echo "wasm artifacts written to $OUT_DIR"
