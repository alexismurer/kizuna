"use client";

import { useRef, useState } from "react";
import { Coins, Lock, LockOpen, ShoppingCart, Tag } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { CardData } from "@/components/card/CardView";
import { BuyConfirm } from "@/components/market/BuyConfirm";
import { BuyOrderForm } from "@/components/market/BuyOrderForm";
import { Dialog, Toast } from "@/components/market/Dialog";
import { SellDialog } from "@/components/market/SellDialog";
import { WishlistButton } from "@/components/WishlistButton";
import { useRouter } from "@/i18n/navigation";
import { rpcErrorKey, STALE_ERRORS } from "@/lib/game/errors";
import { createBrowserClient } from "@/lib/supabase/client";

const primary =
  "flex w-full items-center justify-center gap-2 rounded-lg bg-cta px-4 py-2 text-sm font-bold text-black disabled:opacity-50";
const secondary =
  "flex flex-1 items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:border-cta disabled:opacity-50";

// The side panel's buttons: Sell / Buy order / Lock with a copy in hand,
// Add to my wishlist / Buy order without one.
export function WikiActions({
  card,
  total,
  owned,
  isProtected,
  wished,
  sellable,
  currency,
}: {
  card: CardData;
  total: number;
  owned: boolean;
  isProtected: boolean;
  wished: boolean;
  sellable: number;
  currency: number;
}) {
  const t = useTranslations("wiki.page");
  const te = useTranslations();
  const router = useRouter();
  const [dialog, setDialog] = useState<"sell" | "order" | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleLock() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const { error: rpcError } = await createBrowserClient().rpc("set_card_protected", {
        p_card_id: card.id,
        p_on: !isProtected,
      });
      if (rpcError) {
        const key = rpcErrorKey(rpcError.message);
        setError(key);
        if (STALE_ERRORS.includes(key)) router.refresh();
      } else router.refresh();
    } catch {
      setError("errors.unknown");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const done = (message: string) => {
    setDialog(null);
    setToast(message);
  };

  const orderButton = (
    <button type="button" onClick={() => setDialog("order")} className={secondary}>
      <ShoppingCart aria-hidden className="h-4 w-4" />
      {t("buyOrder")}
    </button>
  );

  return (
    <div className="space-y-2">
      {owned ? (
        <>
          <button
            type="button"
            onClick={() => setDialog("sell")}
            disabled={sellable < 1 || isProtected}
            className={primary}
          >
            <Tag aria-hidden className="h-4 w-4" />
            {t("sell")}
          </button>
          <div className="flex gap-2">
            {orderButton}
            <button
              type="button"
              onClick={toggleLock}
              disabled={busy}
              className={secondary}
            >
              {isProtected ? <LockOpen aria-hidden className="h-4 w-4" /> : <Lock aria-hidden className="h-4 w-4" />}
              {isProtected ? t("unlock") : t("lock")}
            </button>
          </div>
        </>
      ) : (
        <>
          <WishlistButton
            cardId={card.id}
            initial={wished}
            label={{ off: t("addWishlist"), on: t("wishlisted") }}
            primary
          />
          <div className="flex">{orderButton}</div>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {te(error)}
        </p>
      )}

      {dialog === "sell" && (
        <SellDialog
          item={{ card, sellable }}
          total={total}
          onClose={() => setDialog(null)}
          onDone={(message) => {
            done(message);
            router.refresh();
          }}
        />
      )}
      {dialog === "order" && (
        <Dialog label={t("buyOrder")} onClose={() => setDialog(null)}>
          <h2 className="mb-4 pr-10 font-display text-xl font-bold">{card.name}</h2>
          <BuyOrderForm card={card} currency={currency} onPlaced={done} />
        </Dialog>
      )}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}

// "Buy from {price}" on the locked page: the cheapest open listing, after a confirmation.
export function BuyFromButton({
  listing,
  card,
  currency,
}: {
  listing: { id: number; price: number } | null;
  card: { name: string };
  currency: number;
}) {
  const t = useTranslations("wiki.page");
  const tm = useTranslations("market");
  const format = useFormatter();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  if (!listing && !toast) return null;

  async function buy(l: { id: number; price: number }) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const { error: rpcError } = await createBrowserClient().rpc("buy_listing", { p_id: l.id });
      if (rpcError) {
        const key = rpcErrorKey(rpcError.message);
        setError(key);
        if (STALE_ERRORS.includes(key)) router.refresh();
      } else {
        setOpen(false);
        setToast(tm("bought", { name: card.name, price: format.number(l.price) }));
        router.refresh();
      }
    } catch {
      setError("errors.unknown");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      {listing && (
        <button
          type="button"
          onClick={() => {
            setError(null);
            setOpen(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-md border border-cta px-4 py-2 text-sm font-semibold text-cta"
        >
          {t("buyFrom", { price: format.number(listing.price) })}
          <Coins aria-hidden className="h-4 w-4" />
        </button>
      )}
      {open && listing && (
        <BuyConfirm
          name={card.name}
          price={listing.price}
          currency={currency}
          busy={busy}
          error={error}
          onConfirm={() => buy(listing)}
          onClose={() => setOpen(false)}
        />
      )}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </>
  );
}
