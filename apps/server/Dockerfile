# The Wellyboot BI server. esbuild bundles it and its dependencies into one file, so the runtime image needs no
# node_modules. Build from the repository root: docker build -f apps/server/Dockerfile -t wellyboot-server .

FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
RUN npm ci
COPY . .
RUN npm run build -w @wellyboot/server

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production WELLYBOOT_PORT=8787
COPY --from=build /app/apps/server/dist/server.js ./server.js
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1:8787/healthz || exit 1
CMD ["node", "server.js"]
