import type { SupabaseClient } from "@supabase/supabase-js";
import { sendNotification } from "web-push";
import type { PushMessage } from "./payload";

type Subscription = { endpoint: string; p256dh: string; auth: string; locale: string };

// Sends to every device of the player, each in its own language. A device the
// push service says is gone (404/410) is forgotten; other errors only skip it.
export async function sendToPlayer(
  admin: SupabaseClient,
  playerId: string,
  build: (locale: string) => PushMessage | null,
): Promise<{ sent: number; removed: number }> {
  const { data } = await admin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth, locale")
    .eq("player_id", playerId);
  let sent = 0;
  let removed = 0;
  for (const s of (data ?? []) as Subscription[]) {
    const msg = build(s.locale);
    if (!msg) continue;
    try {
      await sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(msg),
        { TTL: 6 * 3600 },
      );
      sent++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        removed++;
      }
    }
  }
  return { sent, removed };
}
