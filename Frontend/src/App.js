import React, { useEffect, useState } from 'react';
import { AppLayout } from './components/Layout';
import { QueryRunner } from './components/QueryRunner/QueryRunner';
import { HomePage } from './components/Home/HomePage';
import { SchemaVisualizer } from './components/SchemaVisualizer/SchemaVisualizer';
import { QueryTree } from './components/QueryTree/QueryTree';
import { ImportTableModal } from './components/Import/ImportTableModal';
import { TableDataPopup } from './components/Common/TableDataPopup';
import { useTabs } from './hooks/useTabs';
import { useQueryRunner } from './hooks/useQueryRunner';
import { useSchemaVisualizer } from './hooks/useSchemaVisualizer';
import { useQueryTree } from './hooks/useQueryTree';
import { useLogicalTree } from './hooks/useLogicalTree';
import { useProvSQL } from './hooks/useProvSQL';
import { runQuery } from './utils/apiUtils';
import './App.css';

function App() {
  // State management
  const { activeTab, setActiveTab } = useTabs('home');
  const queryRunner = useQueryRunner();
  const schemaVisualizer = useSchemaVisualizer();
  const queryTree = useQueryTree();
  const logicalTree = useLogicalTree();
  const provSQL = useProvSQL();

  const [importOpen, setImportOpen] = useState(false);
  const [importNotice, setImportNotice] = useState('');

  // Popup state for table data
  const [popup, setPopup] = useState({ tableName: null, data: [], isLoading: false, error: null });

  // Initialize schema on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    schemaVisualizer.loadSchemaMetadata();
  }, []);

  // Auto-populate tables when visualizer tab is opened
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (activeTab === 'visualizer' && Object.keys(schemaVisualizer.schemaData).length > 0) {
      if (schemaVisualizer.nodes.length === 0) {
        console.log('Auto-populating tables...');
        schemaVisualizer.addAllTablesToCanvas();
      }
    }
  }, [activeTab, schemaVisualizer.schemaData]);

  // Handle tab changes
  const handleTabChange = (tab) => {
    setActiveTab(tab);
  };

  // Show table data in popup
  const showTableDataPopup = async (tableName) => {
    setPopup({ tableName, data: [], isLoading: true, error: null });
    try {
      const query = `SELECT * FROM ${tableName} LIMIT 100;`;
      console.log('Fetching table data:', { tableName, query });
      
      const result = await runQuery(query);
      console.log('API Response:', result);
      
      if (result.success) {
        console.log('Rows received:', result.rows);
        setPopup({ tableName, data: result.rows || [], isLoading: false, error: null });
      } else {
        setPopup({ tableName, data: [], isLoading: false, error: result.error || 'Unknown error' });
      }
    } catch (err) {
      console.error('Error fetching table data:', err);
      setPopup({ tableName, data: [], isLoading: false, error: err.message });
    }
  };

  // Handle sidebar table clicks
  const handleSidebarClick = (tableName) => {
    console.log('=== SIDEBAR CLICK ===');
    console.log('Table clicked:', tableName);
    showTableDataPopup(tableName);
  };

  // Handle schema node click
  const handleSchemaNodeClick = (event, node) => {
    showTableDataPopup(node.id);
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
      case 'home':
        return (
          <HomePage
            onOpenInAnalyzer={(sql) => {
              queryRunner.setQuery(sql);
              setActiveTab('querytree');
            }}
            onOpenInRunner={(sql) => {
              queryRunner.setQuery(sql);
              setActiveTab('runner');
            }}
          />
        );

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
            onNodeClick={handleSchemaNodeClick}
            onClearCanvas={schemaVisualizer.clearCanvas}
            onLoadAllTables={schemaVisualizer.addAllTablesToCanvas}
            onCreateTable={schemaVisualizer.createTable}
            schemaData={schemaVisualizer.schemaData}
            onSchemaChanged={schemaVisualizer.refreshCanvasTables}
            onCloseTablePopup={() => setPopup({ tableName: null, data: [], isLoading: false, error: null })}
            isLoading={schemaVisualizer.isLoading}
            error={schemaVisualizer.error}
          />
        );

      case 'querytree':
        return (
          <QueryTree
            query={queryRunner.query}
            onQueryChange={queryRunner.setQuery}
            onAnalyze={() => queryTree.analyzeExecution(queryRunner.query)}
            planNodes={queryTree.planNodes}
            planEdges={queryTree.planEdges}
            onPlanNodesChange={queryTree.onPlanNodesChange}
            onPlanEdgesChange={queryTree.onPlanEdgesChange}
            onPlanNodeClick={handlePlanNodeClick}
            planLoading={queryTree.planLoading}
            planError={queryTree.planError}
            stagePanel={queryTree.stagePanel}
            onStagePanelClose={() => queryTree.setStagePanel(null)}
            executionSteps={queryTree.executionSteps}
            currentStepId={queryTree.currentStepId}
            showExecutionSteps={queryTree.showExecutionSteps}
            onStepClick={queryTree.handleStepClick}
            onStepNext={queryTree.handleStepNext}
            onStepPrev={queryTree.handleStepPrev}
            // Logical Tree (AST) tab
            astNodes={logicalTree.astNodes}
            astEdges={logicalTree.astEdges}
            onAstNodesChange={logicalTree.onAstNodesChange}
            onAstEdgesChange={logicalTree.onAstEdgesChange}
            selectedAstNode={logicalTree.selectedAstNode}
            onAstNodeClick={logicalTree.setSelectedAstNode}
            astLoading={logicalTree.astLoading}
            astError={logicalTree.astError}
            onParseAST={logicalTree.fetchAndParseAST}
            astControls={logicalTree.controls}
            // ProvSQL Provenance tab
            provRows={provSQL.provRows}
            provFields={provSQL.provFields}
            selectedToken={provSQL.selectedToken}
            circuitNodes={provSQL.circuitNodes}
            circuitEdges={provSQL.circuitEdges}
            onCircuitNodesChange={provSQL.onCircuitNodesChange}
            onCircuitEdgesChange={provSQL.onCircuitEdgesChange}
            provLoading={provSQL.provLoading}
            circuitLoading={provSQL.circuitLoading}
            provError={provSQL.provError}
            provStatus={provSQL.provStatus}
            statusLoading={provSQL.statusLoading}
            onFetchProvStatus={provSQL.fetchStatus}
            onEnableProvenance={provSQL.enableProvenance}
            onLookupToken={provSQL.lookupToken}
            tupleResponsibility={provSQL.tupleResponsibility}
            provNotes={provSQL.provNotes}
            responsibilityLoading={provSQL.responsibilityLoading}
            onFetchProvenance={provSQL.fetchProvenance}
            onFetchCircuit={provSQL.fetchCircuit}
          />
        );

      default:
        return null;
    }
  };

  return (
    <>
      <AppLayout
        activeTab={activeTab}
        onTabChange={handleTabChange}
        tables={Object.keys(schemaVisualizer.schemaData)}
        onTableClick={handleSidebarClick}
        onImportTable={() => setImportOpen(true)}
      >
        {renderTabContent()}
      </AppLayout>
      <ImportTableModal
        open={importOpen}
        existingTables={Object.keys(schemaVisualizer.schemaData)}
        onClose={() => setImportOpen(false)}
        onImported={async (name, count) => {
          setImportOpen(false);
          const fresh = await schemaVisualizer.loadSchemaMetadata();
          try { await schemaVisualizer.addTableToCanvas(name, fresh && fresh[name]); } catch (e) { /* canvas update is best-effort */ }
          setImportNotice(`Imported "${name}" (${count} rows).`);
          setTimeout(() => setImportNotice(''), 5000);
        }}
      />
      {importNotice && (
        <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: '#166534', color: '#fff', padding: '10px 18px', borderRadius: 8, fontSize: 13, zIndex: 1100, boxShadow: '0 6px 20px rgba(0,0,0,.25)' }}>
          {importNotice}
        </div>
      )}
      <TableDataPopup
        tableName={popup.tableName}
        data={popup.data}
        isLoading={popup.isLoading}
        error={popup.error}
        onClose={() => setPopup({ tableName: null, data: [], isLoading: false, error: null })}
      />
    </>
  );
}

export default App;
