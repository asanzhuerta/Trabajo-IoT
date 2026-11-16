// Arranca el Node-RED del proyecto, separado del Node-RED personal (~/.node-red, donde están los ejercicios de clase).
//
//   node node_red/arrancar.js               (desde la raíz del repo)
//   node node_red/arrancar.js --reiniciar   vuelve a cargar los flujos del repo aunque haya cambios hechos en el editor
//
// - Usa su propia carpeta de usuario: ~/.node-red-smarthealth
// - La prepara con el simulador de A (flows.json), la pasarela (flows_pasarela.json) y el dashboard médico de B
//   (flows_medico.json, en http://localhost:1880/dashboard/medico) la primera vez, con --reiniciar
//   y cuando los flujos del repo son más nuevos que los de esa carpeta (por ejemplo, al traer cambios de A).
//   Si lo último fue un Deploy en el editor, se respeta. Antes de sustituirlos, guarda los anteriores en respaldo-<fecha>/.
// - Lee el .env de la raíz del repo: el usuario de Mosquitto de Node-RED (NODERED_MQTT_USER y NODERED_MQTT_PASS)
//   y las claves de la API (API_KEY_PASARELA para la pasarela y API_KEY_MEDICO para el dashboard médico). En los nodos del broker solo se guardan ${NODERED_MQTT_USER}
//   y ${NODERED_MQTT_PASS}: las contraseñas no se escriben en ningún archivo.
// - Editor en http://localhost:1880

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const REPO = path.join(__dirname, '..');
const USER_DIR = path.join(os.homedir(), '.node-red-smarthealth');
const FLUJOS = ['flows.json', 'flows_pasarela.json', 'flows_medico.json'];
// Nodos que no vienen con Node-RED (el dashboard médico usa Dashboard 2.0). Versión fija para que los dos portátiles vean lo mismo.
const DEPENDENCIAS = { '@flowfuse/node-red-dashboard': '1.34.1' };

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

// ¿Algún flujo del repo es más nuevo que la copia de Node-RED?
function repoMasNuevo(copia) {
    const t = fs.statSync(copia).mtimeMs;
    return FLUJOS.some(function (archivo) {
        const ruta = path.join(__dirname, archivo);
        return fs.existsSync(ruta) && fs.statSync(ruta).mtimeMs > t;
    });
}

function respaldar() {
    const carpeta = path.join(USER_DIR, 'respaldo-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-'));
    fs.mkdirSync(carpeta, { recursive: true });
    for (const archivo of ['flows.json', 'flows_cred.json']) {
        const ruta = path.join(USER_DIR, archivo);
        if (fs.existsSync(ruta)) fs.copyFileSync(ruta, path.join(carpeta, archivo));
    }
    console.log('Flujos anteriores guardados en %s', carpeta);
}

// Instala en la carpeta de Node-RED los nodos que falten o que estén en otra versión
function instalarDependencias() {
    fs.mkdirSync(USER_DIR, { recursive: true });
    const faltan = Object.entries(DEPENDENCIAS).filter(function ([nombre, version]) {
        const pkg = path.join(USER_DIR, 'node_modules', nombre, 'package.json');
        return !fs.existsSync(pkg) || JSON.parse(fs.readFileSync(pkg, 'utf8')).version !== version;
    }).map(function ([nombre, version]) { return nombre + '@' + version; });
    if (!faltan.length) return;
    console.log('Instalando en %s: %s', USER_DIR, faltan.join(', '));
    const r = spawnSync('npm', ['install', '--no-audit', '--no-fund', '--save-exact', '--prefix', '"' + USER_DIR + '"'].concat(faltan),
        { shell: true, stdio: 'inherit' });
    if (r.status !== 0) console.warn('No se pudieron instalar los nodos; el dashboard médico no funcionará');
}

instalarDependencias();

const copia = path.join(USER_DIR, 'flows.json');
if (!fs.existsSync(copia)) {
    preparar();
} else if (process.argv.includes('--reiniciar') || repoMasNuevo(copia)) {
    if (!process.argv.includes('--reiniciar')) console.log('Los flujos del repo han cambiado: se cargan los nuevos');
    respaldar();
    preparar();
}

const nodeRed = spawn('node-red', ['-u', '"' + USER_DIR + '"'], { shell: true, stdio: 'inherit', env: process.env });
nodeRed.on('exit', function (codigo) { process.exit(codigo || 0); });
