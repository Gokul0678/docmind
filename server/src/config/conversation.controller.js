const h = require("../utils/asyncHandler");
const conversations = require("../services/conversation.service"),
  chat = require("../services/chat.service"),
  llm = require("../services/llm.service");

exports.list = h(async (req, res) =>
  res.json(await conversations.list(req.userId)),
);
exports.create = h(async (req, res) =>
  res.status(201).json(await conversations.create(req.userId, req.body)),
);
exports.messages = h(async (req, res) =>
  res.json(await conversations.messages(req.userId, req.params.id)),
);
exports.remove = h(async (req, res) => {
  await conversations.remove(req.userId, req.params.id);
  res.json({ deleted: true });
});

// Streams the answer to the browser as server-sent events: sources -> token... -> done (or error)
exports.ask = h(async (req, res) => {
  const { sources, messages, full } = await chat.prepare(
    req.userId,
    req.params.id,
    req.body.question,
  ); // errors here are normal JSON errors
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  const send = (event, data) =>
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const abort = new AbortController();
  res.on("close", () => abort.abort()); // stop paying for tokens if the user leaves

  send("sources", full ? [] : sources.map(({ content, ...s }) => s)); // in full-context mode the cited sources are sent at the end
  let answer = "";
  try {
    if (!sources.length) {
      answer = chat.NO_ANSWER;
      send("token", { text: answer });
    } // nothing relevant: skip the AI call entirely
    else
      for await (const text of llm.streamCompletion(messages, abort.signal)) {
        answer += text;
        send("token", { text });
      }
    const finalSources = chat.finalSources(answer, sources, full);
    const saved = await chat.saveAnswer(req.params.id, answer, finalSources);
    send("done", {
      id: saved.id,
      sources: finalSources.map(({ content, ...s }) => s),
    });
  } catch (e) {
    if (!abort.signal.aborted)
      send("error", {
        message: e.status
          ? e.message
          : "The AI service failed. Please try again.",
      });
  }
  res.end();
});
