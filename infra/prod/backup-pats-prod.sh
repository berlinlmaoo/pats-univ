#!/bin/bash
# PATS PRODUCTION nightly backup on VM pats-univ (cron 02:20 WIB). Tracked in infra/prod/backup-pats-prod.sh.
#   DB:      pg_dump -Fc of pats-prod-postgres, verified with pg_restore --list (unreadable = deleted + exit 1)
#   Storage: tar.gz of the pats-prod-storage volume (print PDFs, photos, flyers, receipts)
# Kept 14 days in ~/backups-prod. The Proxmox host pulls this folder at 03:40 (pats-backup.timer) to
# /mnt/nexus-backup/pats-univ and copies it offsite (encrypted). Dev backups stay in ~/backups.
set -uo pipefail
D="sudo docker"; B=$HOME/backups-prod; S=$(date +%Y%m%d-%H%M); rc=0
mkdir -p "$B"
F="$B/pats-prod-$S.dump"
if $D exec pats-prod-postgres pg_dump -U pats -d pats_univ -Fc > "$F" && [ -s "$F" ] \
   && $D exec -i pats-prod-postgres pg_restore --list < "$F" > /dev/null; then :; else
  echo "$(date -Is) DB dump FAILED" >&2; rm -f "$F"; rc=1
fi
T="$B/pats-prod-storage-$S.tar.gz"
$D run --rm -v pats-prod-storage:/data/storage:ro -v "$B":/out alpine:3.20 \
  tar -czf "/out/$(basename "$T")" -C /data storage || { echo "$(date -Is) storage archive FAILED" >&2; rm -f "$T"; rc=1; }
sudo chown "$(id -u):$(id -g)" "$T" 2>/dev/null
find "$B" -maxdepth 1 -name 'pats-prod-*' -mtime +14 -delete
find "$B" -maxdepth 1 -name 'pre-deploy-*.dump' -mtime +14 -delete
echo "$(date -Is) rc=$rc $(du -h "$F" 2>/dev/null | cut -f1) db, $(du -h "$T" 2>/dev/null | cut -f1) storage" >> "$B/backup.log"
exit $rc
