# Контекст сборки — корень монорепо. Собирается в GitHub Actions (.github/workflows/docker.yml)
FROM node:22-alpine AS build
WORKDIR /repo
# rewrites /api → API вшиваются в сборку: адрес сервиса api внутри docker compose
ENV API_INTERNAL_URL=http://api:8000 NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
RUN npm ci
COPY . .
RUN npm run build -w apps/web

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
# standalone не включает public: логотип, иконки PWA и sw.js (push)
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
