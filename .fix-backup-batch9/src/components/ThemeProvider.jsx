'use client';
import { createContext, useContext, useEffect, useState, useCallback } from 'react';

const ThemeContext = createContext({
  theme: 'light',       // resolved theme actually applied: 'light' | 'dark'
  mode: 'light',        // user's chosen mode: 'light' | 'dark' | 'system'
  setMode: () => {},
  toggleTheme: () => {},
});

function applyTheme(resolved) {
  if (resolved === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

export function ThemeProvider({ children }) {
    const [mode, setModeState] = useState('light');
    const [theme, setTheme] = useState('light');
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        const stored = localStorage.getItem('themeMode'); // 'light' | 'dark' | 'system'
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

        const resolve = (m) => (m === 'system' ? (mediaQuery.matches ? 'dark' : 'light') : m);

        const initialMode = stored === 'dark' || stored === 'light' || stored === 'system' ? stored : 'light';
        setModeState(initialMode);
        const resolved = resolve(initialMode);
        setTheme(resolved);
        applyTheme(resolved);

        // Keep tracking OS changes live while mode is 'system'.
        const handleSystemChange = (e) => {
            const currentMode = localStorage.getItem('themeMode') || 'light';
            if (currentMode === 'system') {
                const next = e.matches ? 'dark' : 'light';
                setTheme(next);
                applyTheme(next);
            }
        };
        mediaQuery.addEventListener('change', handleSystemChange);
        return () => mediaQuery.removeEventListener('change', handleSystemChange);
    }, []);

    const setMode = useCallback((newMode) => {
        localStorage.setItem('themeMode', newMode);
        setModeState(newMode);
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const resolved = newMode === 'system' ? (mediaQuery.matches ? 'dark' : 'light') : newMode;
        setTheme(resolved);
        applyTheme(resolved);
    }, []);

    // Kept for the existing Navbar toggle button - simple light/dark flip,
    // treated as explicitly choosing that mode (not 'system').
    const toggleTheme = useCallback(() => {
        setMode(theme === 'light' ? 'dark' : 'light');
    }, [theme, setMode]);

    return (
        <ThemeContext.Provider value={{ theme, mode, setMode, toggleTheme }}>
            {mounted ? children : <div style={{ visibility: 'hidden' }}>{children}</div>}
        </ThemeContext.Provider>
    );
}

export const useTheme = () => useContext(ThemeContext);