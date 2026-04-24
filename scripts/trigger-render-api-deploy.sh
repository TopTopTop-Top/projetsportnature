#!/usr/bin/env bash
# Usage : export RENDER_DEPLOY_HOOK_RAVITOBOX_API='https://api.render.com/deploy/srv-...?key=...'
#         bash scripts/trigger-render-api-deploy.sh
# (URL : Render → service Web Node « API » → Settings → Deploy Hook)
set -euo pipefail
if [[ -z "${RENDER_DEPLOY_HOOK_RAVITOBOX_API:-}" ]]; then
  echo "Définis la variable RENDER_DEPLOY_HOOK_RAVITOBOX_API (URL du Deploy Hook Render pour l’API Node)." >&2
  exit 1
fi
curl -fsS -m 120 -X POST "$RENDER_DEPLOY_HOOK_RAVITOBOX_API"
echo "OK — déploiement API demandé sur Render."
