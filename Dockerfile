# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY shared/package.json shared/package.json

RUN npm ci

COPY backend backend
COPY frontend frontend
COPY shared shared

RUN npm run prisma:generate --workspace backend \
  && npm run build \
  && npm prune --omit=dev \
  && test -f node_modules/.prisma/client/index.js \
  && test -f backend/dist/src/server.js \
  && test -f frontend/dist/index.html \
  && test -f shared/dist/settings.js

FROM node:22-bookworm-slim AS backend

ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend

COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/backend/package.json ./package.json
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/backend/prisma ./prisma
COPY --from=build /app/shared/package.json /app/shared/package.json
COPY --from=build /app/shared/dist /app/shared/dist

RUN mkdir -p .cache/posters .cache/poster-variants .cache/imdb \
  && chown -R node:node /app/backend/.cache

USER node

EXPOSE 19993

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e 'fetch(`http://127.0.0.1:${process.env.PORT || 19993}/api/health`).then(response => { if (!response.ok) process.exit(1) }).catch(() => process.exit(1))'

CMD ["node", "dist/src/server.js"]

FROM nginx:1.27-alpine AS frontend

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz >/dev/null || exit 1
