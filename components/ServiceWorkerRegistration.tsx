"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      // In development, unregister any existing SW to avoid stale caches
      if (process.env.NODE_ENV === "development") {
        navigator.serviceWorker.getRegistrations().then((regs) => {
          regs.forEach((r) => r.unregister());
        });
        return;
      }

      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          console.log("[Ricordo SW] registered:", reg.scope);
        })
        .catch((err) => {
          console.warn("[Ricordo SW] registration failed:", err);
        });
    }
  }, []);

  return null;
}
