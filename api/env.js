// Carga el .env de la raíz del repo, si existe. Las variables que ya vengan del entorno
// (por ejemplo, las del contenedor en Docker) tienen prioridad.
//
// Se hace desde el código y no con `node --env-file`, porque en modo --watch Node vigila
// la carpeta del .env (la raíz del repo, con .git y node_modules) y la API se reiniciaba sola.

const fs = require('fs');
const path = require('path');

const RUTA = path.join(__dirname, '..', '.env');

if (fs.existsSync(RUTA)) {
    process.loadEnvFile(RUTA);
}
