#!/bin/bash

: "${AWS_ACCESS_KEY_ID:?AWS_ACCESS_KEY_ID not set}"
: "${AWS_SECRET_ACCESS_KEY:?AWS_SECRET_ACCESS_KEY not set}"
: "${R2_BUCKET_NAME:?R2_BUCKET_NAME not set}"
: "${R2_ACCOUNT_ID:?R2_ACCOUNT_ID not set}"

MOUNT_POINT="/home/user"
R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

mkdir -p "$MOUNT_POINT"

echo "Mounting R2 bucket $R2_BUCKET_NAME to $MOUNT_POINT..."
/usr/local/bin/tigrisfs \
    --endpoint "$R2_ENDPOINT" \
    -f "$R2_BUCKET_NAME" "$MOUNT_POINT" &
FUSE_PID=$!

echo "Waiting for FUSE mount..."
MAX_WAIT=10
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
    if mountpoint -q "$MOUNT_POINT" 2>/dev/null; then
        echo "FUSE mount successful"
        break
    fi
    sleep 1
    WAITED=$((WAITED + 1))
done

if [ $WAITED -ge $MAX_WAIT ]; then
    echo "WARNING: FUSE mount timeout after ${MAX_WAIT}s - continuing without persistence"
fi

exec /server