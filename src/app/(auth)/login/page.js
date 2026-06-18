"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError("");

    const { error: googleError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        scopes: "https://www.googleapis.com/auth/drive.file",
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (googleError) {
      setError(googleError.message);
      setLoading(false);
    }
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    const { data, error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (loginError) {
      setError(loginError.message || "Invalid email or password.");
      setLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, is_active, status")
      .eq("id", data.user.id)
      .single();

    if (profileError || !profile) {
      await supabase.auth.signOut();
      setError("User role not assigned. Contact admin.");
      setLoading(false);
      return;
    }

    if (profile.is_active === false || profile.status === "Inactive") {
      await supabase.auth.signOut();
      setError("Your CRM access is inactive. Contact admin.");
      setLoading(false);
      return;
    }

    if (profile.role === "admin") {
      router.replace("/admin/dashboard");
    } else if (profile.role === "operations") {
      router.replace("/operations/dashboard");
    } else {
      setError("Unauthorized role.");
      setLoading(false);
    }
  };

  return (
    <main className="relative h-dvh overflow-hidden bg-[linear-gradient(135deg,#f8fbff_0%,#eef8f5_48%,#eaf2ff_100%)] text-slate-950 login-page">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-7rem] top-[-8rem] h-80 w-80 rounded-full bg-blue-200/45 blur-3xl" />
        <div className="absolute bottom-[-8rem] right-[-7rem] h-96 w-96 rounded-full bg-emerald-200/45 blur-3xl" />
      </div>

      <section className="relative mx-auto grid h-dvh w-full max-w-6xl items-center gap-8 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_430px] lg:px-8">
        <div className="hidden lg:block">
          <div className="inline-flex rounded-3xl border border-white/80 bg-white/80 p-3 shadow-[0_18px_45px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <Image
              src="/images/logo/logo.png"
              alt="Ideas2Invest"
              width={172}
              height={84}
              priority
              className="h-auto w-[172px] object-contain"
            />
          </div>

          <div className="mt-12 max-w-xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white/70 px-4 py-2 text-sm font-semibold text-blue-700 shadow-sm backdrop-blur">
              <ShieldCheck size={16} />
              Secure CRM Workspace
            </p>
            <h1 className="mt-5 text-5xl font-semibold leading-tight tracking-tight text-slate-950">
              <span className="text-[#FF671F]">Manage.</span> <span className="text-blue-500">Scale.</span> <span className="text-[#5fb132]">Prosper.</span>
            </h1>
            <p className="mt-4 text-base leading-7 text-slate-600">
              Sign in to manage clients, documents, tasks, SIP reports, and internal team coordination.
            </p>
          </div>
        </div>

        <div className="mx-auto w-full max-w-[430px]">
          <div className="mb-6 flex justify-center lg:hidden">
            <Image
              src="/images/logo/logo.png"
              alt="Ideas2Invest"
              width={158}
              height={76}
              priority
              className="h-auto w-[158px] object-contain"
            />
          </div>

          <div className="rounded-[2rem] border border-white/85 bg-white/82 p-6 shadow-[0_28px_80px_rgba(15,23,42,0.12)] backdrop-blur-2xl">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">CRM Login</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Welcome back</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Use your authorized CRM account to continue.
              </p>
            </div>

            <form onSubmit={handleLogin} className="mt-7 space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">Email address</span>
                <span className="relative block">
                  <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    disabled={loading}
                    className="w-full rounded-2xl border border-slate-200 bg-white/95 py-3 pl-12 pr-4 text-slate-900 shadow-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                    placeholder="name@ideas2invest.in"
                  />
                </span>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">Password</span>
                <span className="relative block">
                  <LockKeyhole size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    disabled={loading}
                    className="w-full rounded-2xl border border-slate-200 bg-white/95 py-3 pl-12 pr-12 text-slate-900 shadow-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                    placeholder="Enter password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-700"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <Eye size={19} /> : <EyeOff size={19} />}
                  </button>
                </span>
              </label>

              {error && (
                <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {error}
                </div>
              )}

              <button
                disabled={loading}
                className="inline-flex w-full tracking-wide items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-700 to-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-700/20 transition hover:brightness-105 cursor-pointer disabled:opacity-60"
              >
                {loading ? "Signing in..." : "Sign in"}
                {!loading && <ArrowRight size={18} />}
              </button>

              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-slate-200" />
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">or</span>
                <span className="h-px flex-1 bg-slate-200" />
              </div>

              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={loading}
                className="inline-flex w-full items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white/95 px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Image src="/images/logo/google-logo.png" alt="Google" width={20} height={20} />
                Continue with Google
              </button>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
