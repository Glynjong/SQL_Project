import React from 'react';
import '../../App.css';

export const Sidebar = ({ tables, activeTab, onTableClick, onImportTable }) => {
  const getSidebarIcon = () => {
    switch (activeTab) {
      case 'runner':
        return '👁️';
      case 'visualizer':
        return '➕';
      case 'querytree':
        return '🌳';
      default:
        return '👁️';
    }
  };

  const handleClick = (table) => {
    console.log('Sidebar item clicked:', table);
    onTableClick(table);
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <span>Tables</span>
        {onImportTable && (
          <button className="sidebar-header-btn" onClick={onImportTable} title="Import a table from a CSV file">
            ⬆ Import
          </button>
        )}
      </div>
      <div className="sidebar-list">
        {tables.map((table) => (
          <div
            key={table}
            className="sidebar-item"
            onClick={() => handleClick(table)}
          >
            <span className="sidebar-item-icon">{getSidebarIcon()}</span>
            {table}
          </div>
        ))}
      </div>
    </div>
  );
};
