"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Mail, Lock, Loader2, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useTranslation } from "@/lib/i18n";

export default function LoginPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (authError) {
        setError(
          authError.message === "Invalid login credentials"
            ? t("login_incorrect_credentials")
            : authError.message
        );
        return;
      }

      // Hard redirect ensures cookies are sent on the next full page load
      window.location.href = "/app";
    } catch (err) {
      console.error("[Login] caught error:", err);
      setError(
        err instanceof Error ? err.message : t("login_generic_error")
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-6">
      <div className="w-full max-w-sm">
        <div className="card p-8">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <img
              src="/ricordo-logo.png"
              alt="Ricordo"
              className="h-32 w-auto mb-2"
            />
            <p className="text-sm text-gray-500 mt-1">{t("app_tagline")}</p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-3">
            {/* Email */}
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("login_email_placeholder")}
                className="input-field pl-11"
                autoComplete="email"
                autoFocus
                required
              />
            </div>

            {/* Password */}
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("login_password_placeholder")}
                className="input-field pl-11"
                autoComplete="current-password"
                required
              />
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full mt-1 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("login_logging_in")}
                </>
              ) : (
                t("login_log_in")
              )}
            </button>
          </form>

          {/* Signup link */}
          <p className="mt-5 text-center text-sm text-gray-500">
            {t("login_no_account")}{" "}
            <Link
              href="/signup"
              className="font-semibold text-[#1e3a5f] hover:underline"
            >
              {t("login_create_account")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
