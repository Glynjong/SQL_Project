import React from 'react';
import ReactFlow, { Background, Controls } from 'reactflow';
import 'reactflow/dist/style.css';

// Plain-English descriptions of the Postgres AST node types you'll actually
// run into while exploring SELECT/INSERT/UPDATE/DELETE queries. Not
// exhaustive — libpg_query has ~300 node types — but covers what shows up
// for typical queries. Falls back to "no description" for anything else.
const NODE_DESCRIPTIONS = {
  SelectStmt: 'A SELECT statement — the top-level node for any query that reads rows.',
  InsertStmt: 'An INSERT statement.',
  UpdateStmt: 'An UPDATE statement.',
  DeleteStmt: 'A DELETE statement.',
  RangeVar: 'A reference to a table (e.g. the table named in FROM, UPDATE, or INSERT INTO).',
  targetList: 'The list of columns/expressions being selected or assigned — what goes between SELECT and FROM.',
  ResTarget: 'One entry in a target list or assignment list — a single selected column/expression, or one SET column = value in an UPDATE.',
  ColumnRef: 'A reference to a column by name (or * for "all columns").',
  fields: 'The name parts of a ColumnRef — e.g. ["students", "email"] for students.email, or a single A_Star node for *.',
  A_Star: 'The * wildcard, meaning "all columns".',
  A_Const: 'A literal constant value written directly in the SQL (a number, string, etc.).',
  A_Expr: 'An operator expression, e.g. a = b, x > 5, or col LIKE \'%x%\'.',
  BoolExpr: 'A boolean combination of conditions — AND / OR / NOT.',
  fromClause: 'The list of tables/joins being read from — what comes after FROM.',
  whereClause: 'The filter condition — what comes after WHERE.',
  JoinExpr: 'A JOIN between two tables or subqueries, including its ON condition and join type.',
  SortBy: 'One column/expression in an ORDER BY clause, including ASC/DESC.',
  sortClause: 'The full ORDER BY list.',
  groupClause: 'The GROUP BY list.',
  havingClause: 'The filter condition on grouped rows — what comes after HAVING.',
  FuncCall: 'A function call, e.g. COUNT(*), NOW(), UPPER(name).',
  SubLink: 'A subquery used as an expression, e.g. inside WHERE x IN (SELECT ...) or WHERE EXISTS (...).',
  CommonTableExpr: 'A CTE — one WITH name AS (...) block.',
  WithClause: 'The WITH ... clause introducing one or more CTEs.',
  CreateStmt: 'A CREATE TABLE statement.',
  ColumnDef: 'One column definition inside a CREATE TABLE — its name, type, and constraints.',
  Constraint: 'A constraint on a column or table — PRIMARY KEY, NOT NULL, REFERENCES, etc.',
  TypeName: 'A data type reference, e.g. VARCHAR(50) or INT.',
  LimitOption: 'How LIMIT/OFFSET are applied to the result set.',
  SetOperationStmt: 'A UNION / INTERSECT / EXCEPT combining two SELECT statements.',
};

function describeNode(nodeType) {
  return NODE_DESCRIPTIONS[nodeType] || null;
}

export function LogicalTree({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  selectedNode,
  onNodeClick,
  isLoading,
  error
}) {
  return (
    <div style={{ display: 'flex', width: '100%', flex: 1, minHeight: '520px', gap: '16px' }}>
      <div style={{ flex: 1, position: 'relative', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#f8fafc' }}>
        {isLoading && (
          <div style={{ position: 'absolute', top: 20, left: 20, zIndex: 10, background: '#fff', padding: '8px 16px', borderRadius: '6px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
            Parsing AST...
          </div>
        )}
        {error && (
          <div style={{ position: 'absolute', top: 20, left: 20, right: 20, zIndex: 10, background: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', padding: '12px', borderRadius: '6px' }}>
            {error}
          </div>
        )}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={(evt, node) => onNodeClick(node)}
          fitView
        >
          <Background color="#cbd5e1" gap={16} />
          <Controls />
        </ReactFlow>
      </div>

      {selectedNode && (
        <div style={{ width: '320px', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', background: '#ffffff', overflowY: 'auto' }}>
          <h3 style={{ marginTop: 0, fontSize: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
            AST Node: {selectedNode.data?.nodeType || 'Details'}
          </h3>
          {describeNode(selectedNode.data?.nodeType) && (
            <p style={{ fontSize: '13px', color: '#334155', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '10px 12px', margin: '0 0 12px 0' }}>
              {describeNode(selectedNode.data?.nodeType)}
            </p>
          )}
          <pre style={{ background: '#f1f5f9', padding: '12px', borderRadius: '6px', fontSize: '12px', overflowX: 'auto' }}>
            {JSON.stringify(selectedNode.data?.details || selectedNode.data?.raw, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
