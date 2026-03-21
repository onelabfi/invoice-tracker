"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Mail, Lock, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useTranslation } from "@/lib/i18n";

export default function SignupPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError(t("signup_password_too_short"));
      return;
    }
    if (password !== confirm) {
      setError(t("signup_passwords_mismatch"));
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error: authError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
      });

      if (authError) {
        setError(authError.message);
        return;
      }

      // If Supabase requires email confirmation the session will be null
      if (data.session) {
        // Hard redirect ensures cookies are sent on the next full page load
        window.location.href = "/app";
      } else {
        // Email confirmation required
        setSuccess(true);
      }
    } catch (err) {
      console.error("[Signup] caught error:", err);
      setError(
        err instanceof Error ? err.message : t("signup_generic_error")
      );
    } finally {
      setLoading(false);
    }
  }

  // Success state — email confirmation sent
  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-6">
        <div className="w-full max-w-sm">
          <div className="card p-8 flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 mb-4">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              {t("signup_check_inbox")}
            </h2>
            <p className="text-sm text-gray-500 leading-relaxed">
              {t("signup_confirmation_sent", { email })}
            </p>
            <Link
              href="/login"
              className="mt-6 text-sm font-semibold text-[#1e3a5f] hover:underline"
            >
              {t("signup_back_to_login")}
            </Link>
          </div>
        </div>
      </div>
    );
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
          <form onSubmit={handleSignup} className="space-y-3">
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
                autoComplete="new-password"
                required
              />
            </div>

            {/* Confirm password */}
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder={t("signup_confirm_password")}
                className="input-field pl-11"
                autoComplete="new-password"
                required
              />
            </div>

            {/* Strength hint */}
            <p className="text-[11px] text-gray-400 px-1">
              {t("signup_min_chars")}
            </p>

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
                  {t("signup_creating")}
                </>
              ) : (
                t("signup_create")
              )}
            </button>
          </form>

          {/* Login link */}
          <p className="mt-5 text-center text-sm text-gray-500">
            {t("signup_already_have_account")}{" "}
            <Link
              href="/login"
              className="font-semibold text-[#1e3a5f] hover:underline"
            >
              {t("login_log_in")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
