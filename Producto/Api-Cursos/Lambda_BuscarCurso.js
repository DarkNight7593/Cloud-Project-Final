const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();

const TABLE_CURSO = process.env.TABLE_CURSO;
const FUNCION_VALIDAR = process.env.FUNCION_VALIDAR;

exports.handler = async (event) => {
  try {
    const token = event.headers?.Authorization;
    if (!token) return { statusCode: 403, body: JSON.stringify({ error: 'Token no proporcionado' }) };

    const validar = await lambda.invoke({
      FunctionName: FUNCION_VALIDAR,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({ token })
    }).promise();

    const validarPayload = JSON.parse(validar.Payload);
    if (validarPayload.statusCode === 403)
      return { statusCode: 403, body: JSON.stringify({ error: 'Token inválido o expirado' }) };

    const { tenant_id } = validarPayload.body;
    const { curso_id } = event.queryStringParameters || {};
    if (!curso_id) return { statusCode: 400, body: JSON.stringify({ error: 'curso_id requerido' }) };

    const result = await dynamodb.get({
      TableName: TABLE_CURSO,
      Key: { tenant_id, curso_id }
    }).promise();

    if (!result.Item) return { statusCode: 404, body: JSON.stringify({ error: 'Curso no encontrado' }) };

    return { statusCode: 200, body: JSON.stringify(result.Item) };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
