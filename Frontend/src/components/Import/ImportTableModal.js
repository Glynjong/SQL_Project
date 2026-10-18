import React, { useState, useMemo, useRef } from 'react';
import { runQuery } from '../../utils/apiUtils';
import { buildDropTable } from '../../utils/sqlEdit';
import {
  MAX_FILE_BYTES, parseCSV, buildDataset, suggestTableName, validateImport,
  buildCreateTableSQL, buildInsertChunks,
} from '../../utils/csvImport';

const IMPORT_TYPES = ['INTEGER', 'BIGINT', 'NUMERIC', 'TEXT', 'BOOLEAN', 'DATE', 'TIMESTAMP'];
const PREVIEW_ROWS = 8;

const btn = (bg, color = '#ffffff') => ({
  padding: '7px 16px', border: 'none', borderRadius: 6, background: bg, color,
  fontSize: 13, fontWeight: 600, cursor: 'pointer',
});
const ghostBtn = { ...btn('#ffffff', '#334155'), border: '1px solid #cbd5e1' };
const inputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '4px 6px', border: '1px solid #cbd5e1',
  borderRadius: 4, fontSize: 12, fontFamily: 'inherit', background: '#ffffff',
};
const th = { padding: '6px 8px', textAlign: 'left', background: '#f1f5f9', borderBottom: '1px solid #cbd5e1', whiteSpace: 'nowrap', verticalAlign: 'top' };
const td = { padding: '4px 8px', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' };

async function exec(sql) {
  const res = await runQuery(sql);
  if (!res.success) throw new Error(res.error || 'Query failed');
  return res;
}

export function ImportTableModal({ open, existingTables, onClose, onImported }) {
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState(null); // raw parsed rows
  const [hasHeader, setHasHeader] = useState(true);
  const [tableName, setTableName] = useState('');
  const [columns, setColumns] = useState([]);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const fileRef = useRef(null);

  const problems = useMemo(
    () => (columns.length ? validateImport({ tableName, columns, existingTables }) : []),
    [tableName, columns, existingTables]
  );

  if (!open) return null;

  const reset = () => {
    setFileName(''); setParsed(null); setColumns([]); setRows([]); setTableName('');
    setError(''); setProgress(''); setHasHeader(true);
    if (fileRef.current) fileRef.current.value = '';
  };
  const close = () => { if (!busy) { reset(); onClose(); } };

  const applyParsed = (raw, header) => {
    try {
      const ds = buildDataset(raw, { hasHeader: header });
      setColumns(ds.columns); setRows(ds.rows); setError('');
    } catch (e) {
      setColumns([]); setRows([]); setError(e.message);
    }
  };

  const onFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setError('');
    if (file.size > MAX_FILE_BYTES) {
      setError(`File is too large (${(file.size / 1048576).toFixed(1)} MB); the limit is ${MAX_FILE_BYTES / 1048576} MB.`);
      return;
    }
    try {
      const text = await file.text();
      const { rows: raw } = parseCSV(text);
      setFileName(file.name); setParsed(raw); setTableName(suggestTableName(file.name));
      applyParsed(raw, hasHeader);
    } catch (err) {
      setError(`Could not read the file: ${err.message}`);
    }
  };

  const toggleHeader = (v) => {
    setHasHeader(v);
    if (parsed) applyParsed(parsed, v);
  };

  const setCol = (i, patch) => setColumns((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  const doImport = async () => {
    if (problems.length || busy) return;
    setBusy(true); setError('');
    let created = false;
    try {
      setProgress('Creating table…');
      await exec(buildCreateTableSQL(tableName, columns));
      created = true;
      const chunks = buildInsertChunks(tableName, columns, rows);
      for (let i = 0; i < chunks.length; i++) {
        setProgress(`Loading rows… (${i + 1}/${chunks.length})`);
        await exec(chunks[i]);
      }
      setProgress('');
      const name = tableName, count = rows.length;
      reset();
      await onImported(name, count);
    } catch (err) {
      let msg = err.message;
      if (created) {
        try { await exec(buildDropTable(tableName)); msg += ' — the import was rolled back (table removed).'; }
        catch { msg += ` — the partial table "${tableName}" could not be removed; drop it manually.`; }
      }
      setError(msg); setProgress('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onClick={close}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 10, width: 'min(860px, 94vw)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 50px rgba(0,0,0,0.3)' }}
      >
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ fontSize: 15 }}>Import table from CSV</strong>
          <button style={{ ...ghostBtn, padding: '3px 10px' }} onClick={close} disabled={busy}>✕</button>
        </div>

        <div style={{ padding: 18, overflow: 'auto', fontSize: 13 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
            <input
              ref={fileRef}
              id="import-csv-file"
              type="file"
              accept=".csv,.tsv,.txt,text/csv"
              onChange={onFile}
              disabled={busy}
              style={{ display: 'none' }}
            />
            <label
              htmlFor="import-csv-file"
              style={{ ...btn('#2563eb'), display: 'inline-flex', alignItems: 'center', gap: 6, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.5 : 1 }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 11V2" /><path d="M4.5 5.5L8 2l3.5 3.5" /><path d="M2 11v2a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-2" />
              </svg>
              {fileName ? 'Choose another file' : 'Choose CSV file'}
            </label>
            <span style={{ fontSize: 12, color: fileName ? '#334155' : '#94a3b8', fontFamily: "'IBM Plex Mono', monospace", maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={fileName}>
              {fileName || 'No file chosen'}
            </span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={hasHeader} onChange={(e) => toggleHeader(e.target.checked)} disabled={busy} />
              First row is a header
            </label>
          </div>

          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', padding: '8px 12px', borderRadius: 6, fontSize: 12, marginBottom: 12, wordBreak: 'break-word' }}>
              {error}
            </div>
          )}

          {!columns.length && !error && (
            <div style={{ color: '#64748b', fontSize: 12, lineHeight: 1.6 }}>
              Choose a CSV file (comma, semicolon, tab or pipe separated). You can review and edit the table name,
              column names and types before anything is created. Empty cells become NULL; values like <code>01234</code> stay text.
            </div>
          )}

          {columns.length > 0 && (
            <>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
                <label style={{ fontWeight: 600 }}>Table name</label>
                <input style={{ ...inputStyle, width: 240 }} value={tableName} onChange={(e) => setTableName(e.target.value)} disabled={busy} />
                <span style={{ color: '#64748b', fontSize: 12 }}>{fileName} · {rows.length} rows · {columns.length} columns</span>
              </div>

              <div style={{ overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 6, maxHeight: 340 }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
                  <thead>
                    <tr>
                      {columns.map((c, i) => (
                        <th key={i} style={th}>
                          <input style={{ ...inputStyle, marginBottom: 4, fontWeight: 600 }} value={c.name} disabled={busy} onChange={(e) => setCol(i, { name: e.target.value })} />
                          <select style={inputStyle} value={c.type} disabled={busy} onChange={(e) => setCol(i, { type: e.target.value })}>
                            {IMPORT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, PREVIEW_ROWS).map((r, ri) => (
                      <tr key={ri}>
                        {columns.map((_, ci) => (
                          <td key={ci} style={td} title={r[ci]}>
                            {r[ci] === '' ? <span style={{ color: '#94a3b8' }}>NULL</span> : r[ci]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > PREVIEW_ROWS && (
                <div style={{ color: '#64748b', fontSize: 11, marginTop: 4 }}>Showing the first {PREVIEW_ROWS} of {rows.length} rows.</div>
              )}

              {problems.length > 0 && (
                <ul style={{ color: '#b45309', fontSize: 12, margin: '10px 0 0', paddingLeft: 18 }}>
                  {problems.map((p, i) => <li key={i}>{p}</li>)}
                </ul>
              )}
            </>
          )}
        </div>

        <div style={{ padding: '12px 18px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10 }}>
          {progress && <span style={{ color: '#64748b', fontSize: 12, marginRight: 'auto' }}>{progress}</span>}
          <button style={ghostBtn} onClick={close} disabled={busy}>Cancel</button>
          <button
            style={{ ...btn('#2563eb'), opacity: columns.length && !problems.length && !busy ? 1 : 0.5 }}
            disabled={!columns.length || problems.length > 0 || busy}
            onClick={doImport}
          >
            {busy ? 'Importing…' : `Import ${rows.length ? rows.length + ' rows' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
