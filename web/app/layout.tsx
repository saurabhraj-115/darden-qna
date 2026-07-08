import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Darden Q&A",
  description: "Searchable knowledge base from Darden WhatsApp groups",
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
