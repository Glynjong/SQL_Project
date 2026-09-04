# Custom PostgreSQL image with the ProvSQL extension built from source.
# ProvSQL adds semiring-provenance tracking (the "why did this row appear"
# circuit) that the ProvSQL Provenance tab in the app depends on.
# It ships as source only (no apt/PGXN binary package), so we compile it
# against the same postgres:15 base the rest of the stack uses.
FROM postgres:15-alpine

# IMPORTANT: do NOT `apk add postgresql-dev` here. Alpine's own postgresql-dev
# package is a *different* Postgres build (its pg_config lands on /usr/bin,
# ahead of /usr/local/bin on PATH) than the one docker-library's postgres:15-alpine
# actually compiles and runs (installed under /usr/local). Building against the
# apk one silently compiles/installs the extension for the wrong Postgres, so
# CREATE EXTENSION later fails to find it. The real postgres:15-alpine image
# already ships /usr/local/bin/pg_config and the matching server headers from
# its own build (make install installs headers even after build tools are
# stripped), so we only need a C++ toolchain, git, and Boost.
RUN apk add --no-cache --virtual .build-deps \
        build-base \
        git \
        boost-dev \
    && apk add --no-cache \
        boost-libs \
        libstdc++

WORKDIR /tmp/provsql

# Pin a known-good tag rather than tracking master, so the image is
# reproducible. Bump this when you deliberately want a newer ProvSQL.
ARG PROVSQL_VERSION=v1.5.0
# Pin PG_CONFIG explicitly (rather than relying on PATH order) so the build
# always targets this image's actual Postgres install, never an apk one.
ENV PG_CONFIG=/usr/local/bin/pg_config
RUN git clone --branch ${PROVSQL_VERSION} --depth 1 \
        https://github.com/PierreSenellart/provsql.git . \
    && make PG_CONFIG=${PG_CONFIG} \
    && make PG_CONFIG=${PG_CONFIG} install \
    && cd / && rm -rf /tmp/provsql \
    && apk del .build-deps

# provsql uses planner hooks, so it must be preloaded at server start.
RUN echo "shared_preload_libraries = 'provsql'" >> /usr/local/share/postgresql/postgresql.conf.sample

# Auto-create the extension in every database the entrypoint initializes.
COPY init-provsql.sql /docker-entrypoint-initdb.d/00-provsql.sql

# Demo schema (students/courses/enrollments) — runs after ProvSQL is created
# (00- prefix) so add_provenance() etc. are available if you extend this
# script to enable provenance on these tables automatically.
COPY schema.sql /docker-entrypoint-initdb.d/01-schema.sql
