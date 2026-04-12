#!/usr/bin/env bash
# sync.sh — copy the root annotate.js into the extension bundle.
# Chrome rejects manifest paths with .. so the file must physically live here.
# Run this any time you edit ../annotate.js.

set -euo pipefail
cd "$(dirname "$0")"
cp ../annotate.js ./annotate.js
echo "synced annotate.js"
