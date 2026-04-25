FROM node:22-alpine AS base

# ── Dependencies ──
FROM base AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts 2>/dev/null || npm install --ignore-scripts

# ── Builder ──
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client (no DB connection needed at build time)
RUN npx prisma generate

# Build Next.js
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── Runner (Debian slim for Chromium support) ──
FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Install Chromium and dependencies for Puppeteer
RUN apt-get update && apt-get install -y \
  chromium \
  fonts-liberation \
  libnss3 \
  libatk-bridge2.0-0 \
  libdrm2 \
  libxkbcommon0 \
  libgbm1 \
  libasound2 \
  --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

RUN groupadd --system --gid 1001 nodejs
RUN useradd --system --uid 1001 nextjs

# Copy standalone build
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy Prisma files for db push at startup
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/pg ./node_modules/pg

# Copy puppeteer-core for scraping
COPY --from=builder /app/node_modules/puppeteer-core ./node_modules/puppeteer-core
COPY --from=builder /app/node_modules/@puppeteer ./node_modules/@puppeteer
COPY --from=builder /app/node_modules/chromium-bidi ./node_modules/chromium-bidi
COPY --from=builder /app/node_modules/devtools-protocol ./node_modules/devtools-protocol
COPY --from=builder /app/node_modules/typed-query-selector ./node_modules/typed-query-selector
COPY --from=builder /app/node_modules/webdriver-bidi-protocol ./node_modules/webdriver-bidi-protocol
COPY --from=builder /app/node_modules/ws ./node_modules/ws
COPY --from=builder /app/node_modules/mitt ./node_modules/mitt
COPY --from=builder /app/node_modules/debug ./node_modules/debug
COPY --from=builder /app/node_modules/ms ./node_modules/ms
COPY --from=builder /app/node_modules/zod ./node_modules/zod

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Start: push schema then run server
CMD ["sh", "-c", "npx prisma db push --url \"$DATABASE_URL\" 2>&1 || true && node server.js"]

