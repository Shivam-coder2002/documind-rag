require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { ensureIndex } = require('./lib/pinecone');
const documentRoutes = require('./routes/documents');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/documents', documentRoutes);

// Central error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

const PORT = process.env.PORT || 5000;

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('MongoDB connected');
  await ensureIndex();
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
})().catch((e) => {
  console.error('Startup failed:', e.message);
  process.exit(1);
});
