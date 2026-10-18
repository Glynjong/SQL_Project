import React, { useState, useEffect, useMemo } from 'react';
import { runQuery } from '../../utils/apiUtils';
import {
  dedupeColumns, buildLinkChecks, planLink, buildAddPrimaryKey, buildAddUnique, buildAddForeignKey,
} from '../../utils/sqlEdit';

const btn = (bg, color = '#ffffff') => ({
  padding: '8px 16px', border: 'none', borderRadius: 6, background: bg, color,
  fontSize: 13, fontWeight: 600, cursor: 'pointer',
});
const ghostBtn = { ...btn('#ffffff', '#334155'), border: '1px solid #cbd5e1' };
const selectStyle = {
  width: '100%', boxSizing: 'border-box', padding: '7px 8px', border: '1px solid #cbd5e1',
  borderRadius: 6, fontSize: 13, fontFamily: 'inherit', background: '#ffffff',
};
const label = { fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 };

async function one(sql) {
  const res = await runQuery(sql);
  if (!res.success) throw new Error(res.error || 'Query failed');
  return res.rows || [];
}

const friendly = (msg) =>
  /operator does not exist/i.test(msg)
    ? "These two columns have different types that can't be compared, so they can't be linked. Pick columns of the same kind (e.g. text with text, integer with integer)."
    : msg;

export function LinkTablesModal({ source, target, schemaData, onClose, onLinked }) {
  // Dragging goes from the table that will hold the reference to the table it points at.
  const [child, setChild] = useState(source);
  const [parent, setParent] = useState(target);
  const colsOf = (t) => dedupeColumns(schemaData[t] || []).filter((c) => c.name !== 'provsql');
  const childCols = useMemo(() => colsOf(child), [child, schemaData]); // eslint-disable-line react-hooks/exhaustive-deps
  const parentCols = useMemo(() => colsOf(parent), [parent, schemaData]); // eslint-disable-line react-hooks/exhaustive-deps

  const guess = (cols, other) => (cols.find((c) => other.some((o) => o.name === c.name)) || cols[0] || {}).name || '';
  const [childCol, setChildCol] = useState(() => guess(colsOf(source), colsOf(target)));
  const [parentCol, setParentCol] = useState(() => guess(colsOf(target), colsOf(source)));

  const [state, setState] = useState({ status: 'idle' }); // idle | checking | done | error
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const swap = () => {
    setChild(parent); setParent(child); setChildCol(parentCol); setParentCol(childCol);
  };
  const changeChild = (t) => { setChild(t); setChildCol(guess(colsOf(t), colsOf(parent))); };
  const changeParent = (t) => { setParent(t); setParentCol(guess(colsOf(t), colsOf(child))); };

  // Re-check whenever the selection changes.
  useEffect(() => {
    if (!childCol || !parentCol) { setState({ status: 'idle' }); return undefined; }
    let cancelled = false;
    setState({ status: 'checking' });
    setError('');
    (async () => {
      try {
        const q = buildLinkChecks({ child, childCol, parent, parentCol });
        const [uniq, hasPk, stats, dupSample, orphans, orphanSample, existing] = await Promise.all([
          one(q.parentUnique), one(q.parentHasPk), one(q.parentStats), one(q.parentDupSample),
          one(q.orphans), one(q.orphanSample), one(q.existing),
        ]);
        if (cancelled) return;
        const numbers = {
          isUnique: uniq[0] && uniq[0].is_pk !== null && uniq[0].is_pk !== undefined,
          isPk: !!(uniq[0] && uniq[0].is_pk === true),
          hasPk: Number(hasPk[0].n) > 0,
          total: Number(stats[0].total), nulls: Number(stats[0].nulls), dups: Number(stats[0].dups),
          orphans: Number(orphans[0].n), existing: Number(existing[0].n),
        };
        setState({
          status: 'done', stats: numbers, plan: planLink(numbers),
          dupSample: dupSample.map((r) => r.value), orphanSample: orphanSample.map((r) => r.value),
        });
      } catch (e) {
        if (!cancelled) setState({ status: 'error', message: friendly(e.message) });
      }
    })();
    return () => { cancelled = true; };
  }, [child, childCol, parent, parentCol]);

  const plan = state.status === 'done' ? state.plan : null;
  const canCreate = !!plan && plan.ok && !busy;

  const steps = [];
  if (plan && plan.fix === 'pk') steps.push(buildAddPrimaryKey(parent, parentCol));
  if (plan && plan.fix === 'unique') steps.push(buildAddUnique(parent, parentCol));
  steps.push(buildAddForeignKey({ child, childCol, parent, parentCol }));

  const create = async () => {
    if (!canCreate) return;
    setBusy(true); setError('');
    try {
      // One request = one transaction: if the link fails, the key isn't added either.
      const res = await runQuery(steps.join(';\n'));
      if (!res.success) throw new Error(res.error || 'Could not create the link');
      await onLinked();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const tableNames = Object.keys(schemaData);
  const colType = (cols, name) => (cols.find((c) => c.name === name) || {}).type || '';

  const renderSide = ({ title, hint, table, onTable, cols, col, onCol }) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={label}>{title}</div>
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>{hint}</div>
      <select style={{ ...selectStyle, marginBottom: 8, fontWeight: 600 }} value={table} onChange={(e) => onTable(e.target.value)} disabled={busy}>
        {tableNames.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <select style={selectStyle} value={col} onChange={(e) => onCol(e.target.value)} disabled={busy}>
        {cols.map((c) => <option key={c.name} value={c.name}>{c.name} ({c.type})</option>)}
      </select>
    </div>
  );

  const box = (bg, border, color) => ({ background: bg, border: `1px solid ${border}`, color, padding: '10px 12px', borderRadius: 6, fontSize: 12, lineHeight: 1.55, marginTop: 12, wordBreak: 'break-word' });
  const sample = (vals) => (vals && vals.length ? ` (e.g. ${vals.map((v) => `"${v}"`).join(', ')})` : '');

  return (
    <div onClick={busy ? undefined : onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(620px, 94vw)', maxHeight: '90vh', overflowY: 'auto', background: '#fff', borderRadius: 12, boxShadow: '0 20px 50px rgba(0,0,0,0.3)', padding: '20px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Link tables (foreign key)</h3>
          <button onClick={onClose} disabled={busy} style={{ border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer', color: '#64748b' }} aria-label="Close">×</button>
        </div>
        <p style={{ margin: '0 0 14px', fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
          Pick the matching column on each side. This creates a real foreign key: Postgres will then only allow values in the
          first column that exist in the second.
        </p>

        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          {renderSide({ title: "References from", hint: "holds the link", table: child, onTable: changeChild, cols: childCols, col: childCol, onCol: setChildCol })}
          <button onClick={swap} disabled={busy} title="Swap direction" style={{ ...ghostBtn, padding: '7px 10px', marginBottom: 1 }}>⇄</button>
          {renderSide({ title: "Points to", hint: "the key it refers to", table: parent, onTable: changeParent, cols: parentCols, col: parentCol, onCol: setParentCol })}
        </div>

        {state.status === 'checking' && <div style={box('#f8fafc', '#e2e8f0', '#64748b')}>Checking the data…</div>}
        {state.status === 'error' && <div style={box('#fef2f2', '#fca5a5', '#991b1b')}>{state.message}</div>}

        {plan && plan.blockers.length > 0 && (
          <div style={box('#fef2f2', '#fca5a5', '#991b1b')}>
            <strong>Can't link these columns yet</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {plan.blockers.map((b, i) => <li key={i}>{b}</li>)}
              {state.dupSample.length > 0 && !state.stats.isUnique && <li>Repeated values{sample(state.dupSample)}.</li>}
              {state.stats.orphans > 0 && <li>Values with no match{sample(state.orphanSample)}. Fix or remove those rows, then try again.</li>}
            </ul>
            <div style={{ marginTop: 8, color: '#7f1d1d' }}>
              To combine such tables without a foreign key, use a JOIN in the Query Runner.
            </div>
          </div>
        )}

        {plan && plan.ok && plan.fix && (
          <div style={box('#fffbeb', '#fcd34d', '#92400e')}>
            <strong>{parent}.{parentCol} isn't a key yet.</strong> Its {state.stats.total} value{state.stats.total === 1 ? ' is' : 's are'} all unique and filled in,
            so it can be made one. Creating the link will first add {plan.fix === 'pk' ? <>a <strong>PRIMARY KEY</strong> (the table has none)</> : <>a <strong>UNIQUE</strong> constraint (the table already has a different primary key)</>} on <code>{parentCol}</code>.
            New rows with a repeated <code>{parentCol}</code> will be rejected from now on.
          </div>
        )}

        {plan && plan.ok && colType(childCols, childCol) !== colType(parentCols, parentCol) && (
          <div style={box('#f8fafc', '#e2e8f0', '#475569')}>
            Note: the column types differ ({colType(childCols, childCol)} vs {colType(parentCols, parentCol)}) but are compatible.
          </div>
        )}

        {plan && plan.ok && (
          <div style={box('#f0fdf4', '#86efac', '#166534')}>
            <strong>Ready.</strong> Every value in <code>{child}.{childCol}</code> exists in <code>{parent}.{parentCol}</code>. This will run:
            <pre style={{ margin: '6px 0 0', fontSize: 11, whiteSpace: 'pre-wrap', color: '#14532d' }}>{steps.join(';\n')};</pre>
          </div>
        )}

        {error && <div style={box('#fef2f2', '#fca5a5', '#991b1b')}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button style={ghostBtn} onClick={onClose} disabled={busy}>Cancel</button>
          <button style={{ ...btn('#16a34a'), opacity: canCreate ? 1 : 0.5, cursor: canCreate ? 'pointer' : 'not-allowed' }} disabled={!canCreate} onClick={create}>
            {busy ? 'Linking…' : plan && plan.fix ? `Add ${plan.fix === 'pk' ? 'key' : 'unique'} & link` : 'Create link'}
          </button>
        </div>
      </div>
    </div>
  );
}
