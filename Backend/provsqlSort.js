// Client-side ORDER BY fallback for the ProvSQL tab.
//
// ProvSQL rewrites queries inside Postgres and refuses some shapes — notably
// ORDER BY on an aggregate result ("ORDER BY on the result of an aggregate
// function is not supported"). Since sorting only changes row ORDER (not
// which rows exist or their provenance tokens), we can run the query without
// its ORDER BY / LIMIT / OFFSET and apply them here, on the returned rows.
// The query is read structurally through the libpg_query AST, not with regexes.

// The single top-level SELECT of a parse result, or null (several statements,
// non-SELECT, unrecognised shape).
function topSelect(parsed) {
  let list = parsed;
  if (list && !Array.isArray(list) && Array.isArray(list.stmts)) list = list.stmts;
  if (!Array.isArray(list) || list.length !== 1) return null;
  let s = list[0];
  if (s && s.RawStmt) s = s.RawStmt;
  if (s && s.stmt) s = s.stmt;
  if (s && s.SelectStmt) {
    s = s.SelectStmt;
    if (s.SelectStmt) s = s.SelectStmt; // some builds double-wrap
    return s;
  }
  return null;
}

function stripLoc(n) {
  if (Array.isArray(n)) return n.map(stripLoc);
  if (n && typeof n === 'object') {
    const o = {};
    Object.keys(n).forEach((k) => { if (k !== 'location') o[k] = stripLoc(n[k]); });
    return o;
  }
  return n;
}

// Smallest source offset found anywhere inside a node (Infinity if none).
function minLoc(n) {
  let m = Infinity;
  (function walk(x) {
    if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === 'object') {
      Object.keys(x).forEach((k) => {
        if (k === 'location' && typeof x[k] === 'number' && x[k] >= 0) m = Math.min(m, x[k]);
        else walk(x[k]);
      });
    }
  }(n));
  return m;
}

// Integer value of an A_Const node (modern or legacy libpg_query shape), else null.
function constInt(n) {
  const c = n && n.A_Const;
  if (!c) return null;
  if (c.ival) return c.ival.ival ?? 0;
  if (c.val && c.val.Integer) return c.val.Integer.ival ?? 0;
  return null;
}

const identOf = (f) => (f && f.String ? (f.String.sval ?? f.String.str) : undefined);

// Which output column does an ORDER BY item refer to?
// Handles: ordinals (ORDER BY 2), output names/aliases (ORDER BY n),
// and expressions that also appear in the SELECT list (ORDER BY COUNT(*)).
function resolveSortColumn(node, targets, fieldNames) {
  const n = stripLoc(node);
  const ord = constInt(n);
  if (ord !== null) return fieldNames[ord - 1] || null;

  const parts = n.ColumnRef ? (n.ColumnRef.fields || []).map(identOf) : null;
  if (parts && parts.length === 1 && parts[0] && fieldNames.includes(parts[0])) return parts[0];

  const hasStar = targets.some((t) => {
    const v = t.ResTarget && t.ResTarget.val;
    return v && v.ColumnRef && (v.ColumnRef.fields || []).some((f) => f.A_Star);
  });
  if (!hasStar) {
    const key = JSON.stringify(n);
    for (let i = 0; i < targets.length; i += 1) {
      const v = targets[i].ResTarget && targets[i].ResTarget.val;
      if (v && JSON.stringify(stripLoc(v)) === key) return fieldNames[i] || null;
    }
  }
  if (parts && parts.length > 1) {
    const last = parts[parts.length - 1];
    if (last && fieldNames.includes(last)) return last;
  }
  return null;
}

// Decides whether the ORDER BY can be moved out of the SQL. Returns
// { base, sel, limit, offset } — `base` is the query text without ORDER BY /
// LIMIT / OFFSET — or null when it can't be done safely.
function planClientSort(sql, parsed) {
  const sel = topSelect(parsed);
  if (!sel || !sel.sortClause || sel.sortClause.length === 0) return null;

  const limit = sel.limitCount ? constInt(sel.limitCount) : null;
  const offset = sel.limitOffset ? constInt(sel.limitOffset) : null;
  if (sel.limitCount && limit === null) return null;   // LIMIT ALL / expression: don't guess
  if (sel.limitOffset && offset === null) return null;

  const loc = minLoc(sel.sortClause[0]);
  if (!Number.isFinite(loc)) return null;
  // locations are byte offsets into the UTF-8 text
  const head = Buffer.from(sql, 'utf8').slice(0, loc).toString('utf8');
  const matches = [...head.matchAll(/\border\s+by\b/gi)];
  if (matches.length === 0) return null;
  const base = head.slice(0, matches[matches.length - 1].index).trim();
  return base ? { base, sel, limit, offset } : null;
}

function compareValues(a, b) {
  const na = Number(a);
  const nb = Number(b);
  if (a !== '' && b !== '' && !Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return String(a).localeCompare(String(b));
}

// Sorts + slices `rows` per the plan. Returns null if an ORDER BY item can't
// be mapped to an output column.
function applyClientSort(plan, rows, fieldNames) {
  const { sel, limit, offset } = plan;
  const keys = [];
  for (const item of sel.sortClause) {
    const sb = item.SortBy || item;
    const col = resolveSortColumn(sb.node, sel.targetList || [], fieldNames);
    if (!col) return null;
    keys.push({ col, desc: sb.sortby_dir === 'SORTBY_DESC', nulls: sb.sortby_nulls });
  }

  const sorted = [...rows].sort((r1, r2) => {
    for (const k of keys) {
      const a = r1[k.col];
      const b = r2[k.col];
      const an = a === null || a === undefined;
      const bn = b === null || b === undefined;
      if (an || bn) {
        if (an && bn) continue;
        // Postgres default: NULLS LAST for ASC, NULLS FIRST for DESC
        const nullsFirst = k.nulls === 'SORTBY_NULLS_FIRST' ? true : k.nulls === 'SORTBY_NULLS_LAST' ? false : k.desc;
        return an ? (nullsFirst ? -1 : 1) : (nullsFirst ? 1 : -1);
      }
      const c = compareValues(a, b);
      if (c !== 0) return k.desc ? -c : c;
    }
    return 0;
  });

  const start = offset || 0;
  return limit === null ? sorted.slice(start) : sorted.slice(start, start + limit);
}

module.exports = { topSelect, stripLoc, minLoc, constInt, resolveSortColumn, planClientSort, applyClientSort };
