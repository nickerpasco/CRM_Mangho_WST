const client = require("../config/whatsapp");

const getStatus = async (req, res) => {
  try {
    const state = await client.getState();
    res.json({ status: "ok", connection: state, info: client.info || null });
  } catch (err) {
    res.status(200).json({ status: "desconectado", connection: "NOT_CONNECTED", error: err.message });
  }
};

const disconnect = async (req, res) => {
  try {
    await client.destroy();
    res.json({ status: "ok", message: "Cliente desconectado" });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};

const reconnect = async (req, res) => {
  try {
    await client.destroy();
    await client.initialize();
    res.json({ status: "ok", message: "Cliente reiniciado" });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};

module.exports = { getStatus, disconnect, reconnect };
