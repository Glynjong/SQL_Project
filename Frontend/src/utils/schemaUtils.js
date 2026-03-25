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
