"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function ThemeBootstrap() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === "/login") {
      document.documentElement.classList.remove("dark");
      return;
    }

    const theme = localStorage.getItem("theme");
    const shouldUseDark = theme === "dark";

    document.documentElement.classList.toggle("dark", shouldUseDark);
  }, [pathname]);

  return null;
}
