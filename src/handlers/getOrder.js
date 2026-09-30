const { GetCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient, TABLE_NAME } = require('../db');
const { success, error } = require('../utils/response');

exports.handler = async (event) => {
  try {
    const { id } = event.pathParameters || {};
    if (!id) return error(400, 'Falta el parámetro "id"');

    const result = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { id },
    }));

    if (!result.Item) return error(404, 'Orden no encontrada');

    return success(200, result.Item);
  } catch (err) {
    console.error('Error obteniendo orden:', err);
    return error(500, 'Error interno al obtener la orden');
  }
};
