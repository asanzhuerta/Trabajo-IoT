// Documentación de la API con Swagger UI, en http://localhost:3000/api-docs
//   - /api-docs                -> la página interactiva (botón "Authorize" para poner la x-api-key y probar)
//   - /api-docs/openapi.yaml   -> la especificación tal cual (se puede importar en Postman)
//   - /api-docs/openapi.json   -> la misma, en JSON
// openapi.yaml se lee en cada petición: al editarlo basta con recargar la página, sin reiniciar la API.

const fs = require('fs');
const path = require('path');
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yaml');

const RUTA = path.join(__dirname, '..', 'openapi.yaml');

const router = express.Router();

router.get('/openapi.yaml', function (req, res) {
    res.type('text/yaml').sendFile(RUTA);
});

router.get('/openapi.json', function (req, res) {
    try {
        res.json(YAML.parse(fs.readFileSync(RUTA, 'utf8')));
    } catch (err) {
        res.status(500).json({ error: 'openapi.yaml no es válido: ' + err.message });
    }
});

router.use('/', swaggerUi.serve);
router.get('/', swaggerUi.setup(null, {
    customSiteTitle: 'Smart Health · API',
    swaggerOptions: {
        url: '/api-docs/openapi.json',
        persistAuthorization: true,   // la clave se conserva al recargar la página
        displayRequestDuration: true,
        tryItOutEnabled: true
    }
}));

module.exports = router;
