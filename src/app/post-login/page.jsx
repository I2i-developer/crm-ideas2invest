// "use client";

// import { useEffect, useState } from "react";
// import { supabase } from "@/lib/supabaseClient";
// import { useRouter } from "next/navigation";

// export default function PostLogin() {
//   const router = useRouter();

//   const [status, setStatus] = useState("Initializing...");
//   const [error, setError] = useState("");

//   useEffect(() => {
//     const handlePostLogin = async () => {
//       try {
//         setStatus("Checking session...");

//         // 1. Get logged-in user
//         const {
//           data: { user },
//           error: userError,
//         } = await supabase.auth.getUser();

//         if (userError || !user) {
//           router.replace("/login");
//           return;
//         }

//         // 2. Get session (for Google token)
//         const { data: { session } } = await supabase.auth.getSession();

//         const providerToken = session?.provider_token;

//         if (!providerToken) {
//           setError("Google permission missing. Please login again.");
//           return;
//         }

//         // 3. Check if folder already exists
//         setStatus("Checking storage setup...");

//         const { data: existing, error: fetchError } = await supabase
//           .from("user_storage")
//           .select("drive_folder_id")
//           .eq("user_id", user.id)
//           .maybeSingle();

//         let folderId = existing?.drive_folder_id;

//         if (!existing) {
//           await supabase.from("user_storage").insert({
//             user_id: user.id,
//             drive_folder_id: folderId,
//           });
//         }

//         // 4. If not exists → create folder
//         if (!folderId) {
//           setStatus("Creating your Drive workspace...");

//           const res = await fetch("/api/google-drive/create-folder", {
//             method: "POST",
//             headers: {
//               "Content-Type": "application/json",
//             },
//             body: JSON.stringify({
//               userName: user.email,
//               accessToken: providerToken,
//             }),
//           });

//           const data = await res.json();

//           if (!res.ok) {
//             throw new Error(data.error || "Failed to create folder");
//           }

//           folderId = data.folderId;

//           // 5. Save folder ID in DB
//           await supabase.from("user_storage").insert({
//             user_id: user.id,
//             drive_folder_id: folderId,
//           });
//         }

//         // 6. Get user role
//         setStatus("Loading your dashboard...");

//         const { data: profile, error: profileError } = await supabase
//           .from("profiles")
//           .select("role")
//           .eq("id", user.id)
//           .single();

//         if (profileError || !profile) {
//           setError("User role not assigned. Contact admin.");
//           return;
//         }

//         // 7. Redirect based on role
//         if (profile.role === "admin") {
//           router.replace("/admin/dashboard");
//         } else if (profile.role === "operations") {
//           router.replace("/operations/dashboard");
//         } else {
//           setError("Unauthorized role.");
//         }
//       } catch (err) {
//         console.error(err);
//         setError(err.message || "Something went wrong.");
//       }
//     };

//     handlePostLogin();
//   }, [router]);

//   return (
//     <div className="h-screen flex items-center justify-center bg-[#e0f2f1]">
//       <div className="bg-white/40 backdrop-blur-xl border border-white/50 rounded-3xl px-10 py-8 shadow-xl text-center max-w-md">
        
//         {!error ? (
//           <>
//             <h2 className="text-xl font-semibold text-slate-800 mb-3">
//               Setting things up...
//             </h2>
//             <p className="text-slate-600 text-sm">{status}</p>

//             <div className="mt-6 animate-spin h-6 w-6 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto"></div>
//           </>
//         ) : (
//           <>
//             <h2 className="text-lg font-semibold text-red-600 mb-2">
//               Error
//             </h2>
//             <p className="text-sm text-slate-700">{error}</p>

//             <button
//               onClick={() => router.push("/login")}
//               className="mt-4 px-4 py-2 bg-emerald-500 text-white rounded-lg"
//             >
//               Go Back to Login
//             </button>
//           </>
//         )}
//       </div>
//     </div>
//   );
// }

"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function PostLogin() {
  const router = useRouter();

  const [status, setStatus] = useState("Initializing...");
  const [error, setError] = useState("");

  useEffect(() => {
    const handlePostLogin = async () => {
      try {
        setStatus("Checking session...");

        // 1. Get logged-in user
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          router.replace("/login");
          return;
        }

        // 2. Get session (Google token)
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const providerToken = session?.provider_token;

        if (!providerToken) {
          setError("Google permission missing. Please login again.");
          return;
        }

        // 3. Fetch profile (role + folder)
        setStatus("Checking storage setup...");

        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("role, drive_folder_id, is_active, status")
          .eq("id", user.id)
          .maybeSingle();

        if (profileError || !profileData) {
          setError("User profile not found. Contact admin.");
          return;
        }

        if (profileData.is_active === false || profileData.status === "Inactive") {
          await supabase.auth.signOut();
          setError("Your CRM access is inactive. Contact admin.");
          return;
        }

        let folderId = profileData.drive_folder_id;

        // 4. Create folder ONLY if not exists
        if (!folderId) {
          setStatus("Creating your Drive workspace...");

          const res = await fetch("/api/google-drive/create-folder", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              userName: user.email,
              accessToken: providerToken,
            }),
          });

          const data = await res.json();

          if (!res.ok) {
            throw new Error(data.error || "Failed to create folder");
          }

          folderId = data.folderId;

          // 5. Save folder ID in profiles table
          await supabase
            .from("profiles")
            .update({ drive_folder_id: folderId })
            .eq("id", user.id);
        }

        // 6. Redirect based on role
        setStatus("Loading your dashboard...");

        if (profileData.role === "admin") {
          router.replace("/admin/dashboard");
        } else if (profileData.role === "operations") {
          router.replace("/operations/dashboard");
        } else {
          setError("Unauthorized role.");
        }
      } catch (err) {
        console.error(err);
        setError(err.message || "Something went wrong.");
      }
    };

    handlePostLogin();
  }, [router]);

  return (
    <div className="h-screen flex items-center justify-center bg-[#e0f2f1]">
      <div className="bg-white/40 backdrop-blur-xl border border-white/50 rounded-3xl px-10 py-8 shadow-xl text-center max-w-md">
        
        {!error ? (
          <>
            <h2 className="text-xl font-semibold text-slate-800 mb-3">
              Setting things up...
            </h2>
            <p className="text-slate-600 text-sm">{status}</p>

            <div className="mt-6 animate-spin h-6 w-6 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto"></div>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-red-600 mb-2">
              Error
            </h2>
            <p className="text-sm text-slate-700">{error}</p>

            <button
              onClick={() => router.push("/login")}
              className="mt-4 px-4 py-2 bg-emerald-500 text-white rounded-lg"
            >
              Go Back to Login
            </button>
          </>
        )}
      </div>
    </div>
  );
}
