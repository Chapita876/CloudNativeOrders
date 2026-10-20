const { v4: uuidv4 } = require('uuid');
const { PutCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient, TABLE_NAME, KEY_NAME } = require('../db');
const { success, error } = require('../utils/response');
const { SNSClient, PublishCommand } = require("@aws-sdk/client-sns");

const sns = new SNSClient({});
const VALID_STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];

async function publicarEvento(pedidoId, tipoEvento) {
  await sns.send(new PublishCommand({
    TopicArn: process.env.TOPIC_ARN,
    Message: JSON.stringify({
      type: tipoEvento,
      eventId: uuidv4(),
      timestamp: new Date().toISOString(),
      pedidoId,
    }),
    MessageAttributes: {
      tipo_evento: { DataType: "String", StringValue: tipoEvento },
    },
  }));
}

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

    order[KEY_NAME] = order.id;

    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: order,
    }));

    try {
      await publicarEvento(order.id, "PedidoCreado");
    } catch (e) {
      console.error("No se pudo publicar el evento", e);
    }

    return success(201, order);
  } catch (err) {
    console.error('Error creando orden:', err);
    return error(500, 'Error interno al crear la orden');
  }
};