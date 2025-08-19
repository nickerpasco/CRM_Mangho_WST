const { io } = require("../app");

const enviarNotificacion = (req, res) => {
  const { titulo, mensaje, data } = req.body;

  if (!data) return res.status(400).json({ error: "El campo 'data' es requerido" });

  io.emit("notificacion", { titulo, mensaje, data, timestamp: new Date().toISOString() });
  res.json({ status: "ok", enviado: data });
};

module.exports = { enviarNotificacion };
