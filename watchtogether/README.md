# WatchTogether Server

Self-hostable relay server for the WatchTogether browser extension.

## Deploy

The default deployment is public: anyone using the extension can connect through your HTTPS domain. Private access controls are optional and intended for personal or closed-group servers.

### 1. Upload or clone the repository

```bash
cd /opt
git clone <your-repo-url> watchtogether
cd watchtogether
```

### 2. Configure environment variables

Create a `.env` file when using Docker Compose:

```bash
CLIENT_TOKEN=
ALLOWED_ORIGINS=
GRAFANA_PASSWORD=change-me
```

Leave `CLIENT_TOKEN` and `ALLOWED_ORIGINS` empty for the normal public server mode. This keeps the server usable exactly like the packaged public relay: users only need the server URL.

`CLIENT_TOKEN` is optional private-server protection. When set, every extension user must enter the same token in Settings. Do not embed this token in a public extension package.

`ALLOWED_ORIGINS` is optional browser-origin filtering. It is useful as an extra private-server restriction, but it is easy to misconfigure and is not a replacement for real authentication. When set, only matching browser extension origins can call the API or WebSocket endpoint, for example:

```bash
ALLOWED_ORIGINS=chrome-extension://your-extension-id
```

Leave both empty unless you intentionally want a private deployment.

### 3. Start services

Docker Compose deployment:

```bash
docker compose up -d --build
```

Local health check:

```bash
curl http://127.0.0.1:8892/health
```

Existing systemd deployment:

```bash
sudo ./manage.sh deploy
sudo ./manage.sh status
```

`deploy` builds the backend, reloads systemd, restarts the service, checks local health, checks whether backend/monitoring ports are exposed publicly, and tests the Nginx config. In an interactive shell it will ask whether to reload Nginx.

To reload Nginx without a prompt:

```bash
sudo ./manage.sh deploy --reload-nginx
```

To reload Nginx separately:

```bash
sudo ./manage.sh nginx-reload
```

For first-time setup or old servers, confirm the backend is local-only:

```bash
sudo systemctl cat watchtogether
```

The service should include:

```text
Environment=BIND_HOST=127.0.0.1
```

If it does not, update the service file or rerun `install.sh`, then run:

```bash
sudo systemctl daemon-reload
sudo ./manage.sh restart
```

### 4. Configure Nginx

Copy `nginx_snippet.conf` into your existing HTTPS server block. The extension expects the `/wt/...` prefix when using the packaged defaults.

```bash
nginx -t
systemctl reload nginx
```

### 5. Extension settings

Open the extension settings page and set:

```text
Server URL: https://your-domain.com
Server Access Token: <CLIENT_TOKEN, only for private servers>
```

## Ports

| Port | Purpose |
| ---- | ------- |
| 8892 | Go API and WebSocket server |
| 9091 | Prometheus metrics endpoint |
| 9090 | Prometheus |
| 3100 | Loki |
| 3000 | Grafana |

The Docker Compose file binds these ports to `127.0.0.1` by default. Public traffic should go through Nginx at `/wt/room/`, `/wt/ws`, and `/wt/health`. Do not expose the backend or monitoring ports directly unless you intentionally need local administration access through another secured channel.

## Directory Layout

```text
watchtogether/
  backend/              Go server source
  monitoring/           Prometheus, Loki, and Grafana config
  logs/                 Runtime logs
  docker-compose.yml
  nginx_snippet.conf    Reverse proxy snippet for an existing Nginx site
  README.md
```
