# syntax=docker/dockerfile:1

FROM golang:1.24-alpine AS build

WORKDIR /app

COPY worker/container/go.mod ./
RUN go mod download github.com/creack/pty github.com/gorilla/websocket

COPY worker/container/main.go ./
RUN go build -o /server

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
COPY worker/.tmux.conf /home/user/.tmux.conf
RUN chown user:user /home/user/.tmux.conf

COPY worker/startup.sh /startup.sh
RUN chmod +x /startup.sh

EXPOSE 8080

WORKDIR /home/user
ENV HOME=/home/user

CMD ["/startup.sh"]
