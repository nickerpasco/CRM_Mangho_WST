// const { server } = require("./src/app");

// server.listen(3000, () => {
//   console.log("🚀 Servidor corriendo en http://localhost:3000");
// });

// const { server } = require("./src/app");

// server.listen(3000, () => {
//   console.log("🚀 Servidor corriendo en http://localhost:3000");
// });

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

const { Buttons } = require("whatsapp-web.js");
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

let chatsCache = [];
let contactosCache = []; // Guardar contactos para no consultarlos cada vez

app.get("/contactos", (req, res) => {
  if (contactosCache.length === 0) {
    return res
      .status(500)
      .json({ mensaje: "Contactos no disponibles aún. ¿Escaneaste el QR?" });
  }

  const data = contactosCache.map((c) => ({
    id: c.id._serialized,
    nombre: c.name || c.pushname || "",
    numero: c.number,
    esGrupo: c.isGroup,
  }));

  res.json(data);
});

// Ruta para enviar botones
app.post("/send-buttons", async (req, res) => {
  const { number, message, buttons, title, footer } = req.body;

  if (!number || !buttons) {
    return res.status(400).json({ error: "Faltan datos obligatorios" });
  }

  try {
    const chatId = number.includes("@c.us") ? number : number + "@c.us";

    const buttonMessage = new Buttons(
      message || "Selecciona una opción",
      buttons,
      title || "Opciones",
      footer || ""
    );

    await client.sendMessage(chatId, buttonMessage);

    res.status(200).json({ status: "Enviado con éxito" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al enviar mensaje" });
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
  console.warn("⚠ Cliente desconectado:", reason);
});

app.get("/contactos/chat/:numero", async (req, res) => {
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
app.post("/mensajes/send-message", (req, res) => {
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

app.post("/notificaciones/enviar", (req, res) => {
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

app.post("/GTP/entrenarModelo", async (req, res) => {
  const { Mensaje, Usuario } = req.body;

  try {
    var mensaje = Mensaje;
    var usuario = Usuario;
    const resultado = await responderConIA(mensaje, usuario);

    try {
      const objeto = JSON.parse(resultado);

      return res.send({
        status: "success",
        message: "TODO Ok",
        respuestaIA: objeto.respuesta,
        respuestaIAIntencion: objeto.intencion,
      });
    } catch {
      return res.send({
        status: "error",
        message: "Ocurrió un error :(",
        respuestaIA: "No hay",
        respuestaIAIntencion: "FUERA_DE_TEMA",
      });
    }

    return res.send({
      status: "success",
      message: "TODO Ok",
      respuestaIA: resultado,
    });

    // datosIA = JSON.parse(resultado);
  } catch (error) {
    return res.send({
      status: "error",
      message: "La IA no devolvió un JSON válido",
      respuestaIA: resultado,
    });
  }
});

const userTimers = {}; // temporizadores por usuario
const userInactive = {}; // controla si está en modo humano

// --- Configuración ---
const MINUTOS_INACTIVIDAD = 2; // puedes cambiarlo según necesites
const TIEMPO_MS = MINUTOS_INACTIVIDAD * 60 * 1000; // convertir a milisegundos

client.on("message", async (msg) => {
  console.log(`Mensaje recibido de ${msg.from}: ${msg.body}`);

  // Ignorar grupos o estados
  if (msg.from.includes("@g.us") || msg.from === "status@broadcast") return;

  const contacto = await msg.getContact();
  const numero = contacto.number.startsWith("51")
    ? contacto.number
    : "51" + contacto.number;
  const mensaje = msg.body;
  const usuario = contacto.pushname || "Usuario";

  // Si es cualquier cosa menos texto, pasar a modo humano
  if (msg.type !== "chat") {
    await client.sendMessage(
      msg.from,
      "👋 Hola soy el tío VibesFest, lamentablemente no te entendí 😅, te voy a derivar con el productor 🎸."
    );

    // Activar modo humano
    userInactive[numero] = true;

    // Reiniciar temporizador de 10 min para modo humano
    if (userTimers[numero]) clearTimeout(userTimers[numero]);
    userTimers[numero] = setTimeout(async () => {
      await client.sendMessage(
        msg.from,
        "👋 Te esperamos en línea pero no obtuvimos respuesta 🙂. Culminaremos la atención, pero no te preocupes: si deseas nuevamente del productor, vuelve a contactarte."
      );
      userInactive[numero] = false; // termina modo humano
    }, TIEMPO_MS);

    return; // no sigue la IA
  }

  // Si el usuario está en modo humano (timeout en curso), no responder IA
  if (userInactive[numero]) {
    console.log(
      `Usuario ${numero} está en modo humano, no se responde con IA.`
    );
    return;
  }

  // Mensaje de texto normal → responder con IA
  const respuesta = await responderConIA(mensaje, usuario);

  try {
    const objeto = JSON.parse(respuesta);

    await msg.reply(objeto.respuesta);
  } catch {
    await msg.reply("Lo siento, no pude responder en este momento.");
  }

  // Reiniciar temporizador de 10 minutos para inactividad
  if (userTimers[numero]) clearTimeout(userTimers[numero]);
  userTimers[numero] = setTimeout(async () => {
    await client.sendMessage(
      msg.from,
      "👋 Te esperamos en línea pero no obtuvimos respuesta 🙂. Culminaremos la atención, pero no te preocupes: si deseas nuevamente del productor, vuelve a contactarte."
    );
    userInactive[numero] = false; // termina modo humano
  }, TIEMPO_MS);

  // --- Emitir al panel (Socket.IO) según tipo de mensaje ---
  switch (msg.type) {
    case "chat":
      io.emit("message", {
        id: msg.id.id,
        from: msg.from,
        body: msg.body,
        type: msg.type,
        contenidoType: null,
      });
      break;
    case "audio":
    case "ptt":
      const audio = await msg.downloadMedia();
      io.emit("message", {
        id: msg.id.id,
        from: msg.from,
        body: msg.body,
        type: msg.type,
        contenidoType: audio,
      });
      break;
    case "document":
      const doc = await msg.downloadMedia();
      io.emit("message", {
        id: msg.id.id,
        from: msg.from,
        body: msg.body,
        type: msg.type,
        contenidoType: doc.filename,
      });
      break;
    case "image":
      const img = await msg.downloadMedia();
      io.emit("message", {
        id: msg.id.id,
        from: msg.from,
        body: msg.body,
        type: msg.type,
        contenidoType: img,
      });
      break;
    case "video":
      const vid = await msg.downloadMedia();
      io.emit("message", {
        id: msg.id.id,
        from: msg.from,
        body: msg.body,
        type: msg.type,
        contenidoType: vid,
      });
      break;
    default:
      io.emit("message", {
        id: msg.id.id,
        from: msg.from,
        body: msg.body,
        type: msg.type,
        contenidoType: msg.type,
      });
  }



  
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
    TipoDocumento: "",
    NroDocumento: "",
    Etiquetas: "Nuevo",
    Estado: "NA",
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



    const now = new Date();

const options = {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true
};

const fechaFormat = now.toLocaleString('en-US', options).replace(',', ' -');

          var MensajeData = {
        fecha: fechaFormat,
        tipo: "¡Atención!",
        icono: "pi-exclamation-triangle",
        texto: "Tienes un nuevo Lead Entrante : " + data.NombreContacto,
        color: "red",
        emisor: "CRM - Mangho",
        estado: "NoLeido",
        url: "/mangho/listar-contactos"
      };

      io.emit("notificacion", {
        titulo: "¡Atención!",
        subtitulo: "¡Atención!",
        data: MensajeData,
        timestamp: new Date().toISOString()
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

// client.on("message", async (msg) => {

//  console.log(`Mensaje recibido de ${msg.from}: ${msg.body}`);

//   if (msg.from.includes("@g.us") || msg.from === "status@broadcast") {
//     // Ignorar si es de un grupo o estado
//     return;
//   }

//   const contacto = await msg.getContact();
//   const numero = contacto.number.startsWith("51") ? contacto.number : "51" + contacto.number;

//    var mensaje = msg.body;
//     var usuario = "";
//     const respuesta = await responderConIA(mensaje,usuario);

//     if (respuesta) {
//     msg.reply(respuesta);
//   } else {
//     msg.reply("Lo siento, no pude responder en este momento.");
//   }

//   switch (msg.type) {
//     case "chat":

//         io.emit("message", {
//       id: msg.id.id,
//       from: msg.from,
//       body: msg.body,
//       type: msg.type,
//       contenidoType : null
//     });

//       break;
//     case "audio":
//     case "ptt": // voz
//       const audio = await msg.downloadMedia();

//     io.emit("message", {
//       id: msg.id.id,
//       from: msg.from,
//       body: msg.body,
//       type: msg.type,
//       contenidoType : audio
//     });

//       break;
//     case "document":
//       const doc = await msg.downloadMedia();

//         io.emit("message", {
//       id: msg.id.id,
//       from: msg.from,
//       body: msg.body,
//       type: msg.type,
//       contenidoType : doc.filename
//     });

//       break;
//     case "image":
//       const img = await msg.downloadMedia();

//         io.emit("message", {
//       id: msg.id.id,
//       from: msg.from,
//       body: msg.body,
//       type: msg.type,
//       contenidoType : img
//     });

//       break;
//     case "video":
//       const vid = await msg.downloadMedia();

//         io.emit("message", {
//       id: msg.id.id,
//       from: msg.from,
//       body: msg.body,
//       type: msg.type,
//       contenidoType : vid
//     });

//       break;
//     default:
//       // console.log("Tipo de mensaje no manejado:", msg.type);

//         io.emit("message", {
//       id: msg.id.id,
//       from: msg.from,
//       body: msg.body,
//       type: msg.type,
//       contenidoType : msg.type
//     });

//   }
// });

async function responderConIAv2(pregunta) {
  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization:
          "Bearer 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",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "mistralai/mistral-7b-instruct",
        messages: [
          {
            role: "system",
            content: `Eres un asistente que recibe mensajes de usuarios y detecta la acción que debe tomar el backend. \
Si el mensaje es un saludo o frase genérica, devuelve este JSON exacto: {"accion":"REGISTRAR_CONTACTO"}. \
Si el mensaje menciona alguna campaña de esta lista: 1: Preventa VibesFest, 2: Rock en el Bar, 3: Auspicio Locales, \
devuelve este JSON exacto: {"accion":"REGISTRAR_CONTACTO_ETAPA", "campañaId":ID}. \
Siempre responde SOLO con un JSON válido, sin texto adicional.`,
          },
          {
            role: "user",
            content: pregunta,
          },
        ],
      }),
    }
  );

  const data = await response.json();

  try {
    return JSON.parse(data.choices[0].message.content);
  } catch {
    return null; // O manejar error
  }
}

client.on("messagev2", async (msg) => {
  console.log(`Mensaje recibido de ${msg.from}: ${msg.body}`);

  if (msg.from.includes("@g.us") || msg.from === "status@broadcast") {
    // Ignorar si es de un grupo o estado
    return;
  }

  const contacto = await msg.getContact();
  const numero = contacto.number.startsWith("51")
    ? contacto.number
    : "51" + contacto.number;

  const respuesta = await responderConIA(msg.body);
  if (respuesta) {
    msg.reply(respuesta);
  } else {
    msg.reply("Lo siento, no pude responder en este momento.");
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
          Authorization: Bearer`CLAVESECRETA_SUFICIENTEMENTE_LARGA`,
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

const fetch = require("node-fetch");

async function generarPrompt(userMessage, usuario) {
  const titulo = `Eres "El Tío Vibesfest", asistente virtual para Vibesfest Perú. Responde siempre breve y claro, máximo 2 líneas, usando lenguaje casual y emojis para hacer la charla natural.\n\n`;

  const informacionEmpresa = `
Información oficial que debes usar y nada más:

- Web: vibesfestperu.com
- Instagram: @vibesfest.peru
- WhatsApp: +51 930 816 574
- Productor: Nick Pasco (+51 921 719 043)
- Correo: vibesfestperu@gmail.com

`;

  const eventos = `
Eventos (Fechas, Tocadas, Convocatorias):
1.- ID : 29 Vibesfest vol 9: Local Tayta Barranco (Av. Almte. Miguel Grau 266, Barranco 15063), 11 de octubre, 6pm-11pm, solo mayores de edad, aforo 135.
2.- ID : 30 Vibesfest vol 10: Local Iwanna Rock Lince (Jr, Mariscal Las Heras 219, Lince), 25 de octubre, 6pm-2am, todas las edades, aforo 120.
`;

  const requisitos = `Requisitos para bandas:\n- Vender 15 entradas a 15 soles para cubrir gastos.\n\n`;

  const beneficios = `
Beneficios:
- 35 minutos en escena.
- Fotos y videos de la presentación.
- Publicidad en redes y medios.
- Si venden más de 15 entradas, el dinero extra es para la banda.
`;

  const pagos = `
Pagos:
- No hay pago directo por tocar, solo venta de entradas.
- Abono mínimo 50% para inscripción o 20% para reserva.
- Pago por Yape/Plin al 921719043 (Nicker Oscar Pasco Rodriguez).
- Link inscripción: https://vibesfestperu.com/#/inscripcion
`;

  const inscripcion = `
Inscripción:
- Una vez manden la captura del abono de las entradas mínimas, se necesita enviar foto HD, reseña y enlaces de música.
- La captura deben mandarlo por este medio de WhatsApp.
`;

  const reglas = `
Reglas:
- Responde solo con esta info.
- Responde máximo en 2 líneas.
- Usa lenguaje casual y emojis.
- Si el usuario pide información general o poco clara, responde: "Claro, ¿sobre qué tema de Vibesfest quieres saber? 🎸🤘"
- Si el usuario pide información sobre alguna convocatoria o poco clara, responde: "Claro, ¿para que fecha deseas?, tenemos las fechas de (Mencionar Eventos) 🎸🤘"
- Si el usuario te pide inscribirse y solo menciona eso sin decir mas, responde: "Claro, ¿En que fecha deseas incribirte? 🎸🤘"
- Si el usuario te pide inscribirse y ya le diste los detalles y fechas, responde: "Claro, para ello necesito lo siguiente xxx 🎸🤘"
- Si el usuario te dice que lo pensará o hablará con su banda o sus chicos o su gente, responde: "Claro, me avisas cualquier cosa, estaré pendiente 🎸🤘"

- Si el usuario se ríe o manda expresiones como 'JAJAJA', responde: "JAJA 😄 ¿En qué más te puedo ayudar?"
- Si el usuario se enoja o manda expresiones como 'imbecil' o cualquier mala palabra, responde: "Porfavor, hay que tratarnos con respeto, hay algo mas en que te podria ayudar?"
- Si el usuario manda un mensaje saludando y mencionando el nombre de evento, fecha lugar , responde: "Hola, te saluda el tio VibesFest, claro para ello necesitamos complir lo siguientes requisitos xxx y te damos los beneficios de xxxxx"
- Si la pregunta no es sobre Vibesfest, responde: "Lo siento, no puedo ayudarte con eso. Pregunta algo sobre Vibesfest."
- Si el usuario pregunta que cuantas entradas se venden y a cuanto? , responde: "Claro, las entradas que estamos manejando para ellos son de 15 entradas a 15 soles cada una."
- Si el usuario te pide infomacion de backline, instrumentos que tiene el local o algo relacionado, me dices "Claro toda la info la tienen aca https://drive.google.com/file/d/1m9ECWP-_HlsQmTChc6GPK5doWKkZeQeu/view?usp=sharing"

- Para pagos, explica que no hay pago directo, solo venta de entradas.
- Para artistas, di que la lista está en la web.
- Para datos de contacto, da la info oficial.
`;

  const ejemplosChat = `
Ejemplos:

Usuario: hola  
Asistente: ¡Hola! ${usuario} 👋 Soy El Tío Vibesfest. ¿En qué te puedo ayudar?

Usuario: info Tayta  
Asistente: Vibesfest vol 3 en Tayta, 4-5 sep, 6pm-11pm, solo mayores, aforo 135.

Usuario: se paga?  
Asistente: No hay pago directo, solo venta de 15 entradas a 15 soles.

Usuario: qué pasa si vendo más entradas?  
Asistente: Si venden más de 15 entradas, el dinero extra es para ustedes. 🤘💸

Usuario: quién es el presidente del Perú?  
Asistente: Lo siento, no puedo ayudarte con eso. Pregunta algo sobre Vibesfest.

Usuario: quiero información  
Asistente: Claro, ¿sobre qué tema de Vibesfest quieres saber? 🎸🤘

Usuario: voy a conversar o hablar con mi banda 
Asistente: Claro, me avisas cualquier cosa, estaré pendiente 🎸🤘

Usuario: quiero inscribirme 
Asistente: Claro, ¿En que fecha deseas incribirte?

Usuario: Eres un Imbecil
Asistente: Porfavor, hay que tratarnos con respeto, hay algo mas en que te podria ayudar?

Usuario: Hola quiero información de la convotoria de bandas en el tayta de barranco el 4 de setiembre
Asistente: Hola, te saluda el tio VibesFest. claro para ello necesitamos complir lo siguientes requisitos xxx y te damos los beneficios de xxxxx

Usuario: JAJAJA  
Asistente: JAJA 😄 ¿En qué más te puedo ayudar?
`;

  const instruccionesFinales = `
Ahora responde la siguiente pregunta del usuario SOLO en formato JSON con dos campos:
{
  "intencion": "UNA_DE_ESTAS: SALUDO, PIDE_INFO_GENERAL, PIDE_INFO_EVENTO, PIDE_CONVOCATORIA, DESEA_INSCRIBIRSE, INTERESADO_EN : 1.- ID : 29 Vibesfest vol 9: Local Tayta Barranco (Av. Almte. Miguel Grau 266, Barranco 15063), 11 de octubre, 6pm-11pm, solo mayores de edad, aforo 135, PREGUNTA_PAGOS, PREGUNTA_ENTRADAS, PIDE_BACKLINE, EXPRESION_RISA, EXPRESION_ENOJO, FUERA_DE_TEMA",
  "respuesta": "Texto breve (máx 2 líneas, casual, con emojis) según las reglas anteriores"
}

⚠️ Instrucciones estrictas:
- Devuelve únicamente el objeto JSON.
- No escribas nada antes o después.
- No incluyas "User:" en tu salida.
- No copies bloques largos de contactos ni de la info oficial en "respuesta".
- Si no puedes responder, devuelve exactamente: {"intencion":"ERROR","respuesta":"No entendí"}.
- Asegúrate de cerrar siempre las comillas y las llaves para que el JSON sea válido.


User: ${userMessage}
`;

  return (
    titulo +
    informacionEmpresa +
    eventos +
    requisitos +
    beneficios +
    pagos +
    inscripcion +
    reglas +
    ejemplosChat +
    instruccionesFinales
  );
}

async function generarPromptSinRespuestaIntencion(userMessage, usuario) {
  const titulo = `Eres "El Tío Vibesfest", asistente virtual para Vibesfest Perú. Responde siempre breve y claro, máximo 2 líneas, usando lenguaje casual y emojis para hacer la charla natural.\n\n`;

  const informacionEmpresa = `
Información oficial que debes usar y nada más:

- Web: vibesfestperu.com
- Instagram: @vibesfest.peru
- WhatsApp: +51 930 816 574
- Productor: Nick Pasco (+51 921 719 043)
- Correo: vibesfestperu@gmail.com

`;

  const eventos = `
Eventos (Fechas, Tocadas, Convocatorias):
ID : 29 Vibesfest vol 9: Local Tayta Barranco (Av. Almte. Miguel Grau 266, Barranco 15063), 11 de octubre, 6pm-11pm, solo mayores de edad, aforo 135.
`;

  const requisitos = `Requisitos para bandas:\n- Vender 15 entradas a 15 soles para cubrir gastos.\n\n`;

  const beneficios = `
Beneficios:
- 35 minutos en escena.
- Fotos y videos de la presentación.
- Publicidad en redes y medios.
- Si venden más de 15 entradas, el dinero extra es para la banda.
`;

  const pagos = `
Pagos:
- No hay pago directo por tocar, solo venta de entradas.
- Abono mínimo 50% para inscripción o 20% para reserva.
- Pago por Yape/Plin al 921719043 (Nicker Oscar Pasco Rodriguez).
- Link inscripción: https://vibesfestperu.com/#/inscripcion
`;

  const inscripcion = `
Inscripción:
- Una vez manden la captura del abono de las entradas mínimas, se necesita enviar foto HD, reseña y enlaces de música.
- La captura deben mandarlo por este medio de WhatsApp.
`;

  const reglas = `
Reglas:
- Responde solo con esta info.
- Responde máximo en 2 líneas.
- Usa lenguaje casual y emojis.
- Si el usuario pide información general o poco clara, responde: "Claro, ¿sobre qué tema de Vibesfest quieres saber? 🎸🤘"
- Si el usuario pide información sobre alguna convocatoria o poco clara, responde: "Claro, ¿para que fecha deseas?, tenemos las fechas de (Mencionar Eventos) 🎸🤘"
- Si el usuario te pide inscribirse y solo menciona eso sin decir mas, responde: "Claro, ¿En que fecha deseas incribirte? 🎸🤘"
- Si el usuario te pide inscribirse y ya le diste los detalles y fechas, responde: "Claro, para ello necesito lo siguiente xxx 🎸🤘"
- Si el usuario te dice que lo pensará o hablará con su banda o sus chicos o su gente, responde: "Claro, me avisas cualquier cosa, estaré pendiente 🎸🤘"

- Si el usuario se ríe o manda expresiones como 'JAJAJA', responde: "JAJA 😄 ¿En qué más te puedo ayudar?"
- Si el usuario se enoja o manda expresiones como 'imbecil' o cualquier mala palabra, responde: "Porfavor, hay que tratarnos con respeto, hay algo mas en que te podria ayudar?"
- Si el usuario manda un mensaje saludando y mencionando el nombre de evento, fecha lugar , responde: "Hola, te saluda el tio VibesFest, claro para ello necesitamos complir lo siguientes requisitos xxx y te damos los beneficios de xxxxx"
- Si la pregunta no es sobre Vibesfest, responde: "Lo siento, no puedo ayudarte con eso. Pregunta algo sobre Vibesfest."
- Si el usuario pregunta que cuantas entradas se venden y a cuanto? , responde: "Claro, las entradas que estamos manejando para ellos son de 15 entradas a 15 soles cada una."
- Si el usuario te pide infomacion de backline, instrumentos que tiene el local o algo relacionado, me dices "Claro toda la info la tienen aca https://drive.google.com/file/d/1m9ECWP-_HlsQmTChc6GPK5doWKkZeQeu/view?usp=sharing"

- Para pagos, explica que no hay pago directo, solo venta de entradas.
- Para artistas, di que la lista está en la web.
- Para datos de contacto, da la info oficial.
`;

  const ejemplosChat = `
Ejemplos:

Usuario: hola  
Asistente: ¡Hola! ${usuario} 👋 Soy El Tío Vibesfest. ¿En qué te puedo ayudar?

Usuario: info Tayta  
Asistente: Vibesfest vol 3 en Tayta, 4-5 sep, 6pm-11pm, solo mayores, aforo 135.

Usuario: se paga?  
Asistente: No hay pago directo, solo venta de 15 entradas a 15 soles.

Usuario: qué pasa si vendo más entradas?  
Asistente: Si venden más de 15 entradas, el dinero extra es para ustedes. 🤘💸

Usuario: quién es el presidente del Perú?  
Asistente: Lo siento, no puedo ayudarte con eso. Pregunta algo sobre Vibesfest.

Usuario: quiero información  
Asistente: Claro, ¿sobre qué tema de Vibesfest quieres saber? 🎸🤘

Usuario: voy a conversar o hablar con mi banda 
Asistente: Claro, me avisas cualquier cosa, estaré pendiente 🎸🤘

Usuario: quiero inscribirme 
Asistente: Claro, ¿En que fecha deseas incribirte?

Usuario: Eres un Imbecil
Asistente: Porfavor, hay que tratarnos con respeto, hay algo mas en que te podria ayudar?

Usuario: Hola quiero información de la convotoria de bandas en el tayta de barranco el 4 de setiembre
Asistente: Hola, te saluda el tio VibesFest. claro para ello necesitamos complir lo siguientes requisitos xxx y te damos los beneficios de xxxxx

Usuario: JAJAJA  
Asistente: JAJA 😄 ¿En qué más te puedo ayudar?

Ahora responde breve y claro la siguiente pregunta del usuario:
User: ${userMessage}
`;

  return (
    titulo +
    informacionEmpresa +
    eventos +
    requisitos +
    beneficios +
    pagos +
    inscripcion +
    reglas +
    ejemplosChat
  );
}

async function responderConIA(pregunta, usuario) {
  const systemPrompt = await generarPrompt(pregunta, usuario);

  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization:
          "Bearer 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",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "mistralai/mistral-7b-instruct",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: pregunta },
        ],
        temperature: 0.6,
        max_tokens: 120,
        response_format: { type: "json_object" }, // 👈 fuerza JSON válido
      }),
    }
  );

  const data = await response.json();
  // data.choices[0]?.message?.content;

  const raw = data.choices[0]?.message?.content || "";

  // Extraer solo el JSON válido entre llaves
  const match = raw.match(/\{[\s\S]*\}/);
  const cleanJson = match ? match[0] : "{}";

  const parsed = JSON.parse(cleanJson);

  try {
    const jsonString = JSON.stringify(parsed);
    return jsonString;
  } catch (e) {
    console.error("Error parseando JSON:", e, cleanJson);
    parsed = {
      intencion: "ERROR",
      respuesta: "Hubo un error procesando la respuesta",
    };
  }

  // 👉 devuelve el objeto limpio ya como JSON
  return parsed;
}

app.get("/contactos/chats-contactos", (req, res) => {
  if (chatsCache.length === 0) {
    return res
      .status(500)
      .json({ mensaje: "Chats no disponibles aún. ¿Escaneaste el QR?" });
  }

  const data = chatsCache
    .filter((chat) => !chat.isGroup) // solo chats privados
    .map((chat) => ({
      id: chat.id._serialized,
      nombre: chat.name || chat.contact?.pushname || "",
      numero: chat.id.user,
      esGrupo: chat.isGroup,
      ultimaActividad: chat.timestamp,
    }));

  res.json(data);
});

client.on("ready", async () => {
  console.log("✅ Cliente conectado");
  contactosCache = await client.getContacts();
  chatsCache = await client.getChats();
  io.emit("ready");
});

client.on("auth_failure", (msg) => {
  console.error("❌ Error de autenticación:", msg);
});

client.on("disconnected", (reason) => {
  console.warn("⚠ Cliente desconectado:", reason);
});

// Inicializa el cliente de WhatsApp
client.initialize();

server.listen(3000, () => {
  console.log("Servidor corriendo en http://localhost:3000");
});
