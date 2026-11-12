// Opciones comunes de los modelos: en las respuestas JSON el _id de Mongo sale como "id"
// y no aparece el campo de versión (__v).

function aJSON(doc, ret) {
    const { _id, ...resto } = ret;
    return { id: String(_id), ...resto };
}

const opcionesJSON = {
    versionKey: false,
    toJSON: { transform: aJSON }
};

module.exports = { opcionesJSON };
