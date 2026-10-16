#!/usr/bin/env bash
# Regenerate every brand image from the official crest master (9000 px, transparent).
# The master stays out of the repo; only the generated sizes are committed.
#
#   tools/brand/make-assets.sh ~/pats-univ-brand/pats-crest-9000.png
#
# Cropping and resizing use sips (macOS); Python + Pillow only masks the shield and centres
# images on a canvas. Background colours come from packages/shared/src/colors.json.
set -euo pipefail

MASTER=${1:?usage: make-assets.sh <pats-crest-9000.png>}
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
HERE="$ROOT/tools/brand"
MOBILE="$ROOT/apps/mobile/assets"
WEB="$ROOT/apps/web/public"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

CREAM=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['brand']['cream'])" "$ROOT/packages/shared/src/colors.json")

resize() { sips -Z "$1" "$2" --out "$3" >/dev/null; }
compose() { python3 "$HERE/compose.py" "$@"; }

# Shield: crop its region from a 3000 px copy, then mask it out.
resize 3000 "$MASTER" "$WORK/crest-3000.png"
sips -c 1900 1500 --cropOffset 640 760 "$WORK/crest-3000.png" --out "$WORK/shield-crop.png" >/dev/null
python3 "$HERE/shield.py" "$WORK/shield-crop.png" "$WORK/shield.png"

shield_on() { # <canvas> <shield height> <background> <out>
  resize "$2" "$WORK/shield.png" "$WORK/shield-$2.png"
  compose "$WORK/shield-$2.png" "$4" "$1" "$3"
}

mkdir -p "$WEB/brand"

# App icon (iOS: no alpha) and Android adaptive foreground (shield inside the 66% safe circle).
shield_on 1024 700 "$CREAM" "$MOBILE/icon.png"
shield_on 1024 520 transparent "$MOBILE/adaptive-icon.png"
shield_on 48 48 transparent "$MOBILE/favicon.png"

# Splash: the full crest (light and dark use the same art on their own background colour).
resize 1024 "$MASTER" "$MOBILE/splash-icon.png"

# Web: favicons from the shield, the crest at the sizes the header and auth pages use.
shield_on 32 32 transparent "$WEB/favicon-32.png"
shield_on 192 184 transparent "$WEB/icon-192.png"
shield_on 180 128 "$CREAM" "$WEB/apple-touch-icon.png"
for px in 80 120 160 240; do
  resize "$px" "$MASTER" "$WEB/brand/crest-$px.png"
done

echo "Brand assets written to $MOBILE and $WEB"
