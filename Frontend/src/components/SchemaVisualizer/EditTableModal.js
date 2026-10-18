import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { runQuery } from '../../utils/apiUtils';
import { COLUMN_TYPES } from '../../utils/schemaUtils';
import {
  dedupeColumns,
  buildSelectRowsSQL,
  buildUpdateSQL,
  buildDeleteSQL,
  buildInsertSQL,
  buildRenameTable,
  buildAddColumn,
  buildDropColumn,
  buildRenameColumn,
  buildChangeType,
  buildSetNotNull,
  buildDropTable,
} from '../../utils/sqlEdit';

// ALTER COLUMN ... TYPE can't use SERIAL (it's only valid when creating a column)
const CHANGE_TYPES = COLUMN_TYPES.filter((t) => t !== 'SERIAL');

const btn = (bg, color = '#ffffff') => ({
  padding: '5px 12px', border: 'none', borderRadius: 6, background: bg, color,
  fontSize: 12, fontWeight: 600, cursor: 'pointer',
});
const ghostBtn = { ...btn('#ffffff', '#334155'), border: '1px solid #cbd5e1' };
const inputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '4px 6px', border: '1px solid #cbd5e1',
  borderRadius: 4, fontSize: 12, fontFamily: 'inherit', background: '#ffffff',
};
const th = { padding: '6px 8px', textAlign: 'left', background: '#f1f5f9', borderBottom: '1px solid #cbd5e1', position: 'sticky', top: 0, whiteSpace: 'nowrap' };
const td = { padding: '3px 4px', borderBottom: '1px solid #f1f5f9' };

async function exec(sql) {
  const res = await runQuery(sql);
  if (!res.success) throw new Error(res.error || 'Query failed');
  return res;
}

function Messages({ error, notice }) {
  return (
    <>
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', padding: '8px 12px', borderRadius: 6, fontSize: 12, marginBottom: 10, wordBreak: 'break-word' }}>
          {error}
        </div>
      )}
      {notice && (
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', color: '#166534', padding: '8px 12px', borderRadius: 6, fontSize: 12, marginBottom: 10 }}>
          {notice}
        </div>
      )}
    </>
  );
}

// ── Data tab: edit / insert / delete rows ──────────────────────────────────

function DataTab({ table, columns }) {
  const colNames = useMemo(() => columns.map((c) => c.name), [columns]);
  const pkCols = useMemo(() => columns.filter((c) => c.constraints.includes('PRIMARY KEY')).map((c) => c.name), [columns]);
  const [rows, setRows] = useState([]);
  const [edits, setEdits] = useState({});
  const [newRow, setNewRow] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    if (!colNames.length) return;
    setLoading(true);
    try {
      const res = await exec(buildSelectRowsSQL(table, colNames, pkCols));
      setRows(res.rows || []);
      setEdits({});
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }, [table, colNames, pkCols]);

  useEffect(() => { load(); }, [load]);

  // Runs one statement. On success reloads; on failure keeps the user's
  // pending edits on screen so nothing they typed is lost.
  const run = async (sql, okMsg, expectRow = false) => {
    setError(null);
    setNotice(null);
    try {
      const res = await exec(sql);
      if (expectRow && res.rowCount === 0) {
        setError('No row matched — it may have been changed elsewhere. Showing the latest data.');
        await load();
        return false;
      }
      setNotice(okMsg);
      await load();
      return true;
    } catch (err) {
      setError(`${err.message}`);
      return false;
    }
  };

  const setCell = (i, col, value) => setEdits((prev) => ({ ...prev, [i]: { ...(prev[i] || {}), [col]: value } }));

  // only columns whose value actually differs from what was loaded; '' means NULL
  const changesOf = (i) => {
    const out = {};
    Object.entries(edits[i] || {}).forEach(([col, v]) => {
      const val = v === '' ? null : v;
      if (val !== rows[i][col]) out[col] = val;
    });
    return out;
  };

  const saveRow = (i) => run(buildUpdateSQL(table, pkCols, rows[i], changesOf(i)), 'Row saved.', true);

  const deleteRow = (i) => {
    if (!window.confirm('Delete this row? This cannot be undone.')) return;
    run(buildDeleteSQL(table, pkCols, rows[i]), 'Row deleted.', true);
  };

  const insertRow = async () => {
    if (await run(buildInsertSQL(table, newRow), 'Row inserted.')) setNewRow(null);
  };

  return (
    <div>
      <Messages error={error} notice={notice} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: '#64748b' }}>
          {loading ? 'Loading…' : `${rows.length} row${rows.length === 1 ? '' : 's'} shown (max 200)`}
          {' · '}
          {pkCols.length ? `rows identified by ${pkCols.join(', ')}` : 'no primary key — rows identified by physical row id'}
          {' · empty cell = NULL'}
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={ghostBtn} onClick={load}>↻ Reload</button>
          <button style={btn('#16a34a')} onClick={() => setNewRow({})} disabled={!!newRow}>+ Add row</button>
        </div>
      </div>

      <div style={{ overflow: 'auto', maxHeight: '46vh', border: '1px solid #e2e8f0', borderRadius: 8 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.name} style={th}>
                  {c.name}{c.constraints.includes('PRIMARY KEY') ? ' (PK)' : ''}
                  <div style={{ fontWeight: 400, color: '#94a3b8', fontSize: 10 }}>{c.type}</div>
                </th>
              ))}
              <th style={th} />
            </tr>
          </thead>
          <tbody>
            {newRow && (
              <tr style={{ background: '#f0fdf4' }}>
                {columns.map((c) => (
                  <td key={c.name} style={td}>
                    <input
                      style={inputStyle}
                      placeholder="default"
                      value={newRow[c.name] ?? ''}
                      onChange={(e) => setNewRow((r) => ({ ...r, [c.name]: e.target.value }))}
                    />
                  </td>
                ))}
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  <button style={btn('#16a34a')} onClick={insertRow}>Insert</button>{' '}
                  <button style={ghostBtn} onClick={() => setNewRow(null)}>Cancel</button>
                </td>
              </tr>
            )}
            {rows.map((row, i) => {
              const dirty = Object.keys(changesOf(i)).length > 0;
              return (
                <tr key={i} style={{ background: dirty ? '#fffbeb' : 'transparent' }}>
                  {columns.map((c) => (
                    <td key={c.name} style={td}>
                      <input
                        style={inputStyle}
                        placeholder={row[c.name] === null ? 'NULL' : ''}
                        value={edits[i] && edits[i][c.name] !== undefined ? edits[i][c.name] : (row[c.name] ?? '')}
                        onChange={(e) => setCell(i, c.name, e.target.value)}
                      />
                    </td>
                  ))}
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    <button style={{ ...btn('#2563eb'), opacity: dirty ? 1 : 0.4 }} disabled={!dirty} onClick={() => saveRow(i)}>Save</button>{' '}
                    <button style={btn('#dc2626')} onClick={() => deleteRow(i)}>Delete</button>
                  </td>
                </tr>
              );
            })}
            {!loading && rows.length === 0 && !newRow && (
              <tr><td colSpan={columns.length + 1} style={{ padding: 16, textAlign: 'center', color: '#94a3b8' }}>This table has no rows yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Structure tab: rename table, add / rename / retype / drop columns ─────

function StructureTab({ table, columns, onChanged, onRenamed, onDropped }) {
  const [renameTo, setRenameTo] = useState(table);
  const [colEdits, setColEdits] = useState({});
  const [newCol, setNewCol] = useState({ name: '', type: 'VARCHAR(100)', notNull: false, unique: false });
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setRenameTo(table); }, [table]);

  // Runs statements in order and stops at the first failure.
  const runAll = async (sqls, okMsg) => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      for (const sql of sqls) {
        // eslint-disable-next-line no-await-in-loop
        await exec(sql);
      }
      setNotice(okMsg);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const edit = (col, patch) => setColEdits((prev) => ({ ...prev, [col]: { ...(prev[col] || {}), ...patch } }));

  const isDirty = (c) => {
    const e = colEdits[c.name];
    return !!e && ((e.name && e.name !== c.name) || !!e.type || (e.notNull !== undefined && e.notNull !== !c.nullable));
  };

  const doRenameTable = async () => {
    let sql;
    try { sql = buildRenameTable(table, renameTo.trim()); } catch (err) { setError(err.message); return; }
    if (await runAll([sql], 'Table renamed.')) onRenamed(renameTo.trim());
  };

  const applyColumn = async (c) => {
    const e = colEdits[c.name] || {};
    const sqls = [];
    try {
      let current = c.name;
      if (e.name && e.name !== c.name) { sqls.push(buildRenameColumn(table, c.name, e.name)); current = e.name; }
      if (e.type) sqls.push(buildChangeType(table, current, e.type));
      if (e.notNull !== undefined && e.notNull !== !c.nullable) sqls.push(buildSetNotNull(table, current, e.notNull));
    } catch (err) { setError(err.message); return; }
    if (!sqls.length) return;
    if (await runAll(sqls, `Column "${c.name}" updated.`)) {
      setColEdits((prev) => { const n = { ...prev }; delete n[c.name]; return n; });
      onChanged();
    }
  };

  const dropColumn = async (c) => {
    if (!window.confirm(`Drop column "${c.name}"? Its data is deleted permanently.`)) return;
    if (await runAll([buildDropColumn(table, c.name)], `Column "${c.name}" dropped.`)) onChanged();
  };

  const addColumn = async () => {
    let sql;
    try { sql = buildAddColumn(table, newCol); } catch (err) { setError(err.message); return; }
    if (await runAll([sql], `Column "${newCol.name}" added.`)) {
      setNewCol({ name: '', type: 'VARCHAR(100)', notNull: false, unique: false });
      onChanged();
    }
  };

  const dropTable = async () => {
    if (!window.confirm(`Drop table "${table}" and ALL of its data? This cannot be undone.`)) return;
    if (await runAll([buildDropTable(table)], 'Table dropped.')) onDropped();
  };

  return (
    <div>
      <Messages error={error} notice={notice} />

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', whiteSpace: 'nowrap' }}>Table name</label>
        <input style={{ ...inputStyle, maxWidth: 260 }} value={renameTo} onChange={(e) => setRenameTo(e.target.value)} />
        <button style={btn('#2563eb')} disabled={busy || !renameTo.trim() || renameTo.trim() === table} onClick={doRenameTable}>Rename</button>
      </div>

      <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Columns</div>
      <div style={{ overflow: 'auto', maxHeight: '34vh', border: '1px solid #e2e8f0', borderRadius: 8 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
          <thead>
            <tr>
              <th style={th}>Name</th>
              <th style={th}>Type</th>
              <th style={th}>Change type to</th>
              <th style={th}>NOT NULL</th>
              <th style={th}>Constraints</th>
              <th style={th} />
            </tr>
          </thead>
          <tbody>
            {columns.map((c) => {
              const e = colEdits[c.name] || {};
              const isPk = c.constraints.includes('PRIMARY KEY');
              return (
                <tr key={c.name} style={{ background: isDirty(c) ? '#fffbeb' : 'transparent' }}>
                  <td style={td}><input style={inputStyle} value={e.name !== undefined ? e.name : c.name} onChange={(ev) => edit(c.name, { name: ev.target.value })} /></td>
                  <td style={{ ...td, color: '#475569', whiteSpace: 'nowrap' }}>{c.type}</td>
                  <td style={td}>
                    <select style={inputStyle} value={e.type || ''} onChange={(ev) => edit(c.name, { type: ev.target.value })}>
                      <option value="">(keep)</option>
                      {CHANGE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      disabled={isPk}
                      checked={isPk ? true : (e.notNull !== undefined ? e.notNull : !c.nullable)}
                      onChange={(ev) => edit(c.name, { notNull: ev.target.checked })}
                    />
                  </td>
                  <td style={{ ...td, color: '#64748b', fontSize: 11 }}>{c.constraints.join(', ')}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    <button style={{ ...btn('#2563eb'), opacity: isDirty(c) ? 1 : 0.4 }} disabled={busy || !isDirty(c)} onClick={() => applyColumn(c)}>Apply</button>{' '}
                    <button style={btn('#dc2626')} disabled={busy} onClick={() => dropColumn(c)}>Drop</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
        Primary-key and foreign-key changes aren't editable here — use the Query Runner for those.
        Changing a type converts existing values with a cast, which fails if they don't fit.
      </div>

      <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', margin: '16px 0 6px' }}>Add column</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input style={{ ...inputStyle, width: 170 }} placeholder="column_name" value={newCol.name} onChange={(e) => setNewCol((n) => ({ ...n, name: e.target.value }))} />
        <select style={{ ...inputStyle, width: 150 }} value={newCol.type} onChange={(e) => setNewCol((n) => ({ ...n, type: e.target.value }))}>
          {COLUMN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <label style={{ fontSize: 12 }}><input type="checkbox" checked={newCol.notNull} onChange={(e) => setNewCol((n) => ({ ...n, notNull: e.target.checked }))} /> NOT NULL</label>
        <label style={{ fontSize: 12 }}><input type="checkbox" checked={newCol.unique} onChange={(e) => setNewCol((n) => ({ ...n, unique: e.target.checked }))} /> UNIQUE</label>
        <button style={btn('#16a34a')} disabled={busy || !newCol.name.trim()} onClick={addColumn}>+ Add</button>
      </div>

      <div style={{ marginTop: 24, paddingTop: 14, borderTop: '1px solid #fecaca' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#991b1b', marginBottom: 6 }}>Danger zone</div>
        <button style={btn('#dc2626')} disabled={busy} onClick={dropTable}>Drop table “{table}”</button>
      </div>
    </div>
  );
}

// ── Modal shell ────────────────────────────────────────────────────────────

export function EditTableModal({ tableName, schemaData, onClose, onSchemaChanged }) {
  const [name, setName] = useState(tableName);
  const [tab, setTab] = useState('data');

  // hide ProvSQL's internal provenance column — it isn't user data
  const columns = useMemo(
    () => dedupeColumns(schemaData[name] || []).filter((c) => c.name !== 'provsql'),
    [schemaData, name]
  );

  const changed = () => onSchemaChanged({});
  const renamed = (newName) => { onSchemaChanged({ [name]: newName }); setName(newName); };
  const dropped = () => { onSchemaChanged({}, name); onClose(); };

  const tabStyle = (active) => ({
    padding: '8px 16px', border: 'none', background: 'transparent', cursor: 'pointer',
    fontSize: 13, fontWeight: 600, color: active ? '#2563eb' : '#64748b',
    borderBottom: `2px solid ${active ? '#2563eb' : 'transparent'}`,
  });

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(1000px, 94vw)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: 12, boxShadow: '0 20px 50px rgba(0,0,0,0.3)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px 0' }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Edit table: <code>{name}</code></h3>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: 22, cursor: 'pointer', color: '#64748b' }} aria-label="Close">×</button>
        </div>
        <div style={{ display: 'flex', gap: 4, padding: '0 14px', borderBottom: '1px solid #e2e8f0' }}>
          <button style={tabStyle(tab === 'data')} onClick={() => setTab('data')}>Data</button>
          <button style={tabStyle(tab === 'structure')} onClick={() => setTab('structure')}>Structure</button>
        </div>
        <div style={{ padding: '16px 20px 20px', overflowY: 'auto' }}>
          {columns.length === 0 ? (
            <div style={{ color: '#94a3b8', fontSize: 13 }}>Loading table definition…</div>
          ) : tab === 'data' ? (
            <DataTab table={name} columns={columns} />
          ) : (
            <StructureTab table={name} columns={columns} onChanged={changed} onRenamed={renamed} onDropped={dropped} />
          )}
        </div>
      </div>
    </div>
  );
}
