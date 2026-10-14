const ApiError = require('../utils/ApiError');
const hits = new Map(); // userId -> timestamps of recent requests (protects the AI quota)

// Simple in-memory sliding-window limiter (one instance). Use Redis if you scale to several servers.
module.exports = (req, res, next) => {
  const limit = Number(process.env.RATE_LIMIT_PER_MIN) || 15, now = Date.now();
  const recent = (hits.get(req.userId) || []).filter((t) => now - t < 60000);
  if (recent.length >= limit) return next(new ApiError(429, 'Too many questions. Please wait a minute and try again.'));
  hits.set(req.userId, [...recent, now]);
  next();
};
module.exports.reset = () => hits.clear();
