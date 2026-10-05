// Pure helpers for the ProvSQL "who is responsible" pie chart (no React).

const MAX_VISITS = 50000; // safety valve for pathological, heavily-shared circuits

const trunc = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function rowSummary(row) {
  const vals = Object.values(row || {}).filter((v) => v !== null && v !== undefined && v !== '');
  return trunc(vals.slice(0, 3).map(String).join(', '), 42);
}

// Usage-weighted, approximate Shapley attribution over TUPLE OCCURRENCES.
//
// Starting at the result gate with a total share of 1, every gate splits its
// share equally between its children (the closed form for read-once AND/OR
// formulas — Livshits, Bertossi, Kimelfeld), and each INPUT leaf collects what
// reaches it. Crucially, shares are keyed by TUPLE, not by table, and a tuple
// that feeds the result through several paths (e.g. a self-join, or a shared
// sub-expression) is counted once per occurrence — so it carries a
// proportionally larger share. That is a usage-weighted variant: an exact
// Shapley value would treat a repeated tuple as a single player.
// Constant gates (value / one / zero) receive no credit. MONUS/AGG gates are
// split the same way, which is a pragmatic approximation.
export async function computeShapleyByTuple(rootId, rawNodes, rawEdges, lookupTokenFn) {
  const gateType = new Map((rawNodes || []).map((n) => [n.id, n.gateType]));
  const childrenOf = new Map();
  (rawEdges || []).forEach((e) => {
    if (!childrenOf.has(e.source)) childrenOf.set(e.source, []);
    childrenOf.get(e.source).push(e.target);
  });

  // Constants (a HAVING threshold, the semiring's neutral elements) are not
  // tuples, so they must not soak up credit. A subtree "carries provenance"
  // if it contains an INPUT leaf — or an operator gate that was cut off by
  // the depth limit (we can't see inside it, so it stays in the pie as
  // "not expanded").
  const CONSTANTS = new Set(['value', 'one', 'zero']);
  const carriesMemo = new Map();
  const carries = (id) => {
    if (carriesMemo.has(id)) return carriesMemo.get(id);
    const type = gateType.get(id) || 'input';
    const kids = childrenOf.get(id) || [];
    let result;
    if (kids.length === 0) result = !CONSTANTS.has(type);
    else result = kids.some(carries);
    carriesMemo.set(id, result);
    return result;
  };

  if (!carries(rootId)) return []; // a result made only of constants has no tuples to credit

  const leaf = new Map();
  let visits = 0;
  (function recurse(id, allocated) {
    visits += 1;
    if (visits > MAX_VISITS) return;
    const kids = childrenOf.get(id) || [];
    if (kids.length === 0) {
      const cur = leaf.get(id) || { share: 0, occurrences: 0 };
      cur.share += allocated;
      cur.occurrences += 1;
      leaf.set(id, cur);
      return;
    }
    const live = kids.filter(carries);          // split only among tuple-carrying children
    if (live.length === 0) return;
    const each = allocated / live.length;
    live.forEach((k) => recurse(k, each));
  }(rootId, 1));

  const total = [...leaf.values()].reduce((s, v) => s + v.share, 0) || 1;
  const entries = [];
  // Sequential on purpose: leaf counts are small and this keeps load on the
  // lookup endpoint light.
  for (const [id, { share, occurrences }] of leaf.entries()) {
    const type = gateType.get(id) || 'input';
    if (type !== 'input') {
      entries.push({
        id, table: `${type} gate`, detail: 'not expanded (depth limit)',
        share: share / total, occurrences, gateType: type,
      });
    } else {
      // eslint-disable-next-line no-await-in-loop
      const res = await lookupTokenFn(id);
      entries.push(res && res.found
        ? { id, table: res.table, detail: rowSummary(res.row), share: share / total, occurrences, gateType: 'input' }
        : { id, table: 'unresolved', detail: `${id.slice(0, 8)}…`, share: share / total, occurrences, gateType: 'input' });
    }
  }
  return entries.sort((a, b) => b.share - a.share);
}

// Groups tuple entries under their parent table: [{ table, share, occurrences, tuples }],
// tables ordered by combined share (biggest first), tuples inside each table likewise.
export function groupByTable(entries) {
  const map = new Map();
  entries.forEach((e) => {
    if (!map.has(e.table)) map.set(e.table, { table: e.table, share: 0, occurrences: 0, tuples: [] });
    const g = map.get(e.table);
    g.share += e.share;
    g.occurrences += e.occurrences;
    g.tuples.push(e);
  });
  const groups = [...map.values()];
  groups.forEach((g) => g.tuples.sort((a, b) => b.share - a.share));
  return groups.sort((a, b) => b.share - a.share || a.table.localeCompare(b.table));
}

// Turns entries into pie slices with angles. Anything beyond `maxSlices - 1`
// is folded into one "Other" slice so a big aggregate stays readable. By
// default slices are ordered biggest-first; with keepOrder the caller's order
// is preserved (used to keep each table's slices side by side).
export function buildPieSlices(entries, maxSlices = 9, { keepOrder = false } = {}) {
  const byShare = [...entries].sort((a, b) => b.share - a.share);
  let shown;
  if (entries.length > maxSlices) {
    const keepIds = new Set(byShare.slice(0, maxSlices - 1).map((e) => e.id));
    const rest = entries.filter((e) => !keepIds.has(e.id));
    const head = keepOrder ? entries.filter((e) => keepIds.has(e.id)) : byShare.slice(0, maxSlices - 1);
    shown = [...head, {
      id: '__other', table: 'Other', detail: `${rest.length} more tuples`,
      share: rest.reduce((sum, e) => sum + e.share, 0),
      occurrences: rest.reduce((sum, e) => sum + e.occurrences, 0), gateType: 'other',
    }];
  } else {
    shown = keepOrder ? [...entries] : byShare;
  }
  const total = shown.reduce((sum, e) => sum + e.share, 0) || 1;
  let angle = -Math.PI / 2;
  return shown.map((e, index) => {
    const frac = e.share / total;
    const startAngle = angle;
    const endAngle = angle + frac * 2 * Math.PI;
    angle = endAngle;
    return { ...e, index, frac, startAngle, endAngle };
  });
}

// SVG path for one wedge; null means "full circle" (draw a <circle> instead).
export function arcPath(cx, cy, r, start, end) {
  if (end - start >= 2 * Math.PI - 1e-6) return null;
  const x1 = cx + r * Math.cos(start);
  const y1 = cy + r * Math.sin(start);
  const x2 = cx + r * Math.cos(end);
  const y2 = cy + r * Math.sin(end);
  return `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${end - start > Math.PI ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
}
