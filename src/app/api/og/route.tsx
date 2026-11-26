import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { APP_NAME, REFERRAL_BOOSTERS } from "@/config/app";
import { routing } from "@/i18n/routing";
import type { JoinPreview } from "@/components/referrals/JoinLanding";
import type { Rarity } from "@/lib/game/types";

// The wide link-preview image (Discord, WhatsApp, iMessage...): /api/og?locale=en
// for the site, plus &code=XXXXXXXX for an invite with the inviter's cards.

const SIZE = { width: 1200, height: 630 };
// keep in sync with the og:image size in src/app/[locale]/layout.tsx
const GLOW = "linear-gradient(115deg, #3a1226 0%, #0b0b0f 42%, #0b0b0f 62%, #33270a 100%)";
const BANNER = { width: 1200, height: 420 };
const MARK = `data:image/png;base64,${readFileSync(join(process.cwd(), "public/brand/kizuna-mark-white.png")).toString("base64")}`;
const GOLD = "#f5b301";
const RARITY: Record<Rarity, string> = {
  common: "#8a8f98",
  uncommon: "#3ccf7a",
  rare: "#3b82f6",
  epic: "#a855f7",
  legendary: GOLD,
  mythic: "#ff3d7f",
};
const FAN = [
  { rotate: -12, x: 0, y: 36 },
  { rotate: 0, x: 140, y: 0 },
  { rotate: 12, x: 280, y: 36 },
];

async function googleFont(family: string, weight: number) {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family}:wght@${weight}`)).text();
    const url = css.match(/src: url\((.+?)\) format/)?.[1];
    return url ? await (await fetch(url)).arrayBuffer() : null;
  } catch {
    return null;
  }
}

// inline the card art so one dead image link drops that card instead of the whole preview
async function inline(url: string) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "image/jpeg";
    if (!/^image\/(png|jpe?g|gif)/.test(type)) return null;
    return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
  } catch {
    return null;
  }
}

async function invite(code: string) {
  if (!/^[A-Za-z0-9]{8}$/.test(code)) return null;
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await supabase.rpc("referral_preview", { p_code: code });
  return (data as unknown as JoinPreview | null) ?? null;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const requested = params.get("locale");
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  const preview = await invite(params.get("code") ?? "");
  const t = await getTranslations({ locale, namespace: "join" });
  const home = await getTranslations({ locale, namespace: "home" });

  const cards = (
    await Promise.all(
      (preview?.cards ?? [])
        .filter((c) => c.imageUrl)
        .slice(0, 3)
        .map(async (c) => ({ ...c, src: await inline(c.imageUrl!) })),
    )
  ).filter((c) => c.src);
  // the showcase's first card sits in the middle and is drawn last, on top; two cards spread out
  const fan =
    cards.length === 3
      ? [
          { ...cards[1], slot: FAN[0] },
          { ...cards[2], slot: FAN[2] },
          { ...cards[0], slot: FAN[1] },
        ]
      : cards.map((c, i) => ({ ...c, slot: cards.length === 1 ? FAN[1] : FAN[i * 2] }));

  // the app's fonts; without them satori falls back to its bundled default
  const [bricolage, inter] = await Promise.all([googleFont("Bricolage+Grotesque", 800), googleFont("Inter", 600)]);
  const fonts = [
    ...(inter ? [{ name: "Inter", data: inter, weight: 600 as const, style: "normal" as const }] : []),
    ...(bricolage ? [{ name: "Bricolage", data: bricolage, weight: 800 as const, style: "normal" as const }] : []),
  ];
  const display = bricolage ? "Bricolage" : undefined;
  const headers = { "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" };

  // any other link: a short wide banner, small logo on the left and the words on the right
  if (!preview) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            gap: 56,
            padding: "0 80px",
            position: "relative",
            background: GLOW,
            color: "white",
            overflow: "hidden",
            fontFamily: inter ? "Inter" : undefined,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={MARK} width={220} height={220} alt="" />
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontFamily: display, fontSize: 96, fontWeight: 800, letterSpacing: 10, lineHeight: 1 }}>
              {APP_NAME.toUpperCase()}
            </div>
            <div style={{ fontSize: 38, color: "#d4d6db" }}>{home("title")}</div>
            <div style={{ display: "flex", marginTop: 10 }}>
              <div
                style={{
                  display: "flex",
                  padding: "8px 22px",
                  borderRadius: 999,
                  border: `2px solid ${GOLD}`,
                  color: GOLD,
                  fontSize: 26,
                }}
              >
                kizunagame.vercel.app
              </div>
            </div>
          </div>
        </div>
      ),
      { ...BANNER, fonts, headers },
    );
  }

  const headline = t("invited", { name: preview.username });

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: GLOW,
          color: "white",
          overflow: "hidden",
          fontFamily: inter ? "Inter" : undefined,
        }}
      >
        {/* faded ensō behind the text */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={MARK} width={560} height={560} alt="" style={{ position: "absolute", left: 300, top: 120, opacity: 0.05 }} />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "64px 0 64px 72px",
            width: cards.length ? 600 : 1056,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={MARK} width={64} height={64} alt="" />
            <div style={{ fontFamily: display, fontSize: 40, fontWeight: 800, letterSpacing: 6 }}>
              {APP_NAME.toUpperCase()}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            <div
              style={{
                fontFamily: display,
                fontSize: headline.length > 28 ? 56 : 64,
                fontWeight: 800,
                lineHeight: 1.05,
                letterSpacing: -1,
              }}
            >
              {headline}
            </div>
            <div style={{ display: "flex" }}>
              <div
                style={{
                  display: "flex",
                  padding: "14px 28px",
                  borderRadius: 999,
                  background: `linear-gradient(135deg, #ffd65c, ${GOLD})`,
                  color: "#1a1200",
                  fontSize: 32,
                  fontWeight: 700,
                  boxShadow: `0 0 40px rgba(245,179,1,0.45)`,
                }}
              >
                {t("cta", { boosters: REFERRAL_BOOSTERS })}
              </div>
            </div>
          </div>

          <div style={{ fontSize: 26, color: "#a1a5ad" }}>{home("title")}</div>
        </div>

        {cards.length > 0 && (
          <div style={{ position: "absolute", left: 690, top: 130, width: 490, height: 380, display: "flex" }}>
            {fan.map((c, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: c.slot.x,
                  top: c.slot.y,
                  width: 210,
                  height: 300,
                  display: "flex",
                  borderRadius: 18,
                  border: `5px solid ${RARITY[c.rarity]}`,
                  boxShadow: `0 0 36px ${RARITY[c.rarity]}`,
                  transform: `rotate(${c.slot.rotate}deg)`,
                  overflow: "hidden",
                  background: "#16161d",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.src!} width={200} height={290} alt="" style={{ objectFit: "cover" }} />
              </div>
            ))}
          </div>
        )}
      </div>
    ),
    {
      ...SIZE,
      fonts,
      headers,
    },
  );
}
