const express = require("express");
const { getContactos, getChatContactos, getChatById } = require("../controllers/contacto.controller");
const router = express.Router();

router.get("/obtenerContactos", getContactos); // 👈 aquí va la barra inicial

router.get("/chats-contacto", getChatContactos ); // 👈 aquí va la barra inicial

router.get("/chat/:numero", getChatById ); // 👈 aquí va la barra inicial




module.exports = router;
