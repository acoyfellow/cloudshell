#!/bin/bash

: "${AWS_ACCESS_KEY_ID:?R2 credentials not set}"
: "${AWS_SECRET_ACCESS_KEY:?R2 credentials not set}"
: "${R2_BUCKET_NAME:?R2 configuration not set}"
: "${R2_ACCOUNT_ID:?R2 configuration not set}"

mkdir -p /home/user
R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

/usr/local/bin/tigrisfs \
    --endpoint "$R2_ENDPOINT" \
    -f "$R2_BUCKET_NAME" /home/user &

sleep 3

exec /server