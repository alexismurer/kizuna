import type { SupabaseClient } from "@supabase/supabase-js";
import { sendNotification } from "web-push";
import type { PushMessage } from "./payload";

type Subscription = { endpoint: string; p256dh: string; auth: string; locale: string };

// pushes in flight at once: enough to send hundreds within one function call
const PARALLEL = 50;

// Sends to every device of the players, each in its own language, PARALLEL at a
// time. A device the push service says is gone (404/410) is forgotten; other
// errors only skip it.
export async function sendToPlayers(
  admin: SupabaseClient,
  playerIds: string[],
  build: (locale: string) => PushMessage | null,
): Promise<{ sent: number; removed: number }> {
  if (playerIds.length === 0) return { sent: 0, removed: 0 };
  // ids go in the URL: 100 per query keeps it short
  const subs: Subscription[] = [];
  for (let i = 0; i < playerIds.length; i += 100) {
    const { data } = await admin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth, locale")
      .in("player_id", playerIds.slice(i, i + 100));
    subs.push(...((data ?? []) as Subscription[]));
  }
  const jobs = subs.flatMap((s) => {
    const msg = build(s.locale);
    return msg ? [{ s, msg }] : [];
  });
  let sent = 0;
  const gone: string[] = [];
  for (let i = 0; i < jobs.length; i += PARALLEL) {
    await Promise.all(
      jobs.slice(i, i + PARALLEL).map(async ({ s, msg }) => {
        try {
          await sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify(msg),
            { TTL: 6 * 3600, timeout: 10_000 },
          );
          sent++;
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) gone.push(s.endpoint);
        }
      }),
    );
  }
  if (gone.length > 0) await admin.from("push_subscriptions").delete().in("endpoint", gone);
  return { sent, removed: gone.length };
}

export function sendToPlayer(admin: SupabaseClient, playerId: string, build: (locale: string) => PushMessage | null) {
  return sendToPlayers(admin, [playerId], build);
}
