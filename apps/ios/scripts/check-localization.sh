#!/bin/bash
set -eu
cd "$(dirname "$0")/.."
python3 - <<'PY'
import re, pathlib, sys
tables = []
for locale in ('en', 'id'):
    data = (pathlib.Path('Sources/Resources') / (locale + '.lproj') / 'Localizable.strings').read_text()
    keys = re.findall(r'^"([^"]+)"\s*=', data, re.M)
    duplicates = {k for k in keys if keys.count(k) > 1}
    if duplicates: sys.exit(f'Duplicate {locale} keys: {duplicates}')
    tables.append(set(keys))
if tables[0] != tables[1]: sys.exit(f'Locale mismatch: {tables[0] ^ tables[1]}')
print(f'Localization: {len(tables[0])} keys per language; no duplicates')
PY
