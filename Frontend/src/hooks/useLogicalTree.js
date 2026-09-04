import { useState, useCallback } from 'react';
import { useNodesState, useEdgesState } from 'reactflow';

const getApiUrl = (endpoint) => {
  const baseUrl = process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:5000';
  return `${baseUrl}${endpoint}`;
};

export function transformASTToReactFlow(ast) {
  const nodes = [];
  const edges = [];
  let idCounter = 0;
  const levelYOffset = 110;
  const levelXSpacing = 200;
  const levelCounts = {};

  function walk(obj, parentId = null, depth = 0, nodeLabel = 'AST Root') {
    const nodeId = `ast_${++idCounter}`;
    if (!levelCounts[depth]) levelCounts[depth] = 0;
    const xIndex = levelCounts[depth]++;

    let label = nodeLabel;
    let details = obj;

    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      const keys = Object.keys(obj);
      if (keys.length === 1) {
        label = keys[0];
        details = obj[keys[0]];
      }
    }

    nodes.push({
      id: nodeId,
      type: 'default',
      data: {
        label,
        raw: obj,
        details,
        nodeType: label
      },
      position: {
        x: xIndex * levelXSpacing,
        y: depth * levelYOffset
      },
      style: {
        background: '#ffffff',
        border: '1px solid #3b82f6',
        borderRadius: '8px',
        padding: '8px 12px',
        fontSize: '12px',
        fontWeight: '600',
        color: '#0f172a',
        boxShadow: '0 2px 4px rgba(0,0,0,0.06)',
        minWidth: '130px',
        textAlign: 'center'
      }
    });

    if (parentId) {
      edges.push({
        id: `e_${parentId}-${nodeId}`,
        source: parentId,
        target: nodeId,
        type: 'smoothstep',
        style: { stroke: '#94a3b8', strokeWidth: 1.5 }
      });
    }

    if (Array.isArray(obj)) {
      obj.forEach((item, idx) => walk(item, nodeId, depth + 1, `[${idx}]`));
    } else if (obj && typeof obj === 'object') {
      Object.entries(obj).forEach(([key, val]) => {
        if (val !== null && typeof val === 'object') {
          walk(val, nodeId, depth + 1, key);
        } else if (val !== null && val !== undefined) {
          const leafId = `ast_leaf_${++idCounter}`;
          if (!levelCounts[depth + 1]) levelCounts[depth + 1] = 0;
          const leafX = levelCounts[depth + 1]++;

          nodes.push({
            id: leafId,
            type: 'default',
            data: { label: `${key}: ${String(val)}`, raw: val, details: val },
            position: { x: leafX * levelXSpacing, y: (depth + 1) * levelYOffset },
            style: {
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              padding: '6px 10px',
              fontSize: '11px',
              color: '#475569'
            }
          });

          edges.push({
            id: `e_${nodeId}-${leafId}`,
            source: nodeId,
            target: leafId,
            type: 'smoothstep',
            style: { stroke: '#cbd5e1', strokeWidth: 1 }
          });
        }
      });
    }
  }

  walk(ast, null, 0, 'SelectStmt');

  const maxPerLevel = {};
  nodes.forEach((n) => {
    const depth = Math.round(n.position.y / levelYOffset);
    maxPerLevel[depth] = (maxPerLevel[depth] || 0) + 1;
  });

  const maxNodesInLevel = Math.max(...Object.values(maxPerLevel), 1);
  nodes.forEach((n) => {
    const depth = Math.round(n.position.y / levelYOffset);
    const count = maxPerLevel[depth];
    const offset = ((maxNodesInLevel - count) * levelXSpacing) / 2;
    n.position.x += offset;
  });

  return { nodes, edges };
}

export function useLogicalTree() {
  const [astNodes, setAstNodes, onAstNodesChange] = useNodesState([]);
  const [astEdges, setAstEdges, onAstEdgesChange] = useEdgesState([]);
  const [selectedAstNode, setSelectedAstNode] = useState(null);
  const [astLoading, setAstLoading] = useState(false);
  const [astError, setAstError] = useState(null);

  const fetchAndParseAST = useCallback(async (sql) => {
    if (!sql || !sql.trim()) return;
    setAstLoading(true);
    setAstError(null);
    try {
      const response = await fetch(getApiUrl('/parse-query'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql })
      });
      const data = await response.json();
      if (data.success) {
        const { nodes, edges } = transformASTToReactFlow(data.ast);
        setAstNodes(nodes);
        setAstEdges(edges);
      } else {
        setAstError(data.error || 'Failed to parse SQL query AST');
      }
    } catch (err) {
      setAstError(err.message);
    } finally {
      setAstLoading(false);
    }
  }, [setAstNodes, setAstEdges]);

  return {
    astNodes,
    astEdges,
    onAstNodesChange,
    onAstEdgesChange,
    selectedAstNode,
    setSelectedAstNode,
    astLoading,
    astError,
    fetchAndParseAST
  };
}
