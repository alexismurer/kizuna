import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendNotification } = vi.hoisted(() => ({ sendNotification: vi.fn() }));
vi.mock("web-push", () => ({ sendNotification, setVapidDetails: vi.fn() }));

// tiny in-memory stand-in for the service-role client: the tables the route reads
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const deleted: string[] = [];
function query(table: string) {
  let rows = [...(tables[table] ?? [])];
  const q = {
    select: () => q,
    eq: (col: string, val: unknown) => ((rows = rows.filter((r) => r[col] === val)), q),
    in: (col: string, vals: unknown[]) => ((rows = rows.filter((r) => vals.includes(r[col]))), q),
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    delete: () => ({
      eq: async (_c: string, val: string) => {
        deleted.push(val);
        return { error: null };
      },
      in: async (_c: string, vals: string[]) => {
        deleted.push(...vals);
        return { error: null };
      },
    }),
    then: (res: (v: { data: Row[]; error: null }) => unknown) => res({ data: rows, error: null }),
  };
  return q;
}
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ from: query }) }));

import { POST } from "@/app/api/push/route";

function req(body: unknown, secret = "s3cret") {
  return new Request("https://app.test/api/push", {
    method: "POST",
    headers: { "content-type": "application/json", "x-push-secret": secret },
    body: JSON.stringify(body),
  });
}

const sub = (id: number, player: string, locale = "en") => ({
  id,
  player_id: player,
  endpoint: `https://push.test/${id}`,
  p256dh: "k",
  auth: "a",
  locale,
});

describe("POST /api/push", () => {
  beforeEach(() => {
    process.env.PUSH_SECRET = "s3cret";
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "pub";
    process.env.VAPID_PRIVATE_KEY = "priv";
    process.env.VAPID_SUBJECT = "mailto:x@y.z";
    sendNotification.mockReset();
    deleted.length = 0;
    tables.notifications = [{ id: 1, player_id: "p1", kind: "sold", payload: { card_id: 5, price: 10, net: 9 } }];
    tables.cards = [{ id: 5, name: "Rem" }];
    tables.push_subscriptions = [sub(1, "p1"), sub(2, "p1", "fr"), sub(3, "p2"), sub(4, "p3")];
  });

  it("refuses a wrong or missing secret", async () => {
    expect((await POST(req({ notification_id: 1 }, "nope"))).status).toBe(401);
    expect((await POST(new Request("https://app.test/api/push", { method: "POST", body: "{}" }))).status).toBe(401);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("drops a dead device and still reaches the others", async () => {
    sendNotification.mockRejectedValueOnce(Object.assign(new Error("gone"), { statusCode: 410 })).mockResolvedValue({});
    const res = await POST(req({ notification_id: 1 }));
    expect(await res.json()).toEqual({ sent: 1, removed: 1 });
    expect(deleted).toEqual(["https://push.test/1"]);
    const second = JSON.parse(sendNotification.mock.calls[1][1]);
    expect(second.body).toContain("Rem");
    expect(second.url).toBe("/market?tab=activity");
  });

  it("keeps a device on other errors", async () => {
    sendNotification.mockRejectedValueOnce(Object.assign(new Error("boom"), { statusCode: 500 })).mockResolvedValue({});
    expect(await (await POST(req({ notification_id: 1 }))).json()).toEqual({ sent: 1, removed: 0 });
    expect(deleted).toEqual([]);
  });

  it("sends the booster alert to every device of each player", async () => {
    sendNotification.mockResolvedValue({});
    expect(await (await POST(req({ booster_players: ["p2", "p3"] }))).json()).toEqual({ sent: 2, removed: 0 });
    for (const call of sendNotification.mock.calls) expect(JSON.parse(call[1]).tag).toBe("boosters");
  });
});
