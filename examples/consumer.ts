import {audit, awardPot, buildPots, commit, fold, openLedger, returnUncalled, settle, type Award, type Ledger} from "../implementation/server/ledger.ts";

// One hand of chips with no cards: A and B call blinds-style bets, C folds, and the caller names the winner.
export function playChipsOnly(winnerId: string): {ledger: Ledger; awards: Award[]} {
  let ledger = openLedger([{id: "A", seat: 0}, {id: "B", seat: 1}, {id: "C", seat: 2}], {startingStack: 1000});
  ledger = commit(ledger, "A", 100).ledger;
  ledger = commit(ledger, "B", 100).ledger;
  ledger = commit(ledger, "C", 50).ledger;
  ledger = fold(ledger, "C");
  ledger = returnUncalled(ledger).ledger;
  const awards = buildPots(ledger).map((pot) => awardPot(ledger, pot, [winnerId], 0));
  ledger = settle(ledger, awards);
  if (!audit(ledger).balanced) throw new Error("chips went missing");
  return {ledger, awards};
}
