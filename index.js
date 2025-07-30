const express = require("express");
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const { Server } = require("socket.io");
const http = require("http");
const cors = require("cors");
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const axios = require("axios");
// Middleware para parsear JSON
app.use(express.json()); // Esto es necesario para leer los cuerpos JSON en las solicitudes POST

app.use(express.static("public"));

const corsOptions = {
  origin: "http://localhost:4300", // Permite solicitudes solo desde esta URL
  methods: "GET,POST,PUT,DELETE", // Métodos permitidos
  allowedHeaders: "Content-Type, Authorization", // Encabezados permitidos
};

// Habilitar CORS con la configuración
app.use(cors(corsOptions));

// Configuración del cliente WhatsApp
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true, // Si prefieres ver el navegador, ponlo en 'false'
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

// const client = new Client({
//   authStrategy: new LocalAuth(),
//   puppeteer: {
//     headless: false, // Cambia a 'false' para ver el navegador
//     args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-extensions', '--remote-debugging-port=9222']
//   }
// });

app.get("/whatsapp-status", async (req, res) => {
  try {
    const state = await client.getState();
    res.json({
      status: "ok",
      connection: state,
      info: client.info
        ? {
            wid: client.info.wid._serialized,
            pushname: client.info.pushname,
          }
        : null,
    });
  } catch (err) {
    res.status(200).json({
      status: "desconectado",
      connection: "NOT_CONNECTED",
      error: err.message,
    });
  }
});

app.get("/whatsapp-disconnect", async (req, res) => {
  try {
    await client.destroy(); // Cierra sesión y termina la conexión

    res.json({
      status: "ok",
      message: "Cliente de WhatsApp desconectado",
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      message: "Error al desconectar cliente",
      error: err.message,
    });
  }
});

app.get("/whatsapp-reconnect", async (req, res) => {
  try {
    await client.destroy(); // Cierra cualquier instancia previa
    await client.initialize(); // Re-inicia el cliente

    res.json({
      status: "ok",
      message: "Cliente de WhatsApp reiniciado",
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      message: "Error al reiniciar cliente",
      error: err.message,
    });
  }
});

// Este evento se dispara cuando se genera un QR
client.on("qr", (qr) => {
  // Mostrar el QR en consola
  qrcode.generate(qr, { small: true }); // Muestra el QR como caracteres en consola
  io.emit("qr", qr); // También lo emite para mostrarlo en la web
});

client.on("disconnected", () => {
  console.log("X Cliente Desconectado");
});

client.on("disconnected", (reason) => {
  console.warn("⚠️ Cliente desconectado:", reason);
});

app.get("/chat/:numero", async (req, res) => {
  const numero = req.params.numero;

  // Asegurar formato correcto para WhatsApp
  const chatId = `${numero}@c.us`;

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
      //fecha: new Date(m.timestamp * 1000).toLocaleString(),
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
      mensaje: `No se pudo obtener el chat de ${numero}`,
      error: err.message,
    });
  }
});

// Enviar un mensaje desde el backend
app.post("/send-message", (req, res) => {
  const { to, message } = req.body; // 'to' es el número al que enviamos, 'message' es el contenido

  const number = to + "@c.us"; // Formato de número en WhatsApp
  client
    .sendMessage(number, message)
    .then((response) => {
      res.send({ status: "success", response });
    })
    .catch((err) => {
      res.status(500).send({ status: "error", message: err.message });
    });
});

// client.on('message', msg => {
//   io.emit('message', {
//     from: msg.from,
//     body: msg.body
//   });
// });

app.post("/notificar", (req, res) => {
  const { titulo, mensaje, data } = req.body;

  if (!data) {
    return res.status(400).json({
      status: "error",
      message: "El campo 'data' es requerido",
    });
  }

  io.emit("notificacion", {
    titulo,
    mensaje,
    data,
    timestamp: new Date().toISOString(),
  });

  res.send({ status: "ok", message: "Notificación enviada", enviado: data });
});

client.on("message_ack", (msg, ack) => {
  const data = {
    id: msg.id._serialized, // ID del mensaje
    numero: msg.to, // Número al que se le envió el mensaje
    mensaje: msg.body, // Texto del mensaje
    ackStatus: ack, // Estado del mensaje (0, 1, 2, 3)
    timestamp: new Date().toISOString(), // Hora actual
  };

  // console.log('Estado de mensaje:', data);

  // Emitir los cambios de estado del mensaje al frontend
  io.emit("message_ack_status", data);
});

const contactosRegistrados = new Set(); // Guarda números ya registrados

client.on("message", async (msg) => {
  console.log(`Mensaje recibido de ${msg.from}: ${msg.body}`);

  if (msg.from.includes("@g.us") || msg.from === "status@broadcast") {
    // Ignorar si es de un grupo o estado
    return;
  }

  const contacto = await msg.getContact();
  const numero = contacto.number.startsWith("51")
    ? contacto.number
    : "51" + contacto.number;

  // Respuestas automáticas simples
  if (msg.body.toLowerCase() === "hola") {
    msg.reply("¡Hola! ¿En qué puedo ayudarte?");
  } else if (msg.body.toLowerCase() === "adiós") {
    msg.reply("¡Adiós! Que tengas un buen día 😃");
  }

  // Responder con un mensaje personalizado
  else if (msg.body.toLowerCase().includes("información")) {
    msg.reply("Claro, ¿qué tipo de información necesitas?");
  }

  io.emit("message", {
    id: msg.id.id,
    from: msg.from,
    body: msg.body,
  });

  if (contactosRegistrados.has(numero)) {
    return;
  }

  const data = {
    NombreContacto: contacto.pushname || contacto.name || "SinNombre",
    ApellidoPaterno: "",
    ApellidoMaterno: "",
    Celular: numero,
    Email: "--",
    Origen: "WA",
    TipoDocumento: "--",
    NroDocumento: "--",
    Estado: "NU",
  };

  // Enviar al backend

  try {
    const response = await axios.post(
      "http://localhost:44305/apiv3/Contactos/create",
      data,
      {
        headers: {
          Authorization: `Bearer CLAVESECRETA_SUFICIENTEMENTE_LARGA`,
        },
      }
    );
    // Marcamos como ya registrado
    contactosRegistrados.add(numero);

    if (response.status === 200) {
      io.emit("resfreshcontacto", {
        data,
        mensaje: "Contacto guardado correctamente",
      });
    }

    console.log("📥 Contacto enviado:", response.data);
  } catch (error) {
    if (error.response && error.response.status === 409) {
      contactosRegistrados.add(numero);
      console.log("📌 Contacto ya existe, no se registró nuevamente.");
      return;
    }

    console.error("❌ Error al guardar el contacto:", error.message);
  }
});

client.on("ready", () => {
  console.log("✅ Cliente conectado");
  io.emit("ready");
});

client.on("auth_failure", (msg) => {
  console.error("❌ Error de autenticación:", msg);
});

client.on("disconnected", (reason) => {
  console.warn("⚠️ Cliente desconectado:", reason);
});

// Inicializa el cliente de WhatsApp
client.initialize();

server.listen(3000, () => {
  console.log("Servidor corriendo en http://localhost:3000");
});
