# Backend (Medusa v2 + Mercur) production image.
#
# Build context MUST be the `backend/` directory (this file's own directory) —
# NOT `backend/packages/api`. The build is a Turborepo pipeline: the admin and
# vendor dashboard panels (apps/admin, apps/vendor) must be built *before*
# packages/api's own build step, which bundles their output into
# packages/api/.medusa/server/dashboards/*. Building packages/api alone skips
# that and the deployed dashboards will 404 on their assets.
#
# Required at BUILD time (not just runtime): MERCUR_BACKEND_URL — baked into
# the admin/vendor panel JS bundles so their in-browser API calls target the
# right origin. Pass it as a build arg, e.g.:
#   docker build --build-arg MERCUR_BACKEND_URL=https://your-backend.example.com .
# On Railway/Render, set MERCUR_BACKEND_URL as a regular service environment
# variable — both platforms expose configured env vars during Docker builds,
# so no extra wiring is needed on their end. Just make sure it's set *before*
# the first deploy (create the service first to get its public URL).

FROM node:20-alpine AS base
WORKDIR /app

# --- Install dependencies (separate layer for caching) -----------------
# Copy only the manifests needed to resolve the workspace dependency graph.
COPY package.json package-lock.json ./
COPY packages/api/package.json ./packages/api/package.json
COPY apps/admin/package.json ./apps/admin/package.json
COPY apps/vendor/package.json ./apps/vendor/package.json

# --legacy-peer-deps: this workspace has real peer-dependency conflicts
# (e.g. @medusajs/ui wants React 18, the dashboards use React 19) — the same
# flag was needed for every local install in this repo. Using `npm install`
# rather than `npm ci` here also sidesteps an npm/esbuild optional-dependency
# platform-resolution bug seen with this lockfile under `npm ci` on Linux.
RUN npm install --legacy-peer-deps --no-audit --no-fund

# --- Build ----------------------------------------------------------------
COPY . .

ARG MERCUR_BACKEND_URL
ENV MERCUR_BACKEND_URL=${MERCUR_BACKEND_URL}
ENV NODE_ENV=production

# Runs from the workspace root on purpose (see note above): builds
# apps/admin, apps/vendor, then packages/api (medusa build + bundle-dashboards).
RUN npm run build

# --- Runtime ----------------------------------------------------------------
WORKDIR /app/packages/api

# Documents the default; the platform's injected $PORT wins at runtime
# (Medusa's CLI reads process.env.PORT automatically).
EXPOSE 9000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -q --spider "http://localhost:${PORT:-9000}/health" || exit 1

CMD ["npm", "run", "start"]
