"use client";

import { useTranslations } from "next-intl";

export function QuantitySelect({
  options,
  value,
  onChange,
  disabled = false,
}: {
  options: number[];
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("opening");
  if (options.length < 2) return null;
  return (
    <div
      role="radiogroup"
      aria-label={t("quantity")}
      className="flex gap-1 rounded-full border border-white/10 bg-black/40 p-1 backdrop-blur"
    >
      {options.map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          disabled={disabled}
          onClick={() => onChange(n)}
          className={`min-w-14 rounded-full px-4 py-1.5 font-mono text-sm transition-colors disabled:opacity-50 ${
            value === n ? "bg-white text-black" : "text-white/80 hover:bg-white/10"
          }`}
        >
          {t("quantityOption", { count: n })}
        </button>
      ))}
    </div>
  );
}
