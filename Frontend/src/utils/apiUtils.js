// API utility functions
const getApiUrl = (endpoint) => {
  const baseUrl = process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:5000';
  return `${baseUrl}${endpoint}`;
};

export const runQuery = async (sql) => {
  const response = await fetch(getApiUrl('/run-query'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql }),
  });
  return response.json();
};

export const explainQuery = async (sql) => {
  const response = await fetch(getApiUrl('/explain-query'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql }),
  });
  return response.json();
};

export const explainAnalyzeQuery = async (sql) => {
  const response = await fetch(getApiUrl('/explain-analyze-query'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql }),
  });
  return response.json();
};

export const fetchSchemaMetadata = async () => {
  const sql = `
    SELECT cols.table_name, cols.column_name, cols.data_type, cons.constraint_type
    FROM information_schema.columns cols
    LEFT JOIN information_schema.key_column_usage kcu
      ON cols.table_name = kcu.table_name AND cols.column_name = kcu.column_name
    LEFT JOIN information_schema.table_constraints cons
      ON kcu.constraint_name = cons.constraint_name
    WHERE cols.table_schema = 'public'
    ORDER BY cols.table_name, cols.ordinal_position;
  `;
  const data = await runQuery(sql);
  if (data.success) {
    return data.rows.reduce((acc, row) => {
      if (!acc[row.table_name]) acc[row.table_name] = [];
      acc[row.table_name].push({
        name: row.column_name,
        type: row.data_type,
        constraint: row.constraint_type,
      });
      return acc;
    }, {});
  }
  return {};
};

export const fetchForeignKeys = async () => {
  const sql = `
    SELECT kcu.table_name AS from_table, kcu.column_name AS from_column,
           ccu.table_name AS to_table,   ccu.column_name AS to_column
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public';
  `;
  const data = await runQuery(sql);
  return data.success ? data.rows : [];
};
