import { createServerClient } from "@supabase/ssr";
import createMiddleware from "next-intl/middleware";
import { type NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";
import { refCookie } from "./lib/referrals/link";

const intl = createMiddleware(routing);

// open to visitors: sign-in, joining, and the rules / rarities / legal pages
const EXEMPT = ["/login", "/invite", "/auth", "/join", "/rules", "/rarities", "/terms", "/privacy", "/banned"];

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
    // refreshes the session; the token is checked locally (no trip to the auth server)
    const { data } = await supabase.auth.getClaims();
    const user = data ? { id: data.claims.sub } : null;
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

  // the signed token is checked locally (the project signs with asymmetric keys),
  // refreshing the session when it has expired: no trip to the auth server per request
  const { data } = await supabase.auth.getClaims();
  const user = data ? { id: data.claims.sub } : null;
  if (!user) return redirectTo("/login");
  // link prefetches (a dozen per page) skip the player check: the navigation itself runs it
  if (request.headers.get("next-router-prefetch")) return response;

  const { data: player } = await supabase
    .from("players")
    .select("id, banned_at")
    .eq("id", user.id)
    .maybeSingle();
  if (!player) return redirectTo("/invite");
  // a banned player's session may live on until its token expires: keep them out of the game
  if (player.banned_at) return redirectTo("/banned");

  return response;
}

export const config = {
  matcher: "/((?!api|_next|_vercel|icon$|icon/|apple-icon$|apple-icon/|icons/|.*\\..*).*)",
};
