FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/scanner/package.json packages/scanner/
COPY packages/scan-store/package.json packages/scan-store/
COPY apps/discovery-job/package.json apps/discovery-job/

RUN npm install -g pnpm && pnpm install --frozen-lockfile

COPY packages/shared/ packages/shared/
COPY packages/scanner/ packages/scanner/
COPY packages/scan-store/ packages/scan-store/
COPY apps/discovery-job/ apps/discovery-job/

RUN pnpm --filter @safeskill/shared build && \
    pnpm --filter @safeskill/scanner build && \
    pnpm --filter @safeskill/scan-store build && \
    pnpm --filter @safeskill/discovery-job build

WORKDIR /app/apps/discovery-job

CMD ["node", "dist/index.js"]
