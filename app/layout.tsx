import type { Metadata, Viewport } from "next";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Ricordo — Your AI Payment Memory",
  description: "AI-powered bill management. Never pay twice.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen font-['Inter',system-ui,sans-serif] bg-gray-200">
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
