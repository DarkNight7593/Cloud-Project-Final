const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();

const TABLE_CURSO = process.env.TABLE_CURSO;
const FUNCION_VALIDAR = process.env.FUNCION_VALIDAR;

exports.handler = async (event) => {
  try {
    const token = event.headers?.Authorization;
    const { tenant_id, curso_id } = event.query || {};

    if (!token || !tenant_id) {
      return {
        statusCode: 401,
        body: { error: 'Token y tenant_id son requeridos' }
      };
    }

    // Validar token con Lambda externa
    const validar = await lambda.invoke({
      FunctionName: FUNCION_VALIDAR,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({
        body: {
          token,
          tenant_id
        }
      })
    }).promise();

    const validarPayload = JSON.parse(validar.Payload);
    if (validarPayload.statusCode !== 200) {
      let statusCode = validarPayload.statusCode;
      let errorMessage = 'Error desconocido al validar token';

      try {
        const parsedBody = JSON.parse(validarPayload.body);
        errorMessage = parsedBody.error || errorMessage;
      } catch (_) {}

      return {
        statusCode,
        body: { error: errorMessage }
      };
    }

    if (!curso_id) {
      return {
        statusCode: 400,
        body: { error: 'curso_id requerido' }
      };
    }

    const result = await dynamodb.get({
      TableName: TABLE_CURSO,
      Key: { tenant_id, curso_id }
    }).promise();

    if (!result.Item) {
      return {
        statusCode: 404,
        body: { error: 'Curso no encontrado' }
      };
    }

    return {
      statusCode: 200,
      body: result.Item
    };

  } catch (error) {
    console.error('Error en buscarCurso:', error);
    return {
      statusCode: 500,
      body: { error: error.message }
    };
  }
};
