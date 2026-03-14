#!/bin/bash
set -e# R2 FUSE mount (if credentials are provided)
if [ -n "$R2_ACCOUNT_ID" ] && [ -n "$R2_ACCESS_KEY" ] && [ -n "$R2_SECRET_KEY" ] && [ -n "$R2_BUCKET_NAME" ]; then
    echo "Mounting R2 bucket $R2_BUCKET_NAME to /home/user ..."
    mkdir -p /home/user

    # Create AWS credentials file for tigrisfs
    mkdir -p /root/.aws
    cat > /root/.aws/credentials << EOF
[default]
aws_access_key_id = $R2_ACCESS_KEY
aws_secret_access_key = $R2_SECRET_KEY
EOF

    # Mount R2 bucket
    R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
    /usr/local/bin/tigrisfs \
        --endpoint "$R2_ENDPOINT" \
        -f "$R2_BUCKET_NAME" /home/user &

    sleep 2
    echo "R2 bucket mounted successfully"
else
    echo "R2 credentials not provided, using local storage"
fi

echo "Starting CloudShell server on :8080"
exec /server