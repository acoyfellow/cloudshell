#!/bin/bash
# R2 FUSE mounts at /home/user (bucket root = user workspaces). Image leaves /home/user empty
# so the mount point is valid; .tmux.conf is copied from /opt/cloudshell after mount.
# Bounded wait keeps waitForPort from racing an unmounted tree too long.
#
# POST-CONTAINERS-GA FIX (2026-04-18): Removed `set -e`. The prior script aborted the
# container before `exec /server` if ANY of: tigrisfs failed to launch, chown inside
# the FUSE mount returned non-zero, or mountpoint -q failed. The CF runtime then saw
# port 8080 never come up and reported "Container crashed while checking for ports".
# We now treat FUSE as best-effort: every failure is logged and swallowed, and we
# always reach `exec /server`. Without this, a single FUSE hiccup takes the whole
# terminal down and the user sees a 1006 close.

mkdir -p /home/user 2>/dev/null || echo "startup: mkdir /home/user failed (non-fatal)"

seed_tmux_if_missing() {
    if [ ! -f /home/user/.tmux.conf ] && [ -f /opt/cloudshell/.tmux.conf ]; then
        cp /opt/cloudshell/.tmux.conf /home/user/.tmux.conf 2>/dev/null \
            || echo "startup: cp .tmux.conf failed (non-fatal)"
        chown user:user /home/user/.tmux.conf 2>/dev/null \
            || echo "startup: chown .tmux.conf failed (non-fatal)"
    fi
}

mount_r2_fuse() {
    R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
    MOUNT_POINT="${R2_FUSE_MOUNT_POINT:-/home/user}"

    echo "startup: mounting R2 bucket ${R2_BUCKET_NAME} at ${MOUNT_POINT}"
    /usr/local/bin/tigrisfs \
        --endpoint "$R2_ENDPOINT" \
        -f "$R2_BUCKET_NAME" "$MOUNT_POINT" 2>&1 | sed 's/^/tigrisfs: /' &

    echo "startup: waiting up to 5s for FUSE mount"
    MAX_WAIT=5
    WAITED=0
    while [ "$WAITED" -lt "$MAX_WAIT" ]; do
        if mountpoint -q "$MOUNT_POINT" 2>/dev/null; then
            echo "startup: FUSE mount successful"
            return 0
        fi
        sleep 1
        WAITED=$((WAITED + 1))
    done

    echo "startup: FUSE mount timeout after ${MAX_WAIT}s — continuing without it"
    return 0
}

if [ -n "${AWS_ACCESS_KEY_ID:-}" ] && [ -n "${AWS_SECRET_ACCESS_KEY:-}" ] && [ -n "${R2_BUCKET_NAME:-}" ] && [ -n "${R2_ACCOUNT_ID:-}" ]; then
    mount_r2_fuse || echo "startup: mount_r2_fuse returned non-zero (non-fatal)"
else
    echo "startup: R2 credentials not set — local /home/user only"
fi

seed_tmux_if_missing

echo "startup: execing /server"
exec /server
