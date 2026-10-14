const pool = require('../config/db');
const ApiError = require('../utils/ApiError');

exports.list = async (userId) =>
  (await pool.query('SELECT id, title, document_id, created_at FROM conversations WHERE user_id = $1 ORDER BY id DESC', [userId])).rows;

exports.create = async (userId, { documentId = null } = {}) => {
  if (documentId !== null) {
    const { rowCount } = await pool.query('SELECT 1 FROM documents WHERE id = $1 AND user_id = $2', [documentId, userId]);
    if (!rowCount) throw new ApiError(400, 'Invalid document');
  }
  return (await pool.query('INSERT INTO conversations (user_id, document_id, title) VALUES ($1,$2,$3) RETURNING id, title, document_id',
    [userId, documentId, 'New chat'])).rows[0];
};

exports.get = async (userId, id) => {
  const { rows: [c] } = await pool.query('SELECT id, title, document_id FROM conversations WHERE id = $1 AND user_id = $2', [id, userId]);
  if (!c) throw new ApiError(404, 'Conversation not found');
  return c;
};

exports.messages = async (userId, id) => {
  await exports.get(userId, id);
  return (await pool.query('SELECT id, role, content, sources FROM messages WHERE conversation_id = $1 ORDER BY id', [id])).rows;
};

exports.remove = async (userId, id) => {
  const { rowCount } = await pool.query('DELETE FROM conversations WHERE id = $1 AND user_id = $2', [id, userId]);
  if (!rowCount) throw new ApiError(404, 'Conversation not found');
};
