# syntax=docker/dockerfile:1
# Build context should be the wallet-mcp-server/ directory.
FROM node:20-alpine AS builder

WORKDIR /app

# Copy manifests first for better layer caching.
COPY package.json package-lock.json tsconfig.json ./

# Install all dependencies.
RUN npm ci

# Copy source and build.
COPY src ./src
RUN npm run build

# ---------------------------------------------------------------------------
# Runtime stage
# ---------------------------------------------------------------------------
FROM node:20-alpine AS runtime

WORKDIR /app

# Create non-root user (node:20-alpine already has a `node` user with UID 1000).
RUN adduser -S waluser -u 1001 -G nogroup

# Create keystore directory and set ownership so the runtime user can write.
RUN mkdir -p /home/waluser/.config/wallet-mcp-server && chown -R waluser:nogroup /home/waluser

# Copy built artifacts from the builder stage.
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json

# Install only production dependencies.
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force

# Default keystore path
ENV WALLET_KEYSTORE_PATH=/home/waluser/.config/wallet-mcp-server/keystore.json
# Default Dynamic (Ambient) session path
ENV DYNAMIC_SESSION_PATH=/home/waluser/.config/wallet-mcp-server/dynamic-session.json

USER waluser

ENV NODE_ENV=production

ENTRYPOINT ["node", "dist/index.js"]