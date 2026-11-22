import { describe, expect, it } from "vitest";
import { boosterPush, notificationPush } from "@/lib/push/payload";
import fr from "../../messages/fr.json";
import en from "../../messages/en.json";
import ja from "../../messages/ja.json";

describe("notificationPush", () => {
  it("writes a sale in the player's language with the card name", () => {
    const msg = notificationPush({ kind: "sold", payload: { card_id: 5, price: 1200, net: 1140, source: "listing" } }, "fr", "Rem");
    expect(msg).not.toBeNull();
    expect(msg!.title).toBe("Kizuna");
    expect(msg!.body).toContain("Rem");
    expect(msg!.body.startsWith("Ton annonce pour Rem")).toBe(true);
    expect(msg!.url).toBe("/market?tab=activity");
    expect(msg!.tag).toBe("sold:5");
  });

  it("returns null for a kind that is never pushed", () => {
    expect(notificationPush({ kind: "mystery", payload: {} }, "en", null)).toBeNull();
  });

  it("falls back to English for an unknown locale", () => {
    const msg = notificationPush({ kind: "friend_request", payload: { from_username: "aki" } }, "it", null);
    expect(msg!.body).toBe(en.notifications.friend_request.replace("{user}", "aki"));
  });

  it("links a new friend to their profile", () => {
    const msg = notificationPush({ kind: "friend_accepted", payload: { username: "a b" } }, "en", null);
    expect(msg!.url).toBe("/profile/a%20b");
    expect(msg!.tag).toBe("friend_accepted:a b");
  });

  it("names the card generically when it is unknown", () => {
    const msg = notificationPush({ kind: "outbid", payload: { card_id: 9, amount: 10 } }, "fr", null);
    expect(msg!.body).toContain(fr.notifications.someCard);
  });
});

describe("boosterPush", () => {
  it("uses the player's language and opens the booster page", () => {
    expect(boosterPush("ja")).toEqual({
      title: ja.push.boostersTitle,
      body: ja.push.boostersBody,
      url: "/open",
      tag: "boosters",
    });
  });
});
