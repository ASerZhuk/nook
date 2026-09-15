import type { Metadata } from "next";
import { Avatar } from "@/components/Avatar";
import { todayIn } from "@/lib/format";
import { getMasterPage } from "@/lib/server-api";
import { BookingFlow } from "./BookingFlow";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ service?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { master } = await getMasterPage(slug);
  return {
    title: `${master.name} — запись онлайн`,
    description: [master.specialty, master.address].filter(Boolean).join(" · ") || undefined,
  };
}

// Ссылка мастера для клиентов: карточка + запись по шагам
export default async function MasterBookingPage({ params, searchParams }: Props) {
  const [{ slug }, { service }] = await Promise.all([params, searchParams]);
  const { master, services } = await getMasterPage(slug);

  return (
    <main className="px-4 pb-6 pt-[calc(env(safe-area-inset-top)+24px)]">
      <div className="flex items-center gap-4">
        <Avatar name={master.name} url={master.avatar_url} size={64} />
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold leading-tight">{master.name}</h1>
          {master.specialty && <p className="mt-0.5 text-sm text-muted">{master.specialty}</p>}
        </div>
      </div>
      <div className="mt-4 space-y-1 text-sm text-body">
        {master.address && <p>{master.address}</p>}
        <a href={`tel:${master.phone}`} className="inline-block underline underline-offset-4">{master.phone}</a>
      </div>

      <BookingFlow
        slug={master.slug}
        services={services}
        today={todayIn(master.timezone)}
        initialServiceId={services.some((s) => s.id === service) ? (service ?? null) : null}
      />
    </main>
  );
}
