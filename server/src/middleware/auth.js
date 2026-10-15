const ApiError = require("../utils/ApiError");
const { verify } = require("../utils/token");

module.exports = (req, res, next) => {
  try {
    const id = verify(
      (req.headers.authorization || "").replace("Bearer ", ""),
    ).id;
    req.userId = id;
    req.user = { id };
    next();
  } catch {
    next(new ApiError(401, "Unauthorized"));
  }
};
