// Query plan utilities
export const deriveStageSQLs = (plan, originalQuery) => {
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

export const costColor = (totalCost) =>
  totalCost > 1000 ? 'var(--red)' : totalCost > 100 ? 'var(--orange)' : 'var(--green)';

let _nodeId = 0;

const flattenPlan = (plan, nodes, edges, parentId = null, depth = 0, x = 0) => {
  const id = `plan-${_nodeId++}`;
  const totalCost = plan['Total Cost'] || 0;

  nodes.push({
    id,
    type: 'planNode',
    position: { x: x * 320, y: depth * 200 },
    data: {
      nodeType: plan['Node Type'],
      relation: plan['Relation Name'],
      alias: plan['Alias'],
      indexName: plan['Index Name'],
      filter: plan['Filter'],
      joinFilter: plan['Join Filter'],
      totalCost,
      rows: plan['Plan Rows'],
      width: plan['Plan Width'],
      stageSQL: plan._stageSQL,
    },
  });

  if (parentId) {
    edges.push({
      id: `e-${parentId}-${id}`,
      source: parentId,
      target: id,
      animated: true,
      style: { stroke: 'var(--blue)', strokeWidth: 2 },
    });
  }

  const children = plan['Plans'] || [];
  children.forEach((child, i) => {
    const childX = x + i - (children.length - 1) / 2;
    flattenPlan(child, nodes, edges, id, depth + 1, childX);
  });
};

export const buildFlowFromPlan = (plan, originalQuery) => {
  deriveStageSQLs(plan['Plan'], originalQuery);
  _nodeId = 0;
  const nodes = [];
  const edges = [];
  flattenPlan(plan['Plan'], nodes, edges);
  return { nodes, edges };
};
