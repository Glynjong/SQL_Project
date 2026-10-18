import React, { useEffect, useRef } from 'react';
import ReactFlow, { Background, Controls, Handle, Position } from 'reactflow';
import 'reactflow/dist/style.css';
import { useFullscreen, FullscreenButton } from '../Common/Fullscreen';
import { CATEGORY_STYLES, SIMPLE_LEGEND, FULL_LEGEND } from '../../utils/astSimplify';

const clamp = (lines) => ({
  display: '-webkit-box',
  WebkitLineClamp: lines,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  wordBreak: 'break-word',
});

const pill = {
  position: 'absolute',
  left: '50%',
  bottom: -12,
  transform: 'translateX(-50%)',
  minWidth: 30,
  height: 22,
  padding: '0 8px',
  borderRadius: 999,
  border: '1px solid #94a3b8',
  background: '#ffffff',
  color: '#334155',
  fontSize: 11,
  fontWeight: 700,
  cursor: 'pointer',
  lineHeight: '20px',
};

// One tree node: category badge, title, the SQL it stands for, and — when it
// has children — a +N / − toggle that collapses or expands its subtree.
function AstNode({ data, selected }) {
  const st = CATEGORY_STYLES[data.category] || CATEGORY_STYLES.other;
  return (
    <div
      title={data.summary || data.title}
      style={{
        position: 'relative',
        width: 220,
        boxSizing: 'border-box',
        background: st.bg,
        border: `1.5px solid ${selected ? '#0f172a' : st.color}`,
        borderLeft: `6px solid ${st.color}`,
        borderRadius: 10,
        padding: '7px 10px 10px',
        boxShadow: selected ? '0 0 0 3px rgba(37,99,235,0.25)' : '0 2px 4px rgba(0,0,0,0.07)',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div style={{ fontSize: 10, fontWeight: 700, color: st.color, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {st.name}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', ...clamp(2) }}>{data.title}</div>
      {data.summary && (
        <div style={{ fontSize: 11.5, color: '#475569', fontFamily: 'ui-monospace, Menlo, Consolas, monospace', marginTop: 2, ...clamp(2) }}>
          {data.summary}
        </div>
      )}
      {data.hasChildren && (
        <button
          className="nodrag"
          style={pill}
          title={data.collapsed ? `Show ${data.hiddenCount} hidden node(s)` : 'Hide this branch'}
          onClick={(e) => { e.stopPropagation(); data.onToggle(); }}
        >
          {data.collapsed ? `+${data.hiddenCount}` : '−'}
        </button>
      )}
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

const nodeTypes = { astNode: AstNode };

const chip = (active) => ({
  padding: '4px 10px',
  fontSize: 12,
  fontWeight: 600,
  border: `1px solid ${active ? '#2563eb' : '#cbd5e1'}`,
  background: active ? '#2563eb' : '#ffffff',
  color: active ? '#ffffff' : '#334155',
  cursor: 'pointer',
  borderRadius: 6,
});

export function LogicalTree({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  selectedNode,
  onNodeClick,
  isLoading,
  error,
  controls,
  onReparse,
}) {
  const rfRef = useRef(null);
  const fs = useFullscreen(() => {
    if (rfRef.current) rfRef.current.fitView({ padding: 0.15, minZoom: 0.1, maxZoom: 1.1, duration: 250 });
  });
  const c = controls || {};
  const legend = c.viewMode === 'full' ? FULL_LEGEND : SIMPLE_LEGEND;
  const d = selectedNode ? selectedNode.data : null;

  // fitView only auto-runs on first mount, so re-fit after every relayout
  // (collapse/expand, view switch, new query).
  useEffect(() => {
    if (!rfRef.current) return undefined;
    const t = setTimeout(() => {
      if (rfRef.current) rfRef.current.fitView({ padding: 0.15, minZoom: 0.1, maxZoom: 1.1, duration: 250 });
    }, 60);
    return () => clearTimeout(t);
  }, [c.layoutVersion]);

  const rawJson = d && d.raw !== undefined ? JSON.stringify(d.raw, null, 2) : '';
  const shownJson = rawJson.length > 12000 ? `${rawJson.slice(0, 12000)}\n… (truncated)` : rawJson;

  return (
    <div ref={fs.ref} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: '520px', gap: '10px', ...fs.style }}>
      {/* toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 0 }}>
          <button
            style={{ ...chip(c.viewMode !== 'full'), borderRadius: '6px 0 0 6px' }}
            onClick={() => c.setViewMode && c.setViewMode('simple')}
            title="A query outline: SELECT / FROM / WHERE ..., joins, conditions and subqueries"
          >
            Simplified
          </button>
          <button
            style={{ ...chip(c.viewMode === 'full'), borderRadius: '0 6px 6px 0', marginLeft: -1 }}
            onClick={() => c.setViewMode && c.setViewMode('full')}
            title="The raw parse tree, with scalar fields folded into their parent node"
          >
            Full AST
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 12, color: '#64748b', marginRight: 2 }}>Levels:</span>
          {[1, 2, 3, 4, 'all'].map((lv) => (
            <button
              key={lv}
              style={chip(c.activeLevel === lv)}
              onClick={() => c.setLevel && c.setLevel(lv)}
              title={lv === 'all' ? 'Expand everything' : `Show ${lv} level${lv === 1 ? '' : 's'} below the top`}
            >
              {lv === 'all' ? 'All' : lv}
            </button>
          ))}
        </div>

        {onReparse && (
          <button style={chip(false)} onClick={onReparse} disabled={isLoading} title="Parse the query in the box above again">
            ↻ Re-parse
          </button>
        )}

        <span style={{ fontSize: 12, color: '#64748b' }}>
          Showing {c.visibleNodes || 0} of {c.totalNodes || 0} nodes
          {(c.visibleNodes || 0) < (c.totalNodes || 0) && ' — click a +N badge to expand a branch'}
        </span>
      </div>

      {/* legend */}
      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', fontSize: '11px', color: '#475569', padding: '0 4px' }}>
        {legend.map((key) => {
          const st = CATEGORY_STYLES[key];
          return (
            <span key={key} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: st.bg, border: `1.5px solid ${st.color}`, display: 'inline-block' }} />
              {st.name}
            </span>
          );
        })}
      </div>

      <div style={{ display: 'flex', width: '100%', flex: 1, gap: '16px', minHeight: 0 }}>
        <div style={{ flex: 1, position: 'relative', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#f8fafc' }}>
          <FullscreenButton isFs={fs.isFs} onToggle={fs.toggle} />
          {isLoading && (
            <div style={{ position: 'absolute', top: 20, left: 20, zIndex: 10, background: '#fff', padding: '8px 16px', borderRadius: '6px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
              Parsing AST...
            </div>
          )}
          {error && (
            <div style={{ position: 'absolute', top: 20, left: 20, right: 20, zIndex: 10, background: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', padding: '12px', borderRadius: '6px' }}>
              {error}
            </div>
          )}
          {!isLoading && !error && nodes.length === 0 && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13 }}>
              Nothing to show yet — click Re-parse.
            </div>
          )}
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={(evt, node) => onNodeClick(node)}
            onInit={(inst) => { rfRef.current = inst; }}
            minZoom={0.1}
            fitView
          >
            <Background color="#cbd5e1" gap={16} />
            <Controls />
          </ReactFlow>
        </div>

        {d && (
          <div style={{ width: '340px', flexShrink: 0, border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', background: '#ffffff', overflowY: 'auto', maxHeight: fs.isFs ? '100%' : '70vh' }}>
            <h3 style={{ marginTop: 0, marginBottom: 4, fontSize: 15, wordBreak: 'break-word' }}>{d.title}</h3>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10 }}>
              {(CATEGORY_STYLES[d.category] || CATEGORY_STYLES.other).name}
            </div>

            {d.description && (
              <p style={{ fontSize: 13, color: '#334155', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '10px 12px', margin: '0 0 12px 0' }}>
                {d.description}
              </p>
            )}

            {d.summary && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>SQL / value</div>
                <pre style={{ margin: 0, background: '#f1f5f9', padding: 10, borderRadius: 6, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {d.summary}
                </pre>
              </div>
            )}

            {d.items && d.items.length > 1 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>Items ({d.items.length})</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#334155' }}>
                  {d.items.map((it, i) => <li key={i} style={{ wordBreak: 'break-word' }}>{it}</li>)}
                </ul>
              </div>
            )}

            <details>
              <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#475569' }}>Raw AST (JSON)</summary>
              <pre style={{ background: '#f1f5f9', padding: 10, borderRadius: 6, fontSize: 11, overflowX: 'auto' }}>{shownJson}</pre>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
