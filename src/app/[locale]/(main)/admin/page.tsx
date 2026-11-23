import { redirect } from "@/i18n/navigation";

// the panel moved to /staff when moderators arrived
export default async function AdminRedirect({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect({ href: "/staff", locale });
}
