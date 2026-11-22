import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

// A market card opens its wiki page; hover lifts it.
export function MarketCardLink({
  sourceId,
  name,
  children,
}: {
  sourceId: number | undefined;
  name: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("market");
  if (sourceId === undefined) return <>{children}</>;
  return (
    <Link
      href={`/wiki/${sourceId}`}
      aria-label={t("openCard", { name })}
      className="block rounded-xl transition-transform duration-[180ms] hover:-translate-y-[3px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
    >
      {children}
    </Link>
  );
}
