# Bitcoin Node Dashboard

## Requirements

- Docker Engine and Docker Compose v2.
- An existing external Docker network (defaults to `bitcoin`).
- The integrated services reachable on that network. See the service addresses
  and ports in `backend/server.py`.
- Host files for Bitcoin Core configuration, JoinMarket environment, LND TLS
  certificate and dashboard macaroon, and the Electrs database.

## Setup

```sh
cp .env.template .env
```

Edit `.env` and replace the example host paths. Set the bind address and port as
needed; the template binds to loopback by default. Keep `.env` private; it is
ignored by Git. The persistent state directory must be writable by UID 1000 in
the collector container.

Start the dashboard and collector:

```sh
docker compose up -d --build
```

View logs or stop the stack:

```sh
docker compose logs -f collector
docker compose down
```
