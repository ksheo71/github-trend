#!/bin/sh
set -e
echo "[entrypoint] running migrations"
node --experimental-strip-types scripts/migrate.ts
echo "[entrypoint] starting next server"
exec node server.js
