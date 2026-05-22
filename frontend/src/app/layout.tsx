import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zoom Clone — Modern Video Conferencing",
  description: "Host and join secure video meetings with chat, screen share, and more.",
};

export const viewport: Viewport = {
  themeColor: "#0f1216",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
