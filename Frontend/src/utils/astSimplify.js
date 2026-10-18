// Pure helpers (no React) that turn a libpg_query parse tree into:
//   (a) a SIMPLIFIED query outline — SELECT / FROM / WHERE ... clause nodes,
//       joins, conditions and subqueries, with expressions rendered back to
//       readable SQL text instead of raw AST plumbing; and
//   (b) a CLEANED full AST — scalar fields folded into their parent's
//       summary line and leaf-like nodes (ColumnRef, A_Const ...) not expanded;
// plus a tidy-tree layout with collapse support. Kept React-free so it can be
// unit-tested with plain node.

let idCounter = 0;
const nextId = () => `m${++idCounter}`;

export const CATEGORY_STYLES = {
  query: { color: '#2563eb', bg: '#eff6ff', name: 'Query' },
  clause: { color: '#0891b2', bg: '#ecfeff', name: 'Clause' },
  table: { color: '#059669', bg: '#ecfdf5', name: 'Table' },
  join: { color: '#0d9488', bg: '#f0fdfa', name: 'Join' },
  condition: { color: '#d97706', bg: '#fffbeb', name: 'Condition' },
  subquery: { color: '#7c3aed', bg: '#f5f3ff', name: 'Subquery / CTE' },
  expression: { color: '#64748b', bg: '#f8fafc', icon: 'ƒ', name: 'Expression' },
  reference: { color: '#059669', bg: '#ecfdf5', name: 'Reference' },
  operator: { color: '#d97706', bg: '#fffbeb', name: 'Operator / Function' },
  literal: { color: '#7c3aed', bg: '#f5f3ff', name: 'Literal' },
  other: { color: '#475569', bg: '#f8fafc', name: 'Other' },
};

export const SIMPLE_LEGEND = ['query', 'clause', 'table', 'join', 'condition', 'subquery'];
export const FULL_LEGEND = ['query', 'clause', 'reference', 'operator', 'literal', 'other'];

export const NODE_DESCRIPTIONS = {
  SelectStmt: 'A SELECT statement — the top-level node for any query that reads rows.',
  InsertStmt: 'An INSERT statement.',
  UpdateStmt: 'An UPDATE statement.',
  DeleteStmt: 'A DELETE statement.',
  RangeVar: 'A reference to a table (e.g. the table named in FROM, UPDATE, or INSERT INTO).',
  targetList: 'The list of columns/expressions being selected or assigned — what goes between SELECT and FROM.',
  ResTarget: 'One entry in a target list or assignment list — a single selected column/expression, or one SET column = value in an UPDATE.',
  ColumnRef: 'A reference to a column by name (or * for "all columns").',
  A_Const: 'A literal constant value written directly in the SQL (a number, string, etc.).',
  A_Expr: "An operator expression, e.g. a = b, x > 5, or col LIKE '%x%'.",
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
  withClause: 'The WITH ... clause introducing one or more CTEs.',
  CreateStmt: 'A CREATE TABLE statement.',
  ColumnDef: 'One column definition inside a CREATE TABLE — its name, type, and constraints.',
  Constraint: 'A constraint on a column or table — PRIMARY KEY, NOT NULL, REFERENCES, etc.',
  TypeName: 'A data type reference, e.g. VARCHAR(50) or INT.',
  NullTest: 'An IS NULL / IS NOT NULL test.',
  TypeCast: 'A type conversion, e.g. value::integer.',
  CaseExpr: 'A CASE WHEN ... THEN ... END expression.',
  RangeSubselect: 'A subquery used in FROM as if it were a table.',
};

// ── tiny helpers ────────────────────────────────────────────────────────────

// {Tag: body} → [Tag, body]; anything else → [null, node]
export function tagOf(node) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return [null, node];
  const keys = Object.keys(node);
  if (keys.length === 1 && node[keys[0]] && typeof node[keys[0]] === 'object' && !Array.isArray(node[keys[0]])) {
    return [keys[0], node[keys[0]]];
  }
  return [null, node];
}

// Some libpg_query fields hold a bare struct, others the {Tag: struct}
// wrapper — accept both.
export function unwrapAs(node, tag) {
  if (node && typeof node === 'object' && !Array.isArray(node)) {
    const keys = Object.keys(node);
    if (keys.length === 1 && keys[0] === tag) return node[tag] || {};
  }
  return node || {};
}

function strOf(n) {
  const [t, b] = tagOf(n);
  if (t === 'String') return b.sval ?? b.str ?? '';
  if (t === 'A_Star') return '*';
  return null;
}

function listItems(n) {
  if (n === null || n === undefined) return [];
  if (Array.isArray(n)) return n;
  const [t, b] = tagOf(n);
  if (t === 'List') return b.items || [];
  return [n];
}

const TYPE_ALIASES = {
  int4: 'integer', int8: 'bigint', int2: 'smallint', float8: 'double precision',
  float4: 'real', bpchar: 'char', bool: 'boolean',
};

function typeNameText(tn) {
  const t = unwrapAs(tn, 'TypeName');
  const parts = (t.names || []).map(strOf).filter((p) => p && p !== 'pg_catalog');
  let name = parts.join('.') || '?';
  name = TYPE_ALIASES[name] || name;
  const mods = (t.typmods || []).map((m) => deparse(m)).filter(Boolean);
  if (mods.length) name += `(${mods.join(',')})`;
  if (t.arrayBounds && t.arrayBounds.length) name += '[]';
  return name;
}

function constText(b) {
  if (b.isnull) return 'NULL';
  if (b.ival !== undefined) return String((b.ival && b.ival.ival) ?? 0);
  if (b.fval !== undefined) return String((b.fval && b.fval.fval) ?? b.fval);
  if (b.boolval !== undefined) return b.boolval && b.boolval.boolval ? 'TRUE' : 'FALSE';
  if (b.sval !== undefined) return `'${(b.sval && b.sval.sval) ?? ''}'`;
  if (b.bsval !== undefined) return `B'${(b.bsval && b.bsval.bsval) ?? ''}'`;
  if (b.val) {
    // older libpg_query (PG ≤ 14): {val: {Integer: {ival}}} / {String: {str}} ...
    const [t, v] = tagOf(b.val);
    if (t === 'Integer') return String(v.ival ?? 0);
    if (t === 'Float') return String(v.str ?? v.fval ?? '0');
    if (t === 'String') return `'${v.str ?? v.sval ?? ''}'`;
    if (t === 'Null') return 'NULL';
    if (t === 'BitString') return `B'${v.str ?? ''}'`;
  }
  return '?';
}

function opName(nameList) {
  const parts = (nameList || []).map(strOf).filter(Boolean);
  return parts[parts.length - 1] || '?';
}

const AGG_NAMES = new Set(['count', 'sum', 'avg', 'min', 'max', 'coalesce', 'now']);

// A_Expr / BoolExpr operands get parentheses when nested, so precedence is
// visible in the flattened text.
function operand(n, subs) {
  const [t] = tagOf(n);
  const txt = deparse(n, subs);
  return t === 'A_Expr' || t === 'BoolExpr' ? `(${txt})` : txt;
}

function boolArg(a, parentOp, subs) {
  const [t, ab] = tagOf(a);
  const txt = deparse(a, subs);
  if (t === 'BoolExpr' && ab.boolop !== parentOp && ab.boolop !== 'NOT_EXPR') return `(${txt})`;
  if (t === 'BoolExpr' && parentOp === 'NOT_EXPR') return `(${txt})`;
  return txt;
}

function aExprText(b, subs) {
  const op = opName(b.name);
  const kind = b.kind || 'AEXPR_OP';
  const l = b.lexpr ? operand(b.lexpr, subs) : '';
  const r = b.rexpr ? operand(b.rexpr, subs) : '';
  const rList = () => listItems(b.rexpr).map((x) => deparse(x, subs));
  switch (kind) {
    case 'AEXPR_OP': return b.lexpr ? `${l} ${op} ${r}` : `${op} ${r}`;
    case 'AEXPR_OP_ANY': return `${l} ${op} ANY (${deparse(b.rexpr, subs)})`;
    case 'AEXPR_OP_ALL': return `${l} ${op} ALL (${deparse(b.rexpr, subs)})`;
    case 'AEXPR_IN': return `${l} ${op === '<>' ? 'NOT IN' : 'IN'} (${rList().join(', ')})`;
    case 'AEXPR_LIKE': return `${l} ${op === '!~~' ? 'NOT LIKE' : 'LIKE'} ${r}`;
    case 'AEXPR_ILIKE': return `${l} ${op === '!~~*' ? 'NOT ILIKE' : 'ILIKE'} ${r}`;
    case 'AEXPR_SIMILAR': return `${l} ${op === '!~' ? 'NOT SIMILAR TO' : 'SIMILAR TO'} ${r}`;
    case 'AEXPR_BETWEEN': return `${l} BETWEEN ${rList().join(' AND ')}`;
    case 'AEXPR_NOT_BETWEEN': return `${l} NOT BETWEEN ${rList().join(' AND ')}`;
    case 'AEXPR_BETWEEN_SYM': return `${l} BETWEEN SYMMETRIC ${rList().join(' AND ')}`;
    case 'AEXPR_NOT_BETWEEN_SYM': return `${l} NOT BETWEEN SYMMETRIC ${rList().join(' AND ')}`;
    case 'AEXPR_DISTINCT': return `${l} IS DISTINCT FROM ${r}`;
    case 'AEXPR_NOT_DISTINCT': return `${l} IS NOT DISTINCT FROM ${r}`;
    case 'AEXPR_NULLIF': return `NULLIF(${l}, ${r})`;
    default: return `${l} ${op} ${r}`;
  }
}

// Renders an expression subtree back to SQL-ish text. `subs`, when given,
// collects any SubLink nodes met on the way so callers can attach the
// subqueries as child nodes.
export function deparse(node, subs) {
  if (node === null || node === undefined) return '';
  if (Array.isArray(node)) return node.map((n) => deparse(n, subs)).join(', ');
  const [tag, b] = tagOf(node);
  if (!tag) return '';
  switch (tag) {
    case 'ColumnRef': return (b.fields || []).map((f) => strOf(f) ?? '?').join('.');
    case 'A_Star': return '*';
    case 'String': return `'${b.sval ?? b.str ?? ''}'`;
    case 'Integer': return String(b.ival ?? 0);
    case 'Float': return String(b.fval ?? b.str ?? '0');
    case 'A_Const': return constText(b);
    case 'ParamRef': return b.number ? `$${b.number}` : '?';
    case 'TypeCast': return `${operand(b.arg, subs)}::${typeNameText(b.typeName)}`;
    case 'RangeVar': {
      const alias = unwrapAs(b.alias, 'Alias').aliasname;
      const rel = [b.schemaname, b.relname].filter(Boolean).join('.');
      return alias ? `${rel} AS ${alias}` : rel;
    }
    case 'A_Expr': return aExprText(b, subs);
    case 'BoolExpr': {
      const args = b.args || [];
      if (b.boolop === 'NOT_EXPR') return `NOT ${boolArg(args[0], 'NOT_EXPR', subs)}`;
      return args.map((a) => boolArg(a, b.boolop, subs)).join(b.boolop === 'OR_EXPR' ? ' OR ' : ' AND ');
    }
    case 'NullTest': return `${operand(b.arg, subs)} IS ${b.nulltesttype === 'IS_NOT_NULL' ? 'NOT ' : ''}NULL`;
    case 'BooleanTest': {
      const m = {
        IS_TRUE: 'IS TRUE', IS_NOT_TRUE: 'IS NOT TRUE', IS_FALSE: 'IS FALSE',
        IS_NOT_FALSE: 'IS NOT FALSE', IS_UNKNOWN: 'IS UNKNOWN', IS_NOT_UNKNOWN: 'IS NOT UNKNOWN',
      };
      return `${operand(b.arg, subs)} ${m[b.booltesttype] || 'IS ?'}`;
    }
    case 'FuncCall': {
      const names = (b.funcname || []).map(strOf).filter(Boolean);
      let fname = names[names.length - 1] || 'func';
      if (AGG_NAMES.has(fname.toLowerCase())) fname = fname.toUpperCase();
      let args = b.agg_star ? '*' : (b.args || []).map((a) => deparse(a, subs)).join(', ');
      if (b.agg_distinct) args = `DISTINCT ${args}`;
      let s = `${fname}(${args})`;
      if (b.agg_filter) s += ` FILTER (WHERE ${deparse(b.agg_filter, subs)})`;
      if (b.over) {
        const o = unwrapAs(b.over, 'WindowDef');
        const inner = [];
        if (o.name) inner.push(o.name);
        if (o.partitionClause && o.partitionClause.length) inner.push(`PARTITION BY ${deparse(o.partitionClause, subs)}`);
        if (o.orderClause && o.orderClause.length) inner.push(`ORDER BY ${o.orderClause.map((x) => deparse(x, subs)).join(', ')}`);
        s += ` OVER (${inner.join(' ')})`;
      }
      return s;
    }
    case 'CaseExpr': {
      const whens = (b.args || []).map((w) => {
        const wb = unwrapAs(w, 'CaseWhen');
        return `WHEN ${deparse(wb.expr, subs)} THEN ${deparse(wb.result, subs)}`;
      });
      return `CASE${b.arg ? ` ${deparse(b.arg, subs)}` : ''} ${whens.join(' ')}${b.defresult ? ` ELSE ${deparse(b.defresult, subs)}` : ''} END`;
    }
    case 'CoalesceExpr': return `COALESCE(${(b.args || []).map((a) => deparse(a, subs)).join(', ')})`;
    case 'MinMaxExpr': return `${b.op === 'IS_LEAST' ? 'LEAST' : 'GREATEST'}(${(b.args || []).map((a) => deparse(a, subs)).join(', ')})`;
    case 'SQLValueFunction': return String(b.op || '').replace('SVFOP_', '') || 'CURRENT';
    case 'RowExpr': return `ROW(${(b.args || []).map((a) => deparse(a, subs)).join(', ')})`;
    case 'A_ArrayExpr': return `ARRAY[${(b.elements || []).map((a) => deparse(a, subs)).join(', ')}]`;
    case 'A_Indirection': {
      let s = deparse(b.arg, subs);
      (b.indirection || []).forEach((i) => {
        const [t, ib] = tagOf(i);
        if (t === 'String') s += `.${ib.sval ?? ib.str ?? ''}`;
        else if (t === 'A_Star') s += '.*';
        else s += '[…]';
      });
      return s;
    }
    case 'List': return (b.items || []).map((a) => deparse(a, subs)).join(', ');
    case 'ResTarget': return `${deparse(b.val, subs)}${b.name ? ` AS ${b.name}` : ''}`;
    case 'SortBy': {
      let s = deparse(b.node, subs);
      if (b.sortby_dir === 'SORTBY_DESC') s += ' DESC';
      else if (b.sortby_dir === 'SORTBY_ASC') s += ' ASC';
      if (b.sortby_nulls === 'SORTBY_NULLS_FIRST') s += ' NULLS FIRST';
      else if (b.sortby_nulls === 'SORTBY_NULLS_LAST') s += ' NULLS LAST';
      return s;
    }
    case 'SubLink': {
      if (subs) subs.push(b);
      const test = b.testexpr ? deparse(b.testexpr, subs) : '';
      switch (b.subLinkType) {
        case 'EXISTS_SUBLINK': return 'EXISTS (subquery)';
        case 'ANY_SUBLINK': {
          const op = b.operName ? opName(b.operName) : '=';
          return op === '=' ? `${test} IN (subquery)` : `${test} ${op} ANY (subquery)`;
        }
        case 'ALL_SUBLINK': return `${test} ${opName(b.operName)} ALL (subquery)`;
        case 'ARRAY_SUBLINK': return 'ARRAY(subquery)';
        default: return '(subquery)';
      }
    }
    default: return tag;
  }
}

// ── model node factory ──────────────────────────────────────────────────────

function mk(category, title, { summary = '', description = '', items = null, raw = null } = {}) {
  return { id: nextId(), category, title, summary, description, items, raw, children: [] };
}

export function statementsOf(ast) {
  let list = ast;
  if (list && !Array.isArray(list) && Array.isArray(list.stmts)) list = list.stmts;
  if (!Array.isArray(list)) list = list ? [list] : [];
  return list.map((item) => {
    let s = item;
    if (s && s.RawStmt) s = s.RawStmt;
    if (s && s.stmt) s = s.stmt;
    return s;
  });
}

// ── simplified model ────────────────────────────────────────────────────────

const JOIN_NAMES = {
  JOIN_INNER: 'INNER JOIN', JOIN_LEFT: 'LEFT JOIN', JOIN_FULL: 'FULL JOIN',
  JOIN_RIGHT: 'RIGHT JOIN', JOIN_SEMI: 'SEMI JOIN', JOIN_ANTI: 'ANTI JOIN',
};

const aliasOf = (alias) => unwrapAs(alias, 'Alias').aliasname || '';
const relText = (rv) => {
  const r = unwrapAs(rv, 'RangeVar');
  return [r.schemaname, r.relname].filter(Boolean).join('.');
};

function subTitle(s) {
  switch (s.subLinkType) {
    case 'EXISTS_SUBLINK': return 'Subquery (EXISTS)';
    case 'ANY_SUBLINK': return 'Subquery (IN / ANY)';
    case 'ALL_SUBLINK': return 'Subquery (ALL)';
    case 'ARRAY_SUBLINK': return 'Subquery (ARRAY)';
    default: return 'Subquery (scalar)';
  }
}

function attachSubqueries(node, subs) {
  subs.forEach((s) => {
    node.children.push(buildSelect(unwrapAs(s.subselect, 'SelectStmt'), {
      category: 'subquery',
      title: subTitle(s),
      description: 'A nested query used inside an expression. Expand it to see its own clauses.',
    }));
  });
}

function countTables(item) {
  const [tag, b] = tagOf(item);
  if (tag === 'RangeVar') return 1;
  if (tag === 'JoinExpr') return countTables(b.larg) + countTables(b.rarg);
  if (tag === 'RangeSubselect') return 1;
  return 0;
}

function baseTableNames(item) {
  const [tag, b] = tagOf(item);
  if (tag === 'RangeVar') return [deparse(item)];
  if (tag === 'JoinExpr') return [...baseTableNames(b.larg), ...baseTableNames(b.rarg)];
  if (tag === 'RangeSubselect') return [`(subquery)${aliasOf(b.alias) ? ` ${aliasOf(b.alias)}` : ''}`];
  if (tag === 'RangeFunction') return ['(function)'];
  return [];
}

function buildFromItem(item) {
  const [tag, b] = tagOf(item);
  if (tag === 'RangeVar') {
    const alias = aliasOf(b.alias);
    return mk('table', relText(b), {
      summary: alias ? `AS ${alias}` : '',
      description: 'A base table (or view) read by the query.',
      raw: item,
    });
  }
  if (tag === 'JoinExpr') {
    const subs = [];
    let kind = JOIN_NAMES[b.jointype || 'JOIN_INNER'] || 'JOIN';
    let cond = '';
    if (b.usingClause && b.usingClause.length) {
      cond = `USING (${b.usingClause.map((u) => strOf(u) ?? '?').join(', ')})`;
    } else if (b.quals) {
      cond = `ON ${deparse(b.quals, subs)}`;
    }
    if (b.isNatural) kind = `NATURAL ${kind}`;
    else if (!cond && (b.jointype || 'JOIN_INNER') === 'JOIN_INNER') kind = 'CROSS JOIN';
    const n = mk('join', kind, {
      summary: cond,
      description: 'Combines rows from its two children. The condition after ON says which pairs of rows are kept.',
      raw: item,
    });
    n.children.push(buildFromItem(b.larg), buildFromItem(b.rarg));
    attachSubqueries(n, subs);
    return n;
  }
  if (tag === 'RangeSubselect') {
    const alias = aliasOf(b.alias);
    return buildSelect(unwrapAs(b.subquery, 'SelectStmt'), {
      category: 'subquery',
      title: `Subquery${alias ? ` AS ${alias}` : ''}`,
      description: 'A subquery used in FROM as if it were a table. Expand it to see its own clauses.',
    });
  }
  if (tag === 'RangeFunction') {
    let text = 'function';
    listItems(b.functions).forEach((f) => {
      const inner = listItems(f).find((x) => tagOf(x)[0] === 'FuncCall');
      if (inner) text = deparse(inner);
    });
    return mk('table', `Function: ${text}`, { description: 'A set-returning function used as a table.', raw: item });
  }
  return mk('other', tag || 'FROM item', { raw: item });
}

// Boolean structure → child nodes, so a long AND/OR chain becomes a small
// tree of predicates instead of one unreadable line.
function condNode(a) {
  const [t, ab] = tagOf(a);
  if (t === 'BoolExpr') {
    const label = ab.boolop === 'OR_EXPR' ? 'OR' : ab.boolop === 'NOT_EXPR' ? 'NOT' : 'AND';
    const args = ab.args || [];
    const n = mk('condition', label, {
      summary: label === 'NOT' ? deparse(a) : `${args.length} conditions`,
      description: label === 'AND' ? 'All of the conditions below must hold.'
        : label === 'OR' ? 'At least one of the conditions below must hold.' : 'Negates the condition below.',
      raw: a,
    });
    args.forEach((x) => n.children.push(condNode(x)));
    return n;
  }
  const subs = [];
  const text = deparse(a, subs);
  const n = mk('condition', text || t || 'condition', { description: 'A single predicate.', raw: a });
  attachSubqueries(n, subs);
  return n;
}

function condChildren(expr) {
  const [tag, b] = tagOf(expr);
  if (tag === 'BoolExpr' && b.boolop !== 'NOT_EXPR' && (b.args || []).length > 1) {
    return (b.args || []).map(condNode);
  }
  const subs = [];
  deparse(expr, subs);
  const holder = { children: [] };
  attachSubqueries(holder, subs);
  return holder.children;
}

function conditionClause(title, expr, description) {
  const text = deparse(expr);
  const [tag, b] = tagOf(expr);
  const items = tag === 'BoolExpr' && b.boolop === 'AND_EXPR' ? (b.args || []).map((x) => deparse(x)) : null;
  const n = mk('clause', title, { summary: text, items, description, raw: expr });
  n.children = condChildren(expr);
  return n;
}

function targetText(t, subs) {
  const [tag, b] = tagOf(t);
  if (tag === 'ResTarget') return `${deparse(b.val, subs)}${b.name ? ` AS ${b.name}` : ''}`;
  return deparse(t, subs);
}

function buildWith(withClause, into) {
  const w = unwrapAs(withClause, 'WithClause');
  const ctes = (w.ctes || []).map((c) => unwrapAs(c, 'CommonTableExpr'));
  if (!ctes.length) return;
  const node = mk('clause', w.recursive ? 'WITH RECURSIVE' : 'WITH', {
    summary: ctes.map((c) => c.ctename).join(', '),
    description: 'Named subqueries (CTEs) that the main query can refer to like tables.',
    raw: w,
  });
  ctes.forEach((c) => {
    node.children.push(buildSelect(unwrapAs(c.ctequery, 'SelectStmt'), {
      category: 'subquery',
      title: `CTE: ${c.ctename}`,
      description: 'A named subquery defined in the WITH clause.',
    }));
  });
  into.children.push(node);
}

function tailClauses(b, node) {
  if (b.sortClause && b.sortClause.length) {
    const items = b.sortClause.map((s) => deparse(s));
    node.children.push(mk('clause', 'ORDER BY', {
      summary: items.join(', '), items, raw: b.sortClause,
      description: 'Sorts the result rows.',
    }));
  }
  if (b.limitCount || b.limitOffset) {
    const parts = [];
    if (b.limitCount) parts.push(`LIMIT ${deparse(b.limitCount)}`);
    if (b.limitOffset) parts.push(`OFFSET ${deparse(b.limitOffset)}`);
    node.children.push(mk('clause', 'LIMIT / OFFSET', {
      summary: parts.join(' '), raw: { limitCount: b.limitCount, limitOffset: b.limitOffset },
      description: 'Restricts how many rows are returned.',
    }));
  }
}

function isPlainSelect(x) {
  const body = unwrapAs(x, 'SelectStmt');
  return !body.op || body.op === 'SETOP_NONE';
}

export function buildSelect(input, opts = {}) {
  const b = unwrapAs(input, 'SelectStmt');
  const category = opts.category || 'query';

  if (b.valuesLists) {
    return mk(category, opts.title || 'VALUES', {
      summary: `${b.valuesLists.length} row(s)`, raw: b,
      description: 'A literal list of rows.',
    });
  }

  if (b.op && b.op !== 'SETOP_NONE') {
    const word = { SETOP_UNION: 'UNION', SETOP_INTERSECT: 'INTERSECT', SETOP_EXCEPT: 'EXCEPT' }[b.op] || b.op;
    const label = `${word}${b.all ? ' ALL' : ''}`;
    const node = mk(category, opts.title || label, {
      summary: opts.title ? label : '',
      description: `Combines the rows of two queries with ${label}.`,
      raw: b,
    });
    buildWith(b.withClause, node);
    node.children.push(
      buildSelect(b.larg, isPlainSelect(b.larg) ? { title: 'Left query' } : {}),
      buildSelect(b.rarg, isPlainSelect(b.rarg) ? { title: 'Right query' } : {}),
    );
    tailClauses(b, node);
    return node;
  }

  const from = b.fromClause || [];
  const targets = b.targetList || [];
  const tableCount = from.reduce((s, f) => s + countTables(f), 0);
  const node = mk(category, opts.title || 'SELECT', {
    summary: `${tableCount} table${tableCount === 1 ? '' : 's'} · ${targets.length} column${targets.length === 1 ? '' : 's'}`,
    description: opts.description || 'A SELECT query. Its clauses below are evaluated roughly in this order: FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT.',
    raw: b,
  });

  buildWith(b.withClause, node);

  // SELECT list
  const subs = [];
  const items = targets.map((t) => targetText(t, subs));
  const sel = mk('clause', b.distinctClause && b.distinctClause.length ? 'SELECT DISTINCT' : 'SELECT', {
    summary: items.join(', '), items, raw: targets,
    description: 'The columns / expressions this query returns.',
  });
  attachSubqueries(sel, subs);
  node.children.push(sel);

  // FROM
  if (from.length) {
    const fromNode = mk('clause', 'FROM', {
      summary: from.flatMap(baseTableNames).join(', '),
      items: from.flatMap(baseTableNames),
      raw: from,
      description: 'The tables (and how they are joined) that rows are read from.',
    });
    from.forEach((f) => fromNode.children.push(buildFromItem(f)));
    node.children.push(fromNode);
  }

  if (b.whereClause) node.children.push(conditionClause('WHERE', b.whereClause, 'Keeps only rows that satisfy the condition.'));

  if (b.groupClause && b.groupClause.length) {
    const g = b.groupClause.map((x) => deparse(x));
    node.children.push(mk('clause', 'GROUP BY', {
      summary: g.join(', '), items: g, raw: b.groupClause,
      description: 'Collapses rows that share these values into one group each (aggregates like COUNT run per group).',
    }));
  }

  if (b.havingClause) node.children.push(conditionClause('HAVING', b.havingClause, 'Keeps only groups that satisfy the condition (like WHERE, but applied after grouping).'));

  tailClauses(b, node);
  return node;
}

function tableOfRelation(rel) {
  return relText(rel) || '?';
}

function buildDml(tag, b, raw) {
  const rel = tableOfRelation(b.relation);
  const node = mk('query', tag === 'InsertStmt' ? `INSERT INTO ${rel}` : tag === 'UpdateStmt' ? `UPDATE ${rel}` : `DELETE FROM ${rel}`, {
    description: tag === 'InsertStmt' ? 'Adds new rows to a table.' : tag === 'UpdateStmt' ? 'Changes existing rows.' : 'Removes rows.',
    raw,
  });
  buildWith(b.withClause, node);

  if (tag === 'InsertStmt') {
    const cols = (b.cols || []).map((c) => tagOf(c)[1].name).filter(Boolean);
    node.summary = cols.length ? `(${cols.join(', ')})` : '';
    if (b.selectStmt) {
      const sel = unwrapAs(b.selectStmt, 'SelectStmt');
      node.children.push(sel.valuesLists
        ? mk('clause', 'VALUES', { summary: `${sel.valuesLists.length} row(s)`, raw: sel, description: 'The literal rows being inserted.' })
        : buildSelect(sel, { category: 'subquery', title: 'Source query', description: 'The query whose rows are inserted.' }));
    }
  }
  if (tag === 'UpdateStmt') {
    const sets = (b.targetList || []).map((t) => targetText(t)).map((s) => s.replace(/^(.*) AS (\S+)$/, '$2 = $1'));
    node.children.push(mk('clause', 'SET', { summary: sets.join(', '), items: sets, raw: b.targetList, description: 'The new values assigned to columns.' }));
  }
  const fromList = tag === 'UpdateStmt' ? b.fromClause : b.usingClause;
  if (fromList && fromList.length) {
    const f = mk('clause', tag === 'UpdateStmt' ? 'FROM' : 'USING', { summary: fromList.flatMap(baseTableNames).join(', '), raw: fromList, description: 'Extra tables used to decide which rows change.' });
    fromList.forEach((x) => f.children.push(buildFromItem(x)));
    node.children.push(f);
  }
  if (b.whereClause) node.children.push(conditionClause('WHERE', b.whereClause, 'Only rows matching this condition are affected.'));
  if (b.returningList && b.returningList.length) {
    const r = b.returningList.map((t) => targetText(t));
    node.children.push(mk('clause', 'RETURNING', { summary: r.join(', '), items: r, raw: b.returningList, description: 'Rows/columns handed back after the change.' }));
  }
  return node;
}

function buildStatement(stmt) {
  const [tag, b] = tagOf(stmt);
  if (tag === 'SelectStmt') return buildSelect(b);
  if (tag === 'InsertStmt' || tag === 'UpdateStmt' || tag === 'DeleteStmt') return buildDml(tag, b, stmt);
  const n = mk('query', tag || 'Statement', {
    summary: b && b.relation ? tableOfRelation(b.relation) : '',
    description: NODE_DESCRIPTIONS[tag] || 'A statement type without a dedicated simplified view — see the raw AST below.',
    raw: stmt,
  });
  return n;
}

export function buildSimplifiedModel(ast) {
  const roots = statementsOf(ast).map(buildStatement);
  if (roots.length === 0) return mk('other', 'Empty query', { description: 'Nothing to show.', raw: ast });
  if (roots.length === 1) return roots[0];
  const root = mk('query', `${roots.length} statements`, { description: 'The input contains several statements.', raw: ast });
  root.children = roots;
  return root;
}

// ── cleaned full-AST model ──────────────────────────────────────────────────

const NOISY_KEYS = new Set(['location', 'stmt_len', 'stmt_location', 'length']);
const DEFAULT_VALUES = new Set([
  'limitOption=LIMIT_OPTION_DEFAULT', 'op=SETOP_NONE', 'inh=true', 'relpersistence=p',
  'kind=AEXPR_OP', 'sortby_dir=SORTBY_DEFAULT', 'sortby_nulls=SORTBY_NULLS_DEFAULT',
  'jointype=JOIN_INNER', 'all=false',
]);
// Nodes whose whole meaning fits on one line — shown as a single box.
const LEAF_TAGS = new Set([
  'ColumnRef', 'A_Const', 'String', 'Integer', 'Float', 'ParamRef', 'A_Star', 'TypeName', 'RangeVar', 'Boolean',
]);

function categorizeRaw(label) {
  if (/Stmt$/.test(label)) return 'query';
  if (['RangeVar', 'ColumnRef', 'fields'].includes(label)) return 'reference';
  if (['A_Expr', 'BoolExpr', 'FuncCall', 'SubLink', 'NullTest', 'TypeCast', 'CaseExpr', 'CoalesceExpr'].includes(label)) return 'operator';
  if (['A_Const', 'A_Star', 'String', 'Integer', 'Float'].includes(label)) return 'literal';
  if (/Clause$|List$/.test(label) || ['ResTarget', 'SortBy', 'JoinExpr', 'CommonTableExpr'].includes(label)) return 'clause';
  return 'other';
}

const isObj = (v) => v !== null && typeof v === 'object';

function walkFull(value, label) {
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    const n = mk(categorizeRaw(label), label, {
      summary: `${value.length} item${value.length === 1 ? '' : 's'}`,
      description: NODE_DESCRIPTIONS[label] || '',
      raw: value,
    });
    value.forEach((item, i) => {
      const c = walkFull(item, `[${i}]`);
      if (c) n.children.push(c);
    });
    return n;
  }
  if (!isObj(value)) return null;

  // collapse {Tag: {Tag2: {...}}} wrapper chains, but never descend into a
  // scalar-only struct (keeps {String: {sval}} as a "String" node)
  let tag = label;
  let body = value;
  while (isObj(body) && !Array.isArray(body)) {
    const keys = Object.keys(body);
    if (keys.length !== 1 || !isObj(body[keys[0]])) break;
    tag = keys[0];
    body = body[keys[0]];
  }
  if (Array.isArray(body)) return walkFull(body, tag);
  if (!isObj(body) || Object.keys(body).length === 0) {
    return Object.keys(value).length === 0 ? null : mk(categorizeRaw(tag), tag, { raw: value });
  }

  const asTagged = { [tag]: body };
  let summary;
  if (LEAF_TAGS.has(tag) || ['A_Expr', 'BoolExpr', 'FuncCall', 'TypeCast', 'NullTest', 'ResTarget', 'SortBy', 'SubLink'].includes(tag)) {
    summary = deparse(asTagged);
    if (summary === tag) summary = '';
  }
  const scalars = Object.entries(body)
    .filter(([k, v]) => !isObj(v) && v !== null && v !== undefined && !NOISY_KEYS.has(k) && !DEFAULT_VALUES.has(`${k}=${v}`))
    .map(([k, v]) => `${k}: ${v}`);
  if (summary === undefined) summary = scalars.join(' · ');

  const node = mk(categorizeRaw(tag), tag, {
    summary,
    description: NODE_DESCRIPTIONS[tag] || '',
    items: scalars.length ? scalars : null,
    raw: value,
  });

  if (!LEAF_TAGS.has(tag)) {
    Object.entries(body).forEach(([k, v]) => {
      if (NOISY_KEYS.has(k) || !isObj(v)) return;
      const c = walkFull(v, k);
      if (c) node.children.push(c);
    });
  }
  return node;
}

export function buildFullModel(ast) {
  const roots = statementsOf(ast).map((s) => walkFull(s, 'stmt')).filter(Boolean);
  if (roots.length === 0) return mk('other', 'Empty query', { description: 'Nothing to show.', raw: ast });
  if (roots.length === 1) return roots[0];
  const root = mk('query', `${roots.length} statements`, { raw: ast });
  root.children = roots;
  return root;
}

// ── collapse + layout ───────────────────────────────────────────────────────

export function countNodes(model) {
  let c = 1;
  model.children.forEach((k) => { c += countNodes(k); });
  return c;
}

// Collapse every node at depth >= visibleDepth that has children.
export function defaultCollapsed(root, visibleDepth) {
  const set = new Set();
  (function visit(n, d) {
    if (n.children.length && d >= visibleDepth) { set.add(n.id); return; }
    n.children.forEach((k) => visit(k, d + 1));
  })(root, 0);
  return set;
}

// Pick a sensible starting depth so a big tree opens summarised, not sprawling.
export function autoVisibleDepth(model) {
  const total = countNodes(model);
  if (total <= 24) return Infinity;
  return total <= 70 ? 3 : 2;
}

export function findNode(root, id) {
  if (root.id === id) return root;
  for (const k of root.children) {
    const f = findNode(k, id);
    if (f) return f;
  }
  return null;
}

// Tidy tree: each parent is centred over its (visible) children, sibling
// subtrees never overlap. Collapsed nodes count as leaves.
export function layoutModel(root, collapsed, opts = {}) {
  const { nodeW = 220, nodeH = 96, gapX = 26, gapY = 54 } = opts;
  const widths = new Map();
  const hidden = new Map();

  const countDesc = (n) => n.children.reduce((s, k) => s + 1 + countDesc(k), 0);

  function measure(n) {
    const isCollapsed = collapsed.has(n.id);
    const kids = isCollapsed ? [] : n.children;
    let w = 0;
    kids.forEach((k, i) => { w += measure(k) + (i ? gapX : 0); });
    widths.set(n.id, Math.max(nodeW, w));
    if (isCollapsed && n.children.length) hidden.set(n.id, countDesc(n));
    return widths.get(n.id);
  }
  measure(root);

  const nodes = [];
  const edges = [];
  function place(n, left, depth, parentId) {
    const w = widths.get(n.id);
    nodes.push({ id: n.id, x: left + (w - nodeW) / 2, y: depth * (nodeH + gapY), model: n, depth });
    if (parentId) edges.push({ id: `e_${parentId}_${n.id}`, source: parentId, target: n.id });
    if (collapsed.has(n.id)) return;
    const kidsW = n.children.reduce((s, k, i) => s + widths.get(k.id) + (i ? gapX : 0), 0);
    let cursor = left + (w - kidsW) / 2;
    n.children.forEach((k) => {
      place(k, cursor, depth + 1, n.id);
      cursor += widths.get(k.id) + gapX;
    });
  }
  place(root, 0, 0, null);
  return { nodes, edges, hidden };
}
