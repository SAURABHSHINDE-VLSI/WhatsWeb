#!/bin/sh
set -e

echo "[WhatsUS] Applying database migrations..."
cd /app/server
npx prisma migrate deploy 2>/dev/null || npx prisma db push --skip-generate 2>/dev/null || true

echo "[WhatsUS] Starting application server..."
exec node dist/index.js
