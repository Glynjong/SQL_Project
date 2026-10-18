import React, { useRef, useEffect } from 'react';
import '../../App.css';

// Auto-growing SQL textarea shared by the Query Runner and the Query Tree
// toolbar. It grows to fit the query (up to the CSS max-height, then scrolls)
// and shows a line count once the query gets long.
export const SqlEditor = ({ value, onChange }) => {
  const textareaRef = useRef(null);
  const lineCount = value ? value.split('\n').length : 1;
  const isLong = lineCount > 3 || (value || '').length > 200;

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <div style={{ flex: 1, position: 'relative' }}>
      <textarea
        ref={textareaRef}
        className="tree-query-editor"
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: '100%', boxSizing: 'border-box' }}
      />
      {isLong && (
        <span
          style={{
            position: 'absolute',
            bottom: '6px',
            right: '10px',
            fontSize: '10px',
            padding: '2px 7px',
            borderRadius: '999px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            color: 'var(--text-muted)',
            pointerEvents: 'none',
          }}
        >
          {lineCount} lines
        </span>
      )}
    </div>
  );
};
