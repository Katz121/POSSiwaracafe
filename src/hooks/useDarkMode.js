/**
 * Dark Mode Hook
 * Manages dark mode state with localStorage persistence
 */
import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'pos-dark-mode';

export default function useDarkMode() {
  // Initialize from localStorage or system preference
  const [isDark, setIsDark] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      return stored === 'true';
    }
    // Check system preference
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches || false;
  });

  // Apply dark mode class to document
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      root.style.colorScheme = 'light';
    }
    localStorage.setItem(STORAGE_KEY, String(isDark));
  }, [isDark]);

  // Toggle function
  const toggle = useCallback(() => {
    setIsDark(prev => !prev);
  }, []);

  // Set specific value
  const setDarkMode = useCallback((value) => {
    setIsDark(value);
  }, []);

  // Listen for system preference changes
  useEffect(() => {
    const mediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mediaQuery) return;

    const handler = (e) => {
      // Only update if user hasn't set a preference
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === null) {
        setIsDark(e.matches);
      }
    };

    mediaQuery.addEventListener?.('change', handler);
    return () => mediaQuery.removeEventListener?.('change', handler);
  }, []);

  return {
    isDark,
    toggle,
    setDarkMode
  };
}
