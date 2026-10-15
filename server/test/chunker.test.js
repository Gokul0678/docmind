const test = require("node:test"),
  assert = require("node:assert/strict");
const { chunk } = require("../src/utils/chunker");

test("short text stays in one chunk", () =>
  assert.deepEqual(chunk("Hello world."), ["Hello world."]));
test("empty text gives no chunks", () =>
  assert.deepEqual(chunk("  \n\n "), []));
test("long text is split into overlapping chunks that cover everything", () => {
  const text = Array.from(
    { length: 200 },
    (_, i) => `Sentence number ${i} talks about topic ${i}.`,
  ).join(" ");
  const parts = chunk(text, 500, 100);
  assert.ok(parts.length > 5 && parts.every((p) => p.length <= 500));
  assert.ok(
    parts[0].includes("number 0") && parts.at(-1).includes("number 199"),
  );
});
test("chunks start and end on whole words", () => {
  const text = Array.from({ length: 400 }, (_, i) => `token${i}`).join(" ");
  const parts = chunk(text, 300, 80);
  assert.ok(parts.length > 5);
  for (const p of parts) {
    const words = p.split(/\s+/);
    assert.match(words[0], /^token\d+$/);
    assert.match(words.at(-1), /^token\d+$/);
  }
});
