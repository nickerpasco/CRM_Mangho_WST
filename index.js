const { server } = require("./src/app");

server.listen(3000, () => {
  console.log("🚀 Servidor corriendo en http://localhost:3000");
});
