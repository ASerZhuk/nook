import type { Metadata } from "next";
import type { ReactNode } from "react";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  return {
    title: "Мои записи — nook",
    // у каждого клиента свой манифест: start_url с токеном, чтобы установленное приложение знало, чьи записи
    manifest: `/c/${token}/manifest.webmanifest`,
    appleWebApp: { capable: true, title: "Мои записи", statusBarStyle: "default" },
    robots: { index: false, follow: false },
  };
}

export default function ClientLayout({ children }: { children: ReactNode }) {
  return children;
}
