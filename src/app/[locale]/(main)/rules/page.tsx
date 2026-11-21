import { use } from "react";
import { setRequestLocale } from "next-intl/server";
import { InfoPage } from "@/components/InfoPage";

const SECTIONS = ["account", "bots", "market", "chat", "names", "money", "enforcement"];

export default function RulesPage({ params }: PageProps<"/[locale]/rules">) {
  const { locale } = use(params);
  setRequestLocale(locale);
  return <InfoPage page="rules" sections={SECTIONS} />;
}
