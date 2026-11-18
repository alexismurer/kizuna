import { Gift } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

// desktop header: phones reach the invite page from the More sheet
export function InviteButton() {
  const t = useTranslations("referrals");
  return (
    <Link
      href="/invite-friends"
      className="hidden h-8 shrink-0 items-center gap-2 rounded-full border border-border px-3 text-sm hover:text-accent md:flex"
    >
      <Gift className="h-4 w-4" aria-hidden />
      <span>{t("invite")}</span>
      <span className="rounded-full bg-accent px-1.5 text-xs font-bold text-black">{t("inviteChip")}</span>
    </Link>
  );
}
