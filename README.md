# SQL Visual Debugger

A web-based tool for understanding how SQL queries execute. You write a query against a PostgreSQL database and the tool shows its physical execution plan, its logical (relational algebra) tree, and row-level provenance computed with the [ProvSQL](https://github.com/PierreSenellart/provsql) extension, so you can trace which input rows produced each result.

The stack is a React frontend, a Node.js/Express backend, PostgreSQL 15 with ProvSQL, and pgAdmin. All four run in Docker.

## Running it

Prerequisite: [Docker Desktop](https://www.docker.com/products/docker-desktop) (includes Docker Compose).

From the repository root:

```bash
docker compose up --build
```

Once the containers are up:

| Service  | Address                 |
|----------|-------------------------|
| App      | http://localhost:3000   |
| Backend  | http://localhost:5000   |
| pgAdmin  | http://localhost:5050   |

The database is seeded with demo tables (`students`, `courses`, `enrollments`) from `Postgres/schema.sql`. To stop the stack, run `docker compose down`.

## Further reading

- [DOCKER_GUIDE.md](DOCKER_GUIDE.md): detailed setup, pgAdmin login and troubleshooting
- [SHOWCASE.md](SHOWCASE.md): example queries for each supported SQL feature
