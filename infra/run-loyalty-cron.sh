#!/bin/sh
set -eu
: "${APP_URL:?APP_URL is required}"
: "${CRON_SECRET:?CRON_SECRET is required}"
curl --fail --silent --show-error --max-time 55 \
  --request POST \
  --header "Authorization: Bearer ${CRON_SECRET}" \
  "${APP_URL}/api/cron/loyalty"
