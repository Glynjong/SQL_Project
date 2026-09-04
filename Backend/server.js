const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

let pgsqlParser;
try {
  pgsqlParser = require('pgsql-parser');
} catch (e) {
  try {
    const { Parser } = require('@pgsql/parser');
    const parser = new Parser();
    pgsqlParser = { parse: (sql) => parser.parse(sql) };
  } catch (err) {
    console.warn('pgsql-parser module not loaded. /parse-query will return mock or basic errors.');
  }
}

const app = express();
app.use(cors());
app.use(express.json());

// Connect to Postgres (via environment variables for Docker support)
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'SQL_Database',
  password: process.env.DB_PASSWORD || '1',
  port: process.env.DB_PORT || 5432,
});

app.post('/run-query', async (req, res) => {
  const { sql } = req.body;
  console.log('Executing query:', sql);
  try {
    const result = await pool.query(sql);
    console.log('Query result:', { rows: result.rows.length, command: result.command, rowCount: result.rowCount });
    
    // Check if this was a SELECT (has rows) or a CREATE/INSERT (has rowCount/command)
    res.json({ 
      success: true, 
      rows: result.rows || [], 
      command: result.command,
      rowCount: result.rowCount 
    });
  } catch (err) {
    console.error('Query error:', err.message);
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/explain-query', async (req, res) => {
  const { sql } = req.body;
  try {
    const result = await pool.query(`EXPLAIN (FORMAT JSON) ${sql}`);
    res.json({ success: true, plan: result.rows[0]['QUERY PLAN'][0] });
  } catch (err) {
    console.error(err);
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/explain-analyze-query', async (req, res) => {
  const { sql } = req.body;
  try {
    const result = await pool.query(`EXPLAIN (ANALYZE, BUFFERS, TIMING, VERBOSE, FORMAT JSON) ${sql}`);
    res.json({ success: true, plan: result.rows[0]['QUERY PLAN'][0] });
  } catch (err) {
    console.error(err);
    res.status(400).json({ success: false, error: err.message });
  }
});

// AST Logical Tree Parsing Endpoint
app.post('/parse-query', async (req, res) => {
  const { sql } = req.body;
  if (!sql) {
    return res.status(400).json({ success: false, error: 'SQL string is required' });
  }
  try {
    if (!pgsqlParser || !pgsqlParser.parse) {
      throw new Error('pgsql-parser library is not installed or available on server.');
    }
    const ast = await pgsqlParser.parse(sql);
    res.json({ success: true, ast });
  } catch (err) {
    console.error('AST Parsing Error:', err.message);
    res.status(400).json({ success: false, error: `AST Parsing Failed: ${err.message}` });
  }
});

// Shared helper: confirms the provsql extension is loaded in this database.
// ProvSQL requires CREATE EXTENSION provsql CASCADE (see /Postgres/init-provsql.sql
// for the Docker image that provisions this automatically).
async function requireProvSQL(res) {
  const extCheck = await pool.query("SELECT 1 FROM pg_extension WHERE extname = 'provsql'");
  if (extCheck.rowCount === 0) {
    res.status(400).json({
      success: false,
      error: "ProvSQL extension is not installed or enabled in this PostgreSQL database. " +
        "If you're using the provided Docker setup, this is almost always a stale postgres_data " +
        "volume from before ProvSQL was added — Postgres only runs its init scripts against a fresh " +
        "volume. Reset it with: docker compose down -v && docker compose up --build " +
        "(rebuilding a single service or --force-recreate alone will NOT fix this, since the old " +
        "volume is reattached either way). Otherwise, run: CREATE EXTENSION provsql CASCADE;"
    });
    return false;
  }
  return true;
}

// ProvSQL Status Endpoint
// Reports whether the extension is loaded and which base tables already
// have provenance tracking enabled (i.e. have a hidden provsql column).
app.get('/provsql/status', async (req, res) => {
  try {
    const extCheck = await pool.query("SELECT 1 FROM pg_extension WHERE extname = 'provsql'");
    const installed = extCheck.rowCount > 0;

    let enabledTables = [];
    let allTables = [];
    if (installed) {
      const tablesResult = await pool.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name"
      );
      allTables = tablesResult.rows.map((r) => r.table_name);

      const provTablesResult = await pool.query(`
        SELECT c.relname AS table_name
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE a.attname = 'provsql' AND n.nspname = 'public' AND c.relkind = 'r'
        ORDER BY c.relname
      `);
      enabledTables = provTablesResult.rows.map((r) => r.table_name);
    }

    res.json({ success: true, installed, allTables, enabledTables });
  } catch (err) {
    console.error('ProvSQL Status Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Enable provenance tracking on a base table (adds ProvSQL's hidden UUID column).
// Must be called once per table before that table's rows carry provenance.
app.post('/provsql/enable-table', async (req, res) => {
  const { table } = req.body;
  if (!table) {
    return res.status(400).json({ success: false, error: 'Table name is required' });
  }
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
    return res.status(400).json({ success: false, error: 'Invalid table name' });
  }
  try {
    if (!(await requireProvSQL(res))) return;
    await pool.query('SELECT add_provenance($1)', [table]);
    res.json({ success: true, table });
  } catch (err) {
    console.error('ProvSQL Enable Table Error:', err.message);
    res.status(400).json({ success: false, error: err.message });
  }
});

// ProvSQL Provenance Query Execution Endpoint
// Runs the user's SELECT and, unless it already asks for one, appends a
// provenance() token column so each output row can be traced back to a
// circuit. This only produces non-null tokens for rows derived from tables
// that have had add_provenance() run on them (see /provsql/enable-table).
app.post('/provsql/provenance', async (req, res) => {
  let { sql } = req.body;
  if (!sql) {
    return res.status(400).json({ success: false, error: 'SQL string is required' });
  }
  try {
    if (!(await requireProvSQL(res))) return;

    const trimmed = sql.trim().replace(/;\s*$/, '');
    const alreadyAsksForProvenance = /provenance\s*\(\s*\)/i.test(trimmed);

    const wrapped = alreadyAsksForProvenance
      ? trimmed
      : `SELECT sub.*, provenance() AS provenance_token FROM (${trimmed}) AS sub`;

    const result = await pool.query(wrapped);
    res.json({
      success: true,
      rows: result.rows || [],
      fields: result.fields ? result.fields.map((f) => f.name) : []
    });
  } catch (err) {
    console.error('ProvSQL Error:', err.message);
    res.status(400).json({
      success: false,
      error: `${err.message} (Tip: run "Enable Provenance" on the tables this query reads from first.)`
    });
  }
});

// ProvSQL Circuit Export Endpoint
// Walks the provenance circuit rooted at a token using ProvSQL's
// circuit_subgraph() introspection function, which returns every gate
// edge (f -> t) reachable from that token along with each gate's type
// (input / plus / times / monus / agg / ...). We return this as a
// structured graph rather than relying on a DOT-export SQL function,
// since ProvSQL's own visual export (view_circuit) targets ASCII/graph-easy
// output, not a raw DOT string.
app.post('/provsql/circuit', async (req, res) => {
  const { targetToken } = req.body;
  if (!targetToken) {
    return res.status(400).json({ success: false, error: 'Target provenance token UUID is required' });
  }
  try {
    if (!(await requireProvSQL(res))) return;

    const result = await pool.query(
      'SELECT f, t, gate_type, table_name, extra FROM circuit_subgraph($1)',
      [targetToken]
    );

    const gateIds = new Set();
    const edges = [];
    result.rows.forEach((row) => {
      gateIds.add(row.f);
      if (row.t) {
        gateIds.add(row.t);
        edges.push({ source: row.f, target: row.t, gateType: row.gate_type });
      }
    });

    // Gate type for every f value comes from its own row(s); leaves (no
    // outgoing edge as f, i.e. only ever appear as t) are input gates.
    const gateTypeById = {};
    result.rows.forEach((row) => {
      gateTypeById[row.f] = row.gate_type;
    });

    const nodes = Array.from(gateIds).map((id) => ({
      id,
      gateType: gateTypeById[id] || 'input',
      isRoot: id === targetToken
    }));

    res.json({ success: true, targetToken, nodes, edges });
  } catch (err) {
    console.error('ProvSQL Circuit Error:', err.message);
    res.status(400).json({ success: false, error: err.message });
  }
});

app.listen(5000, () => console.log('Server running on port 5000'));
