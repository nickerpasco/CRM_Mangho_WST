const client = require("../config/whatsapp");

const contactosRegistrados = new Set();

function initWhatsAppService(io) {
  client.on("message", async (msg) => {
    if (msg.from.includes("@g.us") || msg.from === "status@broadcast") return;

    const contacto = await msg.getContact();
    const numero = contacto.number.startsWith("51") ? contacto.number : "51" + contacto.number;

    // Emitir mensaje recibido al frontend
    io.emit("message", {
      id: msg.id._serialized,
      from: numero,
      body: msg.body,
    });

    // Registrar contacto si no está registrado
    if (!contactosRegistrados.has(numero)) {
      contactosRegistrados.add(numero);
      io.emit("contacto_nuevo", {
        numero,
        nombre: contacto.pushname || "Sin Nombre",
      });
    }
  });

  client.on("message_ack", (msg, ack) => {
    io.emit("message_ack_status", {
      id: msg.id._serialized,
      numero: msg.to,
      ackStatus: ack,
      timestamp: new Date().toISOString(),
    });
  });
}

module.exports = initWhatsAppService;
