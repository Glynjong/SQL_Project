import React from 'react';
import ReactFlow, { Background, Controls } from 'reactflow';
import 'reactflow/dist/style.css';
import '../../App.css';

export const VisualizerToolbar = ({ onClearCanvas, onLoadAllTables }) => (
  <div className="visualizer-toolbar">
    <div className="visualizer-legend">
      <span>
        <span className="legend-circle legend-circle--green" />
        FK relationship 
      </span>
      <span>
        <span className="legend-circle legend-circle--blue" />
        Manual connection
      </span>
      <span className="visualizer-legend-hint">Drag handle to connect</span>
    </div>
    <div className="toolbar-buttons">
      <button className="btn-primary" onClick={onLoadAllTables}>
        Load All Tables
      </button>
      <button className="btn-danger" onClick={onClearCanvas}>
        Clear Canvas
      </button>
    </div>
  </div>
);

export const SchemaVisualizer = ({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeClick,
  onClearCanvas,
  onLoadAllTables,
  isLoading,
  error,
}) => (
  <div className="visualizer-wrap">
    <VisualizerToolbar onClearCanvas={onClearCanvas} onLoadAllTables={onLoadAllTables} />

    {error && (
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          zIndex: 10,
          background: '#fef2f2',
          border: '1px solid #fca5a5',
          color: '#991b1b',
          padding: '8px 14px',
          borderRadius: '8px',
          fontSize: '13px',
          maxWidth: '420px',
        }}
      >
        Couldn't load table metadata: {error}. Click "Load All Tables" to retry.
      </div>
    )}

    {!error && !isLoading && nodes.length === 0 && (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted)',
          fontSize: '13px',
          pointerEvents: 'none',
        }}
      >
        No tables on the canvas yet — click "Load All Tables" above.
      </div>
    )}

    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeClick={onNodeClick}
      fitView
      className="react-flow-canvas"
    >
      <Background color="var(--border)" gap={20} />
      <Controls />
    </ReactFlow>
  </div>
);
