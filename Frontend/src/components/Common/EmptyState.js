import React from 'react';
import '../../App.css';

export const EmptyState = ({ icon = '', title = 'No results', subtitle = '' }) => (
  <div className="results-empty">
    {icon && <div className="results-empty-icon">{icon}</div>}
    <div className="results-empty-title">{title}</div>
    {subtitle && <div className="results-empty-sub">{subtitle}</div>}
  </div>
);
