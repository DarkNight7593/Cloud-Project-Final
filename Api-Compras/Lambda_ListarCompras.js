const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();

const TABLE_COMPRAS = process.env.TABLE_COMPRAS;
const FUNCION_VALIDAR = process.env.FUNCION_VALIDAR;

exports.handler = async (event) => {
  try {
    const token = event.headers?.Authorization;
    const { estado, curso_id, limit = 10, lastKey } = event.queryStringParameters || {};
    if (!token || !tenant_id) return { statusCode: 403, body: JSON.stringify({ error: 'Token o tenant_id no proporcionado' }) };

    const validar = await lambda.invoke({
      FunctionName: FUNCION_VALIDAR,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({ token,tenant_id })
    }).promise();

    const validarPayload = JSON.parse(validar.Payload);
    if (validarPayload.statusCode === 403)
      return { statusCode: 403, body: JSON.stringify({ error: 'Token inválido o expirado' }) };

    if (!curso_id || !estado)
      return { statusCode: 400, body: JSON.stringify({ error: 'curso_id y estado requeridos' }) };

    const partitionKey = `${tenant_id}#${curso_id}`;
    const sortKey = `${dni}#${estado}`;
    const decodedLastKey = lastKey ? JSON.parse(decodeURIComponent(lastKey)) : undefined;

    const params = {
      TableName: TABLE_COMPRAS,
      KeyConditionExpression: 'tenant_id$curso_id = :partitionKey AND dni$estado = :sortKey',
      ExpressionAttributeValues: {
        ':partitionKey': partitionKey,
        ':sortKey': sortKey
      },
      Limit: parseInt(limit),
      ExclusiveStartKey: decodedLastKey
    };

    const result = await dynamodb.query(params).promise();

    return {
      statusCode: 200,
      body: JSON.stringify({
        compras: result.Items,
        lastKey: result.LastEvaluatedKey
          ? encodeURIComponent(JSON.stringify(result.LastEvaluatedKey))
          : null
      })
    };

  } catch (error) {
    console.error('Error en listar compras:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
