# Bitcoin Node Dashboard

Dark, live dashboard for a self-hosted Bitcoin node and its related services. By
default, Docker Compose serves it at `http://192.168.88.44:3003` on the configured
LAN address; change the published address in `docker-compose.yml` for another host.

## Live data

The Python standard-library collector polls every 60 seconds. The React frontend
fetches a sanitized snapshot every 60 seconds through the same-origin `/api/status`.

- Bitcoin: chain/header height, verification progress, inbound/outbound peers,
  version, pruning, chain-data size, mempool count/vsize/memory and onion settings.
- Bitcoin height chart: real block headers for the last 24 hours, refreshed every
  60 seconds. No synthetic historical points.
- Mempool: precise priority, 30-minute, hour and economy fee recommendations,
  including sub-1 sat/vB rates. The 24-hour size trend uses real statistics samples
  (`mempool_byte_weight / 4` converted to MvB), retaining the last sample in each
  five-minute slot. No histogram polling or fabricated history. Samples older than
  180 seconds are rejected; chart labels and tooltips use 24-hour clock time.
- Electrs: live `blockchain.headers.subscribe` indexed height and lag versus Core,
  plus the application version from `server.version`.
- Docker: state, uptime description, image tag, start time and configured health
  checks through the existing read-only Homepage Docker proxy. A running container
  does not imply an unlocked wallet or a ready application.
- RTL/Jam: HTTP reachability in their information dialogs. HTTP 401/403 indicates
  a reachable interface requiring authentication, not a wallet readiness check.
- Tor: actual SOCKS5 handshake plus Core onion-network availability/configuration.
  Application version comes from its startup announcement, cached per container ID;
  if unavailable, the subtitle reports that rather than showing an image tag.
  No circuit map, onion-service reachability or global privacy claims are inferred.
- BlitzPool: live total hashrate, active mining-session count (not historical
  registered miners), total blocks found and best share difficulty. The 24-hour
  chart uses completed share-statistics intervals from `/api/info/chart?range=1d`.
  API health checks are available in the info panel; missing TDP health stays
  "Not reported". Cache outages hide fallback hashrate/session values instead of
  displaying false zeroes. `/api/info/version` is checked daily and on API container
  changes. No pool admin token or individual miner addresses are exposed.
- Events: collector starts, observed tip changes, source recovery/failure and
  container state/start/health changes. SQLite retains seven days under `state/`.
  Events observed while the collector is stopped cannot be reconstructed.

The top bar shows update age; the bitcoind height also shows the age of the
latest block timestamp in minutes. Events use fixed timestamps.
Source details show availability without timers. Failed or >180-second-old live
values show unavailable, never demo fallback. Block history expires after three
minutes. A browser API failure hides connected values. Sources recover independently.

## LND monitoring and unavailable fields

All displayed values are now live; no demo balances or routing/capacity charts
remain. LND state is queried over TLS without wallet authentication. The collector
mounts only the LND TLS certificate and dedicated `dashboard.macaroon` (GetInfo only), not the
wallet directory, seed, password or admin macaroon. It queries `GetInfo` only when
LND reports RPC/server readiness, and returns only chain/graph sync, block height,
peer count and active/inactive/pending channel counts. Locked LND is labelled
Locked; unavailable counts are dashes, never invented zeroes. No unlock is
performed. The dedicated monitoring credential lets fields populate after a manual
unlock, without changing the dashboard or storing the wallet password.

JoinMarket shows live maker/CoinJoin state and advertised market offers/bond
totals. No wallet balances, UTXOs, private history or privacy score are displayed.
Jam web authentication comes from `../joinmarket/.env`, mounted read-only into
the collector. Only fixed session and orderbook reads are made; only selected
booleans and counts reach the browser. RTL/Jam interface checks are separate from
wallet/node readiness. Electrs monitoring includes allocated database size (daily), interval query rate,
mean server-side processing time, per-method lifetime counters and a persisted
24-hour query-rate chart. Rates use actual counter deltas and elapsed time,
including dashboard probes. First samples, counter resets and container restarts
start a new baseline. Missing latency during an idle interval is not zero latency.
Metrics use port 4224 only on the internal Docker network, with no host port.
The database mount is read-only and size measurement does not follow symlinks.

## Run and maintain

```sh
cd /home/dietpi/dashboard
docker compose up -d --build
```

This compose file expects the host's existing Bitcoin, JoinMarket, LND, electrs,
mempool, Tor, BlitzPool and read-only Homepage Docker proxy services on the
external `bitcoin` Docker network. It also expects the read-only credential and
certificate files referenced by the compose mounts to exist. Electrs Prometheus
metrics must be reachable at `electrs:4224` on that network. The dashboard does
not create or manage those services.

Both services explicitly join the external `bitcoin` network. Bitcoin remains
independently managed; no blockchain volumes, IPC settings or node builds change.
The collector reads `../bitcoin/bitcoin.conf` read-only for existing RPC credentials.
It uses only fixed read-only RPC calls; no generic RPC or Docker proxy endpoint is
exposed to the browser. Its only published API is the selected status snapshot.
The Docker socket is not mounted into either dashboard container.

The collector runs as UID 1000 with a read-only root filesystem, dropped Linux
capabilities and no privilege escalation. `state/` must be writable by UID 1000.
It reuses `homepage-dockerproxy:2375`; if Homepage's proxy is stopped, other data
sources continue and Docker metadata becomes unavailable. Start order is otherwise
independent; missing upstream services recover on later polls.

This is a LAN dashboard without a sign-in flow. Port 3003 binds only the host LAN
address. Do not expose it publicly without adding access controls.

Stack: React 19, TypeScript, Vite, Tailwind 4, shadcn-style Button, Radix Dialog,
Lucide icons and Recharts; Python 3.13 collector; Nginx static frontend/API proxy.
With Node 22, run `npm ci` and `npm run dev` (the Vite dev server proxies `/api` to the running LAN dashboard), or build with `npm run build`. Docker is self-contained.
Collector tests: `python3 -m unittest discover -s backend -v`.

Application version sources are checked daily (86,400 seconds) and immediately
after a changed container ID or start time is observed at the next 60-second
container check. Failed version checks retry on the next cycle. LND/JoinMarket
versions come from container metadata already needed for the live state check.

All clock times use 24-hour notation, including chart labels, tooltips and events.
