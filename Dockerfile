# Multi-stage Dockerfile for Mr. Wolf
# Usage:
#   docker build --target test -t mister-wolf:test .
#   docker run --rm mister-wolf:test
#   docker build --target runtime -t mister-wolf:latest .

FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NODE_ENV=development

# Install build dependencies for native modules (better-sqlite3)
# jq — runtime-зависимость tools/pipeline/autorefine.sh (нужна его юнит-тестам в Docker CI)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    jq \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .

FROM base AS test
RUN npm run build
CMD ["npm", "run", "check"]

FROM base AS build
RUN npm run build
CMD ["node", "dist/bootstrap/cli.js", "--help"]

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY README.md ./README.md
COPY LICENSE ./LICENSE

ENTRYPOINT ["node", "/app/dist/bootstrap/cli.js"]
