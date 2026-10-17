# The Wellyboot BI web app as a static site: Node builds it, nginx serves it. Multi-arch: the build stage runs on
# the builder's own platform (the output is plain files), and nginx's image exists for amd64 and arm64.
# Build from the repository root: docker build -t wellyboot-web .

FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /app
# Every workspace's package.json, so npm ci can install the whole workspace from the lockfile.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
RUN npm ci
COPY . .
RUN npm run build -w @wellyboot/web

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/wellyboot-headers.inc /etc/nginx/conf.d/wellyboot-headers.inc
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
