import { useState, useCallback } from 'react';
import { useNodesState, useEdgesState } from 'reactflow';

const getApiUrl = (endpoint) => {
  const baseUrl = process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:5000';
  return `${baseUrl}${endpoint}`;
};

// Node styling per ProvSQL gate type. plus/times/monus/agg are the
// semiring operators; input is a leaf (a source tuple). gate_type comes
// back as plain text from circuit_subgraph() — 'input' confirmed directly
// against a live install; the operator names are ProvSQL's documented
// semiring gates but haven't all been individually confirmed the same way,
// so anything unrecognized falls back to `default` rather than being
// mislabeled as a leaf.
const GATE_STYLE = {
  input: { background: '#ffffff', border: '1px solid #10b981', shape: '6px' },
  plus: { background: '#e0e7ff', border: '2px solid #4f46e5', shape: '40px' },
  times: { background: '#fef3c7', border: '2px solid #d97706', shape: '40px' },
  monus: { background: '#fee2e2', border: '2px solid #dc2626', shape: '40px' },
  agg: { background: '#f3e8ff', border: '2px solid #9333ea', shape: '40px' },
  zero: { background: '#f1f5f9', border: '1px dashed #94a3b8', shape: '50%' },
  one: { background: '#f1f5f9', border: '1px dashed #94a3b8', shape: '50%' },
  default: { background: '#f8fafc', border: '1px solid #94a3b8', shape: '10px' },
};

const GATE_LABEL = {
  input: 'INPUT',
  plus: 'PLUS (∨)',
  times: 'TIMES (∧)',
  monus: 'MONUS (−)',
  agg: 'AGG (Σ)',
  zero: 'ZERO',
  one: 'ONE',
};

// Transforms the structured circuit graph returned by POST /provsql/circuit
// ({ nodes: [{id, gateType, isRoot}], edges: [{source, target, gateType}] })
// into React Flow nodes/edges, laid out top-down by BFS depth from the root.
export function transformCircuitToReactFlow(circuit) {
  const { nodes: rawNodes = [], edges: rawEdges = [] } = circuit || {};
  if (rawNodes.length === 0) return { nodes: [], edges: [] };

  const levelYOffset = 100;
  const levelXSpacing = 170;

  // circuit_subgraph() already computes each node's depth from the root
  // (server-verified, not guessed) — use it directly instead of
  // recomputing via BFS, which could disagree on it for a true DAG with
  // shared subexpressions (a node reachable at different depths via
  // different parents).
  const depthCounts = {};
  const nodes = rawNodes.map((n) => {
    const depth = typeof n.depth === 'number' ? n.depth : 0;
    if (!depthCounts[depth]) depthCounts[depth] = 0;
    const xIndex = depthCounts[depth]++;
    const style = GATE_STYLE[n.gateType] || GATE_STYLE.default;

    return {
      id: n.id,
      type: 'default',
      data: {
        label: n.isRoot ? `${GATE_LABEL[n.gateType] || n.gateType}\n(result)` : (GATE_LABEL[n.gateType] || n.gateType),
        gateType: n.gateType,
        fullToken: n.id,
        info1: n.info1,
        info2: n.info2
      },
      position: { x: xIndex * levelXSpacing + 40, y: depth * levelYOffset + 40 },
      style: {
        background: style.background,
        border: n.isRoot ? '3px solid #0f172a' : style.border,
        borderRadius: style.shape,
        padding: '8px 14px',
        fontSize: '11px',
        fontWeight: n.gateType === 'input' ? 'normal' : 'bold',
        color: '#1e293b',
        textAlign: 'center',
        whiteSpace: 'pre-line',
        boxShadow: '0 2px 4px rgba(0,0,0,0.08)'
      }
    };
  });

  const edges = rawEdges.map((e, idx) => ({
    id: `e_${e.source}-${e.target}_${idx}`,
    source: e.source,
    target: e.target,
    animated: true,
    style: { stroke: '#6366f1', strokeWidth: 2 }
  }));

  return { nodes, edges };
}

// Approximate Shapley-value "responsibility" of each source table for a
// query result, using the recursive equal-split rule for read-once
// monotone AND/OR formulas (Livshits, Bertossi & Kimelfeld, "The Shapley
// Value of Tuples in Query Answering"). At every gate, its allocated share
// is split equally among its children (mathematically exact for AND/OR of
// symmetric inputs when each source tuple appears in the formula at most
// once — the common case for simple joins/selections without self-joins
// or UNIONed duplicate references). MONUS/AGG gates are treated the same
// way as a pragmatic approximation; that split is NOT proven exact for
// those gate types. Leaf (INPUT) shares are then summed by source table.
export async function computeShapleyByTable(rootId, edges, lookupTokenFn) {
  const childrenOf = new Map();
  edges.forEach((e) => {
    if (!childrenOf.has(e.source)) childrenOf.set(e.source, []);
    childrenOf.get(e.source).push(e.target);
  });

  const leafShare = new Map();
  (function recurse(id, allocated) {
    const children = childrenOf.get(id) || [];
    if (children.length === 0) {
      leafShare.set(id, (leafShare.get(id) || 0) + allocated);
      return;
    }
    const each = allocated / children.length;
    children.forEach((childId) => recurse(childId, each));
  })(rootId, 1);

  const tableShare = {};
  // Sequential, not Promise.all — leaf counts are small (typically a
  // handful per circuit) and this keeps load on the lookup endpoint light.
  for (const [leafId, share] of leafShare.entries()) {
    // eslint-disable-next-line no-await-in-loop
    const result = await lookupTokenFn(leafId);
    const table = result?.found ? result.table : 'unresolved';
    tableShare[table] = (tableShare[table] || 0) + shaze;
  }

  return Object.entries(tableShare)
    .map(([table, share]) => ({ table, share }))
    .sort((a, b) => b.share - a.share);
}

export function useProvSQL() {
  const [provRows, setProvRows] = useState([]);
  const [provFields, setProvFields] = useState([]);
  const [selectedToken, setSelectedToken] = useState(null);
  const [circuitNodes, setCircuitNodes, onCircuitNodesChange] = useNodesState([]);
  const [circuitEdges, setCircuitEdges, onCircuitEdgesChange] = useEdgesState([]);
  const [provLoading, setProvLoading] = useState(false);
  const [circuitLoading, setCircuitLoading] = useState(false);
  const [provError, setProvError] = useState(null);

  // Extension/table status, so the UI can prompt the user to enable
  // provenance on the right tables instead of failing silently.
  const [provStatus, setProvStatus] = useState({ installed: null, allTables: [], enabledTables: [] });
  const [statusLoading, setStatusLoading] = useState(false);

  const [tableResponsibility, setTableResponsibility] = useState(null);
  const [responsibilityLoading, setResponsibilityLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const response = await fetch(getApiUrl('/provsql/status'));
      const data = await response.json();
      if (data.success) {
        setProvStatus({ installed: data.installed, allTables: data.allTables, enabledTables: data.enabledTables });
      }
    } catch (err) {
      setProvStatus((s) => ({ ...s, installed: false }));
    } finally {
      setStatusLoading(false);
    }
  }, []);

  const enableProvenance = useCallback(async (table) => {
    if (!table) return { success: false, error: 'No table specified' };
    try {
      const response = await fetch(getApiUrl('/provsql/enable-table'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table })
      });
      const data = await response.json();
      if (data.success) {
        await fetchStatus();
      }
      return data;
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, [fetchStatus]);

  const lookupToken = useCallback(async (token) => {
    if (!token) return { success: false, error: 'No token specified' };
    try {
      const response = await fetch(getApiUrl('/provsql/lookup-token'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      return await response.json();
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, []);

  const fetchProvenance = useCallback(async (sql) => {
    if (!sql || !sql.trim()) return;
    setProvLoading(true);
    setProvError(null);
    try {
      const response = await fetch(getApiUrl('/provsql/provenance'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql })
      });
      const data = await response.json();
      if (data.success) {
        setProvRows(data.rows || []);
        setProvFields(data.fields || []);
        // Clear the old circuit diagram/selection — it belongs to the
        // previous query's tokens, which may not even exist in this result.
        setSelectedToken(null);
        setCircuitNodes([]);
        setCircuitEdges([]);
        setTableResponsibility(null);
      } else {
        setProvError(data.error || 'Failed to fetch provenance data');
      }
    } catch (err) {
      setProvError(err.message);
    } finally {
      setProvLoading(false);
    }
  }, [setCircuitNodes, setCircuitEdges]);

  const fetchCircuit = useCallback(async (targetToken) => {
    if (!targetToken) return;
    setSelectedToken(targetToken);
    setCircuitLoading(true);
    setProvError(null);
    setTableResponsibility(null);
    try {
      const response = await fetch(getApiUrl('/provsql/circuit'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetToken })
      });
      const data = await response.json();
      if (data.success) {
        const { nodes, edges } = transformCircuitToReactFlow(data);
        setCircuitNodes(nodes);
        setCircuitEdges(edges);
        setCircuitLoading(false);

        // Compute responsibility off the freshly-fetched data directly
        // (not hook state, which wouldn't have updated yet in this same
        // call) rather than from a second, potentially-stale read.
        setResponsibilityLoading(true);
        try {
          const breakdown = await computeShapleyByTable(targetToken, data.edges || [], lookupToken);
          setTableResponsibility(breakdown);
        } catch (shapleyErr) {
          console.error('Failed to compute table responsibility:', shapleyErr);
        } finally {
          setResponsibilityLoading(false);
        }
      } else {
        setProvError(data.error || 'Failed to fetch provenance circuit');
        setCircuitLoading(false);
      }
    } catch (err) {
      setProvError(err.message);
      setCircuitLoading(false);
    }
  }, [setCircuitNodes, setCircuitEdges, lookupToken]);

  return {
    provRows,
    provFields,
    selectedToken,
    circuitNodes,
    circuitEdges,
    onCircuitNodesChange,
    onCircuitEdgesChange,
    provLoading,
    circuitLoading,
    provError,
    provStatus,
    statusLoading,
    tableResponsibility,
    responsibilityLoading,
    fetchStatus,
    enableProvenance,
    lookupToken,
    fetchProvenance,
    fetchCircuit
  };
}
