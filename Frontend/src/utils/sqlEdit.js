// Pure SQL builders for the Schema Visualizer's table editor (no React).
// Everything that reaches the database is either a validated identifier,
// a double-quoted identifier, or a single-quoted literal with quotes doubled.

export const isValidIdentifier = (name) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name || '');
export const isValidType = (t) => /^[A-Za-z][A-Za-z ]*(\(\d+(,\s*\d+)?\))?$/.test(t || '');

export const quoteIdent = (name) => `"${String(name).replace(/"/g, '""')}"`;
export const sqlLiteral = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);

const needIdent = (name, what) => {
  if (!isValidIdentifier(name)) {
    throw new Error(`${what} must start with a letter or underscore and contain only letters, numbers, and underscores.`);
  }
};
const needType = (t) => {
  if (!isValidType(t)) throw new Error(`Unsupported column type: ${t}`);
};

// The schema query returns one row per (column, constraint), so a column that
// is e.g. both a PRIMARY KEY and a FOREIGN KEY shows up twice — merge them.
export function dedupeColumns(cols) {
  const map = new Map();
  (cols || []).forEach((c) => {
    if (!map.has(c.name)) map.set(c.name, { name: c.name, type: c.type, nullable: c.nullable !== false, constraints: [] });
    const entry = map.get(c.name);
    if (c.constraint && !entry.constraints.includes(c.constraint)) entry.constraints.push(c.constraint);
  });
  return [...map.values()];
}

// ── row (data) editing ──────────────────────────────────────────────────────

// Every column is cast to text so dates, numerics and booleans round-trip as
// plain strings that Postgres can coerce back when saving.
export function buildSelectRowsSQL(table, colNames, pkCols, limit = 200) {
  const sel = [`ctid::text AS "__ctid"`, ...colNames.map((c) => `${quoteIdent(c)}::text AS ${quoteIdent(c)}`)];
  const order = pkCols.length ? pkCols.map(quoteIdent).join(', ') : 'ctid';
  return `SELECT ${sel.join(', ')} FROM ${quoteIdent(table)} ORDER BY ${order} LIMIT ${limit}`;
}

// Identify a row by its primary key when there is one, else by ctid.
export function buildRowWhere(pkCols, row) {
  if (pkCols.length) {
    return pkCols
      .map((c) => (row[c] === null || row[c] === undefined ? `${quoteIdent(c)} IS NULL` : `${quoteIdent(c)} = ${sqlLiteral(row[c])}`))
      .join(' AND ');
  }
  return `ctid = ${sqlLiteral(row.__ctid)}::tid`;
}

export function buildUpdateSQL(table, pkCols, original, changes) {
  const sets = Object.entries(changes).map(([c, v]) => `${quoteIdent(c)} = ${sqlLiteral(v)}`);
  if (!sets.length) return null;
  return `UPDATE ${quoteIdent(table)} SET ${sets.join(', ')} WHERE ${buildRowWhere(pkCols, original)}`;
}

export function buildDeleteSQL(table, pkCols, original) {
  return `DELETE FROM ${quoteIdent(table)} WHERE ${buildRowWhere(pkCols, original)}`;
}

// Only columns the user actually filled in are listed, so column defaults
// (SERIAL ids etc.) still apply to the rest.
export function buildInsertSQL(table, values) {
  const entries = Object.entries(values).filter(([, v]) => v !== '' && v !== null && v !== undefined);
  if (!entries.length) return `INSERT INTO ${quoteIdent(table)} DEFAULT VALUES`;
  return `INSERT INTO ${quoteIdent(table)} (${entries.map(([c]) => quoteIdent(c)).join(', ')}) VALUES (${entries.map(([, v]) => sqlLiteral(v)).join(', ')})`;
}

// ── structure (DDL) editing ─────────────────────────────────────────────────

export function buildRenameTable(oldName, newName) {
  needIdent(newName, 'Table name');
  return `ALTER TABLE ${quoteIdent(oldName)} RENAME TO ${quoteIdent(newName)}`;
}

export function buildAddColumn(table, { name, type, notNull, unique }) {
  needIdent(name, 'Column name');
  needType(type);
  return `ALTER TABLE ${quoteIdent(table)} ADD COLUMN ${quoteIdent(name)} ${type}${notNull ? ' NOT NULL' : ''}${unique ? ' UNIQUE' : ''}`;
}

export const buildDropColumn = (table, col) => `ALTER TABLE ${quoteIdent(table)} DROP COLUMN ${quoteIdent(col)}`;

export function buildRenameColumn(table, oldName, newName) {
  needIdent(newName, 'Column name');
  return `ALTER TABLE ${quoteIdent(table)} RENAME COLUMN ${quoteIdent(oldName)} TO ${quoteIdent(newName)}`;
}

export function buildChangeType(table, col, type) {
  needType(type);
  return `ALTER TABLE ${quoteIdent(table)} ALTER COLUMN ${quoteIdent(col)} TYPE ${type} USING ${quoteIdent(col)}::${type}`;
}

export const buildSetNotNull = (table, col, notNull) =>
  `ALTER TABLE ${quoteIdent(table)} ALTER COLUMN ${quoteIdent(col)} ${notNull ? 'SET' : 'DROP'} NOT NULL`;

export const buildDropTable = (table) => `DROP TABLE ${quoteIdent(table)}`;
