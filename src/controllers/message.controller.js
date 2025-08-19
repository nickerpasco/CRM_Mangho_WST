const client = require("../config/whatsapp");
const { responderConIA } = require("../services/ia.service");
const { guardarContacto } = require("../services/contacto.service");

const sendMessage = async (req, res) => {
  const { to, message } = req.body;
  if (!to || !message) return res.status(400).json({ error: "Faltan datos" });

  try {
    const number = to + "@c.us";
    const response = await client.sendMessage(number, message);
    res.json({ status: "ok", response });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const handleIncoming = () => {
  client.on("message", async (msg) => {
    if (msg.from.includes("@g.us") || msg.from === "status@broadcast") return;

    const contacto = await msg.getContact();
    const numero = contacto.number.startsWith("51") ? contacto.number : "51" + contacto.number;

    const resultado = await responderConIA(msg.body);

    if (!resultado) return msg.reply("No entendí tu mensaje, intenta de nuevo.");

    switch (resultado.accion) {
      case "REGISTRAR_CONTACTO":
        await guardarContacto(numero, contacto.pushname || contacto.number);
        msg.reply("¡Hola! Gracias por escribirnos. ¿En qué puedo ayudarte?");
        break;
      case "REGISTRAR_CONTACTO_ETAPA":
        await guardarContacto(numero, contacto.pushname || contacto.number);
        msg.reply(`Gracias por tu interés en la campaña ${resultado.idCampania}. Pronto te enviaremos más info.`);
        break;
      default:
        msg.reply("Disculpa, no pude procesar tu mensaje.");
    }
  });
};

module.exports = { sendMessage, handleIncoming };
