// Error con código HTTP (404, 409…). El manejador de errores de servers/http-server.js responde con ese
// código y el mensaje, así que las rutas no tienen que capturarlo (Express 5 le pasa los errores de las
// funciones async).

class ErrorHttp extends Error {
    constructor(status, mensaje) {
        super(mensaje);
        this.status = status;
    }
}

module.exports = { ErrorHttp };
