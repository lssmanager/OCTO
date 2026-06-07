FROM node:22.22.2-alpine3.22 AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat && npm install -g pnpm@11.2.2
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps ./apps
COPY packages ./packages
RUN HUSKY=0 pnpm install --frozen-lockfile
RUN pnpm turbo build --filter=@octo/api
RUN pnpm --filter @octo/api deploy --prod --legacy /prod/api

FROM node:22.22.2-alpine3.22 AS runtime
# The runtime image does not need npm; removing it drops bundled npm dependency scan findings.
RUN rm -rf /usr/local/lib/node_modules/npm \
    /usr/local/bin/npm \
    /usr/local/bin/npx \
    /usr/local/bin/npm-cli.js \
    /usr/local/bin/npx-cli.js \
    /usr/local/bin/npm-prefix.js
ARG SOURCE_COMMIT=local
ARG BUILD_VERSION=0.1.0-f1
ARG BUILD_COMMIT=${SOURCE_COMMIT}
ARG BUILD_PHASE=F1
ARG BUILD_TIME=local
ARG VERSION=${BUILD_VERSION}
ARG REVISION=${BUILD_COMMIT}
ARG CREATED=${BUILD_TIME}
LABEL org.opencontainers.image.title="octo/api" \
      org.opencontainers.image.description="OCTO API Control Plane" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}" \
      org.opencontainers.image.created="${CREATED}" \
      org.opencontainers.image.source="https://github.com/lssmanager/OCTO" \
      org.opencontainers.image.licenses="Proprietary"
RUN apk upgrade --no-cache \
  && addgroup -S -g 1001 octo \
  && adduser -S -u 1001 -G octo octo
WORKDIR /app
ENV NODE_ENV=production \
    BUILD_VERSION=${BUILD_VERSION} \
    BUILD_COMMIT=${BUILD_COMMIT} \
    BUILD_PHASE=${BUILD_PHASE} \
    BUILD_TIME=${BUILD_TIME}
COPY --from=builder --chown=octo:octo /prod/api ./
USER octo
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 CMD wget -qO- http://localhost:3001/api/health/live || exit 1
CMD ["node","dist/main.js"]
