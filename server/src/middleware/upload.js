const multer = require('multer');
const ApiError = require('../utils/ApiError');

module.exports = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => (/\.(pdf|txt|md)$/i.test(file.originalname) ? cb(null, true) : cb(new ApiError(400, 'Only PDF, TXT and MD files are supported'))),
}).single('file');
