const test = require("node:test"),
  assert = require("node:assert/strict");
const { finalSources } = require("../src/services/chat.service");

const sources = [1, 2, 3, 4].map((n) => ({
  n,
  title: "doc",
  snippet: "",
  content: "",
}));
const used = (answer, full = true) =>
  finalSources(answer, sources, full).map((s) => s.n);

test("recognises [1] style citations", () =>
  assert.deepEqual(used("Your name is X [1]."), [1]));
test("recognises wide-bracket citations used by some models", () =>
  assert.deepEqual(
    used("Your CGPA is 8.55【6】 and name 【1】".replace("6", "4")),
    [1, 4],
  ));
test("recognises citations with extra text and lists", () =>
  assert.deepEqual(used("A【2†L1-L3】 and B [1, 3]"), [1, 2, 3]));
test("ignores numbers that are not citations", () =>
  assert.deepEqual(used("You scored 83.33% in 2022 (HSC)"), []));
test("with no citations: full-context mode shows nothing, search mode shows what was retrieved", () => {
  assert.deepEqual(used("no citations", true), []);
  assert.deepEqual(used("no citations", false), [1, 2, 3, 4]);
});
