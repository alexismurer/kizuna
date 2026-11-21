import { use } from "react";
import { setRequestLocale } from "next-intl/server";
import { InfoPage } from "@/components/InfoPage";

const SECTIONS = ["service", "account", "virtual", "conduct", "availability", "liability", "changes"];

export default function TermsPage({ params }: PageProps<"/[locale]/terms">) {
  const { locale } = use(params);
  setRequestLocale(locale);
  return <InfoPage page="terms" sections={SECTIONS} />;
}
