import React, { useState } from 'react';
import ReactFlow, { Background, Controls } from 'reactflow';
import { PlanNode } from './PlanNode';
import { StagePanel } from './StagePanel';
import { TreeLegend, TreeToolbar } from './TreeComponents';
import { ExecutionStepViewer } from './ExecutionStepViewer';
import { LogicalTree } from './LogicalTree';
import { ProvSQLVisualizer } from './ProvSQLVisualizer';
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
  // Logical Tree (AST) tab
  astNodes,
  astEdges,
  onAstNodesChange,
  onAstEdgesChange,
  selectedAstNode,
  onAstNodeClick,
  astLoading,
  astError,
  onParseAST,
  // ProvSQL Provenance tab
  provRows,
  provFields,
  selectedToken,
  circuitNodes,
  circuitEdges,
  onCircuitNodesChange,
  onCircuitEdgesChange,
  provLoading,
  circuitLoading,
  provError,
  provStatus,
  statusLoading,
  onFetchProvStatus,
  onEnableProvenance,
  onFetchProvenance,
  onFetchCircuit,
}) => {
  const [subTab, setSubTab] = useState('physical'); // 'physical' | 'logical' | 'provsql'

  const handleTabChange = (nextTab) => {
    setSubTab(nextTab);
    if (nextTab === 'logical' && astNodes.length === 0 && !astLoading) {
      onParseAST(query);
    } else if (nextTab === 'provsql') {
      if (provStatus.installed === null && !statusLoading) {
        onFetchProvStatus();
      }
      if (provRows.length === 0 && !provLoading) {
        onFetchProvenance(query);
      }
    }
  };

  return (
    <div className="tree-layout">
      <TreeToolbar
        query={query}
        onQueryChange={onQueryChange}
        onExplain={onExplain}
        onAnalyze={onAnalyze}
        isLoading={planLoading}
      />

      {/* Sub-navigation between the three query-analysis views */}
      <div className="tree-subtabs">
        <button
          className={`tree-subtab ${subTab === 'physical' ? 'tree-subtab--active' : ''}`}
          onClick={() => handleTabChange('physical')}
        >
          🌳 Physical Plan
        </button>
        <button
          className={`tree-subtab ${subTab === 'logical' ? 'tree-subtab--active' : ''}`}
          onClick={() => handleTabChange('logical')}
        >
          🧩 Logical Tree (AST)
        </button>
        <button
          className={`tree-subtab ${subTab === 'provsql' ? 'tree-subtab--active' : ''}`}
          onClick={() => handleTabChange('provsql')}
        >
          🔍 ProvSQL Provenance
        </button>
      </div>

      {/* ── Physical Execution Plan (EXPLAIN / EXPLAIN ANALYZE) ── */}
      {subTab === 'physical' && (
        <>
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
                <div style={{ flex: 1, position: 'relative' }}>
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
        </>
      )}

      {/* ── Logical Tree: libpg_query AST ── */}
      {subTab === 'logical' && (
        <div className="tree-panel-wrap">
          {!astLoading && astNodes.length === 0 && !astError ? (
            <EmptyState
              icon="🧩"
              title="No AST parsed yet"
              subtitle="Write a SQL query above, then open this tab to parse its logical structure"
            />
          ) : (
            <LogicalTree
              nodes={astNodes}
              edges={astEdges}
              onNodesChange={onAstNodesChange}
              onEdgesChange={onAstEdgesChange}
              selectedNode={selectedAstNode}
              onNodeClick={onAstNodeClick}
              isLoading={astLoading}
              error={astError}
            />
          )}
        </div>
      )}

      {/* ── ProvSQL Provenance ── */}
      {subTab === 'provsql' && (
        <div className="tree-panel-wrap">
          <ProvSQLVisualizer
            provRows={provRows}
            provFields={provFields}
            selectedToken={selectedToken}
            circuitNodes={circuitNodes}
            circuitEdges={circuitEdges}
            onCircuitNodesChange={onCircuitNodesChange}
            onCircuitEdgesChange={onCircuitEdgesChange}
            onRowSelect={onFetchCircuit}
            isLoading={provLoading}
            circuitLoading={circuitLoading}
            error={provError}
            provStatus={provStatus}
            statusLoading={statusLoading}
            onEnableProvenance={onEnableProvenance}
            onRerun={() => onFetchProvenance(query)}
          />
        </div>
      )}
    </div>
  );
};
