import React from 'react';
import ReactFlow, { Background, Controls } from 'reactflow';
import { PlanNode } from './PlanNode';
import { StagePanel } from './StagePanel';
import { TreeLegend, TreeToolbar } from './TreeComponents';
import { ExecutionStepViewer } from './ExecutionStepViewer';
import { EmptyState } from '../Common/EmptyState';
import '../../App.css';

const nodeTypes = { planNode: PlanNode };

export const QueryTree = ({
  query,
  onQueryChange,
  onExplain,
  onAnalyze,
  planNodes,
  planEdges,
  onPlanNodesChange,
  onPlanEdgesChange,
  onPlanNodeClick,
  planLoading,
  planError,
  stagePanel,
  onStagePanelClose,
  executionSteps,
  currentStepId,
  showExecutionSteps,
  onStepClick,
  onStepNext,
  onStepPrev,
}) => (
  <div className="tree-layout">
    <TreeToolbar
      query={query}
      onQueryChange={onQueryChange}
      onExplain={onExplain}
      onAnalyze={onAnalyze}
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
        <div style={{ display: 'flex', height: '100%' }}>
          <div style={{ flex: 1 }}>
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

          {showExecutionSteps && (
            <div style={{ width: '300px', borderLeft: '1px solid var(--border)' }}>
              <ExecutionStepViewer
                steps={executionSteps}
                currentStepId={currentStepId}
                onStepClick={onStepClick}
                onStepNext={onStepNext}
                onStepPrev={onStepPrev}
              />
            </div>
          )}
        </div>
      </div>
    )}
  </div>
);
