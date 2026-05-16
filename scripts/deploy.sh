#!/usr/bin/env bash
# hal-yonetim deploy script — Hostinger VPS
# Usage:
#   ./scripts/deploy.sh           # backend + frontend
#   ./scripts/deploy.sh backend   # sadece backend
#   ./scripts/deploy.sh frontend  # sadece frontend

set -euo pipefail

# ---- Konfig ----
VPS_HOST="srv1671139.hstgr.cloud"
VPS_PORT="2222"
VPS_USER="root"
VPS_KEY="$HOME/.ssh/bisiparis_vps"

BACKEND_REMOTE="/var/www/mskocak.cloud/backend"
FRONTEND_REMOTE="/var/www/mskocak.cloud/public"
PM2_NAME="hal-yonetim"

SSH_CMD="ssh -p ${VPS_PORT} -i ${VPS_KEY} ${VPS_USER}@${VPS_HOST}"
RSYNC_SSH="ssh -p ${VPS_PORT} -i ${VPS_KEY}"

# ---- Yol kontrol ----
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKEND_LOCAL="${PROJECT_ROOT}/backend"
FRONTEND_LOCAL="${PROJECT_ROOT}/frontend"

TARGET="${1:-all}"

# ---- Renkler ----
G="\033[0;32m"; Y="\033[1;33m"; R="\033[0;31m"; N="\033[0m"
log()  { echo -e "${G}[deploy]${N} $*"; }
warn() { echo -e "${Y}[deploy]${N} $*"; }
fail() { echo -e "${R}[deploy]${N} $*" >&2; exit 1; }

# ---- SSH key kontrolü ----
[[ -f "${VPS_KEY}" ]] || fail "SSH key bulunamadı: ${VPS_KEY}"

deploy_backend() {
  log "Backend deploy başlıyor → ${BACKEND_REMOTE}"
  [[ -d "${BACKEND_LOCAL}" ]] || fail "Backend dizini yok: ${BACKEND_LOCAL}"

  log "rsync ile dosyalar gönderiliyor..."
  rsync -avz --delete \
    --exclude 'node_modules' \
    --exclude '.env' \
    --exclude '.env.local' \
    --exclude '*.log' \
    --exclude '.DS_Store' \
    --exclude 'tests' \
    -e "${RSYNC_SSH}" \
    "${BACKEND_LOCAL}/" \
    "${VPS_USER}@${VPS_HOST}:${BACKEND_REMOTE}/"

  log "VPS'te bağımlılıklar + migration + restart..."
  ${SSH_CMD} bash -s <<EOF
set -euo pipefail
cd "${BACKEND_REMOTE}"
echo "[vps] npm ci..."
npm ci --omit=dev
echo "[vps] prisma generate..."
npx prisma generate
echo "[vps] prisma migrate deploy..."
npx prisma migrate deploy
echo "[vps] pm2 restart ${PM2_NAME}..."
if pm2 describe ${PM2_NAME} >/dev/null 2>&1; then
  pm2 reload ${PM2_NAME} --update-env
else
  pm2 start src/index.js --name ${PM2_NAME}
  pm2 save
fi
pm2 status ${PM2_NAME}
EOF

  log "Backend deploy tamam ✓"
}

deploy_frontend() {
  log "Frontend deploy başlıyor → ${FRONTEND_REMOTE}"
  [[ -d "${FRONTEND_LOCAL}" ]] || fail "Frontend dizini yok: ${FRONTEND_LOCAL}"

  log "Lokal build..."
  cd "${FRONTEND_LOCAL}"
  npm run build
  cd - >/dev/null

  [[ -d "${FRONTEND_LOCAL}/dist" ]] || fail "Build çıktısı yok: ${FRONTEND_LOCAL}/dist"

  log "rsync ile dist/ gönderiliyor..."
  rsync -avz --delete \
    -e "${RSYNC_SSH}" \
    "${FRONTEND_LOCAL}/dist/" \
    "${VPS_USER}@${VPS_HOST}:${FRONTEND_REMOTE}/"

  log "Frontend deploy tamam ✓"
}

case "${TARGET}" in
  backend)  deploy_backend ;;
  frontend) deploy_frontend ;;
  all)      deploy_backend; deploy_frontend ;;
  *)        fail "Geçersiz hedef: ${TARGET} (backend|frontend|all)" ;;
esac

log "Tüm işlemler tamamlandı 🚀"
