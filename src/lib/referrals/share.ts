import { REFERRAL_BOOSTERS } from "@/config/app";
export function shareText(t: (key: string, values?: Record<string, string | number>) => string, url: string): string {
  return t("shareText", { link: url, boosters: REFERRAL_BOOSTERS });
}

// Share sheet when asked and available, else the clipboard; "cancelled" means the sheet was dismissed; "fallback" means neither worked
// and the caller should show the link selected so it can be copied by hand.
export async function copyOrShare(
  url: string,
  text: string,
  mode: "copy" | "share",
): Promise<"copied" | "shared" | "cancelled" | "fallback"> {
  if (mode === "share" && typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ text });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
    }
  }
  try {
    if (!navigator.clipboard) throw new Error("no clipboard");
    await navigator.clipboard.writeText(mode === "share" ? text : url);
    return "copied";
  } catch {
    return "fallback";
  }
}
