import type { Metadata } from "next";
import type { ReactNode } from "react";
import { MasterShell } from "@/components/admin/MasterShell";

export const metadata: Metadata = {
  title: "nook — кабинет мастера",
  manifest: "/app-manifest.webmanifest",
  appleWebApp: { capable: true, title: "nook", statusBarStyle: "default" },
  robots: { index: false, follow: false },
};

export default function MasterLayout({ children }: { children: ReactNode }) {
  return <MasterShell>{children}</MasterShell>;
}
