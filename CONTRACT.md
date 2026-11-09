# Chip ledger component

## Purpose and facilities
Chip arithmetic that cannot lose a chip. A `Ledger` holds one stake per player (stack, chips in front of them this round, chips in total this hand, folded) plus the total ever issued. Operations commit chips, return an uncalled excess, build one pot per contribution level (side pots; `displayPots` gives the pots as shown mid-round), split each pot among winners the caller names with odd chips handed out by a stated rule, settle the awards into the stacks, void a hand, credit outside chips (rebuy), and audit that stacks plus wagers equal chips issued. It knows nothing about cards or who has the best hand. One ledger can serve a whole game: players are added as chips are issued to them (`create`, `issue`), `balance` reads a stack and `issued` the chips ever made.

Facilities: `chip-ledger` (Stacks, bets, pots, side pots, odd chips and a chip balance audit).

## User inputs
The installer collects five settings. `startingStack` is the chips each player begins with when the ledger is opened with `openLedger` (whole number, default 5000); with `issue` the caller gives every amount, so a tournament that issues its own starting stack and rebuys does not use this setting. `minimumUnit` is the smallest chip; bets are multiples of it unless they put the whole stack in (default 1). `oddChipRule` is `clockwise-after-button` (odd chips go one each to tied winners clockwise from the seat after the button; default) or `first-listed` (in the order the caller lists the winners). `sidePots` builds one pot per contribution level when true (default); when false everything goes in one pot. `seats` is the number of seats at the table, used to count clockwise from the button when odd chips are handed out (whole number of at least 2, default 9).

- `startingStack` (integer; optional; default `5000`)
- `minimumUnit` (integer; optional; default `1`)
- `oddChipRule` (string, slug; optional; default `clockwise-after-button`)
- `sidePots` (boolean; optional; default `True`)
- `seats` (integer; optional; default `9`)

## Artefacts and dependencies
`component.json` maps every `implementation/` source into `components/chip-ledger/`:

- `implementation/server/ledger.ts` -> `components/chip-ledger/server/ledger.ts`

Dependencies: none.
`tools.lock.json` pins verification tools: node 26.5.0. Licence wording remains deferred.

## Provided interfaces
- `interfaces/chip-ledger.json` defines `chip-ledger` (ae/chip-ledger) version 1.0.0.

## Required interfaces
None.

## Integration
A rules component calls `commit` for blinds, calls, bets and raises (`commitTo` for a raise to a total), `fold`, `endRound` between streets, then at the end `returnUncalled`, `buildPots`, decides who won each pot from card strength, `awardPot` for each pot and `settle`. `voidHand` is the cancel path. `credit` adds rebuy chips and keeps `audit` balanced. `exportLedger` and `importLedger` move a table's chips in and out as ndjson. Every function returns a new ledger, so a game can keep earlier states. Single platform: server TypeScript (uses `node:crypto` for export checksums). A tournament keeps one ledger for the whole game: `create()` (or `createLedgerApi(settings).create()` with the settings bound), `issue(ledger, id, amount)` for each starting stack and rebuy, `balance(ledger, id)` and `issued(ledger)` to read it. `setSeats` tells the ledger where players sit (for the odd chip); `setStacks(ledger, stacks)` takes the stacks back from a game that kept its own, refusing any change in the total.

## Visual definition and connected examples
`visual/definition.json` maps its ports to the provided and required interfaces. `visual/examples/connected.json` connects the component to an illustrative application consumer. Both image formats and a text description are retained under `visual/output/`.

## Infrastructure
No deployed service and no accounts. The ledger is plain data the host stores wherever it stores game state; the ndjson export is how it moves between hosts.

## Verification
`tests/web.test.ts` checks settings validation, commit limits and the minimum unit, the pot layers and uncalled-excess cases in `tests/fixtures/pots.json`, the single-pot mode, the odd-chip rule both ways, a loop proving `splitAmount` never loses a chip for many amounts, winner counts and units, settle and void balancing, credit and audit, and the ndjson round trip with a tampered line rejected. It also checks the book (create, issue, balance, issued, a rebuy, three hands on one ledger with the audit balanced after each, bound settings, seats and the odd chip by seat, `setStacks` conserving chips, and export and import of an issued ledger). It checks the `seats` setting: default 9, validation, the odd chip going to a different winner on a 6-seat table than on a 9-seat one, the setting carried through export and import, and an export without `seats` refused.

- `node --test tests/web.test.ts` (web, required-local; tools: node 26.5.0)

## Scenarios and presentation
A hold'em tournament table with a 5000 chip stack and side pots. A cash game with a 25 chip minimum unit. A house game with a single pot (side pots off). A table moved between hosts by export and import.

## Updates and removal
Patch updates replace the files only. The ndjson record layout is described in `interfaces/ledger.schema.json` and `migration.json`. An export must carry every ledger setting, `seats` included. After removal, exported ndjson files are described by the schema.
