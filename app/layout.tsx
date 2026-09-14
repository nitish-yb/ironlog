import type { Metadata } from "next";
import "./globals.css";
import ServiceWorker from "./components/ServiceWorker";

export const metadata: Metadata = {
  title: "IronLog Workout Tracker",
  description: "A private, offline-first workout tracker with secure cross-device sync.",
  applicationName: "IronLog",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "IronLog" },
  formatDetection: { telephone: false },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}<ServiceWorker /></body>
    </html>
  );
}
