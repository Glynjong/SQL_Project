import React from 'react';
import '../../App.css';

export const Sidebar = ({ tables, activeTab, onTableClick }) => {
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
      <div className="sidebar-header">Tables</div>
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
