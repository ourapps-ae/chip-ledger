# Source mapping

Reference revision: `19905b75dbea89fbfd424d67fe26c81aaed0e018`. Extraction source: `OurPoker/recipe/` (read-only).

- `implementation/server/ledger.ts` <- `server/src/pots.ts`, plus the chip arithmetic in `server/src/engine.ts`.
  - `uncalledExcess`, `returnUncalled` <- `pots.ts:11-17` (`uncalledExcess`) and `engine.ts:885-891` (excess handed back in `settle`).
  - `buildPots` <- `pots.ts:19-33`; same layering, plus folded chips above the top live layer going into the last pot (the recipe did this only for display, `server/src/view.ts:131-141`, and its `settle` at `engine.ts:895` has no such step; whether that case can arise at settlement was not determined, and `settle` here refuses to run if any wagered chip is unpaid). `displayPots` <- `view.ts:101-106` and `view.ts:131-141` (`handView` and `displayPots`: pots without the current round's bets). The `sidePots` setting adds a single-pot mode (rules file `betting.side_pots`, `rules/texas-holdem-house-rules.json`).
  - `clockwise` <- `pots.ts:94-97`; `seats` (was a fixed 9 in `clockwise`) is a ledger setting and a collected setting (default 9), used by `awardPot`.
  - `splitAmount`, `awardPot` <- `pots.ts:35-55` (`awardPots`: even share plus odd chips one each to tied winners, clockwise from the seat after the button; `pots.odd_chips` in the house rules). Generalised: the recipe computed the tied winners itself with `evaluate()`; here the caller names the winners, so the ledger has no card knowledge. Added `minimumUnit` (odd chips in whole units; house rules `chips.minimum_unit`) and the `first-listed` rule.
  - `commit`, `commitTo`, `isAllIn`, `fold`, `endRound` <- `engine.ts:707-718` (`postBlind`, `commitChips`), `engine.ts:748-787` (call and bet arithmetic: stack, bet, totalIn, all-in when the stack is 0), `engine.ts:740-743` (fold), `engine.ts:847-851` (`bet = 0` at a new street). Left behind: raise-size rules (`lastFullRaise`, short all-in reopening, `canRaise`, `engine.ts:755-787`), which are betting rules and belong to holdem-rules.
  - `settle` <- `engine.ts:895-900` (credit winners, clear `totalIn` and `bet`); added the check that awards equal wagers.
  - `voidHand` <- `engine.ts:1046-1057` (`doCancel` returns each `totalIn` to its stack).
  - `credit`, `audit` <- `engine.ts:955-960` (rebuy stack awarded), `engine.ts:1071-1078` (`chipsInPlay`, `chipsIssued`). `issued` is now kept on the ledger instead of being recomputed from `STARTING_STACK` and rebuy counts.
  - `startingStack` <- `server/src/rules.ts:6` (`house.chips.starting_stack`), default 5000 as in the house rules.
  - `exportLedger`, `importLedger`, `validateSettings`, `openLedger`, `stakeOf`, `nextHand`: new, not in the recipe (the recipe's chips lived inside the `Game` object, which is not portable).
  - Left behind: hand evaluation (`evaluate.ts`), `showdownOf` and the kicker display logic (`pots.ts:57-92`), the history entry written in `settle` (`engine.ts:911-916`, round-history), rebuy offers and eligibility (`engine.ts:925-963`, tournament).
- `create`, `issue`, `balance`, `issued`, `setSeats`, `setStacks`, `createLedgerApi` (`generated-adapter`): written to `components/tournament/interfaces/required/chip-ledger.json` and for `holdem-rules`. `issue` is `credit` (`engine.ts:955-960`) that also adds an unknown player, as `engine.ts:375-386` gave every player `STARTING_STACK` at start; `balance` is `p.stack` and `issued` the `chipsIssued` count (`engine.ts:1071-1078`); `setStacks` replaces writing `p.stack` back after a hand (`engine.ts:895-900`) with a check that chips are conserved.
- `interfaces/ledger.schema.json`, `migration.json`: new; describe the ndjson export and import.
- `tests/fixtures/pots.json`: new; five contribution layouts with hand-derived expected pots.
- `examples/consumer.ts`: new; one hand of chips with a named winner.
