const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient, TABLE_NAME } = require('../db');
const { success, error } = require('../utils/response');

exports.handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    const limit = qs.limit ? parseInt(qs.limit, 10) : null;

    const params = { TableName: TABLE_NAME };

    // Filtro opcional por estado: /orden?status=pending
    if (qs.status) {
      params.FilterExpression = '#st = :st';
      params.ExpressionAttributeNames = { '#st': 'status' };
      params.ExpressionAttributeValues = { ':st': qs.status };
    }

    // Modo paginado (solo si el cliente lo pide con ?limit o ?nextToken)
    if (limit || qs.nextToken) {
      params.Limit = limit || 20;
      if (qs.nextToken) {
        params.ExclusiveStartKey = JSON.parse(
          Buffer.from(qs.nextToken, 'base64').toString('utf-8')
        );
      }
      const result = await docClient.send(new ScanCommand(params));
      const nextToken = result.LastEvaluatedKey
        ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
        : null;
      return success(200, { items: result.Items, nextToken });
    }

    // Por defecto: recorre todas las páginas del Scan para devolver todos los pedidos
    let items = [];
    let lastKey;
    do {
      const result = await docClient.send(new ScanCommand({ ...params, ExclusiveStartKey: lastKey }));
      items = items.concat(result.Items || []);
      lastKey = result.LastEvaluatedKey;
    } while (lastKey);

    return success(200, { items, nextToken: null });
  } catch (err) {
    console.error('Error listando órdenes:', err);
    return error(500, 'Error interno al listar órdenes');
  }
};
