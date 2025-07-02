const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

const dynamodb = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();
const TABLE_CURSO = process.env.TABLE_CURSO;
const FUNCION_VALIDAR = process.env.FUNCION_VALIDAR;

exports.handler = async (event) => {
  try {
    const token = event.headers?.Authorization;
    const data = JSON.parse(event.body);
    const { tenant_id,nombre, descripcion, inicio, fin, precio,dni } = data;
    if (!token || !tenant_id) return { statusCode: 403, body: JSON.stringify({ error: 'Token o tenant_id no proporcionado' }) };

    const validar = await lambda.invoke({
      FunctionName: FUNCION_VALIDAR,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({ token,tenant_id })
    }).promise();

    const validarPayload = JSON.parse(validar.Payload);
    if (validarPayload.statusCode === 403)
      return { statusCode: 403, body: JSON.stringify({ error: 'Token inválido o expirado' }) };

    if (!nombre || !descripcion)
      return { statusCode: 400, body: JSON.stringify({ error: 'Faltan campos obligatorios' }) };

    const curso_id = uuidv4();
    await dynamodb.put({
      TableName: TABLE_CURSO,
      Item: { tenant_id, curso_id,instructor_dni: dni, nombre, descripcion, inicio, fin, precio }
    }).promise();

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Curso creado exitosamente', curso_id, nombre })
    };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};

