import React, { useState, useRef, useEffect } from 'react';
import '../../App.css';

// A normal button that opens a menu of choices — used instead of a native
// <select>, whose dropdown can't be styled to match the other buttons.
export const MenuButton = ({ label, items, onPick, disabled = false, title, className = 'btn-primary', style }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="toolbar-menu" ref={ref}>
      <button
        className={className}
        style={style}
        onClick={() => setOpen((o) => !o)}
        disabled={disabled || items.length === 0}
        title={title}
      >
        {label}
      </button>
      {open && (
        <div className="toolbar-menu-list">
          {items.map((item) => (
            <button
              key={item}
              className="toolbar-menu-item"
              onClick={() => { setOpen(false); onPick(item); }}
            >
              {item}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
