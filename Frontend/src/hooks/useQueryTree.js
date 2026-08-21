import { useState } from 'react';
import { useNodesState, useEdgesState } from 'reactflow';
import { explainQuery, explainAnalyzeQuery, runQuery } from '../utils/apiUtils';
import { buildFlowFromPlan } from '../utils/planUtils';
import { extractExecutionSteps } from '../utils/executionStepUtils';

export const useQueryTree = () => {
  const [planNodes, setPlanNodes, onPlanNodesChange] = useNodesState([]);
  const [planEdges, setPlanEdges, onPlanEdgesChange] = useEdgesState([]);
  const [planError, setPlanError] = useState(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [stagePanel, setStagePanel] = useState(null);
  
  // Execution steps tracking
  const [executionSteps, setExecutionSteps] = useState([]);
  const [currentStepId, setCurrentStepId] = useState(0);
  const [showExecutionSteps, setShowExecutionSteps] = useState(false);

  const analyzePlan = async (sql) => {
    setPlanError(null);
    setPlanLoading(true);
    setPlanNodes([]);
    setPlanEdges([]);
    setStagePanel(null);
    setExecutionSteps([]);
    setCurrentStepId(0);

    try {
      const data = await explainQuery(sql);
      if (data.success) {
        const { nodes: pn, edges: pe } = buildFlowFromPlan(data.plan, sql);
        setPlanNodes(pn);
        setPlanEdges(pe);
      } else {
        setPlanError(data.error);
      }
    } catch (err) {
      setPlanError(err.message);
    } finally {
      setPlanLoading(false);
    }
  };

  const analyzeExecution = async (sql) => {
    setPlanError(null);
    setPlanLoading(true);
    setPlanNodes([]);
    setPlanEdges([]);
    setStagePanel(null);
    setExecutionSteps([]);
    setCurrentStepId(0);

    try {
      const data = await explainAnalyzeQuery(sql);
      if (data.success) {
        // Build both the flow visualization and execution steps
        const { nodes: pn, edges: pe } = buildFlowFromPlan(data.plan, sql);
        setPlanNodes(pn);
        setPlanEdges(pe);
        
        // Extract execution steps
        const steps = extractExecutionSteps(data.plan, sql);
        setExecutionSteps(steps);
        setShowExecutionSteps(true);
        setCurrentStepId(0);
      } else {
        setPlanError(data.error);
      }
    } catch (err) {
      setPlanError(err.message);
    } finally {
      setPlanLoading(false);
    }
  };

  const handleStepNext = () => {
    setCurrentStepId(prev => Math.min(prev + 1, executionSteps.length - 1));
  };

  const handleStepPrev = () => {
    setCurrentStepId(prev => Math.max(prev - 1, 0));
  };

  const handleStepClick = (stepId) => {
    setCurrentStepId(stepId);
  };

  const fetchStagePanelData = async (stageSQL) => {
    if (!stageSQL) {
      return { success: false, error: 'No previewable SQL for this node type.' };
    }

    const safeSQL = stageSQL.trimEnd().replace(/;$/, '') + ' LIMIT 50;';

    try {
      const data = await runQuery(safeSQL);
      return data;
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  return {
    planNodes,
    planEdges,
    onPlanNodesChange,
    onPlanEdgesChange,
    planError,
    planLoading,
    stagePanel,
    setStagePanel,
    analyzePlan,
    analyzeExecution,
    fetchStagePanelData,
    
    // Execution steps
    executionSteps,
    currentStepId,
    showExecutionSteps,
    setShowExecutionSteps,
    handleStepNext,
    handleStepPrev,
    handleStepClick,
  };
};
