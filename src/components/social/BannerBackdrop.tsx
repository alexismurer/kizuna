import { bannerStyle } from "@/lib/cosmetics";

// A profile banner drawn in CSS; fills its (relative, overflow-hidden) parent.
export function BannerBackdrop({ id }: { id: string | null | undefined }) {
  const style = bannerStyle(id);
  if (!style) return null;
  return <div aria-hidden data-banner={style} className={`banner banner-${style}`} />;
}
