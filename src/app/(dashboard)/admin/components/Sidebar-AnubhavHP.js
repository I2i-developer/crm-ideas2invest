// "use client";
// import { useState } from "react";
// import Link from "next/link";
// import Image from "next/image";
// import { usePathname } from "next/navigation";
// import {
//   LayoutDashboard,
//   Users,
//   Settings,
//   LogOut,
//   ChevronLeft,
//   Search,
// } from "lucide-react";

// export default function Sidebar({ collapsed, setCollapsed }) {
//   const pathname = usePathname();
//   const [searchOpen, setSearchOpen] = useState(false);
//   const menu = [
//     { name: "Dashboard", path: "/admin/dashboard", icon: LayoutDashboard },
//     { name: "Clients", path: "/admin/clients", icon: Users },
//     { name: "Settings", path: "/admin/settings", icon: Settings },
//   ];

//   return (
//     <>
//       {/* <aside
//         className={`hidden lg:flex fixed top-0 left-0 h-screen z-40
//         flex-col p-6
//         bg-[#e6edf5]
//         shadow-[8px_8px_20px_#c8d0e0,-8px_-8px_20px_#ffffff]
//         transition-all duration-300
//         ${collapsed ? "w-20" : "w-72"} font-sans`}
//       > */}
//       <aside
//         className={`
//           h-full
//           transition-all duration-300 p-6
//           ${collapsed ? "w-20" : "w-72"}
//           bg-[#e6edf5]
//           shadow-[8px_8px_20px_#c8d0e0,-8px_-8px_20px_#ffffff]
//           flex flex-col
//         `}
//       >
//         {/* Logo + Collapse */}
//         <div className="flex items-center justify-between mb-10">
//           <div
//             className={`relative transition-all duration-300 ${
//               collapsed ? "w-10 h-10" : "w-40 h-16"
//             }`}
//           >
//             <Image
//               src="/images/logo/logo.png"
//               alt="Company Logo"
//               fill
//               className="object-contain"
//             />
//           </div>

//           <button
//             onClick={() => setCollapsed(!collapsed)}
//             className="p-2 rounded-3xl hover:scale-105 transition bg-[#f5f5f5] shadow-xl"
//           >
//             <ChevronLeft
//               size={25}
//               className={`transition-transform ${collapsed ? "rotate-180" : ""}`}
//             />
//           </button>
//         </div>

//         {/* Profile */}
//         <div className="flex items-center gap-3 mb-8">
//           <Image
//             src="/images/logo/profile.jpg"
//             alt="Profile"
//             width={collapsed ? 40 : 65}
//             height={collapsed ? 40 : 65}
//             className="rounded-full transition-all duration-300 border-2 border-white shadow-md"
//           />
//           {!collapsed && (
//             <div>
//               <h3 className="font-semibold text-gray-800">Deepak Sooden</h3>
//               <p className="text-sm text-gray-500">Co-Founder</p>
//             </div>
//           )}
//         </div>

//         {/* Search */}
//         {/* <div className="relative mb-8 flex justify-center">
//           {collapsed ? (
//             <button
//               onClick={() => setSearchOpen(true)}
//               className="p-3 rounded-xl
//               hover:shadow-[4px_4px_10px_#c8d0e0,-4px_-4px_10px_#ffffff]
//               transition-all duration-300"
//             >
//               <Search size={20} className="text-gray-700" />
//             </button>
//           ) : (
//             <div className="relative w-full">
//               <Search
//                 size={18}
//                 className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
//               />
//               <input
//                 type="text"
//                 placeholder="Search..."
//                 className="w-full pl-10 pr-4 py-3 rounded-xl
//                 bg-[#e6edf5]
//                 shadow-[inset_4px_4px_8px_#c8d0e0,inset_-4px_-4px_8px_#ffffff]
//                 focus:outline-none font-sans"
//               />
//             </div>
//           )}
//         </div> */}

//         {/* Menu */}
//         <nav className="flex flex-col gap-4">
//           {menu.map((item) => {
//             const Icon = item.icon;
//             const isActive = pathname === item.path;

//             return (
//               <Link
//                 key={item.path}
//                 href={item.path}
//                 className={`relative group flex items-center
//                   ${collapsed ? "justify-center px-0" : "gap-4 px-4"}
//                   py-3 rounded-xl transition-all duration-300
//                   ${
//                     isActive
//                       ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg"
//                       : "text-gray-700 hover:shadow-[4px_4px_10px_#c8d0e0,-4px_-4px_10px_#ffffff]"
//                   }`}
//               >
//                 <Icon size={20} />
//                 {!collapsed && <span>{item.name}</span>}

//                 {/* Tooltip */}
//                 {collapsed && (
//                   <span
//                     className="absolute left-10 whitespace-nowrap
//                     bg-gray-800 text-white text-sm px-3 py-1 rounded-md
//                     opacity-0 group-hover:opacity-100
//                     transition-opacity duration-200 pointer-events-none"
//                   >
//                     {item.name}
//                   </span>
//                 )}
//               </Link>
//             );
//           })}
//         </nav>

//         <div className="mt-auto">
//           <button
//             className={`relative group w-full flex items-center
//               ${collapsed ? "justify-center px-0" : "gap-4 px-4"}
//               py-3 rounded-xl text-red-500
//               hover:shadow-[4px_4px_10px_#c8d0e0,-4px_-4px_10px_#ffffff]
//               transition-all duration-300`}
//           >
//             <LogOut size={20} />
//             {!collapsed && <span>Logout</span>}
//             {collapsed && (
//               <span
//                 className="absolute left-10 whitespace-nowrap
//                 bg-gray-800 text-white text-sm px-3 py-1 rounded-md
//                 opacity-0 group-hover:opacity-100
//                 transition-opacity duration-200 pointer-events-none"
//               >
//                 Logout
//               </span>
//             )}
//           </button>
//         </div>
//       </aside>
//       {searchOpen && (
//         <div
//           className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
//           onClick={() => setSearchOpen(false)}
//         >
//           <div
//             className="bg-white w-[90%] max-w-md p-6 rounded-2xl shadow-2xl"
//             onClick={(e) => e.stopPropagation()}
//           >
//             <div className="relative">
//               <Search
//                 size={18}
//                 className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
//               />
//               <input
//                 autoFocus
//                 type="text"
//                 placeholder="Search..."
//                 className="w-full pl-10 pr-4 py-3 rounded-xl border
//                 focus:outline-none focus:ring-2 focus:ring-blue-500"
//               />
//             </div>
//           </div>
//         </div>
//       )}
//     </>
//   );
// }

"use client";

import { useCallback, useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  ChevronLeft,
  Search,
  ClipboardList,
  ShieldCheck,
  Cake,
  Calculator,
  HeartPulse,
  ShieldQuestion,
  FileCheck2,
  ChartCandlestick,
  LibraryBig,
  ListChecks,
  ChartNoAxesCombined,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

function isActiveRoute(currentPath, itemPath, matchType = "section") {
  if (!currentPath || !itemPath) return false;
  const normalizedCurrent = currentPath.split("?")[0].replace(/\/+$/, "") || "/";
  const normalizedItem = itemPath.replace(/\/+$/, "") || "/";

  if (matchType === "exact") {
    return normalizedCurrent === normalizedItem;
  }

  return normalizedCurrent === normalizedItem || normalizedCurrent.startsWith(`${normalizedItem}/`);
}

function isSupabaseLockAbort(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("lock broken") || message.includes("aborterror");
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function Sidebar({ collapsed, setCollapsed, mobileOpen = false, setMobileOpen }) {
  const pathname = usePathname();
  const router = useRouter();

  const [searchOpen, setSearchOpen] = useState(false);
  const [hoverLabel, setHoverLabel] = useState(null);
  const [toggleTooltip, setToggleTooltip] = useState(null);

  const showToggleTooltip = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setToggleTooltip({
      label: collapsed ? "Expand" : "Collapse",
      top: rect.top + rect.height / 2,
      left: rect.right + 10,
    });
  };

  const [userData, setUserData] = useState({
    name: "",
    designation: "",
    avatar: "/images/profiles/default.png", // fallback
    role: "",
  });

  const menu = [
    {
      name: "Dashboard",
      path: userData.role === "operations" ? "/operations/dashboard" : "/admin/dashboard",
      icon: LayoutDashboard,
      matchType: "exact",
    },
    { name: "Clients", path: "/admin/clients", icon: Users },
    { name: "Birthdays", path: "/admin/birthdays", icon: Cake },
    { name: "Tasks", path: "/dashboard/tasks", icon: ClipboardList },
    { name: "Team Performance", path: "/admin/team-performance", icon: ChartNoAxesCombined, adminOnly: true },
    { name: "My Work Tracker", path: "/operations/my-work-tracker", icon: ListChecks, operationsOnly: true },
    { name: "SIP Tracker", path: "/admin/sip-tracker", icon: ChartCandlestick },
    { name: "Forms Center", path: "/admin/forms-center", icon: LibraryBig },
    { name: "Calculators", path: "/admin/calculators", icon: Calculator },
    { name: "Risk Profiling", path: "/admin/risk-profiling", icon: ShieldQuestion },
    { name: "Insurance", path: "/admin/insurance", icon: HeartPulse },
    { name: "Required Docs", path: "/admin/document-requirements", icon: FileCheck2 },
    { name: "Company", path: "/admin/company", icon: null, companyLogo: true },
    { name: "Audit", path: "/admin/audit", icon: ShieldCheck, adminOnly: true },
  ].filter((item) => {
    if (item.adminOnly && userData.role !== "admin") return false;
    if (item.operationsOnly && userData.role !== "operations") return false;
    return true;
  });

  const fetchUserProfile = useCallback(async () => {
    let lastError = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        const user = sessionData?.session?.user;

        if (!user) {
          router.push("/login");
          return;
        }

        const { data, error } = await supabase
          .from("profiles")
          .select("name, designation, avatar_url, role")
          .eq("id", user.id)
          .maybeSingle();

        if (error) throw error;

        setUserData({
          name: data?.name || user.email || "CRM User",
          designation: data?.designation || "",
          avatar: data?.avatar_url || "/images/profiles/default.png",
          role: data?.role || "",
        });
        return;
      } catch (error) {
        lastError = error;
        if (!isSupabaseLockAbort(error) || attempt === 2) break;
        await wait(150 * (attempt + 1));
      }
    }

    if (isSupabaseLockAbort(lastError)) return;
    console.error("Error fetching profile:", lastError?.message || lastError);
  }, [router]);

  useEffect(() => {
    fetchUserProfile();
  }, [fetchUserProfile]);

  const showCollapsedLabel = (event, label) => {
    if (!collapsed) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setHoverLabel({
      label,
      top: rect.top + rect.height / 2,
      left: rect.right + 10,
    });
  };

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen?.(false)}
        />
      )}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 h-dvh shrink-0 overflow-visible transition-all duration-300 lg:relative lg:z-auto lg:h-full
          ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
          w-56 ${collapsed ? "lg:w-24" : "lg:w-56"}
        `}
      >
        {/* Collapse/Expand toggle — outside the scrollable div so tooltip is never clipped */}
        <div className="absolute -right-4 top-1/2 z-[200] hidden -translate-y-1/2 lg:block">
          <button
            type="button"
            onClick={() => { setCollapsed(!collapsed); setToggleTooltip(null); }}
            onMouseEnter={showToggleTooltip}
            onMouseLeave={() => setToggleTooltip(null)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/80 bg-white text-gray-700 shadow-xl transition hover:scale-105 hover:text-blue-700"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <ChevronLeft
              size={21}
              className={`transition-transform ${
                collapsed ? "rotate-180" : ""
              }`}
            />
          </button>
        </div>

        <div
          className={`
          h-full p-3
          bg-[#e6edf5]
          border-r border-slate-200/80
          shadow-[7px_0_24px_rgba(15,23,42,0.16)]
          flex flex-col overflow-y-auto overflow-x-visible scrollbar-hidden
        `}
        >
        {/* Menu */}
        <nav className="flex flex-col gap-2.5 pb-6 pt-3">
          {menu.map((item) => {
            const Icon = item.icon;
            const isActive = isActiveRoute(pathname, item.path, item.matchType);

            return (
              <Link
                key={item.path}
                href={item.path}
                onClick={() => setMobileOpen?.(false)}
                onMouseEnter={(event) => showCollapsedLabel(event, item.name)}
                onMouseLeave={() => setHoverLabel(null)}
                onFocus={(event) => showCollapsedLabel(event, item.name)}
                onBlur={() => setHoverLabel(null)}
                className={`relative group flex items-center
                ${collapsed ? "lg:justify-center lg:px-0" : "lg:gap-3 lg:px-3"} gap-3 px-3
                py-2.5 rounded-xl transition-all duration-300
                ${
                  isActive
                    ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg"
                    : "text-gray-700 hover:shadow-[4px_4px_10px_#c8d0e0,-4px_-4px_10px_#ffffff]"
                }`}
              >
                {item.companyLogo ? (
                  <span className={`relative shrink-0 ${collapsed ? "h-8 w-12" : "h-8 w-24"}`}>
                    <Image
                      src="/images/logo/logo.png"
                      alt="Company"
                      fill
                      sizes={collapsed ? "48px" : "96px"}
                      className="object-contain"
                    />
                  </span>
                ) : (
                  <Icon size={20} />
                )}
                {item.badge > 0 && (
                  <span className="absolute right-3 top-2 min-w-5 rounded-full bg-red-500 px-1.5 text-center text-[11px] font-semibold text-white">
                    {item.badge}
                  </span>
                )}
                {!item.companyLogo && <span className={collapsed ? "lg:hidden" : ""}>{item.name}</span>}

              </Link>
            );
          })}
        </nav>
        </div>
      </aside>
      {hoverLabel && (
        <span
          className="fixed z-[9999] -translate-y-1/2 whitespace-nowrap rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white shadow-lg pointer-events-none"
          style={{ top: hoverLabel.top, left: hoverLabel.left }}
        >
          {hoverLabel.label}
        </span>
      )}
      {toggleTooltip && (
        <span
          className="fixed z-[9999] -translate-y-1/2 whitespace-nowrap rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white shadow-2xl ring-1 ring-white/10 pointer-events-none"
          style={{ top: toggleTooltip.top, left: toggleTooltip.left }}
        >
          {toggleTooltip.label}
          <span className="absolute right-full top-1/2 h-0 w-0 -translate-y-1/2 border-y-4 border-r-4 border-y-transparent border-r-slate-950" />
        </span>
      )}

      {/* Search Modal */}
      {searchOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setSearchOpen(false)}
        >
          <div
            className="bg-white w-[90%] max-w-md p-6 rounded-2xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative">
              <Search
                size={18}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                autoFocus
                type="text"
                placeholder="Search..."
                className="w-full pl-10 pr-4 py-3 rounded-xl border
                focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
