# Running and deploying Wellyboot BI

Wellyboot BI is two services. `web` is nginx serving the built app, which does all its work in the browser. `server` is a small Node service that will handle publishing, share links and embeds; for now it only answers a health check. Both images build for `linux/amd64` and `linux/arm64`, so they run on a cluster or a Raspberry Pi.

## Running it locally with Docker Compose

From the repository root:

```sh
docker compose up -d --build
```

Then open <http://localhost:8090> for the app. The server answers on <http://localhost:8787/healthz>. `docker compose ps` shows both as healthy once their health checks pass, `docker compose logs -f` follows their logs, and `docker compose down` stops them. After pulling new code, run `docker compose up -d --build` again to rebuild.

These settings can go in the environment or in a `.env` file next to `compose.yaml` (copy `.env.example` to start one). None is needed to run locally:

| Variable | Default | What it does |
| --- | --- | --- |
| `WELLYBOOT_WEB_PORT` | `8090` | The port the app answers on, on the host (Puddle's compose file uses 8088, so both can run side by side) |
| `WELLYBOOT_SERVER_PORT` | `8787` | The port the server answers on, on the host |
| `WELLYBOOT_WEB_IMAGE` | `wellyboot-web:latest` | The web image to run |
| `WELLYBOOT_SERVER_IMAGE` | `wellyboot-server:latest` | The server image to run |
| `FETCH_EXTENSIONS` | `1` | Set `0` to build where extensions.duckdb.org can't be reached (see below) |
| `CLOUDFLARE_TUNNEL_TOKEN` | none | The tunnel's token, for the `tunnel` profile |

## The images

To build and run them without Compose:

```sh
docker build -t wellyboot-web .
docker run --rm -p 8090:8080 --read-only --tmpfs /tmp wellyboot-web

docker build -f apps/server/Dockerfile -t wellyboot-server .
docker run --rm -p 8787:8787 --read-only wellyboot-server
```

What the web image does (`deploy/nginx.conf`, after Puddle's):

- Every response carries `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` (`deploy/wellyboot-headers.inc`), so the page is cross-origin isolated for DuckDB-WASM.
- `.wasm` is served as `application/wasm`, and responses are gzipped.
- DuckDB's `json` and `parquet` extensions are downloaded at build time and served from `/duckdb-extensions/<version>/`, so the app never contacts extensions.duckdb.org. Where that site can't be reached during the build, add `--build-arg FETCH_EXTENSIONS=0`; JSON and Parquet then load from extensions.duckdb.org at run time instead.
- Hashed files under `/assets/` and the extensions are cached for a year; `index.html` is always revalidated, so a deploy shows on the next visit.
- `/healthz` answers `ok`. The container runs as a non-root user with a read-only root file system and a writable `/tmp`.

The server image holds one bundled `server.js` on `node:22-alpine`, runs as the `node` user and reads its port from `WELLYBOOT_PORT` (default 8787).

## The smoke test

`scripts/smoke-test.sh` checks a running stack the way CI does: the web app answers with the cross-origin isolation headers, `/healthz` answers on both services, and the self-hosted extensions are served as `application/wasm`.

```sh
docker compose up -d --build
scripts/smoke-test.sh                       # or: scripts/smoke-test.sh http://localhost:8090 http://localhost:8787
```

Pass `--no-extensions` for an image built with `FETCH_EXTENSIONS=0`.

## The tunnel

A Cloudflare Tunnel puts the app on a public hostname without opening a port on your router. The `cloudflared` service in `compose.yaml` makes an outbound connection to Cloudflare, and Cloudflare sends the hostname's traffic down it to the `web` service on the Compose network.

1. In Cloudflare Zero Trust, go to Networks, then Tunnels, and create a tunnel of the Cloudflared type. On the install step, copy the token from the command it shows (the long string after `--token`); you don't need to run the command.
2. On the tunnel's public hostname step (Published application routes in newer dashboards), add a hostname: pick the subdomain and the domain, then set the service type to `HTTP` and the URL to `web:8080`. That is the `web` service's name and its port inside the container, not the host port. Cloudflare creates the DNS record for the hostname.
3. Copy `.env.example` to `.env` next to `compose.yaml` and set `CLOUDFLARE_TUNNEL_TOKEN` to the token (the tunnel's ID isn't needed: the token carries it), then start the stack with the tunnel:

   ```sh
   docker compose --profile tunnel up -d
   ```

   The tunnel starts once the web health check passes.

   Check it with `docker compose logs cloudflared`, which shows the registered connections, and the tunnel shows as healthy in the dashboard.

The app needs no change for the hostname: it is served from the root of whatever host it is reached on, and the cross-origin isolation headers come from nginx, so they pass through the tunnel. Once the tunnel works, the host ports aren't needed for visitors; keep them for the smoke test or bind them to `127.0.0.1` in `WELLYBOOT_WEB_PORT` and `WELLYBOOT_SERVER_PORT` (for example `127.0.0.1:8090`).

### Running on several nodes

Run the same stack with the same `CLOUDFLARE_TUNNEL_TOKEN` on each node. Every node's `cloudflared` joins the one tunnel as a replica, the dashboard lists each as a connector, and Cloudflare sends each visitor to a nearby healthy replica and stops sending to a node that goes down. Nothing else changes: the hostname still points at `web:8080`, which each replica resolves on its own node. A tunnel takes up to 25 replicas.

Each node serves its own copy of the app, so deploy the same version everywhere (for example by setting `WELLYBOOT_WEB_IMAGE` and `WELLYBOOT_SERVER_IMAGE` to the same published tags). Replicas don't share state: that's fine while the server is stateless, and publishing and share links will need a shared store before they run on more than one node.
