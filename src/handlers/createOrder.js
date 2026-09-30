const { v4: uuidv4 } = require('uuid');
const { PutCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient, TABLE_NAME } = require('../db');
const { success, error } = require('../utils/response');

const VALID_STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');

    if (!body.customerName) {
      return error(400, 'El campo "customerName" es obligatorio');
    }

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return error(400, 'El campo "items" debe ser un array con al menos un producto');
    }

    for (const item of body.items) {
      if (!item.productId || !item.name || typeof item.price !== 'number' || typeof item.quantity !== 'number') {
        return error(400, 'Cada item necesita: productId, name, price (number) y quantity (number)');
      }
    }

    const total = body.items.reduce((sum, item) => sum + item.price * item.quantity, 0);

    const now = new Date().toISOString();
    const order = {
      id: uuidv4(),
      customerName: body.customerName,
      customerEmail: body.customerEmail || null,
      items: body.items,
      total,
      status: VALID_STATUSES.includes(body.status) ? body.status : 'pending',
      createdAt: now,
      updatedAt: now,
    };

    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: order,
    }));

    return success(201, order);
  } catch (err) {
    console.error('Error creando orden:', err);
    return error(500, 'Error interno al crear la orden');
  }
};
