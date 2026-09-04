// Extract execution steps from EXPLAIN ANALYZE plan in depth-first order
export const extractExecutionSteps = (plan, originalQuery) => {
  const steps = [];
  let stepCounter = 0;

  const traversePlan = (node, parentStepId = null, depth = 0) => {
    const nodeType = node['Node Type'];
    const stepId = stepCounter++;
    const children = node['Plans'] || [];

    // Calculate actual rows (from ANALYZE)
    const actualRows = node['Actual Rows'] ?? node['Plan Rows'];
    const actualLoops = node['Actual Loops'] ?? 1;
    const actualTime = node['Actual Total Time'] ?? 0;
    
    const step = {
      stepId,
      parentStepId,
      depth,
      nodeType,
      relationName: node['Relation Name'] || null,
      alias: node['Alias'] || null,
      indexName: node['Index Name'] || null,
      filter: node['Filter'] || null,
      joinFilter: node['Join Filter'] || null,
      hashCond: node['Hash Cond'] || null,
      
      // Cost metrics (estimated)
      estimatedStartupCost: node['Startup Cost'] || 0,
      estimatedTotalCost: node['Total Cost'] || 0,
      estimatedRows: node['Plan Rows'] || 0,
      planWidth: node['Plan Width'] || 0,
      
      // Actual metrics (from ANALYZE)
      actualRows: node['Actual Rows'] || 0,
      actualLoops: node['Actual Loops'] || 0,
      actualTotalTime: actualTime,
      actualTimings: node['Actual Startup Time'] || 0,
      buffers: node['Shared Hit Blocks'] || 0,
      
      // Derived SQL for this step
      stageSQL: node._stageSQL || originalQuery.trimEnd().replace(/;$/, ''),
      
      // Tree structure
      childStepIds: [],
      description: generateStepDescription(node),
    };

    steps.push(step);
    
    // Process children in order
    children.forEach((child) => {
      const childStepId = stepCounter; // Store before incrementing
      step.childStepIds.push(childStepId);
      traversePlan(child, stepId, depth + 1);
    });
  };

  // Derive stage SQLs first
  deriveStageSQLs(plan, originalQuery);
  
  traversePlan(plan);
  return steps;
};

// Derive SQL for each stage in the plan
const deriveStageSQLs = (plan, originalQuery) => {
  const nodeType = plan['Node Type'];
  const relation = plan['Relation Name'];
  const alias = plan['Alias'];
  const filter = plan['Filter'];
  const children = plan['Plans'] || [];

  let sql = null;

  if (['Seq Scan', 'Index Scan', 'Index Only Scan'].includes(nodeType)) {
    const ref = alias && alias !== relation ? `${relation} ${alias}` : relation;
    sql = filter
      ? `SELECT * FROM ${ref} WHERE ${filter.replace(/::\w+/g, '')}`
      : `SELECT * FROM ${relation}`;
  } else if (nodeType === 'Hash') {
    if (children.length > 0) {
      const child = children[0];
      const r = child['Relation Name'];
      const a = child['Alias'];
      const f = child['Filter'];
      if (r) {
        const ref = a && a !== r ? `${r} ${a}` : r;
        sql = f ? `SELECT * FROM ${ref} WHERE ${f.replace(/::\w+/g, '')}` : `SELECT * FROM ${r}`;
      }
    }
  } else {
    sql = originalQuery.trimEnd().replace(/;$/, '');
  }

  plan._stageSQL = sql || originalQuery.trimEnd().replace(/;$/, '');
  children.forEach((child) => deriveStageSQLs(child, originalQuery));
};

// Generate human-readable description for each step
const generateStepDescription = (node) => {
  const nodeType = node['Node Type'];
  const relation = node['Relation Name'];
  const indexName = node['Index Name'];
  
  switch (nodeType) {
    case 'Seq Scan':
      return `Sequential scan of table ${relation}`;
    case 'Index Scan':
      return `Index scan on ${indexName} for ${relation}`;
    case 'Index Only Scan':
      return `Index-only scan on ${indexName} for ${relation}`;
    case 'Hash':
      return `Hash aggregation`;
    case 'Hash Join':
      return `Hash join operation`;
    case 'Nested Loop':
      return `Nested loop join`;
    case 'Merge Join':
      return `Merge join operation`;
    case 'Aggregate':
      return `Aggregate function`;
    case 'Sort':
      return `Sort operation`;
    case 'Limit':
      return `Limit rows`;
    default:
      return nodeType;
  }
};

// Get efficiency metrics for a step
export const getStepEfficiency = (step) => {
  const estimatedAccuracy = step.actualRows / Math.max(step.estimatedRows, 1);
  const costRatio = step.actualTotalTime / Math.max(step.estimatedTotalCost, 1);
  
  let efficiency = 'good';
  if (estimatedAccuracy > 2 || estimatedAccuracy < 0.5) {
    efficiency = 'poor'; // Planner estimate was way off
  } else if (estimatedAccuracy > 1.5 || estimatedAccuracy < 0.67) {
    efficiency = 'fair';
  }
  
  return {
    efficiency,
    estimatedAccuracy: (estimatedAccuracy * 100).toFixed(1),
    costRatio: (costRatio * 100).toFixed(1),
  };
};

// Get color based on efficiency
export const getEfficiencyColor = (efficiency) => {
  switch (efficiency) {
    case 'good':
      return 'var(--green)';
    case 'fair':
      return 'var(--orange)';
    case 'poor':
      return 'var(--red)';
    default:
      return 'var(--gray)';
  }
};
