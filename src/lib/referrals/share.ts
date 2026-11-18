export function shareText(t: (key: string, values?: Record<string, string>) => string, url: string): string {
  return t("shareText", { link: url });
}

// Share sheet when asked and available, else the clipboard; "fallback" means neither worked
// and the caller should show the link selected so it can be copied by hand.
export async function copyOrShare(
  url: string,
  text: string,
  mode: "copy" | "share",
): Promise<"copied" | "shared" | "fallback"> {
  if (mode === "share" && typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ text, url });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "fallback";
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
