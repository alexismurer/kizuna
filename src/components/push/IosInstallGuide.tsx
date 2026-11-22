import { Share, SquarePlus, Bell } from "lucide-react";
import { useTranslations } from "next-intl";

// iPhone/iPad Safari: push only works from the Home Screen app.
export function IosInstallGuide({ className = "" }: { className?: string }) {
  const t = useTranslations("push");
  const steps = [
    { icon: Share, text: t("iosStep1") },
    { icon: SquarePlus, text: t("iosStep2") },
    { icon: Bell, text: t("iosStep3") },
  ];
  return (
    <div className={className}>
      <p className="text-sm font-bold">{t("iosTitle")}</p>
      <ol className="mt-2 flex flex-col gap-1.5">
        {steps.map(({ icon: Icon, text }, i) => (
          <li key={i} className="flex items-center gap-2 text-sm text-white/70">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border font-mono text-xs">
              {i + 1}
            </span>
            <Icon className="h-4 w-4 shrink-0 text-accent" aria-hidden />
            <span>{text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
