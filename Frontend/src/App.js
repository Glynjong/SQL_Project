import React, { useEffect } from 'react';
import { AppLayout } from './components/Layout';
import { QueryRunner } from './components/QueryRunner/QueryRunner';
import { SchemaVisualizer } from './components/SchemaVisualizer/SchemaVisualizer';
import { QueryTree } from './components/QueryTree/QueryTree';
import { useTabs } from './hooks/useTabs';
import { useQueryRunner } from './hooks/useQueryRunner';
import { useSchemaVisualizer } from './hooks/useSchemaVisualizer';
import { useQueryTree } from './hooks/useQueryTree';
import './App.css';

function App() {
  // State management
  const { activeTab, setActiveTab } = useTabs('runner');
  const queryRunner = useQueryRunner();
  const schemaVisualizer = useSchemaVisualizer();
  const queryTree = useQueryTree();

  // Initialize schema on mount
  useEffect(() => {
    schemaVisualizer.loadSchemaMetadata();
  }, []);

  // Handle tab changes
  const handleTabChange = (tab) => {
    setActiveTab(tab);
  };

  // Handle sidebar table clicks
  const handleSidebarClick = (tableName) => {
    if (activeTab === 'runner') {
      const q = `SELECT * FROM ${tableName};`;
      queryRunner.setQuery(q);
      queryRunner.executeQuery(q, () => schemaVisualizer.loadSchemaMetadata());
    } else if (activeTab === 'visualizer') {
      schemaVisualizer.addTableToCanvas(tableName);
    } else if (activeTab === 'querytree') {
      queryRunner.setQuery(`SELECT * FROM ${tableName} LIMIT 10;`);
    }
  };

  // Handle schema node click
  const handleSchemaNodeClick = (event, node) => {
    setActiveTab('runner');
    const newQuery = `SELECT * FROM ${node.id} LIMIT 10;`;
    queryRunner.setQuery(newQuery);
    queryRunner.executeQuery(newQuery, () => schemaVisualizer.loadSchemaMetadata());
  };

  // Handle plan node click
  const handlePlanNodeClick = async (event, node) => {
    const {
      nodeType,
      relation,
      alias,
      filter,
      joinFilter,
      totalCost,
      rows: estimatedRows,
      width,
      stageSQL,
    } = node.data;

    queryTree.setStagePanel({
      nodeType,
      relation,
      alias,
      filter,
      joinFilter,
      totalCost,
      estimatedRows,
      width,
      stageSQL,
      loading: true,
      error: null,
      rows: null,
    });

    const result = await queryTree.fetchStagePanelData(stageSQL);
    if (result.success) {
      queryTree.setStagePanel((s) => ({ ...s, loading: false, rows: result.rows }));
    } else {
      queryTree.setStagePanel((s) => ({ ...s, loading: false, error: result.error }));
    }
  };

  // Render active tab content
  const renderTabContent = () => {
    switch (activeTab) {
      case 'runner':
        return (
          <QueryRunner
            query={queryRunner.query}
            results={queryRunner.results}
            isLoading={queryRunner.isLoading}
            error={queryRunner.error}
            onQueryChange={queryRunner.setQuery}
            onExecute={() =>
              queryRunner.executeQuery(
                queryRunner.query,
                () => schemaVisualizer.loadSchemaMetadata()
              )
            }
          />
        );

      case 'visualizer':
        return (
          <SchemaVisualizer
            nodes={schemaVisualizer.nodes}
            edges={schemaVisualizer.edges}
            onNodesChange={schemaVisualizer.onNodesChange}
            onEdgesChange={schemaVisualizer.onEdgesChange}
            onConnect={schemaVisualizer.onConnect}
            onNodeClick={handleSchemaNodeClick}
            onClearCanvas={schemaVisualizer.clearCanvas}
          />
        );

      case 'querytree':
        return (
          <QueryTree
            query={queryRunner.query}
            onQueryChange={queryRunner.setQuery}
            onExplain={() => queryTree.analyzePlan(queryRunner.query)}
            planNodes={queryTree.planNodes}
            planEdges={queryTree.planEdges}
            onPlanNodesChange={queryTree.onPlanNodesChange}
            onPlanEdgesChange={queryTree.onPlanEdgesChange}
            onPlanNodeClick={handlePlanNodeClick}
            planLoading={queryTree.planLoading}
            planError={queryTree.planError}
            stagePanel={queryTree.stagePanel}
            onStagePanelClose={() => queryTree.setStagePanel(null)}
          />
        );

      default:
        return null;
    }
  };

  return (
    <AppLayout
      activeTab={activeTab}
      onTabChange={handleTabChange}
      tables={Object.keys(schemaVisualizer.schemaData)}
      onTableClick={handleSidebarClick}
    >
      {renderTabContent()}
    </AppLayout>
  );
}

export default App;
