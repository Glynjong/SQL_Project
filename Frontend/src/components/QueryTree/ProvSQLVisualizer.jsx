import React, { useState } from 'react';
import ReactFlow, { Background, Controls } from 'reactflow';
import 'reactflow/dist/style.css';

function findToken(row) {
  // The backend appends this column when the query doesn't already ask
  // for provenance() itself. Fall back to any UUID-shaped string column
  // for queries that named the column something else.
  if (row.provenance_token) return row.provenance_token;
  const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const match = Object.values(row).find((v) => typeof v === 'string' && uuidLike.test(v));
  return match || null;
}

function SetupPanel({ provStatus, statusLoading, onEnableProvenance, onRerun }) {
  const [pendingTable, setPendingTable] = useState('');
  const [enabling, setEnabling] = useState(false);
  const [enableError, setEnableError] = useState(null);

  if (provStatus.installed === false) {
    return (
      <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', padding: '12px 16px', borderRadius: '8px' }}>
        The <strong>ProvSQL</strong> extension isn't installed on this database yet. If you're running the
        provided Docker setup, this is usually a stale <code>postgres_data</code> volume from before ProvSQL
        was added — rebuilding or force-recreating the container alone won't fix it, since the old volume gets
        reattached either way. Reset it with: <code>docker compose down -v &amp;&amp; docker compose up --build</code>.
        Otherwise, run <code>CREATE EXTENSION provsql CASCADE;</code> on this database directly.
      </div>
    );
  }

  const untracked = (provStatus.allTables || []).filter((t) => !(provStatus.enabledTables || []).includes(t));

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 16px', background: '#ffffff' }}>
      <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: '#1e293b' }}>
        Provenance-tracked tables
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
        {(provStatus.enabledTables || []).length === 0 && (
          <span style={{ fontSize: '12px', color: '#64748b' }}>None yet — enable a table below to start tracking provenance.</span>
        )}
        {(provStatus.enabledTables || []).map((t) => (
          <span key={t} style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '999px', background: '#dcfce7', color: '#166534' }}>
            ✓ {t}
          </span>
        ))}
      </div>

      {untracked.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={pendingTable}
            onChange={(e) => setPendingTable(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
          >
            <option value="">Select a table…</option>
            {untracked.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <button
            disabled={!pendingTable || enabling}
            onClick={async () => {
              setEnabling(true);
              setEnableError(null);
              const result = await onEnableProvenance(pendingTable);
              setEnabling(false);
              if (!result.success) {
                setEnableError(result.error);
              } else {
                setPendingTable('');
                onRerun();
              }
            }}
            style={{ padding: '6px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: pendingTable ? 'pointer' : 'not-allowed', opacity: pendingTable ? 1 : 0.6 }}
          >
            {enabling ? 'Enabling…' : 'Enable Provenance'}
          </button>
          {statusLoading && <span style={{ fontSize: '11px', color: '#64748b' }}>refreshing…</span>}
        </div>
      )}
      {enableError && (
        <div style={{ marginTop: '8px', fontSize: '12px', color: '#dc2626' }}>{enableError}</div>
      )}
    </div>
  );
}

export function ProvSQLVisualizer({
  provRows,
  provFields,
  selectedToken,
  circuitNodes,
  circuitEdges,
  onCircuitNodesChange,
  onCircuitEdgesChange,
  onRowSelect,
  isLoading,
  circuitLoading,
  error,
  provStatus = { installed: null, allTables: [], enabledTables: [] },
  statusLoading,
  onEnableProvenance,
  onRerun,
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, minHeight: '520px' }}>
      <SetupPanel
        provStatus={provStatus}
        statusLoading={statusLoading}
        onEnableProvenance={onEnableProvenance}
        onRerun={onRerun}
      />

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', padding: '12px', borderRadius: '6px' }}>
          {error}
        </div>
      )}

      {/* Query Output Table with Provenance Tokens */}
      <div style={{ flex: '0 0 220px', overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#ffffff' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
              {provFields.map((f) => (
                <th key={f} style={{ padding: '8px 12px', borderBottom: '1px solid #cbd5e1' }}>{f}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={provFields.length || 1} style={{ padding: '12px', textAlign: 'center' }}>Loading provenance query results...</td></tr>
            ) : provRows.length === 0 ? (
              <tr><td colSpan={provFields.length || 1} style={{ padding: '12px', textAlign: 'center', color: '#64748b' }}>No result rows yet — run the query above.</td></tr>
            ) : (
              provRows.map((row, idx) => {
                const token = findToken(row);
                const isSelected = token && selectedToken === token;
                return (
                  <tr
                    key={idx}
                    onClick={() => token && onRowSelect(token)}
                    title={token ? `Click to view provenance circuit for ${token}` : 'No provenance token on this row — enable provenance on its source table(s)'}
                    style={{
                      cursor: token ? 'pointer' : 'default',
                      opacity: token ? 1 : 0.6,
                      background: isSelected ? '#e0e7ff' : idx % 2 === 0 ? '#ffffff' : '#f8fafc'
                    }}
                  >
                    {provFields.map((f) => (
                      <td key={f} style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9' }}>
                        {f === 'provenance_token' && row[f]
                          ? String(row[f]).slice(0, 8) + '…'
                          : String(row[f] ?? '')}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Provenance DAG Circuit Visualizer */}
      <div style={{ flex: 1, position: 'relative', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#f8fafc', minHeight: '260px' }}>
        {circuitLoading && (
          <div style={{ position: 'absolute', top: 20, left: 20, zIndex: 10, background: '#fff', padding: '8px 16px', borderRadius: '6px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
            Loading provenance circuit DAG...
          </div>
        )}
        {!circuitLoading && circuitNodes.length === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '13px', textAlign: 'center', padding: '0 24px' }}>
            Click a row above with a provenance token to render its circuit — the Boolean semiring
            operators (⊕ PLUS / ⊗ TIMES) that combined source tuples into this result.
          </div>
        )}
        <ReactFlow
          nodes={circuitNodes}
          edges={circuitEdges}
          onNodesChange={onCircuitNodesChange}
          onEdgesChange={onCircuitEdgesChange}
          fitView
        >
          <Background color="#cbd5e1" gap={16} />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}
