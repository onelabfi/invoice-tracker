"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Globe,
  User,
  Building2,
  Upload,
  ArrowRight,
  Shield,
  Lock,
  Loader2,
  CheckCircle,
  FileUp,
} from "lucide-react";
import { useTranslation, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n";
import { setOnboardingState } from "@/lib/onboarding";
import { BankConnections } from "@/components/bank-connections";

type Step = "language" | "name" | "bank" | "upload";
const STEPS: Step[] = ["language", "name", "bank", "upload"];

function StepDots({ current }: { current: Step }) {
  const idx = STEPS.indexOf(current);
  return (
    <div className="flex items-center justify-center gap-2 py-6">
      {STEPS.map((s, i) => (
        <div
          key={s}
          className={`h-2 rounded-full transition-all duration-300 ${
            i === idx
              ? "w-6 bg-[#1e3a5f]"
              : i < idx
                ? "w-2 bg-[#1e3a5f]/40"
                : "w-2 bg-gray-200"
          }`}
        />
      ))}
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const { t, setLocale } = useTranslation();
  const [step, setStep] = useState<Step>("language");
  const [name, setName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadDone, setUploadDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function advance() {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) {
      setStep(STEPS[idx + 1]);
    }
  }

  function finish() {
    setOnboardingState({ onboarded: true });
    window.location.href = "/app";
  }

  // ── STEP 1: Language ──────────────────────────────────────
  if (step === "language") {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <StepDots current={step} />
        <div className="flex-1 px-5 pb-8">
          <div className="flex items-center justify-center mb-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50">
              <Globe className="h-6 w-6 text-[#1e3a5f]" />
            </div>
          </div>
          <h1 className="text-xl font-extrabold text-gray-900 text-center mb-8">
            {t("onboarding_choose_language")}
          </h1>
          <div className="grid grid-cols-2 gap-2">
            {SUPPORTED_LOCALES.map((loc) => (
              <button
                key={loc.code}
                onClick={() => {
                  setLocale(loc.code);
                  setOnboardingState({ language: loc.code });
                  // Small delay so user sees the selection
                  setTimeout(advance, 200);
                }}
                className="flex items-center gap-3 rounded-xl bg-gray-50 p-3.5 text-left hover:bg-blue-50 hover:ring-1 hover:ring-[#1e3a5f]/20 transition-all min-h-[48px]"
              >
                <span className="text-xl">{loc.flag}</span>
                <span className="text-sm font-medium text-gray-900">{loc.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── STEP 2: Name ──────────────────────────────────────────
  if (step === "name") {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <StepDots current={step} />
        <div className="flex-1 px-5 pb-8 flex flex-col">
          <div className="flex items-center justify-center mb-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50">
              <User className="h-6 w-6 text-[#1e3a5f]" />
            </div>
          </div>
          <h1 className="text-xl font-extrabold text-gray-900 text-center mb-8">
            {t("onboarding_name_title")}
          </h1>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("onboarding_name_placeholder")}
            className="input-field text-center text-lg font-medium mb-6"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) {
                setOnboardingState({ name: name.trim() });
                advance();
              }
            }}
          />
          <div className="mt-auto">
            <button
              onClick={() => {
                if (name.trim()) {
                  setOnboardingState({ name: name.trim() });
                }
                advance();
              }}
              className="btn-primary w-full flex items-center justify-center gap-2 min-h-[48px]"
            >
              {t("onboarding_continue")}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── STEP 3: Bank Connection ───────────────────────────────
  if (step === "bank") {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <StepDots current={step} />
        <div className="flex-1 px-5 pb-8 flex flex-col">
          <div className="flex items-center justify-center mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50">
              <Building2 className="h-6 w-6 text-[#1e3a5f]" />
            </div>
          </div>
          <h1 className="text-xl font-extrabold text-gray-900 text-center mb-2">
            {t("onboarding_bank_title")}
          </h1>
          <p className="text-sm text-gray-500 text-center mb-4">
            {t("onboarding_bank_desc")}
          </p>

          {/* Trust badges */}
          <div className="flex items-center justify-center gap-4 mb-4">
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <Shield className="h-3.5 w-3.5" />
              {t("onboarding_bank_trust_1")}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <Lock className="h-3.5 w-3.5" />
              {t("onboarding_bank_trust_2")}
            </div>
          </div>

          {/* Reuse existing bank connections wizard */}
          <div className="card flex-1 overflow-y-auto">
            <BankConnections
              initialStep="country"
              onComplete={() => {
                setOnboardingState({ bank_connected: true });
                advance();
              }}
            />
          </div>

          {/* Skip */}
          <button
            onClick={advance}
            className="mt-4 text-sm font-medium text-gray-400 hover:text-gray-600 transition-colors text-center py-2"
          >
            {t("onboarding_skip")}
          </button>
        </div>
      </div>
    );
  }

  // ── STEP 4: Upload (optional) ─────────────────────────────
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("source", "upload");
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (res.ok) {
        setUploadDone(true);
        setTimeout(finish, 1200);
      }
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <StepDots current={step} />
      <div className="flex-1 px-5 pb-8 flex flex-col items-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 mb-6">
          {uploadDone ? (
            <CheckCircle className="h-6 w-6 text-emerald-500" />
          ) : (
            <FileUp className="h-6 w-6 text-[#1e3a5f]" />
          )}
        </div>
        <h1 className="text-xl font-extrabold text-gray-900 text-center mb-2">
          {t("onboarding_upload_title")}
        </h1>
        <p className="text-sm text-gray-500 text-center mb-8">
          {t("onboarding_upload_desc")}
        </p>

        {/* Upload zone */}
        <label className="w-full flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-gray-200 py-10 cursor-pointer hover:border-[#1e3a5f] hover:bg-blue-50/30 transition-all mb-6">
          {uploading ? (
            <Loader2 className="h-8 w-8 animate-spin text-[#1e3a5f]" />
          ) : uploadDone ? (
            <CheckCircle className="h-8 w-8 text-emerald-500" />
          ) : (
            <Upload className="h-8 w-8 text-gray-300" />
          )}
          <span className="text-sm text-gray-500">
            {uploading
              ? t("processing")
              : uploadDone
                ? t("invoice_processed")
                : t("drag_and_drop")}
          </span>
          <span className="text-[11px] text-gray-400">{t("file_types")}</span>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            onChange={handleFileUpload}
            className="hidden"
            disabled={uploading || uploadDone}
          />
        </label>

        <div className="mt-auto w-full">
          <button
            onClick={finish}
            className="btn-primary w-full flex items-center justify-center gap-2 min-h-[48px]"
          >
            {t("onboarding_finish")}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
