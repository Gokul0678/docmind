const pdfParse = require("pdf-parse/lib/pdf-parse.js");
const pool = require("../config/db");
const ApiError = require("../utils/ApiError");
const { chunk } = require("../utils/chunker");

const MAX_DOCS = 20,
  MAX_CHUNKS = 400;

const extractText = async (file) => {
  if (/\.pdf$/i.test(file.originalname)) {
    try {
      return (await pdfParse(file.buffer)).text;
    } catch {
      throw new ApiError(400, "Could not read this PDF");
    }
  }
  return file.buffer.toString("utf8");
};

exports.list = async (userId) =>
  (
    await pool.query(
      "SELECT id, title, filename, chunk_count, created_at FROM documents WHERE user_id = $1 ORDER BY id DESC",
      [userId],
    )
  ).rows;

exports.create = async (userId, file) => {
  if (!file) throw new ApiError(400, "Attach a PDF, TXT or MD file");
  const {
    rows: [{ n }],
  } = await pool.query(
    "SELECT COUNT(*)::int AS n FROM documents WHERE user_id = $1",
    [userId],
  );
  if (n >= MAX_DOCS)
    throw new ApiError(400, `You can store up to ${MAX_DOCS} documents`);
  const text = await extractText(file);
  const chunks = chunk(text);
  if (!chunks.length)
    throw new ApiError(
      400,
      "No readable text found (scanned PDFs are not supported)",
    );
  if (chunks.length > MAX_CHUNKS)
    throw new ApiError(
      400,
      "Document is too long. Please upload a shorter one",
    );

  const client = await pool.connect();
  try {
    await client.query("BEGIN"); // document + all chunks are saved together or not at all
    const {
      rows: [doc],
    } = await client.query(
      "INSERT INTO documents (user_id, title, filename, char_count, chunk_count) VALUES ($1,$2,$3,$4,$5) RETURNING id, title, filename, chunk_count",
      [
        userId,
        file.originalname.replace(/\.[^.]+$/, ""),
        file.originalname,
        text.length,
        chunks.length,
      ],
    );
    await client.query(
      `INSERT INTO chunks (document_id, user_id, idx, content)
       SELECT $1, $2, ord - 1, c FROM unnest($3::text[]) WITH ORDINALITY AS t(c, ord)`,
      [doc.id, userId, chunks],
    );
    await client.query("COMMIT");
    return doc;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
};

exports.remove = async (userId, id) => {
  const { rowCount } = await pool.query(
    "DELETE FROM documents WHERE id = $1 AND user_id = $2",
    [id, userId],
  );
  if (!rowCount) throw new ApiError(404, "Document not found");
};
