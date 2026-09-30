const { UpdateCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient, TABLE_NAME } = require('../db');
const { success, error } = require('../utils/response');

const ALLOWED_FIELDS = ['status', 'customerName', 'customerEmail', 'items'];
const VALID_STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];

exports.handler = async (event) => {
  try {
    const { id } = event.pathParameters || {};
    if (!id) return error(400, 'Falta el parámetro "id"');

    const body = JSON.parse(event.body || '{}');
    const fieldsToUpdate = Object.keys(body).filter((k) => ALLOWED_FIELDS.includes(k));

    if (fieldsToUpdate.length === 0) {
      return error(400, `Debés enviar al menos uno de estos campos: ${ALLOWED_FIELDS.join(', ')}`);
    }

    if (body.status && !VALID_STATUSES.includes(body.status)) {
      return error(400, `El status debe ser uno de: ${VALID_STATUSES.join(', ')}`);
    }

    const existing = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { id },
    }));

    if (!existing.Item) return error(404, 'Orden no encontrada');

    // Si se actualizan los items, recalculamos el total
    if (body.items) {
      if (!Array.isArray(body.items) || body.items.length === 0) {
        return error(400, 'El campo "items" debe ser un array con al menos un producto');
      }
      body.total = body.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
      fieldsToUpdate.push('total');
    }

    const updateExpr = [];
    const exprNames = {};
    const exprValues = {};

    fieldsToUpdate.forEach((field, i) => {
      updateExpr.push(`#f${i} = :v${i}`);
      exprNames[`#f${i}`] = field;
      exprValues[`:v${i}`] = body[field];
    });

    updateExpr.push('#updatedAt = :updatedAt');
    exprNames['#updatedAt'] = 'updatedAt';
    exprValues[':updatedAt'] = new Date().toISOString();

    const result = await docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { id },
      UpdateExpression: `SET ${updateExpr.join(', ')}`,
      ExpressionAttributeNames: exprNames,
      ExpressionAttributeValues: exprValues,
      ReturnValues: 'ALL_NEW',
    }));

    return success(200, result.Attributes);
  } catch (err) {
    console.error('Error actualizando orden:', err);
    return error(500, 'Error interno al actualizar la orden');
  }
};
