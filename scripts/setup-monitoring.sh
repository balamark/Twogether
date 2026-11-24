#!/usr/bin/env bash
# Creates (or updates) Twogether's production uptime alerting in Cloud Monitoring:
#   - an email notification channel
#   - an HTTPS uptime check on https://twogether.fun/health (every 5 min, all regions)
#   - alert policies from monitoring/policies/*.json
#
# Safe to re-run: the channel and uptime check are reused, policies are updated in
# place (matched by displayName), nothing is duplicated.
#
# Usage:
#   scripts/setup-monitoring.sh [--project twogether-couples-app] [--email you@example.com] [--host twogether.fun] [--dry-run]
#
# Needs: gcloud (with the beta component), curl and python3, logged in as someone with
# roles/monitoring.editor on the project. Every call names the project explicitly, so
# your gcloud default project doesn't matter.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="twogether-couples-app"
HOST="twogether.fun"
CHECK_PATH="/health"
EMAIL="wangmark510@gmail.com"
DRY_RUN=0

while [ $# -gt 0 ]; do
  case "$1" in
    --project) PROJECT="$2"; shift 2 ;;
    --email) EMAIL="$2"; shift 2 ;;
    --host) HOST="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

run() {
  if [ "$DRY_RUN" = 1 ]; then
    printf '[dry-run]'; printf ' %q' "$@"; echo
  else
    "$@"
  fi
}

G=(gcloud --project="$PROJECT" --quiet)

# Alert policies only exist in `gcloud alpha`, so they go straight to the REST API
MONITORING_API="https://monitoring.googleapis.com/v3"
monitoring_api() {  # METHOD PATH [JSON_FILE]
  local args=(-fsS -X "$1" "$MONITORING_API/$2" -H "Authorization: Bearer $(gcloud auth print-access-token)" -H "Content-Type: application/json")
  [ $# -ge 3 ] && args+=(--data-binary "@$3")
  curl "${args[@]}"
}
find_policy() {  # DISPLAY_NAME -> policy resource name, or empty
  monitoring_api GET "projects/$PROJECT/alertPolicies?pageSize=200" \
    | python3 -c 'import json,sys
name=sys.argv[1]
for p in json.load(sys.stdin).get("alertPolicies", []):
    if p.get("displayName")==name: print(p["name"]); break' "$1"
}

echo "Project: $PROJECT   Alerts to: $EMAIL   Uptime: https://$HOST$CHECK_PATH"
[ "$DRY_RUN" = 1 ] && echo "(dry run: nothing will be changed)"

# --- 1. Notification channel ------------------------------------------------
echo
echo "== Email notification channel"
CHANNEL="$("${G[@]}" beta monitoring channels list \
  --filter="type=\"email\" AND labels.email_address=\"$EMAIL\"" --format='value(name)' 2>/dev/null | head -1)"
if [ -n "$CHANNEL" ]; then
  echo "reuse $CHANNEL"
else
  echo "create email channel for $EMAIL"
  if [ "$DRY_RUN" = 1 ]; then
    run "${G[@]}" beta monitoring channels create --display-name="Twogether alerts ($EMAIL)" --type=email --channel-labels="email_address=$EMAIL"
    CHANNEL="projects/$PROJECT/notificationChannels/DRY_RUN"
  else
    CHANNEL="$("${G[@]}" beta monitoring channels create --display-name="Twogether alerts ($EMAIL)" \
      --type=email --channel-labels="email_address=$EMAIL" --format='value(name)')"
    echo "created $CHANNEL"
  fi
fi

# --- 2. Uptime check --------------------------------------------------------
echo
echo "== Uptime check"
UPTIME_NAME="Twogether $CHECK_PATH"
UPTIME="$("${G[@]}" monitoring uptime list-configs --filter="displayName=\"$UPTIME_NAME\"" --format='value(name)' 2>/dev/null | head -1)"
UPTIME_ARGS=(--resource-type=uptime-url --resource-labels="host=$HOST,project_id=$PROJECT"
  --protocol=https --path="$CHECK_PATH" --period=5 --timeout=10)
if [ -n "$UPTIME" ]; then
  echo "reuse $UPTIME"
else
  echo "create uptime check on https://$HOST$CHECK_PATH"
  if [ "$DRY_RUN" = 1 ]; then
    run "${G[@]}" monitoring uptime create "$UPTIME_NAME" "${UPTIME_ARGS[@]}"
    UPTIME="projects/$PROJECT/uptimeCheckConfigs/DRY_RUN"
  else
    UPTIME="$("${G[@]}" monitoring uptime create "$UPTIME_NAME" "${UPTIME_ARGS[@]}" --format='value(name)')"
    echo "created $UPTIME"
  fi
fi
UPTIME_ID="${UPTIME##*/}"

# --- 3. Alert policies ------------------------------------------------------
echo
echo "== Alert policies"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
for file in "$ROOT"/monitoring/policies/*.json; do
  rendered="$TMP/$(basename "$file")"
  sed -e "s#__CHANNEL__#$CHANNEL#g" -e "s#__UPTIME_CHECK_ID__#$UPTIME_ID#g" "$file" > "$rendered"
  display_name="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["displayName"])' "$rendered")"
  existing="$(find_policy "$display_name")"
  if [ -n "$existing" ]; then
    echo "update \"$display_name\""
    if [ "$DRY_RUN" = 1 ]; then echo "[dry-run] PATCH $MONITORING_API/$existing"; else
      monitoring_api PATCH "$existing" "$rendered" > /dev/null; fi
  else
    echo "create \"$display_name\""
    if [ "$DRY_RUN" = 1 ]; then echo "[dry-run] POST $MONITORING_API/projects/$PROJECT/alertPolicies"; else
      monitoring_api POST "projects/$PROJECT/alertPolicies" "$rendered" > /dev/null; fi
  fi
done

cat <<EOF

Done.
- If the email channel is new, Google may send a confirmation email to $EMAIL first.
- The uptime check's first results show up in Monitoring → Uptime checks within ~5 minutes.
EOF
