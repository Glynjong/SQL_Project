const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

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

app.listen(5000, () => console.log('Server running on port 5000'));