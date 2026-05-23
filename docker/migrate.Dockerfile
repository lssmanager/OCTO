FROM node:20-alpine
WORKDIR /app
COPY . .
RUN corepack enable && corepack prepare pnpm@11.2.2 --activate
RUN pnpm install --frozen-lockfile
CMD ["pnpm", "db:migrate"]
