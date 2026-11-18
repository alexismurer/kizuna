import { createServerClient } from "@supabase/ssr";
import createMiddleware from "next-intl/middleware";
import { type NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";
import { refCookie } from "./lib/referrals/link";

const intl = createMiddleware(routing);

const EXEMPT = ["/login", "/invite", "/auth", "/join"];

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
          // a response carrying session cookies must never be shared by a cache
          response.headers.set("Cache-Control", "private, no-store");
          toSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const path = stripLocale(request.nextUrl.pathname);
  if (EXEMPT.some((p) => path === p || path.startsWith(`${p}/`))) {
    const {
      data: { user },
    } = await supabase.auth.getUser(); // refresh session
    const code = path.match(/^\/join\/([^/]+)/)?.[1];
    if (code) {
      let decoded = code;
      try {
        decoded = decodeURIComponent(code).trim();
      } catch {
        // not a valid code; skipped below
      }
      // players are redirected home by the page; only visitors who can still join keep the code
      if (/^[A-Za-z0-9]{8}$/.test(decoded)) {
        const { data: player } = user
          ? await supabase.from("players").select("id").eq("id", user.id).maybeSingle()
          : { data: null };
        if (!player) {
          const { name, value, ...options } = refCookie(decoded);
          response.cookies.set(name, value, options);
        }
      }
    }
    return response;
  }

  const redirectTo = (to: string) => {
    const res = NextResponse.redirect(new URL(to, request.url));
    response.cookies.getAll().forEach((c) => res.cookies.set(c));
    const cacheControl = response.headers.get("Cache-Control");
    if (cacheControl) res.headers.set("Cache-Control", cacheControl);
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
  matcher: "/((?!api|_next|_vercel|icon$|icon/|apple-icon$|apple-icon/|icons/|.*\\..*).*)",
};
