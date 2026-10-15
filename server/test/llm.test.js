// Verifies the REAL streaming code path against a fake OpenAI-compatible server (no API key needed)
const test = require("node:test"),
  assert = require("node:assert/strict");
const http = require("http");
const llm = require("../src/services/llm.service");

const fake = (handler) =>
  new Promise((r) => {
    const s = http.createServer(handler).listen(0, () => r(s));
  });
const collect = async (msgs) => {
  let out = "";
  for await (const t of llm.streamCompletion(msgs)) out += t;
  return out;
};
const env = (s) =>
  Object.assign(process.env, {
    LLM_PROVIDER: "groq",
    LLM_API_KEY: "test-key",
    LLM_MODEL: "m",
    LLM_BASE_URL: `http://localhost:${s.address().port}/v1`,
  });

test("parses SSE tokens, even when events are split across network chunks", async () => {
  let seen;
  const s = await fake((req, res) => {
    seen = { auth: req.headers.authorization, url: req.url };
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    const ev = (t) =>
      `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`;
    const all =
      ev("Hel") +
      ev("lo ") +
      ": keep-alive\n\n" +
      ev("world") +
      "data: [DONE]\n\n";
    res.write(all.slice(0, 20));
    setTimeout(() => {
      res.write(all.slice(20, 70));
      setTimeout(() => res.end(all.slice(70)), 10);
    }, 10);
  });
  env(s);
  assert.equal(await collect([{ role: "user", content: "hi" }]), "Hello world");
  assert.deepEqual(seen, {
    auth: "Bearer test-key",
    url: "/v1/chat/completions",
  });
  s.close();
});
test("maps provider failures to clear errors", async () => {
  for (const [status, msg] of [
    [429, /rate limiting/],
    [500, /AI provider error \(500\)/],
  ]) {
    const s = await fake((req, res) => {
      res.writeHead(status);
      res.end("{}");
    });
    env(s);
    await assert.rejects(collect([{ role: "user", content: "hi" }]), msg);
    s.close();
  }
  process.env.LLM_API_KEY = "";
  await assert.rejects(collect([]), /not configured/);
});
