import type { Metadata } from "next";
import { BookingLinkView } from "./BookingLinkView";

export const metadata: Metadata = {
  title: "Ваша запись — nook",
  robots: { index: false, follow: false },
};

// Ссылка на одну запись, которую мастер отправил клиенту по SMS или в мессенджер
export default async function BookingLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <BookingLinkView token={token} />;
}
