const router = require("express").Router();
const auth = require("../middleware/auth"),
  upload = require("../middleware/upload"),
  rateLimit = require("../middleware/rateLimit");
const authC = require("../controllers/auth.controller"),
  docC = require("../controllers/document.controller"),
  convC = require("../controllers/conversation.controller");

router.post("/auth/register", authC.register);
router.post("/auth/login", authC.login);

router.get("/documents", auth, docC.list);
router.post("/documents", auth, upload, docC.create);
router.delete("/documents/:id", auth, docC.remove);

router.get("/conversations", auth, convC.list);
router.post("/conversations", auth, convC.create);
router.get("/conversations/:id/messages", auth, convC.messages);
router.post("/conversations/:id/messages", auth, rateLimit, convC.ask);
router.delete("/conversations/:id", auth, convC.remove);

module.exports = router;
