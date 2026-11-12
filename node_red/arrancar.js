// Arranca el Node-RED del proyecto, separado del Node-RED personal (~/.node-red, donde están los ejercicios de clase).
//
//   node node_red/arrancar.js               (desde la raíz del repo)
//   node node_red/arrancar.js --reiniciar   vuelve a cargar los flujos del repo y pierde los cambios hechos en el editor
//
// - Usa su propia carpeta de usuario: ~/.node-red-smarthealth
// - La primera vez (o con --reiniciar) la prepara con el simulador de A (flows.json) y la pasarela (flows_pasarela.json).
// - Lee el .env de la raíz del repo: el usuario de Mosquitto de Node-RED (NODERED_MQTT_USER y NODERED_MQTT_PASS)
//   y la clave de la API (API_KEY_PASARELA). En los nodos del broker solo se guardan ${NODERED_MQTT_USER}
//   y ${NODERED_MQTT_PASS}: las contraseñas no se escriben en ningún archivo.
// - Editor en http://localhost:1880

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const REPO = path.join(__dirname, '..');
const USER_DIR = path.join(os.homedir(), '.node-red-smarthealth');
const FLUJOS = ['flows.json', 'flows_pasarela.json'];

const env = path.join(REPO, '.env');
if (fs.existsSync(env)) {
    process.loadEnvFile(env);
} else {
    console.warn('No hay .env en la raíz del repo: Node-RED no podrá conectarse a Mosquitto ni a la API');
}

function preparar() {
    fs.mkdirSync(USER_DIR, { recursive: true });

    // credentialSecret: false → las credenciales se guardan sin cifrar, pero solo contienen ${VARIABLE}
    fs.writeFileSync(path.join(USER_DIR, 'settings.js'),
        '// Generado por node_red/arrancar.js\n'
        + 'module.exports = {\n'
        + '    uiPort: 1880,\n'
        + '    flowFile: "flows.json",\n'
        + '    flowFilePretty: true,\n'
        + '    credentialSecret: false\n'
        + '};\n');

    const flujos = [];
    const credenciales = {};
    for (const archivo of FLUJOS) {
        const ruta = path.join(__dirname, archivo);
        if (!fs.existsSync(ruta)) continue;
        for (const nodo of JSON.parse(fs.readFileSync(ruta, 'utf8'))) {
            delete nodo.credentials;
            if (nodo.type === 'mqtt-broker') {
                credenciales[nodo.id] = { user: '${NODERED_MQTT_USER}', password: '${NODERED_MQTT_PASS}' };
            }
            flujos.push(nodo);
        }
    }
    fs.writeFileSync(path.join(USER_DIR, 'flows.json'), JSON.stringify(flujos, null, 4));
    fs.writeFileSync(path.join(USER_DIR, 'flows_cred.json'), JSON.stringify(credenciales, null, 4));
    console.log('Node-RED del proyecto preparado en %s con %s', USER_DIR, FLUJOS.join(' + '));
}

if (process.argv.includes('--reiniciar') || !fs.existsSync(path.join(USER_DIR, 'flows.json'))) {
    preparar();
}

const nodeRed = spawn('node-red', ['-u', '"' + USER_DIR + '"'], { shell: true, stdio: 'inherit', env: process.env });
nodeRed.on('exit', function (codigo) { process.exit(codigo || 0); });
