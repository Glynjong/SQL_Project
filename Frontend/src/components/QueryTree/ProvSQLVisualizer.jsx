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

const BAR_COLORS = ['#4f46e5', '#d97706', '#059669', '#dc2626', '#7c3aed', '#0891b2'];

function ResponsibilityChart({ data, loading }) {
  if (loading) {
    return <div style={{ fontSize: '12px', color: '#64748b', padding: '10px 16px' }}>Computing table responsibility…</div>;
  }
  if (!data || data.length === 0) return null;

  return (
    <div style={{ padding: '10px 20px', borderBottom: '1px solid #e2e8f0', background: '#fafafa' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '8px' }}>
        <span style={{ fontSize: '12px', fontWeight: 700, color: '#1e293b' }}>Table Responsibility</span>
        <span style={{ fontSize: '10px', color: '#94a3b8' }}>
          approximate Shapley value — equal-split over AND/OR gates
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        {data.map(({ table, share }, idx) => (
          <div key={table} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '90px', fontSize: '11px', color: '#334155', flexShrink: 0, textAlign: 'right' }}>{table}</span>
            <div style={{ flex: 1, background: '#e2e8f0', borderRadius: '4px', height: '14px', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${Math.max(share * 100, 1.5)}%`,
                  height: '100%',
                  background: BAR_COLORS[idx % BAR_COLORS.length],
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
            <span style={{ width: '44px', fontSize: '11px', color: '#475569', flexShrink: 0 }}>
              {(share * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
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
  onLookupToken,
  tableResponsibility,
  responsibilityLoading,
}) {
  const [circuitModalOpen, setCircuitModalOpen] = useState(false);
  const [selectedCircuitNode, setSelectedCircuitNode] = useState(null);
  const [sourceRow, setSourceRow] = useState(null);
  const [sourceRowLoading, setSourceRowLoading] = useState(false);

  const handleRowClick = (token) => {
    if (!token) return;
    onRowSelect(token);
    setSelectedCircuitNode(null);
    setSourceRow(null);
    setCircuitModalOpen(true);
  };

  const handleCircuitNodeClick = async (evt, node) => {
    setSelectedCircuitNode(node);
    setSourceRow(null);
    if (node.data?.gateType === 'input' && onLookupToken) {
      setSourceRowLoading(true);
      const result = await onLookupToken(node.data.fullToken);
      setSourceRow(result);
      setSourceRowLoading(false);
    }
  };

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

      <div>
        <button
          onClick={onRerun}
          disabled={isLoading}
          style={{
            padding: '8px 18px',
            background: isLoading ? '#94a3b8' : '#16a34a',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: isLoading ? 'not-allowed' : 'pointer'
          }}
        >
          {isLoading ? 'Running…' : '▶ Run Provenance Query'}
        </button>
        <span style={{ marginLeft: '10px', fontSize: '12px', color: '#64748b' }}>
          Runs the query currently in the box above. This tab doesn't auto-refresh when you edit
          the query — click here after changing it.
        </span>
      </div>

      {/* Query Output Table with Provenance Tokens */}
      <div style={{ flex: 1, overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#ffffff' }}>
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
                    onClick={() => handleRowClick(token)}
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

      {!circuitModalOpen && provRows.length > 0 && (
        <div style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', padding: '4px' }}>
          Click a row above with a provenance token to open its circuit diagram.
        </div>
      )}

      {/* Provenance Circuit — full popup modal */}
      {circuitModalOpen && (
        <div
          onClick={() => setCircuitModalOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '92vw',
              height: '86vh',
              background: '#ffffff',
              borderRadius: '12px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #e2e8f0' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '15px' }}>Provenance Circuit</h3>
                <div style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace', marginTop: '2px' }}>
                  {selectedToken}
                </div>
              </div>
              <button
                onClick={() => setCircuitModalOpen(false)}
                style={{ border: 'none', background: 'transparent', fontSize: '22px', lineHeight: 1, cursor: 'pointer', color: '#64748b' }}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <ResponsibilityChart data={tableResponsibility} loading={responsibilityLoading} />

            <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
              <div style={{ flex: 1, position: 'relative', background: '#f8fafc' }}>
                {circuitLoading && (
                  <div style={{ position: 'absolute', top: 20, left: 20, zIndex: 10, background: '#fff', padding: '8px 16px', borderRadius: '6px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                    Loading provenance circuit DAG...
                  </div>
                )}
                {!circuitLoading && circuitNodes.length === 0 && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '13px', textAlign: 'center', padding: '0 24px' }}>
                    No circuit data for this row yet.
                  </div>
                )}
                <ReactFlow
                  nodes={circuitNodes}
                  edges={circuitEdges}
                  onNodesChange={onCircuitNodesChange}
                  onEdgesChange={onCircuitEdgesChange}
                  onNodeClick={handleCircuitNodeClick}
                  fitView
                >
                  <Background color="#cbd5e1" gap={16} />
                  <Controls />
                </ReactFlow>
              </div>

              {/* Node inspector — a side panel inside the modal, not a second popup */}
              {selectedCircuitNode && (
                <div style={{ width: '320px', borderLeft: '1px solid #e2e8f0', padding: '18px 20px', overflowY: 'auto', flexShrink: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', marginBottom: '10px' }}>
                    <h4 style={{ margin: 0, fontSize: '14px' }}>
                      {selectedCircuitNode.data?.gateType?.toUpperCase() || 'Gate'} details
                    </h4>
                    <button
                      onClick={() => setSelectedCircuitNode(null)}
                      style={{ border: 'none', background: 'transparent', fontSize: '16px', lineHeight: 1, cursor: 'pointer', color: '#94a3b8' }}
                      aria-label="Close node details"
                    >
                      ×
                    </button>
                  </div>

                  <div style={{ fontSize: '12px', color: '#475569', marginBottom: '10px' }}>
                    <strong>Token:</strong>
                    <div style={{ wordBreak: 'break-all', fontFamily: 'monospace', marginTop: '2px' }}>
                      {selectedCircuitNode.data?.fullToken}
                    </div>
                  </div>

                  {selectedCircuitNode.data?.gateType === 'input' ? (
                    sourceRowLoading ? (
                      <p style={{ fontSize: '12px', color: '#64748b' }}>Looking up source row…</p>
                    ) : sourceRow?.found ? (
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#166534', marginBottom: '6px' }}>
                          Originates from: {sourceRow.table}
                        </div>
                        <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                          <tbody>
                            {Object.entries(sourceRow.row).map(([col, val]) => (
                              <tr key={col}>
                                <td style={{ padding: '3px 6px', fontWeight: 600, color: '#475569', verticalAlign: 'top' }}>{col}</td>
                                <td style={{ padding: '3px 6px', color: '#0f172a', wordBreak: 'break-all' }}>{String(val)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : sourceRow && !sourceRow.found ? (
                      <p style={{ fontSize: '12px', color: '#64748b' }}>
                        No matching row found — this row may have been deleted since the query ran, or its
                        source table isn't currently provenance-enabled.
                      </p>
                    ) : null
                  ) : (
                    <p style={{ fontSize: '12px', color: '#64748b' }}>
                      This is a {selectedCircuitNode.data?.gateType?.toUpperCase() || 'derived'} gate — a
                      combination of other gates, not a single source row. Expand toward the leaves
                      (bottom of the diagram) to find the INPUT gates it was built from.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
