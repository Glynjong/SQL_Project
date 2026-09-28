import { useState, useCallback } from 'react';
import { useNodesState, useEdgesState } from 'reactflow';

const getApiUrl = (endpoint) => {
  const baseUrl = process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:5000';
  return `${baseUrl}${endpoint}`;
};

// Bookkeeping fields that clutter the tree without adding insight for most
// queries — kept in the side panel's raw JSON, just not rendered as their
// own boxes. location/stmt_len are character offsets into the original SQL
// text; the others are near-always-default flags on every statement.
const NOISY_LEAF_KEYS = new Set([
  'location', 'stmt_len', 'length',
]);

// Visual category per node label, so the tree is scannable by shape/color
// at a glance instead of only by reading every box's text.
const CATEGORIES = {
  statement: { test: (l) => /Stmt$/.test(l), color: '#2563eb', bg: '#eff6ff', icon: '📄', name: 'Statement' },
  reference: { test: (l) => ['RangeVar', 'ColumnRef', 'fields'].includes(l), color: '#059669', bg: '#ecfdf5', icon: '🔗', name: 'Reference' },
  operator: { test: (l) => ['A_Expr', 'BoolExpr', 'FuncCall', 'SubLink'].includes(l), color: '#d97706', bg: '#fffbeb', icon: '⚙️', name: 'Operator / Function' },
  literal: { test: (l) => ['A_Const', 'A_Star', 'ival', 'sval', 'fval'].includes(l) || /^\d+$/.test(l), color: '#7c3aed', bg: '#f5f3ff', icon: '🔢', name: 'Literal' },
  clause: { test: (l) => /Clause$|List$/.test(l) || ['ResTarget', 'SortBy'].includes(l), color: '#0891b2', bg: '#ecfeff', icon: '📋', name: 'Clause / List' },
};

function categorize(label) {
  for (const key of Object.keys(CATEGORIES)) {
    if (CATEGORIES[key].test(label)) return CATEGORIES[key];
  }
  return { color: '#475569', bg: '#f8fafc', icon: '⚪', name: 'Other' };
}

export { CATEGORIES };

export function transformASTToReactFlow(ast) {
  const nodes = [];
  const edges = [];
  let idCounter = 0;
  const levelYOffset = 110;
  const levelXSpacing = 200;
  const levelCounts = {};

  function walk(obj, parentId = null, depth = 0, nodeLabel = 'AST Root') {
    const nodeId = `ast_${++idCounter}`;

    let label = nodeLabel;
    let recurseTarget = obj;

    // Collapse a chain of single-key wrapper objects into ONE node.
    // pgsql-parser's real shape often double-wraps a tag, e.g.
    // { SelectStmt: { SelectStmt: { targetList: [...], ... } } } — without
    // this, each layer got its own box, producing a chain of identically-
    // labeled nodes with nothing but the wrapper between them.
    while (recurseTarget && typeof recurseTarget === 'object' && !Array.isArray(recurseTarget)) {
      const keys = Object.keys(recurseTarget);
      if (keys.length !== 1) break;
      label = keys[0];
      recurseTarget = recurseTarget[keys[0]];
    }

    if (!levelCounts[depth]) levelCounts[depth] = 0;
    const xIndex = levelCounts[depth]++;
    const details = recurseTarget;
    const category = categorize(label);

    nodes.push({
      id: nodeId,
      type: 'default',
      data: {
        label: `${category.icon} ${label}`,
        raw: obj,
        details,
        nodeType: label,
        category: category.name
      },
      position: {
        x: xIndex * levelXSpacing,
        y: depth * levelYOffset
      },
      style: {
        background: category.bg,
        border: `1.5px solid ${category.color}`,
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

    if (Array.isArray(recurseTarget)) {
      recurseTarget.forEach((item, idx) => walk(item, nodeId, depth + 1, `[${idx}]`));
    } else if (recurseTarget && typeof recurseTarget === 'object') {
      Object.entries(recurseTarget).forEach(([key, val]) => {
        if (NOISY_LEAF_KEYS.has(key)) return;
        if (val !== null && typeof val === 'object') {
          walk(val, nodeId, depth + 1, key);
        } else if (val !== null && val !== undefined) {
          const leafId = `ast_leaf_${++idCounter}`;
          if (!levelCounts[depth + 1]) levelCounts[depth + 1] = 0;
          const leafX = levelCounts[depth + 1]++;

          nodes.push({
            id: leafId,
            type: 'default',
            data: { label: `${key}: ${String(val)}`, raw: val, details: val, nodeType: key, category: 'Literal' },
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
