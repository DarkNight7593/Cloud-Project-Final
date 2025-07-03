const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();

const TABLE_HORARIO = process.env.TABLE_HORARIO;
const FUNCION_VALIDAR = process.env.FUNCION_VALIDAR;

exports.handler = async (event) => {
  try {
    const token = event.headers?.Authorization;
    const { tenant_id, curso_id, horario_id } = event.queryStringParameters || {};

    // Validación inicial
    if (!token || !tenant_id) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Token o tenant_id no proporcionado' })
      };
    }

    if (!curso_id || !horario_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'curso_id y horario_id son requeridos' })
      };
    }

    // Validar el token con la función externa
    const validar = await lambda.invoke({
      FunctionName: FUNCION_VALIDAR,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({ token, tenant_id })
    }).promise();

    const validarPayload = JSON.parse(validar.Payload);
    
    if (validarPayload.statusCode !== 200) {
      let statusCode = validarPayload.statusCode;
      let errorMessage = 'Error desconocido al validar token';

      try {
        const parsedBody = JSON.parse(validarPayload.body);
        errorMessage = parsedBody.error || errorMessage;
      } catch (_) {
      }

      return {
        statusCode,
        body: JSON.stringify({ error: errorMessage })
      };
    }

    const tenant_id_curso_id = tenant_id+'#'+curso_id;

    // Obtener el horario
    const result = await dynamodb.get({
      TableName: TABLE_HORARIO,
      Key: { tenant_id_curso_id, horario_id }
    }).promise();

    if (!result.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Horario no encontrado' })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify(result.Item)
    };

  } catch (e) {
    console.error('Error al obtener el horario:', e);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Error interno del servidor', detalle: e.message })
    };
  }
};

