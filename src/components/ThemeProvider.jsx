'use client';
import { createContext, useContext, useEffect, useState, useCallback } from 'react';

const ThemeContext = createContext({
  theme: 'dark',       // resolved theme actually applied: 'light' | 'dark'
  mode: 'dark',        // user's chosen mode: 'light' | 'dark' | 'system'
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

// FIX (a real cause of the "Something went wrong" crash screen, and a much
// more frequent one than the notification-listener chunk-load issue):
// localStorage.getItem/setItem below were called with no try/catch, in a
// component mounted in layout.js as a sibling of {children} - outside the
// tree app/error.jsx protects, so any throw here skips straight to
// app/global-error.jsx and takes down the ENTIRE app. Unlike the
// notification listeners (which only fail in narrow conditions),
// ThemeProvider's localStorage read runs in a useEffect on EVERY page load
// for EVERY visitor - and storage access throwing isn't rare: in-app
// browsers (WhatsApp's, Instagram's - very plausible here, given delivery
// links get shared over WhatsApp) and privacy-hardened browsers are known
// to restrict or block it. That mismatch - a crash source this common,
// sitting somewhere this unprotected - is almost certainly why the crash
// screen was showing up "a bit too much." Wrapped so a blocked/unavailable
// store just falls back to the dark default instead of ever throwing.
function safeGetItem(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked/unavailable - theme choice just won't persist across
    // visits this session. Never something worth crashing over.
  }
}

export function ThemeProvider({ children }) {
    // Dark is the default theme - light is available as an explicit choice
    // via the picker on the Profile page.
    const [mode, setModeState] = useState('dark');
    const [theme, setTheme] = useState('dark');
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        const stored = safeGetItem('themeMode'); // 'light' | 'dark' | 'system'
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

        const resolve = (m) => (m === 'system' ? (mediaQuery.matches ? 'dark' : 'light') : m);

        const initialMode = stored === 'dark' || stored === 'light' || stored === 'system' ? stored : 'dark';
        setModeState(initialMode);
        const resolved = resolve(initialMode);
        setTheme(resolved);
        applyTheme(resolved);

        // Keep tracking OS changes live while mode is 'system'.
        const handleSystemChange = (e) => {
            const currentMode = safeGetItem('themeMode') || 'dark';
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
        safeSetItem('themeMode', newMode);
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