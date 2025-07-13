const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();

const TABLE_HORARIO = process.env.TABLE_HORARIO;
const FUNCION_VALIDAR = process.env.FUNCION_VALIDAR;

exports.handler = async (event) => {
  try {
    const token = event.headers?.Authorization;
    const {
      tenant_id,
      curso_id,
      limit = 5,
      lastHorarioId
    } = event.query || {};

    if (!token || !tenant_id || !curso_id) {
      return {
        statusCode: 400,
        body: { error: 'Faltan token, tenant_id o curso_id' }
      };
    }

    // Validar token
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
        const parsedBody = typeof validarPayload.body === 'string'
          ? JSON.parse(validarPayload.body)
          : validarPayload.body;
        errorMessage = parsedBody.error || errorMessage;
      } catch (_) {}
      return {
        statusCode,
        body: { error: errorMessage }
      };
    }

    const tenantCursoKey = `${tenant_id}#${curso_id}`;
    const parsedLimit = parseInt(limit);

    const params = {
      TableName: TABLE_HORARIO,
      KeyConditionExpression: 'tenant_id_curso_id = :pk' + (lastHorarioId ? ' AND horario_id > :last' : ''),
      ExpressionAttributeValues: {
        ':pk': tenantCursoKey,
        ...(lastHorarioId && { ':last': lastHorarioId })
      },
      Limit: parsedLimit
    };

    const result = await dynamodb.query(params).promise();

    return {
      statusCode: 200,
      body: {
        horarios: result.Items,
        paginacion: {
          ultimoHorarioId: result.Items.length > 0
            ? result.Items[result.Items.length - 1].horario_id
            : null,
          total: result.Items.length
        }
      }
    };

  } catch (e) {
    console.error('Error al listar horarios:', e);
    return {
      statusCode: 500,
      body: {
        error: 'Error interno del servidor',
        detalle: e.message
      }
    };
  }
};
