import { useState } from 'react';

export const useTabs = (defaultTab = 'runner') => {
  const [activeTab, setActiveTab] = useState(defaultTab);
  return { activeTab, setActiveTab };
};
