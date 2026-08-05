import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Movie Studio 2",
  description: "Professional AI Filmmaking Workstation",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-studio-bg text-studio-text antialiased">{children}</body>
    </html>
  );
}
