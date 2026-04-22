# syntax=docker/dockerfile:1

FROM golang:1.24-alpine AS build

WORKDIR /app

COPY worker/container/go.mod ./
RUN go mod download github.com/creack/pty github.com/gorilla/websocket

COPY worker/container/main.go ./
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /server

# Runtime image: debian slim, glibc-based. Alpine's musl libc breaks
# dynamically-linked prebuilt binaries (notably opencode, which is a
# Bun-compiled single file expecting /lib64/ld-linux-x86-64.so.2).
# gcompat is a shim but fails to execute Bun compile-mode binaries
# correctly on Alpine.
FROM debian:13-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    curl \
    wget \
    git \
    vim \
    nano \
    htop \
    tree \
    jq \
    nodejs \
    npm \
    python3 \
    python3-pip \
    make \
    gcc \
    g++ \
    libc6-dev \
    linux-libc-dev \
    tmux \
    fuse3 \
    ca-certificates \
    util-linux \
    procps \
    unzip \
    xz-utils \
 && rm -rf /var/lib/apt/lists/*

RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then ARCH="amd64"; \
    elif [ "$ARCH" = "aarch64" ]; then ARCH="arm64"; fi && \
    VERSION=$(curl -s https://api.github.com/repos/tigrisdata/tigrisfs/releases/latest | grep -o '"tag_name": "[^"]*' | cut -d'"' -f4) && \
    curl -L "https://github.com/tigrisdata/tigrisfs/releases/download/${VERSION}/tigrisfs_${VERSION#v}_linux_${ARCH}.tar.gz" -o /tmp/tigrisfs.tar.gz && \
    tar -xzf /tmp/tigrisfs.tar.gz -C /usr/local/bin/ && \
    rm /tmp/tigrisfs.tar.gz && \
    chmod +x /usr/local/bin/tigrisfs

RUN git config --global init.defaultBranch main

RUN useradd -m -s /bin/bash user

# opencode: pre-baked so every cold start has it without a 50 MB download.
# The Linux release is a Bun-compiled single-file binary (~143 MB). It is
# dynamically linked against glibc, which is why this image is Debian
# (Alpine's musl would require gcompat, and Bun's compile-mode entrypoint
# detection is broken under gcompat).
#
# Binary lives at /usr/local/bin/opencode so it survives container restarts
# and is on PATH for every user. User runs `opencode auth login
# https://opencode.cloudflare.dev` once to authenticate; the token lands
# at ~/.local/share/opencode/auth.json and persists only while the
# container is running (FUSE-backed persistence is disabled post-GA).
ARG OPENCODE_VERSION=v1.14.19
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then OC_ARCH="x64"; \
    elif [ "$ARCH" = "aarch64" ]; then OC_ARCH="arm64"; \
    else echo "unsupported arch: $ARCH" && exit 1; fi && \
    curl -fsSL -o /tmp/oc.tar.gz \
      "https://github.com/anomalyco/opencode/releases/download/${OPENCODE_VERSION}/opencode-linux-${OC_ARCH}.tar.gz" && \
    tar -xzf /tmp/oc.tar.gz -C /usr/local/bin/ && \
    chmod +x /usr/local/bin/opencode && \
    rm /tmp/oc.tar.gz && \
    /usr/local/bin/opencode --version

COPY --from=build /server /server

# Keep /home/user empty so tigrisfs can mount R2 here. Seed tmux config from startup after mount.
RUN mkdir -p /opt/cloudshell /home/user
COPY worker/.tmux.conf /opt/cloudshell/.tmux.conf
RUN chown user:user /opt/cloudshell/.tmux.conf /home/user

# cloudshell `mcp` CLI — zero-dep node script. Pre-installed so the
# user doesn't pay a 5-minute `npm install -g` on first use. See
# worker/container/mcp-cli.mjs for the source; the CLI reads a bridge
# ticket from $CLOUDSHELL_BRIDGE_TICKET or ~/.cloudshell/bridge-ticket
# and proxies all MCP tool calls through cloudshell.coey.dev so the
# container never holds upstream OAuth tokens.
#
# Note on the two-file shape: Node.js infers CJS vs ESM from the file
# extension. A file at /usr/local/bin/mcp (no extension) runs as CJS,
# which rejects the `import` syntax our script uses. Keeping the
# source file as .mjs preserves ESM; a tiny shell wrapper named `mcp`
# is what the user actually invokes.
COPY worker/container/mcp-cli.mjs /usr/local/lib/cloudshell-mcp-cli.mjs
RUN printf '#!/bin/sh\nexec /usr/bin/node /usr/local/lib/cloudshell-mcp-cli.mjs "$@"\n' > /usr/local/bin/mcp && \
    chmod +x /usr/local/bin/mcp /usr/local/lib/cloudshell-mcp-cli.mjs

COPY worker/startup.sh /startup.sh
RUN chmod +x /startup.sh

EXPOSE 8080

WORKDIR /home/user
ENV HOME=/home/user

CMD ["/startup.sh"]
