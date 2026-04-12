#!/bin/sh
set -e
uid="${APP_UID:-1000}"
gid="${APP_GID:-1000}"
mkdir -p /app/data/receipts
# Bind mounts ignore image chmod; fixing at start (as root) updates host dir mode so APP_UID can write.
chmod 777 /app/data/receipts
exec su-exec "${uid}:${gid}" /app/server "$@"
