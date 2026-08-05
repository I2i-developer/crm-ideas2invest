"use client";

import { useCallback, useEffect, useState } from "react";
import Sidebar from "@/app/(dashboard)/admin/components/Sidebar";
import HeaderActions from "@/components/HeaderActions";
import HeaderBrand from "@/components/HeaderBrand";
import { Menu } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

const DEFAULT_PROFILE = {
  name: "",
  full_name: "",
  email: "",
  designation: "",
  avatar_url: "",
  role: "",
};

export default function OperationsLayout({ children }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [profile, setProfile] = useState(DEFAULT_PROFILE);

  const loadProfile = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;

    if (!user) return;

    const { data } = await supabase
      .from("profiles")
      .select("name, full_name, email, designation, avatar_url, role, notifications")
      .eq("id", user.id)
      .maybeSingle();

    setProfile({
      id: user.id,
      name: data?.name || data?.full_name || user.user_metadata?.full_name || user.email || "CRM User",
      full_name: data?.full_name || "",
      email: data?.email || user.email || "",
      designation: data?.designation || "",
      avatar_url: data?.avatar_url || "/images/profiles/default.png",
      role: data?.role || "",
      notifications: data?.notifications || {},
    });
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 font-sans">
      <Sidebar
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        mobileOpen={mobileSidebarOpen}
        setMobileOpen={setMobileSidebarOpen}
        profile={profile}
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
          <HeaderActions profile={profile} />
        </header>
        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-3 sm:p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
