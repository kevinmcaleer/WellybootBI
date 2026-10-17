# Running and deploying Wellyboot BI

Wellyboot BI is two services. `web` is nginx serving the built app, which does all its work in the browser. `server` is a small Node service that will handle publishing, share links and embeds; for now it only answers a health check. Both images build for `linux/amd64` and `linux/arm64`, so they run on a cluster or a Raspberry Pi.

## Running it locally with Docker Compose

From the repository root:

```sh
docker compose up -d --build
```

Then open <http://localhost:8090> for the app. The server answers on <http://localhost:8787/healthz>. `docker compose ps` shows both as healthy once their health checks pass, `docker compose logs -f` follows their logs, and `docker compose down` stops them. After pulling new code, run `docker compose up -d --build` again to rebuild.

These settings can go in the environment or in a `.env` file next to `compose.yaml`:

| Variable | Default | What it does |
| --- | --- | --- |
| `WELLYBOOT_WEB_PORT` | `8090` | The port the app answers on, on the host (Puddle's compose file uses 8088, so both can run side by side) |
| `WELLYBOOT_SERVER_PORT` | `8787` | The port the server answers on, on the host |
| `WELLYBOOT_WEB_IMAGE` | `wellyboot-web:latest` | The web image to run |
| `WELLYBOOT_SERVER_IMAGE` | `wellyboot-server:latest` | The server image to run |
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
- Hashed files under `/assets/` are cached for a year; `index.html` is always revalidated, so a deploy shows on the next visit.
- `/healthz` answers `ok`. The container runs as a non-root user with a read-only root file system and a writable `/tmp`.

The server image holds one bundled `server.js` on `node:22-alpine`, runs as the `node` user and reads its port from `WELLYBOOT_PORT` (default 8787).

## The tunnel

1. In Cloudflare Zero Trust, go to Networks, then Tunnels, and create a tunnel. Copy its token.
2. Add a public hostname pointing at the service `http://web:8080`.
3. Next to `compose.yaml`, create a `.env` file containing `CLOUDFLARE_TUNNEL_TOKEN=<token>`, then start the stack with the tunnel:

   ```sh
   docker compose --profile tunnel up -d
   ```

   The tunnel starts once the web health check passes.
