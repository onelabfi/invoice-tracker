"use client";

import { useState, useRef, useCallback } from "react";
import { useTranslation } from "@/lib/i18n";
import {
  Upload,
  X,
  FileText,
  Loader2,
  AlertTriangle,
  Camera,
  CheckCircle,
  Edit3,
} from "lucide-react";
import { ManualEntryForm } from "./manual-entry-form";

interface UploadDialogProps {
  open: boolean;
  onClose: () => void;
  onUploaded: () => void;
  initialTab?: "camera" | "file" | "manual";
}

type DialogTab = "camera" | "file" | "manual";

interface ExtractedData {
  vendor: string;
  amount: number;
  currency: string;
  invoiceNumber: string | null;
  dueDate: string | null;
  description: string | null;
  iban: string | null;
  reference: string | null;
  confidence: number;
}

export function UploadDialog({
  open,
  onClose,
  onUploaded,
  initialTab = "file",
}: UploadDialogProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<DialogTab>(initialTab);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{
    invoice: Record<string, unknown>;
    extracted: ExtractedData;
    duplicateCheck: {
      isDuplicate: boolean;
      isReminder: boolean;
      confidence: number;
      reason: string;
    };
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFileSelected = (selectedFile: File) => {
    setFile(selectedFile);
    setResult(null);
    setError(null);

    // Generate preview for images
    if (selectedFile.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target?.result as string);
      reader.readAsDataURL(selectedFile);
    } else {
      setPreview(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("source", tab === "camera" ? "camera" : "upload");

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }

      const data = await res.json();
      setResult(data);
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    setTab(initialTab);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
      <div className="relative w-full max-w-lg rounded-t-2xl sm:rounded-2xl bg-white shadow-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white rounded-t-2xl border-b border-gray-100 px-5 pt-5 pb-3">
          <button
            onClick={handleClose}
            className="absolute right-4 top-4 rounded-full p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>

          <h2 className="text-lg font-bold text-gray-900 mb-3">
            {t("add_invoice")}
          </h2>

          {/* Tab selector */}
          {!result && (
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
              <button
                onClick={() => {
                  setTab("camera");
                  setFile(null);
                  setPreview(null);
                  setError(null);
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-colors ${
                  tab === "camera"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500"
                }`}
              >
                <Camera className="h-4 w-4" />
                {t("camera")}
              </button>
              <button
                onClick={() => {
                  setTab("file");
                  setFile(null);
                  setPreview(null);
                  setError(null);
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-colors ${
                  tab === "file"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500"
                }`}
              >
                <FileText className="h-4 w-4" />
                {t("file")}
              </button>
              <button
                onClick={() => {
                  setTab("manual");
                  setFile(null);
                  setPreview(null);
                  setError(null);
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-colors ${
                  tab === "manual"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500"
                }`}
              >
                <Edit3 className="h-4 w-4" />
                {t("manual")}
              </button>
            </div>
          )}
        </div>

        <div className="p-5">
          {/* Result view */}
          {result ? (
            <div className="space-y-4">
              {/* Success */}
              <div className="flex flex-col items-center py-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 mb-3">
                  <CheckCircle className="h-7 w-7 text-emerald-600" />
                </div>
                <p className="text-base font-semibold text-gray-900">
                  {t("invoice_processed")}
                </p>
              </div>

              {/* Extracted data */}
              <div className="rounded-xl bg-gray-50 p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">{t("vendor")}</span>
                  <span className="font-semibold text-gray-900">
                    {String(result.extracted.vendor)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">{t("amount")}</span>
                  <span className="font-semibold text-gray-900">
                    {result.extracted.amount} {String(result.extracted.currency)}
                  </span>
                </div>
                {result.extracted.invoiceNumber && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">{t("invoice_hash")}</span>
                    <span className="font-medium text-gray-900">
                      {String(result.extracted.invoiceNumber)}
                    </span>
                  </div>
                )}
                {result.extracted.dueDate && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">{t("due_date")}</span>
                    <span className="font-medium text-gray-900">
                      {String(result.extracted.dueDate)}
                    </span>
                  </div>
                )}
                {result.extracted.iban && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">{t("iban")}</span>
                    <span className="font-medium text-gray-900 font-mono text-xs">
                      {String(result.extracted.iban)}
                    </span>
                  </div>
                )}
                {result.extracted.confidence !== undefined && (
                  <div className="flex justify-between text-sm pt-1 border-t border-gray-200">
                    <span className="text-gray-500">{t("confidence")}</span>
                    <span className="font-medium text-gray-900">
                      {Math.round(result.extracted.confidence * 100)}%
                    </span>
                  </div>
                )}
              </div>

              {/* Duplicate/Reminder warning */}
              {(result.duplicateCheck.isDuplicate ||
                result.duplicateCheck.isReminder) && (
                <div className="rounded-xl bg-orange-50 border border-orange-200 p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-orange-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <h3 className="font-semibold text-orange-800">
                        {result.duplicateCheck.isReminder
                          ? t("reminder_detected")
                          : t("possible_duplicate_upload")}
                      </h3>
                      <p className="mt-1 text-sm text-orange-700">
                        {result.duplicateCheck.reason}
                      </p>
                      <p className="mt-1 text-xs text-orange-600">
                        {t("confidence")}:{" "}
                        {Math.round(result.duplicateCheck.confidence * 100)}%
                      </p>
                      <p className="mt-2 text-sm font-semibold text-orange-800">
                        {t("do_not_pay_separately")}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <button onClick={handleClose} className="btn-primary w-full">
                {t("done")}
              </button>
            </div>
          ) : tab === "manual" ? (
            <ManualEntryForm
              onSaved={() => {
                onUploaded();
                handleClose();
              }}
              onCancel={handleClose}
            />
          ) : tab === "camera" ? (
            <>
              {/* Camera input */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
                className="hidden"
              />

              {file && preview ? (
                <div className="space-y-4">
                  <div className="rounded-xl overflow-hidden border border-gray-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={preview}
                      alt="Captured invoice"
                      className="w-full object-contain max-h-64"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-600 truncate flex-1">
                      {file.name}
                    </p>
                    <button
                      onClick={() => {
                        setFile(null);
                        setPreview(null);
                      }}
                      className="text-sm text-red-500 hover:text-red-700 font-medium ml-2"
                    >
                      {t("retake")}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  className="w-full flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-gray-300 p-12 text-center hover:border-blue-400 hover:bg-blue-50/50 transition-all"
                >
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-100">
                    <Camera className="h-10 w-10 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-base font-semibold text-gray-900">
                      {t("take_a_photo")}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      {t("open_camera_desc")}
                    </p>
                  </div>
                </button>
              )}

              {error && (
                <div className="mt-3 rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              {file && (
                <div className="mt-4 flex gap-3">
                  <button onClick={handleClose} className="btn-secondary flex-1">
                    {t("cancel")}
                  </button>
                  <button
                    onClick={handleUpload}
                    disabled={uploading}
                    className="btn-primary flex-1"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t("scanning")}
                      </>
                    ) : (
                      t("scan_invoice")
                    )}
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              {/* File upload */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp"
                onChange={handleFileChange}
                className="hidden"
              />

              <div
                className={`relative rounded-2xl border-2 border-dashed p-8 text-center transition-all ${
                  dragActive
                    ? "border-blue-400 bg-blue-50"
                    : "border-gray-300 hover:border-gray-400"
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                {file ? (
                  <div className="flex flex-col items-center gap-3">
                    {preview ? (
                      <div className="rounded-xl overflow-hidden border border-gray-200 w-full max-h-40">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={preview}
                          alt="Preview"
                          className="w-full object-contain max-h-40"
                        />
                      </div>
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100">
                        <FileText className="h-7 w-7 text-blue-500" />
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {file.name}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {(file.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setFile(null);
                        setPreview(null);
                      }}
                      className="text-xs text-red-500 hover:text-red-700 font-medium"
                    >
                      {t("remove")}
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
                      <Upload className="h-7 w-7 text-gray-400" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">
                        {t("drag_and_drop")}{" "}
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="font-semibold text-blue-600 hover:text-blue-700"
                        >
                          {t("browse")}
                        </button>
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {t("file_types")}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {error && (
                <div className="mt-3 rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="mt-4 flex gap-3">
                <button onClick={handleClose} className="btn-secondary flex-1">
                  {t("cancel")}
                </button>
                <button
                  onClick={handleUpload}
                  disabled={!file || uploading}
                  className="btn-primary flex-1"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("processing")}
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      {t("upload_and_analyze")}
                    </>
                  )}
                </button>
              </div>
            </>
          )}

          {/* Scanning animation overlay */}
          {uploading && (
            <div className="mt-4 flex flex-col items-center py-4">
              <div className="relative">
                <div className="h-16 w-16 rounded-full border-4 border-blue-200 animate-pulse" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-8 w-8 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
                </div>
              </div>
              <p className="text-sm font-medium text-gray-600 mt-3">
                {t("ai_reading_invoice")}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {t("extracting_details")}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
