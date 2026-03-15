/** @type {import('next').NextConfig} */
const nextConfig = {
  // Supabase public credentials — anon key + URL are intentionally public
  // (designed to be exposed in the browser). Secret operations use service_role
  // key which lives only in server-side env vars and is never committed.
  env: {
    NEXT_PUBLIC_SUPABASE_URL: "https://wvhquananouqvpfqqpoy.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2aHF1YW5hbm91cXZwZnFxcG95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Nzg4MjIsImV4cCI6MjA4OTE1NDgyMn0.yZxq_NSwbFiDtVHcjO_1GmOWS-i-v7yqy0AiU1Oveco",
  },
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client"],
  },
  async headers() {
    return [
      {
        // Service worker must be served from root with no cache
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        // Manifest should always be fresh
        source: "/manifest.json",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
