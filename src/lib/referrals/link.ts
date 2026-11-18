export const REF_COOKIE = "kizuna_ref";

export function refCookie(code: string) {
  return {
    name: REF_COOKIE,
    value: code,
    maxAge: 60 * 60 * 24 * 30,
    sameSite: "lax" as const,
    path: "/",
  };
}

export function referralUrl(origin: string, code: string) {
  return `${origin}/join/${code}`;
}
