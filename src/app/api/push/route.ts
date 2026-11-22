import { createClient } from "@supabase/supabase-js";
import { setVapidDetails } from "web-push";
import { boosterPush, notificationPush } from "@/lib/push/payload";
import { sendToPlayer } from "@/lib/push/send";

// Called by the database (0047_push_dispatch.sql) with either one new
// notification or the players whose free boosters just filled up.
export async function POST(req: Request) {
  const secret = process.env.PUSH_SECRET;
  if (!secret || req.headers.get("x-push-secret") !== secret) return new Response(null, { status: 401 });

  setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const body = (await req.json().catch(() => ({}))) as { notification_id?: number; booster_players?: string[] };
  const total = { sent: 0, removed: 0 };
  const add = (r: { sent: number; removed: number }) => {
    total.sent += r.sent;
    total.removed += r.removed;
  };

  if (typeof body.notification_id === "number") {
    const { data: n } = await admin
      .from("notifications")
      .select("player_id, kind, payload")
      .eq("id", body.notification_id)
      .maybeSingle();
    if (n) {
      const cardId = Number(n.payload?.card_id);
      const { data: card } = Number.isInteger(cardId)
        ? await admin.from("cards").select("name").eq("id", cardId).maybeSingle()
        : { data: null };
      add(await sendToPlayer(admin, n.player_id, (locale) => notificationPush(n, locale, card?.name ?? null)));
    }
  }
  for (const id of Array.isArray(body.booster_players) ? body.booster_players : []) {
    add(await sendToPlayer(admin, id, boosterPush));
  }
  return Response.json(total);
}
