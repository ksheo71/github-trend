#!/bin/sh
set -e
echo "[entrypoint] running migrations"
node --import tsx scripts/migrate.ts
echo "[entrypoint] starting next server"
exec node server.js
