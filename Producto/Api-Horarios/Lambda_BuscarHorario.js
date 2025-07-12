const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();

const TABLE_HORARIO = process.env.TABLE_HORARIO;
const FUNCION_VALIDAR = process.env.FUNCION_VALIDAR;

exports.handler = async (event) => {
  try {
    const token = event.headers?.Authorization;
    const { tenant_id, horario_id } = event.query || {};

    // Validación inicial
    if (!token || !tenant_id) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Token o tenant_id no proporcionado' })
      };
    }

    if (!horario_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'horario_id es requeridos' })
      };
    }

    // Validar el token con la función externa
    const validar = await lambda.invoke({
      FunctionName: FUNCION_VALIDAR,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({ body: { token, tenant_id } })
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

    // Obtener el horario por índice secundario
    const result = await dynamodb.query({
    TableName: TABLE_HORARIO,
    IndexName: 'tenant_horario_index',
    KeyConditionExpression: 'tenant_id = :tenant AND horario_id = :horario',
    ExpressionAttributeValues: {
      ':tenant': tenant_id,
      ':horario': horario_id
    },
    Limit: 1
    }).promise();

  if (!result.Items || result.Items.length === 0) {
    return {
      statusCode: 404,
      body: JSON.stringify({ error: 'Horario no encontrado' })
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify(result.Items[0])
  };

  } catch (e) {
    console.error('Error al obtener el horario:', e);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Error interno del servidor', detalle: e.message })
    };
  }
};

