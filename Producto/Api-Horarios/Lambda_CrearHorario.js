const AWS = require('aws-sdk');
const uuid = require('uuid');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();

const TABLE_HORARIO = process.env.TABLE_HORARIO;
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
    if (validarPayload.statusCode === 403) return { statusCode: 403, body: JSON.stringify({ error: 'Token inválido' }) };

    const { tenant_id } = validarPayload.body;
    const body = JSON.parse(event.body);
    const { curso_id, dias, inicio_hora, fin_hora } = body;

    const horario_id = uuid.v4();
    const tenant_id$curso_id = `${tenant_id}#${curso_id}`;

    await dynamodb.put({
      TableName: TABLE_HORARIO,
      Item: {
        tenant_id$curso_id,
        horario_id,
        dias,
        inicio_hora,
        fin_hora
      }
    }).promise();

    return { statusCode: 200, body: JSON.stringify({ message: 'Horario creado', horario_id }) };

  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
