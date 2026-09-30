const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    pages: Number,
    chunks: Number,
  },
  { timestamps: true }
);

module.exports = mongoose.model('Document', documentSchema);
