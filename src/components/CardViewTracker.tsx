"use client";

import { useEffect, useRef } from "react";
import { createBrowserClient } from "@/lib/supabase/client";

// Records a card page view once per mount (the server dedupes per day).
export function CardViewTracker({ cardId }: { cardId: number }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    // a missed view only delays a mission; nothing to show the player
    createBrowserClient()
      .rpc("record_card_view", { p_card_id: cardId })
      .then(
        () => {},
        () => {},
      );
  }, [cardId]);
  return null;
}
