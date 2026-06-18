"use client";

import { useState } from "react";
import Sidebar from "@/app/(dashboard)/admin/components/Sidebar";
import HeaderActions from "@/components/HeaderActions";
import HeaderBrand from "@/components/HeaderBrand";
import { Menu } from "lucide-react";

export default function TasksLayout({ children }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden font-sans bg-gray-50">
      <Sidebar
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        mobileOpen={mobileSidebarOpen}
        setMobileOpen={setMobileSidebarOpen}
      />
      <div className="flex-1 flex flex-col overflow-hidden transition-all duration-300">
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-gray-200 bg-gray-50/95 px-2 sm:px-4 lg:px-4">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 shadow-sm lg:hidden"
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </button>
            <HeaderBrand />
          </div>
          <HeaderActions />
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
