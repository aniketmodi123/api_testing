import { createContext, useContext, useEffect, useState } from 'react';

const ThemeCtx = createContext({
  theme: 'dark',
  setTheme: () => {},
});

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(
    () => localStorage.getItem('theme') || 'dark'
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  return (
    <ThemeCtx.Provider
      value={{ theme, setTheme, isDarkMode: theme === 'dark' }}
    >
      {children}
    </ThemeCtx.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeCtx);
}
