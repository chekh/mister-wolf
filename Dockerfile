# Multi-stage Dockerfile for Mr. Wolf
# Usage:
#   docker build --target test -t mister-wolf:test .
#   docker run --rm mister-wolf:test
#   docker build --target runtime -t mister-wolf:latest .

FROM node:20-bookworm-slim AS base
WORKDIR /app
ENV NODE_ENV=development

# Install build dependencies for native modules (better-sqlite3)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .

FROM base AS test
RUN npm run build
CMD ["npm", "run", "check"]

FROM base AS build
RUN npm run build
CMD ["node", "dist/cli/index.js", "--help"]

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY examples ./examples
COPY README.md ./README.md
COPY LICENSE ./LICENSE

ENTRYPOINT ["node", "dist/cli/index.js"]
