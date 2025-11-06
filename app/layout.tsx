import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PulseCanvas AR",
  description: "AR-powered beat collages with remix battles and cosmic vibes"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
