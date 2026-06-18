"use client";

import { useEffect } from "react";

export default function ThemeBootstrap() {
  useEffect(() => {
    const theme = localStorage.getItem("theme");
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    const shouldUseDark = theme === "dark" || (!theme && prefersDark);

    document.documentElement.classList.toggle("dark", shouldUseDark);
  }, []);

  return null;
}
