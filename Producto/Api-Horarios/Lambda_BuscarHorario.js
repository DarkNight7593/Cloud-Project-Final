const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();

const TABLE_HORARIO = process.env.TABLE_HORARIO;
const FUNCION_VALIDAR = process.env.FUNCION_VALIDAR;

exports.handler = async (event) => {
  try {
    const token = event.headers?.Authorization;
    if (!token) return { statusCode: 403, body: JSON.stringify({ error: 'Token no proporcionado' }) };

    const validar = await lambda.invoke({ FunctionName: FUNCION_VALIDAR, InvocationType: 'RequestResponse', Payload: JSON.stringify({ token }) }).promise();
    const validarPayload = JSON.parse(validar.Payload);
    if (validarPayload.statusCode === 403) return { statusCode: 403, body: JSON.stringify({ error: 'Token inválido' }) };

    const { tenant_id } = validarPayload.body;
    const { curso_id, horario_id } = event.queryStringParameters;
    const tenant_id$curso_id = `${tenant_id}#${curso_id}`;

    const result = await dynamodb.get({ TableName: TABLE_HORARIO, Key: { tenant_id$curso_id, horario_id } }).promise();

    if (!result.Item) return { statusCode: 404, body: JSON.stringify({ error: 'Horario no encontrado' }) };
    return { statusCode: 200, body: JSON.stringify(result.Item) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
