const pool = require("../config/db");

// Retrieval step of RAG: finds the most relevant chunks with PostgreSQL full-text search.
// Question words are stemmed and OR-ed together, then results are ranked with ts_rank_cd.
exports.search = async (userId, query, documentId = null, k = 5) => {
  const terms = [
    ...new Set(query.toLowerCase().match(/[a-z0-9]{3,}/g) || []),
  ].slice(0, 20);
  if (!terms.length) return [];
  const { rows } = await pool.query(
    `SELECT c.id, c.document_id, d.title, c.idx, c.content, ts_rank_cd(c.tsv, q) AS score
       FROM chunks c JOIN documents d ON d.id = c.document_id, to_tsquery('english', $2) q
      WHERE c.user_id = $1 AND c.tsv @@ q AND ($3::int IS NULL OR c.document_id = $3)
      ORDER BY score DESC, c.id LIMIT $4`,
    [userId, terms.join(" | "), documentId, k],
  );
  return rows;
};

// Number of chunks the user can search (all documents, or one document)
exports.scopeSize = async (userId, documentId = null) =>
  (
    await pool.query(
      "SELECT COUNT(*)::int AS n FROM chunks WHERE user_id = $1 AND ($2::int IS NULL OR document_id = $2)",
      [userId, documentId],
    )
  ).rows[0].n;

// Every chunk in scope, in reading order (used for small documents)
exports.all = async (userId, documentId = null) =>
  (
    await pool.query(
      `SELECT c.id, c.document_id, d.title, c.idx, c.content FROM chunks c JOIN documents d ON d.id = c.document_id
      WHERE c.user_id = $1 AND ($2::int IS NULL OR c.document_id = $2) ORDER BY c.document_id, c.idx`,
      [userId, documentId],
    )
  ).rows;
