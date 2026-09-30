const express = require('express');
const multer = require('multer');
const Document = require('../models/Document');
const { chunkText } = require('../lib/chunk');
const { embedDocuments, embedQuery, generateAnswer } = require('../lib/gemini');
const { namespace } = require('../lib/pinecone');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) =>
    file.mimetype === 'application/pdf' ? cb(null, true) : cb(new Error('Only PDF files are allowed')),
});


// Page-by-page PDF text extraction with pdf.js (ESM package, loaded via dynamic import).
let pdfjsPromise;
const loadPdfjs = () => (pdfjsPromise ||= import('pdfjs-dist/legacy/build/pdf.mjs'));

async function parsePdf(buffer) {
  const pdfjs = await loadPdfjs();
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true, verbosity: 0 }).promise;
  } catch (e) {
    throw Object.assign(new Error('Could not read this PDF (corrupted or password-protected)'), { status: 422 });
  }
  const pageTexts = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    pageTexts.push(tc.items.map((it) => it.str).join(' '));
  }
  return { numpages: doc.numPages, pageTexts };
}

const SYSTEM_PROMPT = `You are DocuMind, an assistant that answers questions strictly from the provided document excerpts.
Rules:
- Use only the context given. Do not use outside knowledge.
- If the answer is not in the context, reply exactly: "I couldn't find that in the document."
- Keep answers clear and concise. Use bullet points for lists.`;

// List documents
router.get('/', async (_req, res, next) => {
  try {
    res.json(await Document.find().sort({ createdAt: -1 }));
  } catch (e) { next(e); }
});

// Upload a PDF -> parse -> chunk -> embed -> store vectors in Pinecone
router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // Extract text page by page so every chunk knows its page number
    const { numpages, pageTexts } = await parsePdf(req.file.buffer);

    let items = [];
    pageTexts.forEach((t, i) => {
      if (t && t.trim()) chunkText(t).forEach((c) => items.push({ text: c, page: i + 1 }));
    });
    if (items.length === 0) {
      return res.status(422).json({ error: 'No readable text found (scanned PDF?)' });
    }

    const vectors = await embedDocuments(items.map((x) => x.text));

    const doc = await Document.create({
      name: req.file.originalname,
      pages: numpages,
      chunks: items.length,
    });

    const records = vectors.map((values, i) => ({
      id: `${doc._id}-${i}`,
      values,
      metadata: { text: items[i].text, chunk: i, ...(items[i].page ? { page: items[i].page } : {}) },
    }));

    const ns = namespace(doc._id);
    for (let i = 0; i < records.length; i += 100) {
      await ns.upsert(records.slice(i, i + 100));
    }

    res.status(201).json(doc);
  } catch (e) { next(e); }
});

// Rewrites a follow-up ("what about its cost?") into a standalone question using chat history
const REWRITE_PROMPT = `Rewrite the user's latest question as a single standalone question that can be understood without the chat history. Resolve pronouns and references. Output only the rewritten question, nothing else.`;

// Ask a question about one document (the RAG step, with chat memory)
router.post('/:id/ask', async (req, res, next) => {
  try {
    const { question, history = [] } = req.body;
    if (!question || !question.trim()) return res.status(400).json({ error: 'Question is required' });

    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    // keep only the last 6 turns as memory
    const recent = history.slice(-6).filter((m) => m && typeof m.text === 'string');
    const transcript = recent.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`).join('\n');

    // 0) query rewriting for follow-up questions
    let standalone = question;
    if (recent.length > 0) {
      const rewritten = await generateAnswer(
        REWRITE_PROMPT,
        `Chat history:\n${transcript}\n\nLatest question: ${question}\n\nStandalone question:`
      );
      standalone = rewritten.trim() || question;
    }

    // 1) embed the question, 2) retrieve top-5 similar chunks
    const queryVector = await embedQuery(standalone);
    const result = await namespace(doc._id).query({
      vector: queryVector,
      topK: 5,
      includeMetadata: true,
    });

    const matches = result.matches || [];
    if (matches.length === 0) {
      return res.json({ answer: "I couldn't find that in the document.", sources: [] });
    }

    // 3) build the prompt with retrieved context (+ recent chat) and generate the answer
    const context = matches
      .map((m, i) => `[${i + 1}]${m.metadata.page ? ` (page ${m.metadata.page})` : ''} ${m.metadata.text}`)
      .join('\n\n');
    const answer = await generateAnswer(
      SYSTEM_PROMPT,
      `${transcript ? `Recent conversation:\n${transcript}\n\n` : ''}Context:\n${context}\n\nQuestion: ${standalone}\n\nAnswer:`
    );

    res.json({
      answer,
      sources: matches.map((m) => ({
        chunk: m.metadata.chunk,
        page: m.metadata.page || null,
        score: Number(m.score.toFixed(3)),
        text: m.metadata.text.slice(0, 220) + (m.metadata.text.length > 220 ? '...' : ''),
      })),
    });
  } catch (e) { next(e); }
});

// Delete a document and its vectors
router.delete('/:id', async (req, res, next) => {
  try {
    await namespace(req.params.id).deleteAll();
    await Document.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
