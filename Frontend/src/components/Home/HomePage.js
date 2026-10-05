import React, { useState } from 'react';
import { runQuery } from '../../utils/apiUtils';
import { SHOWCASE, ALL_EXAMPLES } from '../../data/showcaseQueries';

// ── tiny SQL highlighter ────────────────────────────────────────────────────
const KEYWORDS = [
  'WITH RECURSIVE', 'GROUP BY', 'ORDER BY', 'PARTITION BY', 'UNION ALL', 'SELECT', 'FROM', 'WHERE',
  'JOIN', 'ON', 'HAVING', 'LIMIT', 'WITH', 'AS', 'OVER', 'AND', 'OR', 'NOT', 'LIKE', 'DISTINCT',
  'DESC', 'ASC', 'COUNT', 'MAX', 'MIN', 'AVG', 'SUM', 'RANK', 'ROW_NUMBER', 'ROUND',
];
const TOKEN = new RegExp(
  `('[^']*'|--[^\\n]*|\\b\\d+(?:\\.\\d+)?\\b|\\b(?:${KEYWORDS.map((k) => k.replace(/ /g, '\\s+')).join('|')})\\b)`,
  'gi'
);

function Sql({ text }) {
  // split() with one capture group puts the matched tokens at odd indexes
  return (
    <>
      {text.split(TOKEN).map((part, i) => {
        if (i % 2 === 0) return part;
        let style = { color: '#4f46e5', fontWeight: 700 };
        if (part.startsWith("'")) style = { color: '#059669' };
        else if (part.startsWith('--')) style = { color: '#94a3b8', fontStyle: 'italic' };
        else if (/^\d/.test(part)) style = { color: '#d97706' };
        return <span key={i} style={style}>{part}</span>;
      })}
    </>
  );
}

function ResultTable({ rows }) {
  if (rows.length === 0) return <div style={{ fontSize: 12, color: '#64748b', padding: '8px 0' }}>0 rows.</div>;
  const cols = Object.keys(rows[0]);
  const shown = rows.slice(0, 50);
  return (
    <div style={{ overflow: 'auto', maxHeight: 280, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c} style={{ textAlign: 'left', padding: '6px 10px', background: '#f1f5f9', borderBottom: '1px solid #cbd5e1', position: 'sticky', top: 0 }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r, i) => (
            <tr key={i}>
              {cols.map((c) => (
                <td key={c} style={{ padding: '5px 10px', borderBottom: '1px solid #f1f5f9' }}>
                  {r[c] === null || r[c] === undefined ? <em style={{ color: '#94a3b8' }}>NULL</em> : String(r[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const smallBtn = (bg, color = '#fff', border = 'none') => ({
  padding: '6px 12px', background: bg, color, border, borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
});

// ── page ────────────────────────────────────────────────────────────────────
export function HomePage({ onOpenInAnalyzer, onOpenInRunner }) {
  // runs: exampleId -> { status: 'running' | 'ok' | 'error', rows?, error?, ms? }
  const [runs, setRuns] = useState({});
  const [runningAll, setRunningAll] = useState(false);
  const [copied, setCopied] = useState(null);

  const setRun = (id, value) => setRuns((r) => ({ ...r, [id]: value }));

  const run = async (ex) => {
    setRun(ex.id, { status: 'running' });
    const started = Date.now();
    try {
      const res = await runQuery(ex.sql);
      const ms = Date.now() - started;
      setRun(ex.id, res.success ? { status: 'ok', rows: res.rows || [], ms } : { status: 'error', error: res.error, ms });
    } catch (err) {
      setRun(ex.id, { status: 'error', error: err.message });
    }
  };

  const runAll = async () => {
    setRunningAll(true);
    for (const ex of ALL_EXAMPLES) {
      // eslint-disable-next-line no-await-in-loop
      await run(ex);
    }
    setRunningAll(false);
  };

  const copy = async (ex) => {
    try {
      await navigator.clipboard.writeText(ex.sql);
      setCopied(ex.id);
      setTimeout(() => setCopied(null), 1500);
    } catch (e) {
      /* clipboard unavailable — ignore */
    }
  };

  const goTo = (catId) => {
    const el = document.getElementById(`showcase-${catId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const passed = ALL_EXAMPLES.filter((ex) => runs[ex.id] && runs[ex.id].status === 'ok').length;
  const failed = ALL_EXAMPLES.filter((ex) => runs[ex.id] && runs[ex.id].status === 'error').length;

  return (
    <div style={{ height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '28px 24px 60px' }}>
        {/* hero */}
        <h1 style={{ margin: 0, fontSize: 26 }}>SQL <span style={{ color: 'var(--blue)' }}>Visual</span> Debugger</h1>
        <p style={{ margin: '8px 0 18px', color: 'var(--text-mid)', fontSize: 14, lineHeight: 1.6 }}>
          Write a query, then see how the database understands and runs it. Below is one runnable example for each
          SQL feature the app supports. Run any of them here, or send it to the analyzer to explore its
          <strong> physical plan</strong> (EXPLAIN ANALYZE), <strong>logical tree</strong> (parse tree) and
          <strong> ProvSQL provenance</strong> circuit.
        </p>

        {/* feature cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 20 }}>
          {SHOWCASE.map((cat) => (
            <button
              key={cat.id}
              onClick={() => goTo(cat.id)}
              style={{ textAlign: 'left', padding: '14px 14px 12px', background: '#fff', border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer' }}
            >
              <div style={{ fontSize: 22 }}>{cat.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4, color: 'var(--text)' }}>{cat.title}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{cat.tagline}</div>
            </button>
          ))}
        </div>

        {/* run-all bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 28 }}>
          <button style={smallBtn(runningAll ? '#94a3b8' : '#16a34a')} onClick={runAll} disabled={runningAll}>
            {runningAll ? 'Running…' : '▶ Run all examples'}
          </button>
          <span style={{ fontSize: 13, color: 'var(--text-mid)' }}>
            {passed + failed === 0 ? `${ALL_EXAMPLES.length} examples across ${SHOWCASE.length} feature groups.` : (
              <>
                <strong style={{ color: '#16a34a' }}>{passed} passed</strong>
                {failed > 0 && <>, <strong style={{ color: '#dc2626' }}>{failed} failed</strong></>}
                {` of ${ALL_EXAMPLES.length}`}
              </>
            )}
          </span>
        </div>

        {/* one section per feature — reads like a document */}
        {SHOWCASE.map((cat, ci) => (
          <section key={cat.id} id={`showcase-${cat.id}`} style={{ marginBottom: 36, scrollMarginTop: 12 }}>
            <h2 style={{ margin: '0 0 4px', fontSize: 20 }}>{ci + 1}. {cat.icon} {cat.title}</h2>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{cat.tagline}</div>
            <p style={{ margin: '0 0 14px', fontSize: 14, color: 'var(--text-mid)', lineHeight: 1.6 }}>{cat.description}</p>

            {cat.examples.map((ex) => {
              const r = runs[ex.id];
              return (
                <div key={ex.id} style={{ border: '1px solid var(--border)', borderRadius: 10, background: '#fff', padding: 16, marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                    <h3 style={{ margin: 0, fontSize: 15 }}>{ex.title}</h3>
                    {r && r.status === 'ok' && <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 700 }}>✓ {r.rows.length} row{r.rows.length === 1 ? '' : 's'} · {r.ms} ms</span>}
                    {r && r.status === 'error' && <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 700 }}>✗ failed</span>}
                  </div>
                  <p style={{ margin: '6px 0 10px', fontSize: 13, color: 'var(--text-mid)', lineHeight: 1.5 }}>{ex.note}</p>

                  <pre style={{ margin: 0, padding: 14, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12.5, lineHeight: 1.55, overflowX: 'auto', fontFamily: 'ui-monospace, Menlo, Consolas, monospace' }}>
                    <Sql text={ex.sql} />
                  </pre>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '10px 0' }}>
                    <button style={smallBtn('#2563eb')} onClick={() => run(ex)} disabled={r && r.status === 'running'}>
                      {r && r.status === 'running' ? 'Running…' : '▶ Run here'}
                    </button>
                    <button style={smallBtn('#7c3aed')} onClick={() => onOpenInAnalyzer(ex.sql)}>🌳 Open in Query Tree</button>
                    <button style={smallBtn('#fff', '#334155', '1px solid #cbd5e1')} onClick={() => onOpenInRunner(ex.sql)}>✎ Open in Runner</button>
                    <button style={smallBtn('#fff', '#334155', '1px solid #cbd5e1')} onClick={() => copy(ex)}>{copied === ex.id ? 'Copied ✓' : 'Copy'}</button>
                  </div>

                  {r && r.status === 'error' && (
                    <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', padding: '8px 12px', borderRadius: 6, fontSize: 12, wordBreak: 'break-word' }}>{r.error}</div>
                  )}
                  {r && r.status === 'ok' && <ResultTable rows={r.rows} />}
                </div>
              );
            })}
          </section>
        ))}

        <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          The examples use the demo tables (<code>students</code>, <code>courses</code>, <code>enrollments</code>). If a
          query fails with “relation does not exist”, the demo data is missing — see <code>Postgres/schema.sql</code>.
        </p>
      </div>
    </div>
  );
}
