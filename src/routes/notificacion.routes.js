const express = require("express");
const { enviarNotificacion } = require("../controllers/notificacion.controller");
const router = express.Router();

router.post("/", enviarNotificacion);

module.exports = router;
