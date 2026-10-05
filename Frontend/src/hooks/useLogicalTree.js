import { useState, useCallback, useMemo, useEffect } from 'react';
import { useNodesState, useEdgesState } from 'reactflow';
import {
  buildSimplifiedModel,
  buildFullModel,
  layoutModel,
  defaultCollapsed,
  autoVisibleDepth,
  countNodes,
  findNode,
} from '../utils/astSimplify';

const getApiUrl = (endpoint) => {
  const baseUrl = process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:5000';
  return `${baseUrl}${endpoint}`;
};

const EMPTY = new Set();
const levelLabel = (depth) => (depth === Infinity ? 'all' : depth);

// Parses SQL on the backend (libpg_query), keeps the raw parse tree, and
// derives a tree MODEL from it in one of two views:
//   simple — a query outline (SELECT/FROM/WHERE..., joins, conditions, subqueries)
//   full   — the raw AST with scalar clutter folded away
// The model is laid out as a tidy tree, and big trees open collapsed so a
// complex query starts as a summary instead of a wall of nodes.
export function useLogicalTree() {
  const [astNodes, setAstNodes, onAstNodesChange] = useNodesState([]);
  const [astEdges, setAstEdges, onAstEdgesChange] = useEdgesState([]);
  const [rawAst, setRawAst] = useState(null);
  const [viewMode, setViewModeState] = useState('simple');
  const [collapseState, setCollapseState] = useState({ modelKey: null, set: EMPTY, level: 'all' });
  const [selectedAstNode, setSelectedAstNode] = useState(null);
  const [astLoading, setAstLoading] = useState(false);
  const [astError, setAstError] = useState(null);
  const [lastParsedSql, setLastParsedSql] = useState(null);
  const [layoutVersion, setLayoutVersion] = useState(0);

  const model = useMemo(() => {
    if (!rawAst) return null;
    return viewMode === 'simple' ? buildSimplifiedModel(rawAst) : buildFullModel(rawAst);
  }, [rawAst, viewMode]);

  const totalNodes = useMemo(() => (model ? countNodes(model) : 0), [model]);

  // Collapse state is keyed by the model's id, so a new query / view mode
  // falls back to the automatic default instead of inheriting stale ids.
  const collapsed = useMemo(() => {
    if (!model) return EMPTY;
    if (collapseState.modelKey === model.id) return collapseState.set;
    return defaultCollapsed(model, autoVisibleDepth(model));
  }, [model, collapseState]);

  const activeLevel = useMemo(() => {
    if (!model) return 'all';
    return collapseState.modelKey === model.id ? collapseState.level : levelLabel(autoVisibleDepth(model));
  }, [model, collapseState]);

  const toggleNode = useCallback((id) => {
    if (!model) return;
    const next = new Set(collapsed);
    if (next.has(id)) {
      next.delete(id);
      // expanding reveals ONE level: children that have their own children
      // start collapsed, so a click never dumps a whole subtree on the user
      const node = findNode(model, id);
      if (node) node.children.forEach((k) => { if (k.children.length) next.add(k.id); });
    } else {
      next.add(id);
    }
    setCollapseState({ modelKey: model.id, set: next, level: 'custom' });
  }, [model, collapsed]);

  const setLevel = useCallback((level) => {
    if (!model) return;
    setCollapseState({
      modelKey: model.id,
      set: level === 'all' ? new Set() : defaultCollapsed(model, level),
      level,
    });
  }, [model]);

  const setViewMode = useCallback((mode) => {
    setViewModeState(mode);
    setSelectedAstNode(null);
  }, []);

  // (Re)build React Flow nodes/edges whenever the model or the collapse set changes.
  useEffect(() => {
    if (!model) {
      setAstNodes([]);
      setAstEdges([]);
      return;
    }
    const { nodes: laid, edges: laidEdges, hidden } = layoutModel(model, collapsed);
    setAstNodes(laid.map((l) => ({
      id: l.id,
      type: 'astNode',
      position: { x: l.x, y: l.y },
      data: {
        title: l.model.title,
        summary: l.model.summary,
        description: l.model.description,
        items: l.model.items,
        raw: l.model.raw,
        category: l.model.category,
        nodeType: l.model.title,
        hasChildren: l.model.children.length > 0,
        collapsed: collapsed.has(l.id),
        hiddenCount: hidden.get(l.id) || 0,
        onToggle: () => toggleNode(l.id),
      },
    })));
    setAstEdges(laidEdges.map((e) => ({
      ...e,
      type: 'smoothstep',
      style: { stroke: '#94a3b8', strokeWidth: 1.5 },
    })));
    setLayoutVersion((v) => v + 1);
  }, [model, collapsed, toggleNode, setAstNodes, setAstEdges]);

  const fetchAndParseAST = useCallback(async (sql) => {
    if (!sql || !sql.trim()) return;
    setAstLoading(true);
    setAstError(null);
    try {
      const response = await fetch(getApiUrl('/parse-query'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql }),
      });
      const data = await response.json();
      if (data.success) {
        setRawAst(data.ast);
        setSelectedAstNode(null);
        setLastParsedSql(sql);
      } else {
        // clear the stale tree so an old query's structure isn't shown next to a new error
        setRawAst(null);
        setAstError(data.error || 'Failed to parse SQL query');
      }
    } catch (err) {
      setRawAst(null);
      setAstError(err.message);
    } finally {
      setAstLoading(false);
    }
  }, []);

  return {
    astNodes,
    astEdges,
    onAstNodesChange,
    onAstEdgesChange,
    selectedAstNode,
    setSelectedAstNode,
    astLoading,
    astError,
    fetchAndParseAST,
    controls: {
      viewMode,
      setViewMode,
      activeLevel,
      setLevel,
      totalNodes,
      visibleNodes: astNodes.length,
      lastParsedSql,
      layoutVersion,
    },
  };
}
