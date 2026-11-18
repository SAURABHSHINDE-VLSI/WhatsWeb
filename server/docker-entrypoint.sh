#!/bin/sh
set -e

echo "[WhatsUS] Applying PostgreSQL database migrations via Prisma..."
cd /app/server
npx prisma migrate deploy

echo "[WhatsUS] Starting production server on port ${PORT:-3001}..."
exec node dist/index.js
