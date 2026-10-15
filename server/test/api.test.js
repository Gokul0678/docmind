// Integration tests use a SEPARATE database (TEST_DATABASE_URL) and the mock AI provider
if (!process.env.TEST_DATABASE_URL)
  throw new Error("Set TEST_DATABASE_URL in .env before running tests");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.LLM_PROVIDER = "mock";
process.env.RATE_LIMIT_PER_MIN = "1000";
process.env.ANSWER_MODE = "grounded"; // existing tests cover strict mode; assisted mode has its own tests
process.env.FULL_CONTEXT_MAX_CHUNKS = "0"; // tests default to keyword retrieval; full-context mode is enabled per test
const test = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("fs"),
  path = require("path"),
  http = require("http");
const app = require("../src/app"),
  pool = require("../src/config/db");

let server, base, tokenA, tokenB, docId, convId;
const json = (token, body, method = "POST") => ({
  method,
  headers: {
    "Content-Type": "application/json",
    ...(token && { Authorization: `Bearer ${token}` }),
  },
  body: body && JSON.stringify(body),
});
const call = async (p, opts = {}) => {
  const r = await fetch(base + p, opts);
  return { status: r.status, data: await r.json() };
};
const upload = async (token, name, content, type = "text/plain") => {
  const form = new FormData();
  form.append("file", new Blob([content], { type }), name);
  const r = await fetch(base + "/documents", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  return { status: r.status, data: await r.json() };
};
// Reads a server-sent-events response into [{event, data}]
const ask = async (token, id, question) => {
  const r = await fetch(
    `${base}/conversations/${id}/messages`,
    json(token, { question }),
  );
  if (!(r.headers.get("content-type") || "").includes("event-stream"))
    return { status: r.status, events: [], error: (await r.json()).message };
  const events = (await r.text())
    .split("\n\n")
    .filter(Boolean)
    .map((b) => ({
      event: /event: (.+)/.exec(b)[1],
      data: JSON.parse(/data: (.+)/.exec(b)[1]),
    }));
  return {
    status: r.status,
    events,
    answer: events
      .filter((e) => e.event === "token")
      .map((e) => e.data.text)
      .join(""),
  };
};

test.before(async () => {
  await pool.query(
    fs.readFileSync(path.join(__dirname, "../db/schema.sql"), "utf8"),
  );
  await pool.query("TRUNCATE users RESTART IDENTITY CASCADE");
  server = app.listen(0);
  base = `http://localhost:${server.address().port}/api`;
});
test.after(async () => {
  server.close();
  await pool.end();
});

test("auth", async () => {
  tokenA = (
    await call(
      "/auth/register",
      json(null, { name: "A", email: "a@x.com", password: "secret1" }),
    )
  ).data.token;
  tokenB = (
    await call(
      "/auth/register",
      json(null, { name: "B", email: "b@x.com", password: "secret1" }),
    )
  ).data.token;
  assert.equal(
    (
      await call(
        "/auth/register",
        json(null, { email: "a@x.com", password: "secret1" }),
      )
    ).status,
    409,
  );
  assert.equal((await call("/documents")).status, 401);
});
test("upload a PDF and a text file; reject bad files", async () => {
  const pdf = fs.readFileSync(path.join(__dirname, "fixtures/handbook.pdf"));
  const ok = await upload(tokenA, "handbook.pdf", pdf, "application/pdf");
  assert.equal(ok.status, 201);
  assert.ok(ok.data.chunk_count >= 1);
  docId = ok.data.id;
  assert.equal(
    (
      await upload(
        tokenA,
        "notes.txt",
        "The cafeteria opens at 8 AM and serves breakfast until 10 AM.",
      )
    ).status,
    201,
  );
  assert.equal((await upload(tokenA, "virus.exe", "x")).status, 400);
  assert.equal((await upload(tokenA, "empty.txt", "   ")).status, 400);
  assert.equal(
    (await upload(tokenA, "bad.pdf", "not really a pdf", "application/pdf"))
      .status,
    400,
  );
  assert.equal(
    (await call("/documents", json(tokenA, null, "GET"))).data.length,
    2,
  );
  assert.equal(
    (await call("/documents", json(tokenB, null, "GET"))).data.length,
    0,
  ); // isolation
});
test("RAG answer streams sources, tokens and is saved with citations", async () => {
  convId = (await call("/conversations", json(tokenA, {}))).data.id;
  const r = await ask(
    tokenA,
    convId,
    "How many days of sick leave do employees get?",
  );
  assert.deepEqual(
    r.events.map((e) => e.event).filter((e, i, a) => e !== a[i - 1]),
    ["sources", "token", "done"],
  );
  const sources = r.events[0].data;
  assert.ok(
    sources.length >= 1 &&
      /sick leave/i.test(sources[0].snippet) &&
      sources[0].title === "handbook",
  );
  assert.match(r.answer, /\[1\]/);
  const msgs = (
    await call(`/conversations/${convId}/messages`, json(tokenA, null, "GET"))
  ).data;
  assert.deepEqual(
    msgs.map((m) => m.role),
    ["user", "assistant"],
  );
  assert.equal(msgs[1].sources[0].n, 1);
  assert.equal(
    (await call("/conversations", json(tokenA, null, "GET"))).data[0].title,
    "How many days of sick leave do employees get?",
  );
});
test('no relevant text: answers "not found" without calling the AI', async () => {
  const r = await ask(tokenA, convId, "Explain quantum chromodynamics");
  assert.deepEqual(r.events[0].data, []);
  assert.match(r.answer, /couldn't find/i);
});
test("scoping, isolation and validation", async () => {
  const scoped = (
    await call("/conversations", json(tokenA, { documentId: docId }))
  ).data.id;
  assert.equal(
    (await ask(tokenA, scoped, "When does the cafeteria open for breakfast?"))
      .events[0].data.length,
    0,
  ); // cafeteria is in the other doc
  assert.equal(
    (await ask(tokenA, convId, "When does the cafeteria open for breakfast?"))
      .events[0].data[0].title,
    "notes",
  );
  assert.equal((await ask(tokenB, convId, "sick leave days")).status, 404); // someone else's conversation
  assert.equal(
    (await call("/conversations", json(tokenB, { documentId: docId }))).status,
    400,
  );
  assert.equal((await ask(tokenA, convId, "")).status, 400);
  assert.equal((await ask(tokenA, convId, "x".repeat(1001))).status, 400);
});
test("small document sets are sent in full, so questions need not share words with the text", async () => {
  process.env.FULL_CONTEXT_MAX_CHUNKS = "8";
  const r = await ask(tokenA, convId, "what is the weather forecast"); // no keyword overlap with the documents
  process.env.FULL_CONTEXT_MAX_CHUNKS = "0";
  assert.deepEqual(r.events[0].data, []); // no sources up front in full-context mode
  assert.match(r.answer, /mock AI/); // the model was still called
  assert.equal(r.events.find((e) => e.event === "done").data.sources.length, 1); // only the cited excerpt is kept
});
test("full prompt reaches a streaming provider and only cited sources are returned", async () => {
  let prompt = "";
  const fake = http.createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      prompt = JSON.parse(body).messages.at(-1).content;
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write(
        `data: ${JSON.stringify({ choices: [{ delta: { content: "You get 12 days of sick leave [1]" } }] })}\n\n`,
      );
      res.end("data: [DONE]\n\n");
    });
  });
  await new Promise((r) => fake.listen(0, r));
  Object.assign(process.env, {
    LLM_PROVIDER: "groq",
    LLM_API_KEY: "k",
    LLM_MODEL: "m",
    LLM_BASE_URL: `http://localhost:${fake.address().port}/v1`,
    FULL_CONTEXT_MAX_CHUNKS: "8",
  });
  const r = await ask(
    tokenA,
    convId,
    "how long can someone stay away when unwell",
  );
  Object.assign(process.env, {
    LLM_PROVIDER: "mock",
    FULL_CONTEXT_MAX_CHUNKS: "0",
  });
  fake.close();
  assert.match(prompt, /12 days of paid sick\s+leave/);
  assert.match(prompt, /cafeteria/); // both documents were sent
  assert.match(r.answer, /12 days/);
  assert.equal(r.events.find((e) => e.event === "done").data.sources.length, 1);
});
test("assisted mode answers general and opinion questions; grounded mode refuses them", async () => {
  const seen = [];
  const fake = http.createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      const m = JSON.parse(body).messages;
      seen.push({ system: m[0].content, user: m.at(-1).content });
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write(
        `data: ${JSON.stringify({ choices: [{ delta: { content: "General knowledge (not from your documents): a token format." } }] })}\n\n`,
      );
      res.end("data: [DONE]\n\n");
    });
  });
  await new Promise((r) => fake.listen(0, r));
  Object.assign(process.env, {
    LLM_PROVIDER: "groq",
    LLM_API_KEY: "k",
    LLM_MODEL: "m",
    LLM_BASE_URL: `http://localhost:${fake.address().port}/v1`,
  });
  process.env.ANSWER_MODE = "assisted";
  const a = await ask(tokenA, convId, "explain astrophysics basics"); // nothing in the documents matches
  process.env.ANSWER_MODE = "grounded";
  const g = await ask(tokenA, convId, "explain astrophysics basics");
  Object.assign(process.env, { LLM_PROVIDER: "mock" });
  fake.close();
  const answerCalls = seen.filter((s) => /DocMind/.test(s.system)); // ignores the keyword-rewrite helper call
  assert.equal(answerCalls.length, 1); // grounded mode never asked the model for an answer
  assert.match(answerCalls[0].system, /General knowledge/);
  assert.match(answerCalls[0].user, /no excerpts matched/);
  assert.match(a.answer, /General knowledge/);
  assert.match(g.answer, /couldn't find/i);
});
test("rate limit protects the AI quota", async () => {
  process.env.RATE_LIMIT_PER_MIN = "2";
  require("../src/middleware/rateLimit").reset();
  const codes = [];
  for (let i = 0; i < 3; i++)
    codes.push(
      (
        await ask(
          tokenB,
          (await call("/conversations", json(tokenB, {}))).data.id,
          "sick leave",
        )
      ).status,
    );
  assert.deepEqual(codes, [200, 200, 429]);
  process.env.RATE_LIMIT_PER_MIN = "1000";
  process.env.FULL_CONTEXT_MAX_CHUNKS = "0"; // tests default to keyword retrieval; full-context mode is enabled per test
});
test("deleting a document removes its chunks and chats", async () => {
  assert.equal(
    (await call(`/documents/${docId}`, json(tokenB, null, "DELETE"))).status,
    404,
  );
  assert.equal(
    (await call(`/documents/${docId}`, json(tokenA, null, "DELETE"))).status,
    200,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT COUNT(*)::int n FROM chunks WHERE document_id = $1",
        [docId],
      )
    ).rows[0].n,
    0,
  );
});
