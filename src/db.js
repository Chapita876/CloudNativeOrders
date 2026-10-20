const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({});

const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const TABLE_NAME = process.env.TABLE_NAME || 'Orders';

// Nombre de la clave de partición de la tabla (por defecto "id").
// Si tu tabla usa otro nombre (p. ej. OrdenID o ProductoID), defínelo en la variable de entorno KEY_NAME.
const KEY_NAME = process.env.KEY_NAME || 'id';

module.exports = { docClient, TABLE_NAME, KEY_NAME };
