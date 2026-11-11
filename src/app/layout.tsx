import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "LedgerOne",
  description: "Private personal finance, built on a balanced ledger.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
