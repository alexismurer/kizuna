import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Raid } from "@/components/arcade/raid/Raid";
import { raidAct, raidStart } from "@/lib/actions/arcade";
import type { RaidView } from "@/lib/arcade/battle/raid";
import type { BCard } from "@/lib/arcade/battle/stats";
import messages from "../../messages/en.json";

vi.mock("@/lib/actions/arcade", () => ({ raidStart: vi.fn(), raidAct: vi.fn(), arcadeRanking: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

afterEach(cleanup);

let n = 1;
const card = (seriesId: number, name: string): BCard => ({ id: n++, name, rarity: "epic", imageUrl: null, series: `Series ${seriesId}`, seriesId, genre: "battle", pow: 80 });
const offer = [card(1, "Dazai"), card(1, "Ranpo"), card(2, "Mina"), card(3, "Sakaki"), card(4, "Kenji"), card(5, "Aya"), card(6, "Lin"), card(7, "Grass")];
const pick: RaidView = { offer, team: [], phase: "pick", wave: 1, cleared: 0, damage: 0, perks: {}, relics: [], choice: null, last: null, over: false };

const show = () =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Raid mode="practice" best={null} tickets={10} />
    </NextIntlClientProvider>,
  );

describe("Raid board", () => {
  it("recruits 5 of 8 cards with live team bonuses, then fights", async () => {
    vi.mocked(raidStart).mockResolvedValue({ ok: true, data: { run: "r1", view: pick } });
    vi.mocked(raidAct).mockResolvedValue({ ok: true, data: { view: { ...pick, phase: "fight", team: offer.slice(0, 5).map((c) => ({ card: c, hp: 1, kos: 0, alive: true })) } } });
    show();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Play solo/ })));
    expect(screen.getByText("Pick 5 more cards")).toBeInTheDocument();
    for (const name of ["Dazai", "Ranpo", "Mina", "Sakaki", "Kenji"]) fireEvent.click(screen.getByRole("button", { name: new RegExp(name) }));
    expect(screen.getByText(/×2 Series 1/)).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Start the raid" })));
    expect(raidAct).toHaveBeenCalledWith("practice", "r1", "pick", [0, 1, 2, 3, 4]);
    expect(raidAct).toHaveBeenCalledWith("practice", "r1", "fight", undefined);
  });

  it("offers the perks after a won wave", async () => {
    const team = offer.slice(0, 5).map((c) => ({ card: c, hp: 1, kos: 0, alive: true }));
    const chosen: RaidView = {
      ...pick, phase: "choose", team, wave: 2, cleared: 1,
      choice: { kind: "perk", options: ["adrenaline", "heal", "training"] },
      last: { wave: 1, enemies: [], start: team, teamMax: [100, 100, 100, 100, 100], teamStart: [100, 100, 100, 100, 100], events: [], won: true, t: 500, damage: 300 },
    };
    vi.mocked(raidStart).mockResolvedValue({ ok: true, data: { run: "r1", view: chosen } });
    vi.mocked(raidAct).mockResolvedValue({ ok: true, data: { view: { ...chosen, phase: "fight", choice: null } } });
    show();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Play solo/ })));
    await act(async () => fireEvent.click(await screen.findByRole("button", { name: /Adrenaline/ })));
    expect(raidAct).toHaveBeenCalledWith("practice", "r1", "choose", 0);
  });
});
