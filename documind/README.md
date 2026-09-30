# DocuMind: Chat with your PDFs (RAG)

Upload a PDF and ask questions about it. Answers are generated only from the document's own content
using Retrieval-Augmented Generation. Every answer shows the source chunks and their **page numbers**, and follow-up questions work through **chat memory**.

**Tech stack:** React (Vite), Node.js, Express, MongoDB, Pinecone (vector DB), Google Gemini API

## How it works
1. **Ingest:** PDF text is extracted page by page, split into overlapping ~1000-character chunks, embedded with Gemini, and stored in Pinecone (one namespace per document).
2. **Retrieve:** Follow-up questions are first rewritten into standalone questions using recent chat history. The question is embedded and the top-5 most similar chunks are fetched (cosine similarity).
3. **Generate:** The chunks are passed to Gemini as context with a strict prompt, so it answers only from the document or says it couldn't find it.

## Setup
Requirements: Node 18+, MongoDB (local or Atlas), free Gemini API key, free Pinecone API key.

```bash
# server
cd server
cp .env.example .env      # fill in your keys
npm install
npm run dev               # http://localhost:5000  (creates the Pinecone index on first run)

# client (new terminal)
cd client
npm install
npm run dev               # http://localhost:5173
```

## API
| Method | Route | Description |
|--------|-------|-------------|
| GET | /api/documents | List uploaded documents |
| POST | /api/documents | Upload a PDF (multipart, field `file`) |
| POST | /api/documents/:id/ask | Ask a question `{ "question": "..." }` |
| DELETE | /api/documents/:id | Delete document and its vectors |

## Limitations
- Scanned/image-only PDFs are not supported (no OCR).
- Chat memory is kept in the browser session only (last 6 turns), not saved to the database.
