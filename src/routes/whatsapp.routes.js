const express = require("express");
const { getStatus, disconnect, reconnect } = require("../controllers/whatsapp.controller");
const router = express.Router();

router.get("/status", getStatus);
router.get("/disconnect", disconnect);
router.get("/reconnect", reconnect);

module.exports = router;
