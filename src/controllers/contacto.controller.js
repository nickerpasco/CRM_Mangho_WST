const client = require("../config/whatsapp");

let contactosCache = [];
let chatsCache = [];

const getContactos = async (req, res) => {
  if (contactosCache.length === 0) {
    contactosCache = await client.getContacts();
  }

  const data = contactosCache.map(c => ({
    id: c.id._serialized,
    nombre: c.name || c.pushname || '',
    numero: c.number,
    esGrupo: c.isGroup
  }));

  res.json(data);
};

const getChatContactos = async (req, res) => {
   if (chatsCache.length === 0) {
        chatsCache = await client.getChats();
        //return res.status(500).json({ mensaje: 'Chats no disponibles aún. ¿Escaneaste el QR?' });
    }

    const data = chatsCache
        .filter(chat => !chat.isGroup) // solo chats privados
        .map(chat => ({
            id: chat.id._serialized,
            nombre: chat.name || chat.contact?.pushname || '',
            numero: chat.id.user,
            esGrupo: chat.isGroup,
            ultimaActividad: chat.timestamp
        }));

    res.json(data);
};
 

 const getChatById = async (req, res) => {
  const numero = req.params.numero;

  // Asegurar formato correcto para WhatsApp
  const chatId = `${numero}@c.us`; // 👈 Template string correcto

  try {
    const chat = await client.getChatById(chatId);

    // Cargar últimos mensajes del chat
    const mensajes = await chat.fetchMessages({ limit: 20 });

    // Formatear para enviar como JSON
    const historial = mensajes.map((m) => ({
      id: m.id._serialized, // ID único del mensaje
      de: m.fromMe ? "yo" : m.author || m.from,
      texto: m.body,
      estado: m.ack,
      fecha: m.timestamp,
    }));

    res.json({
      status: "ok",
      numero: numero,
      mensajes: historial,
    });
  } catch (err) {
    res.status(404).json({
      status: "error",
      mensaje: `No se pudo obtener el chat de ${numero}`, // 👈 Template string corregido
      error: err.message,
    });
  }
};

module.exports = { getContactos,getChatContactos,getChatById };
