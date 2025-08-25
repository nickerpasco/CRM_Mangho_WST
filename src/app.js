const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const whatsappRoutes = require("./routes/whatsapp.routes");
const client = require("./config/whatsapp");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(cors({ origin: "http://localhost:4300" }));

// Rutas
app.use("/whatsapp", whatsappRoutes);


const initWhatsAppService = require("./services/whatsapp.service");

const contactoRoutes = require("./routes/contacto.routes");
app.use("/contactos", contactoRoutes);

const messageRoutes = require("./routes/message.routes");
app.use("/mensajes", messageRoutes);

// const motificationRouters = require("./routes/notificacion.routes");
// app.use("/notificaciones", motificationRouters);
 

 

// Inicialización de WhatsApp y sockets
initWhatsAppService(io);

client.on("qr", (qr) => {
  console.log("📲 Escanea el QR en consola");
  io.emit("qr", qr);
});

client.on("ready", () => {
  console.log("✅ Cliente conectado");
  io.emit("ready");
});

client.on("disconnected", (reason) => {
  console.warn("⚠️ Cliente desconectado:", reason);
});

client.initialize();

module.exports = { app, server ,io};
