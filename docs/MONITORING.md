# Monitoring & alerts

Production alerting lives in Cloud Monitoring in GCP project `twogether-couples-app`
and is managed by `scripts/setup-monitoring.sh` (safe to re-run; it reuses the
channel and uptime check and updates policies in place).

- **Uptime check** "Twogether /health": HTTPS `https://twogether.fun/health` every 5 min
  from all regions.
- **Alert** "Twogether: site unreachable" (`monitoring/policies/uptime.json`): fires
  when the check fails from more than one region, so a single-region blip doesn't page;
  auto-closes 30 min after recovery.
- **Channel**: email to wangmark510@gmail.com (override with `--email`).

To change an alert, edit the JSON in `monitoring/policies/` and re-run
`scripts/setup-monitoring.sh` (`--dry-run` first to preview). Every call passes
`--project` explicitly, so the gcloud default project (often `moreway-cafe`) is irrelevant.
