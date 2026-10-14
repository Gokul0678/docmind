// Splits text into overlapping chunks, preferring to break at sentence or word boundaries
exports.chunk = (text, size = 900, overlap = 150) => {
  const clean = text.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  const out = [];
  let i = 0;
  while (i < clean.length) {
    let end = Math.min(i + size, clean.length);
    if (end < clean.length) {
      const sentence = clean.lastIndexOf('. ', end), space = clean.lastIndexOf(' ', end);
      end = sentence > i + size * 0.5 ? sentence + 1 : space > i ? space : end;
    }
    const piece = clean.slice(i, end).trim();
    if (piece) out.push(piece);
    if (end >= clean.length) break;
    i = Math.max(end - overlap, i + 1);
    const gap = clean.slice(i, end).search(/\s/); // start the next chunk at a word boundary, not in the middle of a word
    if (gap > 0) i += gap + 1;
  }
  return out;
};
