const fetch = require("node-fetch");

async function responderConIA(pregunta) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": "Bearer TU_API_KEY", // 👈 reemplaza
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "mistralai/mistral-7b-instruct",
      messages: [
        {
          role: "system",
          content: `
          Eres un asistente virtual de VibesFest.
          Devuelve SOLO un JSON con este formato:
          {
            "accion": "REGISTRAR_CONTACTO" | "REGISTRAR_CONTACTO_ETAPA" | null,
            "idCampania": <número o null>,
            "respuesta": "<texto breve>"
          }
          Campañas:
          1: Preventa VibesFest
          2: Rock en el Bar
          `
        },
        { role: "user", content: pregunta }
      ]
    })
  });

  const data = await response.json();
  try {
    return JSON.parse(data.choices[0]?.message?.content || "{}");
  } catch {
    return null;
  }
}

module.exports = { responderConIA };
