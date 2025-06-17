const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

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

    const { tenant_id, dni } = validarPayload.body;
    const data = JSON.parse(event.body);

    const { nombre, descripcion, inicio, fin, precio } = data;
    if (!nombre || !descripcion)
      return { statusCode: 400, body: JSON.stringify({ error: 'Faltan campos obligatorios' }) };

    const curso_id = uuidv4();
    await dynamodb.put({
      TableName: TABLE_CURSO,
      Item: { tenant_id, curso_id, nombre, descripcion, inicio, fin, precio, instructor_dni: dni }
    }).promise();

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Curso creado exitosamente', curso_id, nombre })
    };
  } catch (error) {
    console.error("Error:", error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
