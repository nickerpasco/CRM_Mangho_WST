const axios = require("axios");
const contactosRegistrados = new Set();

async function guardarContacto(numero, nombre) {
  if (contactosRegistrados.has(numero)) return;

  const data = {
    NombreContacto: nombre,
    ApellidoPaterno: "",
    ApellidoMaterno: "",
    Celular: numero,
    Email: "--",
    Origen: "WA",
    TipoDocumento: "--",
    NroDocumento: "--",
    Estado: "NU",
  };

  try {
    const response = await axios.post(
      "http://localhost:44305/apiv3/Contactos/create",
      data,
      { headers: { Authorization: "Bearer CLAVESECRETA_SUFICIENTEMENTE_LARGA" } }
    );
    contactosRegistrados.add(numero);
    return response.data;
  } catch (error) {
    if (error.response && error.response.status === 409) {
      contactosRegistrados.add(numero);
      return { status: "ya existe" };
    }
    throw error;
  }
}

module.exports = { guardarContacto };
