FROM node:22-alpine
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/realtime/package.json ./apps/realtime/package.json
RUN pnpm install --frozen-lockfile --prod --ignore-scripts --filter @pats/realtime
COPY apps/realtime/src ./apps/realtime/src
WORKDIR /app/apps/realtime
USER node
EXPOSE 4000
CMD ["node", "src/server.mjs"]
