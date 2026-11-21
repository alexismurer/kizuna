import { use } from "react";
import { setRequestLocale } from "next-intl/server";
import { InfoPage } from "@/components/InfoPage";

const SECTIONS = ["collect", "use", "public", "cookies", "providers", "rights", "changes"];

export default function PrivacyPage({ params }: PageProps<"/[locale]/privacy">) {
  const { locale } = use(params);
  setRequestLocale(locale);
  return <InfoPage page="privacy" sections={SECTIONS} />;
}
