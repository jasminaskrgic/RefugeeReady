import express from "express";

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json({ limit: "2mb" }));
app.use(express.static("."));

const MAX_TOKENS = 8000;
const MAX_TURNS = 24;
const MAX_CHARS = 200000;
const RETRYABLE = [429, 500, 502, 503, 504];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function validMessages(messages) {
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > MAX_TURNS) {
    return false;
  }

  let chars = 0;

  for (let i = 0; i < messages.length; i++) {
    const t = messages[i];

    if (
      !t ||
      (t.role !== "user" && t.role !== "assistant") ||
      typeof t.content !== "string" ||
      !t.content
    ) {
      return false;
    }

    if (t.role !== (i % 2 === 0 ? "user" : "assistant")) {
      return false;
    }

    chars += t.content.length;
  }

  return messages[messages.length - 1].role === "user" && chars <= MAX_CHARS;
}

function toGeminiContents(messages) {
  return messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
}

async function callGemini(key, model, messages) {
  const contents = toGeminiContents(messages);

  for (let attempt = 0; attempt < 3; attempt++) {
    let res;

    try {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": key,
          },
          body: JSON.stringify({
            contents,
            generationConfig: {
              maxOutputTokens: MAX_TOKENS,
              temperature: 0.2,
              responseMimeType: "application/json",
            },
          }),
        }
      );
    } catch (e) {
      if (attempt < 2) {
        await sleep(1000 * (attempt + 1));
        continue;
      }

      return { status: 0, detail: String(e) };
    }

    if (res.ok) {
      return { data: await res.json() };
    }

    const detail = await res.text().catch(() => "");

    if (RETRYABLE.includes(res.status) && attempt < 2) {
      await sleep(1000 * (attempt + 1));
      continue;
    }

    return {
      status: res.status,
      detail,
    };
  }

  return {
    status: 0,
    detail: "retries exhausted",
  };
}

app.post("/api/review", async (req, res) => {
  const messages = req.body?.messages;

  if (!validMessages(messages)) {
    return res.status(413).json({
      status: "error",
      code: "prompt_too_large",
    });
  }

  const key = process.env.GEMINI_API_KEY;

  if (!key) {
    return res.status(500).json({
      status: "error",
      code: "server_misconfigured",
    });
  }

  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";

  const out = await callGemini(key, model, messages);

  if (!out.data) {
    console.error("Gemini API error", out.status, out.detail);

    return res.status(502).json({
      status: "error",
      code: "gemini_api_error",
      httpStatus: out.status,
      detail: out.detail,
    });
  }

  const d = out.data;
  const candidate = d.candidates?.[0];

  if (
    d.promptFeedback?.blockReason ||
    candidate?.finishReason === "SAFETY" ||
    candidate?.finishReason === "PROHIBITED_CONTENT"
  ) {
    return res.status(400).json({
      status: "error",
      code: "refused",
    });
  }

  const text = (candidate?.content?.parts || [])
    .map((p) => (typeof p.text === "string" ? p.text : ""))
    .join("")
    .trim();
console.log("RAW GEMINI RESPONSE:");
console.log(text);
console.log("FINISH REASON:", candidate?.finishReason);
  if (!text) {
    return res.status(502).json({
      status: "error",
      code: "empty_completion",
    });
  }

  return res.json({
    status: "done",
    text,
    truncated: candidate?.finishReason === "MAX_TOKENS",
  });
});

app.listen(PORT, () => {
  console.log(`RefugeeReady running on port ${PORT}`);
});
