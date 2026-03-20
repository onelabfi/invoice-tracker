"use client";

import { useEffect, useState } from "react";
import { CheckCircle, EyeOff, Clock } from "lucide-react";

interface ToastProps {
  message: string;
  type?: "success" | "info" | "neutral";
  duration?: number;
  onDone?: () => void;
}

export function Toast({ message, type = "success", duration = 3000, onDone }: ToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDone?.(), 300);
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onDone]);

  const Icon =
    type === "success" ? CheckCircle : type === "info" ? Clock : EyeOff;
  const colors =
    type === "success"
      ? "bg-emerald-900 text-white"
      : type === "info"
      ? "bg-blue-900 text-white"
      : "bg-gray-800 text-white";

  return (
    <div
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg transition-all duration-300 ${colors} ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"
      }`}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      <span className="text-sm font-medium">{message}</span>
    </div>
  );
}
