import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "nook_session";

// Кабинет мастера (/app) — только с сессией; /login с сессией — сразу в кабинет
export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has(SESSION_COOKIE);
  const { pathname } = req.nextUrl;
  const redirectTo = (path: string) => {
    const url = req.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    return NextResponse.redirect(url);
  };
  if (pathname.startsWith("/app") && !hasSession) return redirectTo("/login");
  if (pathname === "/login" && hasSession) return redirectTo("/app");
  return NextResponse.next();
}

export const config = {
  matcher: ["/app", "/app/:path*", "/login"],
};
