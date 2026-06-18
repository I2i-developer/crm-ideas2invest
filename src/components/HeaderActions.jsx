"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { LogOut, Settings } from "lucide-react";
import toast from "react-hot-toast";
import CrmTooltip from "@/components/CrmTooltip";
import ChatLauncher from "@/components/ChatLauncher";
import HeaderBasicCalculator from "@/components/HeaderBasicCalculator";
import OperationsQuickNotes from "@/components/OperationsQuickNotes";
import HeaderDateTime from "@/components/HeaderDateTime";
import NotificationIcon from "@/components/NotificationIcon";
import { supabase } from "@/lib/supabaseClient";

export default function HeaderActions() {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState({
    name: "",
    email: "",
    designation: "",
    role: "",
    avatar: "/images/profiles/default.png",
  });

  const fetchProfile = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data } = await supabase
      .from("profiles")
      .select("name, full_name, email, designation, avatar_url, role")
      .eq("id", user.id)
      .maybeSingle();

    setProfile({
      name: data?.name || data?.full_name || user.user_metadata?.full_name || user.email || "CRM User",
      email: data?.email || user.email || "",
      designation: data?.designation || "",
      role: data?.role || "",
      avatar: data?.avatar_url || "/images/profiles/default.png",
    });
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  async function logout() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Logout failed");
      return;
    }
    window.location.href = "/login";
  }

  return (
    <div className="relative flex min-w-0 items-center gap-2 sm:gap-3">
      <HeaderDateTime />
      <HeaderBasicCalculator role={profile.role} />
      <OperationsQuickNotes role={profile.role} />
      <ChatLauncher />
      <NotificationIcon />

      <CrmTooltip content="Profile" side="bottom">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="inline-flex min-w-0 shrink-0 items-center gap-2 rounded-2xl border border-gray-200 bg-white py-1.5 pl-1.5 pr-2 text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50 sm:gap-3 sm:pr-3"
          aria-label="Profile"
        >
          <Image
            src={profile.avatar}
            alt="Profile"
            width={36}
            height={36}
            unoptimized
            className="h-8 w-8 rounded-full border border-white object-cover shadow sm:h-9 sm:w-9"
          />
          <span className="hidden min-w-0 sm:block">
            <span className="block max-w-36 truncate text-sm font-semibold text-gray-900">{profile.name}</span>
            <span className="block text-xs capitalize text-gray-500">{profile.role || profile.designation}</span>
          </span>
        </button>
      </CrmTooltip>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close profile menu"
            className="fixed inset-0 z-40 cursor-default bg-transparent"
            onClick={() => setOpen(false)}
          />
          <div className="fixed left-3 right-3 top-[4.25rem] z-50 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl sm:absolute sm:left-auto sm:right-0 sm:top-14 sm:w-[min(360px,calc(100vw-2rem))]">
            <div className="border-b border-gray-100 p-5">
              <div className="flex items-center gap-4">
                <Image
                  src={profile.avatar}
                  alt="Profile"
                  width={88}
                  height={88}
                  unoptimized
                  className="h-20 w-20 rounded-full border-4 border-white object-cover shadow-lg sm:h-[88px] sm:w-[88px]"
                />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-gray-900">{profile.name}</p>
                  <p className="truncate text-sm text-gray-500">{profile.email}</p>
                  {profile.designation && <p className="truncate text-xs text-gray-400">{profile.designation}</p>}
                </div>
              </div>
              {profile.role && (
                <span className="mt-3 inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold capitalize text-blue-700">
                  {profile.role}
                </span>
              )}
            </div>

            <div className="p-2">
              <Link
                href="/admin/settings"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                <Settings size={17} />
                Account settings
              </Link>
              <button
                type="button"
                onClick={logout}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold text-red-600 hover:bg-red-50"
              >
                <LogOut size={17} />
                Logout
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
