"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
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
