import { apply, legalActions, other, score, type Action, type GameState, type Side } from "./engine";

type Option = { action: Action; diff: number; cost: number; spy: boolean };

// The computer: plays greedily but tries to keep cards for later rounds.
export function chooseAction(state: GameState, side: Side): Action {
  if (state.phase === "redraw") return { type: "ready" };
  const me = state.players[side];
  const foe = state.players[other(side)];
  const diffNow = score(state, side) - score(state, other(side));
  const mustWin = me.lives === 1;

  const options: Option[] = [];
  for (const action of legalActions(state, side)) {
    if (action.type !== "play") continue;
    const card = me.hand.find((c) => c.uid === action.uid)!;
    const after = apply(state, side, action);
    const diff = score(after, side) - score(after, other(side));
    const cost = card.kind === "unit" ? card.base : 5;
    // a card that draws (spy) is worth more than its strength suggests
    const spy = card.kind === "unit" && card.ability === "spy";
    options.push({ action, diff, cost, spy });
  }
  if (!options.length) return { type: "pass" };

  const winning = options.filter((o) => o.diff > 0).sort((a, b) => a.cost - b.cost || b.diff - a.diff);
  const best = [...options].sort((a, b) => score2(b) - score2(a))[0];

  if (foe.passed) {
    if (diffNow > 0) return { type: "pass" };
    if (winning.length) return winning[0].action;
    // can't win this round: save the cards unless losing it ends the match
    return mustWin ? best.action : { type: "pass" };
  }

  // early on, a spy is almost always a good play
  const spy = options.find((o) => o.spy);
  if (spy && me.hand.length > 2 && !mustWin) return spy.action;

  // comfortably ahead with no fewer cards: make the opponent spend theirs
  if (!mustWin && diffNow >= 10 && me.hand.length >= foe.hand.length) return { type: "pass" };
  // far behind in round 1 with fewer cards: give the round away
  if (state.round === 1 && diffNow <= -20 && me.hand.length < foe.hand.length) return { type: "pass" };

  if (diffNow <= 0 && winning.length && !mustWin) return winning[0].action;
  if (best.diff <= diffNow && !mustWin) return { type: "pass" };
  return best.action;
}

// gain per card spent: playing everything at once is rarely right
function score2(o: Option): number {
  return o.diff - o.cost * 0.4 + (o.spy ? 6 : 0);
}
