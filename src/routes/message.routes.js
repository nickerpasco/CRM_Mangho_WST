const express = require("express");
const { sendMessage, handleIncoming } = require("../controllers/message.controller");
const router = express.Router();

router.post("/send-message", sendMessage);

// activar escucha de mensajes entrantes
handleIncoming();

module.exports = router;
