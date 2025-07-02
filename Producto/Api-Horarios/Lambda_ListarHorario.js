const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();

const TABLE_HORARIO = process.env.TABLE_HORARIO;
const FUNCION_VALIDAR = process.env.FUNCION_VALIDAR;

exports.handler = async (event) => {
  try {
    const token = event.headers?.Authorization;
       const { tenant_id,curso_id, limit = 5, lastKey } = event.queryStringParameters;
    if (!token || !tenant_id) return { statusCode: 403, body: JSON.stringify({ error: 'Token o tenant_id no proporcionado' }) };

    const validar = await lambda.invoke({ FunctionName: FUNCION_VALIDAR, InvocationType: 'RequestResponse', Payload: JSON.stringify({ token,tenant_id }) }).promise();
    const validarPayload = JSON.parse(validar.Payload);
    if (validarPayload.statusCode === 403) return { statusCode: 403, body: JSON.stringify({ error: 'Token inválido' }) };

    const tenant_id_curso_id = tenant_id+'#'+curso_id;
    const decodedLastKey = lastKey ? JSON.parse(decodeURIComponent(lastKey)) : undefined;

    const result = await dynamodb.query({
      TableName: TABLE_HORARIO,
      KeyConditionExpression: 'tenant_id_curso_id = :pk',
      ExpressionAttributeValues: { ':pk': tenant_id_curso_id },
      Limit: parseInt(limit),
      ExclusiveStartKey: decodedLastKey
    }).promise();

    return {
      statusCode: 200,
      body: JSON.stringify({ horarios: result.Items, lastKey: result.LastEvaluatedKey ? encodeURIComponent(JSON.stringify(result.LastEvaluatedKey)) : null })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};