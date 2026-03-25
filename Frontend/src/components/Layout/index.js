import React from 'react';
import { TopBar } from './TopBar';
import { Sidebar } from './Sidebar';
import '../../../App.css';

export const AppLayout = ({
  children,
  activeTab,
  onTabChange,
  tables,
  onTableClick,
}) => (
  <div className="app-shell">
    <TopBar activeTab={activeTab} onTabChange={onTabChange} />
    <div className="body-layout">
      <Sidebar tables={tables} activeTab={activeTab} onTableClick={onTableClick} />
      <div className="content-area">{children}</div>
    </div>
  </div>
);
