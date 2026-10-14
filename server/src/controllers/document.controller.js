const h = require('../utils/asyncHandler'), svc = require('../services/document.service');
exports.list = h(async (req, res) => res.json(await svc.list(req.userId)));
exports.create = h(async (req, res) => res.status(201).json(await svc.create(req.userId, req.file)));
exports.remove = h(async (req, res) => { await svc.remove(req.userId, req.params.id); res.json({ deleted: true }); });
