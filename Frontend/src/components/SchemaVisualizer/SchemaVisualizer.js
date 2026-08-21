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
}) => (
  <div className="visualizer-wrap">
    <VisualizerToolbar onClearCanvas={onClearCanvas} onLoadAllTables={onLoadAllTables} />
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
