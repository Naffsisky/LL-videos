FROM node:20-alpine AS base

# Install rclone
RUN apk add --no-cache curl unzip openssl && \
    curl -O https://downloads.rclone.org/rclone-current-linux-amd64.zip && \
    unzip rclone-current-linux-amd64.zip && \
    mv rclone-*/rclone /usr/local/bin/ && \
    rm -rf rclone-*

# ── deps ──────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci && npx prisma generate

# ── build ─────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

# ── runner ────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000
ENV PORT=3000
# Copy rclone config to writable /tmp so OAuth tokens can be refreshed
CMD ["/bin/sh", "-c", "mkdir -p /tmp/rclone && cp /root/.config/rclone/rclone.conf /tmp/rclone/rclone.conf 2>/dev/null || true; RCLONE_CONFIG=/tmp/rclone/rclone.conf exec node server/index.js"]
