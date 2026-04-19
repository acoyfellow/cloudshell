# syntax=docker/dockerfile:1

FROM golang:1.24-alpine AS build

WORKDIR /app

COPY worker/container/go.mod ./
RUN go mod download github.com/creack/pty github.com/gorilla/websocket

COPY worker/container/main.go ./
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /server

FROM alpine:3.20

RUN apk add --no-cache \
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
    py3-pip \
    make \
    gcc \
    g++ \
    libc-dev \
    linux-headers \
    tmux \
    fuse \
    fuse3 \
    ca-certificates \
    util-linux

RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then ARCH="amd64"; \
    elif [ "$ARCH" = "aarch64" ]; then ARCH="arm64"; fi && \
    VERSION=$(curl -s https://api.github.com/repos/tigrisdata/tigrisfs/releases/latest | grep -o '"tag_name": "[^"]*' | cut -d'"' -f4) && \
    curl -L "https://github.com/tigrisdata/tigrisfs/releases/download/${VERSION}/tigrisfs_${VERSION#v}_linux_${ARCH}.tar.gz" -o /tmp/tigrisfs.tar.gz && \
    tar -xzf /tmp/tigrisfs.tar.gz -C /usr/local/bin/ && \
    rm /tmp/tigrisfs.tar.gz && \
    chmod +x /usr/local/bin/tigrisfs

RUN git config --global init.defaultBranch main

RUN adduser -D -s /bin/bash user

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
