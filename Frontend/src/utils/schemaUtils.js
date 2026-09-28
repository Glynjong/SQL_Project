// Schema visualization utilities
import { MarkerType } from 'reactflow';

export const createDatabaseNode = (tableName, columns) => ({
  id: tableName,
  data: {
    label: (
      <div className="database-node-container">
        <div className="database-node-header">{tableName.toUpperCase()}</div>
        <div className="database-node-body">
          {columns.map((c) => (
            <div key={c.name} className="column-row">
              <span className="column-icon">
                {c.constraint === 'PRIMARY KEY'
                  ? '🔑'
                  : c.constraint === 'FOREIGN KEY'
                  ? '🔗'
                  : '🔹'}
              </span>
              <span className={`column-name ${c.constraint === 'PRIMARY KEY' ? 'pk-bold' : ''}`}>
                {c.name}
              </span>
              <span className="column-type">{c.type}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  position: { x: Math.random() * 400, y: Math.random() * 300 },
});

export const createForeignKeyEdges = (fkRows, canvasTableNames) =>
  fkRows
    .filter((fk) => canvasTableNames.has(fk.from_table) && canvasTableNames.has(fk.to_table))
    .map((fk) => ({
      id: `fk-${fk.from_table}-${fk.from_column}-${fk.to_table}`,
      source: fk.from_table,
      target: fk.to_table,
      animated: true,
      style: { stroke: 'var(--green)', strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--green)' },
      label: `${fk.from_column} → ${fk.to_column}`,
      labelStyle: { fontSize: 10, fill: 'var(--green)', fontWeight: 600 },
      labelBgStyle: { fill: 'white', fillOpacity: 0.9 },
      labelBgPadding: [4, 3],
    }));

export const nodeTableExists = (nodes, tableName) => nodes.some((n) => n.id === tableName);

// Column type choices offered in the Add Table form — a practical subset
// of Postgres types, not exhaustive.
export const COLUMN_TYPES = [
  'SERIAL', 'INTEGER', 'BIGINT', 'NUMERIC(10,2)', 'VARCHAR(50)', 'VARCHAR(100)',
  'TEXT', 'BOOLEAN', 'DATE', 'TIMESTAMP', 'UUID',
];

const isValidIdentifier = (name) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);

// Builds a CREATE TABLE statement from the Add Table form's structured
// spec: { tableName, columns: [{ name, type, primaryKey, notNull, unique }] }.
// Identifiers are validated (not just interpolated) since this becomes a
// real DDL statement executed against the database.
export const buildCreateTableSQL = ({ tableName, columns }) => {
  if (!tableName || !isValidIdentifier(tableName)) {
    throw new Error('Table name must start with a letter or underscore and contain only letters, numbers, and underscores.');
  }
  if (!columns || columns.length === 0) {
    throw new Error('Add at least one column.');
  }

  const colDefs = columns.map((col) => {
    if (!col.name || !isValidIdentifier(col.name)) {
      throw new Error(`Invalid column name: "${col.name}"`);
    }
    if (!col.type) {
      throw new Error(`Column "${col.name}" needs a type.`);
    }
    let def = `${col.name} ${col.type}`;
    if (col.primaryKey) def += ' PRIMARY KEY';
    if (col.notNull && !col.primaryKey) def += ' NOT NULL';
    if (col.unique && !col.primaryKey) def += ' UNIQUE';
    return def;
  });

  const pkCount = columns.filter((c) => c.primaryKey).length;
  if (pkCount > 1) {
    throw new Error('Only one column can be the primary key in this form — use the Query Runner for composite keys.');
  }

  return `CREATE TABLE ${tableName} (\n  ${colDefs.join(',\n  ')}\n);`;
};
