#!/usr/bin/env bash
# fix-container-app-drift.sh
#
# When a cloudshell deploy succeeds (green CI, new image sha logged)
# but the live container keeps serving the old image, this is the
# Footgun 2 drift. See ~/cloudflare/.context/CF-CONTAINERS-GA-FOOTGUNS.md.
#
# Delete the container application; the next deploy recreates it
# bound to the freshly pushed image.
#
# Prereqs (from ~/.zshrc):
#   CLOUDFLARE_PERSONAL_API_TOKEN   - Workers Edit + Containers Edit scope
#   CLOUDFLARE_PERSONAL_ACCOUNT_ID  - personal CF account id
#
# Usage:
#   ./scripts/fix-container-app-drift.sh [app-name]
#
# `app-name` defaults to cloudshell-sandbox-runner.

set -euo pipefail

APP_NAME="${1:-cloudshell-sandbox-runner}"

if [[ -z "${CLOUDFLARE_PERSONAL_API_TOKEN:-}" ]] || [[ -z "${CLOUDFLARE_PERSONAL_ACCOUNT_ID:-}" ]]; then
  echo "error: CLOUDFLARE_PERSONAL_API_TOKEN and CLOUDFLARE_PERSONAL_ACCOUNT_ID must be set" >&2
  echo "       (these live in ~/.zshrc, run: source ~/.zshrc)" >&2
  exit 1
fi

echo "Looking up container app '$APP_NAME'..."

APP_ID=$(curl -sS -H "Authorization: Bearer $CLOUDFLARE_PERSONAL_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_PERSONAL_ACCOUNT_ID/containers/applications" \
  | python3 -c "
import json, sys
d = json.load(sys.stdin)
for a in d.get('result', []):
  if a.get('name') == '$APP_NAME':
    print(a.get('id'))
    break
")

if [[ -z "$APP_ID" ]]; then
  echo "no app named '$APP_NAME' found (may already be gone)"
  exit 0
fi

echo "Deleting $APP_NAME ($APP_ID)..."
curl -sS -X DELETE -H "Authorization: Bearer $CLOUDFLARE_PERSONAL_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_PERSONAL_ACCOUNT_ID/containers/applications/$APP_ID" \
  | python3 -c "
import json, sys
d = json.load(sys.stdin)
if d.get('success'):
  print('  deleted.')
else:
  print('  failed:', d.get('errors'))
  sys.exit(1)
"

echo ""
echo "Next: trigger a redeploy. Either push a new commit, or:"
echo "  git commit --allow-empty -m 'ci: retrigger (Footgun 2 workaround)' && git push"
