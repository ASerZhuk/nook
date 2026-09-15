import { cache } from "react";
import { notFound } from "next/navigation";
import type { PublicPage } from "./types";

const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:8000";

export const getMasterPage = cache(async (slug: string) => {
  const res = await fetch(`${API_URL}/api/p/${encodeURIComponent(slug)}`, { cache: "no-store" });
  if (res.status === 404 || res.status === 422) notFound();
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return (await res.json()) as PublicPage;
});
