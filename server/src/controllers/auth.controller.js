const h = require("../utils/asyncHandler"),
  svc = require("../services/auth.service");
exports.register = h(async (req, res) =>
  res.status(201).json(await svc.register(req.body)),
);
exports.login = h(async (req, res) => res.json(await svc.login(req.body)));
