FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat && corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps ./apps
COPY packages ./packages
RUN HUSKY=0 pnpm install --frozen-lockfile
RUN pnpm turbo build --filter=@octo/scheduler-worker

FROM node:22-alpine AS runtime
ARG VERSION=0.0.0
ARG REVISION=unknown
ARG CREATED=unknown
LABEL org.opencontainers.image.title="octo/scheduler-worker" \
      org.opencontainers.image.description="OCTO Scheduler Worker" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}" \
      org.opencontainers.image.created="${CREATED}" \
      org.opencontainers.image.source="https://github.com/lssmanager/OCTO" \
      org.opencontainers.image.licenses="Proprietary"
RUN apk add --no-cache curl libc6-compat && addgroup -S -g 1001 octo && adduser -S -u 1001 -G octo octo
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder --chown=octo:octo /app/apps/scheduler-worker/dist ./dist
COPY --from=builder --chown=octo:octo /app/apps/scheduler-worker/package.json ./package.json
COPY --from=builder --chown=octo:octo /app/node_modules ./node_modules
COPY --from=builder --chown=octo:octo /app/packages ./packages
USER octo
EXPOSE 3003
HEALTHCHECK --interval=20s --timeout=5s --retries=3 CMD wget -qO- http://localhost:3003/health/live || exit 1
CMD ["node","dist/main.js"]
