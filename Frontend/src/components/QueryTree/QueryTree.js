import React from 'react';
import ReactFlow, { Background, Controls } from 'reactflow';
import { PlanNode } from './PlanNode';
import { StagePanel } from './StagePanel';
import { TreeLegend, TreeToolbar } from './TreeComponents';
import { EmptyState } from '../Common/EmptyState';
import '../../../App.css';

const nodeTypes = { planNode: PlanNode };

export const QueryTree = ({
  query,
  onQueryChange,
  onExplain,
  planNodes,
  planEdges,
  onPlanNodesChange,
  onPlanEdgesChange,
  onPlanNodeClick,
  planLoading,
  planError,
  stagePanel,
  onStagePanelClose,
}) => (
  <div className="tree-layout">
    <TreeToolbar
      query={query}
      onQueryChange={onQueryChange}
      onExplain={onExplain}
      isLoading={planLoading}
    />

    <TreeLegend />

    {planError && <div className="tree-error">⚠️ {planError}</div>}

    {!planLoading && planNodes.length === 0 && !planError && (
      <EmptyState
        icon="🌳"
        title="No query plan yet"
        subtitle="Write a SQL query above and click Explain to visualize the execution tree"
      />
    )}

    {planNodes.length > 0 && (
      <div className="tree-canvas-wrap">
        <ReactFlow
          nodes={planNodes}
          edges={planEdges}
          onNodesChange={onPlanNodesChange}
          onEdgesChange={onPlanEdgesChange}
          nodeTypes={nodeTypes}
          onNodeClick={onPlanNodeClick}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          className="react-flow-canvas"
        >
          <Background color="var(--border)" gap={20} />
          <Controls />
        </ReactFlow>

        <StagePanel stage={stagePanel} onClose={onStagePanelClose} />
      </div>
    )}
  </div>
);
