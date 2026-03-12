FROM docker.io/cloudflare/sandbox:latest

# common dev tools
RUN apt-get update && apt-get install -y --no-install-recommends \
  curl \
  wget \
  git \
  vim \
  htop \
  jq \
  unzip \
  build-essential \
  ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# node (via volta)
RUN curl https://get.volta.sh | bash
ENV VOLTA_HOME="/root/.volta"
ENV PATH="$VOLTA_HOME/bin:$PATH"
RUN volta install node@22

WORKDIR /workspace
