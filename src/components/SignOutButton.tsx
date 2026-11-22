"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { forgetDevice } from "@/lib/push/client";
import { createBrowserClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const t = useTranslations("topbar");
  const router = useRouter();
  return (
    <button
      type="button"
      className="w-full px-3 py-2 text-left text-sm hover:bg-border"
      onClick={async () => {
        // a shared phone must not keep getting this account's pushes
        await forgetDevice();
        await createBrowserClient().auth.signOut();
        router.push("/login");
        router.refresh();
      }}
    >
      {t("signOut")}
    </button>
  );
}
