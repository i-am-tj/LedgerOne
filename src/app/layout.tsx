import type { Metadata } from "next";
import { ThemeProvider } from "@/components/shell/theme-provider";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "LedgerOne", template: "%s · LedgerOne" },
  description: "A clearer view of your financial life.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
