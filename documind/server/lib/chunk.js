// Split text into overlapping chunks so context isn't cut mid-idea.
function chunkText(text, size = 1000, overlap = 200) {
  const clean = text.replace(/\s+/g, ' ').trim();
  const chunks = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + size, clean.length);
    if (end < clean.length) {
      const lastSpace = clean.lastIndexOf(' ', end);
      if (lastSpace > start + size * 0.6) end = lastSpace; // avoid cutting words
    }
    chunks.push(clean.slice(start, end).trim());
    if (end === clean.length) break;
    start = end - overlap;
  }
  return chunks.filter(Boolean);
}

module.exports = { chunkText };
