import type { Metadata, Viewport } from "next";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";

export const metadata: Metadata = {
  title: "Ricordo — Your AI Payment Memory",
  description: "AI-powered bill management. Never pay twice.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Ricordo",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    // Android Chrome — installable
    "mobile-web-app-capable": "yes",
    // Prevent phone number detection
    "format-detection": "telephone=no",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0f172a",
  viewportFit: "cover",          // fills the iPhone notch/island area
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* PWA icons */}
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <link rel="apple-touch-icon" sizes="192x192" href="/icon-192.png" />
        <link rel="apple-touch-icon" sizes="512x512" href="/icon-512.png" />

        {/* iOS splash screen — full-screen when launched from home screen */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Ricordo" />

        {/* Fonts */}
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen font-['Inter',system-ui,sans-serif] bg-gray-200">
        {/* Service Worker registration (client-only, silent) */}
        <ServiceWorkerRegistration />

        {/* Mobile phone frame on desktop */}
        <div className="mx-auto max-w-[430px] min-h-screen bg-gray-50 relative shadow-2xl md:my-4 md:rounded-[2.5rem] md:min-h-[calc(100vh-2rem)] md:border md:border-gray-300 md:overflow-hidden">
          {/* Notch */}
          <div className="hidden md:block absolute top-0 left-1/2 -translate-x-1/2 w-[120px] h-[28px] bg-gray-200 rounded-b-2xl z-[60]" />
          <div className="relative min-h-screen md:min-h-[calc(100vh-2rem)]">
            <I18nProvider>
              {children}
            </I18nProvider>
          </div>
        </div>
      </body>
    </html>
  );
}
