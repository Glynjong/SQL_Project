import { useState, useCallback } from 'react';
import { useNodesState, useEdgesState } from 'reactflow';

const getApiUrl = (endpoint) => {
  const baseUrl = process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:5000';
  return `${baseUrl}${endpoint}`;
};

// Node styling per ProvSQL gate type. plus/times/monus/agg are the
// semiring operators; input is a leaf (a source tuple).
const GATE_STYLE = {
  input: { background: '#ffffff', border: '1px solid #10b981', shape: '6px' },
  plus: { background: '#e0e7ff', border: '2px solid #4f46e5', shape: '40px' },
  times: { background: '#fef3c7', border: '2px solid #d97706', shape: '40px' },
  monus: { background: '#fee2e2', border: '2px solid #dc2626', shape: '40px' },
  agg: { background: '#f3e8ff', border: '2px solid #9333ea', shape: '40px' },
  zero: { background: '#f1f5f9', border: '1px dashed #94a3b8', shape: '50%' },
  one: { background: '#f1f5f9', border: '1px dashed #94a3b8', shape: '50%' },
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

  const childrenOf = new Map();
  rawEdges.forEach((e) => {
    if (!childrenOf.has(e.source)) childrenOf.set(e.source, []);
    childrenOf.get(e.source).push(e.target);
  });

  const root = rawNodes.find((n) => n.isRoot) || rawNodes[0];
  const depths = new Map([[root.id, 0]]);
  const queue = [root.id];
  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];
    const currDepth = depths.get(current);
    (childrenOf.get(current) || []).forEach((childId) => {
      if (!depths.has(childId)) {
        depths.set(childId, currDepth + 1);
        queue.push(childId);
      }
    });
  }

  const depthCounts = {};
  const nodes = rawNodes.map((n) => {
    const depth = depths.has(n.id) ? depths.get(n.id) : 0;
    if (!depthCounts[depth]) depthCounts[depth] = 0;
    const xIndex = depthCounts[depth]++;
    const style = GATE_STYLE[n.gateType] || GATE_STYLE.input;

    return {
      id: n.id,
      type: 'default',
      data: {
        label: n.isRoot ? `${GATE_LABEL[n.gateType] || n.gateType}\n(result)` : (GATE_LABEL[n.gateType] || n.gateType),
        gateType: n.gateType,
        fullToken: n.id
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
      } else {
        setProvError(data.error || 'Failed to fetch provenance data');
      }
    } catch (err) {
      setProvError(err.message);
    } finally {
      setProvLoading(false);
    }
  }, []);

  const fetchCircuit = useCallback(async (targetToken) => {
    if (!targetToken) return;
    setSelectedToken(targetToken);
    setCircuitLoading(true);
    setProvError(null);
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
      } else {
        setProvError(data.error || 'Failed to fetch provenance circuit');
      }
    } catch (err) {
      setProvError(err.message);
    } finally {
      setCircuitLoading(false);
    }
  }, [setCircuitNodes, setCircuitEdges]);

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
    fetchStatus,
    enableProvenance,
    fetchProvenance,
    fetchCircuit
  };
}
