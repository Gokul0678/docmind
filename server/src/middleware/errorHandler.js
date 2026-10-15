const PG = {
  23505: [409, "Already exists"],
  23503: [400, "Invalid reference"],
  23514: [400, "A value failed validation"],
  "22P02": [400, "Invalid value"],
};
module.exports = (err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE")
    return res.status(413).json({ message: "File is too large (max 5 MB)" });
  const [pgStatus, pgMsg] = PG[err.code] || [];
  const status = err.status || pgStatus || 500;
  if (status === 500) console.error(err);
  res
    .status(status)
    .json({ message: err.status ? err.message : pgMsg || "Server error" });
};
