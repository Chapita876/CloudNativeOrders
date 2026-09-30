const create = require('./handlers/createOrder');
const list = require('./handlers/listOrders');
const get = require('./handlers/getOrder');
const update = require('./handlers/updateOrder');
const del = require('./handlers/deleteOrder');
const { error } = require('./utils/response');

// Lambda única, pensada para API Gateway HTTP API (payload format 2.0).
// Enruta según método HTTP + si vino o no un {id} en el path.
exports.handler = async (event) => {
  const method = event.requestContext?.http?.method;
  const hasId = Boolean(event.pathParameters?.id);

  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: {}, body: '' };
  }

  try {
    if (method === 'POST' && !hasId) return await create.handler(event);
    if (method === 'GET' && !hasId) return await list.handler(event);
    if (method === 'GET' && hasId) return await get.handler(event);
    if (method === 'PUT' && hasId) return await update.handler(event);
    if (method === 'DELETE' && hasId) return await del.handler(event);

    return error(404, `Ruta no encontrada: ${method} ${event.rawPath}`);
  } catch (err) {
    console.error('Error en el router:', err);
    return error(500, 'Error interno del servidor');
  }
};
