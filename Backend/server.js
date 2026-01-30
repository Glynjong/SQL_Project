const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Connect to your local Postgres
const pool = new Pool({
  user: 'postgres',           // Your postgres username
  host: 'localhost',
  database: 'SQL_Database',       // Your database name
  password: '1',   // Your password
  port: 5432,
});

app.post('/run-query', async (req, res) => {
  const { sql } = req.body;
  try {
    const result = await pool.query(sql);
    
    // Check if this was a SELECT (has rows) or a CREATE/INSERT (has rowCount/command)
    res.json({ 
      success: true, 
      rows: result.rows || [], 
      command: result.command,
      rowCount: result.rowCount 
    });
  } catch (err) {
    console.error(err);
    res.status(400).json({ success: false, error: err.message });
  }
});

app.listen(5000, () => console.log('Server running on port 5000'));