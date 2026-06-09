# syntax=docker/dockerfile:1.7
FROM node:22.22.2-alpine3.22 AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat && npm install -g pnpm@11.2.2
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps ./apps
COPY packages ./packages
RUN HUSKY=0 pnpm install --frozen-lockfile
RUN pnpm turbo build --filter=@octo/outbox-publisher-worker
RUN pnpm --filter @octo/outbox-publisher-worker deploy --prod --legacy /prod/outbox-publisher-worker

FROM node:22.22.2-alpine3.22 AS runtime
# The runtime image does not need npm; removing it drops bundled npm dependency scan findings.
RUN rm -rf /usr/local/lib/node_modules/npm \
    /usr/local/bin/npm \
    /usr/local/bin/npx \
    /usr/local/bin/npm-cli.js \
    /usr/local/bin/npx-cli.js \
    /usr/local/bin/npm-prefix.js
ARG VERSION=0.0.0
ARG REVISION=unknown
ARG CREATED=unknown
LABEL org.opencontainers.image.title="octo/outbox-publisher-worker" \
      org.opencontainers.image.description="OCTO Outbox Publisher Worker" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}" \
      org.opencontainers.image.created="${CREATED}" \
      org.opencontainers.image.source="https://github.com/lssmanager/OCTO" \
      org.opencontainers.image.licenses="Proprietary"
RUN apk add --no-cache libc6-compat && addgroup -S -g 1001 octo && adduser -S -u 1001 -G octo octo
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder --chown=octo:octo /prod/outbox-publisher-worker ./
USER octo
EXPOSE 3010
HEALTHCHECK --interval=20s --timeout=5s --retries=3 CMD wget -qO- http://localhost:3010/health/live || exit 1
CMD ["node","dist/main.js"]
