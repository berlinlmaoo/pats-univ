#!/bin/sh
set -eu
: "${APP_URL:?set APP_URL}"
: "${CRON_SECRET:?set CRON_SECRET}"
curl --fail --silent --show-error -X POST -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/social"
