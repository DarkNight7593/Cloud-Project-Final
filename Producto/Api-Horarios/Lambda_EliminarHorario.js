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
    const curso_id = event.pathParameters?.id;
    if (!curso_id) return { statusCode: 400, body: JSON.stringify({ error: 'curso_id requerido' }) };

    await dynamodb.delete({
      TableName: TABLE_CURSO,
      Key: { tenant_id, curso_id }
    }).promise();

    return { statusCode: 200, body: JSON.stringify({ message: 'Curso eliminado correctamente' }) };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
