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

    const body = JSON.parse(event.body);
    const allowedFields = ['nombre', 'descripcion', 'inicio', 'fin', 'precio'];
    const updateFields = {};

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateFields[field] = body[field];
      }
    }

    if (Object.keys(updateFields).length === 0)
      return { statusCode: 400, body: JSON.stringify({ error: 'No hay campos válidos para actualizar' }) };

    const updateExpression = 'SET ' + Object.keys(updateFields).map((key, i) => `#${key} = :val${i}`).join(', ');
    const expressionAttributeNames = Object.fromEntries(Object.keys(updateFields).map((key) => [`#${key}`, key]));
    const expressionAttributeValues = Object.fromEntries(Object.values(updateFields).map((val, i) => [`:val${i}`, val]));

    await dynamodb.update({
      TableName: TABLE_CURSO,
      Key: { tenant_id, curso_id },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues
    }).promise();

    return { statusCode: 200, body: JSON.stringify({ message: 'Curso actualizado correctamente' }) };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};

