const { DeleteCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient, TABLE_NAME, KEY_NAME } = require('../db');
const { success, error } = require('../utils/response');

exports.handler = async (event) => {
  try {
    const { id } = event.pathParameters || {};
    if (!id) return error(400, 'Falta el parámetro "id"');

    const existing = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { [KEY_NAME]: id },
    }));

    if (!existing.Item) return error(404, 'Orden no encontrada');

    await docClient.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { [KEY_NAME]: id },
    }));

    return success(200, { message: 'Orden eliminada', id });
  } catch (err) {
    console.error('Error eliminando orden:', err);
    return error(500, 'Error interno al eliminar la orden');
  }
};
