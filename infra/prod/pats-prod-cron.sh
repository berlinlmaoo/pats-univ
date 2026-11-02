#!/bin/sh
# PATS PRODUCTION crons (every minute, crontab debian): notifications, loyalty, social, always on the
# LIVE slot via the proxy's internal listener 127.0.0.1:3201. Tracked in infra/prod/pats-prod-cron.sh.
S=$(grep '^CRON_SECRET=' "$HOME/.pats-prod-secrets/prod.env" | cut -d= -f2-)
for p in notifications loyalty social; do
  curl -fsS -m 50 -X POST -H "Authorization: Bearer $S" "http://127.0.0.1:3201/api/cron/$p" >/dev/null 2>>"$HOME/pats-prod-cron.err" \
    || echo "$(date -Is) $p failed" >> "$HOME/pats-prod-cron.err"
done
