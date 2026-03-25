import React, { useEffect } from 'react';
import ReactFlow, { Background, Controls, MiniMap } from 'reactflow';
import 'reactflow/dist/style.css';
import '../../../App.css';

export const VisualizerToolbar = ({ onClearCanvas }) => (
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
    <button className="btn-danger" onClick={onClearCanvas}>
      Clear Canvas
    </button>
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
}) => (
  <div className="visualizer-wrap">
    <VisualizerToolbar onClearCanvas={onClearCanvas} />
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
      <MiniMap
        nodeColor={() => 'var(--navy)'}
        maskColor="rgba(240,242,245,0.7)"
        className="react-flow-minimap"
      />
    </ReactFlow>
  </div>
);
