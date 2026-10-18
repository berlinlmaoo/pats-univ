#!/usr/bin/env sh
# Regenerate every brand and KTM image from the official masters (kept out of the repo).
#   tools/brand/make-assets.sh ~/pats-univ-brand/official ~/pats-univ-brand/ktm
# Resize and pad only; never crop into, mask or recolour the marks. See make_assets.py.
set -eu
OFFICIAL=$(cd "${1:?usage: make-assets.sh <official logo dir> <ktm dir>}" && pwd)
KTM=$(cd "${2:?usage: make-assets.sh <official logo dir> <ktm dir>}" && pwd)
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp -v "$ROOT:/repo" -v "$OFFICIAL:/official:ro" -v "$KTM:/ktm:ro" python:3.12-slim \
  sh -c 'pip install -q --user pillow 2>/dev/null && python /repo/tools/brand/make_assets.py /official /ktm'
