# syntax=docker/dockerfile:1.7
FROM node:22.22.2-alpine3.22 AS builder
WORKDIR /app
ENV TURBO_TELEMETRY_DISABLED=1
RUN apk add --no-cache libc6-compat && npm install -g pnpm@11.2.2
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
RUN HUSKY=0 pnpm install --frozen-lockfile

FROM node:22.22.2-alpine3.22 AS runtime
ARG VERSION=0.0.0
ARG REVISION=unknown
ARG CREATED=unknown
LABEL org.opencontainers.image.title="octo/migrate" \
      org.opencontainers.image.description="OCTO database migration job" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}" \
      org.opencontainers.image.created="${CREATED}" \
      org.opencontainers.image.source="https://github.com/lssmanager/OCTO" \
      org.opencontainers.image.licenses="Proprietary"
RUN npm install -g pnpm@11.2.2 \
  && addgroup -S -g 1001 octo \
  && adduser -S -u 1001 -G octo octo \
  && rm -rf /usr/local/lib/node_modules/npm \
    /usr/local/bin/npm \
    /usr/local/bin/npx \
    /usr/local/bin/npm-cli.js \
    /usr/local/bin/npx-cli.js \
    /usr/local/bin/npm-prefix.js
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder --chown=octo:octo /app /app
# pnpm creates transient _tmp_* files in the current working directory when
# running scripts. WORKDIR creates /app as root-owned, so make the directory
# itself writable by the non-root runtime user, not only its copied contents.
RUN chown octo:octo /app
USER octo
HEALTHCHECK NONE
CMD ["pnpm","db:migrate"]
