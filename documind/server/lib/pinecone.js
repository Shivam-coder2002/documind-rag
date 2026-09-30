const { Pinecone } = require('@pinecone-database/pinecone');
const { DIM } = require('./gemini');

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const INDEX = process.env.PINECONE_INDEX || 'documind';

// Create the serverless index on first run.
async function ensureIndex() {
  const { indexes } = await pc.listIndexes();
  if (!(indexes || []).some((i) => i.name === INDEX)) {
    console.log(`Creating Pinecone index "${INDEX}"...`);
    await pc.createIndex({
      name: INDEX,
      dimension: DIM,
      metric: 'cosine',
      spec: { serverless: { cloud: 'aws', region: 'us-east-1' } },
      waitUntilReady: true,
    });
  }
}

// One namespace per document keeps each PDF's vectors isolated.
const namespace = (id) => pc.index(INDEX).namespace(String(id));

module.exports = { ensureIndex, namespace };
