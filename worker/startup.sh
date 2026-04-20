#!/bin/bash
# POST-CONTAINERS-GA (2026-04-18): FUSE/tigrisfs is the confirmed reason the
# container never reaches `exec /server`. The minimal parity container (no FUSE,
# plain node ws server) opens port 8080 in <400ms. The cloudshell image with
# tigrisfs never does.
#
# CF Containers post-GA runs without privileged mode / without `/dev/fuse`
# access by default. tigrisfs either hangs on a syscall or exits immediately,
# leaving /startup.sh stuck before exec. Disabling the FUSE block entirely
# and shipping local-only /home/user until a proper FUSE path returns.
#
# Trade-off: no cross-container persistence of workspace files. The USERS_KV
# metadata layer still persists sessions/tabs; the terminal works; upload via
# R2 still works through the app (not as a mounted FS inside the container).
# This ships a WORKING terminal today and defers persistence.

mkdir -p /home/user 2>/dev/null || echo "startup: mkdir /home/user failed (non-fatal)"

# Rebrand the hostname so the prompt says cloudshell instead of the CF
# Firecracker default 'cloudchamber'. hostname(1) is present in alpine's
# busybox; fall back to a /etc/hostname write which most shells honor
# when they re-read the env.
hostname cloudshell 2>/dev/null || true
echo cloudshell > /etc/hostname 2>/dev/null || true

# NOTE: .tmux.conf is seeded per-user in main.go handleWebSocket, not here.
# Each cloudshell user has HOME=/home/user/<username>/, so writing
# /home/user/.tmux.conf from startup.sh does nothing (tmux never looks
# there). See main.go's seed block for the real write path.

echo "startup: FUSE disabled post-GA — running local /home/user"
echo "startup: execing /server"
exec /server
