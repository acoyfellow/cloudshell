#!/bin/bash

MOUNT_POINT="/home/user"
mkdir -p "$MOUNT_POINT"
if [ -n "$AWS_ACCESS_KEY_ID" ] && [ -n "$AWS_SECRET_ACCESS_KEY" ] && [ -n "$R2_BUCKET_NAME" ] && [ -n "$R2_ACCOUNT_ID" ]; then
    R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

    echo "Mounting R2 bucket $R2_BUCKET_NAME to $MOUNT_POINT..."
    /usr/local/bin/tigrisfs \
        --endpoint "$R2_ENDPOINT" \
        -f "$R2_BUCKET_NAME" "$MOUNT_POINT" &

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
else
    echo "R2 credentials not set - starting without mounted persistence"
fi

exec /server
