"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function ThemeBootstrap() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === "/login") {
      document.documentElement.classList.remove("dark");
      document.documentElement.style.colorScheme = "light";
      return;
    }

    const theme = localStorage.getItem("theme");
    const shouldUseDark = theme === "dark";

    document.documentElement.classList.toggle("dark", shouldUseDark);
    document.documentElement.style.colorScheme = shouldUseDark ? "dark" : "light";
  }, [pathname]);

  return null;
}
