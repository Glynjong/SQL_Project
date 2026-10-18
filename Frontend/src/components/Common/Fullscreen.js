import React, { useState, useRef, useEffect, useCallback } from 'react';

// Expand a container into a centered modal (dimmed backdrop, rounded panel).
// Esc, the ✕ button, or a click outside the panel closes it. The dimming is a huge box-shadow on the panel
// itself, so no extra element has to be rendered by the caller.
export function useFullscreen(onChange) {
  const ref = useRef(null);
  const [isFs, setIsFs] = useState(false);
  const cb = useRef(onChange);
  cb.current = onChange;

  const settle = () => setTimeout(() => cb.current && cb.current(), 150);

  const exit = useCallback(() => {
    setIsFs(false);
    settle();
  }, []);

  const enter = useCallback(() => {
    setIsFs(true);
    settle();
  }, []);

  const toggle = useCallback(() => (isFs ? exit() : enter()), [isFs, enter, exit]);

  useEffect(() => {
    if (!isFs) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') exit(); };
    // Clicking the dimmed area closes the modal. There is no backdrop element,
    // so that click would otherwise reach whatever is underneath — swallow it.
    const swallow = (e) => { e.stopPropagation(); e.preventDefault(); };
    const onDown = (e) => {
      if (!ref.current || ref.current.contains(e.target)) return;
      swallow(e);
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 500);
      exit();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown, true);
    };
  }, [isFs, exit]);

  // Applied to the container: fills the window while active.
  const style = isFs
    ? {
        position: 'fixed', top: '4vh', left: '3vw', width: '94vw', height: '92vh', zIndex: 2000,
        background: '#ffffff', padding: 14, boxSizing: 'border-box', borderRadius: 12,
        boxShadow: '0 0 0 100vmax rgba(15,23,42,0.55), 0 20px 60px rgba(0,0,0,0.35)',
      }
    : undefined;

  return { ref, isFs, toggle, style };
}

export function FullscreenButton({ isFs, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={isFs ? 'Close (Esc)' : 'Expand'}
      aria-label={isFs ? 'Close expanded view' : 'Expand to a larger view'}
      style={{
        position: 'absolute', top: 10, right: 10, zIndex: 20, width: 32, height: 32,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
        background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer',
        boxShadow: '0 1px 3px rgba(0,0,0,0.12)', color: '#334155',
      }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {isFs ? (
          <>
            <path d="M3 3l10 10" />
            <path d="M13 3L3 13" />
          </>
        ) : (
          <>
            <path d="M1 6V2a1 1 0 0 1 1-1h4" />
            <path d="M15 6V2a1 1 0 0 0-1-1h-4" />
            <path d="M1 10v4a1 1 0 0 0 1 1h4" />
            <path d="M15 10v4a1 1 0 0 1-1 1h-4" />
          </>
        )}
      </svg>
    </button>
  );
}
