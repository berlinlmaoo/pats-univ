# Build from the repo root: docker build -f apps/web/Dockerfile .
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable

FROM base AS build
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
COPY apps/web/prisma apps/web/prisma
COPY apps/web/prisma.config.ts apps/web/
RUN pnpm install --frozen-lockfile --filter @pats/web...
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @pats/web build

FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
# Headless Chromium renders the card print PDFs (src/lib/card-print).
RUN apt-get update && apt-get install -y --no-install-recommends chromium fonts-dejavu-core ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
COPY --from=build /repo/apps/web/card-templates ./apps/web/card-templates
# Migrations run on start (prisma migrate deploy) with the CLI from the build stage.
COPY --from=build /repo/apps/web/prisma ./apps/web/prisma
COPY --from=build /repo/apps/web/prisma.config.ts ./apps/web/
COPY --from=build /repo/node_modules ./node_modules
EXPOSE 3000
CMD ["sh", "-c", "cd apps/web && node ../../node_modules/prisma/build/index.js migrate deploy && node server.js"]
