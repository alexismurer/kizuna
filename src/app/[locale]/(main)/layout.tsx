import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import { TopBar } from "@/components/TopBar";

export default async function MainLayout({
  children,
  params,
}: LayoutProps<"/[locale]">) {
  // TopBar reads translations; without this the request locale falls back to
  // headers() and blocks prerendering of every page in this group
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <>
      <Suspense fallback={null}>
        <TopBar />
      </Suspense>
      {children}
    </>
  );
}
