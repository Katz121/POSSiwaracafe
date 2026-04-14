import React, { createContext, useContext } from 'react';

// Split contexts for performance — consumers only re-render when their specific context changes
const DataContext = createContext(null);
const ConfigContext = createContext(null);
const UIContext = createContext(null);

// Granular hooks — use these for better performance
export const useDataContext = () => {
  const context = useContext(DataContext);
  if (!context) throw new Error('useDataContext must be used within AppProvider');
  return context;
};

export const useConfigContext = () => {
  const context = useContext(ConfigContext);
  if (!context) throw new Error('useConfigContext must be used within AppProvider');
  return context;
};

export const useUIContext = () => {
  const context = useContext(UIContext);
  if (!context) throw new Error('useUIContext must be used within AppProvider');
  return context;
};

// Backward-compatible hook — returns all contexts merged
// Use granular hooks above for better performance in new code
export const useAppContext = () => {
  const data = useContext(DataContext);
  const config = useContext(ConfigContext);
  const ui = useContext(UIContext);
  if (!data || !config || !ui) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return { ...data, ...config, ...ui };
};

// Provider component
export const AppProvider = ({ children, dataValue, configValue, uiValue }) => {
  return (
    <DataContext.Provider value={dataValue}>
      <ConfigContext.Provider value={configValue}>
        <UIContext.Provider value={uiValue}>
          {children}
        </UIContext.Provider>
      </ConfigContext.Provider>
    </DataContext.Provider>
  );
};

export default DataContext;
