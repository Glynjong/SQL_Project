import { useState } from 'react';
import { useNodesState, useEdgesState } from 'reactflow';
import { explainQuery, runQuery } from '../utils/apiUtils';
import { buildFlowFromPlan } from '../utils/planUtils';

export const useQueryTree = () => {
  const [planNodes, setPlanNodes, onPlanNodesChange] = useNodesState([]);
  const [planEdges, setPlanEdges, onPlanEdgesChange] = useEdgesState([]);
  const [planError, setPlanError] = useState(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [stagePanel, setStagePanel] = useState(null);

  const analyzePlan = async (sql) => {
    setPlanError(null);
    setPlanLoading(true);
    setPlanNodes([]);
    setPlanEdges([]);
    setStagePanel(null);

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
    fetchStagePanelData,
  };
};
