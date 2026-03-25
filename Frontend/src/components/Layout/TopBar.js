import React from 'react';
import '../../../App.css';

export const TopBar = ({ activeTab, onTabChange }) => (
  <div className="top-bar">
    <span className="top-bar-title">
      SQL <span>Visual</span> Debugger
    </span>
    <button
      className={`tab-btn ${activeTab === 'runner' ? 'active' : ''}`}
      onClick={() => onTabChange('runner')}
    >
      Query Runner
    </button>
    <button
      className={`tab-btn ${activeTab === 'visualizer' ? 'active' : ''}`}
      onClick={() => onTabChange('visualizer')}
    >
      Schema Visualizer
    </button>
    <button
      className={`tab-btn ${activeTab === 'querytree' ? 'active' : ''}`}
      onClick={() => onTabChange('querytree')}
    >
      🌳 Query Tree
    </button>
  </div>
);
