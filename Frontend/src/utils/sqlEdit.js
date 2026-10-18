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

// ── linking two tables (foreign key) ────────────────────────────────────────

const regclass = (table) => `${sqlLiteral(quoteIdent(table))}::regclass`;
const attnum = (table, col) =>
  `(SELECT attnum FROM pg_attribute WHERE attrelid = ${regclass(table)} AND attname = ${sqlLiteral(col)} AND NOT attisdropped)`;

// Read-only queries the "Link tables" dialog runs to decide what is possible.
// Each returns a single row (or a few sample rows), so they run one by one.
export function buildLinkChecks({ child, childCol, parent, parentCol }) {
  const c = quoteIdent(child), cc = quoteIdent(childCol);
  const p = quoteIdent(parent), pc = quoteIdent(parentCol);
  return {
    // does the parent column already have a single-column, non-partial unique index?
    parentUnique:
      `SELECT bool_or(indisprimary) AS is_pk FROM pg_index WHERE indrelid = ${regclass(parent)} ` +
      `AND indisunique AND indpred IS NULL AND indnkeyatts = 1 AND indkey[0] = ${attnum(parent, parentCol)}`,
    parentHasPk: `SELECT count(*) AS n FROM pg_index WHERE indrelid = ${regclass(parent)} AND indisprimary`,
    parentStats:
      `SELECT count(*) AS total, count(*) - count(${pc}) AS nulls, ` +
      `count(${pc}) - count(DISTINCT ${pc}) AS dups FROM ${p}`,
    parentDupSample:
      `SELECT ${pc}::text AS value, count(*) AS n FROM ${p} WHERE ${pc} IS NOT NULL ` +
      `GROUP BY ${pc} HAVING count(*) > 1 ORDER BY count(*) DESC LIMIT 3`,
    orphans:
      `SELECT count(*) AS n FROM ${c} c WHERE c.${cc} IS NOT NULL ` +
      `AND NOT EXISTS (SELECT 1 FROM ${p} p WHERE p.${pc} = c.${cc})`,
    orphanSample:
      `SELECT DISTINCT c.${cc}::text AS value FROM ${c} c WHERE c.${cc} IS NOT NULL ` +
      `AND NOT EXISTS (SELECT 1 FROM ${p} p WHERE p.${pc} = c.${cc}) LIMIT 5`,
    existing:
      `SELECT count(*) AS n FROM pg_constraint WHERE contype = 'f' AND conrelid = ${regclass(child)} ` +
      `AND confrelid = ${regclass(parent)} AND conkey = ARRAY[${attnum(child, childCol)}] ` +
      `AND confkey = ARRAY[${attnum(parent, parentCol)}]`,
  };
}

export const buildAddPrimaryKey = (table, col) =>
  `ALTER TABLE ${quoteIdent(table)} ADD PRIMARY KEY (${quoteIdent(col)})`;
export const buildAddUnique = (table, col) =>
  `ALTER TABLE ${quoteIdent(table)} ADD UNIQUE (${quoteIdent(col)})`;

export function fkConstraintName(child, childCol, parent) {
  return `fk_${child}_${childCol}_${parent}`.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 63);
}

export function buildAddForeignKey({ child, childCol, parent, parentCol }) {
  return (
    `ALTER TABLE ${quoteIdent(child)} ADD CONSTRAINT ${quoteIdent(fkConstraintName(child, childCol, parent))} ` +
    `FOREIGN KEY (${quoteIdent(childCol)}) REFERENCES ${quoteIdent(parent)} (${quoteIdent(parentCol)})`
  );
}

// Pure decision logic over the check results, so it can be unit-tested.
// stats = { isUnique, isPk, hasPk, total, nulls, dups, orphans, existing }
// returns { ok, fix: null|'pk'|'unique', blockers: [string] }
export function planLink(stats) {
  const blockers = [];
  let fix = null;
  if (stats.existing > 0) blockers.push('These two columns are already linked by a foreign key.');
  if (!stats.isUnique) {
    if (stats.dups > 0 || stats.nulls > 0) {
      const why = [];
      if (stats.dups > 0) why.push(`${stats.dups} repeated value${stats.dups === 1 ? '' : 's'}`);
      if (stats.nulls > 0) why.push(`${stats.nulls} empty (NULL) value${stats.nulls === 1 ? '' : 's'}`);
      blockers.push(`The referenced column can't be a key because it has ${why.join(' and ')}. A foreign key must point at a column whose values are unique.`);
    } else {
      fix = stats.hasPk ? 'unique' : 'pk';
    }
  }
  if (stats.orphans > 0) {
    blockers.push(`${stats.orphans} row${stats.orphans === 1 ? '' : 's'} in the child table have a value that doesn't exist in the referenced column.`);
  }
  return { ok: blockers.length === 0, fix, blockers };
}
