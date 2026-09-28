import React, { useState } from 'react';
import ReactFlow, { Background, Controls } from 'reactflow';
import 'reactflow/dist/style.css';
import '../../App.css';
import { COLUMN_TYPES } from '../../utils/schemaUtils';

export const VisualizerToolbar = ({ onClearCanvas, onLoadAllTables, onOpenAddTable }) => (
  <div className="visualizer-toolbar">
    <div className="visualizer-legend">
      <span>
        <span className="legend-circle legend-circle--green" />
        FK relationship 
      </span>
      <span>
        <span className="legend-circle legend-circle--blue" />
        Manual connection
      </span>
      <span className="visualizer-legend-hint">Drag handle to connect</span>
    </div>
    <div className="toolbar-buttons">
      <button className="btn-primary" onClick={onOpenAddTable}>
        + Add Table
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
  onConnect,
  onNodeClick,
  onClearCanvas,
  onLoadAllTables,
  onCreateTable,
  isLoading,
  error,
}) => {
  const [addTableOpen, setAddTableOpen] = useState(false);

  return (
    <div className="visualizer-wrap">
      <VisualizerToolbar onClearCanvas={onClearCanvas} onLoadAllTables={onLoadAllTables} onOpenAddTable={() => setAddTableOpen(true)} />

      {addTableOpen && (
        <AddTableModal onClose={() => setAddTableOpen(false)} onCreateTable={onCreateTable} />
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

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        fitView
        className="react-flow-canvas"
      >
        <Background color="var(--border)" gap={20} />
        <Controls />
      </ReactFlow>
    </div>
  );
};
