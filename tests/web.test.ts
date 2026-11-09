import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {audit, awardPot, balance, create, createLedgerApi, issue, issued, setSeats, setStacks, buildPots, displayPots, clockwise, commit, commitTo, credit, exportLedger, fold, importLedger, isAllIn, nextHand, openLedger, returnUncalled, settle, splitAmount, stakeOf, uncalledExcess, validateSettings, voidHand, endRound, type Ledger} from "../implementation/server/ledger.ts";
import {playChipsOnly} from "../examples/consumer.ts";

const pots = JSON.parse(readFileSync(new URL("fixtures/pots.json", import.meta.url), "utf8"));

function table(ids: string[], settings = {}): Ledger {
  return openLedger(ids.map((id, i) => ({id, seat: i})), {startingStack: 1000, ...settings});
}

test("settings are checked and defaulted", () => {
  assert.equal(validateSettings().startingStack, 5000);
  assert.equal(validateSettings({sidePots: false}).sidePots, false);
  assert.throws(() => validateSettings({startingStack: 0}), RangeError);
  assert.throws(() => validateSettings({minimumUnit: 0.5}), RangeError);
  assert.throws(() => validateSettings({oddChipRule: "x" as never}), RangeError);
  assert.throws(() => validateSettings({sidePots: 1 as never}), TypeError);
  assert.throws(() => openLedger([{id: "a", seat: 0}, {id: "a", seat: 1}]), /duplicate/);
});

test("commit moves chips, caps at the stack and tracks all-in", () => {
  let l = table(["A", "B"]);
  let r = commit(l, "A", 300);
  assert.equal(r.committed, 300);
  assert.deepEqual([stakeOf(r.ledger, "A").stack, stakeOf(r.ledger, "A").bet, stakeOf(r.ledger, "A").totalIn], [700, 300, 300]);
  assert.equal(stakeOf(l, "A").stack, 1000);
  r = commit(r.ledger, "A", 5000);
  assert.equal(r.committed, 700);
  assert.ok(isAllIn(stakeOf(r.ledger, "A")));
  assert.ok(!isAllIn(stakeOf(r.ledger, "B")));
  for (const bad of [-1, 1.5, NaN, Infinity]) assert.throws(() => commit(l, "A", bad), RangeError);
  assert.throws(() => commit(l, "Z", 1), /unknown player/);
  assert.equal(audit(r.ledger).balanced, true);
});

test("minimum unit: bets are multiples unless they empty the stack", () => {
  const l = table(["A"], {minimumUnit: 25, startingStack: 110});
  assert.throws(() => commit(l, "A", 30), /multiple of 25/);
  assert.equal(commit(l, "A", 50).committed, 50);
  assert.equal(commit(l, "A", 1000).committed, 110);
});

test("commitTo raises the round bet to a total", () => {
  let l = commit(table(["A"]), "A", 50).ledger;
  const r = commitTo(l, "A", 200);
  assert.equal(r.committed, 150);
  assert.equal(stakeOf(r.ledger, "A").bet, 200);
  assert.throws(() => commitTo(r.ledger, "A", 100), RangeError);
  l = endRound(r.ledger);
  assert.equal(stakeOf(l, "A").bet, 0);
  assert.equal(stakeOf(l, "A").totalIn, 200);
});

test("uncalled excess and pot layers match the reference cases", () => {
  for (const c of pots.cases) {
    let l = table(c.stakes.map((s: {id: string}) => s.id));
    l = {...l, stakes: l.stakes.map((s, i) => ({...s, seat: c.stakes[i].seat, stack: 1000 - c.stakes[i].totalIn, bet: c.stakes[i].totalIn, totalIn: c.stakes[i].totalIn, folded: c.stakes[i].folded}))};
    assert.deepEqual(uncalledExcess(l.stakes), c.excess, c.name);
    const back = returnUncalled(l);
    assert.deepEqual(back.returned, c.excess, c.name);
    assert.deepEqual(buildPots(back.ledger), c.pots, c.name);
    assert.equal(audit(back.ledger).balanced, true, c.name);
  }
});

test("without side pots everything goes in one pot", () => {
  const c = pots.cases[0];
  let l = table(c.stakes.map((s: {id: string}) => s.id), {sidePots: false});
  l = {...l, stakes: l.stakes.map((s, i) => ({...s, totalIn: c.stakes[i].totalIn, folded: c.stakes[i].folded}))};
  assert.deepEqual(buildPots(l), [{amount: 750, eligible: ["A", "B", "C"]}]);
});

test("odd chips: clockwise from the seat after the button", () => {
  assert.equal(clockwise(6, 5), 1);
  assert.equal(clockwise(5, 5), 9);
  assert.equal(clockwise(3, 5), 7);
  const l = openLedger([{id: "late", seat: 3}, {id: "early", seat: 7}], {startingStack: 100});
  const pot = {amount: 101, eligible: ["late", "early"]};
  assert.deepEqual(awardPot(l, pot, ["late", "early"], 5).winners, [{id: "early", amount: 51}, {id: "late", amount: 50}]);
  assert.deepEqual(awardPot(l, pot, ["late", "early"], 7).winners, [{id: "late", amount: 51}, {id: "early", amount: 50}]);
  const first = openLedger([{id: "late", seat: 3}, {id: "early", seat: 7}], {startingStack: 100, oddChipRule: "first-listed"});
  assert.deepEqual(awardPot(first, pot, ["late", "early"], 5).winners, [{id: "late", amount: 51}, {id: "early", amount: 50}]);
});

test("splitAmount keeps every chip and respects the minimum unit", () => {
  assert.deepEqual(splitAmount(100, ["a", "b", "c"], 5).map((w) => w.amount), [35, 35, 30]);
  assert.deepEqual(splitAmount(103, ["a", "b"], 5).map((w) => w.amount), [53, 50]);
  assert.deepEqual(splitAmount(7, ["a"]).map((w) => w.amount), [7]);
  assert.deepEqual(splitAmount(0, ["a", "b"]).map((w) => w.amount), [0, 0]);
  for (let amount = 0; amount < 200; amount++) for (const n of [1, 2, 3, 4, 7]) for (const unit of [1, 5, 25]) {
    const parts = splitAmount(amount, Array.from({length: n}, (_, i) => String(i)), unit);
    assert.equal(parts.reduce((s, p) => s + p.amount, 0), amount);
    assert.ok(Math.max(...parts.map((p) => p.amount)) - Math.min(...parts.map((p) => p.amount)) <= unit);
  }
  assert.throws(() => splitAmount(10, []), /at least one winner/);
});

test("awarding checks eligibility and settle checks every chip is paid", () => {
  const l = table(["A", "B"]);
  assert.throws(() => awardPot(l, {amount: 10, eligible: ["A"]}, ["B"], 0), /not eligible/);
  assert.throws(() => awardPot(l, {amount: 10, eligible: ["A"]}, [], 0), /at least one winner/);
  let w = commit(commit(l, "A", 100).ledger, "B", 100).ledger;
  assert.throws(() => settle(w, [{amount: 100, eligible: ["A"], winners: [{id: "A", amount: 100}]}]), /pay 100 but 200/);
  assert.throws(() => settle(w, [{amount: 200, eligible: ["A"], winners: [{id: "Z", amount: 200}]}]), /unknown player/);
});

test("a full hand with a side pot settles and balances", () => {
  let l = table(["A", "B", "C", "D"], {startingStack: 1000});
  l = {...l, stakes: l.stakes.map((s) => s.id === "A" ? {...s, stack: 100} : s), issued: 3100};
  l = commit(l, "A", 100).ledger;
  l = commit(l, "B", 300).ledger;
  l = commit(l, "C", 300).ledger;
  l = commit(l, "D", 50).ledger;
  l = fold(l, "D");
  assert.equal(audit(l).balanced, true);
  const back = returnUncalled(l);
  assert.equal(back.returned, null);
  const ps = buildPots(back.ledger);
  assert.deepEqual(ps.map((p) => p.amount), [350, 400]);
  // A wins the main pot, B and C tie for the side pot (200 each), nothing odd.
  const awards = [awardPot(back.ledger, ps[0], ["A"], 0), awardPot(back.ledger, ps[1], ["B", "C"], 0)];
  const done = settle(back.ledger, awards);
  assert.deepEqual(done.stakes.map((s) => s.stack), [350, 900, 900, 950]);
  assert.ok(done.stakes.every((s) => s.bet === 0 && s.totalIn === 0));
  assert.equal(audit(done).balanced, true);
  assert.ok(stakeOf(done, "D").folded);
  assert.ok(!stakeOf(nextHand(done), "D").folded);
});

test("voiding a hand returns every wager", () => {
  let l = commit(commit(table(["A", "B"]), "A", 400).ledger, "B", 250).ledger;
  l = voidHand(l);
  assert.deepEqual(l.stakes.map((s) => [s.stack, s.totalIn]), [[1000, 0], [1000, 0]]);
});

test("credit counts as issued so the audit still balances", () => {
  const l = credit(table(["A", "B"]), "A", 5000);
  assert.equal(stakeOf(l, "A").stack, 6000);
  assert.deepEqual(audit(l), {inPlay: 7000, issued: 7000, balanced: true});
  assert.equal(audit({...l, issued: 1}).balanced, false);
  assert.throws(() => credit(l, "A", -5), RangeError);
});

test("ndjson export and import round trip, and tampering is caught", () => {
  let l = commit(table(["A", "B", "C"], {minimumUnit: 5, oddChipRule: "first-listed"}), "B", 200).ledger;
  l = fold(l, "C");
  const text = exportLedger(l);
  assert.equal(text.trim().split("\n").length, 4);
  assert.deepEqual(importLedger(text), l);
  assert.throws(() => importLedger(text.replace('"stack":800', '"stack":900')), /checksum/);
  assert.throws(() => importLedger(text.split("\n").slice(1).join("\n")), /unexpected record|no ledger/);
  assert.throws(() => importLedger(""), /no ledger/);
});

test("the consumer example plays a hand that balances", () => {
  const {ledger, awards} = playChipsOnly("B");
  assert.equal(audit(ledger).balanced, true);
  assert.equal(stakeOf(ledger, "B").stack, 1000 + 50 + 100);
  assert.equal(awards.reduce((s, a) => s + a.amount, 0), 250);
});

test("chips of folded players above the top live level are not lost", () => {
  let l = table(["A", "B", "C"]);
  l = {...l, stakes: l.stakes.map((s) => ({...s, totalIn: {A: 100, B: 150, C: 150}[s.id]!, folded: s.id !== "A"}))};
  const p = buildPots(l);
  assert.equal(p.reduce((s, x) => s + x.amount, 0), 400);
  assert.deepEqual(p, [{amount: 400, eligible: ["A"]}]);
  assert.deepEqual(awardPot(l, p[0], ["A"], 0).winners, [{id: "A", amount: 400}]);
});

test("display pots leave out the bets still in front of players this round", () => {
  let l = table(["A", "B", "C"]);
  l = commit(commit(commit(l, "A", 100).ledger, "B", 100).ledger, "C", 100).ledger;
  l = endRound(l);
  l = commit(commit(l, "A", 60).ledger, "B", 200).ledger;
  l = fold(commit(l, "C", 20).ledger, "C");
  const shown = displayPots(l);
  assert.equal(shown.reduce((s, p) => s + p.amount, 0), 100 + 100 + 100 + 20);
  assert.deepEqual(shown.at(-1)!.eligible, ["A", "B"]);
  assert.equal(buildPots(l).reduce((s, p) => s + p.amount, 0), 580);
});

// ---- the book across hands ----

test("create, issue, balance and issued: an empty book, chips issued per player, 0 for a stranger", () => {
  let l = create({minimumUnit: 5});
  assert.deepEqual([l.stakes.length, issued(l), balance(l, "a")], [0, 0, 0]);
  assert.equal(l.settings.minimumUnit, 5);
  l = issue(l, "a", 5000);
  l = issue(l, "b", 5000);
  assert.deepEqual([balance(l, "a"), balance(l, "b"), balance(l, "nobody"), issued(l)], [5000, 5000, 0, 10000]);
  assert.deepEqual(l.stakes.map((x) => [x.id, x.seat]), [["a", 0], ["b", 1]], "seats follow the order players were added");
  const rebuy = issue(l, "a", 2500);
  assert.deepEqual([balance(rebuy, "a"), issued(rebuy), balance(l, "a"), issued(l)], [7500, 12500, 5000, 10000], "a rebuy adds to the stack and is new chips; the input is unchanged");
  assert.deepEqual(audit(rebuy), {inPlay: 12500, issued: 12500, balanced: true});
  assert.equal(issue(l, "c", 0).stakes.length, 3, "a player can be added with no chips");
  assert.throws(() => issue(l, "a", -1), RangeError);
  assert.throws(() => issue(l, "a", 1.5), RangeError);
  assert.throws(() => issue(l, "", 5), TypeError);
});

test("one book plays many hands: chips move through commit and settle, balance reads the stacks, issued never moves", () => {
  let l = create({startingStack: 1000, minimumUnit: 1});
  for (const id of ["a", "b", "c"]) l = issue(l, id, 1000);
  for (let hand = 0; hand < 3; hand++) {
    l = nextHand(l);
    for (const id of ["a", "b", "c"]) l = commit(l, id, 100).ledger;
    const [pot] = buildPots(l);
    const award = awardPot(l, pot, [["a", "b", "c"][hand]], hand);
    l = settle(l, [award]);
    assert.equal(issued(l), 3000);
    assert.equal(audit(l).balanced, true);
  }
  assert.deepEqual(["a", "b", "c"].map((id) => balance(l, id)), [1000, 1000, 1000], "each won one pot of 300 and paid 100 three times");
  l = commit(commit(l, "a", 1000).ledger, "b", 1000).ledger;
  l = settle(l, [awardPot(l, buildPots(l)[0], ["b"], 0)]);
  assert.equal(balance(l, "a"), 0);
  assert.equal(balance(l, "b"), 2000);
  l = issue(l, "a", 1000);
  assert.deepEqual([balance(l, "a"), issued(l)], [1000, 4000]);
});

test("createLedgerApi binds the settings: create builds the ledger they describe and the rest are the same functions", () => {
  const api = createLedgerApi({oddChipRule: "first-listed", sidePots: false});
  const l = api.issue(api.issue(api.create(), "a", 10), "b", 20);
  assert.deepEqual([api.balance(l, "b"), api.issued(l), l.settings.oddChipRule, l.settings.sidePots], [20, 30, "first-listed", false]);
  assert.equal(api.settings.startingStack, 5000);
  assert.throws(() => createLedgerApi({startingStack: 0}), RangeError);
  assert.deepEqual(JSON.parse(JSON.stringify(l)), l, "plain data the tournament can store");
});

test("setSeats places players for the odd chip rule, and refuses unknown players, bad seats and shared seats", () => {
  let l = create({minimumUnit: 1});
  for (const id of ["a", "b", "c"]) l = issue(l, id, 100);
  const placed = setSeats(l, [{id: "a", seat: 4}, {id: "b", seat: 1}, {id: "c", seat: 7}]);
  assert.deepEqual(placed.stakes.map((x) => x.seat), [4, 1, 7]);
  assert.deepEqual(l.stakes.map((x) => x.seat), [0, 1, 2], "the input is unchanged");
  assert.throws(() => setSeats(l, [{id: "z", seat: 1}]), /unknown player/);
  assert.throws(() => setSeats(l, [{id: "a", seat: -1}]), RangeError);
  assert.throws(() => setSeats(l, [{id: "a", seat: 1.5}]), RangeError);
  assert.throws(() => setSeats(l, [{id: "a", seat: 1}]), /share a seat/);
  let pot = commit(commit(commit(placed, "a", 1).ledger, "b", 1).ledger, "c", 1).ledger;
  const [p] = buildPots(pot);
  const split = awardPot(pot, {...p, amount: 4}, ["a", "b", "c"], 4);
  assert.deepEqual(split.winners.map((w) => [w.id, w.amount]), [["c", 2], ["b", 1], ["a", 1]], "clockwise from the button at seat 4: seat 7 first, then 1, then the button's own seat 4");
});

test("setStacks writes a game's own stacks back and clears the wagers, only when no chips are made or lost", () => {
  let l = create();
  for (const id of ["a", "b", "c"]) l = issue(l, id, 100);
  const back = setStacks(l, {a: 150, b: 50});
  assert.deepEqual(["a", "b", "c"].map((id) => balance(back, id)), [150, 50, 100]);
  assert.equal(issued(back), 300);
  assert.equal(audit(back).balanced, true);
  assert.deepEqual(l.stakes.map((x) => x.stack), [100, 100, 100], "the input is unchanged");
  const wagered = commit(l, "a", 40).ledger;
  const settled = setStacks(wagered, {a: 70, b: 130});
  assert.deepEqual([stakeOf(settled, "a").stack, stakeOf(settled, "a").totalIn, stakeOf(settled, "a").bet], [70, 0, 0], "wagers count as held chips and then clear");
  assert.throws(() => setStacks(l, {a: 151, b: 50}), /stacks hold 201 chips but those players held 200/);
  assert.throws(() => setStacks(l, {a: 99}), /held 100/);
  assert.throws(() => setStacks(l, {z: 1}), /unknown player/);
  assert.throws(() => setStacks(l, {a: 100.5, b: 99.5}), RangeError);
  assert.throws(() => setStacks(l, {a: -1, b: 201}), RangeError);
  assert.equal(setStacks(l, {}).stakes.length, 3);
});

test("the exported book of a ledger built with issue imports back the same", () => {
  let l = create({startingStack: 500});
  l = issue(issue(l, "x", 500), "y", 500);
  l = commit(l, "x", 20).ledger;
  assert.deepEqual(importLedger(exportLedger(l)), l);
});

test("seats: default 9, checked, and it decides which winner gets the odd chip", () => {
  assert.equal(validateSettings().seats, 9);
  assert.equal(validateSettings({seats: 6}).seats, 6);
  assert.throws(() => validateSettings({seats: 1}), RangeError);
  assert.throws(() => validateSettings({seats: 6.5}), RangeError);
  const entries = [{id: "a", seat: 1}, {id: "b", seat: 5}];
  const pot = {amount: 101, eligible: ["a", "b"]};
  // Button on seat 4: b sits first after it with six or nine seats.
  assert.deepEqual(awardPot(openLedger(entries, {seats: 9}), pot, ["a", "b"], 4).winners, [{id: "b", amount: 51}, {id: "a", amount: 50}]);
  // Button on seat 7 wraps round the table: with nine seats a is 3 past and b 7 past; with six seats a is 6 past and b 4 past.
  assert.deepEqual(awardPot(openLedger(entries, {seats: 9}), pot, ["a", "b"], 7).winners, [{id: "a", amount: 51}, {id: "b", amount: 50}]);
  assert.deepEqual(awardPot(openLedger(entries, {seats: 6}), pot, ["a", "b"], 7).winners, [{id: "b", amount: 51}, {id: "a", amount: 50}]);
  assert.equal(clockwise(1, 7, 6), 6);
  assert.equal(clockwise(1, 7, 9), 3);
});

test("seats travels with an export and an export without it is refused", () => {
  const l = openLedger([{id: "a", seat: 0}, {id: "b", seat: 1}], {seats: 6, startingStack: 100});
  assert.equal(importLedger(exportLedger(l)).settings.seats, 6);
  const digest = (record: unknown) => createHash("sha256").update(JSON.stringify(record)).digest("hex");
  const {seats: _seats, ...without} = l.settings;
  const lines = [{kind: "ledger", record: {settings: without, issued: l.issued}}, ...l.stakes.map((s) => ({kind: "stake", record: s}))];
  const text = lines.map((x) => JSON.stringify({...x, sha256: digest(x.record)})).join("\n") + "\n";
  assert.throws(() => importLedger(text), /no seats/);
});
