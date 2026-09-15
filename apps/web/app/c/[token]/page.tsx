import { ClientHome } from "./ClientHome";

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ booked?: string }>;
};

export default async function ClientPage({ params, searchParams }: Props) {
  const [{ token }, { booked }] = await Promise.all([params, searchParams]);
  return <ClientHome token={token} bookedId={booked ?? null} />;
}
