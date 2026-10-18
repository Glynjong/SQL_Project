import React from 'react';
import '../../App.css';

export const TopBar = ({ activeTab, onTabChange }) => (
  <div className="top-bar">
    <a
      className="top-bar-title top-bar-title--link"
      href="#home"
      title="Go to the home page"
      onClick={(e) => { e.preventDefault(); onTabChange('home'); }}
    >
      SQL <span>Visual</span> Debugger
    </a>
    <button
      className={`tab-btn ${activeTab === 'home' ? 'active' : ''}`}
      onClick={() => onTabChange('home')}
    >
      Home
    </button>
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
      Query Tree
    </button>
  </div>
);
