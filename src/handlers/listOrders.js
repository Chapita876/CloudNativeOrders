const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient, TABLE_NAME } = require('../db');
const { success, error } = require('../utils/response');

exports.handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    const limit = qs.limit ? parseInt(qs.limit, 10) : 20;

    const params = {
      TableName: TABLE_NAME,
      Limit: limit,
    };

    // Filtro opcional por estado: /orders?status=pending
    if (qs.status) {
      params.FilterExpression = '#st = :st';
      params.ExpressionAttributeNames = { '#st': 'status' };
      params.ExpressionAttributeValues = { ':st': qs.status };
    }

    if (qs.nextToken) {
      params.ExclusiveStartKey = JSON.parse(
        Buffer.from(qs.nextToken, 'base64').toString('utf-8')
      );
    }

    const result = await docClient.send(new ScanCommand(params));

    const nextToken = result.LastEvaluatedKey
      ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
      : null;

    return success(200, {
      items: result.Items,
      nextToken,
    });
  } catch (err) {
    console.error('Error listando órdenes:', err);
    return error(500, 'Error interno al listar órdenes');
  }
};
