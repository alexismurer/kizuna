"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createBrowserClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const t = useTranslations("topbar");
  const router = useRouter();
  return (
    <button
      type="button"
      className="w-full px-3 py-2 text-left text-sm hover:bg-border"
      onClick={async () => {
        await createBrowserClient().auth.signOut();
        router.push("/login");
        router.refresh();
      }}
    >
      {t("signOut")}
    </button>
  );
}
