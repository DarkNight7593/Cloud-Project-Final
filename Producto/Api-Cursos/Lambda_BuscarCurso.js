const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();

const TABLE_CURSO = process.env.TABLE_CURSO;
const FUNCION_VALIDAR = process.env.FUNCION_VALIDAR;

exports.handler = async (event) => {
  try {
    const token = event.headers?.Authorization;
    const { tenant_id, curso_id } = event.queryStringParameters || {};

    if (!token || !tenant_id) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Token y tenant_id son requeridos' })
      };
    }

    // Validar token con lambda externa
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
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Token inválido o expirado' })
      };
    }

    if (!curso_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'curso_id requerido' })
      };
    }

    const result = await dynamodb.get({
      TableName: TABLE_CURSO,
      Key: { tenant_id, curso_id }
    }).promise();

    if (!result.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Curso no encontrado' })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify(result.Item)
    };

  } catch (error) {
    console.error('Error en buscarCurso:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};

