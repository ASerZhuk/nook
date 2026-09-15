export default function NotFound() {
  return (
    <main className="container-page flex min-h-dvh flex-col items-center justify-center py-16 text-center">
      <p className="text-[64px] font-bold leading-none tracking-[-1px]">404</p>
      <h1 className="mt-4 text-[22px] font-medium">Страница не найдена</h1>
      <p className="mt-2 text-sm text-muted">Проверьте адрес или вернитесь на главную.</p>
    </main>
  );
}
