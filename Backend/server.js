const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const { planClientSort, applyClientSort } = require('./provsqlSort');

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

// ── ProvSQL isolation ─────────────────────────────────────────────────────
// ProvSQL installs a planner hook that runs on EVERY query in this database
// and rewrites anything touching a provenance-enabled table — rejecting SQL
// it doesn't support (e.g. ORDER BY on an aggregate result). Only the
// ProvSQL tab wants that. Every other feature (Query Runner, Explain, schema
// editing) runs with the hook switched off for the duration of its query, so
// ProvSQL's limitations can't leak into them. Note: with provsql.active = off
// this project's ProvSQL 1.5.0 build still rejected WITH RECURSIVE ("Recursive
// CTEs not supported"), so recursive queries additionally get the temp-table
// treatment in queryShadowed() below. (ProvSQL 1.7+ supports recursion natively, but has
// a planner-hook crash with the switch off, fixed in 1.8.0 — if you upgrade to
// 1.7.x, set PROVSQL_KEEP_ON_FOR_RECURSIVE=1 to leave the hook on for them.)
const keepProvSQLOn = (sql) =>
  process.env.PROVSQL_KEEP_ON_FOR_RECURSIVE === '1' && /\bWITH\s+RECURSIVE\b/i.test(sql);

// ── Recursive queries over provenance-tracked tables ──────────────────────
// ProvSQL 1.5.0 rejects WITH RECURSIVE ("Recursive CTEs not supported") when
// the query reads a provenance-tracked table, and in practice (observed on this
// project's build) the provsql.active switch did not get it to skip that check. What does work is
// not triggering ProvSQL at all: its planner hook only fires for queries that
// touch a table with a `provsql` column. So, for a read-only recursive query,
// we copy the tracked tables the query mentions into TEMP tables WITHOUT that
// column (same names, so they shadow the real ones), run the query against
// the copies, and always ROLLBACK — the real tables are never modified.
const MAX_SHADOW_ROWS = 200000; // reltuples estimate; larger tables are not copied
const isRecursiveSql = (sql) => /\bWITH\s+RECURSIVE\b/i.test(sql);
const quoteIdent = (s) => `"${String(s).replace(/"/g, '""')}"`;
const mentionsName = (sql, name) =>
  new RegExp(`(^|[^A-Za-z0-9_$])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Za-z0-9_$]|$)`, 'i').test(sql);

const TRACKED_TABLES_SQL = `
  SELECT n.nspname, c.relname, c.reltuples::bigint AS est_rows,
         (SELECT array_agg(a2.attname::text ORDER BY a2.attnum)
            FROM pg_attribute a2
           WHERE a2.attrelid = c.oid AND a2.attnum > 0 AND NOT a2.attisdropped
             AND a2.attname <> 'provsql') AS cols
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE a.attname = 'provsql' AND NOT a.attisdropped AND a.atttypid = 'uuid'::regtype
     AND c.relkind IN ('r', 'p')
     AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'provsql')
     AND n.nspname !~ '^pg_'
   ORDER BY n.nspname, c.relname`;

// True only for plain SELECTs (or EXPLAIN of a SELECT) — never anything that writes.
function onlyReadsData(parsed) {
  let list = parsed;
  if (list && !Array.isArray(list) && Array.isArray(list.stmts)) list = list.stmts;
  if (!Array.isArray(list) || list.length === 0) return false;
  return list.every((item) => {
    let s = item;
    if (s && s.RawStmt) s = s.RawStmt;
    if (s && s.stmt) s = s.stmt;
    if (!s || typeof s !== 'object') return false;
    const tag = Object.keys(s)[0];
    if (tag === 'SelectStmt') return true;
    if (tag === 'ExplainStmt') {
      const q = s.ExplainStmt && s.ExplainStmt.query;
      return !!q && Object.keys(q)[0] === 'SelectStmt';
    }
    return false;
  });
}

// Returns the query result, or null when this approach doesn't apply (not a
// recursive read-only query, or it mentions no provenance-tracked table) so
// the caller carries on with the normal path.
async function queryShadowed(sql) {
  if (!isRecursiveSql(sql) || keepProvSQLOn(sql)) return null;
  let parsed = null;
  try {
    if (pgsqlParser && pgsqlParser.parse) parsed = await pgsqlParser.parse(sql);
  } catch (e) {
    return null; // invalid SQL — let the normal path report Postgres's own error
  }
  if (!onlyReadsData(parsed)) return null;

  const client = await pool.connect();
  let broken = false;
  try {
    await client.query('BEGIN');
    const tracked = (await client.query(TRACKED_TABLES_SQL)).rows
      .filter((t) => mentionsName(sql, t.relname) && t.cols && t.cols.length && Number(t.est_rows) <= MAX_SHADOW_ROWS);
    if (tracked.length === 0) return null;

    // belt and braces: also switch the hook off while copying, so the copy
    // can't pick up a provenance column
    const guc = await client.query("SELECT current_setting('provsql.active', true) AS v");
    if (guc.rows[0].v !== null) await client.query('SET LOCAL provsql.active = off');

    const done = new Set();
    for (const t of tracked) {
      if (done.has(t.relname)) continue; // same name in two schemas: first one wins, like search_path
      done.add(t.relname);
      // eslint-disable-next-line no-await-in-loop
      await client.query(
        `CREATE TEMP TABLE ${quoteIdent(t.relname)} ON COMMIT DROP AS SELECT ${t.cols.map(quoteIdent).join(', ')} FROM ${quoteIdent(t.nspname)}.${quoteIdent(t.relname)}`
      );
      // eslint-disable-next-line no-await-in-loop
      await client.query(`ALTER TABLE pg_temp.${quoteIdent(t.relname)} DROP COLUMN IF EXISTS provsql`);
    }
    await client.query("SELECT set_config('search_path', 'pg_temp, ' || current_setting('search_path'), true)");
    await client.query('SET TRANSACTION READ ONLY'); // writing to temp tables is still allowed, nothing else is
    return await client.query(sql);
  } finally {
    try { await client.query('ROLLBACK'); } catch (e) { broken = true; }
    client.release(broken);
  }
}

async function queryIsolated(sql) {
  const shadowed = await queryShadowed(sql);
  if (shadowed) return shadowed;
  const client = await pool.connect();
  let resetFailed = false;
  try {
    if (!keepProvSQLOn(sql)) {
      try {
        await client.query('SET provsql.active = off');
      } catch (e) {
        /* ProvSQL not available on this connection — nothing to switch off */
      }
    }
    return await client.query(sql);
  } finally {
    // pooled connections are reused, so never leave the setting behind
    try { await client.query('RESET provsql.active'); } catch (e) { resetFailed = true; }
    client.release(resetFailed);
  }
}

// Same, but inside a read-only transaction that is always rolled back. Used
// for the "show plain results" fallback so it can never modify data.
async function queryReadOnlyIsolated(sql) {
  const client = await pool.connect();
  let broken = false;
  try {
    await client.query('BEGIN READ ONLY');
    if (!keepProvSQLOn(sql)) await client.query('SET LOCAL provsql.active = off');
    return await client.query(sql);
  } finally {
    try { await client.query('ROLLBACK'); } catch (e) { broken = true; }
    client.release(broken);
  }
}

app.post('/run-query', async (req, res) => {
  const { sql } = req.body;
  console.log('Executing query:', sql);
  try {
    // Several statements in one request come back as an array of results
    // (all already committed) — report the last one, like psql does.
    const raw = await queryIsolated(sql);
    const result = Array.isArray(raw) ? raw[raw.length - 1] : raw;
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
    const result = await queryIsolated(`EXPLAIN (FORMAT JSON) ${sql}`);
    res.json({ success: true, plan: result.rows[0]['QUERY PLAN'][0] });
  } catch (err) {
    console.error(err);
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/explain-analyze-query', async (req, res) => {
  const { sql } = req.body;
  try {
    const result = await queryIsolated(`EXPLAIN (ANALYZE, BUFFERS, TIMING, VERBOSE, FORMAT JSON) ${sql}`);
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

// Resolve an INPUT gate's token back to the actual source row it came
// from. add_provenance() gives each provenance-tracked table a hidden
// `provsql` UUID column, and an INPUT gate's token IS that UUID — so we
// can search enabled tables directly for a match, rather than relying on
// circuit_subgraph()'s info1/info2 columns, whose exact meaning we
// haven't confirmed for this ProvSQL version.
app.post('/provsql/lookup-token', async (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ success: false, error: 'Token is required' });
  }
  try {
    if (!(await requireProvSQL(res))) return;

    const provTablesResult = await pool.query(`
      SELECT c.relname AS table_name
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE a.attname = 'provsql' AND n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY c.relname
    `);

    for (const { table_name: table } of provTablesResult.rows) {
      // eslint-disable-next-line no-await-in-loop
      const result = await pool.query(
        `SELECT * FROM "${table}" WHERE provsql = $1 LIMIT 1`,
        [token]
      );
      if (result.rowCount > 0) {
        const { provsql, ...row } = result.rows[0];
        return res.json({ success: true, found: true, table, row });
      }
    }

    res.json({ success: true, found: false });
  } catch (err) {
    console.error('ProvSQL Token Lookup Error:', err.message);
    res.status(400).json({ success: false, error: err.message });
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
    const asksForProvenance = /provenance\s*\(\s*\)/i.test(trimmed);
    const wrap = (q) => (asksForProvenance ? q : `SELECT sub.*, provenance() AS provenance_token FROM (${q}) AS sub`);
    const fieldNamesOf = (r) => (r.fields ? r.fields.map((f) => f.name) : []);

    // 1. The normal path.
    let firstError;
    try {
      const result = await pool.query(wrap(trimmed));
      return res.json({ success: true, rows: result.rows || [], fields: fieldNamesOf(result), notes: [] });
    } catch (err) {
      firstError = err;
    }
    console.warn('ProvSQL rejected the query — trying fallbacks:', firstError.message);

    // 2. ORDER BY / LIMIT that ProvSQL can't handle: run without them and
    //    apply them to the returned rows. Sorting doesn't change which rows
    //    exist or their provenance tokens, so the circuits stay valid.
    try {
      if (pgsqlParser && pgsqlParser.parse) {
        const plan = planClientSort(trimmed, await pgsqlParser.parse(trimmed));
        if (plan) {
          const result = await pool.query(wrap(plan.base));
          const fields = fieldNamesOf(result);
          const sorted = applyClientSort(plan, result.rows || [], fields);
          if (sorted) {
            return res.json({
              success: true,
              rows: sorted,
              fields,
              notes: [
                `ProvSQL doesn't support this ORDER BY, so the rows were sorted${plan.limit !== null || plan.offset ? ' (and LIMIT/OFFSET applied)' : ''} after the query ran. Provenance tokens are unchanged.`,
              ],
            });
          }
        }
      }
    } catch (err) {
      console.warn('Client-side ORDER BY fallback failed:', err.message);
    }

    // 3. Any other ProvSQL conflict: still show the data, without provenance.
    //    Read-only + rolled back, so this can never change anything.
    try {
      const plainRaw = (await queryShadowed(trimmed)) || (await queryReadOnlyIsolated(trimmed));
      const plain = Array.isArray(plainRaw) ? plainRaw[plainRaw.length - 1] : plainRaw;
      // ProvSQL handles recursion with set semantics (UNION) but not bag semantics (UNION ALL).
      const tip = /recursi/i.test(firstError.message) && /\bUNION\s+ALL\b/i.test(trimmed)
        ? ' Tip: to get provenance for this recursive query, try changing UNION ALL to UNION.'
        : '';
      return res.json({
        success: true,
        rows: plain.rows || [],
        fields: fieldNamesOf(plain),
        provenanceUnavailable: true,
        notes: [
          `ProvSQL couldn't track provenance for this query (${firstError.message}), so these are plain results without provenance tokens — rows can't be opened as circuits.${tip}`,
        ],
      });
    } catch (err) {
      /* genuinely invalid SQL, or not a read-only query — report the original error below */
    }

    throw firstError;
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
// circuit_subgraph() introspection function. Verified against a live
// v1.5.0 install — its real signature is:
//   circuit_subgraph(root uuid, max_depth integer DEFAULT 8)
//     RETURNS TABLE(node uuid, parent uuid, child_pos integer,
//                   gate_type text, info1 text, info2 text, depth integer)
// This is a node-per-row model with a parent pointer (parent IS NULL marks
// the root), not an edge-list — each row already carries its own depth
// from the root, computed by ProvSQL itself, which we pass straight
// through rather than recomputing client-side.
app.post('/provsql/circuit', async (req, res) => {
  const { targetToken, maxDepth } = req.body;
  if (!targetToken) {
    return res.status(400).json({ success: false, error: 'Target provenance token UUID is required' });
  }
  try {
    if (!(await requireProvSQL(res))) return;

    const depthLimit = Number.isInteger(maxDepth) ? maxDepth : 8;
    const result = await pool.query(
      'SELECT node, parent, child_pos, gate_type, info1, info2, depth FROM circuit_subgraph($1, $2)',
      [targetToken, depthLimit]
    );

    const nodesById = new Map();
    const edges = [];

    result.rows.forEach((row) => {
      if (!nodesById.has(row.node)) {
        nodesById.set(row.node, {
          id: row.node,
          gateType: row.gate_type,
          isRoot: row.parent === null,
          depth: row.depth,
          info1: row.info1,
          info2: row.info2
        });
      }
      if (row.parent) {
        // parent -> node: the parent gate is derived FROM this node (the
        // usual root-at-top-to-leaves-at-bottom circuit orientation).
        edges.push({ source: row.parent, target: row.node, childPos: row.child_pos });
      }
    });

    res.json({
      success: true,
      targetToken,
      nodes: Array.from(nodesById.values()),
      edges
    });
  } catch (err) {
    console.error('ProvSQL Circuit Error:', err.message);
    res.status(400).json({ success: false, error: err.message });
  }
});

app.listen(5000, () => {
  console.log('Server running on port 5000');
  // If you can't see this line in `docker compose logs backend`, the backend is running old code.
  console.log('ProvSQL isolation: ON — recursive queries use plain temp copies of tracked tables (build 2026-10-06b)');
});
