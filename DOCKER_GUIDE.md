# Docker Setup Guide for SQL Visual Debugger

## Prerequisites
- Docker Desktop installed ([Download](https://www.docker.com/products/docker-desktop))
- Docker Compose (included with Docker Desktop)

## Quick Start

### Build and Run All Services
```bash
docker-compose up --build
```

This will start:
- **PostgreSQL** - Database on `localhost:5433` (external tools only — see note below)
- **Backend** - Express server on `localhost:5000`
- **Frontend** - React app on `localhost:80` (http://localhost)
- **pgAdmin4** - Database manager on `localhost:5050` (http://localhost:5050)

### Stop Services
```bash
docker-compose down
```

## pgAdmin4

Open **http://localhost:5050**. Since `PGADMIN_CONFIG_SERVER_MODE` is `False`,
it skips pgAdmin's own login screen and drops you straight into the app.

A server connection named **SQL_Database (Docker)** is pre-registered via
`pgadmin/servers.json` (pointing at `host: postgres`, the Docker network name
of the database container — `localhost` won't work from inside pgAdmin's own
container, since pgAdmin and Postgres are separate containers on the
`sql-debugger-network`).

The server will show up in the left sidebar, but **greyed out until you expand
it** — pgAdmin doesn't store a password for you (see "Troubleshooting" below for
why we don't auto-inject one). Click it, and when prompted enter:
- Password: `1` (matches `POSTGRES_PASSWORD` in `docker-compose.yml`)
- Check "Save Password" so you're not asked again

If you don't see the **SQL_Database (Docker)** server at all under Servers,
`pgadmin/servers.json` is only imported the *first* time pgAdmin initializes
its config database inside the `pgadmin_data` volume — an existing volume from
before this file was added won't pick it up. Run `docker compose down -v` and
`docker compose up --build` to get a fresh import (see the Troubleshooting
section below).

### Why Postgres is on host port 5433, not 5432

Docker publishes the `postgres` container on **host port 5433** (mapped to the
container's internal 5432 — `"5433:5432"` in `docker-compose.yml`), not the
default 5432. This is deliberate: if you also have Postgres installed natively
on your machine (common, and easy to forget about), it's almost certainly
already listening on `localhost:5432`. Any tool you point at `localhost:5432`
— a native pgAdmin desktop app, `psql`, DBeaver, whatever — will silently hit
*that* server instead of Docker's, with no error, since both report the same
default database name (`SQL_Database`) if you set them up the same way. That's
exactly the "table exists in pgAdmin but not in the app" scenario.

This only matters for tools running **outside** Docker. Containers on
`sql-debugger-network` (backend, pgAdmin's pre-registered server) talk to
Postgres via the service name `postgres` on its internal port 5432 directly —
they never go through the host port mapping, so they're unaffected and always
hit the right instance.

If you need to connect from a native tool on your host (a desktop pgAdmin,
`psql`, a GUI client, etc.), use:
- Host: `localhost`
- Port: **`5433`**
- User: `postgres` / Password: `1` / Database: `SQL_Database`

The safest option remains using the **Dockerized pgAdmin at
http://localhost:5050** with the pre-registered "SQL_Database (Docker)" entry
— its `postgres` hostname simply doesn't exist outside Docker's network, so
there's no way for it to accidentally reach a native install.

## ProvSQL Provenance Tracking

The `postgres` service now builds a **custom image** (`Postgres/Dockerfile`) that
compiles the [ProvSQL](https://provsql.org/) extension from source and enables it
automatically via `Postgres/init-provsql.sql`. This powers the "ProvSQL Provenance"
tab in the Query Tree view.

**Important:** ProvSQL's setup script only runs against a *fresh* database volume
(Postgres' `docker-entrypoint-initdb.d` scripts are skipped if `pgdata` already
exists). If you were already running this project before this change, you have an
old `postgres_data` volume without ProvSQL installed. Reset it once:

```bash
docker-compose down -v        # -v removes the old postgres_data volume
docker-compose up --build     # rebuilds postgres with ProvSQL baked in
```

After that, open the app's ProvSQL Provenance tab — it lists your tables and lets
you click "Enable Provenance" on the ones you want to trace before running a query.

## Demo Schema (students / courses / enrollments)

`Postgres/schema.sql` creates and seeds three demo tables — `students`,
`courses`, `enrollments` (with a foreign-key relationship between them, useful
for exercising the Schema Visualizer) — automatically on container start, the
same way `init-provsql.sql` auto-installs ProvSQL. It runs as
`/docker-entrypoint-initdb.d/01-schema.sql`, after ProvSQL's `00-` script.

This has the same fresh-volume caveat as everything else in
`docker-entrypoint-initdb.d`: it only runs once, against a brand-new
`postgres_data` volume. If you edit `schema.sql` later, existing data won't be
touched — reset with `docker compose down -v && docker compose up --build` to
get a clean re-seed, or just run the file's contents manually through the
Query Runner / pgAdmin if you don't want to lose other data in the meantime.

### Troubleshooting: "extension not installed" or "pgsql-parser not available"

Both of these symptoms have the same root cause: **a stale Docker volume from a
build before that dependency was added.** Docker Compose does not refresh an
existing volume's contents just because the image was rebuilt — it only
populates a volume from the image the *first* time that volume is created.
`docker compose build` and `docker compose up -d --force-recreate <service>`
recreate the *container*, not the *volume*, so this alone will not fix either
issue.

- **`AST Parsing Failed: pgsql-parser library is not installed`** — the
  `backend` service bind-mounts your host's `Backend/` folder over `/app`, with
  an anonymous/named volume (`backend_node_modules`) shadowing `/app/node_modules`
  so the image's own installed packages are used instead of whatever's on your
  host. If that volume was created before `pgsql-parser` was added to
  `package.json`, it's still holding the old `node_modules` snapshot.
- **`ProvSQL extension is not installed`** — Postgres only runs the scripts in
  `docker-entrypoint-initdb.d/` (which is where `CREATE EXTENSION provsql` gets
  run) against a brand-new, empty `postgres_data` volume. If that volume
  already existed from before the custom `Postgres/Dockerfile` was added, it's
  reused as-is and initialization is skipped entirely.

The fix for both is the same — reset every project volume and rebuild:

```bash
docker compose down -v      # -v removes ALL volumes for this project:
                             # postgres_data, backend_node_modules, pgadmin_data
docker compose up --build
```

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f postgres
```

## File Structure

- **Backend/Dockerfile** - Multi-stage build for Node.js backend
- **Frontend/Dockerfile** - Multi-stage build for React frontend (Nginx serving)
- **docker-compose.yml** - Orchestrates all services
- **.env** - Environment variables for local development

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│  ┌─────────────────────────────────────────┐        │
│  │   Frontend (React + Nginx) :80          │        │
│  ├─────────────────────────────────────────┤        │
│  │        Nginx Proxy                      │        │
│  │   /api/* → http://backend:5000/*       │        │
│  └─────────────────────────────────────────┘        │
│                      │                               │
│  ┌───────────────────┴────────────────────┐         │
│  │  Backend (Express) :5000               │         │
│  ├────────────────────────────────────────┤         │
│  │  PostgreSQL :5432                      │         │
│  └────────────────────────────────────────┘         │
│                                                      │
│  pgAdmin4 :5050 (Web UI for database management)   │
│                                                      │
└──────────────────────────────────────────────────────┘
     All services on: sql-debugger-network
```

## Environment Variables

### Backend (.env)
- `DB_USER` - PostgreSQL username (default: postgres)
- `DB_PASSWORD` - PostgreSQL password (default: 1)
- `DB_HOST` - Database host (Docker: postgres, Local: localhost)
- `DB_PORT` - Database port (default: 5432)
- `DB_NAME` - Database name (default: SQL_Database)
- `NODE_ENV` - Environment (development/production)

## Development Notes

### Running Locally (Without Docker)
1. Start PostgreSQL on your machine
2. Update Backend/server.js connection details if needed
3. Run backend: `cd Backend && npm install && node server.js`
4. Run frontend: `cd Frontend && npm install && npm start`
5. Frontend will open on http://localhost:3000

### Building Docker Images Manually
```bash
# Backend
cd Backend
docker build -t sql-debugger-backend .

# Frontend
cd Frontend
docker build -t sql-debugger-frontend .
```

### Push to Docker Hub
```bash
docker tag sql-debugger-backend username/sql-debugger-backend:1.0
docker push username/sql-debugger-backend:1.0

docker tag sql-debugger-frontend username/sql-debugger-frontend:1.0
docker push username/sql-debugger-frontend:1.0
```

## Cleanup

### Remove Stopped Containers
```bash
docker-compose rm
```

### Remove All Unused Images
```bash
docker image prune
```

### Reset Database Volume
```bash
docker-compose down -v
```

## Troubleshooting

### Backend Can't Connect to Database
- Ensure PostgreSQL container is healthy: `docker-compose logs postgres`
- Check DB credentials in docker-compose.yml
- Verify backend environment variables are set correctly

### Frontend Shows "Cannot Connect to API"
- Check backend logs: `docker-compose logs backend`
- Verify Nginx proxy configuration in Frontend/nginx.conf
- Ensure frontend can resolve "backend" hostname

### Port Already in Use
```bash
# Change ports in docker-compose.yml
# Example: change frontend from 80:80 to 8080:80
```

## References
- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Node.js Docker Best Practices](https://nodejs.org/en/docs/guides/nodejs-docker-webapp/)
