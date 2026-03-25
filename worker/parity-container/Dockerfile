# syntax=docker/dockerfile:1
FROM node:22-alpine
WORKDIR /app
COPY worker/parity-container/package.json ./
RUN npm install --omit=dev
COPY worker/parity-container/server.mjs ./
EXPOSE 8080
USER node
CMD ["node", "server.mjs"]
