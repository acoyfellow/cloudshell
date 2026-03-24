#!/bin/bash
# R2 FUSE mounts at /home/user (bucket root = user workspaces). Image leaves /home/user empty
# so the mount point is valid; .tmux.conf is copied from /opt/cloudshell after mount.
# Bounded wait keeps waitForPort from racing an unmounted tree too long.

set -e

mkdir -p /home/user

seed_tmux_if_missing() {
    if [ ! -f /home/user/.tmux.conf ] && [ -f /opt/cloudshell/.tmux.conf ]; then
        cp /opt/cloudshell/.tmux.conf /home/user/.tmux.conf
        chown user:user /home/user/.tmux.conf
    fi
}

if [ -n "${AWS_ACCESS_KEY_ID:-}" ] && [ -n "${AWS_SECRET_ACCESS_KEY:-}" ] && [ -n "${R2_BUCKET_NAME:-}" ] && [ -n "${R2_ACCOUNT_ID:-}" ]; then
    R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
    MOUNT_POINT="${R2_FUSE_MOUNT_POINT:-/home/user}"

    echo "Mounting R2 bucket ${R2_BUCKET_NAME} at ${MOUNT_POINT}..."
    /usr/local/bin/tigrisfs \
        --endpoint "$R2_ENDPOINT" \
        -f "$R2_BUCKET_NAME" "$MOUNT_POINT" &

    echo "Waiting for FUSE mount..."
    MAX_WAIT=5
    WAITED=0
    while [ "$WAITED" -lt "$MAX_WAIT" ]; do
        if mountpoint -q "$MOUNT_POINT" 2>/dev/null; then
            echo "FUSE mount successful"
            break
        fi
        sleep 1
        WAITED=$((WAITED + 1))
    done

    if [ "$WAITED" -ge "$MAX_WAIT" ]; then
        echo "WARNING: FUSE mount timeout after ${MAX_WAIT}s — continuing"
    fi

    seed_tmux_if_missing
else
    echo "R2 credentials not set — local /home/user only"
    seed_tmux_if_missing
fi

exec /server
