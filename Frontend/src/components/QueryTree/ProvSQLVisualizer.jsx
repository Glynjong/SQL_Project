import React, { useState } from 'react';
import ReactFlow, { Background, Controls } from 'reactflow';
import 'reactflow/dist/style.css';
import { buildPieSlices, arcPath, groupByTable } from '../../utils/shapley';
import { MenuButton } from '../Common/MenuButton';

function findToken(row) {
  // The backend appends this column when the query doesn't already ask
  // for provenance() itself. Fall back to any UUID-shaped string column
  // for queries that named the column something else.
  if (row.provenance_token) return row.provenance_token;
  const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const match = Object.values(row).find((v) => typeof v === 'string' && uuidLike.test(v));
  return match || null;
}

// One hue per table; tuples of the same table are shades of that hue, so a
// slice can be matched to its table at a glance.
const TABLE_HUES = [243, 28, 152, 0, 268, 190, 330, 84, 14, 205];
const OTHER_COLOR = '#94a3b8';
const tableColor = (hue, shade = 0) => `hsl(${hue}, 62%, ${Math.min(40 + shade * 7, 70)}%)`;

const toggleBtn = (active, side) => ({
  padding: '3px 10px',
  fontSize: '11px',
  fontWeight: 600,
  cursor: 'pointer',
  border: `1px solid ${active ? '#4f46e5' : '#cbd5e1'}`,
  background: active ? '#4f46e5' : '#ffffff',
  color: active ? '#ffffff' : '#475569',
  borderRadius: side === 'left' ? '6px 0 0 6px' : '0 6px 6px 0',
  marginLeft: side === 'right' ? '-1px' : 0,
});

// Pie chart of responsibility for the selected result row, with a toggle:
//   By tuple — one slice per source row. Every occurrence of a tuple in the
//              circuit counts, so a tuple that feeds the result twice (e.g.
//              through a self-join) gets a bigger slice. The legend is
//              grouped under each tuple's parent table, with a subtotal.
//   By table — one slice per table (the sum of its tuples' shares).
function PieChart({ data, loading }) {
  const [mode, setMode] = useState('tuple');
  const [hoverKey, setHoverKey] = useState(null); // a tuple id, 'tbl:<table>', or null

  if (loading) {
    return <div style={{ fontSize: '12px', color: '#64748b', padding: '14px 20px' }}>Computing tuple responsibility…</div>;
  }
  if (!data || data.length === 0) return null;

  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const groups = groupByTable(data);
  const hueOf = new Map(groups.map((g, i) => [g.table, TABLE_HUES[i % TABLE_HUES.length]]));
  const shadeOf = new Map();
  groups.forEach((g) => g.tuples.forEach((t, i) => shadeOf.set(t.id, i)));

  const tableEntries = groups.map((g) => ({
    id: `tbl:${g.table}`,
    table: g.table,
    detail: plural(g.tuples.length, 'tuple'),
    share: g.share,
    occurrences: g.occurrences,
  }));
  // tuple slices follow the grouped legend order, so each table's slices sit side by side
  const slices = mode === 'table'
    ? buildPieSlices(tableEntries, 10)
    : buildPieSlices(groups.flatMap((g) => g.tuples), 24, { keepOrder: true });

  const colorOf = (s) => {
    if (s.id === '__other') return OTHER_COLOR;
    return tableColor(hueOf.get(s.table), mode === 'table' ? 0 : shadeOf.get(s.id));
  };
  const shownIds = new Set(slices.map((s) => s.id));
  const isActive = (s) => {
    if (hoverKey === null) return true;
    if (hoverKey === s.id || hoverKey === `tbl:${s.table}`) return true;
    // a tuple folded into "Other" highlights the Other slice
    return s.id === '__other' && !hoverKey.startsWith('tbl:') && !shownIds.has(hoverKey);
  };

  const size = 180;
  const c = size / 2;
  const r = 78;
  const totalOccurrences = data.reduce((s, e) => s + e.occurrences, 0);
  const pct = (x) => `${(x * 100).toFixed(1)}%`;
  const swatch = (color, small) => (
    <span style={{ width: small ? '8px' : '10px', height: small ? '8px' : '10px', borderRadius: '2px', marginTop: '3px', flexShrink: 0, background: color }} />
  );

  return (
    <div style={{ padding: '16px 20px', background: '#fafafa' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>Responsibility</div>
        <div style={{ display: 'flex' }}>
          <button style={toggleBtn(mode === 'tuple', 'left')} onClick={() => setMode('tuple')}>By tuple</button>
          <button style={toggleBtn(mode === 'table', 'right')} onClick={() => setMode('table')}>By table</button>
        </div>
      </div>
      <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>
        equal-split estimate, not exact Shapley values — each gate shares its credit equally; repeated tuples count per use
      </div>

      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block', margin: '12px auto' }}>
        {slices.map((s) => {
          const path = arcPath(c, c, r, s.startAngle, s.endAngle);
          const common = {
            fill: colorOf(s),
            stroke: '#ffffff',
            strokeWidth: 2,
            opacity: isActive(s) ? 1 : 0.35,
            onMouseEnter: () => setHoverKey(s.id),
            onMouseLeave: () => setHoverKey(null),
          };
          const tip = `${s.table}${s.detail ? ` (${s.detail})` : ''}: ${pct(s.frac)}`;
          return path
            ? <path key={s.id} d={path} {...common}><title>{tip}</title></path>
            : <circle key={s.id} cx={c} cy={c} r={r} {...common}><title>{tip}</title></circle>;
        })}
      </svg>

      <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
        {mode === 'table' ? (
          groups.map((g) => (
            <div
              key={g.table}
              onMouseEnter={() => setHoverKey(`tbl:${g.table}`)}
              onMouseLeave={() => setHoverKey(null)}
              style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '3px 4px', borderRadius: '4px', background: hoverKey === `tbl:${g.table}` ? '#eef2ff' : 'transparent' }}
            >
              {swatch(tableColor(hueOf.get(g.table), 0))}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#1e293b' }}>{g.table}</div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>
                  {plural(g.tuples.length, 'tuple')} · {plural(g.occurrences, 'occurrence')}
                </div>
              </div>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#334155', flexShrink: 0 }}>{pct(g.share)}</span>
            </div>
          ))
        ) : (
          groups.map((g) => (
            <div key={g.table} style={{ marginBottom: '6px' }}>
              <div
                onMouseEnter={() => setHoverKey(`tbl:${g.table}`)}
                onMouseLeave={() => setHoverKey(null)}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '3px 4px', borderBottom: '1px solid #e2e8f0', background: hoverKey === `tbl:${g.table}` ? '#eef2ff' : 'transparent' }}
              >
                <span style={{ width: '10px', height: '10px', borderRadius: '2px', flexShrink: 0, background: tableColor(hueOf.get(g.table), 0) }} />
                <span style={{ flex: 1, fontSize: '12px', fontWeight: 700, color: '#1e293b' }}>
                  {g.table}
                  <span style={{ fontWeight: 400, color: '#94a3b8' }}> · {plural(g.tuples.length, 'tuple')}</span>
                </span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>{pct(g.share)}</span>
              </div>
              {g.tuples.map((t) => (
                <div
                  key={t.id}
                  onMouseEnter={() => setHoverKey(t.id)}
                  onMouseLeave={() => setHoverKey(null)}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '2px 4px 2px 18px', borderRadius: '4px', background: hoverKey === t.id ? '#eef2ff' : 'transparent' }}
                >
                  {swatch(tableColor(hueOf.get(g.table), shadeOf.get(t.id)), true)}
                  <div style={{ flex: 1, minWidth: 0, fontSize: '11px', color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={t.detail}>
                    {t.detail || '—'}
                    {t.occurrences > 1 && <span style={{ color: '#7c3aed' }}> ×{t.occurrences}</span>}
                  </div>
                  <span style={{ fontSize: '11px', color: '#334155', flexShrink: 0 }}>{pct(t.share)}</span>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
      <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '6px' }}>
        {plural(data.length, 'tuple')} from {plural(groups.length, 'table')} · {plural(totalOccurrences, 'occurrence')}
      </div>
    </div>
  );
}

function SetupPanel({ provStatus, statusLoading, onEnableProvenance, onRerun }) {
  const [enabling, setEnabling] = useState(null); // name of the table being enabled
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
          <MenuButton
            label={enabling ? `Enabling ${enabling}…` : 'Enable Provenance ▾'}
            items={untracked}
            disabled={!!enabling}
            title="Choose a table to start tracking provenance on"
            style={{ padding: '7px 16px', fontSize: '12px' }}
            onPick={async (table) => {
              setEnabling(table);
              setEnableError(null);
              const result = await onEnableProvenance(table);
              setEnabling(null);
              if (!result.success) {
                setEnableError(result.error);
              } else {
                onRerun();
              }
            }}
          />
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
  tupleResponsibility,
  responsibilityLoading,
  provNotes = [],
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

      {provNotes.length > 0 && (
        <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e', padding: '10px 14px', borderRadius: '6px', fontSize: '12px' }}>
          {provNotes.map((n, i) => (
            <div key={i}>{n}</div>
          ))}
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
          {isLoading ? 'Running…' : 'Run Provenance Query'}
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

              {/* Right-hand column: tuple responsibility pie + node inspector (a side panel, not a second popup) */}
              {(responsibilityLoading || (tupleResponsibility && tupleResponsibility.length > 0) || selectedCircuitNode) && (
                <div style={{ width: '340px', borderLeft: '1px solid #e2e8f0', overflowY: 'auto', flexShrink: 0 }}>
                  <PieChart data={tupleResponsibility} loading={responsibilityLoading} />
                  {selectedCircuitNode && (
                <div style={{ padding: '18px 20px', borderTop: '1px solid #e2e8f0' }}>
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
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
