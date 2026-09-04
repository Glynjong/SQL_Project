-- Runs automatically on first container start (docker-entrypoint-initdb.d).
-- Loads ProvSQL into the app database. CASCADE also installs uuid-ossp,
-- which ProvSQL needs for generating provenance tokens.
CREATE EXTENSION IF NOT EXISTS provsql CASCADE;

-- Let SQL in this database call provsql functions without the "provsql."
-- prefix (e.g. add_provenance(...) instead of provsql.add_provenance(...)).
ALTER DATABASE "SQL_Database" SET search_path TO public, provsql;
