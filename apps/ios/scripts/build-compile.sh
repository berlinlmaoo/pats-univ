#!/bin/bash
# Compile only. Never boots a simulator or starts an app.
set -eu
cd "$(dirname "$0")/.."
while pgrep -x xcodebuild >/dev/null; do
  echo "Waiting for the existing Xcode build to finish."
  sleep 10
done
FREE_KB=$(df -k / | awk 'NR==2 {print $4}')
if [ "$FREE_KB" -lt 6291456 ]; then
  echo "error: At least 6 GB free disk space is required." >&2
  exit 1
fi
xcodegen generate
echo "Starting PATS compile-only build."
exec xcodebuild -scheme PATS -destination 'generic/platform=iOS Simulator' -jobs 2 -derivedDataPath ~/dd-pats-ios build
