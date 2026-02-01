import React, { createContext, useContext } from 'react';

// Create the context
const AppContext = createContext(null);

// Custom hook to use the context
export const useAppContext = () => {
    const context = useContext(AppContext);
    if (!context) {
        throw new Error('useAppContext must be used within an AppProvider');
    }
    return context;
};

// Provider component - will wrap the App
export const AppProvider = ({ children, value }) => {
    return (
        <AppContext.Provider value={value}>
            {children}
        </AppContext.Provider>
    );
};

export default AppContext;
