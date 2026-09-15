import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import { DialogProvider } from "@/components/DialogProvider";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "nook",
  description: "Онлайн-запись для частных мастеров — проще, чем блокнот",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#ffffff" };

// Продукт только для телефона: на десктопе показываем колонку шириной с телефон
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" className={inter.variable}>
      <body className="bg-surface-soft">
        <DialogProvider>
          <div className="mx-auto min-h-dvh max-w-md bg-white shadow-[0_0_0_1px_var(--color-hairline-soft)]">{children}</div>
        </DialogProvider>
      </body>
    </html>
  );
}
