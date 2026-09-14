"use client";

import { createContext, useCallback, useContext, useMemo } from "react";

type Theme = "light" | "dark";

type ThemeContextValue = {
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const setTheme = useCallback((nextTheme: Theme) => {
    applyTheme(nextTheme);
    localStorage.setItem("warehouse-theme", nextTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    const currentTheme: Theme = document.documentElement.classList.contains("dark")
      ? "dark"
      : "light";
    setTheme(currentTheme === "dark" ? "light" : "dark");
  }, [setTheme]);

  const value = useMemo(
    () => ({ setTheme, toggleTheme }),
    [setTheme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}

