const ApiError = require("../utils/ApiError");

// Streams the model's answer token by token. Works with any OpenAI-compatible API (Groq, OpenAI, etc.).
exports.streamCompletion = async function* (messages, signal) {
  if ((process.env.LLM_PROVIDER || "mock") === "mock")
    return yield* mockStream(messages);
  if (!process.env.LLM_API_KEY)
    throw new ApiError(500, "AI is not configured: set LLM_API_KEY");

  let res;
  try {
    res = await fetch(`${process.env.LLM_BASE_URL}/chat/completions`, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.LLM_MODEL,
        messages,
        stream: true,
        temperature: 0.2,
        max_tokens: 700,
      }),
    });
  } catch (e) {
    if (e.name === "AbortError") throw e;
    throw new ApiError(502, "Could not reach the AI provider");
  }
  if (res.status === 429)
    throw new ApiError(
      429,
      "The AI provider is rate limiting requests. Try again shortly.",
    );
  if (!res.ok) throw new ApiError(502, `AI provider error (${res.status})`);

  // Server-sent events: lines like `data: {"choices":[{"delta":{"content":"Hi"}}]}` ending with `data: [DONE]`
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const part of res.body) {
    buffer += decoder.decode(part, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop(); // keep the incomplete last line for the next network chunk
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        const token = JSON.parse(data).choices?.[0]?.delta?.content;
        if (token) yield token;
      } catch {
        /* ignore keep-alive lines */
      }
    }
  }
};

// Collects a full answer (used for short helper calls such as query rewriting)
exports.complete = async (messages) => {
  let out = "";
  for await (const token of exports.streamCompletion(messages)) out += token;
  return out;
};

// Offline stand-in used in development and tests: quotes the top excerpt and cites it
async function* mockStream(messages) {
  const last = messages[messages.length - 1].content;
  const first =
    /\[1\][^\n]*\n([\s\S]*?)(?:\n\n\[2\]|\n\nQuestion:)/
      .exec(last)?.[1]
      ?.trim() || "";
  const text = `(mock AI) Based on your documents: ${first.slice(0, 220)} [1]`;
  for (const word of text.split(/(?<=\s)/)) {
    await new Promise((r) => setTimeout(r, 4));
    yield word;
  }
}
