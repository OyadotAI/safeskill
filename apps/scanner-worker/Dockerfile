FROM node:22-slim

# Install npm (for npm pack) and tar (for extraction)
RUN apt-get update && apt-get install -y --no-install-recommends \
    tar git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy monorepo package files for dependency resolution
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/scanner/package.json packages/scanner/
COPY packages/scan-store/package.json packages/scan-store/
COPY apps/scanner-worker/package.json apps/scanner-worker/

# Install pnpm and dependencies
RUN npm install -g pnpm && pnpm install --frozen-lockfile

# Copy source and build
COPY packages/shared/ packages/shared/
COPY packages/scanner/ packages/scanner/
COPY packages/scan-store/ packages/scan-store/
COPY apps/scanner-worker/ apps/scanner-worker/

RUN pnpm --filter @safeskill/shared build && \
    pnpm --filter @safeskill/scanner build && \
    pnpm --filter @safeskill/scan-store build && \
    pnpm --filter @safeskill/scanner-worker build

WORKDIR /app/apps/scanner-worker

EXPOSE 8080
ENV PORT=8080

CMD ["node", "dist/handler.js"]
