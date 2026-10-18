import React, { useState } from 'react';
import ReactFlow, { Background, Controls, ConnectionMode } from 'reactflow';
import 'reactflow/dist/style.css';
import '../../App.css';
import { COLUMN_TYPES } from '../../utils/schemaUtils';
import { EditTableModal } from './EditTableModal';
import { LinkTablesModal } from './LinkTablesModal';
import { MenuButton } from '../Common/MenuButton';

export const VisualizerToolbar = ({ onClearCanvas, onLoadAllTables, onOpenAddTable, tables = [], onEditTable, onOpenLink }) => (
  <div className="visualizer-toolbar">
    <div className="visualizer-legend">
      <span>
        <span className="legend-circle legend-circle--green" />
        FK relationship 
      </span>
      <span className="visualizer-legend-hint">Drag one table's handle onto another to link them</span>
    </div>
    <div className="toolbar-buttons">
      <MenuButton
        label="Edit Table ▾"
        items={tables}
        onPick={onEditTable}
        title={tables.length === 0 ? 'No tables loaded yet' : "Edit a table's structure or rows"}
      />
      <button className="btn-primary" onClick={onOpenAddTable}>
        + Add Table
      </button>
      <button
        className="btn-primary"
        onClick={onOpenLink}
        disabled={tables.length === 0}
        title="Create a foreign key between two tables (or drag from one table's dot to another's)"
      >
        Link Tables
      </button>
      <button className="btn-primary" onClick={onLoadAllTables}>
        Load All Tables
      </button>
      <button className="btn-danger" onClick={onClearCanvas}>
        Clear Canvas
      </button>
    </div>
  </div>
);

const emptyColumn = () => ({ name: '', type: 'VARCHAR(100)', primaryKey: false, notNull: false, unique: false });

const AddTableModal = ({ onClose, onCreateTable }) => {
  const [tableName, setTableName] = useState('');
  const [columns, setColumns] = useState([
    { name: 'id', type: 'SERIAL', primaryKey: true, notNull: false, unique: false },
    emptyColumn(),
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [previewSQL, setPreviewSQL] = useState(null);

  const updateColumn = (idx, patch) => {
    setColumns((cols) => cols.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  };

  const removeColumn = (idx) => {
    setColumns((cols) => cols.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    setFormError(null);
    setSubmitting(true);
    const result = await onCreateTable({ tableName: tableName.trim(), columns });
    setSubmitting(false);
    if (result.success) {
      onClose();
    } else {
      setFormError(result.error);
      setPreviewSQL(result.sql || null);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: '560px', maxHeight: '85vh', overflowY: 'auto', background: '#fff', borderRadius: '12px', boxShadow: '0 20px 50px rgba(0,0,0,0.3)', padding: '20px 24px' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <h3 style={{ margin: 0, fontSize: '16px' }}>Add Table</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: '20px', cursor: 'pointer', color: '#64748b' }} aria-label="Close">×</button>
        </div>

        <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Table name</label>
        <input
          value={tableName}
          onChange={(e) => setTableName(e.target.value)}
          placeholder="e.g. assignments"
          style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', margin: '4px 0 16px' }}
        />

        <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Columns</label>
        <div style={{ marginTop: '6px', marginBottom: '10px' }}>
          {columns.map((col, idx) => (
            <div key={idx} style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '6px' }}>
              <input
                value={col.name}
                onChange={(e) => updateColumn(idx, { name: e.target.value })}
                placeholder="column_name"
                style={{ flex: '1 1 140px', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px' }}
              />
              <select
                value={col.type}
                onChange={(e) => updateColumn(idx, { type: e.target.value })}
                style={{ flex: '0 0 130px', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px' }}
              >
                {COLUMN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <label style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '3px', whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={col.primaryKey} onChange={(e) => updateColumn(idx, { primaryKey: e.target.checked })} /> PK
              </label>
              <label style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '3px', whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={col.notNull} onChange={(e) => updateColumn(idx, { notNull: e.target.checked })} /> NOT NULL
              </label>
              <label style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '3px', whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={col.unique} onChange={(e) => updateColumn(idx, { unique: e.target.checked })} /> UNIQUE
              </label>
              <button
                onClick={() => removeColumn(idx)}
                disabled={columns.length <= 1}
                style={{ border: 'none', background: 'transparent', color: columns.length <= 1 ? '#cbd5e1' : '#dc2626', cursor: columns.length <= 1 ? 'not-allowed' : 'pointer', fontSize: '16px' }}
                aria-label="Remove column"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={() => setColumns((cols) => [...cols, emptyColumn()])}
          style={{ fontSize: '12px', border: '1px dashed #94a3b8', background: 'transparent', borderRadius: '6px', padding: '5px 12px', cursor: 'pointer', color: '#475569', marginBottom: '16px' }}
        >
          + Add column
        </button>

        {formError && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', padding: '10px 12px', borderRadius: '6px', fontSize: '12px', marginBottom: '12px' }}>
            {formError}
            {previewSQL && (
              <pre style={{ marginTop: '8px', fontSize: '11px', whiteSpace: 'pre-wrap', background: '#fff', padding: '8px', borderRadius: '4px' }}>{previewSQL}</pre>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', border: '1px solid #cbd5e1', background: '#fff', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !tableName.trim()}
            style={{ padding: '8px 18px', border: 'none', background: submitting ? '#94a3b8' : '#16a34a', color: '#fff', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer' }}
          >
            {submitting ? 'Creating…' : 'Create Table'}
          </button>
        </div>
      </div>
    </div>
  );
};

export const SchemaVisualizer = ({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onNodeClick,
  onClearCanvas,
  onLoadAllTables,
  onCreateTable,
  schemaData = {},
  onSchemaChanged,
  onCloseTablePopup,
  isLoading,
  error,
}) => {
  const [addTableOpen, setAddTableOpen] = useState(false);
  const [editTable, setEditTable] = useState(null);
  const [link, setLink] = useState(null); // { source, target } while the Link tables dialog is open
  const [hintDismissed, setHintDismissed] = useState(() => {
    try { return localStorage.getItem('schemaLinkHintDismissed') === '1'; } catch (e) { return false; }
  });
  const dismissHint = () => {
    setHintDismissed(true);
    try { localStorage.setItem('schemaLinkHintDismissed', '1'); } catch (e) { /* storage unavailable: hint just returns next visit */ }
  };

  // Toolbar button: open the dialog with the first two tables, the user picks the real ones there.
  const openLinkDialog = () => {
    const names = Object.keys(schemaData);
    if (!names.length) return;
    if (onCloseTablePopup) onCloseTablePopup();
    setLink({ source: names[0], target: names[1] || names[0] });
  };

  // Dragging a connection opens the dialog instead of drawing a throw-away line.
  const handleConnect = (params) => {
    if (params.source && params.target && schemaData[params.source] && schemaData[params.target]) {
      if (onCloseTablePopup) onCloseTablePopup();
      setLink({ source: params.source, target: params.target });
    }
  };

  // Opening the editor closes the read-only data popup that a single click opens.
  const startEdit = (tableName) => {
    if (onCloseTablePopup) onCloseTablePopup();
    setEditTable(tableName);
  };

  return (
    <div className="visualizer-wrap">
      <VisualizerToolbar
        onClearCanvas={onClearCanvas}
        onLoadAllTables={onLoadAllTables}
        onOpenAddTable={() => setAddTableOpen(true)}
        tables={Object.keys(schemaData)}
        onEditTable={startEdit}
        onOpenLink={openLinkDialog}
      />

      {addTableOpen && (
        <AddTableModal onClose={() => setAddTableOpen(false)} onCreateTable={onCreateTable} />
      )}

      {link && (
        <LinkTablesModal
          key={`${link.source}->${link.target}`}
          source={link.source}
          target={link.target}
          schemaData={schemaData}
          onClose={() => setLink(null)}
          onLinked={() => onSchemaChanged()}
        />
      )}

      {editTable && (
        <EditTableModal
          key={editTable}
          tableName={editTable}
          schemaData={schemaData}
          onClose={() => setEditTable(null)}
          onSchemaChanged={onSchemaChanged}
        />
      )}

      {error && (
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            zIndex: 10,
            background: '#fef2f2',
            border: '1px solid #fca5a5',
            color: '#991b1b',
            padding: '8px 14px',
            borderRadius: '8px',
            fontSize: '13px',
            maxWidth: '420px',
          }}
        >
          Couldn't load table metadata: {error}. Click "Load All Tables" to retry.
        </div>
      )}

      {!error && !isLoading && nodes.length === 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted)',
            fontSize: '13px',
            pointerEvents: 'none',
          }}
        >
          No tables on the canvas yet — click "Load All Tables" above.
        </div>
      )}

      {!hintDismissed && nodes.length > 0 && (
        <div className="link-hint" role="note">
          <span>
            <strong>Tip:</strong> drag from the dot on the edge of one table to the dot on another to link them
            with a foreign key — or use the <strong>Link Tables</strong> button.
          </span>
          <button className="link-hint-close" onClick={dismissHint} aria-label="Dismiss tip">×</button>
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        connectionMode={ConnectionMode.Loose}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={(evt, node) => startEdit(node.id)}
        fitView
        className="react-flow-canvas"
      >
        <Background color="var(--border)" gap={20} />
        <Controls />
      </ReactFlow>
    </div>
  );
};
