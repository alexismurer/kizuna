import { createServerClient } from "@supabase/ssr";
import createMiddleware from "next-intl/middleware";
import { type NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";

const intl = createMiddleware(routing);

const EXEMPT = ["/login", "/invite", "/auth"];

function stripLocale(pathname: string) {
  for (const l of routing.locales) {
    if (pathname === `/${l}`) return "/";
    if (pathname.startsWith(`/${l}/`)) return pathname.slice(l.length + 1);
  }
  return pathname;
}

// Route handlers outside [locale] (e.g. the OAuth callback) must not be
// rewritten to /en/... by next-intl.
const isAuthRoute = (pathname: string) =>
  pathname === "/auth" || pathname.startsWith("/auth/");

export default async function proxy(request: NextRequest) {
  const response = isAuthRoute(request.nextUrl.pathname)
    ? NextResponse.next()
    : (intl(request) ?? NextResponse.next());

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(toSet) {
          toSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const path = stripLocale(request.nextUrl.pathname);
  if (EXEMPT.some((p) => path === p || path.startsWith(`${p}/`))) {
    await supabase.auth.getUser(); // refresh session
    return response;
  }

  const redirectTo = (to: string) => {
    const res = NextResponse.redirect(new URL(to, request.url));
    response.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return redirectTo("/login");

  const { data: player } = await supabase
    .from("players")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (!player) return redirectTo("/invite");

  return response;
}

export const config = {
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
