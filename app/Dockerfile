# Shared dependency layer (includes dev deps, e.g. kysely-ctl for migrations)
FROM node:24-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# Build the SvelteKit app, then prune to production dependencies
FROM deps AS builder
COPY . .
RUN pnpm run build
RUN pnpm prune --prod

# One-shot database migration runner.
# Keeps the full dependency set + migrations + kysely config so `kysely migrate up` can run.
FROM deps AS migrator
COPY . .
CMD [ "pnpm", "run", "migrate:up" ]

# Final runtime image (must remain the last stage so the app service builds it by default)
FROM node:24-alpine AS runner
WORKDIR /app
COPY --from=builder /app/build build/
COPY --from=builder /app/node_modules node_modules/
COPY package.json .
EXPOSE 3000
ENV NODE_ENV=production
CMD [ "node", "build" ]
