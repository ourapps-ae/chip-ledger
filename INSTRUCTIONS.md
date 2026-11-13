# Chip ledger instructions

## For the agent
Select this component for any game with chips. Set `startingStack`, `minimumUnit`, `oddChipRule`, `sidePots` and `seats` (the number of seats at the table; default 9; the recipe sets it from its players answer) from the recipe's chip answers (hold'em house rules: 5000, 1, clockwise-after-button, true). Connect the provided `chip-ledger` to the rules component and to the tournament component.

- Select package `ourapps-ae/chip-ledger` version `0.6.0`.
- Settings to configure:
  - `startingStack` (integer; optional; default `5000`)
  - `minimumUnit` (integer; optional; default `1`)
  - `oddChipRule` (string, slug; optional; default `clockwise-after-button`)
  - `sidePots` (boolean; optional; default `True`)
  - `seats` (integer; optional; default `9`)
- Connect the provided `chip-ledger` (ae/chip-ledger 1.0.0) to the consumer that needs it.
- No accounts or keys are needed.

## For the developer
Keep the `Ledger` in the game state and replace it with each function's result. Decide winners elsewhere (hand ranking) and pass their ids to `awardPot` in the order your rule needs. Call `audit` in tests and after every hand; it must stay balanced. No accounts or keys.

## How to check
From the component directory:

- `node --test tests/web.test.ts` (web, required-local; tools: node 26.5)
- `python3 -m aepm review <digest> --store STORE --policy POLICY --trusted --allow-network` checks an archive fetched with `python3 -m aepm fetch ourapps-ae/chip-ledger@VERSION --store STORE --from https://ourapps.app` and runs its suites.
