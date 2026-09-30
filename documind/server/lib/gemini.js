// Thin wrapper over the Gemini REST API (no SDK needed, Node 18+ fetch).
const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const EMBED_MODEL = process.env.EMBED_MODEL || 'gemini-embedding-001';
const CHAT_MODEL = process.env.CHAT_MODEL || 'gemini-2.5-flash';
const DIM = Number(process.env.EMBED_DIM || 768);

async function post(path, body) {
  const res = await fetch(`${BASE}/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': process.env.GEMINI_API_KEY,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  return res.json();
}

// Embed many chunks (documents) in batches of 50.
async function embedDocuments(texts) {
  const out = [];
  for (let i = 0; i < texts.length; i += 50) {
    const batch = texts.slice(i, i + 50);
    const data = await post(`models/${EMBED_MODEL}:batchEmbedContents`, {
      requests: batch.map((text) => ({
        model: `models/${EMBED_MODEL}`,
        content: { parts: [{ text }] },
        taskType: 'RETRIEVAL_DOCUMENT',
        outputDimensionality: DIM,
      })),
    });
    out.push(...data.embeddings.map((e) => e.values));
  }
  return out;
}

// Embed the user's question.
async function embedQuery(text) {
  const data = await post(`models/${EMBED_MODEL}:embedContent`, {
    content: { parts: [{ text }] },
    taskType: 'RETRIEVAL_QUERY',
    outputDimensionality: DIM,
  });
  return data.embedding.values;
}

// Generate an answer from the retrieved context.
async function generateAnswer(systemPrompt, userPrompt) {
  const data = await post(`models/${CHAT_MODEL}:generateContent`, {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: { temperature: 0.2 },
  });
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
}

module.exports = { embedDocuments, embedQuery, generateAnswer, DIM };
