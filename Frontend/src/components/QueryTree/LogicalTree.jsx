import React from 'react';
import ReactFlow, { Background, Controls } from 'reactflow';
import 'reactflow/dist/style.css';

export function LogicalTree({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  selectedNode,
  onNodeClick,
  isLoading,
  error
}) {
  return (
    <div style={{ display: 'flex', width: '100%', flex: 1, minHeight: '520px', gap: '16px' }}>
      <div style={{ flex: 1, position: 'relative', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#f8fafc' }}>
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
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={(evt, node) => onNodeClick(node)}
          fitView
        >
          <Background color="#cbd5e1" gap={16} />
          <Controls />
        </ReactFlow>
      </div>

      {selectedNode && (
        <div style={{ width: '320px', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', background: '#ffffff', overflowY: 'auto' }}>
          <h3 style={{ marginTop: 0, fontSize: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
            AST Node: {selectedNode.data?.nodeType || 'Details'}
          </h3>
          <pre style={{ background: '#f1f5f9', padding: '12px', borderRadius: '6px', fontSize: '12px', overflowX: 'auto' }}>
            {JSON.stringify(selectedNode.data?.details || selectedNode.data?.raw, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
