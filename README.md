# WatchTogether

Synchronized video watching for YouTube and Bilibili. Anyone can host their own relay server.

## Features

- Sync playback (play / pause / seek) in real time
- Supports YouTube and Bilibili
- Room host controls sync; optional guest control mode
- Veto protection: guests get a countdown to opt out before sync applies
- Up to 5 people per room
- Host can move the active room to any supported tab
- Video switch notifications with 30-second follow countdown
- Auto-reconnect with catch-up prompt on reconnect
- Floating bubble entry on all video pages
- **Self-hostable** — point the extension at your own server

---

## Architecture

```
Browser Extension (Chrome)
  ├── background.js      Service worker: WebSocket, state, API calls
  ├── content.js         Floating bubble, banners, video event hooks
  ├── adapters/          YouTube & Bilibili video element adapters
  ├── popup/             Extension popup (create/join room)
  └── settings/          Settings page (server URL, nickname, language)

Go Server
  ├── main.go            HTTP routes
  ├── ws.go              WebSocket handler, sync logic
  ├── room.go            Room create/join REST endpoints
  ├── models.go          Data types
  ├── state.go           Global in-memory state
  ├── config.go          Environment variable config
  ├── security.go        IP detection, CORS
  ├── cleanup.go         Periodic room expiry
  ├── logger.go          Rotating log writer
  └── metrics.go         Prometheus metrics
```

---

## Server Deployment

### Requirements

- Linux server (Ubuntu 20.04+ / Debian 11+ / CentOS 8+)
- A domain name with DNS pointing to the server
- Ports 80 and 443 open (for Nginx + Let's Encrypt)

### One-command install

```bash
curl -fsSL https://raw.githubusercontent.com/DYINGTIMENANOHA/watchtogether-browser-tool/main/watchtogether/install.sh \
  | sudo bash -s -- --domain watch.example.com --email admin@example.com
```

Or clone first and run locally:

```bash
git clone https://github.com/DYINGTIMENANOHA/watchtogether-browser-tool.git /opt/watchtogether-extension
cd /opt/watchtogether-extension
sudo bash watchtogether/install.sh --domain watch.example.com --email admin@example.com
```

The script will:
1. Install Go if needed
2. Compile the binary
3. Register and start a `systemd` service
4. Install and configure Nginx
5. Request a Let's Encrypt certificate when DNS is ready
6. Run local and HTTPS health checks

For two public relays, run the same command on both servers with different domains, for example:

```bash
# Hong Kong / overseas VPS
sudo bash watchtogether/install.sh --domain hk.example.com --email admin@example.com

# Shanghai / mainland VPS
sudo bash watchtogether/install.sh --domain cn.example.com --email admin@example.com
```

The browser extension can then expose these as the Overseas and Mainland China regions.

### Nginx + HTTPS (required for the extension)

Chrome extensions require `wss://` (secure WebSocket). The one-command installer can configure Nginx and Certbot automatically. If you maintain Nginx yourself, add this to your HTTPS server block instead:

```bash
include /opt/watchtogether-extension/watchtogether/nginx_snippet.conf;
```

### Service management

```bash
./manage.sh start     # Start
./manage.sh stop      # Stop
./manage.sh restart   # Restart
./manage.sh deploy    # Recompile and restart
./manage.sh status    # Status
./manage.sh log       # Live logs
./manage.sh log20     # Last 20 log lines
```

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8892` | HTTP listen port |
| `MAX_ROOMS` | `10000` | Max concurrent rooms |
| `ROOM_TTL_MINUTES` | `60` | Room expiry after inactivity |
| `HOST_RECONNECT_MINUTES` | `180` | How long a disconnected host can reclaim the room |
| `ROOM_MAX_IDLE_MINUTES` | `180` | Absolute ceiling: room is deleted after this long with no heartbeat/activity at all, regardless of members or reconnect state |
| `TOKEN_FAIL_MAX` | `5` | Failed joins before IP ban |
| `TOKEN_BAN_MINUTES` | `10` | IP ban duration |
| `RATE_LIMIT_PER_MIN` | `5` | Room creations per IP per minute |
| `WS_MAX_PER_IP` | `20` | Concurrent WS connections per IP |
| `HEARTBEAT_TIMEOUT` | `45` | WS heartbeat timeout (seconds) |
| `LOG_PRETTY` | `0` | Set to `1` for human-readable console logs |
| `LOG_DEBUG` | `0` | Set to `1` for debug-level logging |

---

## Extension Setup

### Load in Chrome (developer mode)

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `extension/` folder

### Configure your server

1. Click the extension icon → **⚙** (top right)
2. Enter your server URL: `https://watch.example.com`
3. Click **Test** to verify the connection
4. Click **Save Settings**

Leave the server URL blank to use the official server.

### Invite links

The room host can copy an invite link from the popup or the floating bubble panel. The link embeds the invite code:

- **YouTube**: `https://www.youtube.com/watch?v=VIDEO_ID#wt-code=TOKEN`
- **Bilibili**: `https://www.bilibili.com/video/BV_ID/?wt_code=TOKEN`

When a guest opens the link, the content script detects the code and shows a join prompt.

---

## Development

```bash
# Build server
cd watchtogether/backend
go build -o watchtogether .

# Run with pretty logs
LOG_PRETTY=1 LOG_DEBUG=1 ./watchtogether
```

Logs are written to `watchtogether/backend/logs/watchtogether.log` with automatic rotation (max 100 MB per file, 3 files retained).

---

## Supported Platforms

| Platform | Video sync | Invite links |
|----------|-----------|-------------|
| YouTube | ✅ | ✅ |
| Bilibili | ✅ | ✅ |

---

## License

MIT
